import React, { useState, useEffect } from 'react';
import { Card, MiniCard, CardBack, cardKey } from './Card';
import { avatarHue, avatarUrl } from '../Avatar';
import { TREATS } from '../../treats';

function statusBadge(player, gameState) {
  if (player.disconnected) return { text: '📴 Bağlantı koptu', cls: 'off' };
  // Oyun sonu "Ayrıldı": artık masada değil ama el sonu bilgileri koltukta durur.
  if (player.left || (gameState === 'finished' && player.pendingLeave)) return { text: '🚪 Ayrıldı', cls: 'leave' };
  if (player.pendingLeave) return { text: '⚠️ Ayrılıyor', cls: 'leave' };
  if (player.status === 'all-in') return { text: '🔥 ALL-IN', cls: 'allin' };
  if (player.status === 'folded') return { text: 'Fold', cls: 'folded' };
  // El sürerken oturan yeni oyuncu: bu ele dahil değil, sıradaki eli bekliyor.
  const handActive = !['waiting', 'finished', 'showdown'].includes(gameState);
  if (handActive && player.status === 'waiting') return { text: '🕒 Sonraki el', cls: 'waiting' };
  return null;
}

function Seat({
  position, player, isMe, isMyId, isCurrentTurn, timeLeft, turnDuration,
  gameState, faceCards, highlightKeys, isWinner, avatarVersion, chipIcon = '🍪',
  onOpenTreat, treat = null
}) {
  const wrapperStyle = { left: `${position.left}%`, top: `${position.top}%` };

  // Profil fotoğrafı: yüklenemezse baş harf avatarına düş.
  const [avatarError, setAvatarError] = useState(false);
  // Kendi koltuğumda foto değişince (avatarVersion) yeniden dene; başka oyuncu değişince
  // koltuk id'si aynı kalır, kısa önbellek zaten yeni görseli ~1 dk içinde getirir.
  useEffect(() => { setAvatarError(false); }, [player?.id, avatarVersion]);

  // Boş koltuk hayaleti
  if (!player) {
    return (
      <div className="pk-seat pk-seat-empty" style={wrapperStyle}>
        <div className="pk-seat-ghost">Boş Koltuk</div>
      </div>
    );
  }

  const badge = statusBadge(player, gameState);
  const isFolded = player.status === 'folded';
  const showdownVisible = (gameState === 'showdown' || gameState === 'finished') && faceCards && faceCards.length > 0;
  const showFaceCards = (isMe && faceCards && faceCards.length > 0) || showdownVisible;
  const liveRevealed = !showFaceCards && player.revealedCards && player.revealedCards.length > 0
    ? player.revealedCards : null;
  const showBacks = !showFaceCards && !liveRevealed && player.hasCards;

  // Sıra halkası: kalan sürenin oranı → conic-gradient derecesi
  const frac = turnDuration > 0 ? Math.max(0, Math.min(1, timeLeft / turnDuration)) : 0;
  const ringStyle = { '--turn-deg': `${frac * 360}deg` };
  const danger = timeLeft <= 5;

  const classes = [
    'pk-seat',
    isCurrentTurn ? 'active' : '',
    isFolded ? 'folded' : '',
    player.disconnected ? 'disconnected' : '',
    isWinner ? 'winner' : '',
    isMe ? 'me' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} style={wrapperStyle} data-seat-player={player.id}>
      {/* Kartlar (koltuğun üstünde) */}
      <div className="pk-seat-cards">
        {showFaceCards && faceCards.map((c, i) => (
          <Card key={i} card={c} size="sm" highlight={isMe && !!highlightKeys?.has(cardKey(c))} />
        ))}
        {showBacks && <><CardBack /><CardBack /></>}
        {liveRevealed && liveRevealed.map((c, i) => <MiniCard key={i} card={c} />)}
      </div>

      {/* Avatar + sıra halkası */}
      <div className={`pk-seat-avatar-wrap ${isCurrentTurn ? 'ticking' : ''} ${danger ? 'danger' : ''}`} style={ringStyle}>
        <div
          className="pk-seat-avatar"
          style={avatarError ? { background: `hsl(${avatarHue(player.username)}, 45%, 42%)` } : undefined}
        >
          {avatarError ? (
            (player.username || '?').charAt(0).toUpperCase()
          ) : (
            <img
              className="pk-seat-avatar-img"
              src={avatarUrl(player.id, isMyId ? avatarVersion : undefined)}
              alt={player.username}
              draggable={false}
              onError={() => setAvatarError(true)}
            />
          )}
        </div>
        {player.isDealer && <span className="pk-badge dealer" title="Dealer">D</span>}
        {player.isSB && <span className="pk-badge sb" title="Small Blind">SB</span>}
        {player.isBB && <span className="pk-badge bb" title="Big Blind">BB</span>}
        {/* 🍵🥛 Kalıcı ısmarlama yuvası: uçuşun konma noktası; SON gönderilen öğe durur
            (yenisi eskisini ezer), oyuncu masadan kalkana kadar. Boşken de render edilir. */}
        {!player.left && (
          <div className="pk-seat-teas" data-tea-rest={player.id} title={TREATS[treat]?.name}>
            {TREATS[treat] && <img src={TREATS[treat].img} alt={TREATS[treat].name} draggable={false} />}
          </div>
        )}
        {/* ➕ Ismarlama butonu: modal açar (şimdilik tek ürün: çay) */}
        {onOpenTreat && !player.left && (
          <button
            className="pk-treat-btn"
            data-treat-btn={player.id}
            onClick={(e) => { e.stopPropagation(); onOpenTreat({ id: player.id, username: player.username }); }}
            title={isMe ? 'Kendine ısmarla' : `${player.username} için ısmarla`}
            aria-label={isMe ? 'Kendine ısmarla' : `${player.username} için ısmarla`}
          >+</button>
        )}
      </div>

      {/* İsim + stack */}
      <div className="pk-seat-plate">
        <div className="pk-seat-name">{player.username}{isMyId ? ' (Siz)' : ''}</div>
        <div className="pk-seat-stack">{player.chips} {chipIcon}</div>
        {badge && <div className={`pk-seat-status ${badge.cls}`}>{badge.text}</div>}
        {isCurrentTurn && <div className={`pk-seat-timer ${danger ? 'danger' : ''}`}>⏳ {timeLeft}s</div>}
      </div>
    </div>
  );
}

export default Seat;
