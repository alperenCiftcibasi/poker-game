const { test } = require('node:test');
const assert = require('node:assert');
const PokerTable = require('../game/PokerTable');
const { activeTables, findSeatedTable } = require('../game/tableRegistry');
const { MockDeck, cards } = require('./mockDeck');

// Faz 2: kimlik (B8), el sırasında disconnect (B9), buy-in / bankChips invariant (B11).

const DEAL_3P = cards('As', 'Ad', 'Ks', 'Kd', 'Qs', 'Qd', '2h', '7c', '9d', '3s', '5c');

function makeTable({ players = [], sb = 10, bb = 20, deal = DEAL_3P } = {}) {
    const table = new PokerTable(1, 8, sb, bb, null, { createDeck: () => new MockDeck(deal) });
    players.forEach((p, i) => {
        table.addPlayer({
            id: p.id ?? i + 1,
            username: p.username ?? `p${i + 1}`,
            socketId: p.socketId ?? `s${i + 1}`,
            chips: p.chips,
            bankChips: p.bankChips ?? 0
        });
    });
    return table;
}

// Persist edilecek toplam bakiye (server.js saveTableToDB ile aynı formül)
const persistValue = (p) => (p.bankChips || 0) + p.chips;

// --- B8: Kimlik / çoklu masa reddi ---

test('findSeatedTable oturulan masayı bulur, hariç tutulanı atlar', () => {
    activeTables.clear();
    const t1 = makeTable({ players: [{ chips: 1000 }, { chips: 1000 }] });
    const t2 = makeTable({ players: [] });
    activeTables.set('a', t1);
    activeTables.set('b', t2);

    // user 1 (id 1) t1'de oturuyor
    assert.strictEqual(findSeatedTable(1), t1, 'user 1 t1\'de bulunmalı');
    assert.strictEqual(findSeatedTable(1, t1), null, 't1 hariç tutulunca başka masa yok');
    assert.strictEqual(findSeatedTable(99), null, 'oturmayan kullanıcı için null');

    activeTables.clear();
});

// --- B11: buy-in / bankChips invariant ---

test('bankChips: masa çipi + kasa = toplam bakiye korunur', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    // İki oyuncu 3000 kasadan 1000 buy-in ile oturuyor → bankChips 2000
    const table = makeTable({ players: [
        { chips: 1000, bankChips: 2000 },
        { chips: 1000, bankChips: 2000 }
    ], deal: cards('As', 'Ad', 'Ks', 'Kd', '2h', '7c', '9d', '3s', '5c') });

    // Oturma anında persist değeri = orijinal kasa (3000), değişmez
    assert.strictEqual(persistValue(table.players[0]), 3000);
    assert.strictEqual(persistValue(table.players[1]), 3000);

    const totalPersistBefore = table.players.reduce((s, p) => s + persistValue(p), 0);

    table.startGame();
    // p1 (AA) all-in, p2 call → p1 kazanır
    table.handleAction(1, 'raise', 1000);
    table.handleAction(2, 'call');
    t.mock.timers.tick(5000);
    t.mock.timers.tick(5000);
    t.mock.timers.tick(5000);
    assert.strictEqual(table.gameState, 'finished');

    // Toplam persist değeri korunmalı (çip ne yaratılır ne yok olur)
    const totalPersistAfter = table.players.reduce((s, p) => s + persistValue(p), 0);
    assert.strictEqual(totalPersistAfter, totalPersistBefore, 'Toplam bakiye korunmalı');

    // Kazanan masa çipi 2000, kasası hâlâ 2000 → toplam 4000
    const winner = table.players.find(p => p.username === 'p1');
    assert.strictEqual(winner.chips, 2000);
    assert.strictEqual(persistValue(winner), 4000);
});

// --- B9: el sırasında disconnect ---

test('markDisconnected işaretler, getPublicState yansıtır, reset masadan çıkarır', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ players: [
        { chips: 1000 }, { chips: 1000 }, { chips: 1000 }
    ] });
    table.startGame(); // dealer=0(p1/UTG), SB=1(p2), BB=2(p3)

    // p1 el sırasında bağlantısını kaybeder (anında fold edilmez)
    const marked = table.markDisconnected(1);
    assert.strictEqual(marked.disconnected, true);
    assert.strictEqual(table.players[0].status, 'playing', 'Anında fold edilmemeli');

    const state = table.getPublicState();
    assert.strictEqual(state.players[0].disconnected, true, 'getPublicState disconnected yansıtmalı');
    assert.strictEqual(state.players[1].disconnected, false);

    // El bitene kadar oyna: p1 fold, p2 fold → p3 kazanır
    table.handleAction(1, 'fold');
    table.handleAction(2, 'fold');
    assert.strictEqual(table.gameState, 'finished');

    // Göster/gösterme penceresi: kopuk p1 hariç herkese aynı anda; kimse basmaz → süre dolar
    t.mock.timers.tick(12000);
    // 15sn reset: bağlantısı kopan p1 masadan çıkarılır
    t.mock.timers.tick(15000);
    assert.ok(!table.players.some(p => p.id === 1), 'Bağlantısı kopan p1 çıkarılmalı');
    assert.strictEqual(table.players.length, 2);
});

test('markReconnected: yeniden bağlanan oyuncu reset\'te masada kalır', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ players: [
        { chips: 1000 }, { chips: 1000 }, { chips: 1000 }
    ] });
    table.startGame();

    table.markDisconnected(1);
    table.markReconnected(1); // 15sn dolmadan geri geldi
    assert.strictEqual(table.players[0].disconnected, false);

    table.handleAction(1, 'fold');
    table.handleAction(2, 'fold');
    assert.strictEqual(table.gameState, 'finished');

    t.mock.timers.tick(12000); // göster/gösterme penceresi (tek pencere, herkese aynı anda)
    t.mock.timers.tick(15000);
    assert.ok(table.players.some(p => p.id === 1), 'Yeniden bağlanan p1 masada kalmalı');
    assert.strictEqual(table.players.length, 3);
});
