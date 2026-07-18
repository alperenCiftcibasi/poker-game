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

// Her efekt bir veya birkaç zamanlanmış nota.
// Nota alanları: f=frekans, t=başlangıç gecikmesi, d=süre, type=dalga biçimi,
//   g=tepe ses seviyesi (varsayılan 0.14), f2=varsa d boyunca f→f2 kayması (süpürme).
const SOUNDS = {
  turn: [{ f: 660, t: 0, d: 0.16, type: 'sine' }],
  deal: [{ f: 300, t: 0, d: 0.06, type: 'triangle' }],
  win: [
    { f: 523, t: 0.00, d: 0.16, type: 'sine' },
    { f: 659, t: 0.12, d: 0.16, type: 'sine' },
    { f: 784, t: 0.24, d: 0.32, type: 'sine' }
  ],

  // Check: masaya iki hafif vuruş (gerçek pokerdeki "masaya tık tık" jesti)
  check: [
    { f: 200, t: 0.00, d: 0.06, type: 'triangle', g: 0.11 },
    { f: 200, t: 0.11, d: 0.06, type: 'triangle', g: 0.11 }
  ],

  // Call: tek çip şıngırtısı (kısa, iki tonlu metalik his)
  call: [
    { f: 620, t: 0.00, d: 0.05, type: 'triangle', g: 0.11 },
    { f: 880, t: 0.02, d: 0.06, type: 'sine',     g: 0.09 }
  ],

  // Raise: üç yükselen çip vuruşu (daha iddialı)
  raise: [
    { f: 520,  t: 0.00, d: 0.06, type: 'triangle', g: 0.12 },
    { f: 760,  t: 0.07, d: 0.06, type: 'triangle', g: 0.12 },
    { f: 1040, t: 0.14, d: 0.08, type: 'sine',     g: 0.10 }
  ],

  // All-in: dramatik yükselen süpürme + alt boom
  allin: [
    { f: 130,          t: 0.00, d: 0.45, type: 'sine',     g: 0.13 },
    { f: 330, f2: 880, t: 0.00, d: 0.35, type: 'sawtooth', g: 0.10 },
    { f: 660,          t: 0.30, d: 0.20, type: 'sine',     g: 0.12 },
    { f: 990,          t: 0.42, d: 0.30, type: 'sine',     g: 0.11 }
  ],

  // Fold: yumuşak, alçalan iki nota (sakin çekilme)
  fold: [
    { f: 300, t: 0.00, d: 0.10, type: 'sine', g: 0.07 },
    { f: 190, t: 0.07, d: 0.14, type: 'sine', g: 0.07 }
  ],

  // Kart açılışı (showdown / göster): parlak çift blip
  flip: [
    { f: 900,  t: 0.00, d: 0.04, type: 'square', g: 0.06 },
    { f: 1250, t: 0.04, d: 0.05, type: 'square', g: 0.06 }
  ],

  // Ortak kart(lar) masaya (flop/turn/river): yumuşak iki nota
  board: [
    { f: 360, t: 0.00, d: 0.06, type: 'triangle', g: 0.09 },
    { f: 480, t: 0.05, d: 0.06, type: 'triangle', g: 0.08 }
  ],

  // Yeni sohbet mesajı (başkasından): çok hafif blip
  chat: [{ f: 680, t: 0, d: 0.05, type: 'sine', g: 0.05 }]
};

export function playSound(name) {
  if (isMuted()) return;
  const c = getCtx();
  if (!c) return;
  try {
    if (c.state === 'suspended') c.resume();
    const notes = SOUNDS[name] || SOUNDS.turn;
    const now = c.currentTime;
    notes.forEach(({ f, f2, t, d, type, g }) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      const start = now + t;
      osc.frequency.setValueAtTime(f, start);
      if (f2) osc.frequency.linearRampToValueAtTime(f2, start + d);
      const peak = g || 0.14;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + d);
      osc.connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(start + d + 0.03);
    });
  } catch (e) { /* sesler kritik değil, yut */ }
}
