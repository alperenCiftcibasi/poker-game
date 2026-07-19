// Masa/para birimi türüne göre gösterim yardımcıları.
// 'normal'    → normal oyun çipi 🍪
// 'tournament'→ turnuva çipi 💎 (yalnızca turnuva masalarında oynanır)

export function chipIcon(type) {
  return type === 'tournament' ? '💎' : '🍪';
}

export function chipLabel(type) {
  return type === 'tournament' ? 'Turnuva Çipi' : 'Çip';
}
