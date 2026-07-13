// Backend sunucu adresinin tek kaynağı. Tüm fetch ve socket bağlantıları buradan.
//
// Öncelik sırası:
//  1. REACT_APP_SERVER_URL tanımlıysa onu kullan (deploy'da açık adres verilebilir).
//  2. Production build'de sayfanın kendi origin'i (frontend + API tek porttan servis edilir).
//  3. Development'ta tarayıcının host'u + 5000 portu. Böylece LAN'da sıfır-config çalışır:
//     telefon http://192.168.x.x:3000 açar, API/socket otomatik aynı host'un 5000'ine gider.

function resolveServerUrl() {
  const fromEnv = process.env.REACT_APP_SERVER_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');

  if (process.env.NODE_ENV === 'production') {
    return window.location.origin;
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:5000`;
}

export const SERVER_URL = resolveServerUrl();
