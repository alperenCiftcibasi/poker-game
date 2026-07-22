import React from 'react';
import teaImg from '../assets/tea.png';

// Koltuktaki ➕ butonundan açılan ısmarlama modalı.
// Şimdilik tek ürün: çay. Liste genişletilebilir (ITEMS'a ekle).
// Fiyat her zaman normal çip (🍪): sunucu turnuva masasında bile normal çipten keser.
const ITEMS = [
  { key: 'tea', name: 'Çay', cost: 50, img: teaImg }
];

function TreatModal({ show, target, onClose, onBuy }) {
  if (!show || !target) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content treat-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🎁 {target.isMe ? 'Kendine ısmarla' : `${target.username} için ısmarla`}</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="treat-body">
          {ITEMS.map((item) => (
            <div key={item.key} className="treat-item">
              <img className="treat-item-img" src={item.img} alt={item.name} draggable={false} />
              <div className="treat-item-info">
                <div className="treat-item-name">{item.name}</div>
                <div className="treat-item-cost">{item.cost} 🍪</div>
              </div>
              <button className="btn-treat-buy" onClick={() => onBuy(target.id)}>Al</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = `
  .treat-modal { max-width: 380px; }
  .treat-body { padding: 16px 20px 20px; }
  .treat-item {
    display: flex; align-items: center; gap: 14px;
    background: #34495e; border: 1px solid #46627f; border-radius: 10px;
    padding: 10px 14px;
  }
  .treat-item + .treat-item { margin-top: 10px; }
  .treat-item-img { width: 40px; height: 40px; object-fit: contain; flex-shrink: 0; }
  .treat-item-info { flex: 1; text-align: left; }
  .treat-item-name { color: #ecf0f1; font-weight: bold; font-size: 16px; }
  .treat-item-cost { color: #f1c40f; font-size: 14px; margin-top: 2px; }
  .btn-treat-buy {
    background: #27ae60; color: white; border: none; border-radius: 8px;
    padding: 10px 22px; font-size: 15px; font-weight: bold; cursor: pointer; transition: 0.2s;
  }
  .btn-treat-buy:hover { background: #2ecc71; }
`;

if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

export default TreatModal;
