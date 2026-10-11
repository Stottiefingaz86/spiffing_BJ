/**
 * @deprecated Per-game HUD chrome — superseded by shared Slot UI
 * (`@/components/slot-ui/SlotOverlay` + `SlotGameShell`).
 * Kept only so older references / docs don’t break imports; prefer SlotGameShell.
 */

import { cn } from '@/lib/utils';

/** @deprecated */
export const slotGlassPill =
  'rounded-[14px] border border-white/[0.12] bg-gradient-to-b from-white/[0.12] to-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-xl';

/** @deprecated */
export const slotInfoPill =
  'rounded-2xl border border-white/[0.08] bg-white/[0.06]';

export type SlotSpinTheme = 'emerald' | 'amber' | 'orange';

const spinMobileEnabled: Record<SlotSpinTheme, string> = {
  emerald:
    'relative overflow-hidden border border-white/25 bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-700 text-white shadow-[inset_0_3px_0_rgba(255,255,255,0.38),inset_0_-2px_0_rgba(0,0,0,0.15),0_8px_28px_rgba(34,197,94,0.42)]',
  amber:
    'relative overflow-hidden border border-white/25 bg-gradient-to-b from-amber-400 via-amber-500 to-amber-800 text-white shadow-[inset_0_3px_0_rgba(255,255,255,0.35),inset_0_-2px_0_rgba(0,0,0,0.15),0_8px_28px_rgba(245,158,11,0.42)]',
  orange:
    'relative overflow-hidden border border-white/25 bg-gradient-to-b from-orange-400 via-orange-500 to-orange-700 text-white shadow-[inset_0_3px_0_rgba(255,255,255,0.35),inset_0_-2px_0_rgba(0,0,0,0.15),0_8px_28px_rgba(249,115,22,0.45)]',
};

const spinDesktopEnabled: Record<SlotSpinTheme, string> = {
  emerald:
    'relative overflow-hidden border border-white/25 bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-700 text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.38),inset_0_-2px_0_rgba(0,0,0,0.12),0_6px_22px_rgba(34,197,94,0.38)] hover:brightness-[1.05]',
  amber:
    'relative overflow-hidden border border-white/25 bg-gradient-to-b from-amber-400 via-amber-500 to-amber-800 text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35),inset_0_-2px_0_rgba(0,0,0,0.12),0_6px_22px_rgba(245,158,11,0.38)] hover:brightness-[1.05]',
  orange:
    'relative overflow-hidden border border-white/25 bg-gradient-to-b from-orange-400 via-orange-500 to-orange-700 text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35),inset_0_-2px_0_rgba(0,0,0,0.12),0_6px_22px_rgba(249,115,22,0.4)] hover:brightness-[1.05]',
};

const spinMobileBase =
  'pointer-events-auto flex size-24 items-center justify-center rounded-full transition-all active:scale-[0.90]';

/** @deprecated */
export function slotSpinMobileClasses(canSpin: boolean, theme: SlotSpinTheme = 'emerald') {
  return cn(
    spinMobileBase,
    canSpin ? spinMobileEnabled[theme] : 'border border-white/10 bg-white/10 text-white/35',
  );
}

/** @deprecated */
export function slotSpinDesktopClasses(canSpin: boolean, theme: SlotSpinTheme = 'emerald') {
  return cn(
    'pointer-events-auto flex size-[4.5rem] items-center justify-center rounded-full transition-all active:scale-[0.94]',
    canSpin ? spinDesktopEnabled[theme] : 'border border-white/10 bg-white/10 text-white/35',
  );
}
