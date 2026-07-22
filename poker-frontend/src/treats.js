import teaImg from './assets/tea.png';
import ayranImg from './assets/ayran.svg';

// Ismarlanabilir öğeler (koltuktaki ➕ → TreatModal → uçuş → koltukta kalıcı).
// Anahtarlar ve bedeller sunucudaki TREAT_COSTS ile uyumlu olmalı (poker-backend/server.js).
// tea.png: https://wordpress.org/photos/photo/8636890a5e/ (CC0) — arka planı yerel olarak silindi.
// ayran.svg: elle çizilmiş basit vektör (köpüklü ayran bardağı).
export const TREATS = {
  tea:   { name: 'Çay',   cost: 50, emoji: '🍵', img: teaImg },
  ayran: { name: 'Ayran', cost: 50, emoji: '🥛', img: ayranImg }
};
