const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'public', 'sounds');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

function writeWav(filename, sampleRate, samples) {
  const numSamples = samples.length;
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  const buffer = Buffer.alloc(44 + dataSize);
  
  // RIFF chunk
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  
  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  
  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  for (let i = 0; i < numSamples; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    let val = s < 0 ? s * 0x8000 : s * 0x7FFF;
    // ensure within Int16 range
    val = Math.max(-32768, Math.min(32767, val));
    buffer.writeInt16LE(val, 44 + i * 2);
  }
  
  fs.writeFileSync(path.join(outDir, filename), buffer);
  console.log('Created:', filename);
}

// Helpers
const sr = 44100;
function sine(freq, t) { return Math.sin(2 * Math.PI * freq * t); }
function square(freq, t) { return Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1; }
function env(t, attack, decay, sustain, release, duration) {
  if (t < attack) return t / attack;
  if (t < attack + decay) return 1 - ((t - attack) / decay) * (1 - sustain);
  if (t < duration - release) return sustain;
  if (t < duration) return sustain * (1 - (t - (duration - release)) / release);
  return 0;
}

// 1. Place X (Sharp click/pop)
{
  const dur = 0.1;
  const samples = [];
  for (let i = 0; i < dur * sr; i++) {
    const t = i / sr;
    const f = 800 * Math.exp(-t * 30);
    const e = env(t, 0.005, 0.05, 0, 0, dur);
    samples.push(square(f, t) * e * 0.5);
  }
  writeWav('place-x.wav', sr, samples);
}

// 2. Place O (Lower, rounder pop)
{
  const dur = 0.15;
  const samples = [];
  for (let i = 0; i < dur * sr; i++) {
    const t = i / sr;
    const f = 400 * Math.exp(-t * 20);
    const e = env(t, 0.01, 0.1, 0, 0, dur);
    samples.push(sine(f, t) * e * 0.7);
  }
  writeWav('place-o.wav', sr, samples);
}

// 3. Match Found (Alert chime)
{
  const dur = 1.0;
  const samples = [];
  for (let i = 0; i < dur * sr; i++) {
    const t = i / sr;
    let s = 0;
    if (t < 0.1) s = sine(523.25, t); // C5
    else if (t < 0.2) s = sine(659.25, t); // E5
    else if (t < 0.8) s = sine(783.99, t); // G5
    const e = env(t, 0.05, 0.1, 0.5, 0.4, dur);
    samples.push(s * e * 0.5);
  }
  writeWav('match-found.wav', sr, samples);
}

// 4. Win (Triumphant)
{
  const dur = 2.0;
  const samples = [];
  for (let i = 0; i < dur * sr; i++) {
    const t = i / sr;
    let s = 0;
    if (t < 0.2) s = square(440, t); // A4
    else if (t < 0.4) s = square(554.37, t); // C#5
    else if (t < 0.6) s = square(659.25, t); // E5
    else s = square(880, t) + square(880 * 1.01, t); // A5 chord
    const e = env(t, 0.05, 0.2, 0.6, 0.5, dur);
    samples.push(s * e * 0.3);
  }
  writeWav('win.wav', sr, samples);
}

// 5. Lose (Descending)
{
  const dur = 1.5;
  const samples = [];
  for (let i = 0; i < dur * sr; i++) {
    const t = i / sr;
    let s = 0;
    if (t < 0.3) s = square(349.23, t); // F4
    else if (t < 0.6) s = square(329.63, t); // E4
    else if (t < 0.9) s = square(311.13, t); // Eb4
    else s = square(293.66, t) + square(293.66 * 0.99, t); // D4
    const e = env(t, 0.05, 0.2, 0.6, 0.5, dur);
    samples.push(s * e * 0.3);
  }
  writeWav('lose.wav', sr, samples);
}
