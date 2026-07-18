import React from 'react';

const SUIT_ICONS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const isRed = (suit) => suit === 'hearts' || suit === 'diamonds';
const rankLabel = (rank) => (rank === 'T' ? '10' : rank);

// Kartı backend'in kombinasyon anahtarı formatına çevir: değer+suit ilk harfi (ör. "Th", "As").
// El sıralaması (handRankUpdate.comboCards) bu anahtarlarla gelir; eşleşen kartlar işaretlenir.
export const cardKey = (card) => {
  if (!card) return '';
  const r = card.rank === '10' ? 'T' : card.rank;
  const s = (card.suit || '')[0]; // hearts→h, diamonds→d, clubs→c, spades→s
  return `${r}${s}`;
};

// Tam boy kart (topluluk kartları, kendi elin)
export function Card({ card, size = 'md', highlight = false }) {
  if (!card) return null;
  return (
    <span className={`pk-card pk-card-${size} ${isRed(card.suit) ? 'red' : 'black'}${highlight ? ' pk-card-combo' : ''}`}>
      <span className="pk-card-rank">{rankLabel(card.rank)}</span>
      <span className="pk-card-suit">{SUIT_ICONS[card.suit]}</span>
    </span>
  );
}

// Küçük kart (koltuk üzerinde showdown/açık kart göstergesi)
export function MiniCard({ card, highlight = false }) {
  if (!card) return null;
  return (
    <span className={`pk-card-mini ${isRed(card.suit) ? 'red' : 'black'}${highlight ? ' pk-card-combo' : ''}`}>
      {rankLabel(card.rank)}{SUIT_ICONS[card.suit]}
    </span>
  );
}

// Kapalı kart arkası (rakiplerin gizli kartları)
export function CardBack({ size = 'sm' }) {
  return <span className={`pk-card-back pk-card-${size}`} aria-hidden="true" />;
}

export default Card;
