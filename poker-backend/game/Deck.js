const crypto = require('node:crypto');

class Deck {
    constructor() {
        this.cards =[];
        this.reset();
        this.shuffle();
    }

    // 52 kartlık desteyi sıfırdan oluştur
    reset() {
        this.cards = [];
        const suits =['hearts', 'diamonds', 'clubs', 'spades']; // Kupa, Karo, Sinek, Maça
        const ranks =['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']; // T=10

        for (let suit of suits) {
            for (let rank of ranks) {
                this.cards.push({ suit, rank });
            }
        }
    }

    // Desteyi Karıştır (Fisher-Yates + kriptografik rastgelelik)
    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = crypto.randomInt(0, i + 1);
            // Kartların yerini değiştir
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    // Desteden en üstteki kartı çek
    draw() {
        if (this.cards.length === 0) {
            throw new Error("Deste bitti!");
        }
        return this.cards.pop(); // En sondaki (üstteki) kartı ver ve desteden çıkar
    }
}

module.exports = Deck;