const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const verifyToken = require('../middleware/authMiddleware');

const router = express.Router();

// 🟢 KAYIT OL API'si
router.post('/register', async (req, res) => {
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
router.post('/login', async (req, res) => {
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