const express = require('express');
const Table = require('../models/Table');
const verifyToken = require('../middleware/authMiddleware'); // Güvenlik görevlimiz
const verifyAdmin = require('../middleware/adminMiddleware');
const { activeTables } = require('../game/tableRegistry');

const router = express.Router();

// 🟢 YENİ MASA OLUŞTUR (Sadece admin)
router.post('/create', verifyAdmin, async (req, res) => {
    try {
        const { name, maxPlayers, smallBlind, bigBlind, minBuyIn, maxBuyIn } = req.body;

        // Mantık kontrolleri (Opsiyonel ama hayat kurtarır)
        // maxBuyIn === 0 → sınırsız (server.js joinTable ile tutarlı), bu durumda min>max kontrolü atlanır.
        if (maxBuyIn > 0 && minBuyIn > maxBuyIn) {
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

// 🟣 CANLI MASA DURUMU (Lobi kartları için: DB masaları + aktif oyun durumu)
router.get('/live', verifyToken, async (req, res) => {
    try {
        const dbTables = await Table.findAll({ order: [['id', 'ASC']] });
        const list = dbTables.map(t => {
            // activeTables anahtarları URL'den geldiği için string olabilir; her iki tipi de dene.
            const live = activeTables.get(t.id) || activeTables.get(String(t.id));
            return {
                id: t.id,
                name: t.name,
                smallBlind: t.smallBlind,
                bigBlind: t.bigBlind,
                minBuyIn: t.minBuyIn,
                maxBuyIn: t.maxBuyIn,
                maxPlayers: t.maxPlayers,
                playerCount: live ? live.players.length : 0,
                gameState: live ? live.gameState : 'waiting'
            };
        });
        res.status(200).json(list);
    } catch (error) {
        console.error('Canlı Masa Listeleme Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

module.exports = router;