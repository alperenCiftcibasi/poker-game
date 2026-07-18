# 🎰 Poker Sitesini Açma / Kapama Komutları

Site adresi: **https://chug-recent-embolism.ngrok-free.dev**
Yerel port: **5000** · Domain kalıcıdır (ngrok authtoken config'te kayıtlı).

> Komutları **PowerShell**'de çalıştır. Süreçler `Start-Process` ile oturumdan
> **bağımsız** başlar — terminali/Claude'u kapatsan da çalışmaya devam eder.
> (Not: Bilgisayar uyur/kapanırsa site düşer, tekrar açman gerekir.)

---

## ▶️ SİTEYİ AÇ (2 adım)

### 1) Backend'i başlat (React build'i 5000 portundan servis eder)
```powershell
$env:NODE_ENV='production'
Start-Process node -ArgumentList 'server.js' `
  -WorkingDirectory 'C:\Users\csp\Desktop\Yeni klasör\poker\poker-backend' `
  -WindowStyle Hidden `
  -RedirectStandardOutput 'C:\Users\csp\Desktop\Yeni klasör\poker\server.log' `
  -RedirectStandardError  'C:\Users\csp\Desktop\Yeni klasör\poker\server.err.log'
```

### 2) ngrok tünelini başlat (siteyi internete açar)
```powershell
Start-Process 'C:\Users\csp\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe' `
  -ArgumentList 'http','--url=chug-recent-embolism.ngrok-free.dev','5000','--log','stdout','--log-format','term' `
  -WindowStyle Hidden `
  -RedirectStandardOutput 'C:\Users\csp\Desktop\Yeni klasör\poker\ngrok.log' `
  -RedirectStandardError  'C:\Users\csp\Desktop\Yeni klasör\poker\ngrok.err.log'
```

Birkaç saniye sonra site açık olmalı. Tarayıcıda kontrol:
**https://chug-recent-embolism.ngrok-free.dev**

---

## ⏹️ SİTEYİ KAPAT

```powershell
# ngrok tünelini kapat
Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force

# 5000 portundaki backend'i kapat
Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force }
```

---

## 🔄 YENİDEN BAŞLAT (kod değiştiyse)

Kodda değişiklik yaptıysan **önce frontend'i yeniden derle**, sonra aç:

```powershell
# 1. Frontend build (sadece frontend kodu değiştiyse gerekli)
cd 'C:\Users\csp\Desktop\Yeni klasör\poker\poker-frontend'
$env:CI='true'; npm run build

# 2. Eski backend'i kapat (yukarıdaki "SİTEYİ KAPAT" komutu)
# 3. Backend'i tekrar başlat (yukarıdaki "SİTEYİ AÇ" adım 1)
#    -> ngrok zaten çalışıyorsa yeniden başlatmana gerek yok
```

> ⚠️ Yeniden başlatınca **masadaki anlık oyun durumu sıfırlanır** (oyuncular
> yeniden oturur). Oyuncu bakiyeleri / chip'ler DB'de korunur.

---

## 🔍 Durum kontrolü

```powershell
# Backend ayakta mı? (5000 dinleniyor mu)
Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue

# ngrok çalışıyor mu
Get-Process ngrok -ErrorAction SilentlyContinue

# Kota / trafik izleme (tarayıcıda)
#   http://localhost:4040   -> ngrok inspector
```

Loglar: `server.log`, `server.err.log`, `ngrok.log`, `ngrok.err.log` (proje kökünde).

---

## 📌 Notlar
- İlk girişte oyunculara 1 kez ngrok "Visit Site" uyarısı çıkar — normaldir (7 gün cookie).
- ngrok free kota: **20.000 HTTP isteği + 1 GB/ay**. WebSocket mesajları kotaya SAYILMAZ.
- Admin kullanıcı: `oyuncu1` (şifre şu an `admin123` — internete açıkken zayıf, değiştirmen önerilir).
