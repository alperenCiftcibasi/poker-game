import React, { useState, useEffect, useMemo } from 'react';

// Masaya oturmadan önce buy-in miktarını seçtiren modal.
// bank: kullanıcının toplam bakiyesi (kasa + masa). null iken yükleniyor.
function BuyInModal({ show, onClose, onConfirm, bank, settings, tableName }) {
  const minBuyIn = settings?.minBuyIn || 0;
  const maxBuyIn = settings?.maxBuyIn || 0;
  const bigBlind = settings?.bigBlind || 0;
  const smallBlind = settings?.smallBlind || 0;

  // Sunucudaki doğrulamayla aynı sınırlar (min = minBuyIn>0 ? minBuyIn : 1)
  const bounds = useMemo(() => {
    if (bank == null) return null;
    const lower = minBuyIn > 0 ? minBuyIn : 1;
    const upper = maxBuyIn > 0 ? Math.min(maxBuyIn, bank) : bank;
    const step = bigBlind || smallBlind || 1;
    return { lower, upper, step, canSit: bank >= lower };
  }, [bank, minBuyIn, maxBuyIn, bigBlind, smallBlind]);

  const [value, setValue] = useState(0);

  // Modal açıldığında / bakiye geldiğinde varsayılan olarak maksimumu seç
  useEffect(() => {
    if (bounds && bounds.canSit) setValue(bounds.upper);
  }, [bounds]);

  if (!show) return null;

  const clamp = (v) => {
    if (!bounds) return v;
    return Math.max(bounds.lower, Math.min(bounds.upper, v));
  };

  const handleConfirm = () => {
    if (!bounds || !bounds.canSit) return;
    onConfirm(clamp(Math.round(value)));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content buyin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🪑 Masaya Otur{tableName ? ` — ${tableName}` : ''}</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="buyin-body">
          {bank == null ? (
            <p className="buyin-loading">Bakiye yükleniyor...</p>
          ) : !bounds.canSit ? (
            <div className="buyin-insufficient">
              <p>Bu masaya oturmak için yeterli bakiyeniz yok.</p>
              <p className="buyin-detail">
                Gereken minimum: <strong>{bounds.lower}</strong> · Kasanız: <strong>{bank}</strong> 🍪
              </p>
            </div>
          ) : (
            <>
              <div className="buyin-info-row">
                <span>Kasanız</span>
                <strong>{bank} 🍪</strong>
              </div>
              <div className="buyin-info-row">
                <span>Blindlar</span>
                <strong>{smallBlind} / {bigBlind}</strong>
              </div>
              <div className="buyin-info-row">
                <span>İzin verilen aralık</span>
                <strong>{bounds.lower} – {bounds.upper}</strong>
              </div>

              <div className="buyin-amount">{value} 🍪</div>

              <input
                type="range"
                min={bounds.lower}
                max={bounds.upper}
                step={bounds.step}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                className="buyin-slider"
              />

              <div className="buyin-quick">
                <button onClick={() => setValue(bounds.lower)}>Min</button>
                <button onClick={() => setValue(clamp(Math.round((bounds.lower + bounds.upper) / 2)))}>½</button>
                <button onClick={() => setValue(bounds.upper)}>Max</button>
              </div>

              <input
                type="number"
                className="buyin-number"
                min={bounds.lower}
                max={bounds.upper}
                value={value}
                onChange={(e) => setValue(Number(e.target.value))}
                onBlur={() => setValue(clamp(Math.round(value)))}
              />
            </>
          )}
        </div>

        <div className="buyin-actions">
          <button className="btn-buyin-cancel" onClick={onClose}>İptal</button>
          <button
            className="btn-buyin-confirm"
            disabled={bank == null || !bounds?.canSit}
            onClick={handleConfirm}
          >
            Otur ({bounds?.canSit ? clamp(Math.round(value)) : 0} 🍪)
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = `
  .buyin-modal { max-width: 440px; }
  .buyin-body { padding: 20px; }
  .buyin-loading, .buyin-insufficient { text-align: center; color: #ecf0f1; padding: 20px 0; }
  .buyin-detail { color: #bdc3c7; font-size: 14px; margin-top: 8px; }
  .buyin-info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.08); color: #bdc3c7; font-size: 14px; }
  .buyin-info-row strong { color: #f1c40f; }
  .buyin-amount { text-align: center; font-size: 34px; font-weight: bold; color: #2ecc71; margin: 20px 0 12px; }
  .buyin-slider { width: 100%; cursor: pointer; height: 8px; border-radius: 5px; outline: none; -webkit-appearance: none; background: #34495e; }
  .buyin-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; border-radius: 50%; background: #2ecc71; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.4); }
  .buyin-quick { display: flex; gap: 8px; justify-content: center; margin: 14px 0; }
  .buyin-quick button { flex: 1; background: #34495e; color: #ecf0f1; border: 1px solid #46627f; border-radius: 6px; padding: 8px; cursor: pointer; font-weight: bold; transition: 0.2s; }
  .buyin-quick button:hover { background: #46627f; }
  .buyin-number { width: 100%; box-sizing: border-box; padding: 10px; border-radius: 6px; border: 1px solid #46627f; background: #2c3e50; color: #ecf0f1; font-size: 16px; text-align: center; }
  .buyin-actions { display: flex; gap: 12px; padding: 16px 20px 20px; }
  .btn-buyin-cancel, .btn-buyin-confirm { flex: 1; padding: 12px; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; color: white; transition: 0.2s; }
  .btn-buyin-cancel { background: #7f8c8d; }
  .btn-buyin-cancel:hover { background: #95a5a6; }
  .btn-buyin-confirm { background: #27ae60; }
  .btn-buyin-confirm:hover { background: #2ecc71; }
  .btn-buyin-confirm:disabled { background: #566573; cursor: not-allowed; opacity: 0.6; }
`;

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

export default BuyInModal;
