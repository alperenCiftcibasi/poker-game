import React, { useState, useEffect } from 'react';
import { SERVER_URL } from '../config';

// Kullanıcı adından tutarlı bir avatar rengi üret (fotoğraf yoksa baş harf zemini).
export function avatarHue(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

// Profil fotoğrafı görsel URL'i. version verilirse önbellek kırma (?v=) eklenir —
// kullanıcı fotoğrafını değiştirdiğinde kendi görünümü anında tazelenir.
export function avatarUrl(userId, version) {
  if (userId == null) return null;
  const bust = version != null ? `?v=${version}` : '';
  return `${SERVER_URL}/api/auth/avatar/${userId}${bust}`;
}

// Dairesel avatar: fotoğraf yüklüyse gösterir, yoksa (ya da yükleme hatasında)
// baş harfe düşer. hasAvatar === false ise hiç istek atmadan baş harf gösterir.
function Avatar({ userId, username, size = 48, version, hasAvatar, className = '' }) {
  const [error, setError] = useState(false);

  // userId/version değişince hata durumunu sıfırla ki yeni görsel yeniden denensin.
  useEffect(() => { setError(false); }, [userId, version]);

  const showImg = userId != null && hasAvatar !== false && !error;
  const initial = (username || '?').charAt(0).toUpperCase();

  const dimStyle = { width: size, height: size };

  return (
    <div className={`pk-avatar ${className}`} style={dimStyle}>
      {showImg ? (
        <img
          className="pk-avatar-img"
          src={avatarUrl(userId, version)}
          alt={username || 'avatar'}
          draggable={false}
          onError={() => setError(true)}
        />
      ) : (
        <span
          className="pk-avatar-initial"
          style={{
            background: `hsl(${avatarHue(username)}, 45%, 42%)`,
            fontSize: Math.round(size * 0.42)
          }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}

const styles = `
  .pk-avatar { position: relative; border-radius: 50%; overflow: hidden; flex-shrink: 0;
    box-shadow: inset 0 0 0 2px rgba(0,0,0,0.25); }
  .pk-avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pk-avatar-initial { width: 100%; height: 100%; display: flex; align-items: center;
    justify-content: center; color: #fff; font-weight: 800; line-height: 1; }
`;

if (typeof document !== 'undefined' && !document.getElementById('pk-avatar-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'pk-avatar-styles';
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

export default Avatar;
