import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { SERVER_URL } from '../config';
import { chipIcon } from '../utils/currency';

// Oyun durumunu Türkçe rozet metnine çevir
function stateBadge(gameState) {
  if (gameState === 'waiting' || gameState === 'finished') {
    return { label: 'Bekliyor', className: 'lobby-badge waiting' };
  }
  return { label: 'Oyunda', className: 'lobby-badge playing' };
}

const EMPTY_FORM = {
  name: '',
  maxPlayers: 6,
  smallBlind: 10,
  bigBlind: 20,
  minBuyIn: 400,
  maxBuyIn: 2000,
  type: 'normal' // 'normal' | 'tournament'
};

function LobbyPage({ socket, isConnected, token, user }) {
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const loadTables = useCallback(() => {
    if (!socket) return;
    socket.emit('getLobbyTables', (res) => {
      if (res && res.tables) {
        setTables(res.tables);
        setError('');
      } else {
        setError('Masalar yüklenemedi.');
      }
      setLoading(false);
    });
  }, [socket]);

  // İlk yükleme + 5 sn'de bir otomatik yenileme.
  // Yenileme HTTP değil socket üzerinden: tünelin (ngrok) aylık 20.000 istek kotasını
  // 5 sn'lik fetch yoklaması tek bir açık sekmeyle bir günde bitiriyordu.
  // Socket kopukken hiç denemiyoruz — bağlantı durumu zaten üstteki göstergede belli.
  useEffect(() => {
    if (!socket || !isConnected) return;
    loadTables();
    const id = setInterval(loadTables, 5000);
    return () => clearInterval(id);
  }, [socket, isConnected, loadTables]);

  const goToTable = (id) => navigate(`/table/${id}`);

  const handleFormChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    // İstemci tarafı temel doğrulama (sunucu da doğruluyor)
    const sb = Number(form.smallBlind);
    const bb = Number(form.bigBlind);
    const minB = Number(form.minBuyIn);
    const maxB = Number(form.maxBuyIn);
    if (!form.name.trim()) return alert('Masa adı gerekli.');
    if (sb >= bb) return alert('Small Blind, Big Blind\'dan küçük olmalı.');
    if (maxB > 0 && minB > maxB) return alert('Minimum giriş, maksimum girişten büyük olamaz.');

    setCreating(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/tables/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: form.name.trim(),
          maxPlayers: Number(form.maxPlayers),
          smallBlind: sb,
          bigBlind: bb,
          minBuyIn: minB,
          maxBuyIn: maxB,
          type: form.type
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Masa oluşturulamadı.');
        return;
      }
      setShowCreate(false);
      setForm(EMPTY_FORM);
      loadTables();
    } catch (err) {
      alert('Masa oluşturulurken bir hata oluştu.');
    } finally {
      setCreating(false);
    }
  };

  // Masa sil (yalnızca admin). İçinde oyuncu olsa bile sunucu güvenle iade edip siler.
  const handleDelete = async (table) => {
    const ok = window.confirm(
      `"${table.name}" masasını silmek istediğine emin misin?` +
      (table.playerCount > 0
        ? `\n\nMasada ${table.playerCount} oyuncu var; çipleri kasalarına iade edilecek ve lobiye atılacaklar.`
        : '')
    );
    if (!ok) return;

    setDeletingId(table.id);
    try {
      const res = await fetch(`${SERVER_URL}/api/tables/${table.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || 'Masa silinemedi.');
        return;
      }
      loadTables();
    } catch (err) {
      alert('Masa silinirken bir hata oluştu.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="lobby-page">
      <div className="lobby-header">
        <h1>♠️ Poker Lobisi</h1>
        <div className="lobby-header-right">
          <span className={`lobby-conn ${isConnected ? 'ok' : 'off'}`}>
            {isConnected ? '🟢 Bağlı' : '🔴 Bağlantı yok'}
          </span>
          {user?.isAdmin && (
            <button className="lobby-create-btn" onClick={() => setShowCreate(s => !s)}>
              {showCreate ? '✕ Kapat' : '➕ Yeni Masa Oluştur'}
            </button>
          )}
        </div>
      </div>

      {user?.isAdmin && showCreate && (
        <form className="lobby-create-form" onSubmit={handleCreate}>
          <div className="form-row">
            <label>
              Masa Adı
              <input type="text" value={form.name}
                onChange={e => handleFormChange('name', e.target.value)}
                placeholder="Örn: VIP Masa" required />
            </label>
            <label>
              Maks. Oyuncu
              <select value={form.maxPlayers} onChange={e => handleFormChange('maxPlayers', e.target.value)}>
                <option value={2}>2</option>
                <option value={4}>4</option>
                <option value={6}>6</option>
                <option value={8}>8</option>
                <option value={9}>9</option>
              </select>
            </label>
            <label>
              Masa Türü
              <select value={form.type} onChange={e => handleFormChange('type', e.target.value)}>
                <option value="normal">🍪 Normal (oyun çipi)</option>
                <option value="tournament">💎 Turnuva (turnuva çipi)</option>
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              Small Blind
              <input type="number" min="1" value={form.smallBlind}
                onChange={e => handleFormChange('smallBlind', e.target.value)} required />
            </label>
            <label>
              Big Blind
              <input type="number" min="2" value={form.bigBlind}
                onChange={e => handleFormChange('bigBlind', e.target.value)} required />
            </label>
          </div>
          <div className="form-row">
            <label>
              Min Giriş (Buy-in)
              <input type="number" min="1" value={form.minBuyIn}
                onChange={e => handleFormChange('minBuyIn', e.target.value)} required />
            </label>
            <label>
              Maks Giriş (0 = sınırsız)
              <input type="number" min="0" value={form.maxBuyIn}
                onChange={e => handleFormChange('maxBuyIn', e.target.value)} required />
            </label>
          </div>
          <button type="submit" className="lobby-submit-btn" disabled={creating}>
            {creating ? 'Oluşturuluyor…' : 'Masayı Oluştur'}
          </button>
        </form>
      )}

      {loading ? (
        // Liste yalnızca socket bağlıyken geliyor; bağlantı yokken "yükleniyor" demek yanıltıcı olur.
        <p className="lobby-info">{isConnected ? 'Masalar yükleniyor…' : 'Sunucuya bağlanılıyor…'}</p>
      ) : error ? (
        <p className="lobby-info error">{error}</p>
      ) : tables.length === 0 ? (
        <p className="lobby-info">Henüz masa yok. {user?.isAdmin ? 'Yukarıdan yeni bir masa oluşturabilirsin.' : 'Bir admin masa oluşturana kadar bekle.'}</p>
      ) : (
        <div className="lobby-grid">
          {tables.map(t => {
            const badge = stateBadge(t.gameState);
            const full = t.playerCount >= t.maxPlayers;
            const isTournament = t.type === 'tournament';
            const icon = chipIcon(t.type);
            return (
              <div key={t.id} className={`lobby-card${isTournament ? ' tournament' : ''}`}>
                <div className="lobby-card-top">
                  <h3>{t.name}</h3>
                  <div className="lobby-card-badges">
                    {isTournament && <span className="lobby-badge tournament">💎 Turnuva</span>}
                    <span className={badge.className}>{badge.label}</span>
                  </div>
                </div>
                <div className="lobby-card-info">
                  <div><span className="k">Blindlar</span><span className="v">{t.smallBlind} / {t.bigBlind}</span></div>
                  <div><span className="k">Buy-in</span><span className="v">{t.minBuyIn} - {t.maxBuyIn > 0 ? t.maxBuyIn : '∞'} {icon}</span></div>
                  <div><span className="k">Oyuncu</span><span className="v">{t.playerCount} / {t.maxPlayers}</span></div>
                </div>
                <div className="lobby-card-actions">
                  <button
                    className="lobby-join-btn"
                    onClick={() => goToTable(t.id)}
                    disabled={!isConnected}
                  >
                    {!isConnected ? 'Bağlanılıyor…' : full ? 'İzle' : 'Otur / İzle'}
                  </button>
                  {user?.isAdmin && (
                    <button
                      className="lobby-delete-btn"
                      onClick={() => handleDelete(t)}
                      disabled={deletingId === t.id}
                      title="Masayı sil"
                    >
                      {deletingId === t.id ? '…' : '🗑'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = `
  .lobby-page { max-width: 1000px; margin: 0 auto; padding: 84px 16px 60px; }
  .lobby-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
  .lobby-header h1 { color: #ecf0f1; margin: 0; font-size: 28px; }
  .lobby-header-right { display: flex; align-items: center; gap: 12px; }
  .lobby-conn { font-size: 13px; font-weight: bold; }
  .lobby-conn.ok { color: #2ecc71; }
  .lobby-conn.off { color: #e74c3c; }
  .lobby-create-btn { background: #27ae60; color: #fff; border: none; padding: 10px 16px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; }
  .lobby-create-btn:hover { background: #219150; }

  .lobby-create-form { background: #2c3e50; border: 1px solid #34495e; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
  .lobby-create-form .form-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
  .lobby-create-form label { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 140px; color: #bdc3c7; font-size: 13px; font-weight: 600; }
  .lobby-create-form input, .lobby-create-form select { padding: 9px 10px; border-radius: 6px; border: 1px solid #445; background: #1c2833; color: #fff; font-size: 14px; }
  .lobby-submit-btn { background: #2980b9; color: #fff; border: none; padding: 11px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; }
  .lobby-submit-btn:hover { background: #2471a3; }
  .lobby-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .lobby-info { color: #95a5a6; text-align: center; padding: 40px 0; font-size: 16px; }
  .lobby-info.error { color: #e67e22; }

  .lobby-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 18px; }
  .lobby-card { background: linear-gradient(160deg, #2c3e50 0%, #23303e 100%); border: 1px solid #34495e; border-radius: 14px; padding: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.25); transition: 0.2s; }
  .lobby-card:hover { transform: translateY(-3px); box-shadow: 0 8px 18px rgba(0,0,0,0.35); }
  .lobby-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
  .lobby-card-top h3 { margin: 0; color: #ecf0f1; font-size: 18px; }
  .lobby-badge { padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; color: #fff; }
  .lobby-badge.waiting { background: #7f8c8d; }
  .lobby-badge.playing { background: #27ae60; }
  .lobby-badge.tournament { background: linear-gradient(135deg, #8e44ad 0%, #5b2c83 100%); }
  .lobby-card-badges { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
  .lobby-card.tournament { border-color: #8e44ad; box-shadow: 0 4px 12px rgba(142, 68, 173, 0.25); }
  .lobby-card.tournament:hover { box-shadow: 0 8px 18px rgba(142, 68, 173, 0.4); }
  .lobby-card-info { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
  .lobby-card-info > div { display: flex; justify-content: space-between; font-size: 14px; }
  .lobby-card-info .k { color: #95a5a6; }
  .lobby-card-info .v { color: #f1c40f; font-weight: bold; }
  .lobby-card-actions { display: flex; gap: 8px; }
  .lobby-join-btn { flex: 1; background: #e67e22; color: #fff; border: none; padding: 11px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; }
  .lobby-join-btn:hover { background: #d35400; }
  .lobby-join-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .lobby-delete-btn { flex: 0 0 auto; width: 44px; background: #7f1d1d; color: #fff; border: none; padding: 11px 0; border-radius: 8px; font-size: 15px; cursor: pointer; transition: 0.2s; }
  .lobby-delete-btn:hover { background: #b91c1c; }
  .lobby-delete-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  @media (max-width: 600px) {
    .lobby-header { flex-direction: column; align-items: stretch; }
    .lobby-grid { grid-template-columns: 1fr; }
  }
`;

if (typeof document !== 'undefined' && !document.getElementById('lobby-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'lobby-styles';
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

export default LobbyPage;
