// Oval masa etrafında koltuk yerleşimi.
//
// Slot k için: açı = 90° + k·(360°/S). Slot 0 = alt-orta (90° → cos=0, sin=1).
// left = %50 + 42·cos, top = %50 + 40·sin (yatay elips; RX=42, RY=40).
// Bahis çipi konumu koltuk→merkez vektöründe içeride. Alt yarı koltuklarda kartlar
// merkeze doğru dizildiği için çip daha da içeri (0.42) alınır; üst yarıda 0.6.

export function getSeatPositions(maxPlayers, rx = 42, ry = 40) {
  const positions = [];
  for (let k = 0; k < maxPlayers; k++) {
    const angle = ((90 + k * (360 / maxPlayers)) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const left = 50 + rx * cos;
    const top = 50 + ry * sin;
    // Bahis çipi koltuk→merkez vektöründe içeride (çip yığını masanın içinde görünsün).
    // Alt yarıdaki koltuklarda (sin>0, sıra bize ait alt-orta koltuk dâhil) kartlar
    // koltuğun üstünde merkeze doğru diziliyor; çipi kartların önüne almak için biraz
    // daha içeri çekiyoruz. Aksi halde çip kendi kartlarımızın arkasında kalıp görünmüyordu.
    const betFactor = sin > 0 ? 0.42 : 0.6;
    const betLeft = 50 + rx * cos * betFactor;
    const betTop = 50 + ry * sin * betFactor;
    positions.push({ left, top, betLeft, betTop });
  }
  return positions;
}

// Oyuncuları slotlara "kendine döndürerek" yerleştir: izleyen kişi (myIndex) hep alt-orta (slot 0).
// Dönen dizi uzunluğu maxPlayers; boş slotlar null. İzleyici (myIndex<0) → birebir eşleme.
export function assignSeats(players, maxPlayers, myIndex) {
  const seats = new Array(maxPlayers).fill(null);
  const m = myIndex >= 0 ? myIndex : 0;
  players.forEach((p, i) => {
    const slot = (i - m + maxPlayers) % maxPlayers;
    seats[slot] = p;
  });
  return seats;
}
