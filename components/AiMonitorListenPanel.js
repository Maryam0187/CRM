'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { decodeMulawBase64ToFloat32 } from '../lib/mulawDecode';

const TWILIO_SAMPLE_RATE = 8000;
const AI_DEDUPE_MS = 60;
const AI_DUCK_MS = 400;
const JITTER_MS = 80;
const MAX_LATENCY_MS = 280;
const CUSTOMER_GAIN = 1.35;

function createTelephonyLane(ctx, masterGain, { gain, jitterMs, maxLatencyMs }) {
  const jitterSamples = Math.round((jitterMs / 1000) * TWILIO_SAMPLE_RATE);
  const maxLatencySamples = Math.round((maxLatencyMs / 1000) * TWILIO_SAMPLE_RATE);
  const resampleStep =
    ctx.sampleRate === TWILIO_SAMPLE_RATE ? 1 : TWILIO_SAMPLE_RATE / ctx.sampleRate;

  const chunks = [];
  let queueSamples = 0;
  let primed = false;
  let current = null;
  let readIdx = 0;
  let resamplePos = 0;
  let holdSample = 0;

  const inputGain = ctx.createGain();
  inputGain.gain.value = gain;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -22;
  compressor.knee.value = 12;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.09;
  inputGain.connect(compressor);
  compressor.connect(masterGain);

  const processor = ctx.createScriptProcessor(256, 0, 1);
  processor.onaudioprocess = (event) => {
    trimQueue();
    if (!primed && queueSamples >= jitterSamples) {
      primed = true;
    }
    const output = event.outputBuffer.getChannelData(0);
    for (let i = 0; i < output.length; i += 1) {
      output[i] = primed ? readOutputSample() : 0;
    }
  };
  processor.connect(inputGain);

  function push(samples) {
    if (!samples?.length) return;
    chunks.push(samples);
    queueSamples += samples.length;
  }

  function readInputSample() {
    while ((!current || readIdx >= current.length) && chunks.length > 0) {
      current = chunks.shift();
      readIdx = 0;
    }
    if (!current || readIdx >= current.length) {
      holdSample = 0;
      return 0;
    }
    queueSamples -= 1;
    holdSample = current[readIdx];
    readIdx += 1;
    return holdSample;
  }

  function readOutputSample() {
    if (resampleStep === 1) {
      return readInputSample();
    }
    resamplePos += resampleStep;
    if (resamplePos >= 1) {
      resamplePos -= 1;
      readInputSample();
    }
    return holdSample;
  }

  function trimQueue() {
    while (queueSamples > maxLatencySamples && chunks.length > 1) {
      const dropped = chunks.shift();
      if (dropped) {
        queueSamples -= dropped.length;
        if (current === dropped) {
          current = null;
          readIdx = 0;
        }
      }
      primed = true;
    }
  }

  function reset() {
    chunks.length = 0;
    queueSamples = 0;
    primed = false;
    current = null;
    readIdx = 0;
    resamplePos = 0;
    holdSample = 0;
  }

  function destroy() {
    processor.disconnect();
    inputGain.disconnect();
    compressor.disconnect();
    reset();
  }

  return { push, reset, destroy, setGain: (v) => { inputGain.gain.value = v; } };
}

export default function AiMonitorListenPanel({ callSid, enabled = true }) {
  const { socket, isConnected, joinCallRoom, leaveCallRoom } = useSocket();
  const [live, setLive] = useState(false);
  const [levels, setLevels] = useState({ customer: 0, ai: 0 });
  /** customer = one mixed leg (no echo); both = separate lanes (may echo if Rebecca bleeds into customer audio) */
  const [monitorMode, setMonitorMode] = useState('customer');
  const ctxRef = useRef(null);
  const masterGainRef = useRef(null);
  const customerLaneRef = useRef(null);
  const aiLaneRef = useRef(null);
  const lastAiChunkRef = useRef(new Map());
  const lastAiPlayAtRef = useRef(0);

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
      try {
        ctxRef.current = new Ctx({ sampleRate: TWILIO_SAMPLE_RATE });
      } catch {
        ctxRef.current = new Ctx();
      }
      masterGainRef.current = ctxRef.current.createGain();
      masterGainRef.current.gain.value = 1;
      masterGainRef.current.connect(ctxRef.current.destination);
      customerLaneRef.current = createTelephonyLane(ctxRef.current, masterGainRef.current, {
        gain: CUSTOMER_GAIN,
        jitterMs: JITTER_MS,
        maxLatencyMs: MAX_LATENCY_MS
      });
      aiLaneRef.current = createTelephonyLane(ctxRef.current, masterGainRef.current, {
        gain: 1,
        jitterMs: 40,
        maxLatencyMs: MAX_LATENCY_MS
      });
    }
    if (ctxRef.current.state === 'suspended') await ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const playChunk = useCallback(
    async (track, b64) => {
      await ensureCtx();
      const lane = track === 'ai' ? aiLaneRef.current : customerLaneRef.current;
      if (!lane || !b64) return;
      if (monitorMode === 'customer' && track === 'ai') return;

      if (track === 'ai') {
        const dedupeKey = `${b64.length}:${b64.slice(0, 24)}`;
        const now = Date.now();
        const lastAt = lastAiChunkRef.current.get(dedupeKey);
        if (lastAt != null && now - lastAt < AI_DEDUPE_MS) return;
        lastAiChunkRef.current.set(dedupeKey, now);
        if (lastAiChunkRef.current.size > 200) {
          lastAiChunkRef.current.clear();
        }
        lastAiPlayAtRef.current = now;
      } else if (
        monitorMode === 'both' &&
        track === 'customer' &&
        Date.now() - lastAiPlayAtRef.current < AI_DUCK_MS
      ) {
        customerLaneRef.current?.setGain(CUSTOMER_GAIN * 0.25);
        setTimeout(() => customerLaneRef.current?.setGain(CUSTOMER_GAIN), AI_DUCK_MS);
      }

      const samples = decodeMulawBase64ToFloat32(b64);
      if (!samples.length) return;
      lane.push(samples);

      let peak = 0;
      for (let i = 0; i < samples.length; i += 1) {
        peak = Math.max(peak, Math.abs(samples[i]));
      }
      const levelLane = track === 'ai' ? 'ai' : 'customer';
      setLevels((p) => ({ ...p, [levelLane]: Math.min(1, peak * 3.5) }));
    },
    [ensureCtx, monitorMode]
  );

  useEffect(() => {
    return () => {
      customerLaneRef.current?.destroy();
      aiLaneRef.current?.destroy();
      customerLaneRef.current = null;
      aiLaneRef.current = null;
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
    };
  }, []);

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
      if (d?.callSid !== callSid) return;
      if (d.state === 'ended') {
        setLive(false);
        customerLaneRef.current?.reset();
        aiLaneRef.current?.reset();
      }
      if (d.state === 'connected' || d.state === 'active') setLive(true);
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
        Use headphones. Customer-only mode is clearest — Rebecca speaks on the customer&apos;s phone, not your speakers.
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
