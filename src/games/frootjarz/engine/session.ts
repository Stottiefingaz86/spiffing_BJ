import { createGrid, createFruitGrid, countScatters, type Grid } from './grid';
import { runCascadeLoop, type CascadeStep } from './cascade';
import { syncJarStates, type JarState } from './jarWild';

export enum GamePhase {
  Idle = 'Idle',
  Dropping = 'Dropping',
  Cascading = 'Cascading',
  ShowWin = 'ShowWin',
  FreeSpinIntro = 'FreeSpinIntro',
  FreeSpinDropping = 'FreeSpinDropping',
  FreeSpinCascading = 'FreeSpinCascading',
  FreeSpinOutro = 'FreeSpinOutro',
}

export interface FrootJarzSnapshot {
  phase: GamePhase;
  grid: Grid;
  balance: number;
  bet: number;
  spinWin: number;
  cascadeSteps: CascadeStep[];
  currentCascadeIndex: number;
  jarStates: JarState[];
  revision: number;
  freeSpinsRemaining: number;
  freeSpinsTotal: number;
  freeSpinsTotalWin: number;
  inFreeSpins: boolean;
}

const SCATTER_TRIGGER = 3;
const FREE_SPINS_AWARD = 10;
const FREE_SPINS_RETRIGGER = 5;
const BET_OPTIONS = [10, 20, 40, 60, 100, 200, 500, 1000, 2000, 5000, 10000];
const DEFAULT_BALANCE = 100000;
export const BUY_BONUS_COST = 10000; // $100 in cents

export class FrootJarzSession {
  private grid: Grid;
  private initialGrid: Grid | null = null;
  private balance: number;
  private bet: number;
  private phase: GamePhase;
  private spinWin: number;
  private cascadeSteps: CascadeStep[];
  private currentCascadeIndex: number;
  private jarStates: JarState[];
  private revision: number;

  // Free spins state
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
    this.cascadeSteps = [];
    this.currentCascadeIndex = -1;
    this.jarStates = [];
    this.revision = 0;
  }

  private get displayGrid(): Grid {
    if ((this.phase === GamePhase.Dropping || this.phase === GamePhase.FreeSpinDropping) && this.initialGrid) {
      return this.initialGrid;
    }
    if ((this.phase === GamePhase.Cascading || this.phase === GamePhase.FreeSpinCascading) && this.currentCascadeIndex >= 0) {
      const step = this.cascadeSteps[this.currentCascadeIndex];
      if (step) return step.gridBefore;
    }
    if ((this.phase === GamePhase.Cascading || this.phase === GamePhase.FreeSpinCascading) && this.currentCascadeIndex === -1 && this.initialGrid) {
      return this.initialGrid;
    }
    return this.grid;
  }

  private get inFreeSpins(): boolean {
    return this.phase === GamePhase.FreeSpinIntro ||
      this.phase === GamePhase.FreeSpinDropping ||
      this.phase === GamePhase.FreeSpinCascading ||
      this.phase === GamePhase.FreeSpinOutro;
  }

  getSnapshot(): FrootJarzSnapshot {
    const g = this.displayGrid;
    return {
      phase: this.phase,
      grid: g.map((row) => row.map((cell) => (cell ? { ...cell } : cell))),
      balance: this.balance,
      bet: this.inFreeSpins ? this.freeSpinBet : this.bet,
      spinWin: this.spinWin,
      cascadeSteps: this.cascadeSteps,
      currentCascadeIndex: this.currentCascadeIndex,
      jarStates: this.jarStates.map((j) => ({ ...j })),
      revision: this.revision,
      freeSpinsRemaining: this.freeSpinsRemaining,
      freeSpinsTotal: this.freeSpinsTotal,
      freeSpinsTotalWin: this.freeSpinsTotalWin,
      inFreeSpins: this.inFreeSpins,
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

  increaseBet(): void {
    const idx = BET_OPTIONS.indexOf(this.bet);
    if (idx < BET_OPTIONS.length - 1) this.setBet(BET_OPTIONS[idx + 1]);
  }

  decreaseBet(): void {
    const idx = BET_OPTIONS.indexOf(this.bet);
    if (idx > 0) this.setBet(BET_OPTIONS[idx - 1]);
  }

  spin(): void {
    if (this.phase !== GamePhase.Idle) return;
    if (this.balance < this.bet) return;

    this.balance -= this.bet;
    this.spinWin = 0;
    this.cascadeSteps = [];
    this.currentCascadeIndex = -1;
    this.pendingFreeSpins = false;

    this.grid = createGrid();
    this.initialGrid = this.grid.map((row) => row.map((cell) => ({ ...cell })));
    this.jarStates = syncJarStates(this.grid, []);

    const steps = runCascadeLoop(this.grid, this.jarStates);
    this.cascadeSteps = steps;

    let totalMult = 0;
    for (const step of steps) {
      totalMult += step.payoutMultiplier;
    }
    this.spinWin = Math.round(this.bet * totalMult);
    this.balance += this.spinWin;

    // Check for scatter trigger on the INITIAL grid (before cascades removed them)
    const scatterCount = countScatters(this.initialGrid!);
    if (scatterCount >= SCATTER_TRIGGER) {
      this.pendingFreeSpins = true;
      this.freeSpinBet = this.bet;
      this.freeSpinsRemaining = FREE_SPINS_AWARD;
      this.freeSpinsTotal = FREE_SPINS_AWARD;
      this.freeSpinsTotalWin = 0;
    }

    this.phase = GamePhase.Dropping;
    this.revision++;
  }

  dropComplete(): void {
    if (this.phase !== GamePhase.Dropping) return;
    if (this.cascadeSteps.length > 0) {
      this.currentCascadeIndex = 0;
      this.phase = GamePhase.Cascading;
    } else if (this.pendingFreeSpins) {
      this.pendingFreeSpins = false;
      this.phase = GamePhase.FreeSpinIntro;
    } else {
      this.phase = this.spinWin > 0 ? GamePhase.ShowWin : GamePhase.Idle;
    }
    this.revision++;
  }

  nextCascade(): void {
    if (this.phase !== GamePhase.Cascading) return;
    this.currentCascadeIndex++;
    if (this.currentCascadeIndex >= this.cascadeSteps.length) {
      this.initialGrid = null;
      if (this.pendingFreeSpins) {
        this.pendingFreeSpins = false;
        this.phase = GamePhase.FreeSpinIntro;
      } else {
        this.phase = this.spinWin > 0 ? GamePhase.ShowWin : GamePhase.Idle;
      }
    }
    this.revision++;
  }

  dismissWin(): void {
    if (this.phase !== GamePhase.ShowWin) return;
    this.phase = GamePhase.Idle;
    this.initialGrid = null;
    this.revision++;
  }

  // ── Free Spins ──

  startFreeSpin(): void {
    if (this.phase !== GamePhase.FreeSpinIntro &&
        this.phase !== GamePhase.FreeSpinCascading &&
        this.phase !== GamePhase.FreeSpinDropping) return;
    if (this.freeSpinsRemaining <= 0) {
      this.phase = GamePhase.FreeSpinOutro;
      this.revision++;
      return;
    }

    this.freeSpinsRemaining--;
    this.spinWin = 0;
    this.cascadeSteps = [];
    this.currentCascadeIndex = -1;

    // Fruit-only grid — no new jars or scatters from grid creation
    this.grid = createFruitGrid();

    this.initialGrid = this.grid.map((row) => row.map((cell) => ({ ...cell })));
    this.jarStates = syncJarStates(this.grid, []);

    // Normal cascade — jars consumed on win (not sticky)
    const steps = runCascadeLoop(this.grid, this.jarStates);
    this.cascadeSteps = steps;

    let totalMult = 0;
    for (const step of steps) {
      totalMult += step.payoutMultiplier;
    }
    this.spinWin = Math.round(this.freeSpinBet * totalMult);
    this.freeSpinsTotalWin += this.spinWin;
    this.balance += this.spinWin;

    this.phase = GamePhase.FreeSpinDropping;
    this.revision++;
  }

  freeSpinDropComplete(): void {
    if (this.phase !== GamePhase.FreeSpinDropping) return;
    if (this.cascadeSteps.length > 0) {
      this.currentCascadeIndex = 0;
      this.phase = GamePhase.FreeSpinCascading;
    } else if (this.freeSpinsRemaining > 0) {
      this.startFreeSpin();
    } else {
      this.phase = GamePhase.FreeSpinOutro;
    }
    this.revision++;
  }

  freeSpinNextCascade(): void {
    if (this.phase !== GamePhase.FreeSpinCascading) return;
    this.currentCascadeIndex++;
    if (this.currentCascadeIndex >= this.cascadeSteps.length) {
      this.initialGrid = null;
      if (this.freeSpinsRemaining > 0) {
        this.startFreeSpin();
      } else {
        this.phase = GamePhase.FreeSpinOutro;
        this.revision++;
      }
      return;
    }
    this.revision++;
  }

  dismissFreeSpins(): void {
    if (this.phase !== GamePhase.FreeSpinOutro) return;
    this.phase = GamePhase.Idle;
    this.initialGrid = null;
    this.revision++;
  }

  buyBonus(): void {
    if (this.phase !== GamePhase.Idle) return;
    if (this.balance < BUY_BONUS_COST) return;

    this.balance -= BUY_BONUS_COST;
    this.freeSpinBet = this.bet;
    this.freeSpinsRemaining = FREE_SPINS_AWARD;
    this.freeSpinsTotal = FREE_SPINS_AWARD;
    this.freeSpinsTotalWin = 0;
    this.spinWin = 0;
    this.cascadeSteps = [];
    this.currentCascadeIndex = -1;
    this.pendingFreeSpins = false;
    this.phase = GamePhase.FreeSpinIntro;
    this.revision++;
  }

  forceIdle(): void {
    if (this.phase === GamePhase.Idle) return;
    this.phase = GamePhase.Idle;
    this.initialGrid = null;
    this.cascadeSteps = [];
    this.currentCascadeIndex = -1;
    this.freeSpinsRemaining = 0;
    this.freeSpinsTotal = 0;
    this.freeSpinsTotalWin = 0;
    this.pendingFreeSpins = false;
    this.revision++;
  }
}
