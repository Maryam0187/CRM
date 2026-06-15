'use client';

import { useEffect, useRef, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { decodeMulawBase64ToFloat32 } from '../lib/mulawDecode';

const RATE = 8000;

function startPlayer(ctx) {
  const chunks = [];
  let queued = 0;
  let current = null;
  let idx = 0;
  let hold = 0;
  let ready = false;

  const gain = ctx.createGain();
  gain.gain.value = 1.2;
  gain.connect(ctx.destination);

  const node = ctx.createScriptProcessor(1024, 0, 1);
  node.onaudioprocess = (e) => {
    const out = e.outputBuffer.getChannelData(0);
    if (!ready && queued >= RATE * 0.06) ready = true;
    for (let i = 0; i < out.length; i += 1) {
      if (!ready) {
        out[i] = 0;
        continue;
      }
      while ((!current || idx >= current.length) && chunks.length) {
        current = chunks.shift();
        idx = 0;
      }
      if (!current || idx >= current.length) {
        out[i] = hold = 0;
        continue;
      }
      queued -= 1;
      hold = current[idx++];
      out[i] = hold;
    }
    while (queued > RATE * 0.4 && chunks.length > 1) {
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
    stop() {
      node.disconnect();
      gain.disconnect();
      chunks.length = 0;
      queued = 0;
      current = null;
      idx = 0;
      ready = false;
    }
  };
}

export default function AiMonitorListenPanel({ callSid, enabled = true }) {
  const { socket, isConnected, joinCallRoom, leaveCallRoom } = useSocket();
  const [live, setLive] = useState(false);
  const engineRef = useRef(null);
  const lastAiRef = useRef(0);

  useEffect(() => {
    if (!callSid || !enabled) return undefined;
    joinCallRoom?.(callSid);
    return () => leaveCallRoom?.(callSid);
  }, [callSid, enabled, joinCallRoom, leaveCallRoom]);

  useEffect(() => {
    if (!socket || !isConnected || !callSid || !enabled) return undefined;

    async function ready() {
      if (!engineRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx({ sampleRate: RATE });
        engineRef.current = { ctx, player: startPlayer(ctx) };
      }
      if (engineRef.current.ctx.state === 'suspended') {
        await engineRef.current.ctx.resume();
      }
    }

    function onAudio(data) {
      if (!data || String(data.callSid) !== String(callSid) || !data.payload) return;

      const now = Date.now();
      if (data.track === 'ai') {
        lastAiRef.current = now;
      } else if (now - lastAiRef.current < 1000) {
        return;
      }

      void ready().then(() => {
        const samples = decodeMulawBase64ToFloat32(data.payload);
        if (!samples.length) return;
        engineRef.current?.player.push(samples);
        setLive(true);
      });
    }

    function onState(data) {
      if (!data || String(data.callSid) !== String(callSid)) return;
      if (data.state === 'ended') setLive(false);
    }

    socket.on('ai_monitor_audio', onAudio);
    socket.on('ai_monitor_state', onState);
    return () => {
      socket.off('ai_monitor_audio', onAudio);
      socket.off('ai_monitor_state', onState);
    };
  }, [socket, isConnected, callSid, enabled]);

  useEffect(() => () => {
    engineRef.current?.player.stop();
    engineRef.current?.ctx.close().catch(() => {});
    engineRef.current = null;
  }, []);

  if (!callSid || !enabled) return null;

  return (
    <div className="mt-3 p-3 rounded-lg border border-amber-300 bg-amber-50">
      <div className="flex justify-between items-center text-sm text-amber-900">
        <span className="font-medium">Live monitor</span>
        <span className={live ? 'text-green-700' : 'text-gray-500'}>{live ? 'On' : 'Waiting'}</span>
      </div>
      <p className="text-xs text-amber-800 mt-1">Use headphones.</p>
    </div>
  );
}
