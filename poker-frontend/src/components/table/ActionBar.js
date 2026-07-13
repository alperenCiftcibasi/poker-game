import React, { useState, useEffect } from 'react';

// Aksiyon çubuğu: FOLD / CHECK-CALL / RAISE (slider + ön ayarlar) + dairesel süre göstergesi.
// Tüm raise değerleri "raise to" (bu sokaktaki toplam hedef bahis) cinsindendir.
function ActionBar({
  onAction, callAmount, betToMatch, myChips, minRaiseTo, maxRaiseTo,
  raiseStep, bigBlind, pot, timeLeft, turnDuration
}) {
  const canRaise = maxRaiseTo > betToMatch;
  const safeMinRaise = Math.min(minRaiseTo, maxRaiseTo);
  const [raiseTo, setRaiseTo] = useState(safeMinRaise);

  // Sıra bize gelince / min raise değişince slider'ı sıfırla
  useEffect(() => { setRaiseTo(safeMinRaise); }, [safeMinRaise]);

  const clamp = (v) => Math.max(safeMinRaise, Math.min(maxRaiseTo, Math.round(v)));

  // Ön ayarlar: 2x/3x taban bahse göre, Pot = pot boyu raise, Max = all-in
  const base = betToMatch > 0 ? betToMatch : bigBlind;
  const presets = [
    { key: '2x', label: '2x', to: clamp(base * 2) },
    { key: '3x', label: '3x', to: clamp(base * 3) },
    { key: 'pot', label: 'Pot', to: clamp(betToMatch + pot + callAmount) },
    { key: 'max', label: 'All-in', to: maxRaiseTo }
  ];

  const isAllIn = raiseTo >= maxRaiseTo;
  const callIsAllIn = callAmount >= myChips && callAmount > 0;

  // Dairesel süre göstergesi
  const frac = turnDuration > 0 ? Math.max(0, Math.min(1, timeLeft / turnDuration)) : 0;
  const danger = timeLeft <= 5;

  return (
    <div className="pk-actionbar">
      <div className={`pk-timer-ring ${danger ? 'danger' : ''}`} style={{ '--turn-deg': `${frac * 360}deg` }}>
        <span className="pk-timer-num">{timeLeft}</span>
      </div>

      <div className="pk-actionbar-main">
        <div className="pk-action-primary">
          <button className="pk-btn fold" onClick={() => onAction('fold')}>FOLD</button>
          <button className="pk-btn call" onClick={() => onAction(callAmount > 0 ? 'call' : 'check')}>
            {callAmount > 0
              ? (callIsAllIn ? `CALL ${myChips} · ALL-IN` : `CALL ${callAmount}`)
              : 'CHECK'}
          </button>
          {canRaise && (
            <button className="pk-btn raise" onClick={() => onAction('raise', raiseTo)}>
              {isAllIn ? `ALL-IN ${raiseTo} 🔥` : `RAISE ${raiseTo}`}
            </button>
          )}
        </div>

        {canRaise && (
          <div className="pk-raise-controls">
            <div className="pk-presets">
              {presets.map((p) => (
                <button
                  key={p.key}
                  className={`pk-preset ${raiseTo === p.to ? 'sel' : ''}`}
                  onClick={() => setRaiseTo(p.to)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="pk-slider-row">
              <button className="pk-step" onClick={() => setRaiseTo((v) => clamp(v - raiseStep))}>−</button>
              <input
                type="range"
                className="pk-slider"
                min={safeMinRaise}
                max={maxRaiseTo}
                step={raiseStep}
                value={raiseTo}
                onChange={(e) => setRaiseTo(clamp(Number(e.target.value)))}
              />
              <button className="pk-step" onClick={() => setRaiseTo((v) => clamp(v + raiseStep))}>+</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ActionBar;
