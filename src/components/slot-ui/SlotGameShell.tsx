import type { ReactNode } from 'react';
import { SlotOverlay, type SlotOverlayProps } from '@/components/slot-ui/SlotOverlay';

export interface SlotGameShellProps extends SlotOverlayProps {
  children: ReactNode;
  className?: string;
}

/** Full-viewport shell: game canvas as children, shared Slot UI chrome on top. */
export function SlotGameShell({ children, className, ...overlayProps }: SlotGameShellProps) {
  return (
    <div className={className ?? 'relative h-dvh max-h-dvh w-full overflow-hidden'}>
      <SlotOverlay {...overlayProps}>{children}</SlotOverlay>
    </div>
  );
}
