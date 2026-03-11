import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import io from 'socket.io-client';
import './App.css';

import LoginPage from './components/LoginPage';
import LobbyPage from './components/LobbyPage';
import TablePage from './components/TablePage';
import LeaderboardModal from './components/LeaderboardModal';
import AdminPanel from './components/AdminPanel';

const SOCKET_URL = 'http://localhost:5000';

function App() {
  const [socket, setSocket] = useState(null);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('poker_token') || '');
  const [tableState, setTableState] = useState(null);
  const [myCards, setMyCards] = useState([]);
  const [myHandRank, setMyHandRank] = useState('');
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState(null); // null = henüz yüklenmedi
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

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
      newSocket = io(SOCKET_URL, { auth: { token } });
      setSocket(newSocket);

      newSocket.on('tableUpdated', (state) => setTableState(state));
      newSocket.on('receiveCards', (data) => setMyCards(data.cards));
      newSocket.on('handRankUpdate', (data) => setMyHandRank(data.rank));
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
    }
  }, [socket, location.pathname]);


  // --- İŞLEV FONKSİYONLARI ---

  const handleLogin = async (username, password) => {
    try {
      const res = await fetch(`${SOCKET_URL}/api/auth/login`, {
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

  const handleSitAtTable = () => {
    if (socket && tableState) socket.emit('joinTable', tableState.id);
  };

  const handleLeaveTable = () => {
    if (socket && tableState) {
      socket.emit('leaveTable', tableState.id);
    }
  };

  const handleAction = (action, amount) => {
    if (socket && tableState) socket.emit('playerAction', { tableId: tableState.id, action, amount });
  };
  
  const handleStartGame = () => {
    if (socket && tableState) socket.emit('startGame', tableState.id);
  };

  const handleOpenLeaderboard = async () => {
    setShowLeaderboard(true);
    setLeaderboardData(null); // Reset to loading state
    try {
      const res = await fetch(`${SOCKET_URL}/api/auth/leaderboard`, {
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
      {token && (
        <>
          <button onClick={handleOpenLeaderboard} className="leaderboard-button" title="Lider Tablosu">
            🏆
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

      <Routes>
        <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
        <Route path="/lobby" element={token ? <LobbyPage isConnected={!!socket} /> : <div>Yükleniyor...</div>} />
        <Route path="/table/:tableId" element={
            token ? (
              <TablePage 
                tableState={tableState} 
                myCards={myCards}
                myHandRank={myHandRank}
                myInfo={user}
                onAction={handleAction}
                onStartGame={handleStartGame}
                onSit={handleSitAtTable}
                onLeave={handleLeaveTable}
              />
            ) : <div>Yönlendiriliyor...</div>
        }/>
        <Route path="/" element={token ? <LobbyPage isConnected={!!socket}/> : <LoginPage onLogin={handleLogin} />} />
      </Routes>
    </div>
  );
}

export default App;