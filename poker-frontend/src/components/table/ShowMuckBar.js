import React from 'react';

// El sonu "göster/gösterme" çubuğu: pencere açıkken (herkese aynı anda) 12 sn'lik seçim sunar.
// ActionBar'ın halka + buton düzenini ve CSS sınıflarını yeniden kullanır.
function ShowMuckBar({ onDecision, timeLeft }) {
  const frac = Math.max(0, Math.min(1, timeLeft / 12));

  return (
    <div className="pk-actionbar">
      <div className="pk-timer-ring danger" style={{ '--turn-deg': `${frac * 360}deg` }}>
        <span className="pk-timer-num">{timeLeft}</span>
      </div>

      <div className="pk-actionbar-main">
        <div className="pk-action-primary">
          <button className="pk-btn call" onClick={() => onDecision(true)}>🃏 Kartları Göster</button>
          <button className="pk-btn fold" onClick={() => onDecision(false)}>🙈 Gösterme</button>
        </div>
      </div>
    </div>
  );
}

export default ShowMuckBar;
