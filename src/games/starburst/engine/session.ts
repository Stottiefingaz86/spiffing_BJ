import {
  BASE_GRID_COLS,
  BASE_GRID_ROWS,
  EXPANDED_GRID_COLS,
  EXPANDED_GRID_ROWS,
  randomPaying,
  randomScatterMultiplier,
  SCATTER,
  type ScatterMultiplier,
} from './symbols';
import {
  cloneGrid,
  createGrid,
  findScatterCells,
  makeCell,
  type Cell,
  type Grid,
} from './grid';
import { stepOnce, type WinCascadeStep } from './cascade';
import {
  applyFeature,
  applyGalaxyStar,
  applyGalaxyStarExtraWilds,
  applyMegaStar,
  applyMegaStarExtraWilds,
  FeatureType,
  randomGeneratorFeature,
  type FeatureApplication,
} from './features';

export enum GamePhase {
  Idle = 'Idle',
  Dropping = 'Dropping',
  Cascading = 'Cascading',
  FeatureActivating = 'FeatureActivating',
  Expanding = 'Expanding',
  ShowWin = 'ShowWin',
}

export type CascadeAction =
  | { kind: 'win'; step: WinCascadeStep; payout: number; multiplierCollectApplied: number }
  | {
      kind: 'scatterAdd';
      added: { row: number; col: number; cellId: number; multiplier: ScatterMultiplier }[];
      newMeterValue: number;
      gridBefore: Grid;
      gridAfter: Grid;
    }
  | {
      kind: 'feature';
      feature: FeatureType;
      application: FeatureApplication;
      gridAfterFill: Grid;
      expanded?: boolean;
      silent?: boolean; // when true, no label overlay (used for stale-block sweep)
    };

export interface StarburstSnapshot {
  phase: GamePhase;
  grid: Grid;
  balance: number;
  bet: number;             // Cost of THIS spin (bet × Elevate multiplier)
  baseBet: number;         // Selected stake
  spinWin: number;
  cascadeSteps: CascadeAction[];
  currentCascadeIndex: number;
  revision: number;

  // Meters
  featureGenCount: number;         // 0..4 (persists across spins, resets on 0-win spin)
  featureAwardCount: number;       // 0..4 (every 5th award converts into a Galaxy Star)
  pendingFeatures: FeatureType[];  // FIFO
  galaxyMeter: number;             // 0..49 (only fills while galaxyMeterActive)
  galaxyMeterActive: boolean;      // Activates with first 3x3 Wild (per spec)
  pendingGalaxyStars: number;
  multiplierCollect: number;       // Sum of all collected scatter multipliers (0 = x1; resets per spin)

  pendingMegaStar: boolean;
  gridExpanded: boolean;

  elevate: ElevateOption;
}

export enum ElevateOption {
  None = 'none',
  BonusBoost = 'bonusBoost',
  MegaStar = 'megaStar',
  BoostedMegaStar = 'boostedMegaStar',
  GalaxyStar = 'galaxyStar',
  GalaxyStarBonanza = 'galaxyStarBonanza',
}

export const ELEVATE_COST_MULTIPLIER: Record<ElevateOption, number> = {
  [ElevateOption.None]: 1,
  [ElevateOption.BonusBoost]: 3,
  [ElevateOption.MegaStar]: 10,
  [ElevateOption.BoostedMegaStar]: 50,
  [ElevateOption.GalaxyStar]: 100,
  [ElevateOption.GalaxyStarBonanza]: 500,
};

export const ELEVATE_LABELS: Record<ElevateOption, string> = {
  [ElevateOption.None]: 'Normal',
  [ElevateOption.BonusBoost]: 'Bonus Boost',
  [ElevateOption.MegaStar]: 'Mega Star',
  [ElevateOption.BoostedMegaStar]: 'Boosted Mega Star',
  [ElevateOption.GalaxyStar]: 'Galaxy Star',
  [ElevateOption.GalaxyStarBonanza]: 'Galaxy Star Bonanza',
};

export const ELEVATE_DESCRIPTIONS: Record<ElevateOption, string> = {
  [ElevateOption.None]: 'Standard spin',
  [ElevateOption.BonusBoost]: '3× bet · doubles Galaxy Star chance',
  [ElevateOption.MegaStar]: '10× bet · guarantees 3 Scatters',
  [ElevateOption.BoostedMegaStar]: '50× bet · 3 Scatters, ≥2 with multipliers',
  [ElevateOption.GalaxyStar]: '100× bet · guarantees Galaxy Star',
  [ElevateOption.GalaxyStarBonanza]: '500× bet · 5 features + ×2–×75 multiplier',
};

const BET_OPTIONS = [10, 20, 40, 60, 100, 200, 500, 1000, 2000, 5000, 10000];
const DEFAULT_BALANCE = 100000;

const FEATURE_GEN_THRESHOLD = 5;
const GALAXY_METER_THRESHOLD = 50;
const MAX_CASCADE_ACTIONS = 24;
const MAX_WIN_CASCADES_PER_ROUND = 6;

export class StarburstSession {
  private grid: Grid;
  private balance: number;
  private bet: number;
  private phase: GamePhase;
  private spinWin: number;
  private actions: CascadeAction[];
  private currentActionIndex: number;
  private revision: number;

  // Meters — persistence rules (per NetEnt spec):
  //   Feature Generator: 5 *consecutive* wins → feature; counter persists across
  //     winning spins, resets on a zero-win spin.
  //   Feature award count: total features awarded; every 5th award converts into a Galaxy Star.
  //   Galaxy Metre: activates with the appearance of the 3×3 Wild; persists across spins once active;
  //     each win fills, 50 awards another Galaxy Star.
  //   Multiplier Collect: resets per spin (applies "for the remainder of the game round").
  private featureGenCount = 0;
  private featureAwardCount = 0;
  private pendingFeatures: FeatureType[] = [];
  private galaxyMeter = 0;
  private galaxyMeterActive = false;
  private pendingGalaxyStars = 0;
  private multiplierCollect = 0;
  private pendingMegaStar = false;
  private pendingMegaStarExtra = false;
  private pendingGalaxyStarExtra = false;
  private gridExpanded = false;
  private pendingElevate = ElevateOption.None;
  private activeElevate = ElevateOption.None;
  private bonanzaBonusMultiplier = 0;

  constructor() {
    this.grid = createGrid(BASE_GRID_ROWS, BASE_GRID_COLS);
    this.balance = DEFAULT_BALANCE;
    this.bet = BET_OPTIONS[2];
    this.phase = GamePhase.Idle;
    this.spinWin = 0;
    this.actions = [];
    this.currentActionIndex = -1;
    this.revision = 0;
  }

  // ---- Snapshot / display grid ----

  private get displayGrid(): Grid {
    if (this.phase === GamePhase.Dropping) {
      const first = this.actions[0];
      if (first) return this.gridBeforeAction(first);
      return this.grid;
    }
    if ((this.phase === GamePhase.Cascading ||
         this.phase === GamePhase.FeatureActivating ||
         this.phase === GamePhase.Expanding) && this.currentActionIndex >= 0) {
      const action = this.actions[this.currentActionIndex];
      if (action) return this.gridBeforeAction(action);
    }
    return this.grid;
  }

  private gridBeforeAction(action: CascadeAction): Grid {
    if (action.kind === 'win') return action.step.gridBefore;
    if (action.kind === 'scatterAdd') return action.gridBefore;
    return action.application.gridBefore;
  }

  getSnapshot(): StarburstSnapshot {
    const g = this.displayGrid;
    return {
      phase: this.phase,
      grid: g.map((row) => row.map((cell) => (cell ? { ...cell } : cell))),
      balance: this.balance,
      bet: this.spinCost(),
      baseBet: this.bet,
      spinWin: this.spinWin,
      cascadeSteps: this.actions,
      currentCascadeIndex: this.currentActionIndex,
      revision: this.revision,
      featureGenCount: this.featureGenCount,
      featureAwardCount: this.featureAwardCount,
      pendingFeatures: this.pendingFeatures.slice(),
      galaxyMeter: this.galaxyMeter,
      galaxyMeterActive: this.galaxyMeterActive,
      pendingGalaxyStars: this.pendingGalaxyStars,
      multiplierCollect: this.multiplierCollect,
      pendingMegaStar: this.pendingMegaStar,
      gridExpanded: this.gridExpanded,
      elevate: this.pendingElevate,
    };
  }

  // ---- Controls ----

  get betOptions(): number[] { return BET_OPTIONS; }
  get baseBet(): number { return this.bet; }

  spinCost(): number { return this.bet * ELEVATE_COST_MULTIPLIER[this.pendingElevate]; }

  setBet(cents: number): void {
    if (this.phase !== GamePhase.Idle) return;
    if (BET_OPTIONS.includes(cents)) { this.bet = cents; this.revision++; }
  }
  increaseBet(): void {
    const idx = BET_OPTIONS.indexOf(this.bet);
    if (idx < BET_OPTIONS.length - 1) this.setBet(BET_OPTIONS[idx + 1]);
  }
  decreaseBet(): void {
    const idx = BET_OPTIONS.indexOf(this.bet);
    if (idx > 0) this.setBet(BET_OPTIONS[idx - 1]);
  }
  setElevate(option: ElevateOption): void {
    if (this.phase !== GamePhase.Idle) return;
    this.pendingElevate = option;
    this.revision++;
  }

  // ---- Spin flow ----

  spin(): void {
    if (this.phase !== GamePhase.Idle) return;
    const cost = this.spinCost();
    if (this.balance < cost) return;

    this.balance -= cost;
    this.activeElevate = this.pendingElevate;
    // Elevate is a one-shot buy — reset to Normal after consuming.
    this.pendingElevate = ElevateOption.None;

    this.spinWin = 0;
    this.actions = [];
    this.currentActionIndex = -1;
    // featureGenCount, featureAwardCount, pendingFeatures, galaxyMeter, galaxyMeterActive
    // persist across spins per the NetEnt spec (see class-level comment).
    this.pendingGalaxyStars = 0;
    this.multiplierCollect = 0;
    this.pendingMegaStar = false;
    this.pendingMegaStarExtra = false;
    this.pendingGalaxyStarExtra = false;
    this.gridExpanded = false;
    this.bonanzaBonusMultiplier = 0;

    this.grid = this.seedInitialGrid();

    // Apply Elevate preconditions.
    switch (this.activeElevate) {
      case ElevateOption.MegaStar:
        this.ensureThreeScatters();
        this.pendingMegaStar = true;
        break;
      case ElevateOption.BoostedMegaStar:
        this.ensureThreeScatters();
        this.ensureAtLeastTwoMultipliers();
        this.pendingMegaStar = true;
        break;
      case ElevateOption.GalaxyStar:
        this.pendingGalaxyStars += 1;
        break;
      case ElevateOption.GalaxyStarBonanza:
        for (let i = 0; i < 5; i++) this.pendingFeatures.push(randomGeneratorFeature());
        this.pendingGalaxyStars += 1;
        this.bonanzaBonusMultiplier = 2 + Math.floor(Math.random() * 74); // x2..x75
        break;
      case ElevateOption.BonusBoost:
      case ElevateOption.None:
      default:
        break;
    }

    // 3 scatters on the initial drop → Mega Star.
    if (findScatterCells(this.grid).length >= 3) this.pendingMegaStar = true;

    this.buildActions();

    // Consecutive-wins rule: if this spin landed zero wins, reset the Feature Generator counter.
    // Features that have already been awarded (and not yet consumed) are not revoked.
    if (this.spinWin === 0) this.featureGenCount = 0;

    this.balance += this.spinWin;

    this.phase = GamePhase.Dropping;
    this.revision++;
  }

  dropComplete(): void {
    if (this.phase !== GamePhase.Dropping) return;
    if (this.actions.length > 0) {
      this.currentActionIndex = 0;
      this.phase = this.phaseForAction(this.actions[0]);
    } else {
      this.phase = this.spinWin > 0 ? GamePhase.ShowWin : GamePhase.Idle;
    }
    this.revision++;
  }

  nextCascade(): void {
    if (this.phase !== GamePhase.Cascading &&
        this.phase !== GamePhase.FeatureActivating &&
        this.phase !== GamePhase.Expanding) return;
    this.currentActionIndex++;
    if (this.currentActionIndex >= this.actions.length) {
      this.phase = this.spinWin > 0 ? GamePhase.ShowWin : GamePhase.Idle;
    } else {
      this.phase = this.phaseForAction(this.actions[this.currentActionIndex]);
    }
    this.revision++;
  }

  dismissWin(): void {
    if (this.phase !== GamePhase.ShowWin) return;
    this.phase = GamePhase.Idle;
    this.revision++;
  }

  forceIdle(): void {
    if (this.phase === GamePhase.Idle) return;
    this.phase = GamePhase.Idle;
    this.actions = [];
    this.currentActionIndex = -1;
    this.revision++;
  }

  // Legacy no-ops kept so the canvas callback interface doesn't need to change right away.
  freeSpinDropComplete(): void { this.dropComplete(); }
  freeSpinNextCascade(): void { this.nextCascade(); }
  dismissFreeSpins(): void { this.dismissWin(); }
  startFreeSpin(): void {}
  buyBonus(): void {
    // Buy a Galaxy Star spin as the "bonus buy".
    if (this.phase !== GamePhase.Idle) return;
    if (this.balance < this.bet * ELEVATE_COST_MULTIPLIER[ElevateOption.GalaxyStar]) return;
    this.pendingElevate = ElevateOption.GalaxyStar;
    this.spin();
  }

  // ---- Internals ----

  private phaseForAction(a: CascadeAction): GamePhase {
    if (a.kind === 'win') return GamePhase.Cascading;
    if (a.kind === 'scatterAdd') return GamePhase.FeatureActivating;
    if (a.kind === 'feature') return a.expanded ? GamePhase.Expanding : GamePhase.FeatureActivating;
    return GamePhase.Cascading;
  }

  private seedInitialGrid(): Grid {
    if (this.pendingElevate === ElevateOption.BonusBoost) {
      return createGrid(BASE_GRID_ROWS, BASE_GRID_COLS, { scatterChance: 0.05, wildChance: 0.015 });
    }
    return createGrid(BASE_GRID_ROWS, BASE_GRID_COLS);
  }

  private ensureThreeScatters(): void {
    const have = findScatterCells(this.grid).length;
    if (have >= 3) return;
    const need = 3 - have;
    const candidates: { r: number; c: number }[] = [];
    for (let r = 0; r < this.grid.length; r++)
      for (let c = 0; c < this.grid[r].length; c++)
        if (this.grid[r][c].symbol !== SCATTER) candidates.push({ r, c });
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (let i = 0; i < need && i < candidates.length; i++) {
      const { r, c } = candidates[i];
      this.grid[r][c] = makeCell(SCATTER);
    }
  }

  private ensureAtLeastTwoMultipliers(): void {
    const scatters = findScatterCells(this.grid);
    let withMult = scatters.filter((s) => s.cell.multiplier).length;
    for (const s of scatters) {
      if (withMult >= 2) break;
      if (!s.cell.multiplier) {
        s.cell.multiplier = randomScatterMultiplier();
        withMult++;
      }
    }
  }

  /** Build the full list of actions for this round. */
  private buildActions(): void {
    const multFn = () => (this.multiplierCollect > 0 ? this.multiplierCollect : 1);

    let guard = 0;
    let winCascades = 0;
    while (guard++ < MAX_CASCADE_ACTIONS) {
      // 1) Cascade current wins (capped per round to avoid runaway avalanches).
      if (winCascades < MAX_WIN_CASCADES_PER_ROUND) {
        const win = stepOnce(this.grid);
        if (win) {
          winCascades += 1;
          const payout = Math.round(this.bet * win.payoutMultiplier * multFn());
          this.spinWin += payout;
          this.actions.push({ kind: 'win', step: win, payout, multiplierCollectApplied: multFn() });
          this.incrementFeatureGen();
          continue;
        }
      }

      // After cascades stop, force-clear any leftover wild block that didn't get consumed
      // by a win (so the star doesn't persist on the board).
      if (this.clearStaleWildBlocks()) continue;

      // 2) Mega Star or pending collect: harvest any scatter multipliers still on reels.
      if (this.pendingMegaStar || this.multiplierCollect > 0) {
        const harvest = this.harvestScatters(this.pendingMegaStar);
        if (harvest) { this.actions.push(harvest); continue; }
      }

      // 3) Mega Star activation.
      if (this.pendingMegaStar) {
        this.pendingMegaStar = false;
        const app = applyMegaStar(this.grid);
        this.actions.push({ kind: 'feature', feature: FeatureType.MegaStar, application: app, gridAfterFill: cloneGrid(this.grid) });
        this.pendingMegaStarExtra = true;
        continue;
      }
      if (this.pendingMegaStarExtra) {
        this.pendingMegaStarExtra = false;
        const app = applyMegaStarExtraWilds(this.grid);
        this.actions.push({ kind: 'feature', feature: FeatureType.MegaStar, application: app, gridAfterFill: cloneGrid(this.grid) });
        continue;
      }

      // 4) Generator features (FIFO).
      if (this.pendingFeatures.length > 0) {
        const type = this.pendingFeatures.shift()!;
        const app = applyFeature(type, this.grid);
        this.actions.push({ kind: 'feature', feature: type, application: app, gridAfterFill: cloneGrid(this.grid) });
        continue;
      }

      // 5) Galaxy Star activation.
      if (this.pendingGalaxyStars > 0) {
        this.pendingGalaxyStars -= 1;
        if (!this.gridExpanded) {
          const before = cloneGrid(this.grid);
          this.expandGrid();
          const after = cloneGrid(this.grid);
          this.actions.push({
            kind: 'feature',
            feature: FeatureType.GalaxyStar,
            application: { type: FeatureType.GalaxyStar, gridBefore: before, gridAfter: after, changedCellIds: [], newWildIds: [] },
            gridAfterFill: after,
            expanded: true,
          });
        }
        const app = applyGalaxyStar(this.grid);
        this.actions.push({ kind: 'feature', feature: FeatureType.GalaxyStar, application: app, gridAfterFill: cloneGrid(this.grid) });
        this.pendingGalaxyStarExtra = true;
        // "The Galaxy Metre activates with the appearance of the 3x3 Wild."
        this.galaxyMeterActive = true;
        if (this.bonanzaBonusMultiplier > 0) {
          this.multiplierCollect += this.bonanzaBonusMultiplier;
          this.bonanzaBonusMultiplier = 0;
        }
        continue;
      }
      if (this.pendingGalaxyStarExtra) {
        this.pendingGalaxyStarExtra = false;
        const app = applyGalaxyStarExtraWilds(this.grid);
        this.actions.push({ kind: 'feature', feature: FeatureType.GalaxyStar, application: app, gridAfterFill: cloneGrid(this.grid) });
        continue;
      }

      break;
    }
  }

  private incrementFeatureGen(): void {
    this.featureGenCount += 1;
    // Galaxy Metre only fills after it has been activated by the first 3×3 Wild.
    if (this.galaxyMeterActive) this.galaxyMeter += 1;

    if (this.featureGenCount >= FEATURE_GEN_THRESHOLD) {
      this.featureGenCount = 0;
      // Every 5th *awarded* feature from the Feature Generator = Galaxy Star.
      this.featureAwardCount += 1;
      if (this.featureAwardCount >= 5) {
        this.featureAwardCount = 0;
        this.pendingGalaxyStars += 1;
      } else {
        this.pendingFeatures.push(randomGeneratorFeature());
      }
    }
    if (this.galaxyMeterActive && this.galaxyMeter >= GALAXY_METER_THRESHOLD) {
      this.galaxyMeter = 0;
      this.pendingGalaxyStars += 1;
    }
  }

  private harvestScatters(assignMissingMultipliers: boolean): CascadeAction | null {
    const scatters = findScatterCells(this.grid);
    if (scatters.length === 0) return null;
    const before = cloneGrid(this.grid);
    const added: { row: number; col: number; cellId: number; multiplier: ScatterMultiplier }[] = [];
    for (const { row, col, cell } of scatters) {
      let m = cell.multiplier;
      if (!m) {
        if (!assignMissingMultipliers) continue;
        m = randomScatterMultiplier();
        cell.multiplier = m;
      }
      added.push({ row, col, cellId: cell.id, multiplier: m });
    }
    if (added.length === 0) return null;
    this.multiplierCollect += added.reduce((s, a) => s + a.multiplier, 0);

    for (const { row, col } of added) {
      (this.grid[row] as unknown as (null | Cell)[])[col] = null;
    }
    this.settleGravityAndFill();
    return { kind: 'scatterAdd', added, newMeterValue: this.multiplierCollect, gridBefore: before, gridAfter: cloneGrid(this.grid) };
  }

  private settleGravityAndFill(): void {
    const rows = this.grid.length;
    const cols = this.grid[0]?.length ?? 0;
    for (let c = 0; c < cols; c++) {
      let write = rows - 1;
      for (let r = rows - 1; r >= 0; r--) {
        if (this.grid[r][c] !== null) {
          if (r !== write) {
            this.grid[write][c] = this.grid[r][c];
            (this.grid[r] as unknown as (null | Cell)[])[c] = null;
          }
          write--;
        }
      }
    }
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (this.grid[r][c] === null) this.grid[r][c] = makeCell(randomPaying());
  }

  /**
   * Remove any wild-block cells still present on the grid (they should not stick around
   * after their feature has resolved). Returns true if anything changed.
   */
  private clearStaleWildBlocks(): boolean {
    const blockIds = new Set<number>();
    for (const row of this.grid)
      for (const cell of row)
        if (cell?.wildBlock) blockIds.add(cell.wildBlock.id);
    if (blockIds.size === 0) return false;
    const before = cloneGrid(this.grid);
    const clearedIds: number[] = [];
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        if (this.grid[r][c]?.wildBlock) {
          clearedIds.push(this.grid[r][c].id);
          (this.grid[r] as unknown as (null | Cell)[])[c] = null;
        }
      }
    }
    this.settleGravityAndFill();
    const after = cloneGrid(this.grid);
    this.actions.push({
      kind: 'feature',
      feature: FeatureType.MegaStar,
      application: {
        type: FeatureType.MegaStar,
        gridBefore: before,
        gridAfter: after,
        changedCellIds: clearedIds,
        newWildIds: [],
      },
      gridAfterFill: after,
      silent: true,
    });
    return true;
  }

  private expandGrid(): void {
    const oldRows = this.grid.length;
    const oldCols = this.grid[0]?.length ?? 0;
    const newRows = EXPANDED_GRID_ROWS;
    const newCols = EXPANDED_GRID_COLS;
    const rowPad = Math.floor((newRows - oldRows) / 2);
    const colPad = Math.floor((newCols - oldCols) / 2);
    const g: Grid = [];
    for (let r = 0; r < newRows; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < newCols; c++) {
        const sr = r - rowPad;
        const sc = c - colPad;
        if (sr >= 0 && sr < oldRows && sc >= 0 && sc < oldCols && this.grid[sr][sc]) {
          row.push(this.grid[sr][sc]);
        } else {
          row.push(makeCell(randomPaying()));
        }
      }
      g.push(row);
    }
    this.grid = g;
    this.gridExpanded = true;
  }
}

export const BUY_BONUS_COST = 0; // kept for backward-compat; real cost comes from Elevate
