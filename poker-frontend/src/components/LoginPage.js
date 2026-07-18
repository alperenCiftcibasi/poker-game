import React, { useState } from 'react';
import { SERVER_URL } from '../config';

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isRegister) {
      handleRegister();
    } else {
      onLogin(username, password);
    }
  };

  const handleRegister = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Kayıt başarılı! Admin onayı bekliyor. Onaylandıktan sonra giriş yapabilirsiniz.');
        setIsRegister(false);
        setUsername('');
        setPassword('');
      } else {
        alert(data.message || 'Kayıt başarısız');
      }
    } catch (error) {
      alert('Kayıt sunucusuna ulaşılamadı.');
    }
  };

  return (
    <div className="app">
      <h1>{isRegister ? 'Poker\'e Kayıt Ol' : 'Poker\'e Giriş Yap'}</h1>
      <form className="login-form" onSubmit={handleSubmit}>
        <input 
          type="text" 
          value={username} 
          onChange={(e) => setUsername(e.target.value)} 
          placeholder="Kullanıcı Adı"
          required 
        />
        <input 
          type="password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          placeholder="Şifre"
          required
          minLength="4"
        />
        <button type="submit">{isRegister ? 'KAYIT OL' : 'GİRİŞ YAP'}</button>
        <button 
          type="button" 
          onClick={() => setIsRegister(!isRegister)}
          style={{ background: '#7f8c8d', marginTop: '10px' }}
        >
          {isRegister ? 'Giriş Yap' : 'Kayıt Ol'}
        </button>
      </form>
      <p className="login-credit">merovingian tarafından geliştirildi</p>
    </div>
  );
}

export default LoginPage;