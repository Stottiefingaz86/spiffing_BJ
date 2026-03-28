import { REELS, ROWS, BanditSymbol, randomBaseSymbol } from './symbols';
import { generateSpin, generateFreeSpinResult, getScatterReels, type SpinResult } from './reels';
import { evaluatePaylines, countScatters, getScatterPositions, type PaylineWin, type ReelGrid } from './paylines';
import { shouldTriggerWildFeature, pickWildFeature, applyWildFeature, type WildFeatureResult } from './wildFeatures';

export enum GamePhase {
  Idle = 'Idle',
  Spinning = 'Spinning',
  WildFeature = 'WildFeature',
  Evaluating = 'Evaluating',
  ShowWins = 'ShowWins',
  FreeSpinIntro = 'FreeSpinIntro',
  FreeSpinChoice = 'FreeSpinChoice',
  FreeSpinning = 'FreeSpinning',
  FreeSpinWildFeature = 'FreeSpinWildFeature',
  FreeSpinEvaluating = 'FreeSpinEvaluating',
  FreeSpinShowWin = 'FreeSpinShowWin',
  GambleReveal = 'GambleReveal',
  FreeSpinOutro = 'FreeSpinOutro',
}

export type FreeSpinMode = 'standard' | 'gamble';

export interface BanditSnapshot {
  phase: GamePhase;
  grid: ReelGrid;
  balance: number;
  bet: number;
  spinWin: number;
  totalWin: number;
  paylineWins: PaylineWin[];
  currentPaylineIndex: number;
  revision: number;

  spinResult: SpinResult | null;
  wildFeature: WildFeatureResult | null;
  scatterReels: number[];
  scatterPositions: { reel: number; row: number }[];
  scatterCount: number;

  freeSpinsRemaining: number;
  freeSpinsTotal: number;
  freeSpinsTotalWin: number;
  freeSpinMode: FreeSpinMode | null;
  inFreeSpins: boolean;

  gamblePot: number;
  gambleThumbResult: 'up' | 'down' | null;

  reelStopDelays: number[];
}

const BET_OPTIONS = [10, 20, 40, 60, 100, 200, 500, 1000, 2000, 5000, 10000];
const DEFAULT_BALANCE = 100000;
export const BUY_BONUS_COST = 10000;

const FREE_SPINS_MAP: Record<number, number> = { 3: 10, 4: 20, 5: 40 };

export class BanditSession {
  private grid: ReelGrid;
  private balance: number;
  private bet: number;
  private phase: GamePhase;
  private spinWin: number;
  private totalWin: number;
  private paylineWins: PaylineWin[];
  private currentPaylineIndex: number;
  private revision: number;

  private spinResult: SpinResult | null;
  private wildFeature: WildFeatureResult | null;
  private scatterReels: number[];
  private scatterPositions: { reel: number; row: number }[];
  private scatterCount: number;

  private freeSpinsRemaining = 0;
  private freeSpinsTotal = 0;
  private freeSpinsTotalWin = 0;
  private freeSpinBet = 0;
  private freeSpinMode: FreeSpinMode | null = null;
  private pendingFreeSpins = false;

  private gamblePot = 0;
  private gambleThumbResult: 'up' | 'down' | null = null;

  private reelStopDelays: number[] = [0, 0, 0, 0, 0];

  constructor() {
    this.grid = this.emptyGrid();
    this.balance = DEFAULT_BALANCE;
    this.bet = BET_OPTIONS[2];
    this.phase = GamePhase.Idle;
    this.spinWin = 0;
    this.totalWin = 0;
    this.paylineWins = [];
    this.currentPaylineIndex = -1;
    this.revision = 0;
    this.spinResult = null;
    this.wildFeature = null;
    this.scatterReels = [];
    this.scatterPositions = [];
    this.scatterCount = 0;
  }

  private emptyGrid(): ReelGrid {
    const grid: ReelGrid = [];
    for (let r = 0; r < REELS; r++) {
      const reel: BanditSymbol[] = [];
      for (let row = 0; row < ROWS; row++) {
        reel.push(randomBaseSymbol());
      }
      grid.push(reel);
    }
    return grid;
  }

  private get inFreeSpins(): boolean {
    return (
      this.phase === GamePhase.FreeSpinIntro ||
      this.phase === GamePhase.FreeSpinChoice ||
      this.phase === GamePhase.FreeSpinning ||
      this.phase === GamePhase.FreeSpinWildFeature ||
      this.phase === GamePhase.FreeSpinEvaluating ||
      this.phase === GamePhase.FreeSpinShowWin ||
      this.phase === GamePhase.GambleReveal ||
      this.phase === GamePhase.FreeSpinOutro
    );
  }

  getSnapshot(): BanditSnapshot {
    return {
      phase: this.phase,
      grid: this.grid.map((reel) => [...reel]),
      balance: this.balance,
      bet: this.inFreeSpins ? this.freeSpinBet : this.bet,
      spinWin: this.spinWin,
      totalWin: this.totalWin,
      paylineWins: this.paylineWins,
      currentPaylineIndex: this.currentPaylineIndex,
      revision: this.revision,
      spinResult: this.spinResult,
      wildFeature: this.wildFeature,
      scatterReels: [...this.scatterReels],
      scatterPositions: [...this.scatterPositions],
      scatterCount: this.scatterCount,
      freeSpinsRemaining: this.freeSpinsRemaining,
      freeSpinsTotal: this.freeSpinsTotal,
      freeSpinsTotalWin: this.freeSpinsTotalWin,
      freeSpinMode: this.freeSpinMode,
      inFreeSpins: this.inFreeSpins,
      gamblePot: this.gamblePot,
      gambleThumbResult: this.gambleThumbResult,
      reelStopDelays: [...this.reelStopDelays],
    };
  }

  get betOptions(): number[] {
    return BET_OPTIONS;
  }

  setBet(cents: number): void {
    if (this.phase !== GamePhase.Idle) return;
    if (BET_OPTIONS.includes(cents)) {
      this.bet = cents;
      this.revision++;
    }
  }

  spin(): void {
    if (this.phase !== GamePhase.Idle) return;
    if (this.balance < this.bet) return;

    this.balance -= this.bet;
    this.spinWin = 0;
    this.totalWin = 0;
    this.paylineWins = [];
    this.currentPaylineIndex = -1;
    this.wildFeature = null;
    this.pendingFreeSpins = false;
    this.gambleThumbResult = null;

    const result = generateSpin();
    this.spinResult = result;
    this.grid = result.grid.map((reel) => [...reel]);

    this.scatterReels = getScatterReels(result.grid);
    this.scatterPositions = getScatterPositions(result.grid);
    this.scatterCount = countScatters(result.grid);

    this.reelStopDelays = this.computeReelDelays(this.scatterReels);

    this.phase = GamePhase.Spinning;
    this.revision++;
  }

  spinComplete(): void {
    if (this.phase !== GamePhase.Spinning) return;

    if (shouldTriggerWildFeature()) {
      const featureType = pickWildFeature();
      this.wildFeature = applyWildFeature(this.grid, featureType);
      this.phase = GamePhase.WildFeature;
    } else {
      this.phase = GamePhase.Evaluating;
    }
    this.revision++;
  }

  wildFeatureComplete(): void {
    if (this.phase !== GamePhase.WildFeature && this.phase !== GamePhase.FreeSpinWildFeature) return;
    this.phase = this.inFreeSpins ? GamePhase.FreeSpinEvaluating : GamePhase.Evaluating;
    this.revision++;
  }

  evaluate(): void {
    if (this.phase !== GamePhase.Evaluating && this.phase !== GamePhase.FreeSpinEvaluating) return;

    const currentBet = this.inFreeSpins ? this.freeSpinBet : this.bet;
    this.paylineWins = evaluatePaylines(this.grid, currentBet);
    this.spinWin = this.paylineWins.reduce((s, w) => s + w.payout, 0);
    this.totalWin = this.spinWin;

    const scatterCount = countScatters(this.grid);
    if (scatterCount >= 3 && !this.inFreeSpins) {
      this.pendingFreeSpins = true;
      this.freeSpinBet = this.bet;
      this.freeSpinsRemaining = FREE_SPINS_MAP[Math.min(scatterCount, 5)] ?? 10;
      this.freeSpinsTotal = this.freeSpinsRemaining;
      this.freeSpinsTotalWin = 0;
    }

    if (this.spinWin > 0) {
      this.balance += this.spinWin;
      if (this.inFreeSpins) {
        if (this.freeSpinMode === 'gamble') {
          this.gamblePot += this.spinWin;
        }
        this.freeSpinsTotalWin += this.spinWin;
      }
      this.currentPaylineIndex = 0;
      this.phase = this.inFreeSpins ? GamePhase.FreeSpinShowWin : GamePhase.ShowWins;
    } else if (this.pendingFreeSpins) {
      this.pendingFreeSpins = false;
      this.phase = GamePhase.FreeSpinIntro;
    } else if (this.inFreeSpins) {
      this.advanceFreeSpin();
    } else {
      this.phase = GamePhase.Idle;
    }
    this.revision++;
  }

  nextPayline(): void {
    if (this.phase !== GamePhase.ShowWins && this.phase !== GamePhase.FreeSpinShowWin) return;
    this.currentPaylineIndex++;
    if (this.currentPaylineIndex >= this.paylineWins.length) {
      this.currentPaylineIndex = -1;
      if (this.phase === GamePhase.FreeSpinShowWin) {
        this.checkGambleThumb();
      } else if (this.pendingFreeSpins) {
        this.pendingFreeSpins = false;
        this.phase = GamePhase.FreeSpinIntro;
      } else {
        this.phase = GamePhase.Idle;
      }
    }
    this.revision++;
  }

  dismissWins(): void {
    if (this.phase !== GamePhase.ShowWins && this.phase !== GamePhase.FreeSpinShowWin) return;
    this.currentPaylineIndex = -1;
    if (this.phase === GamePhase.FreeSpinShowWin) {
      this.checkGambleThumb();
    } else if (this.pendingFreeSpins) {
      this.pendingFreeSpins = false;
      this.phase = GamePhase.FreeSpinIntro;
    } else {
      this.phase = GamePhase.Idle;
    }
    this.revision++;
  }

  chooseFreeSpinMode(mode: FreeSpinMode): void {
    if (this.phase !== GamePhase.FreeSpinChoice) return;
    this.freeSpinMode = mode;
    this.gamblePot = 0;
    this.startNextFreeSpin();
  }

  acknowledgeFreeSpinIntro(): void {
    if (this.phase !== GamePhase.FreeSpinIntro) return;
    this.freeSpinMode = null;
    this.gamblePot = 0;
    this.phase = GamePhase.FreeSpinChoice;
    this.revision++;
  }

  private startNextFreeSpin(): void {
    if (this.freeSpinsRemaining <= 0) {
      this.phase = GamePhase.FreeSpinOutro;
      this.revision++;
      return;
    }

    this.freeSpinsRemaining--;
    this.spinWin = 0;
    this.paylineWins = [];
    this.currentPaylineIndex = -1;
    this.wildFeature = null;
    this.gambleThumbResult = null;

    const isGamble = this.freeSpinMode === 'gamble';
    const result = generateFreeSpinResult(isGamble);
    this.spinResult = result;
    this.grid = result.grid.map((reel) => [...reel]);

    this.scatterReels = getScatterReels(result.grid);
    this.scatterPositions = getScatterPositions(result.grid);
    this.scatterCount = countScatters(result.grid);
    this.reelStopDelays = this.computeReelDelays(this.scatterReels);

    this.phase = GamePhase.FreeSpinning;
    this.revision++;
  }

  freeSpinReelsComplete(): void {
    if (this.phase !== GamePhase.FreeSpinning) return;

    if (shouldTriggerWildFeature()) {
      const featureType = pickWildFeature();
      this.wildFeature = applyWildFeature(this.grid, featureType);
      this.phase = GamePhase.FreeSpinWildFeature;
    } else {
      this.phase = GamePhase.FreeSpinEvaluating;
    }
    this.revision++;
  }

  private checkGambleThumb(): void {
    if (this.freeSpinMode === 'gamble') {
      let thumbResult: 'up' | 'down' | null = null;
      for (let row = 0; row < ROWS; row++) {
        const sym = this.grid[2][row];
        if (sym === BanditSymbol.ThumbsUp) { thumbResult = 'up'; break; }
        if (sym === BanditSymbol.ThumbsDown) { thumbResult = 'down'; break; }
      }
      if (thumbResult) {
        this.gambleThumbResult = thumbResult;
        this.phase = GamePhase.GambleReveal;
        this.revision++;
        return;
      }
    }
    this.advanceFreeSpin();
  }

  acknowledgeGambleReveal(): void {
    if (this.phase !== GamePhase.GambleReveal) return;

    if (this.gambleThumbResult === 'up') {
      this.gamblePot *= 2;
      this.balance += this.gamblePot / 2;
      this.freeSpinsTotalWin += this.gamblePot / 2;
      this.advanceFreeSpin();
    } else {
      this.balance -= this.gamblePot;
      this.freeSpinsTotalWin -= this.gamblePot;
      this.gamblePot = 0;
      this.phase = GamePhase.FreeSpinOutro;
      this.revision++;
    }
  }

  private advanceFreeSpin(): void {
    if (this.freeSpinsRemaining > 0) {
      this.startNextFreeSpin();
    } else {
      this.phase = GamePhase.FreeSpinOutro;
      this.revision++;
    }
  }

  dismissFreeSpins(): void {
    if (this.phase !== GamePhase.FreeSpinOutro) return;
    this.phase = GamePhase.Idle;
    this.freeSpinMode = null;
    this.revision++;
  }

  buyBonus(): void {
    if (this.phase !== GamePhase.Idle) return;
    if (this.balance < BUY_BONUS_COST) return;

    this.balance -= BUY_BONUS_COST;
    this.freeSpinBet = this.bet;
    this.freeSpinsRemaining = 10;
    this.freeSpinsTotal = 10;
    this.freeSpinsTotalWin = 0;
    this.spinWin = 0;
    this.paylineWins = [];
    this.currentPaylineIndex = -1;
    this.wildFeature = null;
    this.pendingFreeSpins = false;
    this.gamblePot = 0;
    this.gambleThumbResult = null;
    this.phase = GamePhase.FreeSpinIntro;
    this.revision++;
  }

  forceIdle(): void {
    if (this.phase === GamePhase.Idle) return;
    this.phase = GamePhase.Idle;
    this.paylineWins = [];
    this.currentPaylineIndex = -1;
    this.freeSpinsRemaining = 0;
    this.freeSpinsTotal = 0;
    this.freeSpinsTotalWin = 0;
    this.freeSpinMode = null;
    this.pendingFreeSpins = false;
    this.gamblePot = 0;
    this.gambleThumbResult = null;
    this.revision++;
  }

  private computeReelDelays(scatterReels: number[]): number[] {
    const delays = [0, 0, 0, 0, 0];
    const scatterSet = new Set(scatterReels);
    let scattersSoFar = 0;

    for (let r = 0; r < 5; r++) {
      if (scatterSet.has(r)) scattersSoFar++;

      if (scattersSoFar >= 1 && r >= 2) {
        delays[r] = Math.max(delays[r], 1200 + (r - 2) * 400);
      }
      if (scattersSoFar >= 2) {
        delays[r] = Math.max(delays[r], 2500 + (r - 2) * 800);
      }
    }

    return delays;
  }
}
