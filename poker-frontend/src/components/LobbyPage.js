import React from 'react';
import { useNavigate } from 'react-router-dom';

function LobbyPage({ isConnected }) {
  const navigate = useNavigate();

  // Şimdilik lobi tek bir masadan oluşuyor. Tıklayınca App.js'in
  // 'tableUpdated' olayını dinleyip bizi yönlendirmesini bekleyeceğiz.
  // Bu nedenle butonu kaldırıp, doğrudan yönlendirmeyi tercih edebiliriz veya
  // App.js'deki 'connect' olayına `navigate('/table/1')` ekleyebiliriz.
  // Şimdilik basit tutalım:
  const goToTable = () => {
      // Normalde burada bir masa listesi olur ve ID seçilir.
      // Biz doğrudan /table/1'e gitmeye çalışacağız. App.js gerisini halleder.
      navigate('/table/1');
  }

  return (
    <div className="app">
      <h1>Poker Lobisi</h1>
      <button onClick={goToTable} disabled={!isConnected}>
        {isConnected ? '1 Numaralı Masaya Git' : 'Sunucuya Bağlanılıyor...'}
      </button>
    </div>
  );
}

export default LobbyPage;