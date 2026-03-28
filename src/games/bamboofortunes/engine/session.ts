import {
  createGrid,
  createFruitGrid,
  createBonusBuyRevealGrid,
  countScatters,
  detectClusters,
  computePayout,
  type Grid,
  type Cluster,
} from './grid';
import { rollSymbolMultipliers, type SymbolMultiplier } from './symbolMultipliers';
import { SCATTER_FREE_SPINS, SCATTER_TRIGGER } from './symbols';

export enum GamePhase {
  Idle = 'Idle',
  Spinning = 'Spinning',
  ShowWin = 'ShowWin',
  FreeSpinIntro = 'FreeSpinIntro',
  FreeSpinSpinning = 'FreeSpinSpinning',
  FreeSpinOutro = 'FreeSpinOutro',
}

export interface BambooFortunesSnapshot {
  phase: GamePhase;
  grid: Grid;
  balance: number;
  bet: number;
  spinWin: number;
  winClusters: Cluster[];
  symbolMultipliers: SymbolMultiplier[];
  revision: number;
  freeSpinsRemaining: number;
  freeSpinsTotal: number;
  freeSpinsTotalWin: number;
  inFreeSpins: boolean;
  /** True on base-game ShowWin when scatters will open the bonus after dismiss (not mid–free-spin). */
  pendingFreeSpins: boolean;
}

const BET_OPTIONS = [10, 20, 40, 60, 100, 200, 500, 1000, 2000, 5000, 10000];
const DEFAULT_BALANCE = 100000;
export const BUY_BONUS_COST = 10000;

export class BambooFortunesSession {
  private grid: Grid;
  private balance: number;
  private bet: number;
  private phase: GamePhase;
  private spinWin: number;
  private winClusters: Cluster[];
  private symbolMultipliers: SymbolMultiplier[];
  private revision: number;

  private freeSpinsRemaining = 0;
  private freeSpinsTotal = 0;
  private freeSpinsTotalWin = 0;
  private freeSpinBet = 0;
  private pendingFreeSpins = false;

  constructor() {
    this.grid = createGrid();
    this.balance = DEFAULT_BALANCE;
    this.bet = BET_OPTIONS[2];
    this.phase = GamePhase.Idle;
    this.spinWin = 0;
    this.winClusters = [];
    this.symbolMultipliers = [];
    this.revision = 0;
  }

  private get inFreeSpins(): boolean {
    return this.phase === GamePhase.FreeSpinIntro ||
      this.phase === GamePhase.FreeSpinSpinning ||
      this.phase === GamePhase.FreeSpinOutro;
  }

  getSnapshot(): BambooFortunesSnapshot {
    return {
      phase: this.phase,
      grid: this.grid.map((row) => row.map((cell) => (cell ? { ...cell } : cell))),
      balance: this.balance,
      bet: this.inFreeSpins ? this.freeSpinBet : this.bet,
      spinWin: this.spinWin,
      winClusters: this.winClusters,
      symbolMultipliers: [...this.symbolMultipliers],
      revision: this.revision,
      freeSpinsRemaining: this.freeSpinsRemaining,
      freeSpinsTotal: this.freeSpinsTotal,
      freeSpinsTotalWin: this.freeSpinsTotalWin,
      inFreeSpins: this.inFreeSpins,
      pendingFreeSpins: this.pendingFreeSpins,
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
    this.pendingFreeSpins = false;

    this.grid = createGrid();
    this.symbolMultipliers = rollSymbolMultipliers(false);
    this.winClusters = detectClusters(this.grid);
    const payoutMult = computePayout(this.winClusters, this.symbolMultipliers);
    this.spinWin = Math.round(this.bet * payoutMult);
    this.balance += this.spinWin;

    const scatterCount = countScatters(this.grid);
    if (scatterCount >= SCATTER_TRIGGER) {
      this.pendingFreeSpins = true;
      this.freeSpinBet = this.bet;
      this.freeSpinsRemaining = SCATTER_FREE_SPINS;
      this.freeSpinsTotal = SCATTER_FREE_SPINS;
      this.freeSpinsTotalWin = 0;
    }

    this.phase = GamePhase.Spinning;
    this.revision++;
  }

  reelsComplete(): void {
    if (this.phase !== GamePhase.Spinning) return;

    if (this.spinWin > 0) {
      this.phase = GamePhase.ShowWin;
    } else if (this.pendingFreeSpins) {
      this.pendingFreeSpins = false;
      this.phase = GamePhase.FreeSpinIntro;
    } else {
      this.phase = GamePhase.Idle;
    }
    this.revision++;
  }

  dismissWin(): void {
    if (this.phase !== GamePhase.ShowWin) return;
    if (this.pendingFreeSpins) {
      this.pendingFreeSpins = false;
      this.phase = GamePhase.FreeSpinIntro;
    } else {
      this.phase = GamePhase.Idle;
    }
    this.revision++;
  }

  startFreeSpin(): void {
    if (this.phase !== GamePhase.FreeSpinIntro &&
        this.phase !== GamePhase.FreeSpinSpinning) return;

    if (this.freeSpinsRemaining <= 0) {
      this.phase = GamePhase.FreeSpinOutro;
      this.revision++;
      return;
    }

    this.freeSpinsRemaining--;

    this.grid = createFruitGrid();
    this.symbolMultipliers = rollSymbolMultipliers(true);
    this.winClusters = detectClusters(this.grid);
    const payoutMult = computePayout(this.winClusters, this.symbolMultipliers);
    this.spinWin = Math.round(this.freeSpinBet * payoutMult);
    this.freeSpinsTotalWin += this.spinWin;
    this.balance += this.spinWin;

    this.phase = GamePhase.FreeSpinSpinning;
    this.revision++;
  }

  freeSpinReelsComplete(): void {
    if (this.phase !== GamePhase.FreeSpinSpinning) return;

    if (this.spinWin > 0) {
      // Brief show-win, then auto-continue
      this.phase = GamePhase.ShowWin;
    } else if (this.freeSpinsRemaining > 0) {
      this.startFreeSpin();
    } else {
      this.phase = GamePhase.FreeSpinOutro;
    }
    this.revision++;
  }

  dismissFreeSpinWin(): void {
    if (this.phase !== GamePhase.ShowWin || !this.inFreeSpinMode) return;
    if (this.freeSpinsRemaining > 0) {
      this.startFreeSpin();
    } else {
      this.phase = GamePhase.FreeSpinOutro;
      this.revision++;
    }
  }

  private get inFreeSpinMode(): boolean {
    return this.freeSpinsTotal > 0 && this.freeSpinsRemaining >= 0 && this.freeSpinBet > 0;
  }

  dismissFreeSpins(): void {
    if (this.phase !== GamePhase.FreeSpinOutro) return;
    this.phase = GamePhase.Idle;
    this.freeSpinsTotal = 0;
    this.freeSpinsTotalWin = 0;
    this.revision++;
  }

  buyBonus(): void {
    if (this.phase !== GamePhase.Idle) return;
    if (this.balance < BUY_BONUS_COST) return;

    this.balance -= BUY_BONUS_COST;
    this.pendingFreeSpins = false;

    this.grid = createBonusBuyRevealGrid();
    this.symbolMultipliers = rollSymbolMultipliers(false);
    this.winClusters = detectClusters(this.grid);
    const payoutMult = computePayout(this.winClusters, this.symbolMultipliers);
    this.spinWin = Math.round(this.bet * payoutMult);
    this.balance += this.spinWin;

    const scatterCount = countScatters(this.grid);
    if (scatterCount >= SCATTER_TRIGGER) {
      this.pendingFreeSpins = true;
      this.freeSpinBet = this.bet;
      this.freeSpinsRemaining = SCATTER_FREE_SPINS;
      this.freeSpinsTotal = SCATTER_FREE_SPINS;
      this.freeSpinsTotalWin = 0;
    }

    this.phase = GamePhase.Spinning;
    this.revision++;
  }

  forceIdle(): void {
    if (this.phase === GamePhase.Idle) return;
    this.phase = GamePhase.Idle;
    this.spinWin = 0;
    this.winClusters = [];
    this.freeSpinsRemaining = 0;
    this.freeSpinsTotal = 0;
    this.freeSpinsTotalWin = 0;
    this.pendingFreeSpins = false;
    this.symbolMultipliers = [];
    this.revision++;
  }
}
