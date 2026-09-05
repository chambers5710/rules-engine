# Rules Engine

Pokémon TCG rules as a small instruction set over an immutable-style game snapshot.

## Core idea

| Layer | Speaks | Job |
|---|---|---|
| **Action** | `Action.PlayActive`, … | What the player means to do |
| **Op** | `Op.MoveZoneToSlot`, … | Atomic board change |
| **compute** | `AvailableAction[]` | Legal choices from pure `GameState` |
| **machine** | phase + action → state | When things run; phase transitions |
| **interpret** | `Expr` + bindings | Execute ops; write bindings |
| **ops** | copy → mutate → return | Never write the snapshot you were given |
| **survey** | scope + filter → cards / number | Read-only board calculator |

`Action` is the game-level vocabulary. `Op` moves the data. Compute offers actions; the client picks one; the machine runs its `expr` through interpret.

## Extracted rule values

Any quantity a rule reads — prizes on KO, prize count, opening-hand size, and the like — lives as a named value, not a literal at the call site.

Card text and other temporary modifiers will later rewrite those values **before** the rule body runs (a “take 2 prizes” attack, a “draw 8” setup, etc.). The rule always consumes the current value. Defaults stay in one place (`PRIZES_ON_KO = 1`); extra-prize / extra-draw effects are modifiers on that value, not a second code path.

## Board model

- **Zones** — ordered piles: deck, hand, discard, prize
- **Slots** — Active / Bench seats: evolution stack, energy, tools, damage, status
- **Card instances** — physical copies in `cardRegistry`; zones/slots hold instance ids

## Bindings

Names are the API between dispatcher and expr.

- **Seeded** — set before interpret (`$self_slot`, `$defending` for attacks)
- **Written** — primitives with `bind` store results (`$damage`, `$coin`); later steps only read

`attack` computes through a damage pipeline and binds a number. `apply_damage` only mutates counters (poison, etc. skip the pipeline).

## Survey

Read-only. Compute and card text ask the same questions; neither walks piles by hand.

- **From** — a `ZoneRef` or `SlotRef` (hand, prize, Active energy, …)
- **Filter** — data (`energy`, `energy_type`, `basic_pokemon`) so a later `count` op can reuse the spec
- **Reduce** — card list, count, or sum of `energyValue` (Double Colorless is 2)

`canPayEnergyCost` spends typed units first; leftovers pay Colorless. “Water Energy attached” is a type filter, not the same as paying a Water cost. Rainbow / any-type Energy is a later modifier on what a card provides.

Expr riders (“+$10 per extra Energy, max +30”) call the calculator, then do arithmetic — not a special case in the damage pipeline.

## Effects

Card text is a pure `Expr`, keyed by **printed card id** (`sourceId`, never instance id) then name. Same lookup for attacks, abilities, and anything else a card can do to the board.

Compute fetches the expr onto the action (cost stays on the card; it is not inside the expr). Interpret runs it. Missing names are `[]`.

Attack is the last thing on a turn: run the effect, then Checkup.

## Loop

```
initialize → opening hands + mulligans (Init)
while not Ended:
  actions = compute(gamestate)
  action  = await client choice   // or null for auto phases
  gamestate = machine(gamestate, action)
```

## Status today

- Init: shuffle, draw 7, mulligan until Basic Pokémon (Energy’s `"Basic"` subtype does not count)
- `PlayActive` / `PlayBench` / `Ready` → both ready → 6 prizes, shuffle, `Turn`, first-player draw
- Confuse Ray: `attack` → `apply_damage` → `flip_coin` → `if` → `apply_status`
- Ops copy-then-mutate; interpret returns honest new snapshots

## Roadmap

- Turn: attach energy, evolve, retreat, attack, end turn
- Checkup: status, KO, prizes, promote
- `Select` — mid-expr pause for a target (shared choice protocol with compute)
- Survey — more scopes (in-play seats, both players); `count` primitive that binds a number
- Filters — more predicates on the same survey spec (HP remaining, name, …)
- Stronger `If` predicates over state; slot-level ops (retreat / clear seat)
- History log for replay

## Tests

```bash
npx tsx ./tests/confuse-ray.ts        # scripted attack
npx tsx ./tests/init-play-active.ts   # full decks via localhost:8787; Active/Bench/Ready → Turn
```
