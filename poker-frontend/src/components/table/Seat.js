import React from 'react';
import { Card, MiniCard, CardBack } from './Card';

// Kullanıcı adından tutarlı bir avatar rengi üret
function avatarHue(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function statusBadge(player, gameState) {
  if (player.disconnected) return { text: '📴 Bağlantı koptu', cls: 'off' };
  if (gameState === 'finished' && player.pendingLeave) return { text: '🚪 Kalktı', cls: 'leave' };
  if (player.pendingLeave) return { text: '⚠️ Ayrılıyor', cls: 'leave' };
  if (player.status === 'all-in') return { text: '🔥 ALL-IN', cls: 'allin' };
  if (player.status === 'folded') return { text: 'Fold', cls: 'folded' };
  return null;
}

function Seat({
  position, player, isMe, isMyId, isCurrentTurn, timeLeft, turnDuration,
  gameState, faceCards, isWinner
}) {
  const wrapperStyle = { left: `${position.left}%`, top: `${position.top}%` };

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
    <div className={classes} style={wrapperStyle}>
      {/* Kartlar (koltuğun üstünde) */}
      <div className="pk-seat-cards">
        {showFaceCards && faceCards.map((c, i) => <Card key={i} card={c} size="sm" />)}
        {showBacks && <><CardBack /><CardBack /></>}
        {liveRevealed && liveRevealed.map((c, i) => <MiniCard key={i} card={c} />)}
      </div>

      {/* Avatar + sıra halkası */}
      <div className={`pk-seat-avatar-wrap ${isCurrentTurn ? 'ticking' : ''} ${danger ? 'danger' : ''}`} style={ringStyle}>
        <div className="pk-seat-avatar" style={{ background: `hsl(${avatarHue(player.username)}, 45%, 42%)` }}>
          {(player.username || '?').charAt(0).toUpperCase()}
        </div>
        {player.isDealer && <span className="pk-badge dealer" title="Dealer">D</span>}
        {player.isSB && <span className="pk-badge sb" title="Small Blind">SB</span>}
        {player.isBB && <span className="pk-badge bb" title="Big Blind">BB</span>}
      </div>

      {/* İsim + stack */}
      <div className="pk-seat-plate">
        <div className="pk-seat-name">{player.username}{isMyId ? ' (Siz)' : ''}</div>
        <div className="pk-seat-stack">{player.chips} 🍪</div>
        {badge && <div className={`pk-seat-status ${badge.cls}`}>{badge.text}</div>}
        {isCurrentTurn && <div className={`pk-seat-timer ${danger ? 'danger' : ''}`}>⏳ {timeLeft}s</div>}
      </div>
    </div>
  );
}

export default Seat;
