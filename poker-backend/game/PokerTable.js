const Deck = require('./Deck');
const Hand = require('pokersolver').Hand;

const SHOW_MUCK_DURATION = 12000; // el sonu "göster/gösterme" penceresi (herkese aynı anda)

class PokerTable {
    constructor(id, maxPlayers, smallBlind, bigBlind, updateCallback, options = {}) {
        this.id = id;
        this.maxPlayers = maxPlayers;
        this.smallBlind = smallBlind;
        this.bigBlind = bigBlind;
        this.updateCallback = updateCallback;
        this.resetTimer = null;

        this.turnTimer = null;
        this.turnEndTime = null;

        // Test için deste enjeksiyonu
        this.createDeck = options.createDeck || (() => new Deck());

        this.players = [];
        this.deck = this.createDeck();
        this.communityCards = [];
        this.pot = 0;

        this.gameState = 'waiting';
        this.currentTurnIndex = -1;
        this.winners = [];

        // Bahis turu durumu
        this.dealerId = null;      // buton sahibinin user id'si (eller arası kalıcı)
        this.dealerIndex = -1;
        this.sbIndex = -1;
        this.bbIndex = -1;
        this.betToMatch = 0;       // bu sokakta eşitlenmesi gereken bahis
        this.lastRaiseSize = bigBlind; // son tam raise artışı (min-raise hesabı için)
        this.handNumber = 0;       // bayat timer'ları geçersiz kılmak için
        this.runoutTimer = null;

        // El sonu "göster/gösterme" penceresi (herkese aynı anda)
        this.showMuckTimer = null;
        this.showMuckDeciders = []; // henüz karar vermemiş, iki kartı açık olmayan oyuncu id'leri

        // Değiştirilebilir ayarlar
        this.turnTimerDuration = 30000;
        this.minBuyIn = 0;
        this.maxBuyIn = 0;

        // Para birimi türü ('normal' | 'tournament'). DB'den getOrCreateTable içinde set edilir.
        this.type = 'normal';

        // Oylama state'i
        this.activeProposal = null;

        // Masaya özel yazılı sohbet (son 50 mesaj bellekte tutulur; masa yaşadıkça kalır)
        this.chatHistory = [];

        // Oturma kuyruğu: masa doluyken gelen oturma talepleri burada FIFO bekler.
        // Koltuk boşaldığında (_admitFromQueue) sırayla masaya alınır.
        // Her giriş: { id, username, socketId, chips (buy-in), bankChips }
        this.joinQueue = [];
    }

    // Masaya sohbet mesajı ekler. Geçersizse null döner, geçerliyse yayınlanacak kaydı döner.
    addChatMessage(user, rawText) {
        if (typeof rawText !== 'string') return null;
        const text = rawText.trim().slice(0, 300);
        if (!text) return null;
        const entry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            userId: user.id,
            username: user.username,
            text,
            ts: Date.now()
        };
        this.chatHistory.push(entry);
        if (this.chatHistory.length > 50) this.chatHistory.shift();
        return entry;
    }

    _convertCard(card) {
        let r = card.rank;
        if (r === '10') r = 'T';
        const suitMap = { hearts: 'h', diamonds: 'd', clubs: 'c', spades: 's' };
        return `${r}${suitMap[card.suit]}`;
    }

    // fromIndex'ten sonraki (sarmalayarak) predicate'i sağlayan ilk oyuncunun indeksi; yoksa -1
    _nextIndexWhere(fromIndex, predicate) {
        const n = this.players.length;
        if (n === 0) return -1;
        for (let step = 1; step <= n; step++) {
            const idx = (fromIndex + step) % n;
            if (predicate(this.players[idx])) return idx;
        }
        return -1;
    }

    // Butonun solundan itibaren adaylar arasından ilk oyuncu (küsurat çip dağıtımı için)
    _firstFromDealer(candidates) {
        const n = this.players.length;
        for (let step = 1; step <= n; step++) {
            const p = this.players[(this.dealerIndex + step) % n];
            if (candidates.includes(p)) return p;
        }
        return candidates[0];
    }

    // Bir el (pokersolver Hand) içinde adlandırılmış kombinasyonu OLUŞTURAN kartların
    // anahtarlarını döndürür ("kicker"lar hariç). Anahtar formatı: değer+suit, ör. "Th", "As".
    // pokersolver her el tipinde önce kombinasyon kartlarını, sonra kicker'ları sıralar;
    // isme göre baştan kaç kart alacağımızı biliyoruz.
    _comboCardKeys(hand) {
        if (!hand || !Array.isArray(hand.cards)) return [];
        const COMBO_COUNTS = {
            'Straight Flush': 5, 'Four of a Kind': 4, 'Full House': 5,
            'Flush': 5, 'Straight': 5, 'Three of a Kind': 3,
            'Two Pair': 4, 'Pair': 2, 'High Card': 0
        };
        const n = COMBO_COUNTS[hand.name] != null ? COMBO_COUNTS[hand.name] : 0;
        return hand.cards.slice(0, n).map(c => `${c.value}${c.suit}`);
    }

    evaluatePlayerHand(player) {
        if (player.status === 'folded' || player.cards.length === 0) return null;

        // Community kartları varsa kombinasyonu hesapla
        if (this.communityCards.length > 0) {
            const combinedCards = player.cards.concat(this.communityCards);
            const convertedCards = combinedCards.map(c => this._convertCard(c));
            try {
                const hand = Hand.solve(convertedCards);
                return { rank: hand.descr, comboCards: this._comboCardKeys(hand) };
            }
            catch (e) { return { rank: "Hesaplanıyor...", comboCards: [] }; }
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

                // Cep çifti: iki kart da kombinasyonu oluşturur → ikisi de işaretlensin.
                if (rank1 === rank2) return { rank: `Çift ${rank1}`, comboCards: [holeCards[0], holeCards[1]] };
                if (suit1 === suit2) return { rank: `${rank1}${rank2} Suited`, comboCards: [] };
                return { rank: `${rank1}${rank2} Offsuit`, comboCards: [] };
            }
            return { rank: hand.descr, comboCards: this._comboCardKeys(hand) };
        } catch (e) {
            return { rank: "Hesaplanıyor...", comboCards: [] };
        }
    }

    // Yeni bir oturan oyuncu nesnesi (varsayılan alanlarla) üretir.
    _makeSeat(user) {
        return {
            id: user.id, username: user.username, socketId: user.socketId, chips: user.chips,
            bankChips: user.bankChips || 0, // oturma anında kasada (masa dışında) kalan çip
            cards: [], currentBet: 0, status: 'waiting', hasActed: false, handDescription: '',
            pendingLeave: false, left: false, totalInvested: 0, revealedCards: [], disconnected: false
        };
    }

    // Masaya oturt. Oyun DEVAM EDERKEN de oturulabilir: yeni oyuncu 'waiting' durumunda
    // gelir, mevcut ele DAHİL OLMAZ (kart almaz) ve el sonu mantığından dışlanır; sıradaki
    // elde (startGame) kart alır. Boş koltuk yoksa oturtulmaz — çağıran (server) bu durumda
    // talebi kuyruğa (enqueueJoin) alır.
    addPlayer(user) {
        if (this.players.length >= this.maxPlayers) return { success: false, message: "Masa dolu!" };
        if (this.players.find(p => p.id === user.id)) return { success: false, message: "Zaten bu masadasınız." };
        if (user.chips <= 0) return { success: false, message: "Bakiyeniz yetersiz! Masaya oturmak için en az 1 chip'e ihtiyacınız var." };

        this.players.push(this._makeSeat(user));
        return { success: true, message: "Masaya başarıyla oturdunuz." };
    }

    // Masa doluyken gelen oturma talebini kuyruğa alır. Buy-in miktarı talep anında
    // (server'da) doğrulanır ve saklanır; koltuk boşalınca bu miktarla masaya alınır.
    enqueueJoin(user) {
        if (this.players.find(p => p.id === user.id)) return { success: false, message: "Zaten bu masadasınız." };
        if (this.joinQueue.find(q => q.id === user.id)) return { success: false, message: "Zaten oturma sırasındasınız." };
        this.joinQueue.push({
            id: user.id, username: user.username, socketId: user.socketId,
            chips: user.chips, bankChips: user.bankChips || 0
        });
        return { success: true, queued: true, position: this.joinQueue.length };
    }

    // Kullanıcıyı oturma kuyruğundan çıkarır. Çıkarıldıysa true.
    dequeue(userId) {
        const before = this.joinQueue.length;
        this.joinQueue = this.joinQueue.filter(q => q.id !== userId);
        return this.joinQueue.length !== before;
    }

    // Boş koltuk oldukça kuyruktakileri FIFO oturt. Oturtulan girişleri döndürür.
    // Sadece oturmanın güvenli olduğu anlarda (waiting / eller arası reset) çağrılmalı;
    // eklenen oyuncular 'waiting' gelir, aktif ele karışmaz.
    _admitFromQueue() {
        const admitted = [];
        while (this.joinQueue.length > 0 && this.players.length < this.maxPlayers) {
            const q = this.joinQueue.shift();
            if (this.players.find(p => p.id === q.id)) continue; // zaten oturuyor
            if (!(q.chips > 0)) continue;                        // geçersiz buy-in
            this.players.push(this._makeSeat(q));
            admitted.push(q);
        }
        return admitted;
    }

    // El sırasında bağlantı kopması: anında fold etme; sırası gelince turn timer çözer.
    markDisconnected(userId) {
        const player = this.players.find(p => p.id === userId);
        if (player) player.disconnected = true;
        return player;
    }

    markReconnected(userId) {
        const player = this.players.find(p => p.id === userId);
        if (player) player.disconnected = false;
        return player;
    }

    togglePendingLeave(userId) {
        const player = this.players.find(p => p.id === userId);
        if (!player) {
            // Oturmuyor ama oturma kuyruğunda olabilir → kuyruktan çıkar.
            return this.dequeue(userId) ? { action: 'dequeued' } : null;
        }
        if (this.gameState === 'waiting') {
            this.removePlayer(userId);
            return { action: 'removed' };
        }
        if (this.gameState === 'finished') {
            // Oyun sonu bekleme: anında "ayrıldı" durumuna geç. Oyuncu artık katılımcı
            // sayılmaz ama el sonu bilgileri (kart/kombinasyon/stack) sıradaki ele kadar
            // koltukta "Ayrıldı" olarak durur. Sıradaki el başlarken (reset) masadan düşer.
            player.left = !player.left;
            player.pendingLeave = player.left;
            if (player.left) this._removeDecider(userId); // göster/gösterme sırasından da çıkar
            return { action: player.left ? 'left' : 'stay' };
        }
        // Aktif el sürüyor: eli bitirir, tur sonunda (reset) kalkar.
        player.pendingLeave = !player.pendingLeave;
        return { action: 'pending', status: player.pendingLeave };
    }

    removePlayer(userId) {
        this.players = this.players.filter(p => p.id !== userId);

        // Aktif oylama varsa kontrol et
        if (this.activeProposal) {
            this.activeProposal.votes.delete(userId);
            if (this.activeProposal.proposerId === userId) {
                this._clearProposal();
            } else {
                this._checkVoteResult();
            }
        }

        // Göster/gösterme penceresinden çıkar; karar bekleyen kalmazsa pencereyi kapat
        this._removeDecider(userId);

        if (this.players.length < 2 && this.gameState !== 'waiting') {
            this.gameState = 'waiting';
            this.pot = 0;
            this.currentTurnIndex = -1;
            this.clearTurnTimer();
            this._clearShowMuck();
            if (this.resetTimer) clearTimeout(this.resetTimer);
            if (this.runoutTimer) { clearTimeout(this.runoutTimer); this.runoutTimer = null; }
        }

        // Koltuk boşaldı: masa beklemedeyken kuyruktakileri hemen oturt.
        // (El sürerken removePlayer çağrılmaz; oturtma güvenli.)
        if (this.gameState === 'waiting' || this.gameState === 'finished') {
            this._admitFromQueue();
        }
    }

    clearTurnTimer() {
        if (this.turnTimer) clearTimeout(this.turnTimer);
        this.turnTimer = null;
        this.turnEndTime = null;
    }

    // Masa bellekten kaldırılırken (ör. admin silmesi) tüm zamanlayıcıları temizle;
    // aksi halde setTimeout'lar masaya referans tutar ve sızıntıya / hayalet
    // güncelleme çağrılarına yol açar.
    destroy() {
        this.clearTurnTimer();
        this._clearShowMuck();
        this._clearProposal();
        if (this.resetTimer) { clearTimeout(this.resetTimer); this.resetTimer = null; }
        if (this.runoutTimer) { clearTimeout(this.runoutTimer); this.runoutTimer = null; }
        this.updateCallback = null;
    }

    startTurnTimer() {
        this.clearTurnTimer();
        const activeStates = ['pre-flop', 'flop', 'turn', 'river'];
        if (!activeStates.includes(this.gameState)) return;
        if (this.currentTurnIndex < 0) return;

        this.turnEndTime = Date.now() + this.turnTimerDuration;
        const currentPlayer = this.players[this.currentTurnIndex];
        const handAtSchedule = this.handNumber;

        this.turnTimer = setTimeout(() => {
            if (this.handNumber !== handAtSchedule) return;
            if (this.players[this.currentTurnIndex]?.id !== currentPlayer.id) return;
            // Bahis eşitse check, değilse fold
            const action = currentPlayer.currentBet === this.betToMatch ? 'check' : 'fold';
            this.handleAction(currentPlayer.id, action);
            if (this.updateCallback) this.updateCallback();
        }, this.turnTimerDuration);
    }

    startGame() {
        if (this.players.length < 2) return { success: false, message: "Yetersiz oyuncu!" };

        // Chip kontrolü: En az iki oyuncunun chip'i olmalı
        const playersWithChips = this.players.filter(p => p.chips > 0);
        if (playersWithChips.length < 2) {
            return { success: false, message: "Oyunu başlatmak için en az 2 oyuncunun chip'i olmalı!" };
        }

        // Aktif oylama varsa iptal et
        if (this.activeProposal) {
            this._clearProposal();
        }

        if (this.resetTimer) clearTimeout(this.resetTimer);
        if (this.runoutTimer) { clearTimeout(this.runoutTimer); this.runoutTimer = null; }
        this.clearTurnTimer();
        this._clearShowMuck();

        this.handNumber++;
        this.gameState = 'pre-flop';
        this.deck = this.createDeck();
        this.communityCards = [];
        this.pot = 0;
        this.winners = [];
        this.betToMatch = 0;
        this.lastRaiseSize = this.bigBlind;

        this.players.forEach(player => {
            player.currentBet = 0;
            player.hasActed = false;
            player.handDescription = '';
            player.pendingLeave = false;
            player.totalInvested = 0;
            player.revealedCards = [];
            if (player.chips > 0) {
                player.cards = [this.deck.draw(), this.deck.draw()];
                player.status = 'playing';
            } else {
                player.cards = [];
                player.status = 'sitting-out';
            }
        });

        const isInHand = (p) => p.status === 'playing';
        const eligibleCount = this.players.filter(isInHand).length;

        // Buton rotasyonu: önceki dealer'dan sonraki uygun oyuncu
        const prevDealerSeat = this.players.findIndex(p => p.id === this.dealerId);
        if (prevDealerSeat === -1) {
            this.dealerIndex = this.players.findIndex(isInHand);
        } else {
            this.dealerIndex = this._nextIndexWhere(prevDealerSeat, isInHand);
        }
        this.dealerId = this.players[this.dealerIndex].id;

        // Blind pozisyonları: heads-up'ta dealer SB'dir
        if (eligibleCount === 2) {
            this.sbIndex = this.dealerIndex;
            this.bbIndex = this._nextIndexWhere(this.dealerIndex, isInHand);
        } else {
            this.sbIndex = this._nextIndexWhere(this.dealerIndex, isInHand);
            this.bbIndex = this._nextIndexWhere(this.sbIndex, isInHand);
        }

        const sbPlayer = this.players[this.sbIndex];
        const bbPlayer = this.players[this.bbIndex];

        const sbAmt = Math.min(sbPlayer.chips, this.smallBlind);
        this.placeBet(sbPlayer, sbAmt);
        if (sbPlayer.chips === 0) sbPlayer.status = 'all-in';

        const bbAmt = Math.min(bbPlayer.chips, this.bigBlind);
        this.placeBet(bbPlayer, bbAmt);
        if (bbPlayer.chips === 0) bbPlayer.status = 'all-in';

        // hasActed bilinçli olarak false bırakılır: BB (ve SB) preflop option'ını korur
        this.betToMatch = Math.max(sbPlayer.currentBet, bbPlayer.currentBet);
        this.lastRaiseSize = this.bigBlind;

        // Preflop ilk söz: heads-up'ta SB/dealer, 3+ oyuncuda UTG (BB'nin solu).
        // All-in olan blind'lar atlanır; kimse konuşamıyorsa doğrudan runout.
        const isPlaying = (p) => p.status === 'playing';
        let firstIdx;
        if (eligibleCount === 2) {
            firstIdx = isPlaying(sbPlayer) ? this.sbIndex : this._nextIndexWhere(this.sbIndex, isPlaying);
        } else {
            firstIdx = this._nextIndexWhere(this.bbIndex, isPlaying);
        }

        if (firstIdx === -1) {
            // Herkes blind'lardan all-in: kısa bir beklemeyle otomatik açılım başlat
            this.currentTurnIndex = -1;
            this._scheduleRunout(1500);
        } else {
            this.currentTurnIndex = firstIdx;
            this.startTurnTimer();
        }

        return { success: true, message: "Oyun başladı!" };
    }

    placeBet(player, amount) {
        player.chips -= amount;
        player.currentBet += amount;
        player.totalInvested += amount;
        this.pot += amount;
    }

    handleAction(userId, action, amount = 0) {
        const activeStates = ['pre-flop', 'flop', 'turn', 'river'];
        if (!activeStates.includes(this.gameState)) return { success: false, message: "Şu an hamle yapılamaz!" };
        if (this.currentTurnIndex === -1) return { success: false, message: "Şu an hamle yapılamaz!" };

        const playerIndex = this.players.findIndex(p => p.id === userId);
        if (playerIndex === -1) return { success: false, message: "Bu masada oturmuyorsunuz!" };
        if (playerIndex !== this.currentTurnIndex) return { success: false, message: "Sıra sizde değil!" };

        const player = this.players[playerIndex];
        if (player.status !== 'playing') return { success: false, message: "Şu an hamle yapamazsınız!" };

        switch (action) {
            case 'fold':
                // Kartlar silinmez: el sonunda "göster/gösterme" sırası için saklanır.
                // getPublicState fold edilen kartları zaten dışarı sızdırmaz.
                player.status = 'folded';
                break;

            case 'check':
                if (player.currentBet !== this.betToMatch) {
                    return { success: false, message: "Ortada bahis var, check yapamazsınız!" };
                }
                break;

            case 'call': {
                const owed = this.betToMatch - player.currentBet;
                if (owed > 0) {
                    const pay = Math.min(owed, player.chips);
                    this.placeBet(player, pay);
                    if (player.chips === 0) player.status = 'all-in';
                }
                // owed <= 0 ise check gibi davranır (frontend uyumluluğu)
                break;
            }

            case 'raise': {
                // amount = bu sokaktaki toplam hedef bahis ("raise to")
                let total = Number(amount);
                if (!Number.isInteger(total) || total <= this.betToMatch) {
                    return { success: false, message: "Geçersiz raise miktarı!" };
                }

                let additional = total - player.currentBet;
                let isAllIn = false;
                if (additional >= player.chips) {
                    additional = player.chips;
                    total = player.currentBet + additional;
                    isAllIn = true;
                }

                const minRaiseTo = this.betToMatch + this.lastRaiseSize;
                if (!isAllIn && total < minRaiseTo) {
                    return { success: false, message: `Minimum raise: ${minRaiseTo}` };
                }

                this.placeBet(player, additional);
                if (isAllIn) player.status = 'all-in';

                if (total - this.betToMatch >= this.lastRaiseSize) {
                    // Tam raise: bahis herkes için yeniden açılır
                    this.lastRaiseSize = total - this.betToMatch;
                    this.betToMatch = total;
                    this.players.forEach(p => {
                        if (p !== player && p.status === 'playing') p.hasActed = false;
                    });
                } else if (total > this.betToMatch) {
                    // Kısa all-in raise: eşitlenecek miktar artar ama bahis yeniden açılmaz
                    this.betToMatch = total;
                }
                // total <= betToMatch (all-in kırpması sonrası): bu bir all-in call'dur, durum değişmez
                break;
            }

            default:
                return { success: false, message: "Geçersiz hamle!" };
        }

        player.hasActed = true;
        this.checkNextStage();
        return { success: true, message: `Hamle: ${action}` };
    }

    checkNextStage() {
        // El içindeki "hâlâ yarışan" oyuncular = playing + all-in.
        // (El ortasında oturan 'waiting' oyuncular ve 'sitting-out'/'folded' dışlanır;
        //  aksi halde herkes fold edince tek kalanı bulan aşağıdaki kontrol şaşardı.)
        const activePlayers = this.players.filter(p => p.status === 'playing' || p.status === 'all-in');
        if (activePlayers.length === 1) {
            // Herkes çekildi: pot tek kalana, kartlar açılmadan
            activePlayers[0].chips += this.pot;
            this.pot = 0;
            this.endGame([activePlayers[0].username], "Diğerleri çekildi");
            return;
        }

        const playingPlayers = this.players.filter(p => p.status === 'playing');
        const roundDone = playingPlayers.every(p => p.hasActed && p.currentBet === this.betToMatch);

        if (!roundDone) {
            this.nextTurn();
            return;
        }

        if (playingPlayers.length <= 1) {
            // Bahis yapabilecek en fazla 1 kişi kaldı: kartlar otomatik açılır
            this.startAutoRunout();
        } else {
            this.advanceToNextStreet();
        }
    }

    _scheduleRunout(delay) {
        if (this.runoutTimer) clearTimeout(this.runoutTimer);
        const handAtSchedule = this.handNumber;
        this.runoutTimer = setTimeout(() => {
            this.runoutTimer = null;
            if (this.handNumber !== handAtSchedule) return;
            this.startAutoRunout();
        }, delay);
    }

    // Otomatik kart açma döngüsü (5 saniye arayla)
    startAutoRunout() {
        this.clearTurnTimer();
        this.currentTurnIndex = -1; // runout sırasında kimse hamle yapamaz

        if (this.gameState === 'showdown') {
            this.determineWinner();
            return;
        }

        this.advanceToNextStreet(true); // true = auto mode
        if (this.updateCallback) this.updateCallback();

        if (this.gameState !== 'finished' && this.gameState !== 'waiting') {
            this._scheduleRunout(5000);
        }
    }

    advanceToNextStreet(isAuto = false) {
        this.players.forEach(p => { p.currentBet = 0; p.hasActed = false; });
        this.betToMatch = 0;
        this.lastRaiseSize = this.bigBlind;

        if (this.gameState === 'pre-flop') { this.gameState = 'flop'; this.communityCards.push(this.deck.draw(), this.deck.draw(), this.deck.draw()); }
        else if (this.gameState === 'flop') { this.gameState = 'turn'; this.communityCards.push(this.deck.draw()); }
        else if (this.gameState === 'turn') { this.gameState = 'river'; this.communityCards.push(this.deck.draw()); }
        else if (this.gameState === 'river') { this.gameState = 'showdown'; this.determineWinner(); return; }
        else { return; }

        if (isAuto) return;

        // Postflop ilk söz: butonun solundan itibaren ilk aktif oyuncu
        // (heads-up'ta dealer+1 = BB olduğundan dealer doğal olarak son konuşur)
        const first = this._nextIndexWhere(this.dealerIndex, p => p.status === 'playing');
        if (first === -1) {
            this.startAutoRunout();
            return;
        }
        this.currentTurnIndex = first;
        this.startTurnTimer();
    }

    determineWinner() {
        const contenders = this.players.filter(p =>
            p.status !== 'folded' && p.status !== 'sitting-out' && p.cards.length > 0
        );
        const payouts = new Map(); // userId -> kazanılan miktar
        let winnersData = [];

        try {
            if (contenders.length === 0) throw new Error("Showdown'da oyuncu kalmadı");

            if (contenders.length === 1) {
                payouts.set(contenders[0].id, this.pot);
                winnersData.push(contenders[0].username);
            } else {
                contenders.forEach(player => {
                    const holeCards = player.cards.map(c => this._convertCard(c));
                    const boardCards = this.communityCards.map(c => this._convertCard(c));
                    player.solvedHand = Hand.solve(holeCards.concat(boardCards));
                    player.handDescription = player.solvedHand.descr;
                });

                // Yatırım seviyelerine göre katmanlı pot dağıtımı (side pot)
                const invested = this.players.filter(p => p.totalInvested > 0);
                const levels = [...new Set(invested.map(p => p.totalInvested))].sort((a, b) => a - b);

                let previous = 0;
                for (const level of levels) {
                    const contribution = level - previous;
                    let potAmount = 0;
                    invested.forEach(p => {
                        potAmount += Math.min(Math.max(p.totalInvested - previous, 0), contribution);
                    });

                    const eligibles = contenders.filter(p => p.totalInvested >= level);
                    if (eligibles.length > 1) {
                        const winningHands = Hand.winners(eligibles.map(p => p.solvedHand));
                        const potWinners = eligibles.filter(p => winningHands.includes(p.solvedHand));
                        const share = Math.floor(potAmount / potWinners.length);
                        const remainder = potAmount - share * potWinners.length;

                        potWinners.forEach(w => {
                            payouts.set(w.id, (payouts.get(w.id) || 0) + share);
                            winnersData.push(w.username);
                        });
                        // Küsurat çip: butonun solundan itibaren ilk kazanana
                        if (remainder > 0) {
                            const oddChipWinner = this._firstFromDealer(potWinners);
                            payouts.set(oddChipWinner.id, (payouts.get(oddChipWinner.id) || 0) + remainder);
                        }
                    } else if (eligibles.length === 1) {
                        // Karşılanmayan bahis iadesi (uncalled bet)
                        payouts.set(eligibles[0].id, (payouts.get(eligibles[0].id) || 0) + potAmount);
                    }
                    previous = level;
                }
            }

            const totalPaid = [...payouts.values()].reduce((a, b) => a + b, 0);
            if (totalPaid !== this.pot) {
                console.error(`[Masa ${this.id}] Pot dağıtım uyuşmazlığı: pot=${this.pot}, dağıtılan=${totalPaid}`);
            }
        } catch (error) {
            console.error(`[Masa ${this.id}] Kazanan belirlenirken hata:`, error);
            // Güvenli geri dönüş: herkese kendi yatırımı iade edilir
            payouts.clear();
            winnersData = [];
            this.players.forEach(p => {
                if (p.totalInvested > 0) payouts.set(p.id, p.totalInvested);
            });
        }

        // Ödemeleri tek geçişte uygula
        payouts.forEach((amount, userId) => {
            const p = this.players.find(pl => pl.id === userId);
            if (p) p.chips += amount;
        });
        this.pot = 0;

        // Gerçek showdown'da (2+ contender) potu alanların kartları otomatik açılır;
        // diğerleri el sonu "göster/gösterme" sırasında kendileri karar verir.
        const winnerSet = new Set(winnersData);
        if (contenders.length > 1) {
            contenders.forEach(p => {
                if (!winnerSet.has(p.username)) return;
                [0, 1].forEach(i => {
                    if (!p.revealedCards.includes(i) && i < p.cards.length) p.revealedCards.push(i);
                });
            });
        }
        this.endGame([...winnerSet], "Showdown");
    }

    endGame(winnerNames, reason) {
        this.gameState = 'finished';
        this.winners = winnerNames;
        this.currentTurnIndex = -1;
        this.clearTurnTimer();
        this._clearShowMuck();

        if (this.resetTimer) clearTimeout(this.resetTimer);
        if (this.runoutTimer) { clearTimeout(this.runoutTimer); this.runoutTimer = null; }

        // Herkese aynı anda "göster/gösterme" penceresi; pencere kapanınca reset kurulur.
        this._startShowMuckWindow();
    }

    _clearShowMuck() {
        if (this.showMuckTimer) clearTimeout(this.showMuckTimer);
        this.showMuckTimer = null;
        this.showMuckDeciders = [];
    }

    // El bitiminden 15 sn sonra masayı sıfırla / yeni eli başlat
    _armResetTimer() {
        if (this.resetTimer) clearTimeout(this.resetTimer);
        this.resetTimer = setTimeout(() => {
            // Chip'i bitenleri, ayrılmak isteyenleri ("Ayrıldı" dahil) ve bağlantısı
            // kopanları masadan çıkar. (left, pendingLeave'i de set eder; yine de açık tutuyoruz.)
            this.players = this.players.filter(p => !p.pendingLeave && !p.left && p.chips > 0 && !p.disconnected);
            // Ayrılanlardan boşalan koltuklara oturma kuyruğundakileri FIFO al.
            this._admitFromQueue();
            this.pot = 0;
            this.communityCards = [];
            this.winners =[];
            this.dealerIndex = -1;
            this.sbIndex = -1;
            this.bbIndex = -1;
            this.betToMatch = 0;
            this.players.forEach(p => {
                p.cards =[]; p.status = 'waiting'; p.currentBet = 0; p.handDescription = ''; p.pendingLeave = false; p.totalInvested = 0; p.revealedCards = [];
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

    // Tek pencere: kartı olan ve iki kartı zaten açık olmayan herkese (fold edenler
    // dahil, showdown'da otomatik açılan kazananlar hariç) aynı anda karar hakkı ver.
    _startShowMuckWindow() {
        this.showMuckDeciders = this.players
            .filter(p => p.cards.length > 0 &&
                !p.disconnected &&
                !(p.revealedCards.includes(0) && p.revealedCards.includes(1)))
            .map(p => p.id);

        if (this.showMuckDeciders.length === 0) {
            this.turnEndTime = null;
            this._armResetTimer();
            return;
        }

        this.turnEndTime = Date.now() + SHOW_MUCK_DURATION;

        const handAtSchedule = this.handNumber;
        this.showMuckTimer = setTimeout(() => {
            this.showMuckTimer = null;
            if (this.handNumber !== handAtSchedule) return;
            if (this.gameState !== 'finished') return;
            // Süre doldu: karar vermeyenler göstermemiş sayılır, pencere kapanır
            this.showMuckDeciders = [];
            this.turnEndTime = null;
            this._armResetTimer();
            if (this.updateCallback) this.updateCallback();
        }, SHOW_MUCK_DURATION);
    }

    // Bir oyuncu karar verince / masadan ayrılınca listeden düşer; kimse kalmazsa
    // pencere erken kapanır ve reset kurulur.
    _removeDecider(userId) {
        if (!this.showMuckDeciders.includes(userId)) return;
        this.showMuckDeciders = this.showMuckDeciders.filter(id => id !== userId);
        if (this.showMuckDeciders.length === 0) {
            if (this.showMuckTimer) clearTimeout(this.showMuckTimer);
            this.showMuckTimer = null;
            this.turnEndTime = null;
            this._armResetTimer();
        }
    }

    showMuckDecision(userId, show) {
        if (this.gameState !== 'finished' || !this.showMuckDeciders.includes(userId)) {
            return { success: false, message: 'Şu an kart gösterme kararı veremezsiniz.' };
        }

        const player = this.players.find(p => p.id === userId);
        if (!player) return { success: false, message: 'Oyuncu bulunamadı.' };

        if (show) {
            [0, 1].forEach(i => {
                if (!player.revealedCards.includes(i) && i < player.cards.length) {
                    player.revealedCards.push(i);
                }
            });
        }

        this._removeDecider(userId);
        return {
            success: true,
            username: player.username,
            show: !!show,
            revealedCards: show ? player.cards.slice(0, 2) : []
        };
    }

    nextTurn() {
        const next = this._nextIndexWhere(this.currentTurnIndex, p => p.status === 'playing');
        if (next === -1) {
            // Güvenlik: hamle yapabilecek kimse yoksa otomatik açılıma geç
            this.startAutoRunout();
            return;
        }
        this.currentTurnIndex = next;
        this.startTurnTimer();
    }

    revealCards(userId, cardIndices) {
        // Oyun aktif olmalı (pre-flop, flop, turn, river)
        if (['waiting', 'finished', 'showdown'].includes(this.gameState)) {
            return { success: false, message: 'Şu an kart gösteremezsiniz.' };
        }

        const player = this.players.find(p => p.id === userId);
        if (!player) return { success: false, message: 'Oyuncu bulunamadı.' };
        if (player.cards.length === 0) return { success: false, message: 'Elinizde kart yok.' };
        // Fold eden el sırasında kart açamaz (kartları artık el sonuna dek saklanıyor;
        // gösterme şansı el bitince "göster/gösterme" sırasında gelir).
        if (player.status === 'folded') {
            return { success: false, message: 'Fold ettiniz; kart gösterme şansı el bitince gelecek.' };
        }

        // cardIndices: [0], [1], veya [0,1]
        const validIndices = cardIndices.filter(i => i === 0 || i === 1);
        if (validIndices.length === 0) return { success: false, message: 'Geçersiz kart seçimi.' };

        // Daha önce açılmamış kartları bul
        const newReveals = validIndices.filter(i => !player.revealedCards.includes(i) && i < player.cards.length);
        if (newReveals.length === 0) return { success: false, message: 'Bu kartlar zaten açık.' };

        player.revealedCards.push(...newReveals);

        return {
            success: true,
            username: player.username,
            revealedCards: newReveals.map(i => player.cards[i]),
            revealedIndices: player.revealedCards
        };
    }

    getPublicState() {
        return {
            id: this.id, gameState: this.gameState, pot: this.pot, turnEndTime: this.turnEndTime,
            maxPlayers: this.maxPlayers,
            communityCards: this.communityCards,
            currentTurnIndex: this.gameState === 'waiting' || this.gameState === 'finished' ? -1 : this.currentTurnIndex,
            winners: this.gameState === 'finished' ? this.winners : [],
            showMuckDeciders: this.showMuckDeciders,
            betToMatch: this.betToMatch,
            minRaiseTo: this.betToMatch + this.lastRaiseSize,
            dealerIndex: this.dealerIndex,
            sbIndex: this.sbIndex,
            bbIndex: this.bbIndex,
            settings: {
                smallBlind: this.smallBlind,
                bigBlind: this.bigBlind,
                minBuyIn: this.minBuyIn,
                maxBuyIn: this.maxBuyIn,
                turnTimerDuration: this.turnTimerDuration,
                type: this.type // 'normal' | 'tournament' → istemci doğru çip ikonunu gösterir
            },
            activeProposal: this.getProposalState(),
            // Oturma kuyruğu (masa doluyken bekleyenler; herkese açık — sadece id + isim).
            queue: this.joinQueue.map(q => ({ id: q.id, username: q.username })),
            players: this.players.map((p, i) => ({
                id: p.id, username: p.username, chips: p.chips, currentBet: p.currentBet, status: p.status, pendingLeave: p.pendingLeave,
                left: !!p.left, // oyun sonu "Ayrıldı": bilgileri koltukta durur, sıradaki elde düşer
                disconnected: !!p.disconnected,
                // Kartlar public state'te asla açık gitmez; gösterim revealedCards kanalından.
                cards: [],
                handDescription: (this.gameState === 'finished' && p.revealedCards.length >= 2) ? p.handDescription : '',
                hasCards: p.cards.length > 0 && p.status !== 'folded',
                isDealer: i === this.dealerIndex,
                isSB: i === this.sbIndex,
                isBB: i === this.bbIndex,
                revealedCards: p.revealedCards.map(idx => p.cards[idx]).filter(Boolean),
                revealedIndices: p.revealedCards || []
            }))
        };
    }

    // --- OYLAMA SİSTEMİ ---

    proposeSettingChange(userId, setting, proposedValue) {
        if (this.gameState !== 'waiting' && this.gameState !== 'finished') {
            return { success: false, message: 'Oyun devam ederken ayar değiştirilemez.' };
        }

        const proposer = this.players.find(p => p.id === userId);
        if (!proposer) {
            return { success: false, message: 'Sadece masada oturan oyuncular öneri yapabilir.' };
        }

        if (this.activeProposal) {
            return { success: false, message: 'Zaten aktif bir oylama var. Lütfen bekleyin.' };
        }

        const validSettings = ['smallBlind', 'bigBlind', 'minBuyIn', 'maxBuyIn', 'turnTimerDuration'];
        if (!validSettings.includes(setting)) {
            return { success: false, message: 'Geçersiz ayar adı.' };
        }

        const numValue = parseInt(proposedValue);
        if (isNaN(numValue) || numValue <= 0) {
            return { success: false, message: 'Geçerli bir pozitif sayı girin.' };
        }

        // Çapraz validasyon
        if (setting === 'smallBlind' && numValue >= this.bigBlind) {
            return { success: false, message: 'Small Blind, Big Blind\'dan küçük olmalı.' };
        }
        if (setting === 'bigBlind' && numValue <= this.smallBlind) {
            return { success: false, message: 'Big Blind, Small Blind\'dan büyük olmalı.' };
        }
        if (setting === 'minBuyIn' && this.maxBuyIn > 0 && numValue > this.maxBuyIn) {
            return { success: false, message: 'Min Buy-In, Max Buy-In\'dan büyük olamaz.' };
        }
        if (setting === 'maxBuyIn' && this.minBuyIn > 0 && numValue < this.minBuyIn) {
            return { success: false, message: 'Max Buy-In, Min Buy-In\'dan küçük olamaz.' };
        }
        if (setting === 'turnTimerDuration' && (numValue < 10000 || numValue > 120000)) {
            return { success: false, message: 'Süre 10-120 saniye arasında olmalı.' };
        }

        // Tek oyuncu varsa direkt uygula
        if (this.players.length === 1) {
            this[setting] = numValue;
            return { success: true, immediate: true, setting, newValue: numValue };
        }

        // Oylama başlat
        const votes = new Map();
        votes.set(userId, 'accept');

        this.activeProposal = {
            proposerId: userId,
            proposerUsername: proposer.username,
            setting: setting,
            currentValue: this[setting],
            proposedValue: numValue,
            votes: votes,
            expiresAt: Date.now() + 30000,
            timer: null
        };

        // Çoğunluk zaten sağlandı mı kontrol et
        const result = this._checkVoteResult();
        if (result) {
            return { success: true, resolved: true, ...result };
        }

        return { success: true, proposal: this.getProposalState() };
    }

    voteOnProposal(userId, vote) {
        if (!this.activeProposal) {
            return { success: false, message: 'Aktif oylama bulunmuyor.' };
        }

        const player = this.players.find(p => p.id === userId);
        if (!player) {
            return { success: false, message: 'Sadece masada oturan oyuncular oy kullanabilir.' };
        }

        if (this.activeProposal.votes.has(userId)) {
            return { success: false, message: 'Zaten oy kullandınız.' };
        }

        if (vote !== 'accept' && vote !== 'reject') {
            return { success: false, message: 'Geçersiz oy.' };
        }

        this.activeProposal.votes.set(userId, vote);

        const result = this._checkVoteResult();
        if (result) {
            return { success: true, resolved: true, ...result };
        }

        return { success: true, proposal: this.getProposalState() };
    }

    _checkVoteResult() {
        if (!this.activeProposal) return null;

        const totalPlayers = this.players.length;
        const acceptCount = [...this.activeProposal.votes.values()].filter(v => v === 'accept').length;
        const rejectCount = [...this.activeProposal.votes.values()].filter(v => v === 'reject').length;
        const majority = Math.floor(totalPlayers / 2) + 1;

        // Kabul edildi mi: yarısından fazlası kabul
        if (acceptCount > totalPlayers / 2) {
            const setting = this.activeProposal.setting;
            const newValue = this.activeProposal.proposedValue;
            const oldValue = this.activeProposal.currentValue;
            this[setting] = newValue;
            this._clearProposal();
            return { passed: true, setting, oldValue, newValue };
        }

        // Reddedildi mi: yeterli red
        if (rejectCount >= majority) {
            const result = {
                passed: false,
                setting: this.activeProposal.setting,
                oldValue: this.activeProposal.currentValue,
                newValue: this.activeProposal.proposedValue
            };
            this._clearProposal();
            return result;
        }

        // Herkes oy kullandı mı
        if (this.activeProposal.votes.size === totalPlayers) {
            const passed = acceptCount > rejectCount;
            const result = {
                passed,
                setting: this.activeProposal.setting,
                oldValue: this.activeProposal.currentValue,
                newValue: this.activeProposal.proposedValue
            };
            if (passed) {
                this[this.activeProposal.setting] = this.activeProposal.proposedValue;
            }
            this._clearProposal();
            return result;
        }

        return null;
    }

    expireProposal() {
        if (!this.activeProposal) return null;

        const totalPlayers = this.players.length;
        const acceptCount = [...this.activeProposal.votes.values()].filter(v => v === 'accept').length;
        const passed = acceptCount > totalPlayers / 2;

        const result = {
            passed,
            expired: true,
            setting: this.activeProposal.setting,
            oldValue: this.activeProposal.currentValue,
            newValue: this.activeProposal.proposedValue
        };

        if (passed) {
            this[this.activeProposal.setting] = this.activeProposal.proposedValue;
        }

        this._clearProposal();
        return result;
    }

    _clearProposal() {
        if (this.activeProposal && this.activeProposal.timer) {
            clearTimeout(this.activeProposal.timer);
        }
        this.activeProposal = null;
    }

    getProposalState() {
        if (!this.activeProposal) return null;
        return {
            proposerId: this.activeProposal.proposerId,
            proposerUsername: this.activeProposal.proposerUsername,
            setting: this.activeProposal.setting,
            currentValue: this.activeProposal.currentValue,
            proposedValue: this.activeProposal.proposedValue,
            votes: Object.fromEntries(this.activeProposal.votes),
            expiresAt: this.activeProposal.expiresAt
        };
    }
}

module.exports = PokerTable;
