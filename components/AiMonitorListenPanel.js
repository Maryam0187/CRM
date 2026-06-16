'use client';

import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import {
  decodeMulawBase64ToFloat32,
  resample8kToRate
} from '../lib/mulawDecode';

const ECHO_MS = 700;
const BATCH_MS = 20;
const SOCKET_DRAIN_LIMIT = 6;

function makeLane(ctx, destination, gainValue, maxQueueSamples, primeSamples) {
  const chunks = [];
  let queued = 0;
  let current = null;
  let idx = 0;
  let hold = 0;
  let primed = false;

  const gain = ctx.createGain();
  gain.gain.value = gainValue;
  gain.connect(destination);

  const node = ctx.createScriptProcessor(1024, 0, 1);
  node.onaudioprocess = (e) => {
    const out = e.outputBuffer.getChannelData(0);
    if (!primed && queued >= primeSamples) primed = true;
    for (let i = 0; i < out.length; i += 1) {
      if (!primed) {
        out[i] = 0;
        continue;
      }
      while ((!current || idx >= current.length) && chunks.length) {
        current = chunks.shift();
        idx = 0;
      }
      if (!current || idx >= current.length) {
        out[i] = hold;
        continue;
      }
      queued -= 1;
      hold = current[idx++];
      out[i] = hold;
    }
    if (queued > maxQueueSamples && chunks.length > 1) {
      const drop = chunks.shift();
      if (drop) {
        queued -= drop.length;
        if (current === drop) {
          current = null;
          idx = 0;
        }
      }
    }
  };
  node.connect(gain);

  return {
    push(samples) {
      if (!samples?.length) return;
      chunks.push(samples);
      queued += samples.length;
    },
    reset() {
      chunks.length = 0;
      queued = 0;
      current = null;
      idx = 0;
      primed = false;
      hold = 0;
    },
    destroy() {
      node.disconnect();
      gain.disconnect();
      this.reset();
    }
  };
}

function mergeChunks(chunks) {
  if (!chunks.length) return new Float32Array(0);
  if (chunks.length === 1) return chunks[0];
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export default function AiMonitorListenPanel({ callSid, enabled = true }) {
  const { socket, isConnected, joinCallRoom, leaveCallRoom } = useSocket();
  const [live, setLive] = useState(false);
  const [levels, setLevels] = useState({ customer: 0, ai: 0 });

  const engineRef = useRef(null);
  const lastAiRef = useRef(0);
  const levelsRef = useRef({ customer: 0, ai: 0 });
  const liveRef = useRef(false);
  const customerPendingRef = useRef([]);
  const aiPendingRef = useRef([]);
  const customerFlushTimerRef = useRef(null);
  const aiFlushTimerRef = useRef(null);
  const socketInboxRef = useRef([]);
  const socketDrainScheduledRef = useRef(false);

  function drainSocketInbox() {
    socketDrainScheduledRef.current = false;
    const inbox = socketInboxRef.current;
    let count = 0;
    while (inbox.length && count < SOCKET_DRAIN_LIMIT) {
      const item = inbox.shift();
      playRef.current(item.track, item.payload);
      count += 1;
    }
    if (inbox.length) scheduleSocketDrain();
  }

  function scheduleSocketDrain() {
    if (socketDrainScheduledRef.current) return;
    socketDrainScheduledRef.current = true;
    queueMicrotask(drainSocketInbox);
  }

  async function ensureAudio() {
    if (!engineRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx({ latencyHint: 'interactive' });
      const playRate = ctx.sampleRate;
      const primeSamples = Math.round(playRate * 0.05);
      engineRef.current = {
        ctx,
        playRate,
        customer: makeLane(ctx, ctx.destination, 1, playRate * 0.9, primeSamples),
        ai: makeLane(ctx, ctx.destination, 0.9, playRate * 2.5, primeSamples)
      };
    }
    if (engineRef.current.ctx.state === 'suspended') {
      await engineRef.current.ctx.resume();
    }
    return engineRef.current.ctx.state === 'running';
  }

  function decodeForPlayback(payload) {
    const telephony = decodeMulawBase64ToFloat32(payload);
    const playRate = engineRef.current?.playRate;
    return playRate ? resample8kToRate(telephony, playRate) : telephony;
  }

  function pushToLane(track, samples) {
    const engine = engineRef.current;
    if (engine?.ctx?.state === 'running') {
      engine[track].push(samples);
      return;
    }
    void ensureAudio().then((ok) => {
      if (ok && engineRef.current) engineRef.current[track].push(samples);
    });
  }

  function flushBatch(track) {
    if (track === 'customer') {
      customerFlushTimerRef.current = null;
    } else {
      aiFlushTimerRef.current = null;
    }
    const pending = track === 'customer' ? customerPendingRef.current : aiPendingRef.current;
    if (!pending.length) return;
    if (track === 'customer') {
      customerPendingRef.current = [];
    } else {
      aiPendingRef.current = [];
    }
    pushToLane(track, mergeChunks(pending));
  }

  function scheduleBatch(track) {
    const timerRef = track === 'customer' ? customerFlushTimerRef : aiFlushTimerRef;
    if (timerRef.current != null) return;
    timerRef.current = window.setTimeout(() => flushBatch(track), BATCH_MS);
  }

  function play(track, payload) {
    if (!payload) return;
    const now = Date.now();

    if (track === 'ai') {
      lastAiRef.current = now;
    } else if (now - lastAiRef.current < ECHO_MS) {
      return;
    }

    const samples = decodeForPlayback(payload);
    if (!samples.length) return;

    let peak = 0;
    for (let i = 0; i < samples.length; i += 1) {
      peak = Math.max(peak, Math.abs(samples[i]));
    }
    const key = track === 'ai' ? 'ai' : 'customer';
    levelsRef.current[key] = Math.min(1, peak * 3.5);
    if (!liveRef.current) {
      liveRef.current = true;
      setLive(true);
    }

    if (track === 'customer') {
      customerPendingRef.current.push(samples);
      scheduleBatch('customer');
    } else {
      aiPendingRef.current.push(samples);
      scheduleBatch('ai');
    }
  }

  const playRef = useRef(play);
  playRef.current = play;

  useEffect(() => {
    if (!callSid || !enabled || !isConnected) return undefined;
    joinCallRoom?.(callSid);
    void ensureAudio();
    const unlock = () => void ensureAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      leaveCallRoom?.(callSid);
      window.removeEventListener('pointerdown', unlock);
    };
  }, [callSid, enabled, isConnected, joinCallRoom, leaveCallRoom]);

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

    const onAudio = (d) => {
      if (!d || String(d.callSid) !== String(callSid) || !d.payload) return;
      if (d.track !== 'customer' && d.track !== 'ai') return;
      socketInboxRef.current.push({ track: d.track, payload: d.payload });
      scheduleSocketDrain();
    };

    const onState = (d) => {
      if (!d || String(d.callSid) !== String(callSid)) return;
      if (d.state === 'ended') {
        liveRef.current = false;
        setLive(false);
        for (const ref of [customerFlushTimerRef, aiFlushTimerRef]) {
          if (ref.current != null) {
            window.clearTimeout(ref.current);
            ref.current = null;
          }
        }
        customerPendingRef.current = [];
        aiPendingRef.current = [];
        socketInboxRef.current = [];
        socketDrainScheduledRef.current = false;
        engineRef.current?.customer.reset();
        engineRef.current?.ai.reset();
        levelsRef.current = { customer: 0, ai: 0 };
      }
      if (d.state === 'connected' || d.state === 'active') {
        liveRef.current = true;
        setLive(true);
      }
    };

    socket.on('ai_monitor_audio', onAudio);
    socket.on('ai_monitor_state', onState);
    return () => {
      socket.off('ai_monitor_audio', onAudio);
      socket.off('ai_monitor_state', onState);
    };
  }, [socket, isConnected, callSid, enabled]);

  useEffect(() => () => {
    for (const ref of [customerFlushTimerRef, aiFlushTimerRef]) {
      if (ref.current != null) window.clearTimeout(ref.current);
    }
    engineRef.current?.customer.destroy();
    engineRef.current?.ai.destroy();
    engineRef.current?.ctx.close().catch(() => {});
    engineRef.current = null;
  }, []);

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
      <p className="text-xs text-amber-800 mb-2">Use headphones for clearest audio.</p>
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
