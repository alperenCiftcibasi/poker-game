import React, { useState, useEffect, useRef } from 'react';
import '../styles/table.css';
import '../styles/banners.css';

import { Card } from './table/Card';
import TableFelt from './table/TableFelt';
import Seat from './table/Seat';
import BetChips from './table/BetChips';
import CommunityCards from './table/CommunityCards';
import PotDisplay from './table/PotDisplay';
import ActionBar from './table/ActionBar';
import ShowMuckBar from './table/ShowMuckBar';
import GameLog from './table/GameLog';
import ChatPanel from './table/ChatPanel';
import HandBanners from './table/HandBanners';
import SettingsPanel from './table/SettingsPanel';
import { getSeatPositions, assignSeats } from './table/seatLayout';

const SETTING_LABELS = {
  smallBlind: 'Small Blind',
  bigBlind: 'Big Blind',
  minBuyIn: 'Min Buy-In',
  maxBuyIn: 'Max Buy-In',
  turnTimerDuration: 'Tur Süresi'
};

function TablePage({
  tableState, myCards, myHandRank, myInfo, onAction, onStartGame, onSit, onLeave, onGoLobby,
  onRevealCards, onShowMuckDecision, revealMessages, activeProposal, voteResult,
  onProposeSettingChange, onVote, gameLog, chatMessages, onSendChat
}) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  // Log/sohbet paneli aç/kapa tercihi localStorage'da hatırlanır (bkz. poker_muted deseni)
  const [showLog, setShowLog] = useState(() => localStorage.getItem('poker_showlog') === '1');
  const [showChat, setShowChat] = useState(() => localStorage.getItem('poker_showchat') === '1');
  const [chatUnread, setChatUnread] = useState(0);
  const seenChatLenRef = useRef((chatMessages || []).length);

  // Güvenli veri okuma
  const turnEndTime = tableState?.turnEndTime || null;
  const players = tableState?.players || [];
  const communityCards = tableState?.communityCards || [];
  const winners = tableState?.winners || [];
  const gameState = tableState?.gameState || 'waiting';
  const pot = tableState?.pot || 0;
  const currentTurnIndex = tableState?.currentTurnIndex ?? -1;
  const safeMyCards = myCards || [];
  const settings = tableState?.settings || {};
  const maxPlayers = tableState?.maxPlayers || Math.max(2, players.length);

  // Oyuncu durumu
  const myPlayer = players.find(p => p.id === myInfo?.id);
  const amISitting = !!myPlayer;
  const myIndex = players.findIndex(p => p.id === myInfo?.id);
  const currentPlayer = players[currentTurnIndex];
  const isGameActive = !['waiting', 'finished', 'showdown'].includes(gameState);
  const isMyTurn = amISitting && currentPlayer?.id === myInfo?.id && isGameActive;

  // Bahis matematiği (sunucudan gelen betToMatch/minRaiseTo esas)
  const activePlayers = players.filter(p => p.status !== 'folded');
  const maxBetOnTable = activePlayers.length > 0 ? Math.max(0, ...activePlayers.map(p => p.currentBet)) : 0;
  const betToMatch = tableState?.betToMatch ?? maxBetOnTable;
  const callAmount = amISitting ? Math.max(0, betToMatch - (myPlayer?.currentBet || 0)) : 0;
  const minRaiseTo = tableState?.minRaiseTo ?? (betToMatch + (settings.bigBlind || 20));
  const maxRaiseTo = (myPlayer?.currentBet || 0) + (myPlayer?.chips || 0);
  const raiseStep = settings.smallBlind || 10;
  const bigBlind = settings.bigBlind || 20;
  const turnDuration = Math.round((settings.turnTimerDuration || 30000) / 1000);

  // Zamanlayıcı
  useEffect(() => {
    if (!turnEndTime) { setTimeLeft(0); return; }
    const update = () => setTimeLeft(Math.max(0, Math.floor((turnEndTime - Date.now()) / 1000)));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [turnEndTime]);

  // Log/sohbet paneli tercihlerini kalıcı yap
  useEffect(() => {
    localStorage.setItem('poker_showlog', showLog ? '1' : '0');
  }, [showLog]);
  useEffect(() => {
    localStorage.setItem('poker_showchat', showChat ? '1' : '0');
  }, [showChat]);

  // Sohbet kapalıyken gelen mesajları okunmamış say; açıkken sıfırla
  useEffect(() => {
    const len = (chatMessages || []).length;
    if (showChat) {
      seenChatLenRef.current = len;
      setChatUnread(0);
    } else if (len > seenChatLenRef.current) {
      setChatUnread(len - seenChatLenRef.current);
    }
  }, [chatMessages, showChat]);

  // Erken çıkış
  if (!tableState || !myInfo) {
    return <div className="app"><h1>Masa Yükleniyor...</h1></div>;
  }

  const isPendingLeave = myPlayer?.pendingLeave;
  const canChangeSettings = amISitting && (gameState === 'waiting' || gameState === 'finished');

  // El sonu "göster/gösterme" penceresi (herkese aynı anda)
  const showMuckDeciders = tableState?.showMuckDeciders ?? [];
  const isMyShowMuck = amISitting && gameState === 'finished' && showMuckDeciders.includes(myInfo?.id);

  // Koltuk yerleşimi (kendine döndürme: benim koltuğum hep alt-orta)
  const positions = getSeatPositions(maxPlayers);
  const seats = assignSeats(players, maxPlayers, myIndex);

  // Reveal buton görünürlüğü
  const canReveal = isGameActive && myPlayer && safeMyCards.length > 0;

  const sideOpen = showLog || showChat;

  return (
    <div className={`pk-table-page${sideOpen ? ' side-open' : ''}`}>
      <div className="pk-stage-wrap">
        <HandBanners
          gameState={gameState}
          winners={winners}
          isPendingLeave={isPendingLeave}
          revealMessages={revealMessages}
          activeProposal={activeProposal}
          amISitting={amISitting}
          myInfo={myInfo}
          players={players}
          voteResult={voteResult}
          onVote={onVote}
          settingLabels={SETTING_LABELS}
        />

        <div className="pk-table-head">
          <span>Masa #{tableState.id}</span>
          <span className="state">{gameState}</span>
        </div>

        <div className="pk-table-stage">
          <TableFelt>
            <div className="pk-center">
              <PotDisplay pot={pot} />
              <CommunityCards cards={communityCards} />
            </div>
          </TableFelt>

          {seats.map((p, slot) => (
            <React.Fragment key={slot}>
              <Seat
                position={positions[slot]}
                player={p}
                isMe={!!p && p.id === myInfo.id}
                isMyId={!!p && p.id === myInfo.id}
                isCurrentTurn={!!p && ((currentPlayer?.id === p.id && isGameActive) ||
                  (gameState === 'finished' && showMuckDeciders.includes(p.id)))}
                timeLeft={timeLeft}
                turnDuration={!!p && gameState === 'finished' && showMuckDeciders.includes(p.id) ? 12 : turnDuration}
                gameState={gameState}
                faceCards={p && p.id === myInfo.id ? safeMyCards : (p ? p.cards : [])}
                isWinner={gameState === 'finished' && !!p && winners.includes(p.username)}
              />
              {p && <BetChips position={positions[slot]} amount={p.currentBet} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="pk-bottom">
        {/* Kendi elin: rank + kart açma */}
        {amISitting ? (
          <div className="pk-myhand">
            <span className="pk-myhand-label">ELİNİZ</span>
            {gameState === 'waiting' ? (
              <span className="pk-myhand-waiting">Oyunun başlaması bekleniyor…</span>
            ) : safeMyCards.length > 0 ? (
              <>
                <div className="pk-myhand-cards">
                  {safeMyCards.map((c, i) => <Card key={i} card={c} size="sm" />)}
                </div>
                {myHandRank && <span className="pk-myhand-rank">🎯 {myHandRank}</span>}
                {canReveal && (
                  <div className="pk-reveal-buttons">
                    {!myPlayer.revealedIndices?.includes(0) && safeMyCards[0] && (
                      <button className="pk-btn-reveal" onClick={() => onRevealCards([0])}>👁 1. Kart</button>
                    )}
                    {!myPlayer.revealedIndices?.includes(1) && safeMyCards[1] && (
                      <button className="pk-btn-reveal" onClick={() => onRevealCards([1])}>👁 2. Kart</button>
                    )}
                    {!myPlayer.revealedIndices?.includes(0) && !myPlayer.revealedIndices?.includes(1) && safeMyCards.length === 2 && (
                      <button className="pk-btn-reveal" onClick={() => onRevealCards([0, 1])}>👁 İkisi</button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <span className="pk-myhand-waiting">Kart dağıtılmadı</span>
            )}
          </div>
        ) : (
          <div className="pk-spectator">👀 Şu an izleyicisiniz</div>
        )}

        {/* El sonu: kart göster/gösterme kararı (sıra bende) */}
        {isMyShowMuck && (
          <ShowMuckBar onDecision={onShowMuckDecision} timeLeft={timeLeft} />
        )}

        {/* Aksiyon çubuğu (sıra bende) */}
        {isMyTurn && (
          <ActionBar
            onAction={onAction}
            callAmount={callAmount}
            betToMatch={betToMatch}
            myChips={myPlayer.chips}
            minRaiseTo={minRaiseTo}
            maxRaiseTo={maxRaiseTo}
            raiseStep={raiseStep}
            bigBlind={bigBlind}
            pot={pot}
            timeLeft={timeLeft}
            turnDuration={turnDuration}
          />
        )}

        {/* Kontroller */}
        <div className="pk-controls">
          {!amISitting && (
            <button className="pk-ctrl-btn sit" onClick={onSit} disabled={isGameActive}>
              {isGameActive ? '🔒 Oyun sürüyor (bekleyin)' : '🪑 Masaya Otur'}
            </button>
          )}
          {amISitting && (
            <button className={`pk-ctrl-btn ${isPendingLeave ? 'pending' : 'leave'}`} onClick={onLeave}>
              {isPendingLeave ? '🔄 Ayrılmayı İptal Et' : '👋 Masadan Kalk'}
            </button>
          )}
          {amISitting && gameState === 'waiting' && players.length >= 2 && (
            <button className="pk-ctrl-btn start" onClick={onStartGame}>🎲 Oyunu Başlat</button>
          )}
          {canChangeSettings && !activeProposal && (
            <button className="pk-ctrl-btn settings" onClick={() => setShowSettingsPanel(s => !s)}>
              {showSettingsPanel ? 'Paneli Kapat' : '⚙️ Masa Ayarları'}
            </button>
          )}
          <button className={`pk-ctrl-btn log ${showLog ? 'active' : ''}`} onClick={() => setShowLog(s => !s)}>
            {showLog ? '📜 Logu Gizle' : '📜 Oyun Akışı'}
          </button>
          <button className={`pk-ctrl-btn chat ${showChat ? 'active' : ''}`} onClick={() => setShowChat(s => !s)}>
            {showChat ? '💬 Sohbeti Gizle' : '💬 Sohbet'}
            {!showChat && chatUnread > 0 && (
              <span className="pk-chat-badge">{chatUnread > 9 ? '9+' : chatUnread}</span>
            )}
          </button>
          <button className="pk-ctrl-btn lobby" onClick={onGoLobby}
            title={amISitting && isGameActive ? 'El bitince masadan ayrılırsınız' : 'Lobiye dön'}>
            🏠 Lobiye Dön
          </button>
        </div>

        {showSettingsPanel && canChangeSettings && !activeProposal && (
          <SettingsPanel
            settings={settings}
            settingLabels={SETTING_LABELS}
            onProposeSettingChange={onProposeSettingChange}
            onClose={() => setShowSettingsPanel(false)}
          />
        )}
      </div>

      {sideOpen && (
        <div className="pk-side">
          {showLog && <GameLog entries={gameLog || []} onClose={() => setShowLog(false)} />}
          {showChat && (
            <ChatPanel
              messages={chatMessages || []}
              myId={myInfo?.id}
              onSend={onSendChat}
              onClose={() => setShowChat(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default TablePage;
