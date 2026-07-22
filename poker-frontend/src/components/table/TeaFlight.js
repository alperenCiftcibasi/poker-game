import React, { useState, useLayoutEffect } from 'react';
// Çay görseli kaynağı: https://wordpress.org/photos/photo/8636890a5e/ (CC0 / Public Domain)
// "A glass of Turkish tea with sugar cubes on a saucer" — arka planı yerel olarak silindi (22 Tem 2026).
import teaImg from '../../assets/tea.png';

// Tek bir çay uçuşu: gönderenin koltuğundan alıcının ➕ butonuna doğrusal hareket.
// Koordinatlar bir kez DOM'dan ölçülür ve masa (stage) yüzdesine çevrilir;
// böylece uçuş sırasında resize olursa yol kabaca korunur, çökme olmaz.
function TeaFlight({ anim, stageRef }) {
  const [coords, setCoords] = useState(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const sr = stage.getBoundingClientRect();
    if (!sr.width || !sr.height) return;
    const pct = (r) => ({
      x: ((r.left + r.width / 2 - sr.left) / sr.width) * 100,
      y: ((r.top + r.height / 2 - sr.top) / sr.height) * 100
    });

    // Hedef: alıcının ➕ butonu; yoksa koltuğu; o da yoksa (bu arada ayrılmış) animasyonu atla.
    const toBtn = stage.querySelector(`[data-treat-btn="${CSS.escape(String(anim.toId))}"]`);
    const toSeat = stage.querySelector(`[data-seat-player="${CSS.escape(String(anim.toId))}"]`);
    const toEl = toBtn || toSeat;
    if (!toEl) return;
    const to = pct(toEl.getBoundingClientRect());

    // Kaynak: gönderenin koltuğu; izleyici (koltuksuz) ise alt-ortadan, masanın dışından gelir.
    const fromSeat = stage.querySelector(`[data-seat-player="${CSS.escape(String(anim.fromId))}"]`);
    const from = fromSeat ? pct(fromSeat.getBoundingClientRect()) : { x: 50, y: 108 };

    setCoords({ from, to, self: anim.fromId === anim.toId });
  }, [anim, stageRef]);

  if (!coords) return null;

  return (
    <img
      src={teaImg}
      alt=""
      draggable={false}
      className={`pk-tea-travel${coords.self ? ' self' : ''}`}
      style={{
        '--fx': `${coords.from.x}%`, '--fy': `${coords.from.y}%`,
        '--tx': `${coords.to.x}%`, '--ty': `${coords.to.y}%`
      }}
    />
  );
}

export default TeaFlight;
