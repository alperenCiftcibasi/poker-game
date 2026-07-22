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
import AccountModal from './components/AccountModal';
import TreatModal from './components/TreatModal';
import { TREATS } from './treats';
import Avatar from './components/Avatar';
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
  // Elimizdeki kombinasyonu (pair/two pair/straight...) oluşturan kartların anahtarları.
  const [myComboCards, setMyComboCards] = useState([]);
  const [revealMessages, setRevealMessages] = useState([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState(null); // null = henüz yüklenmedi
  const [showTournamentLeaderboard, setShowTournamentLeaderboard] = useState(false);
  const [tournamentLeaderboardData, setTournamentLeaderboardData] = useState(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  // Profil fotoğrafı önbellek-kırma sürümü: değişince kendi avatarımız her yerde tazelenir.
  const [avatarVersion, setAvatarVersion] = useState(() => Number(localStorage.getItem('poker_avatar_v')) || 1);
  const [activeProposal, setActiveProposal] = useState(null);
  const [voteResult, setVoteResult] = useState(null);
  const [showBuyInModal, setShowBuyInModal] = useState(false);
  const [buyInBank, setBuyInBank] = useState(null); // null = bakiye yükleniyor
  const [gameLog, setGameLog] = useState([]); // Faz 4.4: aksiyon/olay logu
  const [chatMessages, setChatMessages] = useState([]); // Masaya özel yazılı sohbet
  const [teaAnims, setTeaAnims] = useState([]); // 🍵 Uçan çay animasyonları (geçici, kendini temizler)
  const [treatTarget, setTreatTarget] = useState(null); // ➕ Ismarlama modalı hedefi: { id, username }
  const [muted, setMuted] = useState(isMuted()); // Faz 5: ses aç/kapa
  const winnerKeyRef = useRef(''); // aynı elin kazananını loga bir kez ekle
  const myIdRef = useRef(null);    // socket dinleyicileri için taze kullanıcı id'si
  const wasMyTurnRef = useRef(false); // sıra sesini sadece geçişte çal
  const navigateRef = useRef(null); // socket dinleyicilerinden yönlendirme için taze navigate
  const boardLenRef = useRef(-1);   // ortak kart sayısı arttığında (flop/turn/river) ses çal; -1 = ilk state, ses yok

  const navigate = useNavigate();
  const location = useLocation();

  // Socket dinleyicileri closure'da eski user'ı yakalamasın diye id'yi ref'te tut
  myIdRef.current = user?.id ?? null;
  // Socket efekti [token]'a bağlı; navigate'i doğrudan kullanmak yerine ref'ten okuruz
  // (deps'i şişirip her yönlendirmede socket'i sıfırlamamak için).
  navigateRef.current = navigate;

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

  // --- 1.5. ETKİ: TAZE KULLANICI BİLGİSİ (isAdmin/chips senkronu) ---
  // localStorage'daki poker_user, giriş anındaki isAdmin/chips değerini tutar.
  // Bir oyuncuya sonradan admin yetkisi verilirse (veya çip güncellenirse) bu
  // önbellek eskir ve oyuncu yeniden giriş yapana kadar admin panelini göremez.
  // Bunu önlemek için token varken sunucudan taze bilgiyi çekip state + önbelleği
  // güncelliyoruz. Böylece sayfa yenilenince admin butonu kendiliğinden çıkar.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`${SERVER_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((fresh) => {
        if (cancelled || !fresh) return;
        setUser((prev) => {
          const merged = { ...(prev || {}), ...fresh };
          localStorage.setItem('poker_user', JSON.stringify(merged));
          return merged;
        });
      })
      .catch(() => {}); // Ağ hatası: mevcut önbellekli bilgiyle devam et
    return () => {
      cancelled = true;
    };
  }, [token]);

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
        // Ortak kart(lar) masaya geldiğinde ses çal (flop/turn/river).
        // -1 = mount/reconnect sonrası ilk state → yanlış tetikleme olmasın diye ses yok.
        const boardLen = state.communityCards?.length || 0;
        if (boardLenRef.current >= 0 && boardLen > boardLenRef.current) playSound('board');
        boardLenRef.current = boardLen;

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
        // (el sonu "göster/gösterme" penceremiz açıldığında da)
        const active = !['waiting', 'finished', 'showdown'].includes(state.gameState);
        const cur = state.players?.[state.currentTurnIndex];
        const myTurn = (active && cur && cur.id === myIdRef.current) ||
          (state.gameState === 'finished' && (state.showMuckDeciders || []).includes(myIdRef.current));
        if (myTurn && !wasMyTurnRef.current) playSound('turn');
        wasMyTurnRef.current = !!myTurn;
      });
      newSocket.on('receiveCards', (data) => { setMyCards(data.cards); setMyComboCards([]); playSound('deal'); });
      newSocket.on('handRankUpdate', (data) => { setMyHandRank(data.rank); setMyComboCards(data.comboCards || []); });
      newSocket.on('actionBroadcast', (data) => {
        addLog('action', formatAction(data.username, data.action, data.amount));
        // Her aksiyonun kendi sesi; all-in (call/raise tüm çipi götürdüyse) hepsini ezer.
        if (data.allIn) {
          playSound('allin');
        } else if (['fold', 'check', 'call', 'raise'].includes(data.action)) {
          playSound(data.action);
        }
      });
      newSocket.on('cardRevealed', (data) => {
        setRevealMessages(prev => [...prev, data]);
        setTimeout(() => setRevealMessages(prev => prev.slice(1)), 5000);
        addLog('reveal', `👁 ${data.username} kart açtı`);
        playSound('flip');
      });
      newSocket.on('showMuckResult', (data) => {
        addLog('reveal', `🙈 ${data.username} kartlarını göstermedi`);
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
      // Masa sohbeti: masaya girişte geçmiş, sonra tek tek yeni mesajlar
      newSocket.on('chatHistory', (history) => {
        setChatMessages(Array.isArray(history) ? history : []);
      });
      newSocket.on('chatMessage', (msg) => {
        setChatMessages(prev => [...prev, msg].slice(-100));
        // Başkasından gelen mesajda hafif bildirim sesi (kendi mesajım sessiz)
        if (msg && msg.userId !== myIdRef.current) playSound('chat');
      });
      // 🍵🥛 Ismarlama: hedef koltuğa uçan öğe animasyonu + log satırı + ses.
      // (revealMessages kalıbı: geçici state'e koy, birkaç saniye sonra temizle.)
      newSocket.on('teaReceived', (data) => {
        if (!data || !data.id) return;
        setTeaAnims(prev => [...prev, data]);
        // CSS uçuş 3s ve konduğu yerde opak bekler (solmaz); kaldırınca aynı noktadaki
        // kalıcı öğe (tableState players[].treat → Seat treat) kesintisiz devralır.
        setTimeout(() => setTeaAnims(prev => prev.filter(t => t.id !== data.id)), 3400);
        const meId = myIdRef.current;
        const fromLabel = data.fromId === meId ? 'Sen' : data.fromUsername;
        const toLabel = data.toId === data.fromId ? 'kendine'
          : data.toId === meId ? 'sana'
          : `${data.toUsername}'e`;
        const verb = data.fromId === meId ? 'ısmarladın' : 'ısmarladı';
        const costNote = data.fromId === meId ? ` (−${data.cost} 🍪)` : '';
        const t = TREATS[data.item] || TREATS.tea;
        addLog('tea', `${t.emoji} ${fromLabel}, ${toLabel} ${t.name.toLowerCase()} ${verb}${costNote}`);
        playSound('tea');
      });
      // Masa doluyken oturma talebi kuyruğa alındı
      newSocket.on('queued', (data) => {
        addLog('info', `⏳ Masa dolu — oturma sırasına alındınız (sıra #${data?.position ?? '?'}).`);
      });
      newSocket.on('error', (message) => alert(`Sunucu Hatası: ${message}`));
      // Masa admin tarafından silindi: masadaki/izleyen herkesi bilgilendir ve lobiye at.
      newSocket.on('tableClosed', (data) => {
        alert(data?.message || 'Bu masa kapatıldı.');
        setTableState(null);
        setMyCards([]);
        setMyHandRank('');
        setMyComboCards([]);
        navigateRef.current?.('/lobby');
      });

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
      setMyComboCards([]);
      setRevealMessages([]);
      setActiveProposal(null);
      setVoteResult(null);
      setGameLog([]);
      setChatMessages([]);
      winnerKeyRef.current = '';
      wasMyTurnRef.current = false;
      boardLenRef.current = -1;
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

  // Hesap güncellendi (kullanıcı adı değişikliği yeni token döndürür).
  // Yeni token'ı kaydetmek socket'i yeni kimlikle yeniden bağlar (Efekt 2),
  // ve /me efekti (Efekt 1.5) taze kullanıcı bilgisini çeker.
  const handleAccountUpdated = ({ token: newToken, user: newUser }) => {
    if (newToken) {
      localStorage.setItem('poker_token', newToken);
      setToken(newToken);
    }
    if (newUser) {
      setUser((prev) => {
        const merged = { ...(prev || {}), ...newUser };
        localStorage.setItem('poker_user', JSON.stringify(merged));
        return merged;
      });
    }
  };

  // Profil fotoğrafı güncellendi/kaldırıldı: sürümü artır (kendi avatarımız her yerde
  // yeniden çekilir) ve user.hasAvatar'ı senkronla; localStorage'a da yaz.
  const handleAvatarUpdated = (hasNow) => {
    setAvatarVersion((v) => {
      const next = v + 1;
      localStorage.setItem('poker_avatar_v', String(next));
      return next;
    });
    setUser((prev) => {
      if (!prev) return prev;
      const merged = { ...prev, hasAvatar: !!hasNow };
      localStorage.setItem('poker_user', JSON.stringify(merged));
      return merged;
    });
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
      const isTournament = tableState?.settings?.type === 'tournament';
      if (res.ok) {
        const data = await res.json();
        // Turnuva masasında turnuva çipi bakiyesini, normal masada normal çip bakiyesini göster.
        setBuyInBank(isTournament ? (data.tournamentChips ?? 0) : data.chips);
      } else {
        setBuyInBank(isTournament ? 0 : (user?.chips ?? 0));
      }
    } catch (error) {
      const isTournament = tableState?.settings?.type === 'tournament';
      setBuyInBank(isTournament ? 0 : (user?.chips ?? 0));
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

  // Lobiye dönüş: oturuyorsak masadan da kalk (el ortasındaysa sunucu "el bitince
  // ayrıl" olarak işler). pendingLeave zaten açıksa tekrar emit etme — toggle kapatır.
  const handleGoToLobby = () => {
    if (socket && tableState) {
      const me = tableState.players?.find(p => p.id === user?.id);
      if (me && !me.pendingLeave) socket.emit('leaveTable', tableState.id);
      socket.emit('leaveTableView');
    }
    navigate('/lobby');
  };

  const handleAction = (action, amount) => {
    if (socket && tableState) socket.emit('playerAction', { tableId: tableState.id, action, amount });
  };

  const handleRevealCards = (cardIndices) => {
    if (socket && tableState) socket.emit('revealCards', { tableId: tableState.id, cardIndices });
  };

  const handleShowMuckDecision = (show) => {
    if (socket && tableState) socket.emit('showMuckDecision', { tableId: tableState.id, show });
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

  const handleSendChat = (text) => {
    if (socket && tableState) {
      socket.emit('chatMessage', { tableId: tableState.id, text });
    }
  };

  // 🍵🥛 Bir oyuncuya (ya da kendine) öğe ısmarla: bedel sunucuda bakiyeden düşülür.
  const handleSendTea = (toUserId, item) => {
    if (socket && tableState) {
      socket.emit('sendTea', { tableId: tableState.id, toUserId, item });
    }
  };

  // ➕ Koltuktaki ısmarlama butonuna basıldı: modalı hedef oyuncuyla aç.
  const handleOpenTreat = (target) => setTreatTarget(target);

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

  const handleOpenTournamentLeaderboard = async () => {
    setShowTournamentLeaderboard(true);
    setTournamentLeaderboardData(null); // yükleniyor durumuna al
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/leaderboard/tournament`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Bilinmeyen hata' }));
        alert(`Turnuva lider tablosu yüklenemedi: ${errorData.message || res.statusText}`);
        setTournamentLeaderboardData([]);
        return;
      }

      const data = await res.json();
      setTournamentLeaderboardData(data);
    } catch (error) {
      console.error('Turnuva lider tablosu yüklenemedi:', error);
      alert('Turnuva lider tablosu yüklenirken bir hata oluştu.');
      setTournamentLeaderboardData([]);
    }
  };

  const handleCloseTournamentLeaderboard = () => {
    setShowTournamentLeaderboard(false);
    setTournamentLeaderboardData(null);
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
          <button onClick={handleOpenTournamentLeaderboard} className="tournament-leaderboard-button" title="Turnuva Lider Tablosu">
            🏅
          </button>
          <button
            onClick={() => setMuted(toggleMute())}
            className="sound-button"
            title={muted ? 'Sesi Aç' : 'Sesi Kapat'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            onClick={() => setShowAccount(true)}
            className="account-button"
            title="Hesap Ayarları"
          >
            {user?.id ? (
              <Avatar
                userId={user.id}
                username={user.username}
                size={40}
                version={avatarVersion}
                hasAvatar={user.hasAvatar}
              />
            ) : '👤'}
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

      <LeaderboardModal
        show={showTournamentLeaderboard}
        onClose={handleCloseTournamentLeaderboard}
        leaderboardData={tournamentLeaderboardData}
        title="🏅 Turnuva Lider Tablosu"
        chipField="tournamentChips"
        icon="💎"
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

      <AccountModal
        show={showAccount}
        onClose={() => setShowAccount(false)}
        token={token}
        user={user}
        onAccountUpdated={handleAccountUpdated}
        onAvatarUpdated={handleAvatarUpdated}
        avatarVersion={avatarVersion}
      />

      <TreatModal
        show={!!treatTarget && !!tableState}
        target={treatTarget ? { ...treatTarget, isMe: treatTarget.id === user?.id } : null}
        onClose={() => setTreatTarget(null)}
        onBuy={(toUserId, item) => { handleSendTea(toUserId, item); setTreatTarget(null); }}
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
                myComboCards={myComboCards}
                myInfo={user}
                onAction={handleAction}
                onStartGame={handleStartGame}
                onSit={handleOpenBuyIn}
                onLeave={handleLeaveTable}
                onGoLobby={handleGoToLobby}
                onRevealCards={handleRevealCards}
                onShowMuckDecision={handleShowMuckDecision}
                revealMessages={revealMessages}
                activeProposal={activeProposal}
                voteResult={voteResult}
                onProposeSettingChange={handleProposeSettingChange}
                onVote={handleVote}
                gameLog={gameLog}
                chatMessages={chatMessages}
                onSendChat={handleSendChat}
                onOpenTreat={handleOpenTreat}
                teaAnims={teaAnims}
                avatarVersion={avatarVersion}
              />
            ) : <div>Yönlendiriliyor...</div>
        }/>
        <Route path="/" element={token ? <LobbyPage socket={socket} isConnected={connectionStatus === 'connected'} token={token} user={user} /> : <LoginPage onLogin={handleLogin} />} />
      </Routes>
    </div>
  );
}

export default App;