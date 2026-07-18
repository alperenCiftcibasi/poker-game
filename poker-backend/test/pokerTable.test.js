const { test } = require('node:test');
const assert = require('node:assert');
const PokerTable = require('../game/PokerTable');
const { MockDeck, cards } = require('./mockDeck');

// --- Yardımcılar ---

function makeTable({ stacks = [1000, 1000, 1000], sb = 10, bb = 20, deal = [] }) {
    const table = new PokerTable(1, 8, sb, bb, null, { createDeck: () => new MockDeck(deal) });
    stacks.forEach((chips, i) => {
        table.addPlayer({ id: i + 1, username: `p${i + 1}`, socketId: `s${i + 1}`, chips });
    });
    return table;
}

function totalChips(table) {
    return table.players.reduce((sum, p) => sum + p.chips, 0) + table.pot;
}

// 3 oyuncu, herkes showdown'a kadar gidebilecek genel deste:
// p1: AsAd, p2: KsKd, p3: QsQd; board: 2h 7c 9d 3s 5c
const DEAL_3P = cards('As', 'Ad', 'Ks', 'Kd', 'Qs', 'Qd', '2h', '7c', '9d', '3s', '5c');
// 2 oyuncu: p1: AsAd, p2: KsKd; board: 2h 7c 9d 3s 5c
const DEAL_2P = cards('As', 'Ad', 'Ks', 'Kd', '2h', '7c', '9d', '3s', '5c');

// --- Testler ---

test('3 kişide blind pozisyonları ve UTG ilk söz', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    const start = totalChips(table);
    table.startGame();

    assert.strictEqual(table.dealerIndex, 0);
    assert.strictEqual(table.sbIndex, 1);
    assert.strictEqual(table.bbIndex, 2);
    assert.strictEqual(table.players[1].currentBet, 10, 'SB 10 yatırmalı');
    assert.strictEqual(table.players[2].currentBet, 20, 'BB 20 yatırmalı');
    assert.strictEqual(table.currentTurnIndex, 0, 'Preflop ilk söz UTG (dealer, 3 kişide) olmalı');
    assert.strictEqual(table.betToMatch, 20);
    assert.strictEqual(totalChips(table), start);
});

test('BB option: limp edilince BB check/raise hakkını kullanır', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();

    assert.strictEqual(table.handleAction(1, 'call').success, true); // UTG limp
    assert.strictEqual(table.handleAction(2, 'call').success, true); // SB tamamlar
    // Sokak BİTMEMELİ: BB option'ı var
    assert.strictEqual(table.gameState, 'pre-flop');
    assert.strictEqual(table.currentTurnIndex, 2, 'Sıra BB\'de olmalı');

    // BB check ederse flop açılır
    assert.strictEqual(table.handleAction(3, 'check').success, true);
    assert.strictEqual(table.gameState, 'flop');
});

test('BB option: BB raise ederse bahis yeniden açılır', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();

    table.handleAction(1, 'call');
    table.handleAction(2, 'call');
    assert.strictEqual(table.handleAction(3, 'raise', 60).success, true);
    assert.strictEqual(table.gameState, 'pre-flop');
    assert.strictEqual(table.betToMatch, 60);
    assert.strictEqual(table.players[0].hasActed, false, 'UTG yeniden konuşmalı');
    assert.strictEqual(table.players[1].hasActed, false, 'SB yeniden konuşmalı');
    assert.strictEqual(table.currentTurnIndex, 0);
});

test('Heads-up: dealer SB\'dir, preflop önce, postflop sonra konuşur', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ stacks: [1000, 1000], deal: DEAL_2P });
    table.startGame();

    assert.strictEqual(table.dealerIndex, 0);
    assert.strictEqual(table.sbIndex, 0, 'Heads-up\'ta dealer SB olmalı');
    assert.strictEqual(table.bbIndex, 1);
    assert.strictEqual(table.currentTurnIndex, 0, 'Preflop ilk söz dealer/SB');

    table.handleAction(1, 'call');
    assert.strictEqual(table.currentTurnIndex, 1, 'BB option almalı');
    table.handleAction(2, 'check');
    assert.strictEqual(table.gameState, 'flop');
    assert.strictEqual(table.currentTurnIndex, 1, 'Postflop ilk söz BB (dealer olmayan)');
});

test('Buton her elde döner (otomatik yeni el dahil)', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();
    assert.strictEqual(table.dealerId, 1);

    // Herkes fold → BB kazanır, el biter
    table.handleAction(1, 'fold');
    table.handleAction(2, 'fold');
    assert.strictEqual(table.gameState, 'finished');

    // Göster/gösterme penceresi (tek pencere, herkese aynı anda): kimse basmaz → süre dolar
    t.mock.timers.tick(12000);
    // 15sn sonra otomatik yeni el: buton bir sonraki oyuncuya geçmeli
    t.mock.timers.tick(15000);
    assert.strictEqual(table.gameState, 'pre-flop');
    assert.strictEqual(table.dealerIndex, 1);
    assert.strictEqual(table.dealerId, 2);
    assert.strictEqual(table.sbIndex, 2);
    assert.strictEqual(table.bbIndex, 0);
});

test('Dealer ayrılırsa buton uygun oyuncuya geçer', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();
    table.handleAction(1, 'fold');
    table.handleAction(2, 'fold');
    t.mock.timers.tick(12000); // göster/gösterme penceresi (tek pencere)
    t.mock.timers.tick(15000); // el 2: dealer p2

    table.handleAction(2, 'fold');
    table.handleAction(3, 'fold');
    assert.strictEqual(table.gameState, 'finished');

    // Sıradaki dealer p3 olacaktı; p3 ayrılırsa rotasyon yine tutarlı olmalı
    // (pendingLeave oyuncu da göster/gösterme penceresi alır)
    table.players.find(p => p.id === 3).pendingLeave = true;
    t.mock.timers.tick(12000);
    t.mock.timers.tick(15000);
    assert.strictEqual(table.gameState, 'pre-flop');
    assert.strictEqual(table.players.length, 2);
    assert.notStrictEqual(table.dealerId, 3, 'Ayrılan oyuncu dealer olamaz');
});

test('Raise doğrulama: geçersiz miktarlar reddedilir, pot değişmez', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();
    const potBefore = table.pot;
    const chipsBefore = table.players[0].chips;

    for (const bad of [-500, NaN, 'abc', 0, 20, 25, 30.5, undefined, null, Infinity]) {
        const res = table.handleAction(1, 'raise', bad);
        assert.strictEqual(res.success, false, `raise ${bad} reddedilmeli`);
    }

    assert.strictEqual(table.pot, potBefore, 'Pot değişmemeli');
    assert.strictEqual(table.players[0].chips, chipsBefore, 'Chip değişmemeli');
    assert.strictEqual(table.currentTurnIndex, 0, 'Sıra hâlâ UTG\'de olmalı');
    assert.strictEqual(table.players[0].hasActed, false);

    // Geçerli min-raise (betToMatch 20 + lastRaiseSize 20 = 40) kabul edilir
    assert.strictEqual(table.handleAction(1, 'raise', 40).success, true);
    assert.strictEqual(table.betToMatch, 40);
});

test('Min-raise takibi: tam raise lastRaiseSize\'ı günceller ve hasActed sıfırlar', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();

    // Flop'a ucuz gel: herkes limp, BB check
    table.handleAction(1, 'call');
    table.handleAction(2, 'call');
    table.handleAction(3, 'check');
    assert.strictEqual(table.gameState, 'flop');
    assert.strictEqual(table.currentTurnIndex, 1, 'Flop ilk söz SB');

    table.handleAction(2, 'check');
    assert.strictEqual(table.players[1].hasActed, true);

    // BB 40 açar (opening bet = raise; min 20)
    assert.strictEqual(table.handleAction(3, 'raise', 40).success, true);
    assert.strictEqual(table.betToMatch, 40);
    assert.strictEqual(table.lastRaiseSize, 40);
    assert.strictEqual(table.players[1].hasActed, false, 'Tam raise SB\'nin hasActed\'ını sıfırlamalı');

    // Sıradaki min-raise 80: 79 reddedilir, 80 kabul
    assert.strictEqual(table.handleAction(1, 'raise', 79).success, false);
    assert.strictEqual(table.handleAction(1, 'raise', 80).success, true);
    assert.strictEqual(table.lastRaiseSize, 40);
    assert.strictEqual(table.betToMatch, 80);
});

test('Kısa all-in raise bahsi yeniden açmaz', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ stacks: [1000, 160, 1000], deal: DEAL_3P });
    table.startGame();

    table.handleAction(1, 'call');
    table.handleAction(2, 'call');
    table.handleAction(3, 'check');
    assert.strictEqual(table.gameState, 'flop');

    // Flop sırası: p2(SB), p3(BB), p1
    table.handleAction(2, 'check');
    assert.strictEqual(table.handleAction(3, 'raise', 100).success, true);
    assert.strictEqual(table.handleAction(1, 'call').success, true);

    // p2'nin 140 chip'i kaldı: all-in raise-to-140 (artış 40 < lastRaiseSize 100)
    assert.strictEqual(table.handleAction(2, 'raise', 140).success, true);
    assert.strictEqual(table.players[1].status, 'all-in');
    assert.strictEqual(table.betToMatch, 140);
    assert.strictEqual(table.lastRaiseSize, 100, 'Kısa all-in lastRaiseSize değiştirmemeli');
    assert.strictEqual(table.players[2].hasActed, true, 'Kısa all-in hasActed sıfırlamamalı');
    assert.strictEqual(table.players[0].hasActed, true);

    // Kalanlar 40 farkı öder, sokak biter
    table.handleAction(3, 'call');
    table.handleAction(1, 'call');
    assert.strictEqual(table.gameState, 'turn');
});

test('All-in blind poster hiç sıra almaz', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ stacks: [1000, 5, 1000], deal: DEAL_3P });
    table.startGame();

    assert.strictEqual(table.players[1].status, 'all-in', 'SB 5 chip ile all-in olmalı');
    assert.strictEqual(table.currentTurnIndex, 0, 'İlk söz UTG');

    table.handleAction(1, 'call');
    assert.strictEqual(table.currentTurnIndex, 2, 'All-in SB atlanıp BB\'ye geçmeli');
    table.handleAction(3, 'check');

    assert.strictEqual(table.gameState, 'flop');
    assert.strictEqual(table.currentTurnIndex, 2, 'Flop ilk söz all-in SB değil BB olmalı');
});

test('Herkes all-in: otomatik açılım, aksiyonlar reddedilir, kazanan doğru', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ stacks: [100, 100], deal: DEAL_2P });
    const start = totalChips(table);
    table.startGame();

    assert.strictEqual(table.handleAction(1, 'raise', 100).success, true); // SB all-in
    assert.strictEqual(table.handleAction(2, 'call').success, true);        // BB all-in call

    // Runout başladı: flop hemen açılır, kimse hamle yapamaz
    assert.strictEqual(table.gameState, 'flop');
    assert.strictEqual(table.communityCards.length, 3);
    assert.strictEqual(table.currentTurnIndex, -1);
    assert.strictEqual(table.handleAction(1, 'raise', 50).success, false);
    assert.strictEqual(table.handleAction(2, 'check').success, false);

    t.mock.timers.tick(5000);
    assert.strictEqual(table.gameState, 'turn');
    t.mock.timers.tick(5000);
    assert.strictEqual(table.gameState, 'river');
    t.mock.timers.tick(5000);
    assert.strictEqual(table.gameState, 'finished');

    // AsAd, KsKd'yi yener
    assert.deepStrictEqual(table.winners, ['p1']);
    assert.strictEqual(table.players[0].chips, 200);
    assert.strictEqual(table.players[1].chips, 0);
    assert.strictEqual(table.pot, 0);
    assert.strictEqual(totalChips(table), start);
});

test('Side pot: 100/500/1000 stack üçlü all-in doğru dağıtılır', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ stacks: [100, 500, 1000], deal: DEAL_3P });
    const start = totalChips(table);
    table.startGame();

    // UTG(p1) 100 all-in, SB(p2) 500 all-in, BB(p3) 1000 all-in
    assert.strictEqual(table.handleAction(1, 'raise', 100).success, true);
    assert.strictEqual(table.handleAction(2, 'raise', 500).success, true);
    assert.strictEqual(table.handleAction(3, 'raise', 1000).success, true);

    t.mock.timers.tick(5000);
    t.mock.timers.tick(5000);
    t.mock.timers.tick(5000);
    assert.strictEqual(table.gameState, 'finished');

    // Ana pot 300 → p1 (AA), yan pot 800 → p2 (KK), karşılıksız 500 → p3'e iade
    assert.strictEqual(table.players[0].chips, 300);
    assert.strictEqual(table.players[1].chips, 800);
    assert.strictEqual(table.players[2].chips, 500);
    assert.strictEqual(table.pot, 0);
    assert.strictEqual(totalChips(table), start);
    assert.ok(table.winners.includes('p1'));
    assert.ok(table.winners.includes('p2'));
});

test('Bölünen potta küsurat chip butonun solundaki kazanana gider', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    // Board royal flush: fold etmeyen herkes berabere
    const deal = cards('2h', '3d', '4h', '5d', '6h', '7d', '8h', '9d', 'As', 'Ks', 'Qs', 'Js', 'Ts');
    const table = makeTable({ stacks: [1000, 1000, 1000, 1000], deal });
    const start = totalChips(table);
    table.startGame();

    // dealer=0, SB=1, BB=2, UTG=3
    table.handleAction(4, 'call'); // UTG
    table.handleAction(1, 'call'); // dealer
    table.handleAction(2, 'fold'); // SB
    table.handleAction(3, 'check'); // BB option
    assert.strictEqual(table.gameState, 'flop');

    // Her sokakta 3 oyuncu check: sıra BB(2) → UTG(3) → dealer(0)
    for (const street of ['turn', 'river', 'finished']) {
        table.handleAction(3, 'check');
        table.handleAction(4, 'check');
        table.handleAction(1, 'check');
        if (street === 'finished') break;
        assert.strictEqual(table.gameState, street);
    }
    assert.strictEqual(table.gameState, 'finished');

    // Pot 70, 3 kazanan: 23'er + 1 küsurat butonun soluna (BB, koltuk 2)
    assert.strictEqual(table.players[2].chips, 1000 - 20 + 24, 'BB küsuratı almalı');
    assert.strictEqual(table.players[0].chips, 1000 - 20 + 23);
    assert.strictEqual(table.players[3].chips, 1000 - 20 + 23);
    assert.strictEqual(table.players[1].chips, 990, 'Fold eden SB sadece blind kaybeder');
    assert.strictEqual(totalChips(table), start);
});

test('Fold ile kazanınca kazananın kartları gizli kalır', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ stacks: [1000, 1000], deal: DEAL_2P });
    table.startGame();

    table.handleAction(1, 'fold');
    assert.strictEqual(table.gameState, 'finished');
    assert.deepStrictEqual(table.winners, ['p2']);

    let state = table.getPublicState();
    for (const p of state.players) {
        assert.deepStrictEqual(p.cards, [], `${p.username} kartları gizli olmalı`);
        assert.strictEqual(p.handDescription, '');
    }
    assert.strictEqual(state.players[0].hasCards, false, 'Fold edilen koltukta kart sırtı olmamalı');
    assert.strictEqual(state.players[1].hasCards, true, 'Kart sırtı görünmeli');

    // Göster/gösterme penceresi: fold-win'de p1 (fold) ve p2 (kazanan) aynı anda karar verir
    assert.deepStrictEqual(state.showMuckDeciders, [1, 2]);

    assert.strictEqual(table.showMuckDecision(1, false).success, true); // p1 göstermedi
    assert.deepStrictEqual(table.showMuckDeciders, [2], 'Karar veren listeden düşer');

    assert.strictEqual(table.showMuckDecision(2, true).success, true); // p2 gösterdi
    state = table.getPublicState();
    assert.strictEqual(state.players[0].revealedCards.length, 0);
    assert.strictEqual(state.players[1].revealedCards.length, 2, 'Gösterilen iki kart görünmeli');
    assert.deepStrictEqual(state.showMuckDeciders, []);

    // Herkes karar verince pencere erken kapanır, reset kurulur ve yeni el başlar
    t.mock.timers.tick(15000);
    assert.strictEqual(table.gameState, 'pre-flop');
});

test('Showdown: kazanan otomatik açılır, kaybeden seçim yapar', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ stacks: [100, 100], deal: DEAL_2P });
    table.startGame();
    table.handleAction(1, 'raise', 100);
    table.handleAction(2, 'call');
    t.mock.timers.tick(5000); // turn
    t.mock.timers.tick(5000); // river
    t.mock.timers.tick(5000); // showdown

    assert.strictEqual(table.gameState, 'finished');
    let state = table.getPublicState();
    // Global açılım kalktı: cards alanı artık hep boş, gösterim revealedCards'tan
    assert.deepStrictEqual(state.players[0].cards, []);
    // Kazanan p1 (AA) otomatik açılır, el tarifi görünür
    assert.strictEqual(state.players[0].revealedCards.length, 2);
    assert.notStrictEqual(state.players[0].handDescription, '');
    // Kaybeden p2 gizli; pencere onda
    assert.strictEqual(state.players[1].revealedCards.length, 0);
    assert.strictEqual(state.players[1].handDescription, '');
    assert.deepStrictEqual(state.showMuckDeciders, [2]);

    // p2 gösterirse el tarifi de görünür (showdown contender'ı)
    assert.strictEqual(table.showMuckDecision(2, true).success, true);
    state = table.getPublicState();
    assert.strictEqual(state.players[1].revealedCards.length, 2);
    assert.notStrictEqual(state.players[1].handDescription, '');
    assert.deepStrictEqual(state.showMuckDeciders, []);
});

test('Geçersiz aksiyon ve bahis karşısında check reddedilir', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();

    assert.strictEqual(table.handleAction(1, 'bet', 100).success, false);
    assert.strictEqual(table.handleAction(1, 'allin').success, false);
    assert.strictEqual(table.handleAction(1, 'check').success, false, 'Bahis varken check yapılamaz');
    assert.strictEqual(table.currentTurnIndex, 0, 'Sıra ilerlememeli');
    assert.strictEqual(table.players[0].hasActed, false, 'hasActed değişmemeli');

    // Sırası olmayan oyuncu da hamle yapamaz
    assert.strictEqual(table.handleAction(2, 'call').success, false);
});

test('Süre dolunca bahis yoksa check, varsa fold yapılır', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    const start = totalChips(table);
    table.startGame();

    // UTG bahis karşısında (20): süre dolunca fold
    t.mock.timers.tick(30000);
    assert.strictEqual(table.players[0].status, 'folded');

    // SB de 10 fark ödemeli: süre dolunca fold → BB fold-win
    t.mock.timers.tick(30000);
    assert.strictEqual(table.players[1].status, 'folded');
    assert.strictEqual(table.gameState, 'finished');
    assert.deepStrictEqual(table.winners, ['p3']);
    assert.strictEqual(totalChips(table), start);
});

test('Süre dolunca bahis eşitse auto-check el devam eder', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();

    table.handleAction(1, 'call');
    table.handleAction(2, 'call');
    table.handleAction(3, 'check');
    assert.strictEqual(table.gameState, 'flop');

    // Flop'ta SB'nin süresi dolar: check yapılır, fold edilmez
    t.mock.timers.tick(30000);
    assert.strictEqual(table.players[1].status, 'playing');
    assert.strictEqual(table.players[1].hasActed, true);
    assert.strictEqual(table.currentTurnIndex, 2, 'Sıra BB\'ye geçmeli');
});

test('Çift eşitlikte pot ikiye bölünür', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    // İki oyuncu da board'u oynar (board straight): AsKs vs QhJh, board 5c 6d 7h 8s 9c
    const deal = cards('2s', '3d', '2d', '3s', '5c', '6d', '7h', '8s', '9c');
    const table = makeTable({ stacks: [500, 500], deal });
    const start = totalChips(table);
    table.startGame();

    table.handleAction(1, 'call');
    table.handleAction(2, 'check');
    for (let street = 0; street < 3; street++) {
        table.handleAction(2, 'check');
        table.handleAction(1, 'check');
    }
    assert.strictEqual(table.gameState, 'finished');
    assert.strictEqual(table.players[0].chips, 500);
    assert.strictEqual(table.players[1].chips, 500);
    assert.strictEqual(totalChips(table), start);
    assert.strictEqual(table.winners.length, 2);
});

test('All-in call: yetersiz chip ile call stack kadar öder', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ stacks: [1000, 1000, 50], deal: DEAL_3P });
    const start = totalChips(table);
    table.startGame();

    table.handleAction(1, 'raise', 200);
    table.handleAction(2, 'fold');
    // BB'nin 30 chip'i kaldı (20 blind sonrası): call → all-in 50 toplam
    assert.strictEqual(table.handleAction(3, 'call').success, true);
    assert.strictEqual(table.players[2].status, 'all-in');
    assert.strictEqual(table.players[2].totalInvested, 50);

    // p1'in karşılıksız 150'si showdown'da iade edilmeli
    t.mock.timers.tick(5000);
    t.mock.timers.tick(5000);
    t.mock.timers.tick(5000);
    assert.strictEqual(table.gameState, 'finished');
    // p1 (AA) kazanır: ana pot 50+50+10(SB) = 110 + iade 150
    assert.strictEqual(table.players[0].chips, 1000 - 200 + 150 + 110);
    assert.strictEqual(table.players[2].chips, 0);
    assert.strictEqual(totalChips(table), start);
});

test('Raise-to stack üstüyse all-in\'e kırpılır', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ stacks: [100, 1000, 1000], deal: DEAL_3P });
    table.startGame();

    // p1'in 100 chip'i var, 5000'e raise dener → 100 all-in olur
    assert.strictEqual(table.handleAction(1, 'raise', 5000).success, true);
    assert.strictEqual(table.players[0].status, 'all-in');
    assert.strictEqual(table.players[0].chips, 0);
    assert.strictEqual(table.betToMatch, 100);
});

test('getPublicState oyun sırasında rakip kartlarını sızdırmaz', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();

    const state = table.getPublicState();
    for (const p of state.players) {
        assert.deepStrictEqual(p.cards, [], 'Aktif elde kartlar gizli olmalı');
        assert.strictEqual(p.hasCards, true);
    }
    assert.strictEqual(state.betToMatch, 20);
    assert.strictEqual(state.minRaiseTo, 40);
    assert.strictEqual(state.players[0].isDealer, true);
    assert.strictEqual(state.players[1].isSB, true);
    assert.strictEqual(state.players[2].isBB, true);
});

// --- El sonu "göster/gösterme" sırası ---

test('Fold kartları motorda saklanır ama dışarı sızmaz', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();

    table.handleAction(1, 'fold');
    assert.strictEqual(table.players[0].cards.length, 2, 'Motor kartları saklamalı');

    const state = table.getPublicState();
    assert.deepStrictEqual(state.players[0].cards, []);
    assert.strictEqual(state.players[0].hasCards, false, 'Fold edilen koltukta kart sırtı olmamalı');
    assert.deepStrictEqual(state.players[0].revealedCards, []);

    // Fold eden el sırasında kart açamaz (gösterme şansı el sonunda gelir)
    assert.strictEqual(table.revealCards(1, [0]).success, false);
});

test('Fold-win: kimse otomatik açılmaz, herkese tek pencere aynı anda, timeout=gösterme', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();

    table.handleAction(1, 'fold');
    table.handleAction(2, 'fold');
    assert.strictEqual(table.gameState, 'finished'); // p3 fold-win

    let state = table.getPublicState();
    assert.ok(state.players.every(p => p.revealedCards.length === 0), 'Kimse otomatik açılmamalı');
    // Fold-win'de kazanan dahil herkes aynı anda karar verebilir
    assert.deepStrictEqual(state.showMuckDeciders, [1, 2, 3]);
    assert.ok(state.turnEndTime > 0, 'Pencere geri sayımı yayınlanmalı');

    t.mock.timers.tick(12000); // pencere süresi doldu → kimse göstermedi

    state = table.getPublicState();
    assert.deepStrictEqual(state.showMuckDeciders, []);
    assert.strictEqual(state.turnEndTime, null);
    assert.ok(state.players.every(p => p.revealedCards.length === 0), 'Timeout gösterme sayılmalı');

    t.mock.timers.tick(15000);
    assert.strictEqual(table.gameState, 'pre-flop', 'Pencere bitince reset kurulup yeni el başlamalı');
});

test('Fold-win: kazanan isterse kartını açabilir', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();

    table.handleAction(1, 'fold');
    table.handleAction(2, 'fold');
    assert.strictEqual(table.gameState, 'finished'); // p3 fold-win
    assert.deepStrictEqual(table.winners, ['p3']);

    // Kazanan p3 karar penceresinde ve otomatik açılmamış
    assert.ok(table.showMuckDeciders.includes(3), 'Kazanan da karar penceresinde olmalı');
    assert.strictEqual(table.getPublicState().players[2].revealedCards.length, 0);

    // İsterse gösterebilir → kartları herkese açılır
    const res = table.showMuckDecision(3, true);
    assert.strictEqual(res.success, true, 'Kazanan gösterebilmeli');
    assert.strictEqual(res.revealedCards.length, 2);

    const state = table.getPublicState();
    assert.strictEqual(state.players[2].revealedCards.length, 2,
        'Kazananın açtığı kartlar public state\'te görünmeli');
    assert.ok(!state.showMuckDeciders.includes(3), 'Karar veren listeden düşmeli');
});

test('showMuckDecision: yanlış durumda reddedilir, fold edenin el tarifi görünmez', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();

    // Oyun sürerken reddedilir
    assert.strictEqual(table.showMuckDecision(1, true).success, false);

    table.handleAction(1, 'fold');
    table.handleAction(2, 'fold');
    assert.deepStrictEqual(table.showMuckDeciders, [1, 2, 3]);

    // p1 (fold etmişti) gösterir: iki kart açılır ama el tarifi yine gizli
    const res = table.showMuckDecision(1, true);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.revealedCards.length, 2);
    const state = table.getPublicState();
    assert.strictEqual(state.players[0].revealedCards.length, 2);
    assert.strictEqual(state.players[0].handDescription, '', 'Fold edenin el tarifi görünmemeli');
    assert.deepStrictEqual(state.showMuckDeciders, [2, 3], 'Karar veren listeden düşer');

    // Aynı oyuncu tekrar karar veremez
    assert.strictEqual(table.showMuckDecision(1, false).success, false);
});

test('Bağlantısı kopan oyuncu göster/gösterme penceresine alınmaz', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();

    table.markDisconnected(2);
    table.handleAction(1, 'fold');
    table.handleAction(2, 'fold');
    assert.strictEqual(table.gameState, 'finished');

    // Kopuk p2 dışarıda; p1 ve p3 karar verebilir
    assert.deepStrictEqual(table.showMuckDeciders, [1, 3]);
});

test('El içinde iki kartını açan oyuncu pencereye girmez, kartları açık kalır', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();

    assert.strictEqual(table.revealCards(1, [0, 1]).success, true);
    table.handleAction(1, 'fold');
    table.handleAction(2, 'fold');
    assert.strictEqual(table.gameState, 'finished');

    // p1'in iki kartı zaten açık → pencereye alınmaz; p2 ve p3 alınır
    assert.deepStrictEqual(table.showMuckDeciders, [2, 3]);
    assert.strictEqual(table.getPublicState().players[0].revealedCards.length, 2,
        'Fold öncesi açılan kartlar açık kalmalı');
});

test('Pencere açıkken manuel startGame sekansı temiz iptal eder', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const table = makeTable({ deal: DEAL_3P });
    table.startGame();
    table.handleAction(1, 'fold');
    table.handleAction(2, 'fold');
    assert.deepStrictEqual(table.showMuckDeciders, [1, 2, 3]);

    // Yeni el pencere ortasında manuel başlatılır (server.js finished'ta izin veriyor)
    assert.strictEqual(table.startGame().success, true);
    assert.strictEqual(table.gameState, 'pre-flop');
    assert.deepStrictEqual(table.showMuckDeciders, []);

    // Bayat pencere timer'ı yeni ele dokunmamalı
    t.mock.timers.tick(12000);
    assert.strictEqual(table.gameState, 'pre-flop');
    assert.deepStrictEqual(table.showMuckDeciders, []);
});
