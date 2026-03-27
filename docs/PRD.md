# Product Requirements Document (PRD)  
## Multi-Hand Blackjack — Spiffing Studios (Operator-Ready)

**Document purpose:** Single source for *what* we build and *why*. Implementation boundaries and folder layout live in [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Product summary

A premium, **mobile-first** **5-hand blackjack** game built by a studio for **operator integration**. The game should feel **polished, trustworthy, and visually rich**, while remaining **clear and easy to play** on small screens.

---

## Target users

**Primary**

- Online **casino players on mobile**

**Secondary**

- **Desktop** casino players
- **Operators** licensing the game

---

## Core experience

The player can play **up to five blackjack hands in one round** against a **single dealer hand**. The game emphasizes **clarity**, **speed**, **smooth animations**, and a **premium casino feel**.

---

## Core rules

- Standard blackjack card values
- **Ace = 1 or 11** (best hand ≤ 21)
- **Dealer stands on soft 17** (config-driven for future H17/S17)
- **Blackjack pays 3:2** (config-driven for future payout variants)
- **Hit and stand** in V1
- **No** split, insurance, or surrender in V1
- **Each hand resolves independently** against the **one** dealer hand

**Round structure (product-level):** Dealer acts **after** all player seats that need action are complete; settlement is **per seat**.

---

## UX goals

- Make **5-hand gameplay understandable instantly**
- Make the **active hand obvious**
- Keep controls **large and simple** on mobile
- Make **dealing and settlement satisfying**
- **Reduce clutter**

---

## Mobile-first layout goals

- **Dealer hand at top**
- **Five player hands** arranged clearly
- **Active hand highlighted**
- **Action controls** fixed and easy to tap
- **Bet controls** simple and readable

---

## Desktop goals

- Maintain the **same core hierarchy**
- Use **wider spacing** and a **stronger table presentation**
- **Avoid stretched mobile UI** (no sole “giant phone column” treatment)

---

## Visual principles

- **Premium felt** table
- **Clean** card spacing
- **Tasteful** glows and feedback
- **Restrained but satisfying** win effects
- **Smooth** card dealing animations
- **Polished** transitions between hands and states

---

## MVP scope

- **Betting**
- **Deal**
- **Hit / stand**
- **Dealer play**
- **Settlement**
- **5-hand layout**
- **State machine**
- **Local RNG/shuffle abstraction** (swappable later)
- **Operator config structure** (limits, rules flags, branding hooks, copy)

---

## Non-goals (V1)

- Side bets
- Split
- Insurance
- Surrender
- Backend **wallet** integration
- **Certified** RNG
- **Multiplayer**

---

## Technical architecture

| Area | Choice |
|------|--------|
| App shell | **Astro** |
| Shell & non-canvas UI | **shadcn/ui** (menus, modals, settings, help, loading, operator panels) |
| Game rendering | **PixiJS** (table, cards, chips, motion, effects) |
| Game logic | **Pure TypeScript** (no rules inside Pixi) |
| Randomness | **Isolated RNG/shuffle provider** (local V1; interfaces for certified/server later) |
| Rules & limits | **Config-driven** (`RuleSet`, table limits, operator config) |

**Boundary:** Engine state drives rendering; Pixi does not own outcomes or shoe logic. See [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Future extensibility

- Split
- Double
- Insurance
- Side bets
- Theming
- Operator branding (deeper white-label)
- **Server-authoritative** game logic
- **Certified RNG** provider

---

## Player-visible round flow (reference)

1. **Betting** — Wagers on 1–5 seats within min/max and balance  
2. **Initial deal** — Dealer up + hole; two cards per active seat  
3. **Player turns** — Seats **1 → 5**; only current seat accepts Hit/Stand  
4. **Dealer turn** — Hole revealed; dealer draws per rules  
5. **Settlement** — Each active seat resolved independently  
6. **Round end** — Summary; return to betting; shoe reshuffle when configured  

---

## Problem framing (why this product)

Multi-hand blackjack often fails on **clarity** and **maintainability**. This title targets **instant comprehension** on mobile and a codebase operators can **configure** without rewriting the table or core logic.

---

## Representative user stories

- As a player, I complete a round on a small phone without confusion about **which hand is active** or **play order**.
- As a player, I see **each hand’s outcome** clearly against the **same** dealer.
- As a player, I use **shell** UI (rules, help, settings) that does not depend on the canvas.
- As an operator, I rely on **config** for limits and rule toggles (as exposed) without forking draw logic.

---

## Risks and assumptions

- **Assumption:** V1 can be client-authoritative for demo/integration; some operators will later require **server-authoritative** play.
- **Risk:** Heavy effects hurt low-end devices—keep motion **budgeted** and degradable.

---

## Open questions

- Peek / insurance behavior when insurance ships
- Jurisdiction-specific shortcuts (e.g. dealer draw when all seats are naturals)
- Operator **copy** and **RTP** display requirements

---

## Related document

- **[`docs/ARCHITECTURE.md`](ARCHITECTURE.md)** — Rules engine vs orchestrator vs Pixi contract, five-hand state machine detail, proposed repo layout.
