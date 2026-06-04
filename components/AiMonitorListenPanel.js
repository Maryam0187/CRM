'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { decodeMulawBase64ToFloat32 } from '../lib/mulawDecode';

const SAMPLE_RATE = 8000;
const DEDUPE_MS = 80;
const AI_DUCK_MS = 400;

export default function AiMonitorListenPanel({ callSid, enabled = true }) {
  const { socket, isConnected, joinCallRoom, leaveCallRoom } = useSocket();
  const [live, setLive] = useState(false);
  const [levels, setLevels] = useState({ customer: 0, ai: 0 });
  /** customer = one mixed leg (no echo); both = separate lanes (may echo if Rebecca bleeds into customer audio) */
  const [monitorMode, setMonitorMode] = useState('customer');
  const ctxRef = useRef(null);
  const nextPlayRef = useRef({ customer: 0, ai: 0 });
  const lastChunkRef = useRef(new Map());
  const lastAiPlayAtRef = useRef(0);
  const customerGainRef = useRef(null);
  const masterGainRef = useRef(null);

  useEffect(() => {
    if (!callSid || !enabled) return undefined;
    joinCallRoom?.(callSid);
    return () => leaveCallRoom?.(callSid);
  }, [callSid, enabled, joinCallRoom, leaveCallRoom]);

  const ensureCtx = useCallback(async () => {
    if (typeof window === 'undefined') return null;
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      ctxRef.current = new Ctx({ sampleRate: SAMPLE_RATE });
      masterGainRef.current = ctxRef.current.createGain();
      masterGainRef.current.gain.value = 1;
      masterGainRef.current.connect(ctxRef.current.destination);
      customerGainRef.current = ctxRef.current.createGain();
      customerGainRef.current.gain.value = 1;
      customerGainRef.current.connect(masterGainRef.current);
    }
    if (ctxRef.current.state === 'suspended') await ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const playChunk = useCallback(
    async (track, b64) => {
      const ctx = await ensureCtx();
      if (!ctx || !b64) return;

      const lane = track === 'ai' ? 'ai' : 'customer';
      if (monitorMode === 'customer' && lane === 'ai') return;

      const dedupeKey = `${lane}:${b64.length}:${b64.slice(0, 24)}`;
      const now = Date.now();
      const lastAt = lastChunkRef.current.get(dedupeKey);
      if (lastAt != null && now - lastAt < DEDUPE_MS) return;
      lastChunkRef.current.set(dedupeKey, now);
      if (lastChunkRef.current.size > 200) {
        lastChunkRef.current.clear();
      }

      const samples = decodeMulawBase64ToFloat32(b64);
      if (!samples.length) return;
      const buf = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
      buf.copyToChannel(samples, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;

      if (lane === 'ai') {
        lastAiPlayAtRef.current = now;
        src.connect(masterGainRef.current);
      } else {
        src.connect(customerGainRef.current);
        if (monitorMode === 'both' && now - lastAiPlayAtRef.current < AI_DUCK_MS) {
          customerGainRef.current.gain.setValueAtTime(0.15, ctx.currentTime);
          customerGainRef.current.gain.setValueAtTime(1, ctx.currentTime + 0.35);
        }
      }

      const t = Math.max(ctx.currentTime, nextPlayRef.current[lane]);
      src.start(t);
      nextPlayRef.current[lane] = t + buf.duration;

      let peak = 0;
      for (let i = 0; i < samples.length; i += 1) {
        peak = Math.max(peak, Math.abs(samples[i]));
      }
      setLevels((p) => ({ ...p, [lane]: Math.min(1, peak * 4) }));
    },
    [ensureCtx, monitorMode]
  );

  useEffect(() => {
    if (!socket || !isConnected || !callSid || !enabled) {
      setLive(false);
      return undefined;
    }
    const onAudio = (d) => {
      if (d?.callSid !== callSid) return;
      if (d.track === 'customer' || d.track === 'ai') playChunk(d.track, d.payload);
    };
    const onState = (d) => {
      if (d?.callSid === callSid && d.state === 'ended') setLive(false);
    };
    socket.on('ai_monitor_audio', onAudio);
    socket.on('ai_monitor_state', onState);
    setLive(true);
    return () => {
      socket.off('ai_monitor_audio', onAudio);
      socket.off('ai_monitor_state', onState);
    };
  }, [socket, isConnected, callSid, enabled, playChunk]);

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
        Listen on your speakers (use headphones to avoid feedback). Customer-only mode reduces echo.
      </p>
      <button
        type="button"
        onClick={() => ensureCtx()}
        className="text-xs px-3 py-1.5 mb-2 rounded bg-amber-600 text-white hover:bg-amber-700"
      >
        Enable audio
      </button>
      <div className="flex flex-wrap gap-2 mb-2 text-xs">
        <label className="inline-flex items-center gap-1 text-amber-900 cursor-pointer">
          <input
            type="radio"
            name={`monitor-mode-${callSid}`}
            checked={monitorMode === 'customer'}
            onChange={() => setMonitorMode('customer')}
          />
          Customer only (recommended)
        </label>
        <label className="inline-flex items-center gap-1 text-amber-900 cursor-pointer">
          <input
            type="radio"
            name={`monitor-mode-${callSid}`}
            checked={monitorMode === 'both'}
            onChange={() => setMonitorMode('both')}
          />
          Customer + Rebecca
        </label>
      </div>
      <div className="flex gap-4 text-xs text-amber-900">
        <span>
          Customer
          <span className="inline-block w-14 h-1 ml-1 bg-amber-200 rounded align-middle">
            <span
              className="block h-full bg-amber-600 rounded"
              style={{ width: `${Math.round(levels.customer * 100)}%` }}
            />
          </span>
        </span>
        {monitorMode === 'both' && (
          <span>
            Rebecca
            <span className="inline-block w-14 h-1 ml-1 bg-amber-200 rounded align-middle">
              <span
                className="block h-full bg-indigo-600 rounded"
                style={{ width: `${Math.round(levels.ai * 100)}%` }}
              />
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
