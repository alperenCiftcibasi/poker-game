import React, { useState, useLayoutEffect } from 'react';
import { TREATS } from '../../treats';

// Tek bir ısmarlama uçuşu: gönderenin koltuğundan alıcının yuvasına (avatar yanı) doğrusal
// hareket. Uçuş konduğu yerde opak kalır; App uçuşu DOM'dan kaldırınca aynı noktadaki
// kalıcı öğe (Seat .pk-seat-teas, treat) devralır — süre kısıtı yok, kalkana kadar durur.
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

    // Hedef: alıcının çay yuvası (kalıcı çayla aynı nokta → kusursuz devir); yoksa
    // koltuğu; o da yoksa (bu arada ayrılmış) animasyonu atla.
    const toRest = stage.querySelector(`[data-tea-rest="${CSS.escape(String(anim.toId))}"]`);
    const toSeat = stage.querySelector(`[data-seat-player="${CSS.escape(String(anim.toId))}"]`);
    const toEl = toRest || toSeat;
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
      src={(TREATS[anim.item] || TREATS.tea).img}
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
