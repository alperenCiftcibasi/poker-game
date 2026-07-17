// Lobi kartlarının veri kaynağı: DB'deki masa ayarları + bellekteki canlı oyun durumu.
// Hem GET /api/tables/live hem de socket'teki 'getLobbyTables' buradan beslenir.
//
// Lobi 5 saniyede bir yenileniyor. Bunu HTTP ile yapmak ngrok'un aylık 20.000 istek
// kotasını tek bir açık sekmeyle bir günde bitiriyordu; kurulu bir WebSocket içindeki
// mesajlar ise kotaya sayılmıyor. Bu yüzden asıl yol socket, HTTP route yedekte duruyor.

const Table = require('../models/Table');
const { activeTables } = require('./tableRegistry');

async function buildLobbyList() {
    const dbTables = await Table.findAll({ order: [['id', 'ASC']] });
    return dbTables.map(t => {
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
}

module.exports = { buildLobbyList };
