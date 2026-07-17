# 🃏 Poker Oyunu — Özellik Envanteri

> Bu dosya, oyunun **şu an sahip olduğu** tüm özellikleri kaynak koda bakılarak çıkarılmıştır.
> Amaç: yeni özellik eklerken, mevcut bir şeyi değiştirirken veya kaldırırken ortak bir referans olması.
>
> Son güncelleme: Faz 5 (`c7aa583`) durumuna göre.

---

## 1. Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Backend | Node.js, Express 5, Socket.IO 4 |
| Poker el değerlendirme | `pokersolver` kütüphanesi |
| Veritabanı | SQLite + Sequelize ORM |
| Kimlik | JWT (1 gün geçerli) + bcrypt şifre hash |
| Frontend | React (react-router), Socket.IO client |
| Ses | Web Audio API (harici dosya yok) |
| Zamanlanmış işler | node-cron |
| Test | Node.js built-in test runner (`node --test`) — 27 test |

**Mimari notlar:**
- Masalar veritabanında kalıcı (`Table` modeli); **canlı oyun durumu bellekte** tutulur (`activeTables` Map).
- Çip bakiyesi tek kaynak: `User.chips = kasa (bankChips) + masadaki chips`. Her kalıcılaştırmada bu değişmez korunur.
- Frontend + API tek porttan servis edilebilir (production build), veya LAN'da sıfır-config çalışır.

---

## 2. Kimlik & Hesap Yönetimi

- ✅ **Kayıt ol** (kullanıcı adı + şifre; şifre min. 4 karakter).
- ✅ **Admin onay sistemi**: yeni kayıtlar `isApproved=false` başlar, admin onaylayana kadar giriş yapamaz.
- ✅ **İlk kullanıcı otomatik admin + onaylı** olur (kurulum kolaylığı).
- ✅ **Giriş yap** → JWT token (1 gün). Token + kullanıcı bilgisi `localStorage`'da tutulur.
- ✅ **Onaysız hesap girişi engellenir** ("Admin onayı bekleniyor").
- ✅ **Rate limiting**: `/register` ve `/login` için IP başına 15 dakikada en fazla 20 deneme.
- ✅ Yeni kullanıcıya **3000 başlangıç çipi**.
- ❌ Şifre sıfırlama / e-posta doğrulama yok.

---

## 3. Admin Paneli (⚙️)

Sadece admin kullanıcıların erişebildiği panel:

- ✅ **Tüm kullanıcıları listele** (ID, ad, chip, rol, onay durumu).
- ✅ **Chip ekle / çıkar** (pozitif/negatif miktar; negatife düşürmeye izin vermez).
- ✅ **Admin yetkisi ver / kaldır** (kendine yapamaz).
- ✅ **Kullanıcı sil** (kendini silemez).
- ✅ **Onayla / reddet** (reddedilen kullanıcı silinir).
- ✅ **Masa oluşturma** admin'e özel (lobi ekranından).

---

## 4. Lobi (Masa Listesi)

- ✅ Tüm masaları **kart görünümünde** listeler (ad, blindlar, buy-in aralığı, oyuncu sayısı/kapasite).
- ✅ **Canlı durum**: her masanın anlık oyuncu sayısı ve `Bekliyor` / `Oyunda` rozeti.
- ✅ **5 saniyede bir otomatik yenileme**.
- ✅ **Bağlantı göstergesi** (🟢 Bağlı / 🔴 Bağlantı yok).
- ✅ Masaya **Otur / İzle** (masa doluysa "İzle").
- ✅ Admin için **yeni masa oluşturma formu** (ad, maks oyuncu 2/4/6/8/9, SB, BB, min/maks buy-in; `maxBuyIn=0` = sınırsız).
- ✅ İstemci + sunucu çift doğrulama (SB < BB, min ≤ max).

---

## 5. Poker Motoru (Oyun Kuralları)

**Oyun türü: Texas Hold'em — No-Limit.**

- ✅ **2–9 oyuncu** desteği.
- ✅ **Buton (dealer) rotasyonu**: her el bir önceki dealer'ın solundaki oyuncuya geçer.
- ✅ **Small Blind / Big Blind** otomatik alınır.
- ✅ **Heads-up (2 kişi) özel kuralı**: dealer aynı zamanda SB'dir; doğru söz sırası.
- ✅ **Sokaklar**: pre-flop → flop (3 kart) → turn (1) → river (1) → showdown.
- ✅ **Söz sırası** doğru: pre-flop'ta UTG (BB'nin solu), post-flop'ta butonun solu.
- ✅ **Dealer / SB / BB rozetleri** koltuklarda gösterilir.
- ✅ **El sıralaması gösterimi** (kendi eliniz): pre-flop için özel açıklama (`Çift K`, `AK Suited`, `QJ Offsuit`), sonrası gerçek el adı ("Two Pair" vb.).

### Aksiyonlar
- ✅ **Fold / Check / Call / Raise**.
- ✅ **Raise "raise-to" mantığıyla** (bu sokaktaki toplam hedef bahis).
- ✅ **Minimum raise** kuralı: `betToMatch + son raise boyu`.
- ✅ **All-in** durumları: yetersiz çiple call/raise otomatik all-in'e kırpılır; kısa all-in raise bahsi yeniden açmaz (doğru NL kuralı).
- ✅ **Geçersiz aksiyon reddi** (sıra sende değil, ortada bahis varken check, vb.).

### Pot & Kazanan
- ✅ **Side pot (yan pot)** hesabı: farklı all-in seviyelerinde katmanlı dağıtım.
- ✅ **Küsurat çip** bölünen pota: butonun solundaki ilk kazanana gider.
- ✅ **Karşılanmayan bahis iadesi** (uncalled bet).
- ✅ **Beraberlik**: pot eşit bölünür.
- ✅ **Fold ile kazanınca kartlar gizli kalır**; showdown'da açılır.
- ✅ Pot dağıtım tutarsızlığında güvenli geri dönüş (herkese yatırımı iade) + log.

### Zamanlayıcı & Otomasyon
- ✅ **Tur zamanlayıcısı** (varsayılan 30 sn, ayarlanabilir 10–120 sn).
- ✅ Süre dolunca: bahis yoksa **auto-check**, varsa **auto-fold**.
- ✅ **Otomatik açılım (runout)**: herkes all-in olduğunda kartlar 5 sn aralıkla otomatik açılır.
- ✅ Herkes çekilince el anında biter, pot tek kalana gider.
- ✅ **El bitiminde 15 sn sonra otomatik yeni el** (yeterli oyuncu ve chip varsa).
- ✅ El sonu reset: chip'i bitenler, ayrılmak isteyenler ve bağlantısı kopanlar masadan çıkarılır.

### İsteğe bağlı kart açma
- ✅ **El sırasında kartını gösterme** (blöf/psikoloji): 1. kart, 2. kart veya ikisi. Herkese yayınlanır.

---

## 6. Çok Oyunculu Sağlamlık & Bağlantı

- ✅ **Yeniden bağlanma (reconnect)**: sayfa yenilenince gizli kartlar VE el sıralaması geri gelir; masa durumu senkronlanır.
- ✅ **Bağlantı kopması el ortasında anında fold ETMEZ**; oyuncu "disconnected" işaretlenir (koltuk grileşir), sırası gelince turn timer çözer → yeniden bağlanma süresi tanır.
- ✅ **Eski sekme koruması**: yalnızca güncel bağlantının kopuşu işlenir (yeni sekme açınca eski sekmenin kapanması canlı oyuncuyu düşürmez).
- ✅ **Aynı anda iki masada oturma engeli** (çip kopyalamayı önler).
- ✅ **Masa değişiminde eski odadan ayrılma** (bayat broadcast engeli).
- ✅ **Bağlantı durumu banner'ı** (bağlanılıyor / koptu, yeniden bağlanılıyor).
- ✅ Bekleme (waiting) aşamasında ayrılan oyuncu anında masadan çıkarılır (hayalet koltuk kalmaz).

---

## 7. Masa Ayarları Oylama Sistemi

Masadaki oyuncular oyun dışıyken (waiting/finished) ayar değişikliği önerebilir:

- ✅ Oylanabilir ayarlar: **Small Blind, Big Blind, Min Buy-In, Max Buy-In, Tur Süresi**.
- ✅ **Çoğunluk oyu** ile karar (yarısından fazlası kabul → geçer).
- ✅ **30 saniyelik oylama süresi** (dolunca o ana kadarki çoğunluğa göre sonuçlanır).
- ✅ **Tek oyuncu** varsa öneri anında uygulanır.
- ✅ **Çapraz doğrulama** (SB < BB, min ≤ max, süre 10–120 sn).
- ✅ Öneri sahibi ayrılırsa oylama iptal edilir.

---

## 8. Ekonomi & Çip Sistemi

- ✅ **Buy-in modalı**: masaya otururken ne kadar çiple oturacağını seç (slider + Min/½/Max hızlı butonlar + sayı girişi).
- ✅ **Kasa / masa ayrımı**: buy-in kadar masaya, kalan kasada (`bankChips`) tutulur.
- ✅ Buy-in **min/max ve bakiye sınırlarıyla** doğrulanır (istemci + sunucu).
- ✅ **Günlük çip yenileme** (cron, her gece 00:00): çipi 3000'in altındakiler 3000'e tamamlanır.
- ✅ **Lider tablosu** (🏆): en zengin 20 oyuncu.
- ❌ Oyun ortasında **rebuy / top-up** (masada otururken chip ekleme) yok — sadece oturarak buy-in.
- ❌ Rake (komisyon) yok.

---

## 9. Masa Arayüzü (UI)

- ✅ **Oval masa** görünümü, keçe zemin.
- ✅ **Kendine döndürme**: kendi koltuğun her zaman alt-orta; diğerleri etrafına dizilir.
- ✅ **Koltuklar**: kullanıcı adı, chip, durum, dealer/SB/BB rozeti, sıra göstergesi, kazanan vurgusu, disconnected (gri) durumu.
- ✅ **Kart görselleri** (kendi kartların açık, diğerleri kapalı; showdown'da açılır).
- ✅ **Topluluk kartları** ve **pot göstergesi** masanın ortasında.
- ✅ **Bahis çipleri** her koltuğun önünde görünür.
- ✅ **Aksiyon çubuğu**: FOLD / CHECK-CALL / RAISE + slider + ön ayarlar (**2x / 3x / Pot / All-in**) + artı/eksi adım butonları.
- ✅ **Dairesel süre göstergesi** (son 5 sn'de kırmızı uyarı).
- ✅ **Aksiyon logu** (son 50 olay: aksiyonlar, kazanan, kart açma, oylama).
- ✅ **İzleyici modu** (masada oturmayanlar).
- ✅ **El banner'ları** (kazanan duyurusu, oylama, kart açma bildirimleri, ayrılma durumu).
- ✅ Türkçe arayüz.

---

## 10. Ses & UX

- ✅ **Ses efektleri** (Web Audio ile sentezlenmiş, harici dosya yok): sıra sende (turn), kart dağıtma (deal), kazanma (win melodi).
- ✅ **Ses aç/kapa** (🔊/🔇) — tercih `localStorage`'da tutulur.
- ✅ Sıra sesi sadece **sana sıra geçtiğinde bir kez** çalar.

---

## 11. Güvenlik

- ✅ **JWT** ile socket ve API kimlik doğrulama; secret olmadan sunucu açılmaz.
- ✅ **bcrypt** ile şifre hash'leme (salt round 10).
- ✅ **Rate limiting** auth uçlarında.
- ✅ **Yetki kontrolleri**: masa oluşturma admin-only; oyunu sadece masadaki oyuncu başlatabilir; aksiyonlar sıra kontrolüyle.
- ✅ **Kart sızıntısı engeli**: `getPublicState` oyun sırasında rakip kartlarını göndermez (testle doğrulandı).
- ✅ **CORS** yapılandırması (env ile origin kısıtlanabilir).
- ✅ Tehlikeli dev scripti (`scripts/check-users.js`) uyarı başlığıyla alt klasörde.

---

## 12. Dağıtım (Deploy) Altyapısı

- ✅ **Env yapılandırması** (`.env.example`): JWT_SECRET, PORT, CORS_ORIGIN.
- ✅ **Tek port servisi**: frontend build varsa Express onu da servis eder (SPA fallback).
- ✅ **LAN sıfır-config**: telefon/başka cihaz host IP'sinden bağlanabilir (`0.0.0.0` + akıllı `config.js`).
- ✅ Frontend `SERVER_URL` çözümü: env → prod origin → dev host:5000.
- ⚠️ Gerçek bir sunucuya **deploy henüz yapılmadı** (altyapı hazır, hosting bekliyor).

---

## 13. Şu An OLMAYAN — Eklenebilecek Özellik Fikirleri

Aşağıdakiler bilinçli birer eksik/gelecek adım; öncelik sana kalmış:

- 💬 **Sohbet / emote** (oyuncular arası mesajlaşma) yok.
- 📜 **El geçmişi / istatistik** kalıcı değil (log sadece bellekte, masadan çıkınca silinir).
- 🏆 **Turnuva modu** (artan blindlar, elenme) yok — sadece cash game.
- 💵 **Masada rebuy / add-on** (oyun sırasında chip tamamlama) yok.
- ⏸️ İsteğe bağlı **sit-out / mola** (chip bitmeden elinden oturmama) yok.
- 🖼️ **Avatar / profil** özelleştirme yok.
- 🎞️ Çiplerin pota **animasyonlu akışı** yok (statik gösterim).
- 🔐 Şifre sıfırlama, 2FA, e-posta doğrulama yok.
- 🃏 Diğer varyantlar (Omaha, Short Deck) yok — yalnız Texas Hold'em.
- ⏱️ **Time bank** (ek süre) yok.

---

## 14. Test Kapsamı

- **27 test** (`node --test`), tümü geçiyor.
- Kapsanan senaryolar: side pot dağıtımı, all-in kırpma, min-raise, heads-up blind pozisyonları, süre dolması (check/fold), beraberlik, küsurat chip, fold ile gizli kart, showdown açılışı, kart sızıntısı engeli, kimlik/disconnect/buy-in (Faz 2 testleri).

---

*Bir özelliği değiştirmek/kaldırmak istediğinde bu dosyadaki başlığı referans göster; ilgili dosyaları hızlıca bulup birlikte planlayabiliriz.*
