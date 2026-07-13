import React from 'react';
import { Card } from './Card';

// Merkezdeki topluluk kartları. 5 slotluk hayalet çerçeve; açılan kartlar üstüne biner.
function CommunityCards({ cards = [] }) {
  const slots = [0, 1, 2, 3, 4];
  return (
    <div className="pk-community">
      {slots.map((i) =>
        cards[i]
          ? <Card key={i} card={cards[i]} size="md" />
          : <span key={i} className="pk-card-slot" aria-hidden="true" />
      )}
    </div>
  );
}

export default CommunityCards;
