'use client';

import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { decodeMulawBase64ToFloat32 } from '../lib/mulawDecode';

const TWILIO_SAMPLE_RATE = 8000;
const AI_DUCK_MS = 400;
const CUSTOMER_GAIN = 1.35;
const UI_TICK_MS = 200;
const MAX_SCHEDULE_AHEAD_S = 0.35;

export default function AiMonitorListenPanel({ callSid, enabled = true }) {
  const { socket, isConnected, joinCallRoom, leaveCallRoom } = useSocket();
  const [live, setLive] = useState(false);
  const [levels, setLevels] = useState({ customer: 0, ai: 0 });
  const [packetCount, setPacketCount] = useState(0);

  const ctxRef = useRef(null);
  const customerGainRef = useRef(null);
  const aiGainRef = useRef(null);
  const nextPlayRef = useRef({ customer: 0, ai: 0 });
  const lastAiPlayAtRef = useRef(0);
  const lastPacketAtRef = useRef(0);
  const packetCountRef = useRef(0);
  const levelsRef = useRef({ customer: 0, ai: 0 });
  const callSidRef = useRef(callSid);
  const initStartedRef = useRef(false);

  callSidRef.current = callSid;

  function initAudioGraph() {
    if (ctxRef.current) return ctxRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    try {
      ctxRef.current = new Ctx({ sampleRate: TWILIO_SAMPLE_RATE });
    } catch {
      ctxRef.current = new Ctx();
    }

    const master = ctxRef.current.createGain();
    master.gain.value = 1;
    master.connect(ctxRef.current.destination);

    customerGainRef.current = ctxRef.current.createGain();
    customerGainRef.current.gain.value = CUSTOMER_GAIN;
    customerGainRef.current.connect(master);

    aiGainRef.current = ctxRef.current.createGain();
    aiGainRef.current.gain.value = 1;
    aiGainRef.current.connect(master);

    nextPlayRef.current = { customer: 0, ai: 0 };
    return ctxRef.current;
  }

  async function ensureAudioRunning() {
    if (typeof window === 'undefined') return false;
    const ctx = initAudioGraph();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }
    return ctx.state === 'running';
  }

  function resetSchedule() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const t = ctx.currentTime + 0.04;
    nextPlayRef.current = { customer: t, ai: t };
  }

  function playChunk(track, b64) {
    const ctx = ctxRef.current;
    if (!ctx || !b64) return;

    const lane = track === 'ai' ? 'ai' : 'customer';
    const gainNode = lane === 'ai' ? aiGainRef.current : customerGainRef.current;
    if (!gainNode) return;

    if (lane === 'ai') {
      lastAiPlayAtRef.current = Date.now();
    } else if (Date.now() - lastAiPlayAtRef.current < AI_DUCK_MS) {
      customerGainRef.current.gain.value = CUSTOMER_GAIN * 0.3;
      window.setTimeout(() => {
        if (customerGainRef.current) customerGainRef.current.gain.value = CUSTOMER_GAIN;
      }, AI_DUCK_MS);
    }

    const samples = decodeMulawBase64ToFloat32(b64);
    if (!samples.length) return;

    const buf = ctx.createBuffer(1, samples.length, TWILIO_SAMPLE_RATE);
    buf.copyToChannel(samples, 0);

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gainNode);

    const now = ctx.currentTime;
    let startAt = Math.max(now + 0.02, nextPlayRef.current[lane]);
    if (startAt - now > MAX_SCHEDULE_AHEAD_S) {
      startAt = now + 0.04;
    }
    src.start(startAt);
    nextPlayRef.current[lane] = startAt + buf.duration;

    lastPacketAtRef.current = Date.now();
    packetCountRef.current += 1;

    let peak = 0;
    for (let i = 0; i < samples.length; i += 1) {
      peak = Math.max(peak, Math.abs(samples[i]));
    }
    levelsRef.current[lane] = Math.min(1, peak * 3.5);
  }

  const playChunkRef = useRef(playChunk);
  playChunkRef.current = playChunk;

  const ensureAudioRef = useRef(ensureAudioRunning);
  ensureAudioRef.current = ensureAudioRunning;

  useEffect(() => {
    if (!callSid || !enabled) return undefined;
    joinCallRoom?.(callSid);
    return () => leaveCallRoom?.(callSid);
  }, [callSid, enabled, joinCallRoom, leaveCallRoom]);

  // Auto-start audio when monitor appears (call button click is usually recent).
  useEffect(() => {
    if (!callSid || !enabled || initStartedRef.current) return undefined;
    initStartedRef.current = true;
    void ensureAudioRef.current();
    const onGesture = () => {
      void ensureAudioRef.current();
    };
    window.addEventListener('pointerdown', onGesture, { capture: true });
    window.addEventListener('keydown', onGesture, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onGesture, { capture: true });
      window.removeEventListener('keydown', onGesture, { capture: true });
    };
  }, [callSid, enabled]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLevels({
        customer: Math.max(0, levelsRef.current.customer * 0.85),
        ai: Math.max(0, levelsRef.current.ai * 0.85)
      });
      levelsRef.current = {
        customer: Math.max(0, levelsRef.current.customer * 0.85),
        ai: Math.max(0, levelsRef.current.ai * 0.85)
      };
      setPacketCount(packetCountRef.current);
      if (lastPacketAtRef.current > 0 && Date.now() - lastPacketAtRef.current < 5000) {
        setLive(true);
      }
    }, UI_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      initStartedRef.current = false;
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
      customerGainRef.current = null;
      aiGainRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!socket || !isConnected || !callSid || !enabled) return undefined;

    joinCallRoom?.(callSid);
    void ensureAudioRef.current();

    const onAudio = (d) => {
      if (!d || String(d.callSid) !== String(callSidRef.current)) return;
      if (d.track !== 'customer' && d.track !== 'ai') return;
      const play = () => playChunkRef.current(d.track, d.payload);
      if (!ctxRef.current || ctxRef.current.state !== 'running') {
        void ensureAudioRef.current().then((ok) => {
          if (ok) play();
        });
        return;
      }
      play();
    };

    const onState = (d) => {
      if (!d || String(d.callSid) !== String(callSidRef.current)) return;
      if (d.state === 'ended') {
        setLive(false);
        lastPacketAtRef.current = 0;
        packetCountRef.current = 0;
        resetSchedule();
      }
      if (d.state === 'connected' || d.state === 'active') {
        setLive(true);
        void ensureAudioRef.current();
      }
    };

    socket.on('ai_monitor_audio', onAudio);
    socket.on('ai_monitor_state', onState);

    return () => {
      socket.off('ai_monitor_audio', onAudio);
      socket.off('ai_monitor_state', onState);
    };
  }, [socket, isConnected, callSid, enabled, joinCallRoom]);

  if (!callSid || !enabled) return null;

  return (
    <div className="mt-3 p-3 rounded-lg border border-amber-300 bg-amber-50">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-amber-900">Live monitor</span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            live && isConnected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {live && isConnected ? 'On' : 'Waiting'}
        </span>
      </div>
      <p className="text-xs text-amber-800 mb-2">
        Use headphones. Customer and Rebecca play automatically.
      </p>
      <div className="flex gap-4 text-xs text-amber-900 mb-1">
        <span>
          Customer
          <span className="inline-block w-14 h-1 ml-1 bg-amber-200 rounded align-middle">
            <span
              className="block h-full bg-amber-600 rounded"
              style={{ width: `${Math.round(levels.customer * 100)}%` }}
            />
          </span>
        </span>
        <span>
          Rebecca
          <span className="inline-block w-14 h-1 ml-1 bg-amber-200 rounded align-middle">
            <span
              className="block h-full bg-indigo-600 rounded"
              style={{ width: `${Math.round(levels.ai * 100)}%` }}
            />
          </span>
        </span>
      </div>
    </div>
  );
}
