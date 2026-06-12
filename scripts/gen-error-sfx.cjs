// One-off generator for public/assets/sfx/error.wav — the "can't build here"
// denial sound: two short low descending thuds (16-bit mono PCM, 22050 Hz).
const fs = require('fs');
const path = require('path');

const SR = 22050;
const samples = [];

function addTone(freq, durMs, amp) {
    const n = Math.round(SR * durMs / 1000);
    const releaseStart = n - Math.round(SR * 0.015);
    for (let i = 0; i < n; i++) {
        const t = i / SR;
        const attack  = Math.min(1, i / (SR * 0.005));
        const decay   = Math.exp(-t * 14);
        const release = i >= releaseStart ? (n - i) / (n - releaseStart) : 1;
        // Fundamental + a touch of 2nd harmonic for a woody knock
        const v = Math.sin(2 * Math.PI * freq * t)
                + 0.35 * Math.sin(4 * Math.PI * freq * t);
        samples.push(v * attack * decay * release * amp);
    }
}

function addGap(ms) {
    const n = Math.round(SR * ms / 1000);
    for (let i = 0; i < n; i++) samples.push(0);
}

addTone(170, 100, 0.6);
addGap(25);
addTone(115, 160, 0.65);

const data = Buffer.alloc(samples.length * 2);
samples.forEach((v, i) => {
    const s = Math.max(-1, Math.min(1, v));
    data.writeInt16LE(Math.round(s * 32767), i * 2);
});

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);       // fmt chunk size
header.writeUInt16LE(1, 20);        // PCM
header.writeUInt16LE(1, 22);        // mono
header.writeUInt32LE(SR, 24);       // sample rate
header.writeUInt32LE(SR * 2, 28);   // byte rate
header.writeUInt16LE(2, 32);        // block align
header.writeUInt16LE(16, 34);       // bits per sample
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

const out = path.join(__dirname, '..', 'public', 'assets', 'sfx', 'error.wav');
fs.writeFileSync(out, Buffer.concat([header, data]));
console.log(`written ${out} (${44 + data.length} bytes)`);
