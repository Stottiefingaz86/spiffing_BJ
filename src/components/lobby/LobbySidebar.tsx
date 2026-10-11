'use client';

import type { CSSProperties } from 'react';
import { Dices, Mail, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const CONTACT_HREF = 'mailto:hello@spiffingstudios.com?subject=Spiffing%20studio%20demo';

const sidebarVars = {
  '--sidebar': 'rgba(14, 6, 32, 0.94)',
  '--sidebar-foreground': '#f2f2f2',
  '--sidebar-primary': '#ff5a1f',
  '--sidebar-primary-foreground': '#0e0620',
  '--sidebar-accent': 'rgba(255, 255, 255, 0.06)',
  '--sidebar-accent-foreground': '#ff5a1f',
  '--sidebar-border': 'transparent',
  '--sidebar-ring': '#ff5a1f',
  '--sidebar-width': '17rem',
} as CSSProperties;

const navItems = [
  { title: 'Games', href: '#games', icon: Dices },
  { title: 'Exclusive', href: '#games', icon: Sparkles, filterJump: 'exclusive' as const },
  { title: 'Contact', href: CONTACT_HREF, icon: Mail },
];

function LobbyLogo({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <a
      href="/"
      className={cn(
        'spiffing-logo-glitch spiffing-logo-glitch--subtle mx-auto leading-none',
        className,
      )}
      aria-label="Spiffing Studios home"
      onClick={onClick}
    >
      <img
        src="/spiffing3d.png"
        alt="Spiffing Studios"
        className="spiffing-logo-glitch__img block h-12 w-auto"
        width={354}
        height={177}
      />
      <span className="spiffing-logo-crt" aria-hidden="true" />
    </a>
  );
}

function LobbySidebarNav() {
  const { isMobile, setOpenMobile, open, setOpen } = useSidebar();

  const closeDrawer = () => {
    if (isMobile) setOpenMobile(false);
    else setOpen(false);
  };

  return (
    <>
      {!isMobile && open ? (
        <button
          type="button"
          className="lobby-sidebar-backdrop pointer-events-auto fixed inset-0 z-[54]"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <Sidebar
        collapsible="offcanvas"
        variant="floating"
        className="lobby-sidebar font-staatliches !border-0"
      >
        <SidebarHeader className="items-center border-0 p-5 pb-2 text-center">
          <LobbyLogo />
        </SidebarHeader>

        <SidebarContent className="px-3 py-3">
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1.5">
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      size="lg"
                      tooltip={item.title}
                      className="lobby-sidebar-link h-11 rounded-xl border-0 px-3 font-staatliches text-xs uppercase tracking-[0.16em]"
                      render={
                        <a
                          href={item.href}
                          {...(item.filterJump ? { 'data-filter-jump': item.filterJump } : {})}
                          onClick={closeDrawer}
                        />
                      }
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-0 p-4 pt-2">
          <Button
            render={<a href={CONTACT_HREF} onClick={closeDrawer} />}
            className="lobby-brand-cta h-11 w-full rounded-full text-[11px] font-bold uppercase tracking-[0.16em]"
          >
            Contact
          </Button>
        </SidebarFooter>
      </Sidebar>

      <div className="pointer-events-auto fixed top-3 left-3 z-[60]">
        <SidebarTrigger
          className={cn(
            'size-10 rounded-xl border-0 bg-black/40 text-[var(--toshi-muted)] shadow-lg backdrop-blur-md',
            'hover:bg-black/55 hover:text-[var(--toshi-orange)]',
          )}
        />
      </div>
    </>
  );
}

export function LobbySidebar() {
  return (
    <TooltipProvider>
      <SidebarProvider
        defaultOpen={false}
        style={sidebarVars}
        className="lobby-sidebar-root pointer-events-none !fixed !inset-0 !z-50 !min-h-0 !w-full !bg-transparent"
      >
        <LobbySidebarNav />
      </SidebarProvider>
    </TooltipProvider>
  );
}
