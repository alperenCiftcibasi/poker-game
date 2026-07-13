# 🃏 Texas Hold'em Poker

Node.js/Express + Socket.io + Sequelize (SQLite) backend ve React (CRA) frontend ile
internet/LAN üzerinden oynanabilen çok oyunculu Texas Hold'em poker uygulaması.
Arayüz Türkçedir.

## Gereksinimler
- Node.js 18+ (geliştirme Node 25 ile de test edildi)
- npm

## Kurulum

```bash
# Backend
cd poker-backend
npm install
cp .env.example .env        # .env içindeki JWT_SECRET'i doldurun (ZORUNLU)

# Frontend
cd ../poker-frontend
npm install
cp .env.example .env        # genelde boş bırakmak yeterli
```

## Geliştirme (iki port)

```bash
# 1. terminal — backend (http://localhost:5000)
cd poker-backend
npm run dev        # veya: npm start

# 2. terminal — frontend (http://localhost:3000)
cd poker-frontend
npm start
```

Frontend, backend adresini otomatik çözer (`src/config.js`): `.env`'de
`REACT_APP_SERVER_URL` boşsa geliştirmede tarayıcı host'unun **5000** portunu kullanır.

### LAN'da oynamak (aynı ağdaki telefon/başka bilgisayar)
1. Backend'i çalıştıran makinenin yerel IP'sini öğrenin (ör. `192.168.1.20`).
2. Diğer cihazdan tarayıcıda `http://192.168.1.20:3000` açın.
3. API ve socket otomatik olarak aynı host'un `5000` portuna gider — ek ayar gerekmez.
   (Sunucu `0.0.0.0` üzerinde dinler; Windows Güvenlik Duvarı'nda 3000/5000 portlarına
   izin vermeniz gerekebilir.)

## Production build (tek port)

```bash
cd poker-frontend
npm run build       # poker-frontend/build üretir

cd ../poker-backend
# .env içinde NODE_ENV=production önerilir
NODE_ENV=production node server.js
```

Build mevcutsa backend, frontend'i **aynı porttan** (varsayılan 5000) servis eder:
statik dosyalar + SPA fallback. Tek adres: `http://<host>:5000`.

## Ortam Değişkenleri

**Backend (`poker-backend/.env`)**
| Değişken | Açıklama |
|---|---|
| `PORT` | Sunucu portu (varsayılan 5000) |
| `JWT_SECRET` | **Zorunlu.** JWT imzalama anahtarı; boşsa sunucu başlamaz |
| `CORS_ORIGIN` | İzin verilen origin (varsayılan `*`) |
| `NODE_ENV` | `production` → şema alter kapanır, build servis edilir |

**Frontend (`poker-frontend/.env`)**
| Değişken | Açıklama |
|---|---|
| `REACT_APP_SERVER_URL` | Backend adresi. Boşsa otomatik çözülür (bkz. yukarısı) |

## Testler

```bash
cd poker-backend
npm test        # node:test ile poker motoru + çok oyunculu senaryolar
```

## İlk kullanıcı / Admin
İlk kaydolan kullanıcı otomatik olarak **admin** ve **onaylı** olur. Sonraki
kullanıcılar admin onayı bekler. Admin panelinden (⚙️) kullanıcı onaylama, çip
düzenleme ve masa oluşturma yapılır. Masa oluşturma yalnızca admin'e açıktır.
