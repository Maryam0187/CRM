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

module.exports = { decodeMulawBase64ToFloat32, decodeMulawByte };
