import React, { useState } from 'react';
import { SERVER_URL } from '../config';

// Giriş yapmış kullanıcının hesap ayarları: kullanıcı adı ve şifre değiştirme.
// Her iki işlem de şifre doğrulaması gerektirir.
function AccountModal({ show, onClose, token, user, onAccountUpdated }) {
  const [tab, setTab] = useState('username'); // 'username' | 'password'

  // --- Kullanıcı adı formu ---
  const [unamePassword, setUnamePassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [unameSubmitting, setUnameSubmitting] = useState(false);
  const [unameError, setUnameError] = useState('');
  const [unameSuccess, setUnameSuccess] = useState('');

  // --- Şifre formu ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  if (!show) return null;

  const resetAll = () => {
    setUnamePassword('');
    setNewUsername('');
    setUnameSubmitting(false);
    setUnameError('');
    setUnameSuccess('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPwSubmitting(false);
    setPwError('');
    setPwSuccess('');
    setTab('username');
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleUsernameSubmit = async (e) => {
    e.preventDefault();
    setUnameError('');
    setUnameSuccess('');

    const trimmed = newUsername.trim();
    if (!unamePassword || !trimmed) {
      setUnameError('Lütfen tüm alanları doldurun.');
      return;
    }
    if (trimmed.length < 3 || trimmed.length > 20) {
      setUnameError('Kullanıcı adı 3-20 karakter olmalıdır.');
      return;
    }
    if (trimmed === user?.username) {
      setUnameError('Yeni kullanıcı adı mevcut adınızla aynı.');
      return;
    }

    setUnameSubmitting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/change-username`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword: unamePassword, newUsername: trimmed })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUnameError(data.message || 'Kullanıcı adı değiştirilemedi.');
        return;
      }
      setUnameSuccess(data.message || 'Kullanıcı adınız değiştirildi.');
      setUnamePassword('');
      setNewUsername('');
      // Yeni token + kullanıcı bilgisiyle App durumunu güncelle (socket yeni adla yeniden bağlanır)
      if (data.token || data.user) {
        onAccountUpdated?.({ token: data.token, user: data.user });
      }
    } catch (err) {
      setUnameError('Sunucuya ulaşılamadı.');
    } finally {
      setUnameSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (!currentPassword || !newPassword) {
      setPwError('Lütfen tüm alanları doldurun.');
      return;
    }
    if (newPassword.length < 4) {
      setPwError('Yeni şifre en az 4 karakter olmalıdır.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Yeni şifreler eşleşmiyor.');
      return;
    }
    if (newPassword === currentPassword) {
      setPwError('Yeni şifre mevcut şifreyle aynı olamaz.');
      return;
    }

    setPwSubmitting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwError(data.message || 'Şifre değiştirilemedi.');
        return;
      }
      setPwSuccess(data.message || 'Şifreniz başarıyla değiştirildi.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwError('Sunucuya ulaşılamadı.');
    } finally {
      setPwSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content account-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>👤 Hesap Ayarları</h2>
          <button className="modal-close-btn" onClick={handleClose}>✕</button>
        </div>

        <div className="account-tabs">
          <button
            type="button"
            className={tab === 'username' ? 'active' : ''}
            onClick={() => setTab('username')}
          >
            Kullanıcı Adı
          </button>
          <button
            type="button"
            className={tab === 'password' ? 'active' : ''}
            onClick={() => setTab('password')}
          >
            Şifre
          </button>
        </div>

        <div className="account-body">
          {tab === 'username' ? (
            <form className="account-form" onSubmit={handleUsernameSubmit}>
              <p className="account-current">
                Mevcut kullanıcı adı: <strong>{user?.username || '—'}</strong>
              </p>
              <label className="acc-label">
                Yeni Kullanıcı Adı
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="3-20 karakter"
                  maxLength={20}
                />
              </label>
              <label className="acc-label">
                Şifreniz (doğrulama)
                <input
                  type="password"
                  value={unamePassword}
                  onChange={(e) => setUnamePassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Mevcut şifreniz"
                />
              </label>

              {unameError && <p className="acc-msg acc-error">{unameError}</p>}
              {unameSuccess && <p className="acc-msg acc-success">✔ {unameSuccess}</p>}

              <div className="acc-actions">
                <button type="button" className="acc-cancel" onClick={handleClose}>Kapat</button>
                <button type="submit" className="acc-confirm" disabled={unameSubmitting}>
                  {unameSubmitting ? 'Kaydediliyor…' : 'Kullanıcı Adını Değiştir'}
                </button>
              </div>
            </form>
          ) : (
            <form className="account-form" onSubmit={handlePasswordSubmit}>
              <label className="acc-label">
                Mevcut Şifre
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Mevcut şifreniz"
                />
              </label>
              <label className="acc-label">
                Yeni Şifre
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="En az 4 karakter"
                />
              </label>
              <label className="acc-label">
                Yeni Şifre (Tekrar)
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Yeni şifreyi tekrar girin"
                />
              </label>

              {pwError && <p className="acc-msg acc-error">{pwError}</p>}
              {pwSuccess && <p className="acc-msg acc-success">✔ {pwSuccess}</p>}

              <div className="acc-actions">
                <button type="button" className="acc-cancel" onClick={handleClose}>Kapat</button>
                <button type="submit" className="acc-confirm" disabled={pwSubmitting}>
                  {pwSubmitting ? 'Değiştiriliyor…' : 'Şifreyi Değiştir'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = `
  .account-modal { max-width: 440px; }
  .account-tabs { display: flex; border-bottom: 1px solid #34495e; }
  .account-tabs button { flex: 1; background: transparent; border: none; padding: 14px; color: #95a5a6; font-size: 15px; font-weight: 600; cursor: pointer; transition: 0.2s; border-bottom: 3px solid transparent; }
  .account-tabs button:hover { color: #ecf0f1; }
  .account-tabs button.active { color: #fff; border-bottom-color: #667eea; }
  .account-body { padding: 20px; }
  .account-form { display: flex; flex-direction: column; gap: 14px; }
  .account-current { margin: 0 0 4px; color: #bdc3c7; font-size: 14px; }
  .account-current strong { color: #f1c40f; }
  .acc-label { display: flex; flex-direction: column; gap: 6px; color: #bdc3c7; font-size: 13px; font-weight: 600; }
  .acc-label input { padding: 10px 12px; border-radius: 6px; border: 1px solid #46627f; background: #1c2833; color: #ecf0f1; font-size: 15px; }
  .acc-label input:focus { outline: none; border-color: #667eea; }
  .acc-msg { margin: 0; padding: 10px 12px; border-radius: 6px; font-size: 14px; text-align: center; }
  .acc-error { background: rgba(231, 76, 60, 0.15); color: #e74c3c; }
  .acc-success { background: rgba(46, 204, 113, 0.15); color: #2ecc71; }
  .acc-actions { display: flex; gap: 12px; margin-top: 4px; }
  .acc-cancel, .acc-confirm { flex: 1; padding: 12px; border: none; border-radius: 8px; font-size: 15px; font-weight: bold; cursor: pointer; color: #fff; transition: 0.2s; }
  .acc-cancel { background: #7f8c8d; }
  .acc-cancel:hover { background: #95a5a6; }
  .acc-confirm { background: #667eea; }
  .acc-confirm:hover { background: #576ad4; }
  .acc-confirm:disabled { background: #566573; cursor: not-allowed; opacity: 0.6; }
`;

if (typeof document !== 'undefined' && !document.getElementById('account-modal-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'account-modal-styles';
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

export default AccountModal;
