import { emptyHand } from '../domain/hand';
import { addMoney, money, subtractMoney, type MoneyCents } from '../domain/money';
import { DEFAULT_OPERATOR_CONFIG, type OperatorConfig } from '../operator';
import { dealerShouldHit } from '../rules/dealer';
import { settleHand } from '../rules/settlement';
import { evaluatePerfectPairs, evaluateTwentyOnePlusThree } from '../rules/sideBets';
import { isBlackjack, scoreHand } from '../rules/scoring';
import { MathRandomSource } from '../rng/random-source';
import { Shoe } from '../rng/shoe';
import { GamePhase } from '../state/phases';
import {
  HAND_COUNT,
  type DealerState,
  type HandIndex,
  type PlayerSeatState,
  type TableSnapshot,
} from '../state/table-state';
import type { GameAction } from './actions';

type DealQueueStep =
  | { kind: 'player'; seat: HandIndex; faceUp: boolean }
  | { kind: 'dealer'; faceUp: boolean };

function makeSeats(): PlayerSeatState[] {
  return Array.from({ length: HAND_COUNT }, (_, i) => ({
    index: i as HandIndex,
    inRound: false,
    bet: money(0),
    insuranceBet: money(0),
    ppBet: money(0),
    twentyOneBet: money(0),
    hand: emptyHand(),
    status: 'idle' as const,
    settlement: undefined,
    ppResult: undefined,
    twentyOneResult: undefined,
  }));
}

export class GameSession {
  readonly operator: OperatorConfig;
  private readonly shoe: Shoe;
  private phase: GamePhase = GamePhase.Loading;
  private balance: MoneyCents;
  private dealer: DealerState = { hand: emptyHand() };
  private seats: PlayerSeatState[] = makeSeats();
  private activeSeatIndex: HandIndex | null = null;
  /** See TableSnapshot.handTransitionFrom */
  private handTransitionFrom: HandIndex | null = null;
  /** See TableSnapshot.heroSeatIndex */
  private heroSeatIndex: HandIndex | null = null;
  /** During Settlement: index of the seat currently being revealed. */
  private settlementRevealIndex: HandIndex | null = null;
  /** Dealer finished drawing; next DEALER_PLAY_STEP runs settlement (visible pause). */
  private settlementPending = false;
  private balanceBeforeDeal: MoneyCents;
  private revision = 0;
  private lastError?: string;
  private betHistory: { seat: HandIndex; amount: MoneyCents }[] = [];
  private sideBetHistory: { seat: HandIndex; kind: 'pp' | '21+3'; amount: MoneyCents }[] = [];
  private dealQueue: DealQueueStep[] = [];
  /** DealerTurn: first step reveals hole; then hits one card per step until stand. */
  private dealerAwaitingHoleReveal = false;

  constructor(operator: OperatorConfig = DEFAULT_OPERATOR_CONFIG) {
    this.operator = operator;
    this.shoe = new Shoe({
      deckCount: operator.deckCount,
      penetrationReserve: operator.penetrationReserve,
      rng: new MathRandomSource(),
      idPrefix: `shoe-${operator.tableId}`,
    });
    this.balance = money(500_00);
    this.balanceBeforeDeal = this.balance;
    this.phase = GamePhase.Betting;
  }

  getSnapshot(): TableSnapshot {
    return {
      phase: this.phase,
      balance: this.balance,
      balanceBeforeDeal: this.balanceBeforeDeal,
      dealer: {
        hand: { cards: this.dealer.hand.cards.map((c) => ({ ...c })) },
      },
      seats: this.seats.map((s) => ({
        ...s,
        hand: { cards: s.hand.cards.map((c) => ({ ...c })) },
        settlement: s.settlement ? { ...s.settlement } : undefined,
        ppResult: s.ppResult ? { ...s.ppResult } : undefined,
        twentyOneResult: s.twentyOneResult ? { ...s.twentyOneResult } : undefined,
      })),
      activeSeatIndex: this.activeSeatIndex,
      handTransitionFrom: this.handTransitionFrom,
      heroSeatIndex: this.heroSeatIndex,
      settlementRevealIndex: this.settlementRevealIndex,
      revision: this.revision,
      lastError: this.lastError,
    };
  }

  dispatch(action: GameAction): void {
    this.lastError = undefined;
    switch (action.type) {
      case 'ENTER_PHASE':
        this.phase = action.phase;
        this.bump();
        break;
      case 'PLACE_BET':
        this.placeBet(action.seat, action.chipValue);
        break;
      case 'CLEAR_BET':
        this.clearBet(action.seat);
        break;
      case 'CLEAR_ALL_BETS':
        this.clearAllBets();
        break;
      case 'UNDO_LAST_BET':
        this.undoLastBet();
        break;
      case 'DEAL':
        this.deal();
        break;
      case 'DEAL_NEXT_CARD':
        this.dealNextCard();
        break;
      case 'TAKE_INSURANCE':
        this.takeInsurance();
        break;
      case 'DECLINE_INSURANCE':
        this.declineInsurance();
        break;
      case 'HIT':
        this.hit();
        break;
      case 'STAND':
        this.stand();
        break;
      case 'DOUBLE':
        this.double();
        break;
      case 'COMPLETE_HAND_TRANSITION':
        this.completeHandTransition();
        break;
      case 'DEALER_PLAY_STEP':
        this.dealerPlayStep();
        break;
      case 'SETTLE_NEXT_HAND':
        this.settleNextHand();
        break;
      case 'ACK_ROUND_COMPLETE':
        this.ackRoundComplete();
        break;
      case 'REBET_LAST':
        this.rebetLastRound();
        break;
      case 'PLACE_SIDE_BET':
        this.placeSideBet(action.seat, action.kind, action.chipValue);
        break;
      case 'CLEAR_SIDE_BET':
        this.clearSideBet(action.seat, action.kind);
        break;
      case 'UNDO_LAST_SIDE_BET':
        this.undoLastSideBet();
        break;
      default:
        this.lastError = 'Unknown action';
        this.bump();
    }
  }

  private bump(): void {
    this.revision += 1;
  }

  private placeBet(seat: HandIndex, chipValue: number): void {
    if (this.phase !== GamePhase.Betting) return;
    if (!Number.isInteger(chipValue) || chipValue <= 0) return;
    const add = money(chipValue);
    const s = this.seats[seat];
    const allPending = this.seats.reduce(
      (acc, x) => addMoney(acc, addMoney(x.bet, addMoney(x.ppBet, x.twentyOneBet))),
      money(0),
    );
    if (addMoney(allPending, add) > this.balance) {
      this.lastError = 'Insufficient balance';
      this.bump();
      return;
    }
    const nextTotal = addMoney(s.bet, add);
    if (nextTotal < this.operator.tableLimits.minBet && nextTotal !== add) {
      /* allow building to min */
    }
    if (nextTotal > this.operator.tableLimits.maxBet) {
      this.lastError = 'Exceeds table maximum';
      this.bump();
      return;
    }
    s.bet = addMoney(s.bet, add);
    s.inRound = s.bet > 0;
    s.status = 'betting';
    this.betHistory.push({ seat, amount: add });
    this.bump();
  }

  private clearBet(seat: HandIndex): void {
    if (this.phase !== GamePhase.Betting) return;
    const s = this.seats[seat];
    s.bet = money(0);
    s.inRound = false;
    s.status = 'idle';
    this.betHistory = this.betHistory.filter((b) => b.seat !== seat);
    this.bump();
  }

  private clearAllBets(): void {
    if (this.phase !== GamePhase.Betting) return;
    this.seats = makeSeats();
    this.betHistory = [];
    this.sideBetHistory = [];
    this.bump();
  }

  private undoLastBet(): void {
    if (this.phase !== GamePhase.Betting || this.betHistory.length === 0) return;
    const last = this.betHistory.pop();
    if (!last) return;
    const s = this.seats[last.seat];
    s.bet = subtractMoney(s.bet, last.amount);
    if (s.bet === money(0)) {
      s.inRound = false;
      s.status = 'idle';
    }
    this.bump();
  }

  private deal(): void {
    if (this.phase !== GamePhase.Betting) return;
    const active = this.seats.filter((s) => s.inRound && s.bet > 0);
    if (active.length === 0) {
      this.lastError = 'Place a bet to deal';
      this.bump();
      return;
    }
    for (const s of active) {
      if (s.bet < this.operator.tableLimits.minBet) {
        this.lastError = 'Each active hand must meet table minimum';
        this.bump();
        return;
      }
    }

    const totalSideBets = this.seats.reduce(
      (acc, s) => addMoney(acc, addMoney(s.ppBet, s.twentyOneBet)),
      money(0),
    );
    const totalWager = addMoney(
      active.reduce((acc, s) => addMoney(acc, s.bet), money(0)),
      totalSideBets,
    );
    if (totalWager > this.balance) {
      this.lastError = 'Insufficient balance';
      this.bump();
      return;
    }

    this.balanceBeforeDeal = this.balance;
    this.balance = subtractMoney(this.balance, totalWager);

    if (this.shoe.needsReshuffle()) {
      this.phase = GamePhase.Reshuffling;
      this.shoe.reshuffle();
    }

    this.phase = GamePhase.Dealing;
    this.handTransitionFrom = null;
    this.heroSeatIndex = null;
    this.settlementPending = false;
    this.dealer = { hand: emptyHand() };
    for (const s of this.seats) {
      if (s.inRound) {
        s.hand = emptyHand();
        s.settlement = undefined;
        s.ppResult = undefined;
        s.twentyOneResult = undefined;
        s.status = 'betting';
      } else {
        s.hand = emptyHand();
        s.settlement = undefined;
        s.ppResult = undefined;
        s.twentyOneResult = undefined;
        s.status = 'idle';
      }
    }

    const participating = this.seats.filter((s) => s.inRound);
    this.dealQueue = [];
    for (const s of participating) {
      this.dealQueue.push({ kind: 'player', seat: s.index, faceUp: true });
    }
    this.dealQueue.push({ kind: 'dealer', faceUp: true });
    for (const s of participating) {
      this.dealQueue.push({ kind: 'player', seat: s.index, faceUp: true });
    }
    this.dealQueue.push({ kind: 'dealer', faceUp: false });

    const first = this.dealQueue.shift()!;
    this.applyDealStep(first);
    this.endDealingIfComplete();
    this.bump();
  }

  private applyDealStep(step: DealQueueStep): void {
    if (step.kind === 'player') {
      this.seats[step.seat].hand.cards.push(this.shoe.draw(step.faceUp));
    } else {
      this.dealer.hand.cards.push(this.shoe.draw(step.faceUp));
    }
  }

  /** After each card: if the queue is empty, check for insurance or enter play. */
  private endDealingIfComplete(): void {
    if (this.dealQueue.length > 0) return;

    const dealerUpCard = this.dealer.hand.cards.find((c) => c.faceUp);
    if (
      dealerUpCard &&
      dealerUpCard.rank === 'A' &&
      this.operator.enabledActions.insurance &&
      this.operator.rules.insuranceEnabled
    ) {
      this.phase = GamePhase.InsuranceOffer;
      return;
    }

    this.afterInsuranceDecision();
  }

  /** Shared path after insurance is taken/declined (or skipped). */
  private afterInsuranceDecision(): void {
    if (this.dealerHasBlackjack()) {
      this.settleWithDealerBlackjack();
      return;
    }
    this.phase = GamePhase.PlayerTurn;
    this.preparePlayerTurns();
  }

  private dealerHasBlackjack(): boolean {
    const cards = this.dealer.hand.cards;
    if (cards.length !== 2) return false;
    const allUp = cards.map((c) => ({ ...c, faceUp: true }));
    return isBlackjack(allUp);
  }

  private settleWithDealerBlackjack(): void {
    for (const c of this.dealer.hand.cards) {
      c.faceUp = true;
    }
    this.evaluateSideBets();
    for (const s of this.seats) {
      if (!s.inRound || s.insuranceBet <= 0) continue;
      const insurancePay = money(s.insuranceBet * 2);
      this.balance = addMoney(this.balance, addMoney(s.insuranceBet, insurancePay));
    }
    this.runSettlement();
  }

  private takeInsurance(): void {
    if (this.phase !== GamePhase.InsuranceOffer) return;
    let totalInsurance = money(0);
    for (const s of this.seats) {
      if (!s.inRound) continue;
      const half = money(Math.floor(s.bet / 2));
      totalInsurance = addMoney(totalInsurance, half);
    }
    if (totalInsurance > this.balance) {
      this.lastError = 'Insufficient balance for insurance';
      this.bump();
      return;
    }
    this.balance = subtractMoney(this.balance, totalInsurance);
    for (const s of this.seats) {
      if (!s.inRound) continue;
      s.insuranceBet = money(Math.floor(s.bet / 2));
    }
    this.afterInsuranceDecision();
    this.bump();
  }

  private declineInsurance(): void {
    if (this.phase !== GamePhase.InsuranceOffer) return;
    this.afterInsuranceDecision();
    this.bump();
  }

  private dealNextCard(): void {
    if (this.phase !== GamePhase.Dealing) return;
    const step = this.dealQueue.shift();
    if (!step) {
      this.endDealingIfComplete();
      this.bump();
      return;
    }
    this.applyDealStep(step);
    this.endDealingIfComplete();
    this.bump();
  }

  private preparePlayerTurns(): void {
    this.evaluateSideBets();
    for (const s of this.seats) {
      if (!s.inRound) continue;
      if (isBlackjack(s.hand.cards)) {
        s.status = 'stood';
      } else {
        s.status = 'active';
      }
    }
    this.activeSeatIndex = this.findNextActiveSeat(-1);
    if (this.activeSeatIndex === null) {
      this.heroSeatIndex = this.findRightmostInRoundSeatWithCards();
      this.startDealerTurn();
    }
  }

  private findRightmostInRoundSeatWithCards(): HandIndex | null {
    for (let i = HAND_COUNT - 1; i >= 0; i--) {
      const s = this.seats[i as HandIndex];
      if (s.inRound && s.hand.cards.length > 0) return i as HandIndex;
    }
    return null;
  }

  private findNextActiveSeat(from: number): HandIndex | null {
    for (let i = from + 1; i < HAND_COUNT; i++) {
      const s = this.seats[i as HandIndex];
      if (s.inRound && s.status === 'active') {
        return i as HandIndex;
      }
    }
    return null;
  }

  private hit(): void {
    if (this.phase !== GamePhase.PlayerTurn || this.activeSeatIndex === null) return;
    const s = this.seats[this.activeSeatIndex];
    s.hand.cards.push(this.shoe.draw(true));
    if (scoreHand(s.hand.cards).bust) {
      s.status = 'bust';
      this.beginHandTransition(this.activeSeatIndex);
    }
    this.bump();
  }

  private stand(): void {
    if (this.phase !== GamePhase.PlayerTurn || this.activeSeatIndex === null) return;
    const s = this.seats[this.activeSeatIndex];
    s.status = 'stood';
    this.beginHandTransition(this.activeSeatIndex);
    this.bump();
  }

  private double(): void {
    if (this.phase !== GamePhase.PlayerTurn || this.activeSeatIndex === null) return;
    if (!this.operator.enabledActions.double) return;
    const seat = this.activeSeatIndex;
    const s = this.seats[seat];
    if (s.status !== 'active' || s.hand.cards.length !== 2) return;

    const { total } = scoreHand(s.hand.cards);
    const rule = this.operator.rules.doubleOn;
    if (rule === '9_10_11' && total !== 9 && total !== 10 && total !== 11) return;
    if (rule === '10_11' && total !== 10 && total !== 11) return;

    const additional = s.bet;
    const doubled = addMoney(s.bet, additional);
    if (doubled > this.operator.tableLimits.maxBet) {
      this.lastError = 'Exceeds table maximum';
      this.bump();
      return;
    }
    if (this.balance < additional) {
      this.lastError = 'Insufficient balance';
      this.bump();
      return;
    }

    this.balance = subtractMoney(this.balance, additional);
    s.bet = doubled;
    s.hand.cards.push(this.shoe.draw(true));

    if (scoreHand(s.hand.cards).bust) {
      s.status = 'bust';
    } else {
      s.status = 'stood';
    }
    this.beginHandTransition(seat);
    this.bump();
  }

  private beginHandTransition(finishedSeat: HandIndex): void {
    this.phase = GamePhase.HandTransition;
    this.activeSeatIndex = null;
    this.handTransitionFrom = finishedSeat;
  }

  private completeHandTransition(): void {
    if (this.phase !== GamePhase.HandTransition || this.handTransitionFrom === null) {
      this.lastError = 'No hand transition in progress';
      this.bump();
      return;
    }
    const from = this.handTransitionFrom;
    this.handTransitionFrom = null;
    this.phase = GamePhase.PlayerTurn;
    const hadAnotherPlayer = this.findNextActiveSeat(from) !== null;
    this.advanceFromSeat(from);
    if (hadAnotherPlayer) {
      this.bump();
    }
  }

  private advanceFromSeat(current: HandIndex): void {
    const next = this.findNextActiveSeat(current);
    this.activeSeatIndex = next;
    if (next === null) {
      this.heroSeatIndex = current;
      this.startDealerTurn();
    }
  }

  private startDealerTurn(): void {
    this.phase = GamePhase.DealerTurn;
    this.activeSeatIndex = null;
    this.settlementPending = false;
    this.dealerAwaitingHoleReveal = true;
    this.bump();
  }

  private dealerPlayStep(): void {
    if (this.phase !== GamePhase.DealerTurn) return;
    if (this.dealerAwaitingHoleReveal) {
      for (const c of this.dealer.hand.cards) {
        c.faceUp = true;
      }
      this.dealerAwaitingHoleReveal = false;
      this.bump();
      return;
    }
    if (this.settlementPending) {
      this.settlementPending = false;
      this.runSettlement();
      return;
    }
    if (dealerShouldHit(this.dealer.hand, this.operator.rules)) {
      this.dealer.hand.cards.push(this.shoe.draw(true));
      this.bump();
      return;
    }
    this.settlementPending = true;
    this.bump();
  }

  private fastForwardDealer(): void {
    if (this.phase !== GamePhase.DealerTurn) return;
    for (const c of this.dealer.hand.cards) c.faceUp = true;
    this.dealerAwaitingHoleReveal = false;
    while (this.phase === GamePhase.DealerTurn) {
      this.dealerPlayStep();
    }
  }

  private runSettlement(): void {
    this.phase = GamePhase.Settlement;
    this.settlementRevealIndex = null;
    this.heroSeatIndex = null;
    this.bump();
  }

  private settleNextHand(): void {
    if (this.phase !== GamePhase.Settlement) return;

    const startFrom = this.settlementRevealIndex === null ? 0 : this.settlementRevealIndex + 1;
    let next: HandIndex | null = null;
    for (let i = startFrom; i < HAND_COUNT; i++) {
      if (this.seats[i as HandIndex].inRound) {
        next = i as HandIndex;
        break;
      }
    }

    if (next === null) {
      this.settlementRevealIndex = null;
      this.phase = GamePhase.RoundComplete;
      this.bump();
      return;
    }

    const s = this.seats[next];
    const outcome = settleHand(s.hand, this.dealer.hand, s.bet, this.operator.rules);
    s.settlement = outcome;
    s.status = 'settled';
    let handPayout = addMoney(s.bet, outcome.payout);

    if (s.ppResult?.won && s.ppBet > 0) {
      handPayout = addMoney(handPayout, addMoney(s.ppBet, s.ppResult.payout));
    }
    if (s.twentyOneResult?.won && s.twentyOneBet > 0) {
      handPayout = addMoney(handPayout, addMoney(s.twentyOneBet, s.twentyOneResult.payout));
    }

    this.balance = addMoney(this.balance, handPayout);
    this.settlementRevealIndex = next;
    this.heroSeatIndex = next;
    this.bump();
  }

  private ackRoundComplete(): void {
    if (this.phase === GamePhase.DealerTurn) {
      this.fastForwardDealer();
    }
    if (this.phase === GamePhase.Settlement) {
      while (this.phase === GamePhase.Settlement) {
        this.settleNextHand();
      }
    }
    if (this.phase !== GamePhase.RoundComplete) return;
    this.resetRound();
    this.phase = GamePhase.Betting;
    this.bump();
  }

  /**
   * From round complete (or settlement): clear the table, restore the same
   * stakes as last round, and deal.  If called during settlement, any
   * unsettled hands are resolved first so the balance is accurate.
   */
  private rebetLastRound(): void {
    if (this.phase === GamePhase.DealerTurn) {
      this.fastForwardDealer();
    }
    if (this.phase === GamePhase.Settlement) {
      while (this.phase === GamePhase.Settlement) {
        this.settleNextHand();
      }
    }
    if (this.phase !== GamePhase.RoundComplete) return;

    const stakes: MoneyCents[] = this.seats.map((s) =>
      s.inRound && s.bet > 0 ? s.bet : money(0),
    );

    const total = stakes.reduce((acc, x) => addMoney(acc, x), money(0));
    if (total === money(0)) {
      this.lastError = 'No previous bet to repeat';
      this.bump();
      return;
    }
    if (total > this.balance) {
      this.lastError = 'Insufficient balance to rebet';
      this.bump();
      return;
    }

    const { minBet, maxBet } = this.operator.tableLimits;
    for (let i = 0; i < HAND_COUNT; i++) {
      const amt = stakes[i]!;
      if (amt === money(0)) continue;
      if (amt < minBet) {
        this.lastError = 'Previous bet is below table minimum';
        this.bump();
        return;
      }
      if (amt > maxBet) {
        this.lastError = 'Previous bet exceeds table maximum';
        this.bump();
        return;
      }
    }

    this.resetRound();
    this.phase = GamePhase.Betting;

    for (let i = 0; i < HAND_COUNT; i++) {
      const amt = stakes[i]!;
      if (amt === money(0)) continue;
      const seat = i as HandIndex;
      const s = this.seats[seat];
      s.bet = amt;
      s.inRound = true;
      s.status = 'betting';
      this.betHistory.push({ seat, amount: amt });
    }

    this.deal();
  }

  // ---- Side bet methods ----

  private placeSideBet(seat: HandIndex, kind: 'pp' | '21+3', chipValue: number): void {
    if (this.phase !== GamePhase.Betting) return;
    if (!Number.isInteger(chipValue) || chipValue <= 0) return;
    const add = money(chipValue);
    const s = this.seats[seat];
    const field = kind === 'pp' ? 'ppBet' : 'twentyOneBet';
    const next = addMoney(s[field], add);

    const totalPending = this.seats.reduce(
      (acc, x) => addMoney(acc, addMoney(x.bet, addMoney(x.ppBet, x.twentyOneBet))),
      money(0),
    );
    if (addMoney(totalPending, add) > this.balance) {
      this.lastError = 'Insufficient balance';
      this.bump();
      return;
    }

    s[field] = next;
    this.sideBetHistory.push({ seat, kind, amount: add });
    this.bump();
  }

  private clearSideBet(seat: HandIndex, kind: 'pp' | '21+3'): void {
    if (this.phase !== GamePhase.Betting) return;
    const s = this.seats[seat];
    if (kind === 'pp') s.ppBet = money(0);
    else s.twentyOneBet = money(0);
    this.sideBetHistory = this.sideBetHistory.filter(
      (b) => !(b.seat === seat && b.kind === kind),
    );
    this.bump();
  }

  private undoLastSideBet(): void {
    if (this.phase !== GamePhase.Betting || this.sideBetHistory.length === 0) return;
    const last = this.sideBetHistory.pop();
    if (!last) return;
    const s = this.seats[last.seat];
    const field = last.kind === 'pp' ? 'ppBet' : 'twentyOneBet';
    s[field] = subtractMoney(s[field], last.amount);
    this.bump();
  }

  private evaluateSideBets(): void {
    const dealerUpcard = this.dealer.hand.cards.find((c) => c.faceUp);
    for (const s of this.seats) {
      if (!s.inRound) continue;

      if (s.ppBet > 0) {
        const outcome = evaluatePerfectPairs(s.hand.cards);
        if (outcome) {
          const winnings = money(s.ppBet * outcome.multiplier);
          s.ppResult = { name: outcome.name, payout: winnings, won: true };
        } else {
          s.ppResult = { name: 'No Pair', payout: money(0), won: false };
        }
      }

      if (s.twentyOneBet > 0 && dealerUpcard) {
        const outcome = evaluateTwentyOnePlusThree(s.hand.cards, dealerUpcard);
        if (outcome) {
          const winnings = money(s.twentyOneBet * outcome.multiplier);
          s.twentyOneResult = { name: outcome.name, payout: winnings, won: true };
        } else {
          s.twentyOneResult = { name: 'No Match', payout: money(0), won: false };
        }
      }
    }
  }

  private resetRound(): void {
    this.dealer = { hand: emptyHand() };
    this.seats = makeSeats();
    this.activeSeatIndex = null;
    this.handTransitionFrom = null;
    this.heroSeatIndex = null;
    this.settlementRevealIndex = null;
    this.settlementPending = false;
    this.betHistory = [];
    this.sideBetHistory = [];
    this.dealQueue = [];
    this.dealerAwaitingHoleReveal = false;
  }
}
