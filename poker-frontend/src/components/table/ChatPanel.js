import React, { useState, useRef, useEffect } from 'react';

// Masaya özel yazılı sohbet. Mesajlar App.js'te socket'ten toplanır: { id, userId, username, text, ts }.
function ChatPanel({ messages = [], myId, onSend, onClose }) {
  const [text, setText] = useState('');
  const feedRef = useRef(null);

  // Yeni mesaj gelince en alta kaydır
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="pk-chat">
      <div className="pk-chat-title">
        <span>💬 Sohbet</span>
        {onClose && (
          <button className="pk-chat-close" onClick={onClose} title="Sohbeti gizle" aria-label="Sohbeti gizle">✕</button>
        )}
      </div>
      <div className="pk-chat-feed" ref={feedRef}>
        {messages.length === 0 ? (
          <div className="pk-chat-empty">Henüz mesaj yok. İlk mesajı sen yaz!</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`pk-chat-msg ${m.userId === myId ? 'mine' : ''}`}>
              <span className="pk-chat-user">{m.username}</span>
              <span className="pk-chat-text">{m.text}</span>
            </div>
          ))
        )}
      </div>
      <div className="pk-chat-input">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={300}
          placeholder="Mesaj yaz…"
          aria-label="Sohbet mesajı"
        />
        <button onClick={send} disabled={!text.trim()}>Gönder</button>
      </div>
    </div>
  );
}

export default ChatPanel;
