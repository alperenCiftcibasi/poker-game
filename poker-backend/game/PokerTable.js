const Deck = require('./Deck');
const Hand = require('pokersolver').Hand;

class PokerTable {
    constructor(id, maxPlayers, smallBlind, bigBlind, updateCallback) {
        this.id = id;
        this.maxPlayers = maxPlayers;
        this.smallBlind = smallBlind;
        this.bigBlind = bigBlind;
        this.updateCallback = updateCallback;
        this.resetTimer = null;
        
        this.turnTimer = null;
        this.turnEndTime = null; 
        
        this.players = []; 
        this.deck = new Deck(); 
        this.communityCards = []; 
        this.pot = 0; 
        
        this.gameState = 'waiting'; 
        this.currentTurnIndex = -1; 
        this.winners = []; 
    }

    _convertCard(card) {
        let r = card.rank;
        if (r === '10') r = 'T';
        const suitMap = { hearts: 'h', diamonds: 'd', clubs: 'c', spades: 's' };
        return `${r}${suitMap[card.suit]}`;
    }

    evaluatePlayerHand(player) {
        if (player.status === 'folded' || player.cards.length === 0) return null;
        
        // Community kartları varsa kombinasyonu hesapla
        if (this.communityCards.length > 0) {
            const combinedCards = player.cards.concat(this.communityCards);
            const convertedCards = combinedCards.map(c => this._convertCard(c));
            try { return Hand.solve(convertedCards).descr; } 
            catch (e) { return "Hesaplanıyor..."; }
        }
        
        // Pre-flop: Sadece iki kartımızı değerlendir
        const holeCards = player.cards.map(c => this._convertCard(c));
        try {
            const hand = Hand.solve(holeCards);
            // Pre-flop için özel açıklamalar
            if (holeCards.length === 2) {
                const rank1 = holeCards[0][0];
                const rank2 = holeCards[1][0];
                const suit1 = holeCards[0][1];
                const suit2 = holeCards[1][1];
                
                if (rank1 === rank2) return `Çift ${rank1}`;
                if (suit1 === suit2) return `${rank1}${rank2} Suited`;
                return `${rank1}${rank2} Offsuit`;
            }
            return hand.descr;
        } catch (e) { 
            return "Hesaplanıyor..."; 
        }
    }

    addPlayer(user) {
        if (this.gameState !== 'waiting' && this.gameState !== 'finished') {
            return { success: false, message: "Oyun devam ederken masaya oturulamaz." };
        }
        if (this.players.length >= this.maxPlayers) return { success: false, message: "Masa dolu!" };
        if (this.players.find(p => p.id === user.id)) return { success: false, message: "Zaten bu masadasınız." };
        if (user.chips <= 0) return { success: false, message: "Bakiyeniz yetersiz! Masaya oturmak için en az 1 chip'e ihtiyacınız var." };

        this.players.push({
            id: user.id, username: user.username, socketId: user.socketId, chips: user.chips,
            cards:[], currentBet: 0, status: 'waiting', hasActed: false, handDescription: '', pendingLeave: false,
            totalInvested: 0
        });

        return { success: true, message: "Masaya başarıyla oturdunuz." };
    }

    togglePendingLeave(userId) {
        const player = this.players.find(p => p.id === userId);
        if (!player) return null;
        if (this.gameState === 'waiting') {
            this.removePlayer(userId);
            return { action: 'removed' };
        }
        player.pendingLeave = !player.pendingLeave;
        return { action: 'pending', status: player.pendingLeave };
    }

    removePlayer(userId) {
        this.players = this.players.filter(p => p.id !== userId);
        if (this.players.length < 2 && this.gameState !== 'waiting') {
            this.gameState = 'waiting';
            this.pot = 0;
            this.clearTurnTimer();
            if (this.resetTimer) clearTimeout(this.resetTimer);
        }
    }

    clearTurnTimer() {
        if (this.turnTimer) clearTimeout(this.turnTimer);
        this.turnTimer = null;
        this.turnEndTime = null;
    }

    startTurnTimer() {
        this.clearTurnTimer();
        if (this.gameState === 'waiting' || this.gameState === 'finished' || this.gameState === 'showdown') return;

        this.turnEndTime = Date.now() + 30000; 
        const currentPlayer = this.players[this.currentTurnIndex];
        
        this.turnTimer = setTimeout(() => {
            if (this.gameState !== 'waiting' && this.players[this.currentTurnIndex]?.id === currentPlayer.id) {
                const maxBet = Math.max(...this.players.map(p => p.currentBet));
                const callAmount = maxBet - currentPlayer.currentBet;
                const action = callAmount === 0 ? 'call' : 'fold'; 
                this.handleAction(currentPlayer.id, action);
                if (this.updateCallback) this.updateCallback();
            }
        }, 30000);
    }

    startGame() {
        if (this.players.length < 2) return { success: false, message: "Yetersiz oyuncu!" };
        
        // Chip kontrolü: En az bir oyuncunun chip'i olmalı
        const playersWithChips = this.players.filter(p => p.chips > 0);
        if (playersWithChips.length < 2) {
            return { success: false, message: "Oyunu başlatmak için en az 2 oyuncunun chip'i olmalı!" };
        }
        
        if (this.resetTimer) clearTimeout(this.resetTimer);
        this.clearTurnTimer();

        this.gameState = 'pre-flop'; 
        this.deck = new Deck(); 
        this.communityCards = []; 
        this.pot = 0;
        this.winners = [];
        
        this.players.forEach(player => {
            player.cards =[this.deck.draw(), this.deck.draw()];
            player.status = 'playing';
            player.hasActed = false;
            player.handDescription = '';
            player.pendingLeave = false; 
            player.totalInvested = 0;
        });

        const sbPlayer = this.players[0];
        const bbPlayer = this.players[1];

        const sbAmt = Math.min(sbPlayer.chips, this.smallBlind);
        this.placeBet(sbPlayer, sbAmt);
        if (sbPlayer.chips === 0) sbPlayer.status = 'all-in';

        const bbAmt = Math.min(bbPlayer.chips, this.bigBlind);
        this.placeBet(bbPlayer, bbAmt);
        if (bbPlayer.chips === 0) bbPlayer.status = 'all-in';

        sbPlayer.hasActed = true;
        bbPlayer.hasActed = true;
        this.currentTurnIndex = 0; 

        this.startTurnTimer(); 
        return { success: true, message: "Oyun başladı!" };
    }

    placeBet(player, amount) {
        player.chips -= amount; 
        player.currentBet += amount; 
        player.totalInvested += amount;
        this.pot += amount;
    }

    handleAction(userId, action, amount = 0) {
        if (this.gameState === 'waiting' || this.gameState === 'finished') return { success: false, message: "Oyun başlamadı!" };
        const playerIndex = this.players.findIndex(p => p.id === userId);
        const player = this.players[playerIndex];
        if (playerIndex !== this.currentTurnIndex) return { success: false, message: "Sıra sizde değil!" };

        switch (action) {
            case 'fold': 
                player.status = 'folded'; 
                player.cards =[]; 
                break;
            case 'call':
                const maxBetCall = Math.max(...this.players.filter(p => p.status !== 'folded').map(p => p.currentBet));
                let callAmount = maxBetCall - player.currentBet;
                if (player.chips <= callAmount) {
                    callAmount = player.chips;
                    player.status = 'all-in';
                }
                this.placeBet(player, callAmount);
                break;
            case 'raise':
                // Frontend'den gelen amount = oyuncunun toplam bahis miktarı (currentBet dahil)
                // Oyuncu şu ana kadar bu turda ne kadar yatırdıysa onu çıkarmalıyız
                const totalBetWanted = parseInt(amount);
                let additionalBet = totalBetWanted - player.currentBet;
                
                // Eğer oyuncunun chip'i yeterli değilse, hepsini yatırır (all-in)
                if (player.chips <= additionalBet) {
                    additionalBet = player.chips;
                    player.status = 'all-in';
                }
                this.placeBet(player, additionalBet);
                break;
        }
        player.hasActed = true; 
        this.checkNextStage();
        return { success: true, message: `Hamle: ${action}` };
    }

    checkNextStage() {
        const activePlayers = this.players.filter(p => p.status !== 'folded');
        if (activePlayers.length === 1) { 
            activePlayers[0].chips += this.pot;
            this.endGame([activePlayers[0].username], "Diğerleri çekildi"); 
            return; 
        }
        
        const playingPlayers = this.players.filter(p => p.status === 'playing');
        const maxBet = Math.max(...activePlayers.map(p => p.currentBet));
        
        let streetFinished = true;
        for (let p of playingPlayers) {
            if (p.currentBet < maxBet || (!p.hasActed && playingPlayers.length > 1)) {
                streetFinished = false;
                break;
            }
        }
        
        if (streetFinished) { 
            // Bahis turu bitti. Şimdi kontrol edelim:
            // Eğer "playing" statüsünde (yani hala çipi olan ve all-in olmayan) 
            // 1 kişi veya 0 kişi kaldıysa, artık bahis yapılamaz. Kartlar otomatik açılmalı.
            if (playingPlayers.length <= 1) {
                this.startAutoRunout(); // 🆕 OTOMATİK KART AÇMA BAŞLAT
            } else {
                this.advanceToNextStreet(); // Normal akış
            }
        } else { 
            this.nextTurn(); 
        }
    }

    // 🆕 YENİ: Otomatik Kart Açma Döngüsü (5 Saniye Arayla)
    startAutoRunout() {
        this.clearTurnTimer(); // Oyuncu sürelerini durdur
        
        // Eğer oyun zaten bittiyse veya showdown ise işlem yap
        if (this.gameState === 'showdown') {
            this.determineWinner();
            return;
        }

        // Bir sonraki sokağa geç (Kart aç)
        this.advanceToNextStreet(true); // true = auto mode
        
        // Herkese güncellemeyi gönder
        if (this.updateCallback) this.updateCallback();

        // 5 Saniye sonra kendini tekrar çağır (Recursive)
        // Eğer showdown'a geldiyse, advanceToNextStreet içinde determineWinner çağrılır ve oyun biter.
        if (this.gameState !== 'finished' && this.gameState !== 'waiting') {
            setTimeout(() => {
                this.startAutoRunout();
            }, 5000); // 5 Saniye Bekleme
        }
    }

    advanceToNextStreet(isAuto = false) {
        this.players.forEach(p => { p.currentBet = 0; p.hasActed = false; });
        
        if (this.gameState === 'pre-flop') { this.gameState = 'flop'; this.communityCards.push(this.deck.draw(), this.deck.draw(), this.deck.draw()); } 
        else if (this.gameState === 'flop') { this.gameState = 'turn'; this.communityCards.push(this.deck.draw()); } 
        else if (this.gameState === 'turn') { this.gameState = 'river'; this.communityCards.push(this.deck.draw()); } 
        else if (this.gameState === 'river') { this.gameState = 'showdown'; this.determineWinner(); return; }

        // Eğer otomatik moddaysak (Auto Runout), sıra belirlemeye gerek yok, sadece kartı açıp çıkıyoruz.
        // startAutoRunout fonksiyonu döngüyü yönetecek.
        if (isAuto) return;

        const playingPlayers = this.players.filter(p => p.status === 'playing');
        
        // Bu güvenlik kontrolü: Eğer normal akışta yanlışlıkla buraya geldiysek ve bahis yapacak kimse yoksa
        if (playingPlayers.length <= 1) {
            this.startAutoRunout();
        } else {
            this.currentTurnIndex = 0; 
            while (this.currentTurnIndex < this.players.length && this.players[this.currentTurnIndex].status !== 'playing') {
                this.currentTurnIndex++;
            }
            this.startTurnTimer(); 
        }
    }

    determineWinner() {
        const activePlayers = this.players.filter(p => p.status !== 'folded');
        try {
            activePlayers.forEach(player => {
                const holeCards = player.cards.map(c => this._convertCard(c));
                const boardCards = this.communityCards.map(c => this._convertCard(c));
                player.solvedHand = Hand.solve(holeCards.concat(boardCards));
                player.handDescription = player.solvedHand.descr; 
            });

            let playersWithInvested = this.players.filter(p => p.totalInvested > 0);
            playersWithInvested.sort((a, b) => a.totalInvested - b.totalInvested);

            let winnersData =[];
            let previousInvested = 0;

            for (let i = 0; i < playersWithInvested.length; i++) {
                const p = playersWithInvested[i];
                const contribution = p.totalInvested - previousInvested;
                
                if (contribution > 0) {
                    let sidePotAmount = 0;
                    this.players.forEach(player => {
                        const take = Math.min(player.totalInvested - previousInvested, contribution);
                        if (take > 0) sidePotAmount += take;
                    });

                    const eligibleActivePlayers = activePlayers.filter(ap => ap.totalInvested >= p.totalInvested);
                    
                    if (eligibleActivePlayers.length > 1) {
                        const hands = eligibleActivePlayers.map(ap => ap.solvedHand);
                        const winningHands = Hand.winners(hands);
                        const winnersOfThisPot = eligibleActivePlayers.filter(ap => winningHands.includes(ap.solvedHand));
                        const splitAmount = Math.floor(sidePotAmount / winnersOfThisPot.length);
                        winnersOfThisPot.forEach(w => {
                            w.chips += splitAmount;
                            winnersData.push(w.username);
                        });
                    } else if (eligibleActivePlayers.length === 1) {
                        eligibleActivePlayers[0].chips += sidePotAmount;
                    }
                    previousInvested = p.totalInvested;
                }
            }

            const uniqueWinners = [...new Set(winnersData)];
            const winningNames = uniqueWinners.length > 0 ? uniqueWinners : [activePlayers[0].username];
            
            this.endGame(winningNames, "Showdown"); 
        } catch (error) { 
            console.error("Hata:", error); 
            if (activePlayers.length > 0) activePlayers[0].chips += this.pot;
            this.endGame([activePlayers[0].username], "Hata"); 
        }
    }
    
    endGame(winnerNames, reason) {
        this.gameState = 'finished';
        this.winners = winnerNames;
        this.clearTurnTimer(); 
        
        if (this.resetTimer) clearTimeout(this.resetTimer);

        this.resetTimer = setTimeout(() => {
            // Chip'i bitenleri ve ayrılmak isteyenleri masadan çıkar
            this.players = this.players.filter(p => !p.pendingLeave && p.chips > 0);
            this.pot = 0;
            this.communityCards = [];
            this.winners =[];
            this.players.forEach(p => {
                p.cards =[]; p.status = 'waiting'; p.currentBet = 0; p.handDescription = ''; p.pendingLeave = false; p.totalInvested = 0;
            });

            // En az 2 oyuncu ve en az 2 oyuncunun chip'i varsa oyunu başlat
            const playersWithChips = this.players.filter(p => p.chips > 0);
            if (this.players.length >= 2 && playersWithChips.length >= 2) { 
                this.startGame(); 
            } else { 
                this.gameState = 'waiting'; 
            }
            
            if (this.updateCallback) this.updateCallback();
        }, 15000); 
    }

    nextTurn() {
        let attempts = 0;
        do {
            this.currentTurnIndex = (this.currentTurnIndex + 1) % this.players.length;
            attempts++;
        } while (this.players[this.currentTurnIndex].status !== 'playing' && attempts < this.players.length);
        
        this.startTurnTimer(); 
    }

    getPublicState() {
        return {
            id: this.id, gameState: this.gameState, pot: this.pot, turnEndTime: this.turnEndTime, 
            communityCards: this.communityCards,
            currentTurnIndex: this.gameState === 'waiting' || this.gameState === 'finished' ? -1 : this.currentTurnIndex,
            winners: this.gameState === 'finished' ? this.winners : [],
            players: this.players.map(p => ({
                id: p.id, username: p.username, chips: p.chips, currentBet: p.currentBet, status: p.status, pendingLeave: p.pendingLeave, 
                cards: (this.gameState === 'showdown' || this.gameState === 'finished') ? p.cards : [],
                handDescription: (this.gameState === 'showdown' || this.gameState === 'finished') ? p.handDescription : '',
                hasCards: p.cards.length > 0 
            }))
        };
    }
}

module.exports = PokerTable;