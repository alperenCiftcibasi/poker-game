// Hafif, kendi kendine yeten ses efektleri. Harici dosya yok — Web Audio API ile
// basit tonlar sentezlenir. Mute tercihi localStorage'da tutulur (Faz 5, opsiyonel).

let ctx = null;
function getCtx() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

export function isMuted() {
  return localStorage.getItem('poker_muted') === '1';
}

export function toggleMute() {
  const next = !isMuted();
  localStorage.setItem('poker_muted', next ? '1' : '0');
  return next;
}

// Her efekt bir veya birkaç zamanlanmış nota
const SOUNDS = {
  turn: [{ f: 660, t: 0, d: 0.16, type: 'sine' }],
  deal: [{ f: 300, t: 0, d: 0.06, type: 'triangle' }],
  win: [
    { f: 523, t: 0.00, d: 0.16, type: 'sine' },
    { f: 659, t: 0.12, d: 0.16, type: 'sine' },
    { f: 784, t: 0.24, d: 0.32, type: 'sine' }
  ]
};

export function playSound(name) {
  if (isMuted()) return;
  const c = getCtx();
  if (!c) return;
  try {
    if (c.state === 'suspended') c.resume();
    const notes = SOUNDS[name] || SOUNDS.turn;
    const now = c.currentTime;
    notes.forEach(({ f, t, d, type }) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = f;
      const start = now + t;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + d);
      osc.connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(start + d + 0.03);
    });
  } catch (e) { /* sesler kritik değil, yut */ }
}
