import React from 'react';
import { Card, cardKey } from './Card';

// Merkezdeki topluluk kartları. 5 slotluk hayalet çerçeve; açılan kartlar üstüne biner.
// highlightKeys: elimizdeki kombinasyonu oluşturan kartların anahtar kümesi → eşleşen board kartları işaretlenir.
function CommunityCards({ cards = [], highlightKeys }) {
  const slots = [0, 1, 2, 3, 4];
  return (
    <div className="pk-community">
      {slots.map((i) =>
        cards[i]
          ? <Card key={i} card={cards[i]} size="md" highlight={!!highlightKeys?.has(cardKey(cards[i]))} />
          : <span key={i} className="pk-card-slot" aria-hidden="true" />
      )}
    </div>
  );
}

export default CommunityCards;
