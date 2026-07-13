import React from 'react';

const SUIT_ICONS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const isRed = (suit) => suit === 'hearts' || suit === 'diamonds';
const rankLabel = (rank) => (rank === 'T' ? '10' : rank);

// Tam boy kart (topluluk kartları, kendi elin)
export function Card({ card, size = 'md' }) {
  if (!card) return null;
  return (
    <span className={`pk-card pk-card-${size} ${isRed(card.suit) ? 'red' : 'black'}`}>
      <span className="pk-card-rank">{rankLabel(card.rank)}</span>
      <span className="pk-card-suit">{SUIT_ICONS[card.suit]}</span>
    </span>
  );
}

// Küçük kart (koltuk üzerinde showdown/açık kart göstergesi)
export function MiniCard({ card }) {
  if (!card) return null;
  return (
    <span className={`pk-card-mini ${isRed(card.suit) ? 'red' : 'black'}`}>
      {rankLabel(card.rank)}{SUIT_ICONS[card.suit]}
    </span>
  );
}

// Kapalı kart arkası (rakiplerin gizli kartları)
export function CardBack({ size = 'sm' }) {
  return <span className={`pk-card-back pk-card-${size}`} aria-hidden="true" />;
}

export default Card;
