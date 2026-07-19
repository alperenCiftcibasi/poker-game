import React, { useState, useEffect, useCallback } from 'react';
import { SERVER_URL } from '../config';

function AdminPanel({ show, onClose, token }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.message || 'Kullanıcılar yüklenemedi');
        return;
      }
      
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      console.error('Kullanıcı yükleme hatası:', error);
      alert('Kullanıcılar yüklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (show) {
      loadUsers();
    }
  }, [show, loadUsers]);

  const handleUpdateChips = async (userId, username) => {
    const amount = prompt(`${username} için chip miktarı girin:\n(Eklemek için pozitif, çıkarmak için negatif sayı)`);
    
    if (amount === null) return; // İptal
    
    const chipAmount = parseInt(amount);
    if (isNaN(chipAmount)) {
      alert('Geçerli bir sayı girin!');
      return;
    }

    try {
      const res = await fetch(`${SERVER_URL}/api/admin/update-chips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, amount: chipAmount })
      });

      const data = await res.json();
      
      if (!res.ok) {
        alert(data.message || 'İşlem başarısız');
        return;
      }

      alert(data.message);
      loadUsers(); // Listeyi yenile
    } catch (error) {
      console.error('Chip güncelleme hatası:', error);
      alert('İşlem sırasında bir hata oluştu.');
    }
  };

  const handleUpdateTournamentChips = async (userId, username) => {
    const amount = prompt(`${username} için turnuva çipi miktarı girin:\n(Eklemek için pozitif, çıkarmak için negatif sayı)`);

    if (amount === null) return; // İptal

    const chipAmount = parseInt(amount);
    if (isNaN(chipAmount)) {
      alert('Geçerli bir sayı girin!');
      return;
    }

    try {
      const res = await fetch(`${SERVER_URL}/api/admin/update-tournament-chips`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, amount: chipAmount })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || 'İşlem başarısız');
        return;
      }

      alert(data.message);
      loadUsers(); // Listeyi yenile
    } catch (error) {
      console.error('Turnuva çipi güncelleme hatası:', error);
      alert('İşlem sırasında bir hata oluştu.');
    }
  };

  const handleToggleAdmin = async (userId, username, currentStatus) => {
    const action = currentStatus ? 'kaldırmak' : 'vermek';
    if (!window.confirm(`${username} kullanıcısına admin yetkisi ${action} istediğinize emin misiniz?`)) {
      return;
    }

    try {
      const res = await fetch(`${SERVER_URL}/api/admin/toggle-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId })
      });

      const data = await res.json();
      
      if (!res.ok) {
        alert(data.message || 'İşlem başarısız');
        return;
      }

      alert(data.message);
      loadUsers(); // Listeyi yenile
    } catch (error) {
      console.error('Admin yetkisi değiştirme hatası:', error);
      alert('İşlem sırasında bir hata oluştu.');
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`${username} kullanıcısını silmek istediğinize emin misiniz?\nBu işlem geri alınamaz!`)) {
      return;
    }

    try {
      const res = await fetch(`${SERVER_URL}/api/admin/user/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();
      
      if (!res.ok) {
        alert(data.message || 'Silme işlemi başarısız');
        return;
      }

      alert(data.message);
      loadUsers(); // Listeyi yenile
    } catch (error) {
      console.error('Kullanıcı silme hatası:', error);
      alert('İşlem sırasında bir hata oluştu.');
    }
  };

  const handleApproveUser = async (userId, username, approve) => {
    const action = approve ? 'onaylamak' : 'reddetmek';
    if (!window.confirm(`${username} kullanıcısını ${action} istediğinize emin misiniz?`)) {
      return;
    }

    try {
      const res = await fetch(`${SERVER_URL}/api/admin/approve-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId, approve })
      });

      const data = await res.json();
      
      if (!res.ok) {
        alert(data.message || 'İşlem başarısız');
        return;
      }

      alert(data.message);
      loadUsers(); // Listeyi yenile
    } catch (error) {
      console.error('Kullanıcı onaylama hatası:', error);
      alert('İşlem sırasında bir hata oluştu.');
    }
  };

  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content admin-panel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header admin-header">
          <h2>⚙️ Admin Paneli</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        
        <div className="admin-panel-content">
          {loading ? (
            <p className="loading-text">Yükleniyor...</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Kullanıcı Adı</th>
                  <th>Chip</th>
                  <th>Turnuva Çipi</th>
                  <th>Rol</th>
                  <th>Durum</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td className="username-cell">{user.username}</td>
                    <td className="chips-cell">{user.chips} 🍪</td>
                    <td className="tournament-chips-cell">{user.tournamentChips ?? 0} 💎</td>
                    <td className="role-cell">
                      {user.isAdmin ? <span className="admin-badge">ADMIN</span> : <span className="user-badge">USER</span>}
                    </td>
                    <td className="status-cell">
                      {user.isApproved ? (
                        <span className="approved-badge">✅ Onaylı</span>
                      ) : (
                        <span className="pending-badge">⏳ Bekliyor</span>
                      )}
                    </td>
                    <td className="actions-cell">
                      {!user.isApproved && (
                        <>
                          <button 
                            className="btn-admin btn-approve" 
                            onClick={() => handleApproveUser(user.id, user.username, true)}
                            title="Hesabı Onayla"
                          >
                            ✅
                          </button>
                          <button 
                            className="btn-admin btn-reject" 
                            onClick={() => handleApproveUser(user.id, user.username, false)}
                            title="Hesabı Reddet"
                          >
                            ❌
                          </button>
                        </>
                      )}
                      <button
                        className="btn-admin btn-chips"
                        onClick={() => handleUpdateChips(user.id, user.username)}
                        title="Chip Ekle/Çıkar"
                      >
                        💰
                      </button>
                      <button
                        className="btn-admin btn-tournament-chips"
                        onClick={() => handleUpdateTournamentChips(user.id, user.username)}
                        title="Turnuva Çipi Ekle/Çıkar"
                      >
                        💎
                      </button>
                      <button 
                        className="btn-admin btn-toggle-admin" 
                        onClick={() => handleToggleAdmin(user.id, user.username, user.isAdmin)}
                        title="Admin Yap/Kaldır"
                      >
                        🎖️
                      </button>
                      <button 
                        className="btn-admin btn-delete" 
                        onClick={() => handleDeleteUser(user.id, user.username)}
                        title="Kullanıcıyı Sil"
                      >
                        🗑️
                      </button>
                    </td>
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
  .admin-panel-modal {
    max-width: 900px;
    width: 95%;
    max-height: 85vh;
  }

  .admin-header {
    background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
  }

  .admin-panel-content {
    padding: 20px;
    max-height: calc(85vh - 80px);
    overflow-y: auto;
  }

  .loading-text {
    text-align: center;
    color: #95a5a6;
    padding: 40px;
    font-size: 16px;
  }

  .admin-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0 10px;
  }

  .admin-table thead th {
    color: #ecf0f1;
    text-align: left;
    padding: 12px;
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    background: #34495e;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .admin-table tbody tr {
    background: #34495e;
    transition: 0.2s;
  }

  .admin-table tbody tr:hover {
    background: #3d566e;
    transform: scale(1.01);
  }

  .admin-table td {
    padding: 12px;
    color: white;
    font-size: 14px;
    vertical-align: middle;
  }

  .username-cell {
    font-weight: 500;
    color: #3498db;
  }

  .chips-cell {
    font-weight: bold;
    color: #f1c40f;
  }

  .tournament-chips-cell {
    font-weight: bold;
    color: #bb8fce;
  }

  .role-cell {
    text-align: center;
  }

  .admin-badge, .user-badge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: bold;
    display: inline-block;
  }

  .admin-badge {
    background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
    color: white;
  }

  .user-badge {
    background: #7f8c8d;
    color: white;
  }

  .status-cell {
    text-align: center;
  }

  .approved-badge, .pending-badge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: bold;
    display: inline-block;
  }

  .approved-badge {
    background: #27ae60;
    color: white;
  }

  .pending-badge {
    background: #f39c12;
    color: white;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .actions-cell {
    text-align: right;
    white-space: nowrap;
  }

  .btn-admin {
    background: #2c3e50;
    border: 1px solid #34495e;
    color: white;
    padding: 8px 12px;
    margin: 0 3px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    transition: 0.2s;
  }

  .btn-admin:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  }

  .btn-chips:hover {
    background: #27ae60;
  }

  .btn-tournament-chips:hover {
    background: #8e44ad;
  }

  .btn-toggle-admin:hover {
    background: #3498db;
  }

  .btn-delete:hover {
    background: #e74c3c;
  }

  .btn-approve:hover {
    background: #27ae60;
  }

  .btn-reject:hover {
    background: #e67e22;
  }

  /* Scrollbar Styling */
  .admin-panel-content::-webkit-scrollbar {
    width: 8px;
  }

  .admin-panel-content::-webkit-scrollbar-track {
    background: #2c3e50;
    border-radius: 10px;
  }

  .admin-panel-content::-webkit-scrollbar-thumb {
    background: #e74c3c;
    border-radius: 10px;
  }

  .admin-panel-content::-webkit-scrollbar-thumb:hover {
    background: #c0392b;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

export default AdminPanel;
