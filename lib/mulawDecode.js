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

function decodeMulawBase64ToFloat32(base64Payload) {
  const raw = Buffer.from(base64Payload, 'base64');
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = MULAW_DECODE_TABLE[raw[i]] / 32768;
  }
  return out;
}

module.exports = { decodeMulawBase64ToFloat32 };
