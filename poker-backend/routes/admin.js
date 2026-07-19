const express = require('express');
const User = require('../models/User');
const verifyAdmin = require('../middleware/adminMiddleware');

const router = express.Router();

// 🔐 TÜM KULLANICILARI LİSTELE (Sadece Admin)
router.get('/users', verifyAdmin, async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'username', 'chips', 'tournamentChips', 'isAdmin', 'isApproved', 'createdAt'],
            order: [['createdAt', 'DESC']]
        });
        res.status(200).json(users);
    } catch (error) {
        console.error('Kullanıcı Listeleme Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

// 💰 ÇİP EKLE/ÇIKAR (Sadece Admin)
router.post('/update-chips', verifyAdmin, async (req, res) => {
    try {
        const { userId, amount } = req.body;
        
        if (!userId || amount === undefined) {
            return res.status(400).json({ message: 'Kullanıcı ID ve miktar gereklidir.' });
        }
        
        const user = await User.findByPk(userId);
        
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }
        
        // Yeni chip miktarını hesapla
        const newChips = user.chips + amount;
        
        // Negatife düşmesini engelle
        if (newChips < 0) {
            return res.status(400).json({ message: 'Chip miktarı negatif olamaz.' });
        }
        
        user.chips = newChips;
        await user.save();
        
        res.status(200).json({
            message: `${user.username} kullanıcısının chip'i güncellendi.`,
            user: {
                id: user.id,
                username: user.username,
                chips: user.chips
            }
        });
    } catch (error) {
        console.error('Chip Güncelleme Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

// 💎 TURNUVA ÇİPİ EKLE/ÇIKAR (Sadece Admin)
router.post('/update-tournament-chips', verifyAdmin, async (req, res) => {
    try {
        const { userId, amount } = req.body;

        if (!userId || amount === undefined) {
            return res.status(400).json({ message: 'Kullanıcı ID ve miktar gereklidir.' });
        }

        const user = await User.findByPk(userId);

        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        // Yeni turnuva çipi miktarını hesapla
        const newChips = (user.tournamentChips || 0) + amount;

        // Negatife düşmesini engelle
        if (newChips < 0) {
            return res.status(400).json({ message: 'Turnuva çipi miktarı negatif olamaz.' });
        }

        user.tournamentChips = newChips;
        await user.save();

        res.status(200).json({
            message: `${user.username} kullanıcısının turnuva çipi güncellendi.`,
            user: {
                id: user.id,
                username: user.username,
                tournamentChips: user.tournamentChips
            }
        });
    } catch (error) {
        console.error('Turnuva Çipi Güncelleme Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

// 🎖️ ADMİN YETKİSİ VER/KALDIR (Sadece Admin)
router.post('/toggle-admin', verifyAdmin, async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ message: 'Kullanıcı ID gereklidir.' });
        }
        
        // Kendi yetkisini kaldırmasını engelle
        if (userId === req.user.id) {
            return res.status(400).json({ message: 'Kendi admin yetkisini değiştiremezsiniz.' });
        }
        
        const user = await User.findByPk(userId);
        
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }
        
        user.isAdmin = !user.isAdmin;
        await user.save();
        
        res.status(200).json({
            message: `${user.username} ${user.isAdmin ? 'admin yapıldı' : 'admin yetkisi kaldırıldı'}.`,
            user: {
                id: user.id,
                username: user.username,
                isAdmin: user.isAdmin
            }
        });
    } catch (error) {
        console.error('Admin Yetkisi Değiştirme Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

// 🗑️ KULLANICI SİL (Sadece Admin)
router.delete('/user/:id', verifyAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        // Kendi hesabını silmesini engelle
        if (userId === req.user.id) {
            return res.status(400).json({ message: 'Kendi hesabınızı silemezsiniz.' });
        }
        
        const user = await User.findByPk(userId);
        
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }
        
        const username = user.username;
        await user.destroy();
        
        res.status(200).json({
            message: `${username} kullanıcısı silindi.`
        });
    } catch (error) {
        console.error('Kullanıcı Silme Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

// ✅ KULLANICI ONAY/REDDET (Sadece Admin)
router.post('/approve-user', verifyAdmin, async (req, res) => {
    try {
        const { userId, approve } = req.body;
        
        if (!userId || approve === undefined) {
            return res.status(400).json({ message: 'Kullanıcı ID ve onay durumu gereklidir.' });
        }
        
        const user = await User.findByPk(userId);
        
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }
        
        // Eğer red ise, kullanıcıyı sil
        if (!approve) {
            const username = user.username;
            await user.destroy();
            return res.status(200).json({
                message: `${username} kullanıcısı reddedildi ve silindi.`
            });
        }
        
        // Onaylandıysa, isApproved'ı güncelle
        user.isApproved = true;
        await user.save();
        
        res.status(200).json({
            message: `${user.username} kullanıcısı onaylandı.`,
            user: {
                id: user.id,
                username: user.username,
                isApproved: user.isApproved
            }
        });
    } catch (error) {
        console.error('Kullanıcı Onaylama Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

module.exports = router;
