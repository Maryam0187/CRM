'use client';

import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import {
  decodeMulawBytesToFloat32,
  resample8kToRate
} from '../lib/mulawDecode';

const ECHO_MS = 700;
const SCHEDULE_LEAD_SEC = 0.05;

function buildMonitorWsUrl(callSid, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  let origin;
  if (isProduction) {
    origin = (process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin).replace(/\/$/, '');
  } else {
    const port = window.location.port || '3000';
    origin = `${window.location.protocol}//${window.location.hostname}:${port}`;
  }
  const wsOrigin = origin.startsWith('https://')
    ? `wss://${origin.slice(8)}`
    : origin.startsWith('http://')
      ? `ws://${origin.slice(7)}`
      : origin;
  const params = new URLSearchParams({
    callSid: String(callSid),
    token: String(token)
  });
  return `${wsOrigin}/ws/ai-monitor?${params.toString()}`;
}

/** Chain audio buffers on the Web Audio clock — same idea as a media stream. */
function makeScheduledLane(ctx, destination, gainValue) {
  let nextTime = 0;
  const active = new Set();

  const gain = ctx.createGain();
  gain.gain.value = gainValue;
  gain.connect(destination);

  function push(samples) {
    if (!samples?.length) return;
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    active.add(source);
    source.onended = () => active.delete(source);

    const now = ctx.currentTime;
    if (nextTime < now + SCHEDULE_LEAD_SEC) nextTime = now + SCHEDULE_LEAD_SEC;
    source.start(nextTime);
    nextTime += buffer.duration;
  }

  function reset() {
    for (const source of active) {
      try {
        source.stop();
      } catch {
        // already ended
      }
    }
    active.clear();
    nextTime = 0;
  }

  function destroy() {
    reset();
    gain.disconnect();
  }

  return { push, reset, destroy };
}

function peakLevel(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  return Math.min(1, peak * 3.5);
}

export default function AiMonitorListenPanel({ callSid, enabled = true }) {
  const { socket, isConnected } = useSocket();
  const { accessToken } = useAuth();
  const [live, setLive] = useState(false);
  const [streamOn, setStreamOn] = useState(false);
  const [levels, setLevels] = useState({ customer: 0, ai: 0 });

  const engineRef = useRef(null);
  const lastAiRef = useRef(0);
  const levelsRef = useRef({ customer: 0, ai: 0 });
  const liveRef = useRef(false);

  async function ensureAudio() {
    if (!engineRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx({ latencyHint: 'interactive' });
      engineRef.current = {
        ctx,
        playRate: ctx.sampleRate,
        customer: makeScheduledLane(ctx, ctx.destination, 1),
        ai: makeScheduledLane(ctx, ctx.destination, 0.92)
      };
    }
    if (engineRef.current.ctx.state === 'suspended') {
      await engineRef.current.ctx.resume();
    }
    return engineRef.current.ctx.state === 'running';
  }

  function playFrame(track, mulawBytes) {
    if (!mulawBytes?.length) return;
    const now = Date.now();
    if (track === 'ai') {
      lastAiRef.current = now;
    } else if (now - lastAiRef.current < ECHO_MS) {
      return;
    }

    const telephony = decodeMulawBytesToFloat32(mulawBytes);
    const playRate = engineRef.current?.playRate;
    const samples = playRate ? resample8kToRate(telephony, playRate) : telephony;
    if (!samples.length) return;

    levelsRef.current[track] = peakLevel(samples);
    if (!liveRef.current) {
      liveRef.current = true;
      setLive(true);
    }

    const engine = engineRef.current;
    if (engine?.ctx?.state === 'running') {
      engine[track].push(samples);
      return;
    }
    void ensureAudio().then((ok) => {
      if (ok && engineRef.current) engineRef.current[track].push(samples);
    });
  }

  useEffect(() => {
    if (!callSid || !enabled || !accessToken) return undefined;

    void ensureAudio();
    const unlock = () => void ensureAudio();
    window.addEventListener('pointerdown', unlock, { once: true });

    const ws = new WebSocket(buildMonitorWsUrl(callSid, accessToken));
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => setStreamOn(true);
    ws.onclose = () => setStreamOn(false);
    ws.onerror = () => setStreamOn(false);

    ws.onmessage = (event) => {
      const data = new Uint8Array(event.data);
      if (data.length < 2) return;
      const track = data[0] === 1 ? 'ai' : 'customer';
      playFrame(track, data.subarray(1));
    };

    return () => {
      window.removeEventListener('pointerdown', unlock);
      ws.close();
      setStreamOn(false);
    };
  }, [callSid, enabled, accessToken]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLevels({
        customer: Math.max(0, levelsRef.current.customer * 0.82),
        ai: Math.max(0, levelsRef.current.ai * 0.82)
      });
      levelsRef.current = {
        customer: Math.max(0, levelsRef.current.customer * 0.82),
        ai: Math.max(0, levelsRef.current.ai * 0.82)
      };
    }, 150);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!socket || !isConnected || !callSid || !enabled) return undefined;

    const onState = (d) => {
      if (!d || String(d.callSid) !== String(callSid)) return;
      if (d.state === 'ended') {
        liveRef.current = false;
        setLive(false);
        engineRef.current?.customer.reset();
        engineRef.current?.ai.reset();
        levelsRef.current = { customer: 0, ai: 0 };
      }
      if (d.state === 'connected' || d.state === 'active') {
        liveRef.current = true;
        setLive(true);
      }
    };

    socket.on('ai_monitor_state', onState);
    return () => socket.off('ai_monitor_state', onState);
  }, [socket, isConnected, callSid, enabled]);

  useEffect(() => () => {
    engineRef.current?.customer.destroy();
    engineRef.current?.ai.destroy();
    engineRef.current?.ctx.close().catch(() => {});
    engineRef.current = null;
  }, []);

  if (!callSid || !enabled) return null;

  const monitorReady = streamOn && isConnected;

  return (
    <div className="mt-3 p-3 rounded-lg border border-amber-300 bg-amber-50">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-amber-900">Live monitor</span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            monitorReady ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {monitorReady ? 'Streaming' : 'Connecting…'}
        </span>
      </div>
      <p className="text-xs text-amber-800 mb-2">Direct media stream · use headphones.</p>
      <div className="flex gap-4 text-xs text-amber-900">
        <span>
          Customer
          <span className="inline-block w-16 h-1.5 ml-1 bg-amber-200 rounded align-middle">
            <span
              className="block h-full bg-amber-600 rounded"
              style={{ width: `${Math.round(levels.customer * 100)}%` }}
            />
          </span>
        </span>
        <span>
          Rebecca
          <span className="inline-block w-16 h-1.5 ml-1 bg-amber-200 rounded align-middle">
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
