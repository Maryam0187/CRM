const MULAW_DECODE_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i += 1) {
  let mu = ~i;
  const sign = mu & 0x80;
  const exponent = (mu >> 4) & 0x07;
  const mantissa = mu & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  MULAW_DECODE_TABLE[i] = sign ? -sample : sample;
}

function decodeMulawByte(byte) {
  return MULAW_DECODE_TABLE[byte & 0xff] / 32768;
}

function decodeMulawBytesToFloat32(raw) {
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = MULAW_DECODE_TABLE[raw[i]] / 32768;
  }
  return out;
}

function decodeMulawBase64ToFloat32(base64Payload) {
  if (!base64Payload) return new Float32Array(0);
  if (typeof Buffer !== 'undefined') {
    return decodeMulawBytesToFloat32(Buffer.from(base64Payload, 'base64'));
  }
  const binary = atob(base64Payload);
  const raw = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    raw[i] = binary.charCodeAt(i);
  }
  return decodeMulawBytesToFloat32(raw);
}

const TELEPHONY_SAMPLE_RATE = 8000;

/** Upsample 8 kHz telephony audio to the browser AudioContext rate (usually 48 kHz). */
function resample8kToRate(samples8k, targetRate) {
  if (!samples8k?.length) return new Float32Array(0);
  if (!targetRate || targetRate === TELEPHONY_SAMPLE_RATE) return samples8k;
  const ratio = targetRate / TELEPHONY_SAMPLE_RATE;
  const outLen = Math.max(1, Math.round(samples8k.length * ratio));
  const out = new Float32Array(outLen);
  const last = samples8k.length - 1;
  for (let i = 0; i < outLen; i += 1) {
    const srcPos = i / ratio;
    const idx = Math.min(last, Math.floor(srcPos));
    const frac = srcPos - idx;
    const s0 = samples8k[idx];
    const s1 = samples8k[Math.min(last, idx + 1)];
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}

module.exports = {
  TELEPHONY_SAMPLE_RATE,
  decodeMulawBase64ToFloat32,
  decodeMulawByte,
  resample8kToRate
};
