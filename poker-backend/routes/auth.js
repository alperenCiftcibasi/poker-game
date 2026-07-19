const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const verifyToken = require('../middleware/authMiddleware');

const router = express.Router();

// B16: Kaba kuvvet / spam saldırılarına karşı auth uçlarında hız sınırı.
// IP başına 15 dakikada en fazla 20 deneme.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Çok fazla deneme yaptınız. Lütfen 15 dakika sonra tekrar deneyin.' }
});

// 🟢 KAYIT OL API'si
router.post('/register', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. Bu kullanıcı adı daha önce alınmış mı?
        const existingUser = await User.findOne({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ message: 'Bu kullanıcı adı zaten alınmış.' });
        }

        // 2. Şifreyi kriptola (Güvenlik için)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. İlk kullanıcı mı kontrol et (otomatik admin ve onaylı olsun)
        const userCount = await User.count();
        const isFirstUser = userCount === 0;

        // 4. Veritabanına kaydet
        const newUser = await User.create({
            username,
            password: hashedPassword,
            isAdmin: isFirstUser, // İlk kullanıcı otomatik admin
            isApproved: isFirstUser // İlk kullanıcı otomatik onaylı
        });

        res.status(201).json({ 
            message: isFirstUser 
                ? 'İlk kullanıcı olarak kaydoldunuz! Admin yetkisi verildi.' 
                : 'Kayıt başarılı! Admin onayı bekleniyor.', 
            user: { id: newUser.id, username: newUser.username, chips: newUser.chips } 
        });
    } catch (error) {
        console.error('Kayıt Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

// 🔵 GİRİŞ YAP API'si
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        // 1. Kullanıcı veritabanında var mı?
        const user = await User.findOne({ where: { username } });
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        // 2. Şifre doğru mu?
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Hatalı şifre girdiniz.' });
        }

        // 3. Hesap onaylandı mı?
        if (!user.isApproved) {
            return res.status(403).json({ message: 'Hesabınız henüz onaylanmadı. Admin onayı bekleniyor.' });
        }

        // 4. Her şey doğruysa JWT Token (Giriş Kartı) oluştur
        const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '1d' } // Token 1 gün boyunca geçerli olacak
        );

        res.status(200).json({
            message: 'Giriş başarılı!',
            token, // Frontend bu token'ı kaydedecek
            user: { id: user.id, username: user.username, chips: user.chips, isAdmin: user.isAdmin }
        });
    } catch (error) {
        console.error('Giriş Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

// 👤 MEVCUT KULLANICI (buy-in modalı için taze bakiye)
router.get('/me', verifyToken, async (req, res) => {
    try {
        // avatar (base64) büyük olabilir; /me sık çağrıldığı için gövdeye koymuyoruz.
        // Yerine yalnızca hasAvatar bayrağı döner; görsel ayrı endpoint'ten çekilir.
        const user = await User.findByPk(req.user.id, {
            attributes: ['id', 'username', 'chips', 'tournamentChips', 'isAdmin', 'avatar']
        });
        if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        const plain = user.toJSON();
        const hasAvatar = !!plain.avatar;
        delete plain.avatar;
        res.status(200).json({ ...plain, hasAvatar });
    } catch (error) {
        console.error('Kullanıcı bilgisi hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

// 🖼️ PROFİL FOTOĞRAFINI GÖRÜNTÜLE (tokensiz — <img> etiketi header gönderemez).
// Data URL olarak saklanan görseli çözüp ham baytları döner. Yoksa 404 → istemci
// baş harf avatarına düşer. Avatarlar gizli değildir; kimlik doğrulama gerekmez.
router.get('/avatar/:userId', async (req, res) => {
    try {
        const userId = Number(req.params.userId);
        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).end();
        }
        const user = await User.findByPk(userId, { attributes: ['avatar'] });
        if (!user || !user.avatar) return res.status(404).end();

        // "data:image/jpeg;base64,AAAA..." → mime + base64
        const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(user.avatar);
        if (!match) return res.status(404).end();
        const mime = match[1];
        const buffer = Buffer.from(match[2], 'base64');

        res.set('Content-Type', mime);
        // Kısa önbellek: bir kullanıcı fotoğrafını değiştirince diğer istemciler ~1 dk
        // içinde yeni görseli çeker. Sahibi kendi görünümünü ?v= ile anında tazeler.
        res.set('Cache-Control', 'public, max-age=60');
        res.send(buffer);
    } catch (error) {
        console.error('Avatar getirme hatası:', error);
        res.status(500).end();
    }
});

// 📤 PROFİL FOTOĞRAFI YÜKLE / GÜNCELLE (giriş yapmış kullanıcı)
// Gövde: { avatar: "data:image/...;base64,..." } — istemcide 256px'e küçültülüp sıkıştırılmış.
router.post('/avatar', verifyToken, async (req, res) => {
    try {
        const { avatar } = req.body;
        if (!avatar || typeof avatar !== 'string') {
            return res.status(400).json({ message: 'Geçerli bir görsel gönderilmedi.' });
        }

        // Biçim doğrulaması: yalnızca base64 image data URL kabul edilir.
        const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(avatar);
        if (!match) {
            return res.status(400).json({ message: 'Yalnızca JPEG/PNG/WebP/GIF görseller kabul edilir.' });
        }

        // Boyut sınırı: base64 metni ~400KB'ı geçmesin (yaklaşık 300KB görsel).
        // İstemci zaten küçültüyor; bu sunucu tarafı güvenlik sınırı.
        if (avatar.length > 400_000) {
            return res.status(413).json({ message: 'Görsel çok büyük. Lütfen daha küçük bir fotoğraf seçin.' });
        }

        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });

        user.avatar = avatar;
        await user.save();

        res.status(200).json({ message: 'Profil fotoğrafınız güncellendi.' });
    } catch (error) {
        console.error('Avatar yükleme hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

// 🗑️ PROFİL FOTOĞRAFINI KALDIR
router.delete('/avatar', verifyToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        user.avatar = null;
        await user.save();
        res.status(200).json({ message: 'Profil fotoğrafınız kaldırıldı.' });
    } catch (error) {
        console.error('Avatar kaldırma hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

// ✏️ KULLANICI ADI DEĞİŞTİR API'si (şifre doğrulaması gerekir)
router.post('/change-username', authLimiter, verifyToken, async (req, res) => {
    try {
        const { currentPassword, newUsername } = req.body;

        // 1. Temel doğrulama
        if (!currentPassword || !newUsername) {
            return res.status(400).json({ message: 'Mevcut şifre ve yeni kullanıcı adı gereklidir.' });
        }
        const trimmed = String(newUsername).trim();
        if (trimmed.length < 3 || trimmed.length > 20) {
            return res.status(400).json({ message: 'Kullanıcı adı 3-20 karakter olmalıdır.' });
        }

        // 2. Kullanıcıyı bul
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        // 3. Şifre doğrulaması
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Şifreniz hatalı.' });
        }

        // 4. Aynı ad mı?
        if (trimmed === user.username) {
            return res.status(400).json({ message: 'Yeni kullanıcı adı mevcut adınızla aynı.' });
        }

        // 5. Kullanıcı adı başkası tarafından alınmış mı?
        const existing = await User.findOne({ where: { username: trimmed } });
        if (existing && existing.id !== user.id) {
            return res.status(400).json({ message: 'Bu kullanıcı adı zaten alınmış.' });
        }

        // 6. Kaydet
        user.username = trimmed;
        await user.save();

        // 7. Kullanıcı adı JWT içinde tutulduğu için taze token üret (eski token eski adı taşır).
        //    Frontend bu token'ı kaydedip socket'i yeni adla yeniden bağlar.
        const newToken = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.status(200).json({
            message: 'Kullanıcı adınız başarıyla değiştirildi.',
            token: newToken,
            user: { id: user.id, username: user.username, chips: user.chips, isAdmin: user.isAdmin }
        });
    } catch (error) {
        console.error('Kullanıcı Adı Değiştirme Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

// 🔑 ŞİFRE DEĞİŞTİR API'si (giriş yapmış kullanıcı kendi şifresini değiştirir)
router.post('/change-password', authLimiter, verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // 1. Temel doğrulama
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Mevcut ve yeni şifre gereklidir.' });
        }
        if (typeof newPassword !== 'string' || newPassword.length < 4) {
            return res.status(400).json({ message: 'Yeni şifre en az 4 karakter olmalıdır.' });
        }

        // 2. Kullanıcıyı bul (token'dan gelen id ile)
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        // 3. Mevcut şifre doğru mu?
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Mevcut şifreniz hatalı.' });
        }

        // 4. Yeni şifre eskisiyle aynı olmasın
        const isSame = await bcrypt.compare(newPassword, user.password);
        if (isSame) {
            return res.status(400).json({ message: 'Yeni şifre mevcut şifreyle aynı olamaz.' });
        }

        // 5. Yeni şifreyi kriptola ve kaydet
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.status(200).json({ message: 'Şifreniz başarıyla değiştirildi.' });
    } catch (error) {
        console.error('Şifre Değiştirme Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

// 🏆 LEADERBOARD (En Zengin Oyuncular — normal çip)
router.get('/leaderboard', verifyToken, async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'username', 'chips'],
            order: [['chips', 'DESC']],
            limit: 20
        });
        res.status(200).json(users);
    } catch (error) {
        console.error('Leaderboard Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

// 🏅 TURNUVA LEADERBOARD (En Çok Turnuva Çipine Sahip Oyuncular)
router.get('/leaderboard/tournament', verifyToken, async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'username', 'tournamentChips'],
            order: [['tournamentChips', 'DESC']],
            limit: 20
        });
        res.status(200).json(users);
    } catch (error) {
        console.error('Turnuva Leaderboard Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

module.exports = router;