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
        const user = await User.findByPk(req.user.id, {
            attributes: ['id', 'username', 'chips', 'isAdmin']
        });
        if (!user) return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        res.status(200).json(user);
    } catch (error) {
        console.error('Kullanıcı bilgisi hatası:', error);
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

// 🏆 LEADERBOARD (En Zengin Oyuncular)
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

module.exports = router;