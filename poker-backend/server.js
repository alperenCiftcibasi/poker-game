require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');

// B15: JWT_SECRET olmadan sunucu güvenli çalışamaz — boot'ta durdur.
if (!process.env.JWT_SECRET) {
    console.error('❌ JWT_SECRET tanımlı değil. Sunucu başlatılamıyor. .env dosyanıza güçlü bir JWT_SECRET ekleyin.');
    process.exit(1);
}

// CORS için izin verilen origin(ler). Varsayılan tüm originlere açık (LAN/dev için pratik).
// '*' tüm originlere izin verir. Birden çok origin virgülle ayrılarak verilebilir
// (ör. Vercel prod domain + preview): CORS_ORIGIN=https://a.vercel.app,https://b.vercel.app
const rawCorsOrigin = process.env.CORS_ORIGIN || '*';
const CORS_ORIGIN = rawCorsOrigin === '*'
    ? '*'
    : rawCorsOrigin.split(',').map(o => o.trim()).filter(Boolean);

const { connectDB } = require('./config/db');
const startCronJobs = require('./cron/chipReset');
const authRoutes = require('./routes/auth');
const tableRoutes = require('./routes/table');
const adminRoutes = require('./routes/admin');
const PokerTable = require('./game/PokerTable');
const { activeTables, findSeatedTable } = require('./game/tableRegistry');
const { buildLobbyList } = require('./game/lobbyList');
const User = require('./models/User');

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/admin', adminRoutes);

// 🩺 Sağlık kontrolü / keep-alive endpoint'i. Render free tier ~15dk boştan sonra
// uyur; UptimeRobot/cron-job.org bu route'a periyodik istek atarak instance'ı
// uyanık tutar (soğuk başlangıcı ve RAM'deki oyun durumunun sıfırlanmasını önler).
// SPA fallback'ten ÖNCE tanımlanır ki index.html ile gölgelenmesin.
app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// 🌐 PRODUCTION BUILD SERVİSİ: frontend derlenmişse tek porttan servis et.
// Express 5'te `app.get('*')` geçersiz olduğundan SPA fallback API route'larından
// SONRA app.use() ile kaydedilir; /api istekleri bu fallback'e düşmez.
const buildPath = path.join(__dirname, '../poker-frontend/build');
if (fs.existsSync(path.join(buildPath, 'index.html'))) {
    app.use(express.static(buildPath));
    app.use((req, res, next) => {
        if (req.method === 'GET' && !req.path.startsWith('/api')) {
            return res.sendFile(path.join(buildPath, 'index.html'));
        }
        next();
    });
    console.log('✅ Frontend build bulundu — tek porttan servis ediliyor.');
}

connectDB();
startCronJobs();

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"] } });

// HTTP route'lar (ör. masa silme) io'ya req.app.get('io') ile erişir.
app.set('io', io);

// DB invariant'ı: User.chips = kasa + masa. Her persist yolunda bankChips + chips yazılır.
async function saveTableToDB(table) {
    try {
        const promises = table.players.map(player =>
            User.update({ chips: (player.bankChips || 0) + player.chips }, { where: { id: player.id } })
        );
        await Promise.all(promises);
    } catch (error) { console.error('Kaydedilemedi:', error); }
}

function broadcastTableUpdate(io, table) {
    const roomName = `table_${table.id}`;
    io.to(roomName).emit('tableUpdated', table.getPublicState());
    table.players.forEach(player => {
        if (player.status === 'playing' || player.status === 'all-in') {
            const handInfo = table.evaluatePlayerHand(player);
            if (handInfo) io.to(player.socketId).emit('handRankUpdate', { rank: handInfo.rank, comboCards: handInfo.comboCards });
        }
    });
}

// 📌 YARDIMCI FONKSİYON: Masa Oluşturma ve Otomatik Kart Dağıtma
async function getOrCreateTable(tableId) {
    if (!activeTables.has(tableId)) {
        const dbTable = await require('./models/Table').findByPk(tableId);
        if (!dbTable) return null;

        const pokerTable = new PokerTable(tableId, dbTable.maxPlayers, dbTable.smallBlind, dbTable.bigBlind, () => {
            const t = activeTables.get(tableId);
            if(t) {
                // EĞER OYUN OTOMATİK BAŞLADIYSA KARTLARI DAĞIT
                if (t.gameState === 'pre-flop') {
                    t.players.forEach(p => {
                        io.to(p.socketId).emit('receiveCards', { cards: p.cards });
                    });
                    console.log(`Masa ${tableId} OTOMATİK olarak yeni tura başladı!`);
                }
                broadcastTableUpdate(io, t);
                // B19: timer-fold / runout / otomatik-restart ile biten ellerde çipleri persist et
                if (t.gameState === 'finished') {
                    saveTableToDB(t).catch(err => console.error('Otomatik persist hatası:', err));
                }
            }
        });

        pokerTable.minBuyIn = dbTable.minBuyIn || 0;
        pokerTable.maxBuyIn = dbTable.maxBuyIn || 0;

        activeTables.set(tableId, pokerTable);
    }
    return activeTables.get(tableId);
}

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Token bulunamadı!'));
    try {
        socket.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) { return next(new Error('Geçersiz token!')); }
});

io.on('connection', (socket) => {

// 🏛️ LOBİ MASA LİSTESİ
// Lobi bunu 5 sn'de bir çağırıyor. HTTP yerine socket'ten gitmesinin sebebi tünelin
// (ngrok) aylık HTTP istek kotası — kurulu bir WebSocket içindeki mesajlar sayılmıyor.
    socket.on('getLobbyTables', async (cb) => {
        if (typeof cb !== 'function') return;
        try {
            cb({ tables: await buildLobbyList() });
        } catch (error) {
            console.error('Lobi Listeleme Hatası:', error);
            cb({ error: 'Masalar yüklenemedi.' });
        }
    });

// 👁️ MASAYI GÖRÜNTÜLEME (VE YENİDEN BAŞLANMA KONTROLÜ)
    socket.on('viewTable', async (tableId) => {
        // Faz 5: Farklı bir masaya geçildiyse önceki odadan ayrıl (bayat broadcast'leri engelle)
        if (socket.tableId && String(socket.tableId) !== String(tableId)) {
            socket.leave(`table_${socket.tableId}`);
        }

        const table = await getOrCreateTable(tableId);
        if (!table) return socket.emit('error', 'Masa bulunamadı!');

        // 🛠️ DÜZELTME: Eğer oyuncu zaten masadaysa (sayfa yenilediyse),
        // yeni Socket ID'sini masaya kaydet ve gizli kartlarını ona hemen geri yolla!
        const existingPlayer = table.players.find(p => p.id === socket.user.id);
        let didReconnect = false;
        if (existingPlayer) {
            existingPlayer.socketId = socket.id; // Yeni bağlantı ID'sini güncelle
            if (existingPlayer.disconnected) {
                table.markReconnected(socket.user.id); // gri koltuğu geri getir
                didReconnect = true;
            }
            if (existingPlayer.cards && existingPlayer.cards.length > 0) {
                socket.emit('receiveCards', { cards: existingPlayer.cards });
                // Faz 5: el ortasında yenilemede el sıralaması da geri gelsin
                const handInfo = table.evaluatePlayerHand(existingPlayer);
                if (handInfo) socket.emit('handRankUpdate', { rank: handInfo.rank, comboCards: handInfo.comboCards });
            }
        }

        socket.join(`table_${tableId}`);
        socket.tableId = tableId;
        socket.emit('tableUpdated', table.getPublicState());
        // Masaya özel sohbet geçmişini yeni katılan sokete gönder
        socket.emit('chatHistory', table.chatHistory);
        // Yeniden bağlandıysa diğer oyuncular da koltuğun aktifleştiğini görsün
        if (didReconnect) broadcastTableUpdate(io, table);
    });

    // 💬 MASA SOHBETİ (masayı görüntüleyen herkes yazabilir — oturan + izleyici)
    socket.on('chatMessage', ({ tableId, text } = {}) => {
        const table = activeTables.get(tableId);
        if (!table) return;
        // Sadece o masayı görüntüleyen kullanıcı o masaya yazabilir
        if (String(socket.tableId) !== String(tableId)) return;
        // Basit spam koruması: mesajlar arası minimum aralık
        const now = Date.now();
        if (socket.lastChatAt && now - socket.lastChatAt < 400) return;
        socket.lastChatAt = now;

        const entry = table.addChatMessage(socket.user, text);
        if (!entry) return;
        io.to(`table_${tableId}`).emit('chatMessage', entry);
    });

    // 🪑 MASAYA OTURMA (buy-in ile)
    socket.on('joinTable', async ({ tableId, buyIn } = {}) => {
        const table = await getOrCreateTable(tableId);
        if (!table) return socket.emit('error', 'Masa bulunamadı!');

        const existingPlayer = table.players.find(p => p.id === socket.user.id);
        if (existingPlayer) {
            // Zaten masada: ID'yi tazele, yeniden bağlanmayı işle, kartları geri yolla
            existingPlayer.socketId = socket.id;
            if (existingPlayer.disconnected) table.markReconnected(socket.user.id);
            if (existingPlayer.cards && existingPlayer.cards.length > 0) {
                socket.emit('receiveCards', { cards: existingPlayer.cards });
            }
            socket.tableId = tableId;
            socket.join(`table_${tableId}`);
            broadcastTableUpdate(io, table);
            return;
        }

        // B8: Aynı kullanıcı başka bir masada oturuyorsa çip kopyalamayı engelle
        const seatedElsewhere = findSeatedTable(socket.user.id, table);
        if (seatedElsewhere) {
            return socket.emit('error', 'Zaten başka bir masada oturuyorsunuz.');
        }

        // B11: buy-in doğrulaması (kasa bakiyesine ve masa min/max'ına göre)
        const dbUser = await User.findByPk(socket.user.id);
        if (!dbUser) return socket.emit('error', 'Kullanıcı bulunamadı!');

        const bank = dbUser.chips;
        const amount = Number(buyIn);
        const min = table.minBuyIn > 0 ? table.minBuyIn : 1;
        const max = table.maxBuyIn > 0 ? table.maxBuyIn : bank;

        if (!Number.isInteger(amount) || amount < min || amount > max || amount > bank) {
            const upper = Math.min(max, bank);
            return socket.emit('error', `Geçersiz buy-in. İzin verilen aralık: ${min} - ${upper}. Kasanız: ${bank}.`);
        }

        // Masaya buyIn kadar çiple otur; kalan kasada tutulur (bankChips).
        // User.chips zaten toplam bakiyeyi (kasa + masa) tutar; oturmak toplamı değiştirmez, persist gerekmez.
        const joinResult = table.addPlayer({
            id: socket.user.id, username: socket.user.username, socketId: socket.id,
            chips: amount, bankChips: bank - amount
        });
        if (!joinResult.success) return socket.emit('error', joinResult.message);

        socket.tableId = tableId;
        socket.join(`table_${tableId}`);
        broadcastTableUpdate(io, table);
    });

    // Lobiye dönüş: masa odasından çık ki bayat masa yayınları lobiye akmasın.
    // (Koltuktan kalkma değil — o 'leaveTable'; oturan oyuncu el bitene kadar masada kalır.)
    socket.on('leaveTableView', () => {
        if (socket.tableId) {
            socket.leave(`table_${socket.tableId}`);
            socket.tableId = null;
        }
    });

    socket.on('leaveTable', (tableId) => {
        const table = activeTables.get(tableId);
        if (!table) return;

        const result = table.togglePendingLeave(socket.user.id);
        saveTableToDB(table);
        broadcastTableUpdate(io, table);
    });

    socket.on('startGame', (tableId) => {
        const table = activeTables.get(tableId);
        if (!table) return;
        if (table.gameState !== 'waiting' && table.gameState !== 'finished') return;

        // B10: sadece masada oturan bir oyuncu oyunu başlatabilir
        if (!table.players.some(p => p.id === socket.user.id)) {
            return socket.emit('error', 'Sadece masadaki oyuncular oyunu başlatabilir.');
        }

        const result = table.startGame();
        if (!result.success) {
            socket.emit('error', result.message);
        } else {
            table.players.forEach(player => {
                io.to(player.socketId).emit('receiveCards', { cards: player.cards });
            });
            broadcastTableUpdate(io, table);
            console.log(`🚀 Masa ${tableId} manuel başlatıldı.`);
        }
    });

    socket.on('playerAction', async ({ tableId, action, amount }) => {
        const table = activeTables.get(tableId);
        if (!table) return;

        const result = table.handleAction(socket.user.id, action, amount);
        if (!result.success) {
            socket.emit('error', result.message);
        } else {
            broadcastTableUpdate(io, table);
            // Faz 4.4: aksiyon logu için amount da yayınlanır (raise için "raise to" toplamı)
            // allIn: aksiyon oyuncunun tüm çipini götürdüyse (call/raise) → istemci all-in sesi çalar
            const actingPlayer = table.players.find(p => p.id === socket.user.id);
            const allIn = actingPlayer?.status === 'all-in';
            io.to(`table_${tableId}`).emit('actionBroadcast', { username: socket.user.username, action, amount, allIn });
            if (table.gameState === 'finished') await saveTableToDB(table);
        }
    });

    socket.on('revealCards', ({ tableId, cardIndices }) => {
        const table = activeTables.get(tableId);
        if (!table) return;

        const result = table.revealCards(socket.user.id, cardIndices);
        if (!result.success) {
            socket.emit('error', result.message);
        } else {
            io.to(`table_${tableId}`).emit('cardRevealed', {
                username: result.username,
                revealedCards: result.revealedCards
            });
            broadcastTableUpdate(io, table);
        }
    });

    // El sonu "göster/gösterme" kararı (sırası gelen oyuncudan)
    socket.on('showMuckDecision', ({ tableId, show } = {}) => {
        const table = activeTables.get(tableId);
        if (!table) return;

        const result = table.showMuckDecision(socket.user.id, !!show);
        if (!result.success) return socket.emit('error', result.message);

        if (result.show) {
            io.to(`table_${tableId}`).emit('cardRevealed', {
                username: result.username,
                revealedCards: result.revealedCards
            });
        } else {
            io.to(`table_${tableId}`).emit('showMuckResult', { username: result.username, show: false });
        }
        broadcastTableUpdate(io, table);
    });

    // --- MASA AYARLARI OYLAMA ---

    socket.on('proposeSettingChange', ({ tableId, setting, value }) => {
        const table = activeTables.get(tableId);
        if (!table) return socket.emit('error', 'Masa bulunamadı!');

        const result = table.proposeSettingChange(socket.user.id, setting, value);

        if (!result.success) {
            return socket.emit('error', result.message);
        }

        // Tek oyuncu - direkt uygulama
        if (result.immediate) {
            io.to(`table_${tableId}`).emit('settingChanged', {
                setting: result.setting,
                newValue: result.newValue,
                message: `${socket.user.username} ayarı değiştirdi.`
            });
            broadcastTableUpdate(io, table);
            return;
        }

        // Oylama hemen sonuçlandı (2 kişilik masada otomatik kabul gibi)
        if (result.resolved) {
            io.to(`table_${tableId}`).emit('voteResult', {
                passed: result.passed,
                setting: result.setting,
                oldValue: result.oldValue,
                newValue: result.newValue
            });
            broadcastTableUpdate(io, table);
            return;
        }

        // Normal oylama: 30sn expiry timer kur
        table.activeProposal.timer = setTimeout(() => {
            const expiryResult = table.expireProposal();
            if (expiryResult) {
                io.to(`table_${tableId}`).emit('voteResult', {
                    passed: expiryResult.passed,
                    expired: true,
                    setting: expiryResult.setting,
                    oldValue: expiryResult.oldValue,
                    newValue: expiryResult.newValue
                });
                broadcastTableUpdate(io, table);
            }
        }, 30000);

        io.to(`table_${tableId}`).emit('newProposal', table.getProposalState());
        broadcastTableUpdate(io, table);
    });

    socket.on('voteOnProposal', ({ tableId, vote }) => {
        const table = activeTables.get(tableId);
        if (!table) return socket.emit('error', 'Masa bulunamadı!');

        const result = table.voteOnProposal(socket.user.id, vote);

        if (!result.success) {
            return socket.emit('error', result.message);
        }

        if (result.resolved) {
            io.to(`table_${tableId}`).emit('voteResult', {
                passed: result.passed,
                setting: result.setting,
                oldValue: result.oldValue,
                newValue: result.newValue
            });
        }

        broadcastTableUpdate(io, table);
    });

    socket.on('disconnect', async () => {
        if (!socket.tableId) return;
        const table = activeTables.get(socket.tableId);
        if (!table) return;

        const leavingPlayer = table.players.find(p => p.id === socket.user.id);
        if (!leavingPlayer) return;

        // B8: Eski sekme koruması — sadece güncel bağlantının disconnect'i işlenir.
        // (Kullanıcı yeni bir sekme açtıysa socketId güncellenmiştir; eski sekmenin
        //  kapanması canlı oyuncuyu düşürmemelidir.)
        if (leavingPlayer.socketId !== socket.id) return;

        // Chip'leri kaydet (kasa + masa)
        await User.update(
            { chips: (leavingPlayer.bankChips || 0) + leavingPlayer.chips },
            { where: { id: leavingPlayer.id } }
        );

        if (table.gameState === 'waiting') {
            // Oyun başlamadıysa oyuncuyu hemen masadan çıkar (ghost koltuk kalmasın)
            const hadProposal = !!table.activeProposal;
            table.removePlayer(socket.user.id);
            if (hadProposal && !table.activeProposal) {
                io.to(`table_${socket.tableId}`).emit('voteResult', {
                    passed: false,
                    cancelled: true,
                    message: 'Oylama iptal edildi (oyuncu ayrıldı).'
                });
            }
            broadcastTableUpdate(io, table);
        } else {
            // B9: El sürüyor veya bitmiş bekliyor — anında fold ETME.
            // İşaretle; sırası gelince turn timer check/fold ile çözer (yeniden bağlanma
            // süresi tanır), el sonunda reset oyuncuyu masadan çıkarır.
            console.log(`Oyuncu ${leavingPlayer.username} bağlantısı koptu (işaretlendi).`);
            table.markDisconnected(socket.user.id);
            broadcastTableUpdate(io, table);
        }
    });
});

const PORT = process.env.PORT || 5000;
// '0.0.0.0' — LAN'daki diğer cihazlar (telefon vb.) host'un IP'sinden bağlanabilsin.
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu ${PORT} portunda (0.0.0.0) hazır.`));