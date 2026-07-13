import React from 'react';

// Koltuk ile merkez arasında görünen bahis çipi yığını + tutar
function BetChips({ position, amount }) {
  if (!amount || amount <= 0) return null;
  return (
    <div className="pk-bet-chips" style={{ left: `${position.betLeft}%`, top: `${position.betTop}%` }}>
      <span className="pk-bet-chip-icon" aria-hidden="true">🔵</span>
      <span className="pk-bet-amount">{amount}</span>
    </div>
  );
}

export default BetChips;
