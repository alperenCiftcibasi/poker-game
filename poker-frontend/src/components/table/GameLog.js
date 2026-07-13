import React from 'react';

// Aksiyon / olay logu. Girdiler App.js'te formatlanır: { id, kind, text }.
function GameLog({ entries = [] }) {
  return (
    <div className="pk-log">
      <div className="pk-log-title">📜 Oyun Akışı</div>
      <div className="pk-log-feed">
        {entries.length === 0 ? (
          <div className="pk-log-empty">Henüz hareket yok.</div>
        ) : (
          entries.map((e) => (
            <div key={e.id} className={`pk-log-row ${e.kind || ''}`}>{e.text}</div>
          ))
        )}
      </div>
    </div>
  );
}

export default GameLog;
