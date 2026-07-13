import React, { useState, useEffect } from 'react';

const Card = ({ card }) => {
    if (!card) return null;
    const suitIcons = { 'hearts': '♥️', 'diamonds': '♦️', 'clubs': '♣️', 'spades': '♠️' };
    const suitColor = (card.suit === 'hearts' || card.suit === 'diamonds') ? 'red' : 'black';
    const rank = card.rank === 'T' ? '10' : card.rank;
    return <span className={`card ${suitColor}`}>{rank}{suitIcons[card.suit]}</span>;
};

const MiniCard = ({ card }) => {
    if (!card) return null;
    const suitIcons = { 'hearts': '♥️', 'diamonds': '♦️', 'clubs': '♣️', 'spades': '♠️' };
    const suitColor = (card.suit === 'hearts' || card.suit === 'diamonds') ? 'red' : 'black';
    const rank = card.rank === 'T' ? '10' : card.rank;
    return <span className={`card-mini ${suitColor}`}>{rank}{suitIcons[card.suit]}</span>;
};

const VoteTimer = ({ expiresAt }) => {
    const [secondsLeft, setSecondsLeft] = useState(0);
    useEffect(() => {
        const update = () => setSecondsLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [expiresAt]);
    return <span style={{ color: secondsLeft <= 5 ? '#e74c3c' : '#f1c40f', fontWeight: 'bold', fontSize: '20px' }}>{secondsLeft}s</span>;
};

function TablePage({ tableState, myCards, myHandRank, myInfo, onAction, onStartGame, onSit, onLeave, onRevealCards, revealMessages, activeProposal, voteResult, onProposeSettingChange, onVote }) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [raiseAmount, setRaiseAmount] = useState(50);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [selectedSetting, setSelectedSetting] = useState('smallBlind');
  const [proposedValue, setProposedValue] = useState('');

  // 🛠️ HATA ÇÖZÜMÜ: Tüm verileri GÜVENLİ bir şekilde alıyoruz (undefined ise[] yap)
  const turnEndTime = tableState?.turnEndTime || null;
  const players = tableState?.players ||[];
  const communityCards = tableState?.communityCards || [];
  const winners = tableState?.winners ||[];
  const gameState = tableState?.gameState || 'waiting';
  const pot = tableState?.pot || 0;
  const currentTurnIndex = tableState?.currentTurnIndex ?? -1;
  const safeMyCards = myCards ||[]; // myCards için de güvenlik

  // Oyuncu Durumu Hesaplamaları
  const myPlayer = players.find(p => p.id === myInfo?.id);
  const amISitting = !!myPlayer;
  const currentPlayer = players[currentTurnIndex];
  const isMyTurn = amISitting && currentPlayer?.id === myInfo?.id;

  // Bahis Matematiği (sunucudan gelen betToMatch/minRaiseTo esas alınır)
  const activePlayers = players.filter(p => p.status !== 'folded');
  const maxBetOnTable = activePlayers.length > 0 ? Math.max(0, ...activePlayers.map(p => p.currentBet)) : 0;
  const betToMatch = tableState?.betToMatch ?? maxBetOnTable;
  const callAmount = amISitting ? Math.max(0, betToMatch - (myPlayer?.currentBet || 0)) : 0;

  // Raise değerleri "raise to" (bu sokaktaki toplam bahis) cinsindendir
  const minRaiseTo = tableState?.minRaiseTo ?? (betToMatch + 50);
  const maxRaiseTo = (myPlayer?.currentBet || 0) + (myPlayer?.chips || 0);
  const safeMinRaise = Math.min(minRaiseTo, maxRaiseTo);
  const raiseStep = tableState?.settings?.smallBlind || 10;

  // Zamanlayıcı
  useEffect(() => {
    if (!turnEndTime) { setTimeLeft(0); return; }
    const updateTimer = () => {
        const remaining = Math.max(0, Math.floor((turnEndTime - Date.now()) / 1000));
        setTimeLeft(remaining);
    };
    updateTimer(); 
    const interval = setInterval(updateTimer, 1000); 
    return () => clearInterval(interval); 
  }, [turnEndTime]);

  // Sürgü Resetleme
  useEffect(() => {
    if (isMyTurn) setRaiseAmount(safeMinRaise);
  },[isMyTurn, safeMinRaise]);


  // 🚀 Erken Çıkış (Veri Yoksa Beklet)
  if (!tableState || !myInfo) {
      return <div className="app"><h1>Masa Yükleniyor...</h1></div>;
  }

  const isPendingLeave = myPlayer?.pendingLeave;
  const isGameActive = !['waiting', 'finished', 'showdown'].includes(gameState);

  // Ayar paneli için
  const settings = tableState?.settings || {};
  const canChangeSettings = amISitting && (gameState === 'waiting' || gameState === 'finished');
  const hasVoted = activeProposal && activeProposal.votes && activeProposal.votes[myInfo?.id];
  const settingLabels = {
    smallBlind: 'Small Blind',
    bigBlind: 'Big Blind',
    minBuyIn: 'Min Buy-In',
    maxBuyIn: 'Max Buy-In',
    turnTimerDuration: 'Tur Süresi'
  };

  const handleDecrease = () => setRaiseAmount(prev => Math.max(safeMinRaise, prev - raiseStep));
  const handleIncrease = () => setRaiseAmount(prev => Math.min(maxRaiseTo, prev + raiseStep));
  const handleSliderChange = (e) => setRaiseAmount(Number(e.target.value));

  return (
    <div className="table-page-container">
      <div className="status-header">
        {gameState === 'finished' && winners.length > 0 && (
          <div className="winner-banner">
            🏆 Kazanan: {winners.join(', ')} <br/>
            <small>Sonuçları İnceleyin...</small>
          </div>
        )}
        {isPendingLeave && gameState !== 'finished' && (
          <div className="alert-banner">⏳ Ayrılma isteği alındı. Tur sonunda otomatik kalkacaksınız.</div>
        )}
        {revealMessages && revealMessages.length > 0 && revealMessages.map((msg, i) => (
          <div key={i} className="reveal-banner">
            👁 <strong>{msg.username}</strong> kartını açtı: {msg.revealedCards.map((c, j) => {
              const suitIcons = { 'hearts': '♥️', 'diamonds': '♦️', 'clubs': '♣️', 'spades': '♠️' };
              const r = c.rank === 'T' ? '10' : c.rank;
              return <span key={j} style={{color: (c.suit === 'hearts' || c.suit === 'diamonds') ? '#e74c3c' : '#ecf0f1', fontWeight: 'bold'}}> {r}{suitIcons[c.suit]} </span>;
            })}
          </div>
        ))}

        {activeProposal && amISitting && (
          <div className="vote-banner">
            <div className="vote-info">
              <strong>{activeProposal.proposerUsername}</strong> ayar degisikligi onerdi:
              <br/>
              <span className="vote-detail">
                {settingLabels[activeProposal.setting] || activeProposal.setting}:{' '}
                {activeProposal.setting === 'turnTimerDuration'
                  ? `${activeProposal.currentValue / 1000}s`
                  : activeProposal.currentValue}
                {' → '}
                {activeProposal.setting === 'turnTimerDuration'
                  ? `${activeProposal.proposedValue / 1000}s`
                  : activeProposal.proposedValue}
              </span>
            </div>
            <div className="vote-countdown">
              <VoteTimer expiresAt={activeProposal.expiresAt} />
            </div>
            <div className="vote-progress">
              Oylar: {Object.values(activeProposal.votes || {}).filter(v => v === 'accept').length} Kabul /
              {' '}{Object.values(activeProposal.votes || {}).filter(v => v === 'reject').length} Red /
              {' '}{players.length} Toplam
            </div>
            {!hasVoted && activeProposal.proposerId !== myInfo?.id && (
              <div className="vote-actions">
                <button className="btn-vote btn-accept" onClick={() => onVote('accept')}>Kabul Et</button>
                <button className="btn-vote btn-reject" onClick={() => onVote('reject')}>Reddet</button>
              </div>
            )}
            {hasVoted && (
              <div className="vote-status-text">
                Oyunuz: {activeProposal.votes[myInfo?.id] === 'accept' ? 'Kabul' : 'Red'}
              </div>
            )}
            {activeProposal.proposerId === myInfo?.id && (
              <div className="vote-status-text">Sizin oneriniz (otomatik kabul)</div>
            )}
          </div>
        )}

        {voteResult && (
          <div className={`vote-result-banner ${voteResult.passed ? 'vote-passed' : 'vote-rejected'}`}>
            {voteResult.passed
              ? `Oylama Kabul Edildi! ${settingLabels[voteResult.setting] || voteResult.setting}: ${
                  voteResult.setting === 'turnTimerDuration' ? (voteResult.newValue / 1000) + 's' : voteResult.newValue
                }`
              : voteResult.cancelled
                ? 'Oylama iptal edildi.'
                : `Oylama Reddedildi. ${settingLabels[voteResult.setting] || voteResult.setting} degismedi.`
            }
          </div>
        )}
      </div>

      <div className="main-layout">
        <div className="poker-table">
          <div className="table-info">
            <h3>Masa #{tableState.id} - {gameState.toUpperCase()}</h3>
            <div className="pot-display">POT: {pot}</div>
          </div>

          <div className="community-cards-area">
            {communityCards.length > 0 ? (
              communityCards.map((card, i) => <Card key={i} card={card} />)
            ) : <div className="empty-cards">Kartlar Bekleniyor...</div>}
          </div>

          <div className="table-controls">
            {!amISitting && (
              <button className="btn-action btn-sit" onClick={onSit} disabled={isGameActive}>
                {isGameActive ? '🔒 Oyun Sürüyor (Bekleyin)' : '🪑 Masaya Otur'}
              </button>
            )}
            {amISitting && (
              <button className={`btn-action ${isPendingLeave ? 'btn-pending' : 'btn-leave'}`} onClick={onLeave}>
                {isPendingLeave ? '🔄 Masadan Ayrılmayı İptal Et' : '👋 Masadan Kalk'}
              </button>
            )}
            {amISitting && gameState === 'waiting' && players.length >= 2 && (
              <button className="btn-action btn-start" onClick={onStartGame}>🎲 OYUNU BAŞLAT</button>
            )}
            {canChangeSettings && !activeProposal && (
              <button className="btn-action btn-settings" onClick={() => setShowSettingsPanel(prev => !prev)}>
                {showSettingsPanel ? 'Paneli Kapat' : 'Masa Ayarlari'}
              </button>
            )}
          </div>

          {showSettingsPanel && canChangeSettings && !activeProposal && (
            <div className="settings-panel">
              <h4>Masa Ayarlari</h4>
              <div className="setting-rows">
                {Object.entries(settingLabels).map(([key, label]) => (
                  <div key={key} className="setting-row">
                    <span className="setting-label">{label}:</span>
                    <span className="setting-value">
                      {key === 'turnTimerDuration'
                        ? `${(settings[key] || 0) / 1000}s`
                        : settings[key] ?? '-'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="setting-form">
                <select
                  className="setting-select"
                  value={selectedSetting}
                  onChange={(e) => setSelectedSetting(e.target.value)}
                >
                  {Object.entries(settingLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  className="setting-input"
                  placeholder={selectedSetting === 'turnTimerDuration' ? 'Saniye' : 'Yeni deger'}
                  value={proposedValue}
                  onChange={(e) => setProposedValue(e.target.value)}
                />
                <button
                  className="btn-action btn-propose"
                  disabled={!proposedValue}
                  onClick={() => {
                    let val = Number(proposedValue);
                    if (selectedSetting === 'turnTimerDuration') val = val * 1000;
                    onProposeSettingChange(selectedSetting, val);
                    setProposedValue('');
                    setShowSettingsPanel(false);
                  }}
                >
                  Oneri Yap
                </button>
              </div>
            </div>
          )}

          {amISitting && (
            <div className="my-area">
              <div className="my-hand-display">
                <p>KARTLARINIZ</p>
                {gameState === 'waiting' ? (
                    <span style={{opacity: 0.5}}>Oyunun başlaması bekleniyor...</span>
                ) : (
                    safeMyCards.length > 0 ? (
                      <>
                        <div style={{marginBottom: '10px'}}>
                          {safeMyCards.map((card, i) => <Card key={i} card={card} />)}
                        </div>
                        {myHandRank && (
                          <div style={{color: '#f1c40f', fontWeight: 'bold', fontSize: '16px', marginTop: '10px', padding: '8px', background: 'rgba(0,0,0,0.4)', borderRadius: '5px'}}>
                            🎯 {myHandRank}
                          </div>
                        )}
                        {isGameActive && myPlayer && (
                          <div className="reveal-buttons">
                            {!myPlayer.revealedIndices?.includes(0) && safeMyCards[0] && (
                              <button className="btn-reveal" onClick={() => onRevealCards([0])}>
                                👁 1. Kartı Göster
                              </button>
                            )}
                            {!myPlayer.revealedIndices?.includes(1) && safeMyCards[1] && (
                              <button className="btn-reveal" onClick={() => onRevealCards([1])}>
                                👁 2. Kartı Göster
                              </button>
                            )}
                            {!myPlayer.revealedIndices?.includes(0) && !myPlayer.revealedIndices?.includes(1) && safeMyCards.length === 2 && (
                              <button className="btn-reveal btn-reveal-both" onClick={() => onRevealCards([0, 1])}>
                                👁 İkisini de Göster
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    ) : <span style={{opacity: 0.5}}>Kart Dağıtılmadı</span>
                )}
              </div>

              {isMyTurn && isGameActive && (
                <div className="action-panel">
                  <div className="primary-actions">
                    <button className="btn-move fold" onClick={() => onAction('fold')}>FOLD</button>
                    
                    <button className="btn-move call" onClick={() => onAction(callAmount > 0 ? 'call' : 'check')}>
                      {callAmount > 0
                        ? (myPlayer.chips <= callAmount ? `CALL ${myPlayer.chips} (ALL-IN)` : `CALL ${callAmount}`)
                        : 'CHECK'}
                    </button>
                  </div>

                  {maxRaiseTo > betToMatch && (
                    <div className="raise-section">
                      <div className="slider-controls">
                        <button className="btn-step" onClick={handleDecrease}>-</button>
                        <input
                          type="range"
                          min={safeMinRaise}
                          max={maxRaiseTo}
                          step={raiseStep}
                          value={raiseAmount}
                          onChange={handleSliderChange}
                          className="raise-slider"
                        />
                        <button className="btn-step" onClick={handleIncrease}>+</button>
                      </div>

                      <button
                        className="btn-move raise btn-raise-confirm"
                        onClick={() => onAction('raise', raiseAmount)}
                      >
                        RAISE {raiseAmount} {raiseAmount >= maxRaiseTo && ' (ALL-IN) 🔥'}
                      </button>
                    </div>
                  )}

                  <div style={{marginTop: '15px', color: timeLeft <= 10 ? '#e74c3c' : '#f1c40f', fontWeight: 'bold', fontSize: '18px'}}>
                      ⏳ Kalan Süreniz: {timeLeft} saniye
                  </div>
                </div>
              )}
            </div>
          )}
          {!amISitting && <div className="spectator-tag">👀 Şu an izleyicisiniz</div>}
        </div>

        <div className="player-sidebar">
          <h3>OYUNCULAR ({players.length})</h3>
          <div className="player-list">
            {players.map(p => {
              const active = currentPlayer?.id === p.id && isGameActive;
              let statusText = p.status.toUpperCase();
              if (p.disconnected) statusText = '📴 BAĞLANTI KOPTU';
              else if (gameState === 'finished' && p.pendingLeave) statusText = '🚪 MASADAN KALKTI';
              else if (p.pendingLeave) statusText = '⚠️ AYRILIYOR';
              else if (p.status === 'all-in') statusText = '🔥 ALL-IN';

              return (
                <div key={p.id} className={`player-card ${active ? 'active' : ''} ${p.status === 'folded' ? 'folded' : ''} ${p.disconnected ? 'disconnected' : ''}`}>
                  <div className="p-info">
                    <span className="p-name">{p.username} {p.id === myInfo.id ? '(Siz)' : ''}</span>
                    <span className="p-chips">{p.chips} 🍪</span>
                  </div>
                  <div className="p-status" style={{ color: p.status === 'all-in' ? '#e74c3c' : '#bdc3c7' }}>
                    {statusText}
                  </div>
                  {active && <div className="p-timer" style={{ color: timeLeft <= 10 ? '#e74c3c' : '#2ecc71', fontWeight: 'bold', fontSize: '14px', marginTop: '5px' }}>⏳ {timeLeft} sn</div>}
                  {p.currentBet > 0 && <div className="p-bet">Bahis: {p.currentBet}</div>}
                  
                  {/* Güvenli kart gösterimi p.cards ||[] */}
                  {(gameState === 'finished' || gameState === 'showdown') && (
                    <div className="p-reveal">
                      <div className="p-hand-name">{p.handDescription}</div>
                      <div className="p-cards">{(p.cards ||[]).map((c, i) => <MiniCard key={i} card={c} />)}</div>
                    </div>
                  )}
                  {/* Oyun sırasında açılan kartlar */}
                  {isGameActive && p.revealedCards && p.revealedCards.length > 0 && (
                    <div className="p-reveal revealed-live">
                      <div className="p-hand-name" style={{color: '#e74c3c'}}>👁 Açık Kart{p.revealedCards.length > 1 ? 'lar' : ''}</div>
                      <div className="p-cards">{p.revealedCards.map((c, i) => <MiniCard key={i} card={c} />)}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = `
  .table-page-container { max-width: 1200px; margin: auto; padding: 20px; }
  .main-layout { display: flex; gap: 20px; }
  .poker-table { flex: 3; background: #1a4a1a; border: 12px solid #3d2b1f; border-radius: 100px; padding: 40px; text-align: center; position: relative; min-height: 500px; box-shadow: inset 0 0 50px rgba(0,0,0,0.5); }
  .player-sidebar { flex: 1; background: #2c3e50; padding: 15px; border-radius: 10px; border: 2px solid #34495e; min-width: 250px; }
  .winner-banner { background: #8e44ad; color: white; padding: 15px; border-radius: 10px; margin-bottom: 15px; font-size: 20px; font-weight: bold; }
  .alert-banner { background: #e67e22; color: white; padding: 10px; border-radius: 5px; margin-bottom: 15px; animation: pulse 2s infinite; }
  .pot-display { font-size: 32px; color: #f1c40f; font-weight: bold; margin: 10px 0; }
  .community-cards-area { min-height: 100px; margin: 30px 0; display: flex; justify-content: center; gap: 10px; }
  .empty-cards { border: 2px dashed rgba(255,255,255,0.2); padding: 20px; border-radius: 10px; color: rgba(255,255,255,0.3); }
  .card { background: white; color: black; padding: 10px 15px; border-radius: 8px; font-size: 28px; font-weight: bold; display: inline-block; box-shadow: 2px 2px 5px rgba(0,0,0,0.3); }
  .card-mini { background: white; color: black; padding: 2px 5px; border-radius: 4px; font-size: 14px; margin: 1px; display: inline-block; font-weight: bold; }
  .red { color: #e74c3c; } .black { color: #2c3e50; }
  .btn-action { padding: 12px 24px; font-size: 18px; font-weight: bold; cursor: pointer; border: none; border-radius: 5px; color: white; transition: 0.3s; margin: 0 5px; }
  .btn-sit { background: #27ae60; } .btn-leave { background: #c0392b; }
  .btn-pending { background: #d35400; box-shadow: 0 0 10px #e67e22; }
  .btn-start { background: #2980b9; width: 100%; margin-top: 10px; }
  .btn-action:disabled { background: #7f8c8d; cursor: not-allowed; opacity: 0.7; }
  .my-area { margin-top: 40px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 20px; }
  .action-panel { margin-top: 20px; }
  .primary-actions { display: flex; justify-content: center; gap: 15px; margin-bottom: 15px; }
  .btn-move { padding: 15px 30px; font-weight: bold; font-size: 16px; cursor: pointer; border: none; border-radius: 8px; color: white; flex: 1; transition: 0.2s; }
  .fold { background: #7f8c8d; } .fold:hover { background: #95a5a6; }
  .call { background: #2ecc71; } .call:hover { background: #27ae60; }
  .raise { background: #f1c40f; color: #000; } .raise:hover { background: #f39c12; }
  .raise-section { background: rgba(0,0,0,0.4); padding: 15px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); }
  .slider-controls { display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; }
  .raise-slider { flex: 1; margin: 0 20px; cursor: pointer; height: 8px; background: #ddd; border-radius: 5px; outline: none; -webkit-appearance: none; }
  .raise-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 25px; height: 25px; border-radius: 50%; background: #f1c40f; cursor: pointer; }
  .btn-step { background: #34495e; color: white; border: none; width: 40px; height: 40px; font-size: 24px; font-weight: bold; border-radius: 5px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; }
  .btn-step:hover { background: #2c3e50; }
  .btn-raise-confirm { width: 100%; font-size: 18px; padding: 12px; }
  .player-card { background: #34495e; padding: 10px; margin-bottom: 10px; border-radius: 8px; border-left: 5px solid transparent; transition: 0.3s; text-align: left; }
  .player-card.active { border-left-color: #f1c40f; background: #4e6a85; transform: scale(1.02); }
  .player-card.folded { opacity: 0.5; }
  .player-card.disconnected { opacity: 0.55; border-left-color: #7f8c8d; filter: grayscale(0.6); }
  .p-info { display: flex; justify-content: space-between; font-weight: bold; }
  .p-chips { color: #f1c40f; }
  .p-status { font-size: 11px; margin-top: 5px; color: #bdc3c7; font-weight: bold; }
  .p-bet { background: rgba(0,0,0,0.2); margin-top: 5px; padding: 2px 5px; border-radius: 4px; color: #2ecc71; font-size: 13px; display: inline-block; }
  .p-reveal { border-top: 1px solid rgba(255,255,255,0.1); margin-top: 8px; padding-top: 8px; text-align: center; }
  .p-hand-name { color: #f1c40f; font-weight: bold; font-size: 13px; margin-bottom: 5px; }
  .spectator-tag { margin-top: 20px; color: #bdc3c7; font-style: italic; }
  .reveal-buttons { display: flex; gap: 8px; justify-content: center; margin-top: 12px; flex-wrap: wrap; }
  .btn-reveal { background: rgba(231, 76, 60, 0.2); border: 1px solid #e74c3c; color: #e74c3c; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; transition: 0.2s; }
  .btn-reveal:hover { background: #e74c3c; color: white; }
  .btn-reveal-both { border-color: #e67e22; color: #e67e22; background: rgba(230, 126, 34, 0.2); }
  .btn-reveal-both:hover { background: #e67e22; color: white; }
  .reveal-banner { background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 12px 18px; border-radius: 10px; margin-bottom: 10px; font-size: 16px; animation: slideIn 0.3s ease-out; }
  .revealed-live { border-top: 1px solid rgba(231, 76, 60, 0.4); margin-top: 8px; padding-top: 8px; text-align: center; animation: revealGlow 1s ease-out; }
  @keyframes slideIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes revealGlow { 0% { box-shadow: 0 0 15px rgba(231, 76, 60, 0.6); } 100% { box-shadow: none; } }
  @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.7; } 100% { opacity: 1; } }

  /* Ayar Paneli */
  .btn-settings { background: #8e44ad; margin-top: 10px; width: 100%; }
  .btn-settings:hover { background: #9b59b6; }
  .settings-panel { background: rgba(0,0,0,0.6); border: 1px solid #8e44ad; border-radius: 10px; padding: 20px; margin-top: 15px; text-align: left; }
  .settings-panel h4 { color: #f1c40f; margin: 0 0 12px 0; text-align: center; font-size: 16px; }
  .setting-rows { margin-bottom: 15px; }
  .setting-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.1); color: #ecf0f1; font-size: 14px; }
  .setting-label { color: #bdc3c7; }
  .setting-value { color: #f1c40f; font-weight: bold; }
  .setting-form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .setting-select { flex: 1; min-width: 120px; padding: 8px; border-radius: 5px; border: 1px solid #8e44ad; background: #2c3e50; color: #ecf0f1; font-size: 13px; }
  .setting-input { width: 80px; padding: 8px; border-radius: 5px; border: 1px solid #8e44ad; background: #2c3e50; color: #ecf0f1; font-size: 13px; text-align: center; }
  .btn-propose { background: #8e44ad; padding: 8px 16px; font-size: 14px; white-space: nowrap; }
  .btn-propose:hover { background: #9b59b6; }
  .btn-propose:disabled { background: #7f8c8d; cursor: not-allowed; }

  /* Oylama Banner */
  .vote-banner { background: linear-gradient(135deg, #2c3e50, #34495e); border: 2px solid #f1c40f; border-radius: 10px; padding: 15px; margin-bottom: 15px; text-align: center; animation: slideIn 0.3s ease-out; }
  .vote-info { color: #ecf0f1; font-size: 14px; margin-bottom: 8px; }
  .vote-detail { color: #f1c40f; font-weight: bold; font-size: 16px; }
  .vote-countdown { margin: 8px 0; }
  .vote-progress { color: #bdc3c7; font-size: 13px; margin-bottom: 10px; }
  .vote-actions { display: flex; gap: 10px; justify-content: center; }
  .btn-vote { padding: 10px 24px; font-weight: bold; font-size: 14px; cursor: pointer; border: none; border-radius: 6px; color: white; transition: 0.2s; }
  .btn-accept { background: #27ae60; }
  .btn-accept:hover { background: #2ecc71; }
  .btn-reject { background: #c0392b; }
  .btn-reject:hover { background: #e74c3c; }
  .vote-status-text { color: #bdc3c7; font-style: italic; font-size: 13px; margin-top: 5px; }

  /* Oylama Sonucu */
  .vote-result-banner { padding: 12px; border-radius: 10px; margin-bottom: 15px; font-weight: bold; font-size: 16px; text-align: center; animation: slideIn 0.3s ease-out; }
  .vote-passed { background: #27ae60; color: white; }
  .vote-rejected { background: #c0392b; color: white; }
`;
const styleSheet = document.createElement("style"); styleSheet.innerText = styles; document.head.appendChild(styleSheet);

export default TablePage;