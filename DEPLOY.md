# 🚀 Ücretsiz 7/24 Deploy Rehberi (Vercel + Render + Supabase)

Bu rehber, siteyi **PC'ye bağımlı olmadan, tamamen ücretsiz ve kesintisiz**
internette tutmak içindir. ngrok + PC kurulumunun (bkz. `SITEYI-AC.md`) yerini alır.

## Neden 3 parça?

Poker backend'i **sürekli açık, kalıcı WebSocket** sunucusu; oyun durumu RAM'de,
oyunu ilerleten timer'lar in-process. Bu yüzden Vercel serverless'ta **çalışmaz**.
Supabase de bir oyun sunucusu değil, sadece veritabanı sağlar. Doğru dağıtım:

| Parça | Ne çalışır | Nerede | Ücret |
|---|---|---|---|
| **Frontend** | React statik build | **Vercel** | Ücretsiz, gerçek 7/24 |
| **Backend** | Socket.IO oyun sunucusu | **Render free + keep-alive** | Ücretsiz |
| **Veritabanı** | Hesaplar + çip bakiyeleri | **Supabase Postgres** | Ücretsiz |

> ⚠️ **Neden Supabase şart?** Render free tier efemer disklidir: SQLite dosyası
> her uyku-uyanma / deploy / restart'ta repodaki eski sürüme **sıfırlanır** ve tüm
> hesap/çip verisi kaybolur. Kalıcı disk Render'da ücretli. Bu yüzden veri
> Supabase'te (yönetilen Postgres) tutulur.

---

## 0) Ön doğrulama (yerelde)

```powershell
cd 'C:\Users\csp\Desktop\Yeni klasör\poker\poker-backend'
npm install                 # pg + pg-hstore kurulur
$env:CI='true'; npm test    # 34 test yeşil olmalı (DATABASE_URL yok → SQLite ile çalışır)
```

Kod, `DATABASE_URL` set edilmediği sürece eskisi gibi SQLite ile çalışır — yerel
geliştirme değişmez.

---

## 1) Supabase — veritabanı + veri taşıma

1. **supabase.com** → yeni proje oluştur. DB **şifresini not al**.
2. Settings → Database → **Connection string** → **"Session pooler" (port 5432)**
   URI'sini kopyala; içindeki `[YOUR-PASSWORD]` yerine şifreyi yaz.
   > Uzun ömürlü sunucu için **Session pooler (5432)** önerilir; Transaction
   > pooler (6543) serverless içindir.
3. **Canlı SQLite dosyasını YEDEKLE** (kopyasını ayrı bir klasöre al). Repodaki
   sürüm eski olabilir — sitenin şu an çalıştığı **güncel** `poker-database.sqlite`
   taşınmalı.
4. **Kimse oynamıyorken** (yazma yokken) taşı:
   ```powershell
   cd 'C:\Users\csp\Desktop\Yeni klasör\poker\poker-backend'
   $env:DATABASE_URL='postgresql://postgres.<ref>:<sifre>@aws-0-<bolge>.pooler.supabase.com:5432/postgres'
   node scripts/migrate-sqlite-to-postgres.js
   ```
5. **Doğrula:** Supabase → Table editor → `Users` ve `Tables`. Satır sayıları +
   birkaç kullanıcının `chips` / `isAdmin` / `isApproved` değerleri SQLite ile
   birebir mi? Uymuyorsa canlıya geçme.

> Orijinal SQLite dosyasına hiç dokunulmaz → her an geri dönülebilir yedek.
> Script'i tekrar çalıştırman gerekirse hedef tabloları önce temizle (ID çakışması).

---

## 2) Render — backend (oyun sunucusu)

> Render repoyu Git'ten deploy eder. Repo henüz GitHub'da değilse önce push et.

1. **render.com** → New → **Web Service** → repoyu bağla.
2. Ayarlar:
   - **Root Directory:** `poker-backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
3. **Environment** değişkenleri:
   | Anahtar | Değer |
   |---|---|
   | `JWT_SECRET` | Yeni, güçlü rastgele değer (`openssl rand -hex 32`) |
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Supabase Session pooler URI (adım 1) |
   | `CORS_ORIGIN` | `*` (şimdilik; adım 4'te sıkılaştırılacak) |

   > `PORT`'u Render otomatik verir — elle ekleme (`server.js` `process.env.PORT` okur).
4. Deploy → `https://xxx.onrender.com` adresini not al.
5. Kontrol: tarayıcıda `https://xxx.onrender.com/healthz` → `{"status":"ok",...}` dönmeli.

---

## 3) Vercel — frontend

1. **vercel.com** → New Project → repoyu import et.
2. Ayarlar:
   - **Root Directory:** `poker-frontend`
   - **Framework Preset:** Create React App (otomatik algılar)
3. **Environment Variable:**
   | Anahtar | Değer |
   |---|---|
   | `REACT_APP_SERVER_URL` | `https://xxx.onrender.com` (Render adresi, adım 2) |

   > Bu **build-time** okunur. Boş kalırsa frontend Vercel origin'ine bağlanmaya
   > çalışır ve backend'e ulaşamaz.
4. Deploy → `https://yyy.vercel.app` adresini not al.

---

## 4) CORS'u sıkılaştır

Render → Environment → `CORS_ORIGIN` değerini `*` yerine Vercel domain'i yap:
```
CORS_ORIGIN=https://yyy.vercel.app
```
(Preview deploy'ları da lazımsa virgülle ekle.) Kaydet → Render otomatik restart eder.

---

## 5) Keep-alive — Render uykusunu engelle

Render free ~15 dk boştan sonra uyur; uyanınca RAM'deki oyun durumu sıfırlanır.
Ücretsiz bir pinger ile uyanık tut:

- **UptimeRobot** (veya **cron-job.org**) → yeni monitor:
  - URL: `https://xxx.onrender.com/healthz`
  - Aralık: **5–10 dk**

Tek bir hep-açık servis Render'ın 750 saat/ay ücretsiz kotasına sığar.

---

## ✅ Nihai durum

**Vercel** (frontend) + **Render free + keep-alive** (backend) + **Supabase** (DB).
Toplam maliyet **$0**, PC gerekmez, adres kalıcı.

## 🔍 Sorun giderme

- **Frontend açılıyor ama giriş/kayıt çalışmıyor** → Vercel `REACT_APP_SERVER_URL`
  yanlış/eksik ya da Render'da `CORS_ORIGIN` Vercel domain'ini içermiyor.
- **İlk istek ~50 sn sürüyor** → Render uykudan uyanıyor; keep-alive kuruluysa
  olmamalı (monitor'ün çalıştığını doğrula).
- **Hesaplar/çipler kayboluyor** → `DATABASE_URL` Render'da set değil (SQLite'a
  düşmüş demektir). Env'i kontrol et, redeploy et.
- **Postgres bağlantı hatası** → connection string'de şifre/host doğru mu; Session
  pooler (5432) kullanıldı mı.

## 📌 Notlar
- Backend hâlâ frontend build'ini de servis edebilir (`server.js`); Vercel varken
  gereksiz ama zararsız.
- Gece çip reset (`node-cron`) backend sürekli açık olduğu için çalışmaya devam eder.
- Admin şifresi (`admin123`) internete açıkken zayıf — deploy öncesi değiştir.
