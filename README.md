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

- **Player** — `1 | 2`
- **Slot** — the Pokémon **data** at a seat (evolution, energy, tools, damage, status, modifiers). Never an address.
- **SlotId** — the **address** of a seat. Always includes `player`. Active or `bench[n]`.
- **Pile** — where card copies live: a zone (`ZoneRef`) or an attachment on a seat (`SlotRef` = `SlotId` + `attachment`)
- **Card instance** — physical copy in `cardRegistry`; piles hold instance ids
- **Effects** — keyed by printed `sourceId`, never instance id

## Nouns — do not fork

This is the blocker. The engine works; the **map** does not. One seat has been `Slot`, `SlotId`, `InPlaySlot`, `SlotRef`, `SlotTarget`, `From`, `dest`, `ref`, `to`, `from` depending on the file. That will not scale. Rewrite fundamentals until each thing has **one type** and **one field name**. Do not add a helper that translates aliases.

### Frozen types

| Noun | Type | Meaning |
|---|---|---|
| Player | `1 \| 2` | Who |
| Slot | `Slot` | Value at a seat. `getSlot(state, id)` |
| SlotId | `{ player, slot: "active" } \| { player, slot: "bench", index }` | Address of a seat. **Always has player.** |
| Pile | `ZoneRef \| SlotRef` | Address of cards. Zone, or seat + `evolution` / `energy` / `tools` |
| ZoneDest | `ZoneRef` + `position` | Write-only: where a card lands in a zone |
| Card | `CardInstanceId` | One copy |
| Bind | `$name` | Delayed value on the interpret context. **Not** a seat type. |
| Action | `Action` + `AvailableAction` | What the player chose |
| Expr | `Op[]` | Card text |

`Slot` vs `SlotId` vs `Pile` is the only split that is real: **value / seat address / card address**. Same idea as file contents / path / path+filename.

### Delete

| Kill | Why |
|---|---|
| `InPlaySlot` | `SlotId` with the player omitted. `pokemonInPlay` returns `SlotId[]`. |
| `asSlotId` | Glue for the omission. |
| `SlotTarget` | A seat **or** a bind, promoted to a board type. DSL fields may be `SlotId \| BindingName`. That union stays in **expr rows only**. |
| `From` | Re-wraps `ZoneRef` / `SlotId` / bind / “in play” as a fourth language. |
| `SurveyFrom` | It **is** `Pile`. Survey takes `Pile`. |
| `to` / `dest` / `ref` / `from` as names for a seat | One field: `slot`. |

`sameSlot` stays: `SlotId` is an object, so equality is a function, not a type.

### Field names (role, not synonym)

Stop using `from` for three jobs. The field is the role:

| Place | Seat / pile field |
|---|---|
| `AvailableAction` (attach, evolve, ability, choose, promote) | `slot: SlotId` |
| Move ops | `source` + dest (`SlotRef` or `ZoneDest`) |
| `Op.Attack` | `attacker` + `defender` (`SlotId \| BindingName`) |
| `Op.ApplyDamage` / status / modifier | `slot` |
| `Op.Count` | `pile: Pile`, or `slot` + `attachment` that **is** a `SlotRef` after resolve |
| `Op.Select` | split on `pick` — see below |
| Seed / bindings | `$self_slot` and `$defending` are **SlotId values**, not types |

### Select is not a `From`

`pick` already says what the menu is. The source type follows `pick`. Do not union them.

```
Select  pick "slots"    among  self | opponent     →  menu of SlotId
Select  pick "cards"    pile   Pile | bind         →  menu of card ids
Select  pick "attacks"  slot   SlotId | bind       →  menu of attack names
```

`kind: "in_play"` was “list that player’s seats.” That is `pick: "slots"` + `among`. Not a pile, not a `SlotId`.

`who: self | opponent` is card text (relative to the acting player). **Pause resolves it** to player `1 | 2` on the frame. Compute never sees `self`. Compute never sees `$binds`. The frame holds a concrete `among: 1 | 2`, `pile: Pile`, or `slot: SlotId`.

`ActionFrame` is a union on `pick`, same as Select. Copying DSL `From` onto the frame is how the aliases leaked into compute.

### Bindings stay in interpret

Card text may write `$self_slot`. That is syntax for a bind.

1. Compute seeds `SlotId` values into `action.seed`.
2. Interpret (or pause) **resolves** `$name` → `SlotId` / number / card **once**.
3. Ops, survey, and compute menus only see resolved `SlotId` and `Pile`.

Do not invent a new type every time a field might still be a string.

### Rewrite order

Do not pile a fifth alias. Each step must delete more types than it adds. Engine behavior stays; names collapse.

1. **Kill `InPlaySlot`.** `pokemonInPlay` → `SlotId[]`. Attach / evolve / ability / choose use `slot: SlotId`. Delete `asSlotId`. Mechanical. Proves the rule: a seat always has a player.
2. **Rename fields.** Ability `from` → `slot`. Attack op `from`/`to` → `attacker`/`defender`. Move op `from` → `source`. Grep must go to zero for seat-`from`.
3. **Select by `pick`.** Replace `From` with `among` | `pile` | `slot`. Resolve `self`/`opponent` and binds at pause. Compute `switch (frame.pick)` only. Damage Swap is `pick: "slots", among: "self"`.
4. **`Pile` is survey.** `SurveyFrom` → `Pile`. Count takes a `Pile` (Hydro Pump: `$self_slot` + `attachment: "energy"` → `SlotRef` after resolve). No `From` on Count.
5. **Freeze the table.** A new helper that converts `SlotId` → some other seat type is a bug. A new `*Ref` / `*Target` / `*From` for the same entity is a bug.

When this is done, wrapping your head around the engine is six nouns, not a per-function dialect.

## Bindings

Names on the interpret context. Every real attack uses them, not just tests.

- **Seeded** — compute puts `$self_slot` and `$defending` on the action before the client picks it. `runAction` copies `action.seed` into `ctx.bindings`. Interpret only reads those names.
- **Written** — primitives with `bind` store results (`$damage`, `$coin`); later steps only read
- **Chosen** — (planned) `Select` pauses; the player’s pick writes the bind

`attack` runs the damage pipeline and binds a number. `apply_damage` only mutates counters.

## Survey

Read-only. Compute and card text ask the same questions.

- **Pile** — `ZoneRef` or `SlotRef` (see Nouns)
- **Filter** — `energy`, `energy_type`, `basic_pokemon`
- **Reduce** — list, count, or sum of `energyValue`

`canPayEnergyCost` spends typed units first; leftovers pay Colorless. Paying a Water cost is not the same query as “Water Energy attached.”

## Effects

Pure `Expr`, keyed by printed card id then name (`attacks` / `abilities`). Compute attaches the expr; cost stays on the card. Missing names are `[]`.

Attack is the last thing on a turn: run the effect, then Checkup. Passing without attacking is `EndTurn`.

Today: Alakazam Confuse Ray, Chansey Scrunch / Double-edge, Clefairy Sing. Plain numeric damage (`"30"`) gets a default `attack` → `apply_damage` with no effects row. `"40+"` does not. Metronome waits on Select. Hydro Pump waits on count + math.

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
- Live board: `gamestate.md`. HTTP: `pnpm serve` (`index.ts`). Fixture: `pnpm serve:alakazam`

## Select → bind → run

Do **not** fan Metronome out in compute. It is one attack whose first step is a choice.

```
select  from $defending  pick attacks  bind $copy
run_effect  $copy
```

`$self_slot` / `$defending` stay the Metronome seats. The player already paid Metronome’s cost.

1. **Widen Select** — `pick` says what the menu is; the source type follows `pick` (`among` / `pile` / `slot`). See Nouns. Do not add a `From` union. The answer binds a name, same style as `$coin`.
2. **`actionStack` is the paused expr** — `runAction` hits Select, stop, push a frame. Machine does not Checkup until the stack is empty. The Attack action is gone; the **frame owns** `remaining` (unread tail) and `bindings`. Select last → `remaining` is `[]`.
3. **Compute has two modes** — stack empty: today’s Turn menu. Frame on top: only that Select’s answers. Choosing one is not a new Attack; it writes the bind and pops.
4. **Resume** — write the bind, interpret the rest of the frame. Nested Selects push again. `run_effect` fetches `cardEffect` for the bound name and runs it in the same bindings.
5. **Metronome** — Select defending attacks, bind, run. No special case in `attacksFromActive`.
6. **Later** — strip “requirements to use” on the copy (discard Energy, etc.). Weakness uses Clefairy because `$self_slot` is still Clefairy.

**Done:** (1) and (2). **Not done:** (3)–(6).

`actionStack` is in-flight only. Lasting shields stay on `slot.modifiers`. Phase beats (poison, “at end of turn”) are a later queue — not this stack.

## Math (tentative)

Hydro Pump is 40 + 10 per Water on `$self_slot` not spent on the WWW cost, extra after the 2nd ignored (cap +20). Survey can already produce that count. The expr cannot read it or do `min` / `+`. Do not precompute 40/50/60 in compute.

1. **`count`** — `from` (slot/pile, may be a binding) + survey filter, `bind` a number (`surveyEnergyValue` for Energy).
2. **`calc`** — one step: `add` | `sub` | `mul` | `min` | `max`. Inputs are numbers or `$names`. `bind` the result. No nested expressions; chain primitives.
3. **`attack.base`** — allow a binding (same as `apply_damage` already does).

Hydro Pump:

```
count  from $self_slot energy  filter Water  bind $water
calc   sub  $water  3  bind $extra
calc   min  $extra  2  bind $extra
calc   mul  $extra  10 bind $bonus
calc   add  40  $bonus bind $base
attack base $base  …  bind $damage
apply_damage $damage  $defending
```

The 3 and the cap 2 are authored in the effect (printed cost / printed cap), not inferred.

## Roadmap

- Noun freeze (README: kill `InPlaySlot` → rename fields → Select by `pick` → `Pile` is survey)
- Select → bind → run (finish 3–5)
- Math (`count` + `calc` + bound `attack.base`)
- Retreat
- Checkup statuses (confused actually matters)
- History log for replay

## Tests

```bash
pnpm serve                 # HTTP session, default decks
pnpm serve:alakazam        # Alakazam vs Blastoise fixture
npx tsx ./tests/scrunch.ts
npx tsx ./tests/confuse-ray.ts
```
