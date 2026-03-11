const express = require('express');
const Table = require('../models/Table');
const verifyToken = require('../middleware/authMiddleware'); // Güvenlik görevlimiz

const router = express.Router();

// 🟢 YENİ MASA OLUŞTUR (Sadece giriş yapmış kullanıcılar kurabilir)
router.post('/create', verifyToken, async (req, res) => {
    try {
        const { name, maxPlayers, smallBlind, bigBlind, minBuyIn, maxBuyIn } = req.body;

        // Mantık kontrolleri (Opsiyonel ama hayat kurtarır)
        if (minBuyIn > maxBuyIn) {
            return res.status(400).json({ message: 'Minimum giriş, maksimum girişten büyük olamaz!' });
        }
        if (smallBlind >= bigBlind) {
            return res.status(400).json({ message: 'Small Blind, Big Blind\'dan küçük olmalıdır!' });
        }

        // Masayı veritabanına kaydet
        const newTable = await Table.create({
            name,
            maxPlayers,
            smallBlind,
            bigBlind,
            minBuyIn,
            maxBuyIn
        });

        res.status(201).json({
            message: 'Masa başarıyla kuruldu!',
            table: newTable
        });
    } catch (error) {
        console.error('Masa Kurma Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

// 🔵 AÇIK MASALARI LİSTELE (Lobi Ekranı İçin)
router.get('/list', verifyToken, async (req, res) => {
    try {
        // Sadece bekleyen (waiting) veya oynanan tüm masaları getir
        const tables = await Table.findAll();
        res.status(200).json(tables);
    } catch (error) {
        console.error('Masa Listeleme Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

module.exports = router;