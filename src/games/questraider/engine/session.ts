import { createGrid, cloneGrid, type Grid } from './grid';
import { runAvalancheLoop, cloneAvalancheStepForSnapshot, type AvalancheStep } from './avalanche';
import { countFreeFallTriggerLines, freeFallsAwardedForLineTriggers } from './paylines';

/** `runAvalancheLoop` advances an internal copy; play grid is unchanged — use last step's settled board. */
function gridAfterCascadeOrPlayGrid(steps: AvalancheStep[], playGrid: Grid): Grid {
  if (steps.length === 0) return playGrid;
  return cloneGrid(steps[steps.length - 1].gridAfter);
}

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

export interface QuestRaiderSnapshot {
  phase: GamePhase;
  grid: Grid;
  balance: number;
  bet: number;
  spinWin: number;
  cascadeSteps: AvalancheStep[];
  currentCascadeIndex: number;
  revision: number;
  freeSpinsRemaining: number;
  freeSpinsTotal: number;
  freeSpinsTotalWin: number;
  inFreeSpins: boolean;
}

/** Design reference: official sheet RTP 95.97% (implementation is approximate / for fun). */
const BET_OPTIONS = [10, 20, 40, 60, 100, 200, 500, 1000, 2000, 5000, 10000];
const DEFAULT_BALANCE = 100000;

export class QuestRaiderSession {
  private grid: Grid;
  private initialGrid: Grid | null = null;
  private balance: number;
  private bet: number;
  private phase: GamePhase;
  private spinWin: number;
  private cascadeSteps: AvalancheStep[];
  private currentCascadeIndex: number;
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
    this.cascadeSteps = [];
    this.currentCascadeIndex = -1;
    this.revision = 0;
  }

  private get displayGrid(): Grid {
    if (
      (this.phase === GamePhase.Dropping || this.phase === GamePhase.FreeSpinDropping) &&
      this.initialGrid
    ) {
      return this.initialGrid;
    }
    if (
      (this.phase === GamePhase.Cascading || this.phase === GamePhase.FreeSpinCascading) &&
      this.currentCascadeIndex >= 0
    ) {
      const step = this.cascadeSteps[this.currentCascadeIndex];
      if (step) return step.gridBefore;
    }
    return this.grid;
  }

  private get inFreeSpins(): boolean {
    return (
      this.phase === GamePhase.FreeSpinIntro ||
      this.phase === GamePhase.FreeSpinDropping ||
      this.phase === GamePhase.FreeSpinCascading ||
      this.phase === GamePhase.FreeSpinOutro
    );
  }

  getSnapshot(): QuestRaiderSnapshot {
    const g = this.displayGrid;
    return {
      phase: this.phase,
      grid: g.map((row) => row.map((cell) => ({ ...cell }))),
      balance: this.balance,
      bet: this.inFreeSpins ? this.freeSpinBet : this.bet,
      spinWin: this.spinWin,
      cascadeSteps: this.cascadeSteps.map(cloneAvalancheStepForSnapshot),
      currentCascadeIndex: this.currentCascadeIndex,
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

    const playGrid = cloneGrid(this.grid);
    this.cascadeSteps = runAvalancheLoop(playGrid, this.bet, false);
    this.grid = gridAfterCascadeOrPlayGrid(this.cascadeSteps, playGrid);

    let total = 0;
    for (const st of this.cascadeSteps) total += st.payoutCents;
    this.spinWin = total;
    this.balance += this.spinWin;

    const ffLines = countFreeFallTriggerLines(this.initialGrid);
    const ffAward = freeFallsAwardedForLineTriggers(ffLines);
    if (ffAward > 0) {
      this.pendingFreeSpins = true;
      this.freeSpinBet = this.bet;
      this.freeSpinsRemaining = ffAward;
      this.freeSpinsTotal = ffAward;
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

  startFreeSpin(): void {
    if (
      this.phase !== GamePhase.FreeSpinIntro &&
      this.phase !== GamePhase.FreeSpinCascading &&
      this.phase !== GamePhase.FreeSpinDropping
    ) {
      return;
    }
    if (this.freeSpinsRemaining <= 0) {
      this.phase = GamePhase.FreeSpinOutro;
      this.revision++;
      return;
    }

    this.freeSpinsRemaining--;
    this.spinWin = 0;
    this.cascadeSteps = [];
    this.currentCascadeIndex = -1;

    this.grid = createGrid();
    this.initialGrid = this.grid.map((row) => row.map((cell) => ({ ...cell })));

    const retrigger = freeFallsAwardedForLineTriggers(countFreeFallTriggerLines(this.initialGrid));
    if (retrigger > 0) {
      this.freeSpinsRemaining += retrigger;
      this.freeSpinsTotal += retrigger;
    }

    const playGrid = cloneGrid(this.grid);
    this.cascadeSteps = runAvalancheLoop(playGrid, this.freeSpinBet, true);
    this.grid = gridAfterCascadeOrPlayGrid(this.cascadeSteps, playGrid);

    let total = 0;
    for (const st of this.cascadeSteps) total += st.payoutCents;
    this.spinWin = total;
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
        this.startFreeSpin(); // bumps revision — must return so we don’t double-count
        return;
      }
      this.phase = GamePhase.FreeSpinOutro;
    }
    /** Always bump when phase/index changed so React clears cascade timers (avoids stray explode SFX). */
    this.revision++;
  }

  dismissFreeSpins(): void {
    if (this.phase !== GamePhase.FreeSpinOutro) return;
    this.phase = GamePhase.Idle;
    this.initialGrid = null;
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
