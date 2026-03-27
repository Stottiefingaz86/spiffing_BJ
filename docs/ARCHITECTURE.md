# Architecture: Rules Engine, Five-Hand Flow, and Rendering Boundary

This document defines **how the blackjack rules engine and round flow stay separable from PixiJS**, and proposes the **Astro + PixiJS + shadcn** repository layout. It is written as a **specification** for implementation alignment.

---

## 1. Design principle: state drives pixels

- The **game engine** owns truth: cards, bets, phase, active seat, shoe consumption, and outcomes.
- **PixiJS** only **renders** and **animates toward** that truth. It does not decide outcomes, draw from the shoe, or apply blackjack rules.
- **Astro + shadcn (React islands)** own **chrome**: menus, modals, settings, paytable, history, loading/errors, operator/debug panels, and **control buttons** that *dispatch commands* to the engine.

**Forbidden coupling:** `import 'pixi.js'` (or any renderer) from `game/` logic packages.

---

## 2. Layered modules (logical packages)

| Layer | Responsibility | Depends on |
|--------|----------------|------------|
| **Domain** | Cards, hands, money (minor units), seat indices—**no** game rules. | Nothing game-specific. |
| **Rules engine (pure)** | Hand totals, soft/hard, blackjack detection, dealer hit/stand policy, settlement vs dealer for one seat. | Domain + `RuleSet` (operator config). |
| **RNG / shoe** | `RandomSource` abstraction, shuffle, multi-deck shoe, cut/reshuffle triggers, `draw()` producing **domain cards** with stable ids. | Domain only. |
| **Operator config** | Limits, `RuleSet`, deck count, penetration, theme tokens, branding URLs, copy, feature flags (double/split/etc. for future). | Shared types only. |
| **Session / orchestrator** | Finite-state flow for the **whole table**: betting → deal → per-seat play → dealer → settlement → round end; validates commands; updates balance. | Domain, rules, RNG, operator config. |
| **Presentation adapters** | Map engine state to **view models** (optional): e.g. format currency, sort cards for animation ordering—still **no** Pixi. | Session snapshots. |
| **Pixi rendering** | Sprites, layouts, tweens, particles; reads **immutable snapshots** (+ optional animation hints). | Session API (subscribe), assets. |
| **Shell UI** | Layout, header, buttons wired to `dispatch(action)`. | Session API, shadcn. |

---

## 3. Blackjack “rules engine” (precise scope)

### 3.1 Pure rules (deterministic, testable)

These functions **never** perform I/O or randomness:

- **Scoring:** best total ≤ 21; soft flag; bust; **visible** cards only when hole is hidden (dealer before reveal).
- **Blackjack:** two-card 21 on opening hand (with defined behavior vs dealer blackjack—push or not—driven by `RuleSet`).
- **Dealer policy:** given **fully visible** dealer hand and `RuleSet` (e.g. H17 vs S17), return whether dealer hits again.
- **Settlement:** given final player hand, final dealer hand, stake, and `RuleSet`, return outcome kind and **payout delta** in minor units.

### 3.2 Not in the pure rules layer

- Which seat is active.
- When to deal the next card from the shoe.
- Wallet balance updates beyond **pure payout arithmetic** (orchestrator applies results to balance).
- Animations, sound, or layout.

### 3.3 Configurability (future-friendly)

`RuleSet` (or equivalent) should carry toggles and payouts so operators can change behavior **without** branching inside Pixi:

- Dealer: hit vs stand on soft 17.
- Blackjack payout: 3:2, 6:5, even money (future product decisions).
- Feature gates: insurance, double, split, surrender (V1 off; engine still structured so additions are localized).

---

## 4. Five-hand round flow (orchestrator)

The **session** implements the product flow from the PRD. Suggested **phases** (finite-state style):

`loading` → `ready` → `betting` → `dealing` → `player_turn` → `hand_transition` (optional beat for UX) → `dealer_turn` → `settlement` → `round_complete` → (`reshuffling` if needed) → `betting`  
`error` may be entered from any phase with a recoverable or fatal message.

### 4.1 Betting

- Inputs: `PLACE_BET` (seat, amount), `CLEAR`, `UNDO` (if offered), `DEAL` when valid.
- Constraints: per-seat min/max; **total** pending stakes ≤ balance; inactive seats have zero stake.
- Output state: per-seat pending bets; phase remains `betting` until deal.

### 4.2 Initial deal

- Orchestrator pulls cards from the **shoe** in a defined **real-world order** (documented in code comments) so replay and animation stay consistent.
- Dealer: up card + hole (`faceUp: false` until dealer turn).
- Each **active** seat: two cards, typically face-up.
- Post-deal resolution (V1): seats with **player blackjack** are marked **complete** (no hit/stand); active seat pointer skips them.

### 4.3 Player turn sequence (seats 1 → 5)

- **Active seat** is the lowest index that is **in round**, **not bust**, **not stood**, and **not otherwise terminal**.
- Legal commands: `HIT`, `STAND` (V1). Future: `DOUBLE`, `SPLIT`, `SURRENDER` behind feature flags.
- On bust: seat becomes terminal; advance to next seat.
- On stand: advance to next seat.
- When no seats remain to play: transition to **dealer turn**.

### 4.4 Dealer turn

- Reveal hole (set `faceUp: true` on hole card).
- While `dealerShouldHit(...)`: draw from shoe, append to dealer hand.
- Stop when policy says stand or hand is bust.

### 4.5 Settlement

- For each **active** seat, call **pure settlement** with final hands and stake.
- Apply **balance** changes (orchestrator): typically stake was reserved or deducted at deal—whichever accounting model is chosen must be **one place** and documented.
- Emit per-seat outcome for UI (win / lose / push / blackjack / bust).

### 4.6 Round complete and shoe

- Offer `ACK` / “next round” when UX requires.
- Reset per-round structures; keep shoe state.
- If remaining cards ≤ penetration reserve: enter `reshuffling`, build new shoe, return to `betting`.

---

## 5. Clean separation from PixiJS (contract)

### 5.1 What Pixi receives

- A **read-only snapshot** of table state at a point in time, e.g.:
  - `phase`
  - `dealer.hand` (cards with `faceUp`, `id`, rank/suit)
  - `seats[]` (bet, hand, status, outcome labels)
  - `activeSeatIndex | null`
  - `revision` (monotonic counter for diffing)
- Optional **`AnimationHint[]`** or `DealEvent[]` if the engine chooses to expose ordered events for tween planning—**still no Pixi types** inside those hints.

### 5.2 What Pixi sends back

- **Nothing** to the rules engine directly. Input is always **user intent** captured by shell or hit-targets, translated to **`dispatch(action)`** on the session.

### 5.3 Dealing with “animation time”

Two acceptable patterns (pick one per product):

1. **Snapshot-only:** Engine applies deal instantly; Pixi interpolates from previous snapshot to new snapshot (harder but decoupled).
2. **Event queue:** Engine appends immutable “card dealt to slot X” events; Pixi drains the queue for tweens, then discards when complete. Engine still owns card identity and shoe order.

In both cases, **the shoe and outcomes** are decided **only** in the orchestrator/rules path—not in the renderer.

---

## 6. Command flow (shell / canvas → engine)

```
User tap / click
  → Shell or (optional) Pixi hit-test → semantic command: e.g. HIT, STAND, PLACE_BET
  → Session.dispatch(command)
  → Session updates + shoe + balance
  → Subscribers receive new snapshot (and optional animation hints)
  → Pixi tweens; shadcn updates chrome
```

---

## 7. Proposed folder structure (Astro + PixiJS + shadcn)

```text
/
├── docs/
│   ├── PRD.md                 # Product requirements only
│   └── ARCHITECTURE.md        # This document
├── public/                    # Static assets (favicons, optional CDN fallbacks)
├── src/
│   ├── pages/                 # Astro routes (thin: compose layout + islands)
│   ├── layouts/               # Astro layouts (shell chrome wrappers)
│   ├── styles/                # Global CSS, Tailwind entry
│   │
│   ├── game/                  # ⚠️ No Astro / React / Pixi imports
│   │   ├── domain/            # Card, Hand, Money, seat index types
│   │   ├── rules/             # Pure: scoring, dealer policy, settlement + RuleSet types
│   │   ├── rng/               # RandomSource, shuffle, shoe, provider interfaces
│   │   ├── operator/        # OperatorConfig, defaults, validation (future)
│   │   ├── state/             # Phases, snapshots, seat/player/dealer view types
│   │   ├── engine/            # Session / reducer: dispatch, transitions, invariants
│   │   └── index.ts           # Barrel for app imports (optional)
│   │
│   ├── render/
│   │   └── pixi/              # Application, stages, sprites, assets, tweens
│   │       ├── app/           # Pixi bootstrap, resize, devicePixelRatio
│   │       ├── table/         # Felt, dealer layout, seat layout, focus
│   │       ├── cards/         # Card sprites, textures, deal animations
│   │       ├── chips/         # Chip sprites, stacks, bet placement motion
│   │       └── fx/            # Particles / glow (restrained)
│   │
│   ├── components/
│   │   ├── ui/                # shadcn-generated primitives (button, dialog, sheet, …)
│   │   ├── shell/             # Header, balance, menus (compose shadcn)
│   │   └── game/              # React islands: control bar, debug HUD, bridge to engine
│   │
│   ├── lib/                   # Shared non-game helpers (cn(), formatters) — keep thin
│   └── hooks/                 # Optional: useGameSession, useTableSize (no rules here)
│
├── astro.config.mjs
├── tsconfig.json
├── package.json
└── components.json            # shadcn config
```

### 7.1 Conventions

- **`src/game/*`:** TypeScript only; unit-testable; importable from Node or Vitest without a browser.
- **`src/render/pixi/*`:** may import from `src/game` (types + session), never the reverse.
- **`src/components/ui/*`:** shadcn ownership; do not embed blackjack rules.
- **Pages** assemble: `Layout` + `Shell` + one **Pixi island** (or client-only component) + **control island**.

---

## 8. Alignment checklist (for code reviews)

- [ ] No blackjack rule constants or `if (total > 21)` in `render/pixi` except for **pure display** (e.g. duplicate label), and even then prefer reading **engine-provided** totals.
- [ ] Shoe draws occur in **one module** (`engine` + `rng`).
- [ ] Settlement results come from **rules** + **orchestrator**, not from Pixi collision code.
- [ ] New operator toggles touch **`operator` + `rules` + `engine`**, not shader code.

---

*End of architecture specification.*
