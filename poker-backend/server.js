require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { connectDB } = require('./config/db');
const startCronJobs = require('./cron/chipReset');
const authRoutes = require('./routes/auth');
const tableRoutes = require('./routes/table');
const adminRoutes = require('./routes/admin');
const PokerTable = require('./game/PokerTable');
const User = require('./models/User'); 

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/admin', adminRoutes);

connectDB();
startCronJobs();

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

const activeTables = new Map();

async function saveTableToDB(table) {
    try {
        const promises = table.players.map(player => User.update({ chips: player.chips }, { where: { id: player.id } }));
        await Promise.all(promises);
    } catch (error) { console.error('Kaydedilemedi:', error); }
}

function broadcastTableUpdate(io, table) {
    const roomName = `table_${table.id}`;
    io.to(roomName).emit('tableUpdated', table.getPublicState());
    table.players.forEach(player => {
        if (player.status === 'playing' || player.status === 'all-in') {
            const currentHandRank = table.evaluatePlayerHand(player);
            if (currentHandRank) io.to(player.socketId).emit('handRankUpdate', { rank: currentHandRank });
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
    
// 👁️ MASAYI GÖRÜNTÜLEME (VE YENİDEN BAŞLANMA KONTROLÜ)
    socket.on('viewTable', async (tableId) => {
        const table = await getOrCreateTable(tableId);
        if (!table) return socket.emit('error', 'Masa bulunamadı!');
        
        // 🛠️ DÜZELTME: Eğer oyuncu zaten masadaysa (sayfa yenilediyse), 
        // yeni Socket ID'sini masaya kaydet ve gizli kartlarını ona hemen geri yolla!
        const existingPlayer = table.players.find(p => p.id === socket.user.id);
        if (existingPlayer) {
            existingPlayer.socketId = socket.id; // Yeni bağlantı ID'sini güncelle
            if (existingPlayer.cards && existingPlayer.cards.length > 0) {
                socket.emit('receiveCards', { cards: existingPlayer.cards });
            }
        }
        
        socket.join(`table_${tableId}`); 
        socket.tableId = tableId; 
        socket.emit('tableUpdated', table.getPublicState()); 
    });

    // 🪑 MASAYA OTURMA
    socket.on('joinTable', async (tableId) => {
        const table = await getOrCreateTable(tableId);
        if (!table) return socket.emit('error', 'Masa bulunamadı!');

        const existingPlayer = table.players.find(p => p.id === socket.user.id);
        
        if (existingPlayer) {
            // 🛠️ DÜZELTME: Oyuncu zaten masadayken butona basarsa ID'sini güncelle ve kartlarını yolla
            existingPlayer.socketId = socket.id;
            if (existingPlayer.cards && existingPlayer.cards.length > 0) {
                socket.emit('receiveCards', { cards: existingPlayer.cards });
            }
            // Zaten masada olduğunu bildir
            socket.emit('error', 'Zaten bu masadasınız!');
        } else {
            // Masada değilse sıfırdan oturt
            const dbUser = await User.findByPk(socket.user.id);
            const joinResult = table.addPlayer({
                id: socket.user.id, username: socket.user.username,
                chips: dbUser.chips, socketId: socket.id
            });

            if (!joinResult.success) return socket.emit('error', joinResult.message);
        }

        socket.tableId = tableId;
        socket.join(`table_${tableId}`);
        broadcastTableUpdate(io, table);
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
            io.to(`table_${tableId}`).emit('actionBroadcast', { username: socket.user.username, action: action });
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
        if (socket.tableId) {
            const table = activeTables.get(socket.tableId);
            if (table) {
                const leavingPlayer = table.players.find(p => p.id === socket.user.id);
                if (leavingPlayer) {
                    // Chip'leri kaydet
                    await User.update({ chips: leavingPlayer.chips }, { where: { id: leavingPlayer.id } });

                    const hadProposal = !!table.activeProposal;

                    // Oyun devam ediyorsa, oyuncuyu otomatik fold et
                    if (table.gameState !== 'waiting' && table.gameState !== 'finished') {
                        if (leavingPlayer.status === 'playing') {
                            console.log(`Oyuncu ${leavingPlayer.username} bağlantısı koptu, otomatik fold edildi.`);
                            table.handleAction(leavingPlayer.id, 'fold');
                            broadcastTableUpdate(io, table);
                        }
                    } else {
                        // Oyun başlamamışsa veya bitmişse oyuncuyu masadan çıkar
                        table.removePlayer(socket.user.id);

                        // Oylama iptal edildiyse bildir
                        if (hadProposal && !table.activeProposal) {
                            io.to(`table_${socket.tableId}`).emit('voteResult', {
                                passed: false,
                                cancelled: true,
                                message: 'Oylama iptal edildi (oyuncu ayrıldı).'
                            });
                        }

                        broadcastTableUpdate(io, table);
                    }
                }
            }
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Sunucu ${PORT} portunda hazır.`));