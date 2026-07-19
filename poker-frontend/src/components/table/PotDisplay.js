import React from 'react';

// Masanın üst-orta bölgesinde toplam pot göstergesi
function PotDisplay({ pot = 0, chipIcon = '🍪' }) {
  return (
    <div className="pk-pot">
      <span className="pk-pot-label">POT</span>
      <span className="pk-pot-value">{pot} {chipIcon}</span>
    </div>
  );
}

export default PotDisplay;
