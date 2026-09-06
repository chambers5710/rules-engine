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
| **effects** | printed card id → named `Expr` | Card text, not instance text |
| **modifiers** | field rewrite + beat clock | Lasting values; not a queued expr |

`Action` is the game-level vocabulary. `Op` moves the data. Compute offers actions; the client picks one; the machine runs its `expr` through interpret.

## Extracted rule values

Any quantity a rule reads — prizes on KO, prize count, opening-hand size — is a named value, not a literal at the call site. Card text later rewrites those values **before** the rule body runs. Defaults stay in one place (`PRIZES_ON_KO = 1`).

## Board model

- **Zones** — ordered piles: deck, hand, discard, prize
- **Slots** — Active / Bench: evolution, energy, tools, damage, status, modifiers
- **Card instances** — physical copies in `cardRegistry`; zones/slots hold instance ids
- **Effects** — keyed by printed `sourceId`, never instance id

## Bindings

- **Seeded** — set before interpret (`$self_slot`, `$defending`)
- **Written** — `bind` stores results (`$damage`, `$coin`); later steps only read
- **Chosen** — (planned) `Select` pauses and the player writes the bind

`attack` runs the damage pipeline and binds a number. `apply_damage` only mutates counters.

## Survey

Read-only. Compute and card text ask the same questions.

- **From** — `ZoneRef` or `SlotRef`
- **Filter** — `energy`, `energy_type`, `basic_pokemon`
- **Reduce** — list, count, or sum of `energyValue`

`canPayEnergyCost` spends typed units first; leftovers pay Colorless. Paying a Water cost is not the same query as “Water Energy attached.”

## Effects

Pure `Expr`, keyed by printed card id then name (`attacks` / `abilities`). Compute attaches the expr; cost stays on the card. Missing names are `[]`.

Attack is the last thing on a turn: run the effect, then Checkup. Passing without attacking is `EndTurn`.

Today: Chansey Scrunch / Double-edge, Clefairy Sing. Metronome waits on Select.

## Modifiers

A sticky rewrite of a **field** on an event or card — same idea as extracted rule values. Not a delayed expr. Not `actionStack`.

There is one `Modifier`, on the slot. Card text cannot say “player 2”; the op uses `who: owner | opponent`. Interpret turns that into `until.player` and calls `applyModifier`. Tick only compares `activePlayer`.

```
{ field: "attack_damage", set: 0, until: { beat: "end_of_turn", player: 2 }, phase: "pending" | "active" }
```

- **applyModifier** — write `pending` on the slot
- **readModifier** — one field through `active` modifiers. Attack pipeline calls this; `apply_damage` does not
- **tickModifiersEnter / tickModifiersEnd** — `walkSeats`; `pending → active` when `until.player` becomes active; drop `active` when that player’s turn ends

`pending` / `active` is the two-beat clock so “their next turn” does not die on your extra turn. Keep the field list tiny (`attack_damage` now; cost / type later). No selection module for duration.

## Loop

```
initialize → opening hands + mulligans (Init)
while not Ended:
  actions = compute(gamestate)
  action  = await client choice
  gamestate = machine(gamestate, action)
```

`gamestate.md` is rewritten at process start, after init, and after every action.

## Status today

- Init: shuffle, draw 7, mulligan until Basic Pokémon (Energy `"Basic"` does not count)
- Both Ready → 6 prizes from deck top (no shuffle after prizes) → Turn, first-player draw
- Turn: place Bench, attach Energy (once), attack, EndTurn
- Attack ends the turn; empty deck on draw ends the game
- Checkup: KO Active (discard seat, opponent takes `PRIZES_ON_KO`), then prizes / no Pokémon / next turn
- Empty Active + occupied Bench → Promote, then draw
- Live board: `gamestate.md`; Chansey script: `tests/chansey-report.txt`

## Select → bind → run

Do **not** fan Metronome out in compute. It is one attack whose first step is a choice.

```
select  from $defending  pick attacks  bind $copy
run_effect  $copy
```

`$self_slot` / `$defending` stay the Metronome seats. The player already paid Metronome’s cost.

1. **Widen Select** — `from` is a slot or pile (may be a binding). `pick` says what the menu is (`attacks` now; cards / seats later). The answer binds a name (printed id + attack name), same style as `$coin`.
2. **`actionStack` is the paused expr** — `runAction` hits Select, stop, push a frame. Machine does not Checkup until the stack is empty. The Attack action is gone; the **frame owns** `remaining` (unread tail) and `bindings`. Select last → `remaining` is `[]`.
3. **Compute has two modes** — stack empty: today’s Turn menu. Frame on top: only that Select’s answers. Choosing one is not a new Attack; it writes the bind and pops.
4. **Resume** — write the bind, interpret the rest of the frame. Nested Selects push again. `run_effect` fetches `cardEffect` for the bound name and runs it in the same bindings.
5. **Metronome** — Select defending attacks, bind, run. No special case in `attacksFromActive`.
6. **Later** — strip “requirements to use” on the copy (discard Energy, etc.). Weakness uses Clefairy because `$self_slot` is still Clefairy.

`actionStack` is in-flight only. Lasting shields stay on `slot.modifiers`. Phase beats (poison, “at end of turn”) are a later queue — not this stack.

## Roadmap

- Select → bind → run (above)
- Retreat, evolve
- Checkup statuses
- Survey: more scopes; `count` primitive
- History log for replay

## Tests

```bash
npx tsx ./tests/confuse-ray.ts        # scripted attack
npx tsx ./tests/init-play-active.ts   # full decks via localhost:8787
npx tsx ./tests/chansey.ts            # Chansey vs Clefairy; AUTO in the file
```
