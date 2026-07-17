import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import io from 'socket.io-client';
import './App.css';

import LoginPage from './components/LoginPage';
import LobbyPage from './components/LobbyPage';
import TablePage from './components/TablePage';
import LeaderboardModal from './components/LeaderboardModal';
import AdminPanel from './components/AdminPanel';
import BuyInModal from './components/BuyInModal';
import { SERVER_URL } from './config';
import { playSound, isMuted, toggleMute } from './utils/sounds';

// Aksiyon logu için Türkçe etiketler (Faz 4.4)
function formatAction(username, action, amount) {
  if (action === 'raise') return `${username} ${amount}'e yükseltti`;
  if (action === 'call') return `${username} gördü`;
  if (action === 'check') return `${username} pas geçti`;
  if (action === 'fold') return `${username} çekildi`;
  return `${username} ${action}`;
}

function App() {
  const [socket, setSocket] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // connecting | connected | disconnected
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('poker_token') || '');
  const [tableState, setTableState] = useState(null);
  const [myCards, setMyCards] = useState([]);
  const [myHandRank, setMyHandRank] = useState('');
  const [revealMessages, setRevealMessages] = useState([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState(null); // null = henüz yüklenmedi
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [activeProposal, setActiveProposal] = useState(null);
  const [voteResult, setVoteResult] = useState(null);
  const [showBuyInModal, setShowBuyInModal] = useState(false);
  const [buyInBank, setBuyInBank] = useState(null); // null = bakiye yükleniyor
  const [gameLog, setGameLog] = useState([]); // Faz 4.4: aksiyon/olay logu
  const [muted, setMuted] = useState(isMuted()); // Faz 5: ses aç/kapa
  const winnerKeyRef = useRef(''); // aynı elin kazananını loga bir kez ekle
  const myIdRef = useRef(null);    // socket dinleyicileri için taze kullanıcı id'si
  const wasMyTurnRef = useRef(false); // sıra sesini sadece geçişte çal

  const navigate = useNavigate();
  const location = useLocation();

  // Socket dinleyicileri closure'da eski user'ı yakalamasın diye id'yi ref'te tut
  myIdRef.current = user?.id ?? null;

  // --- 1. ETKİ: AUTH GUARD (GİRİŞ KONTROLÜ VE YÖNLENDİRME) ---
  // Bu efekt sadece giriş yapılıp yapılmadığını ve token geçerliliğini kontrol eder.
  useEffect(() => {
    if (!token) {
      if (location.pathname !== '/login') {
        navigate('/login');
      }
    } else {
      // Token varsa ama login sayfasına gidilmişse, lobby'ye yönlendir
      if (location.pathname === '/login') {
        navigate('/lobby');
        return;
      }
      
      try {
        // LocalStorage'dan kullanıcı bilgisini al
        const savedUser = localStorage.getItem('poker_user');
        if (savedUser) {
          setUser(JSON.parse(savedUser));
        } else {
          // Eğer yoksa token'dan decode et (geriye dönük uyumluluk)
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
          }).join(''));
          const decodedToken = JSON.parse(jsonPayload);
          setUser({ id: decodedToken.id, username: decodedToken.username, isAdmin: false });
        }
      } catch (e) {
        localStorage.removeItem('poker_token');
        localStorage.removeItem('poker_user');
        setToken('');
        navigate('/login');
      }
    }
  }, [token, navigate, location.pathname]);

  // --- 2. ETKİ: SOCKET YÖNETİMİ ---
  // Bu efekt sadece SOCKET bağlantısını yönetir. Sayfa değişince kopmaz.
  useEffect(() => {
    let newSocket = null;

    if (token) {
      // transports: sadece websocket. Varsayılan long-polling ile başlayıp yükseltiyor;
      // polling'de kalırsa oyuncu başına ~25 sn'de bir HTTP isteği atar ve tünelin
      // (ngrok) aylık istek kotasını eritir. WebSocket'te tüm oyun trafiği tek istek sayılır.
      newSocket = io(SERVER_URL, { auth: { token }, transports: ['websocket'] });
      setSocket(newSocket);
      setConnectionStatus('connecting');

      // Loga yeni satır ekle (en yeni üstte, son 50 kayıt)
      const addLog = (kind, text) =>
        setGameLog(prev => [{ id: Date.now() + Math.random(), kind, text }, ...prev].slice(0, 50));

      // B17: Gerçek bağlantı durumu takibi + otomatik yeniden bağlanma sonrası masaya geri katılma
      newSocket.on('connect', () => {
        setConnectionStatus('connected');
        // Masadaysak yeniden bağlanınca gizli kartlar/masa state'i geri gelsin
        if (window.location.pathname.startsWith('/table/')) {
          const tableId = window.location.pathname.split('/')[2];
          newSocket.emit('viewTable', tableId);
        }
      });
      newSocket.on('disconnect', () => setConnectionStatus('disconnected'));
      newSocket.on('connect_error', (err) => {
        setConnectionStatus('disconnected');
        // Kimlik doğrulama hatasında token'ı temizle → login'e yönlendir (Efekt 1 halleder)
        if (err && /token/i.test(err.message || '')) {
          localStorage.removeItem('poker_token');
          localStorage.removeItem('poker_user');
          setToken('');
        }
      });

      newSocket.on('tableUpdated', (state) => {
        setTableState(state);
        // Reconnect durumunda proposal senkronizasyonu
        if (state.activeProposal) {
          setActiveProposal(state.activeProposal);
        } else {
          setActiveProposal(null);
        }
        // Kazananı loga bir kez ekle (yeni elde ref sıfırlanır)
        if (state.gameState === 'finished' && state.winners && state.winners.length) {
          const key = state.winners.join(',');
          if (winnerKeyRef.current !== key) {
            winnerKeyRef.current = key;
            addLog('winner', `🏆 Kazanan: ${state.winners.join(', ')}`);
            playSound('win');
          }
        } else if (state.gameState === 'pre-flop') {
          winnerKeyRef.current = '';
        }

        // Sıra sesi: sadece bize sıra GEÇTİĞİNDE bir kez çal
        const active = !['waiting', 'finished', 'showdown'].includes(state.gameState);
        const cur = state.players?.[state.currentTurnIndex];
        const myTurn = active && cur && cur.id === myIdRef.current;
        if (myTurn && !wasMyTurnRef.current) playSound('turn');
        wasMyTurnRef.current = !!myTurn;
      });
      newSocket.on('receiveCards', (data) => { setMyCards(data.cards); playSound('deal'); });
      newSocket.on('handRankUpdate', (data) => setMyHandRank(data.rank));
      newSocket.on('actionBroadcast', (data) => {
        addLog('action', formatAction(data.username, data.action, data.amount));
      });
      newSocket.on('cardRevealed', (data) => {
        setRevealMessages(prev => [...prev, data]);
        setTimeout(() => setRevealMessages(prev => prev.slice(1)), 5000);
        addLog('reveal', `👁 ${data.username} kart açtı`);
      });
      newSocket.on('newProposal', (proposal) => {
        setActiveProposal(proposal);
      });
      newSocket.on('voteResult', (result) => {
        setActiveProposal(null);
        setVoteResult(result);
        setTimeout(() => setVoteResult(null), 5000);
        addLog('vote', result.passed ? '🗳 Oylama kabul edildi' : result.cancelled ? '🗳 Oylama iptal edildi' : '🗳 Oylama reddedildi');
      });
      newSocket.on('settingChanged', (data) => {
        setVoteResult({ passed: true, setting: data.setting, newValue: data.newValue, immediate: true });
        setTimeout(() => setVoteResult(null), 3000);
      });
      newSocket.on('error', (message) => alert(`Sunucu Hatası: ${message}`));

      return () => {
        newSocket.disconnect();
        setSocket(null);
      };
    }
  }, [token]); // Sadece token değişince socket sıfırlanır

  // --- 3. ETKİ: İZLEYİCİ MODU (URL DİNLEME) ---
  // Masaya gidildiğinde otomatik 'viewTable' gönderir.
  // Masadan ayrılınca state'leri temizler.
  useEffect(() => {
    if (socket && location.pathname.startsWith('/table/')) {
      const tableId = location.pathname.split('/')[2];
      socket.emit('viewTable', tableId);
    } else if (!location.pathname.startsWith('/table/')) {
      // Masadan ayrılınca state'leri temizle (ama oyuncuyu masadan çıkarma)
      setTableState(null);
      setMyCards([]);
      setMyHandRank('');
      setRevealMessages([]);
      setActiveProposal(null);
      setVoteResult(null);
      setGameLog([]);
      winnerKeyRef.current = '';
      wasMyTurnRef.current = false;
    }
  }, [socket, location.pathname]);


  // --- İŞLEV FONKSİYONLARI ---

  const handleLogin = async (username, password) => {
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('poker_token', data.token);
        localStorage.setItem('poker_user', JSON.stringify(data.user)); // Kullanıcı bilgisini kaydet
        setToken(data.token);
        setUser(data.user); // User state'ini güncelle
        navigate('/lobby');
      } else {
        alert(data.message);
      }
    } catch (error) {
      alert('Giriş sunucusuna ulaşılamadı.');
    }
  };

  const handleLogout = () => {
    if (socket && tableState) socket.emit('leaveTable', tableState.id);
    localStorage.removeItem('poker_token');
    localStorage.removeItem('poker_user');
    setToken('');
    setUser(null);
    setTableState(null);
    setMyCards([]);
    if (socket) socket.disconnect();
    setSocket(null);
    navigate('/login');
  };

  // Masaya oturmadan önce buy-in modalını aç ve taze bakiyeyi getir
  const handleOpenBuyIn = async () => {
    if (!socket || !tableState) return;
    setShowBuyInModal(true);
    setBuyInBank(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBuyInBank(data.chips);
      } else {
        setBuyInBank(user?.chips ?? 0);
      }
    } catch (error) {
      setBuyInBank(user?.chips ?? 0);
    }
  };

  const handleConfirmBuyIn = (buyIn) => {
    if (socket && tableState) socket.emit('joinTable', { tableId: tableState.id, buyIn });
    setShowBuyInModal(false);
  };

  const handleLeaveTable = () => {
    if (socket && tableState) {
      socket.emit('leaveTable', tableState.id);
    }
  };

  const handleAction = (action, amount) => {
    if (socket && tableState) socket.emit('playerAction', { tableId: tableState.id, action, amount });
  };

  const handleRevealCards = (cardIndices) => {
    if (socket && tableState) socket.emit('revealCards', { tableId: tableState.id, cardIndices });
  };
  
  const handleStartGame = () => {
    if (socket && tableState) socket.emit('startGame', tableState.id);
  };

  const handleProposeSettingChange = (setting, value) => {
    if (socket && tableState) {
      socket.emit('proposeSettingChange', { tableId: tableState.id, setting, value });
    }
  };

  const handleVote = (vote) => {
    if (socket && tableState) {
      socket.emit('voteOnProposal', { tableId: tableState.id, vote });
    }
  };

  const handleOpenLeaderboard = async () => {
    setShowLeaderboard(true);
    setLeaderboardData(null); // Reset to loading state
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/leaderboard`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        console.error('Leaderboard API hatası:', res.status, res.statusText);
        const errorData = await res.json().catch(() => ({ message: 'Bilinmeyen hata' }));
        console.error('Hata detayı:', errorData);
        alert(`Leaderboard yüklenemedi: ${errorData.message || res.statusText}`);
        setLeaderboardData([]); // Set to empty on error
        return;
      }
      
      const data = await res.json();
      console.log('Leaderboard verisi:', data);
      setLeaderboardData(data);
    } catch (error) {
      console.error('Leaderboard yüklenemedi:', error);
      alert('Leaderboard yüklenirken bir hata oluştu.');
      setLeaderboardData([]); // Set to empty on error
    }
  };

  const handleCloseLeaderboard = () => {
    setShowLeaderboard(false);
    // State'i temizle, bir sonraki açılışta tekrar yüklesin
    setLeaderboardData(null);
  };

  const handleOpenAdminPanel = () => {
    setShowAdminPanel(true);
  };

  const handleCloseAdminPanel = () => {
    setShowAdminPanel(false);
  };
  
  return (
    <div className="app-container">
      {token && connectionStatus !== 'connected' && (
        <div className="connection-banner">
          {connectionStatus === 'connecting'
            ? '🔌 Sunucuya bağlanılıyor…'
            : '⚠️ Bağlantı koptu, yeniden bağlanılıyor…'}
        </div>
      )}
      {token && (
        <>
          <button onClick={handleOpenLeaderboard} className="leaderboard-button" title="Lider Tablosu">
            🏆
          </button>
          <button
            onClick={() => setMuted(toggleMute())}
            className="sound-button"
            title={muted ? 'Sesi Aç' : 'Sesi Kapat'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          {user?.isAdmin && (
            <button onClick={handleOpenAdminPanel} className="admin-button" title="Admin Paneli">
              ⚙️
            </button>
          )}
          <button onClick={handleLogout} className="logout-button">Çıkış Yap</button>
        </>
      )}
      
      <LeaderboardModal 
        show={showLeaderboard} 
        onClose={handleCloseLeaderboard} 
        leaderboardData={leaderboardData}
      />
      
      <AdminPanel
        show={showAdminPanel}
        onClose={handleCloseAdminPanel}
        token={token}
      />

      <BuyInModal
        show={showBuyInModal}
        onClose={() => setShowBuyInModal(false)}
        onConfirm={handleConfirmBuyIn}
        bank={buyInBank}
        settings={tableState?.settings}
        tableName={tableState ? `Masa #${tableState.id}` : ''}
      />

      <Routes>
        <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
        <Route path="/lobby" element={token ? <LobbyPage socket={socket} isConnected={connectionStatus === 'connected'} token={token} user={user} /> : <div>Yükleniyor...</div>} />
        <Route path="/table/:tableId" element={
            token ? (
              <TablePage
                tableState={tableState}
                myCards={myCards}
                myHandRank={myHandRank}
                myInfo={user}
                onAction={handleAction}
                onStartGame={handleStartGame}
                onSit={handleOpenBuyIn}
                onLeave={handleLeaveTable}
                onRevealCards={handleRevealCards}
                revealMessages={revealMessages}
                activeProposal={activeProposal}
                voteResult={voteResult}
                onProposeSettingChange={handleProposeSettingChange}
                onVote={handleVote}
                gameLog={gameLog}
              />
            ) : <div>Yönlendiriliyor...</div>
        }/>
        <Route path="/" element={token ? <LobbyPage socket={socket} isConnected={connectionStatus === 'connected'} token={token} user={user} /> : <LoginPage onLogin={handleLogin} />} />
      </Routes>
    </div>
  );
}

export default App;