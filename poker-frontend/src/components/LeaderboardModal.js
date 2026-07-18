import React from 'react';
import Avatar from './Avatar';

function LeaderboardModal({ show, onClose, leaderboardData }) {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content leaderboard-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🏆 Lider Tablosu</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        
        <div className="leaderboard-list">
          {!leaderboardData ? (
            <p className="no-data">Veri yükleniyor...</p>
          ) : leaderboardData.length === 0 ? (
            <p className="no-data">Henüz oyuncu bulunmuyor.</p>
          ) : (
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Sıra</th>
                  <th>Oyuncu</th>
                  <th>Chip</th>
                </tr>
              </thead>
              <tbody>
                {leaderboardData.map((player, index) => (
                  <tr key={player.id} className={index < 3 ? `rank-${index + 1}` : ''}>
                    <td className="rank-cell">
                      {index === 0 && '🥇'}
                      {index === 1 && '🥈'}
                      {index === 2 && '🥉'}
                      {index > 2 && `${index + 1}.`}
                    </td>
                    <td className="player-cell">
                      <span className="player-cell-inner">
                        <Avatar userId={player.id} username={player.username} size={32} />
                        {player.username}
                      </span>
                    </td>
                    <td className="chips-cell">{player.chips} 🍪</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = `
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    animation: fadeIn 0.2s ease-in;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal-content {
    background: #2c3e50;
    border-radius: 12px;
    padding: 0;
    max-width: 600px;
    width: 90%;
    max-height: 80vh;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from { transform: translateY(30px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .modal-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #34495e;
  }

  .modal-header h2 {
    margin: 0;
    color: white;
    font-size: 24px;
  }

  .modal-close-btn {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    font-size: 24px;
    width: 35px;
    height: 35px;
    border-radius: 50%;
    cursor: pointer;
    transition: 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-close-btn:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: rotate(90deg);
  }

  .leaderboard-list {
    padding: 20px;
    max-height: calc(80vh - 80px);
    overflow-y: auto;
  }

  .leaderboard-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0 8px;
  }

  .leaderboard-table thead th {
    color: #bdc3c7;
    text-align: left;
    padding: 10px 15px;
    font-weight: 600;
    font-size: 14px;
    text-transform: uppercase;
    position: sticky;
    top: 0;
    background: #2c3e50;
  }

  .leaderboard-table tbody tr {
    background: #34495e;
    transition: 0.2s;
  }

  .leaderboard-table tbody tr:hover {
    background: #3d566e;
    transform: scale(1.02);
  }

  .leaderboard-table tbody tr.rank-1 {
    background: linear-gradient(90deg, #f39c12 0%, #f1c40f 100%);
  }

  .leaderboard-table tbody tr.rank-2 {
    background: linear-gradient(90deg, #95a5a6 0%, #bdc3c7 100%);
  }

  .leaderboard-table tbody tr.rank-3 {
    background: linear-gradient(90deg, #d35400 0%, #e67e22 100%);
  }

  .leaderboard-table tbody tr.rank-1,
  .leaderboard-table tbody tr.rank-2,
  .leaderboard-table tbody tr.rank-3 {
    font-weight: bold;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  }

  .leaderboard-table td {
    padding: 15px;
    color: white;
    font-size: 16px;
  }

  .rank-cell {
    font-size: 20px;
    text-align: center;
    width: 60px;
  }

  .player-cell {
    font-weight: 500;
  }

  .player-cell-inner {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .chips-cell {
    text-align: right;
    font-weight: bold;
    color: #f1c40f;
  }

  .no-data {
    text-align: center;
    color: #95a5a6;
    padding: 40px;
    font-size: 16px;
  }

  /* Scrollbar Styling */
  .leaderboard-list::-webkit-scrollbar {
    width: 8px;
  }

  .leaderboard-list::-webkit-scrollbar-track {
    background: #2c3e50;
    border-radius: 10px;
  }

  .leaderboard-list::-webkit-scrollbar-thumb {
    background: #667eea;
    border-radius: 10px;
  }

  .leaderboard-list::-webkit-scrollbar-thumb:hover {
    background: #764ba2;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

export default LeaderboardModal;
