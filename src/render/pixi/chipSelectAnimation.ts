/**
 * Smooth easing for chip-rail selection: selected chip scales up, neighbours spread apart.
 * Stateful module — sync with current selection, tick each frame.
 */

const ANIM_MS = 260;
const SELECTED_SCALE = 1.38;
const UNSELECTED_SCALE = 0.88;
const SPREAD_PX = 10;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

const SELECTED_LIFT = -10;

interface ChipAnim {
  currentScale: number;
  targetScale: number;
  currentOffsetX: number;
  targetOffsetX: number;
  currentOffsetY: number;
  targetOffsetY: number;
  t0: number;
  startScale: number;
  startOffsetX: number;
  startOffsetY: number;
}

const chips: ChipAnim[] = [];

function ensureSlots(count: number): void {
  while (chips.length < count) {
    chips.push({
      currentScale: 1,
      targetScale: 1,
      currentOffsetX: 0,
      targetOffsetX: 0,
      currentOffsetY: 0,
      targetOffsetY: 0,
      t0: 0,
      startScale: 1,
      startOffsetX: 0,
      startOffsetY: 0,
    });
  }
}

export function syncChipSelection(selectedIndex: number, chipCount: number): void {
  ensureSlots(chipCount);
  const now = performance.now();
  for (let i = 0; i < chipCount; i++) {
    const c = chips[i]!;
    const isSelected = i === selectedIndex;
    const newScale = isSelected ? SELECTED_SCALE : (selectedIndex >= 0 ? UNSELECTED_SCALE : 1);

    let newOffset = 0;
    if (selectedIndex >= 0 && selectedIndex < chipCount) {
      if (i < selectedIndex) newOffset = -SPREAD_PX * (1 - Math.abs(i - selectedIndex) / chipCount);
      else if (i > selectedIndex) newOffset = SPREAD_PX * (1 - Math.abs(i - selectedIndex) / chipCount);
    }

    const newOffsetY = isSelected ? SELECTED_LIFT : 0;

    if (c.targetScale !== newScale || c.targetOffsetX !== newOffset || c.targetOffsetY !== newOffsetY) {
      c.startScale = c.currentScale;
      c.startOffsetX = c.currentOffsetX;
      c.startOffsetY = c.currentOffsetY;
      c.targetScale = newScale;
      c.targetOffsetX = newOffset;
      c.targetOffsetY = newOffsetY;
      c.t0 = now;
    }
  }
}

export function tickChipAnimations(now: number): boolean {
  let dirty = false;
  for (const c of chips) {
    if (c.currentScale === c.targetScale && c.currentOffsetX === c.targetOffsetX && c.currentOffsetY === c.targetOffsetY) continue;
    const elapsed = now - c.t0;
    const u = Math.min(1, elapsed / ANIM_MS);
    const e = easeOutCubic(u);
    c.currentScale = c.startScale + (c.targetScale - c.startScale) * e;
    c.currentOffsetX = c.startOffsetX + (c.targetOffsetX - c.startOffsetX) * e;
    c.currentOffsetY = c.startOffsetY + (c.targetOffsetY - c.startOffsetY) * e;
    if (u >= 1) {
      c.currentScale = c.targetScale;
      c.currentOffsetX = c.targetOffsetX;
      c.currentOffsetY = c.targetOffsetY;
    }
    dirty = true;
  }
  return dirty;
}

export function chipAnimScale(index: number): number {
  return chips[index]?.currentScale ?? 1;
}

export function chipAnimOffsetX(index: number): number {
  return chips[index]?.currentOffsetX ?? 0;
}

export function chipAnimOffsetY(index: number): number {
  return chips[index]?.currentOffsetY ?? 0;
}

export function chipAnimationsActive(): boolean {
  return chips.some((c) => c.currentScale !== c.targetScale || c.currentOffsetX !== c.targetOffsetX || c.currentOffsetY !== c.targetOffsetY);
}
