const express = require('express');
const Table = require('../models/Table');
const User = require('../models/User');
const verifyToken = require('../middleware/authMiddleware'); // Güvenlik görevlimiz
const verifyAdmin = require('../middleware/adminMiddleware');
const { buildLobbyList } = require('../game/lobbyList');
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

// 🔴 MASA SİL (Sadece admin) — zorla sil + çip iade
// İçinde oturan oyuncu / süren el olsa bile siler: oturanların çipleri kasalarına
// güvenle iade edilir (invariant: User.chips = kasa + masa), masadakiler lobiye atılır.
router.delete('/:id', verifyAdmin, async (req, res) => {
    try {
        const tableId = Number(req.params.id);
        if (!Number.isInteger(tableId) || tableId <= 0) {
            return res.status(400).json({ message: 'Geçersiz masa kimliği.' });
        }

        const dbTable = await Table.findByPk(tableId);
        if (!dbTable) {
            return res.status(404).json({ message: 'Masa bulunamadı.' });
        }

        // activeTables anahtarı string de olabilir (URL'den gelmiş olabilir); ikisini de dene.
        const live = activeTables.get(tableId) || activeTables.get(String(tableId));
        const io = req.app.get('io');

        if (live) {
            // 1) Oturan oyuncuların çiplerini kasalarına iade et (para kaybı olmasın).
            await Promise.all(live.players.map(player =>
                User.update(
                    { chips: (player.bankChips || 0) + player.chips },
                    { where: { id: player.id } }
                )
            ));

            // 2) Tüm zamanlayıcıları temizle (hayalet güncelleme / sızıntı olmasın).
            live.destroy();

            // 3) Masadakilere haber ver → istemci lobiye yönlensin, sonra odayı boşalt.
            if (io) {
                io.to(`table_${tableId}`).emit('tableClosed', {
                    tableId,
                    message: 'Bu masa bir yönetici tarafından kapatıldı.'
                });
                io.socketsLeave(`table_${tableId}`);
            }

            activeTables.delete(tableId);
            activeTables.delete(String(tableId));
        }

        // 4) Masayı veritabanından sil.
        await dbTable.destroy();

        res.status(200).json({ message: 'Masa silindi.' });
    } catch (error) {
        console.error('Masa Silme Hatası:', error);
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
// Lobi normalde socket'teki 'getLobbyTables' üzerinden besleniyor; bu route yedek.
router.get('/live', verifyToken, async (req, res) => {
    try {
        res.status(200).json(await buildLobbyList());
    } catch (error) {
        console.error('Canlı Masa Listeleme Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası oluştu.' });
    }
});

module.exports = router;