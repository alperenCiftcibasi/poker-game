// Testler için hileli deste: kartlar DAĞITIM sırasıyla verilir.
// PokerTable dağıtım sırası: koltuk sırasına göre her oyuncuya 2 kart art arda,
// sonra flop (3), turn (1), river (1). Deck.draw() pop() kullandığı için
// liste içeride ters çevrilir.

const SUIT_MAP = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' };

// 'Ah' -> { suit: 'hearts', rank: 'A' } (10 için 'T' kullanın)
function card(code) {
    const rank = code.slice(0, -1);
    const suit = SUIT_MAP[code.slice(-1)];
    if (!suit) throw new Error(`Geçersiz kart kodu: ${code}`);
    return { suit, rank };
}

function cards(...codes) {
    return codes.map(card);
}

class MockDeck {
    constructor(cardsInDealOrder) {
        this.cards = [...cardsInDealOrder].reverse();
    }

    draw() {
        if (this.cards.length === 0) throw new Error('MockDeck bitti!');
        return this.cards.pop();
    }
}

module.exports = { MockDeck, card, cards };
