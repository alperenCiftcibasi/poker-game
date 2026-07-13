import React, { useState, useEffect } from 'react';

// Oylama geri sayım göstergesi
function VoteTimer({ expiresAt }) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  useEffect(() => {
    const update = () => setSecondsLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  return (
    <span className="pk-vote-timer" style={{ color: secondsLeft <= 5 ? '#e74c3c' : '#f1c40f' }}>{secondsLeft}s</span>
  );
}

const SUIT_ICONS = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };

// Masanın üstündeki tüm bilgi/olay banner'ları (kazanan, ayrılma, kart açma, oylama, oylama sonucu)
function HandBanners({
  gameState, winners, isPendingLeave, revealMessages,
  activeProposal, amISitting, myInfo, players, voteResult, onVote, settingLabels
}) {
  const hasVoted = activeProposal && activeProposal.votes && activeProposal.votes[myInfo?.id];
  const fmt = (setting, value) =>
    setting === 'turnTimerDuration' ? `${value / 1000}s` : value;

  return (
    <div className="pk-banners">
      {gameState === 'finished' && winners.length > 0 && (
        <div className="pk-banner winner">🏆 Kazanan: {winners.join(', ')}</div>
      )}

      {isPendingLeave && gameState !== 'finished' && (
        <div className="pk-banner alert">⏳ Ayrılma isteği alındı. Tur sonunda kalkacaksınız.</div>
      )}

      {revealMessages && revealMessages.map((msg, i) => (
        <div key={i} className="pk-banner reveal">
          👁 <strong>{msg.username}</strong> kart açtı:{' '}
          {msg.revealedCards.map((c, j) => (
            <span key={j} style={{ color: (c.suit === 'hearts' || c.suit === 'diamonds') ? '#ff6b6b' : '#ecf0f1', fontWeight: 'bold' }}>
              {' '}{c.rank === 'T' ? '10' : c.rank}{SUIT_ICONS[c.suit]}
            </span>
          ))}
        </div>
      ))}

      {activeProposal && amISitting && (
        <div className="pk-banner vote">
          <div className="pk-vote-info">
            <strong>{activeProposal.proposerUsername}</strong> ayar değişikliği önerdi:{' '}
            <span className="pk-vote-detail">
              {settingLabels[activeProposal.setting] || activeProposal.setting}:{' '}
              {fmt(activeProposal.setting, activeProposal.currentValue)} → {fmt(activeProposal.setting, activeProposal.proposedValue)}
            </span>
          </div>
          <div className="pk-vote-meta">
            <VoteTimer expiresAt={activeProposal.expiresAt} />
            <span className="pk-vote-progress">
              {Object.values(activeProposal.votes || {}).filter(v => v === 'accept').length} Kabul /
              {' '}{Object.values(activeProposal.votes || {}).filter(v => v === 'reject').length} Red /
              {' '}{players.length} Toplam
            </span>
          </div>
          {!hasVoted && activeProposal.proposerId !== myInfo?.id && (
            <div className="pk-vote-actions">
              <button className="pk-btn-vote accept" onClick={() => onVote('accept')}>Kabul</button>
              <button className="pk-btn-vote reject" onClick={() => onVote('reject')}>Red</button>
            </div>
          )}
          {hasVoted && (
            <div className="pk-vote-status">Oyunuz: {activeProposal.votes[myInfo?.id] === 'accept' ? 'Kabul' : 'Red'}</div>
          )}
          {activeProposal.proposerId === myInfo?.id && (
            <div className="pk-vote-status">Sizin öneriniz (otomatik kabul)</div>
          )}
        </div>
      )}

      {voteResult && (
        <div className={`pk-banner vote-result ${voteResult.passed ? 'passed' : 'rejected'}`}>
          {voteResult.passed
            ? `✅ Oylama kabul edildi! ${settingLabels[voteResult.setting] || voteResult.setting}: ${fmt(voteResult.setting, voteResult.newValue)}`
            : voteResult.cancelled
              ? '⚪ Oylama iptal edildi.'
              : `❌ Oylama reddedildi. ${settingLabels[voteResult.setting] || voteResult.setting} değişmedi.`}
        </div>
      )}
    </div>
  );
}

export default HandBanners;
