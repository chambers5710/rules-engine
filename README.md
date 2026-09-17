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

Specs: `status.md` (special conditions), `coverage.md` (Base Set authored vs blocked).

## Extracted rule values

Any quantity a rule reads — prizes on KO, prize count, opening-hand size — is a named value, not a literal at the call site. Card text later rewrites those values **before** the rule body runs. Defaults stay in one place (`PRIZES_ON_KO = 1`).

## Board model

- **Player** — `1 | 2`
- **Slot** — the Pokémon **data** at a seat (evolution, energy, tools, damage, status, modifiers). Never an address.
- **SlotId** — the **address** of a seat. Always includes `player`. Active or `bench[n]`.
- **Zone** — a player's deck, hand, discard, or prize (`ZoneRef`). Holds instance ids.
- **Stadium** — shared in-play Trainer on GameState (`stadium`), not a player zone
- **Slot attachment** — `evolution` / `energy` / `tools` on a seat (`SlotRef` = `SlotId` + `attachment`). Holds instance ids.
- **Card instance** — physical copy in `cardRegistry`
- **Effects** — keyed by printed `sourceId`, never instance id

## Nouns — do not fork

This is the blocker. The engine works; the **map** does not. One seat has been `Slot`, `SlotId`, `InPlaySlot`, `SlotRef`, `SlotTarget`, `From`, `dest`, `ref`, `to`, `from` depending on the file. That will not scale. Rewrite fundamentals until each thing has **one type** and **one field name**. Do not add a helper that translates aliases.

### Frozen types

| Noun | Type | Meaning |
|---|---|---|
| Player | `1 \| 2` | Who |
| Slot | `Slot` | Value at a seat. `getSlot(state, id)` |
| SlotId | `{ player, slot: "active" } \| { player, slot: "bench", index }` | Address of a seat. **Always has player.** |
| Zone | `ZoneRef` | Address of a zone (`deck` / `hand` / `discard` / `prize`) |
| Stadium | `InPlayStadium` | Shared in-play Trainer (`GameState.stadium`); not a zone |
| Slot attachment | `SlotRef` | Seat + `evolution` / `energy` / `tools` |
| ZoneDest | `ZoneRef` + `position` | Write-only: where a card lands in a zone |
| Card | `CardInstanceId` | One copy |
| Bind | `$name` | Delayed value on the interpret context. **Not** a seat type. |
| Action | `Action` + `AvailableAction` | What the player chose |
| Expr | `Op[]` | Card text |

`Slot` vs `SlotId` is value vs seat address. Cards live on a **zone** or a **slot attachment**. Same idea as file contents / path / path+filename.

### Delete

| Kill | Why |
|---|---|
| `InPlaySlot` | `SlotId` with the player omitted. `pokemonInPlay` returns `SlotId[]`. |
| `asSlotId` | Glue for the omission. |
| `SlotTarget` | A seat **or** a bind, promoted to a board type. DSL fields may be `SlotId \| BindingName`. That union stays in **expr rows only**. |
| `From` | Re-wraps `ZoneRef` / `SlotId` / bind / “in play” as a fourth language. |
| `SurveyFrom` | Survey takes `ZoneRef` or `SlotRef`. |
| `to` / `dest` / `ref` / `from` as names for a seat | One field: `slot`. |

`sameSlot` stays: `SlotId` is an object, so equality is a function, not a type.

### Field names (role, not synonym)

Stop using `from` for three jobs. The field is the role:

| Place | Seat / zone / attachment field |
|---|---|
| `AvailableAction` (attach, evolve, ability, choose, promote) | `slot: SlotId` |
| Move ops | `source` + dest (`SlotRef` or `ZoneDest`) |
| `Op.Attack` | `attacker` + `defender` (`SlotId \| BindingName`); optional `matchup: false` skips W/R |
| `Op.ApplyDamage` / status / modifier | `slot` |
| `Op.Count` | `zone`, or `slot` + `attachment` (a `SlotRef` after resolve) |
| `Op.Select` | split on `pick` — see below |
| Seed / bindings | `$self_slot` and `$defending` are **SlotId values**, not types |

### Select is not a `From`

`pick` already says what the menu is. The source type follows `pick`. Do not union them.

```
Select  pick "slots"    among  self | opponent     →  menu of SlotId
Select  pick "cards"    source ZoneRef | SlotRef | bind  →  menu of card ids
Select  pick "attacks"  slot   SlotId | bind       →  menu of attack names
```

`kind: "in_play"` was “list that player’s seats.” That is `pick: "slots"` + `among`. Not a zone, not a `SlotId`.

`who: self | opponent` is card text (relative to the acting player). **Pause resolves it** to player `1 | 2` on the frame. Compute never sees `self`. Compute never sees `$binds`. The frame holds a concrete `among: 1 | 2`, `source: ZoneRef | SlotRef`, or `slot: SlotId`.

`ActionFrame` is a union on `pick`, same as Select. Copying DSL `From` onto the frame is how the aliases leaked into compute.

### Bindings stay in interpret

Card text may write `$self_slot`. That is syntax for a bind.

1. Compute seeds `SlotId` values into `action.seed`.
2. Interpret (or pause) **resolves** `$name` → `SlotId` / number / card **once**.
3. Ops, survey, and compute menus only see resolved `SlotId`, `ZoneRef`, and `SlotRef`.

Do not invent a new type every time a field might still be a string.

### Rewrite order

Do not add a fifth alias. Each step must delete more types than it adds. Engine behavior stays; names collapse.

1. **Kill `InPlaySlot`.** `pokemonInPlay` → `SlotId[]`. Attach / evolve / ability / choose use `slot: SlotId`. Delete `asSlotId`. Mechanical. Proves the rule: a seat always has a player.
2. **Rename fields.** Ability `from` → `slot`. Attack op `from`/`to` → `attacker`/`defender`. Move op `from` → `source`. Grep must go to zero for seat-`from`.
3. **Select by `pick`.** Replace `From` with `among` | `source` | `slot`. Resolve `self`/`opponent` and binds at pause. Compute `switch (frame.pick)` only. Damage Swap is `pick: "slots", among: "self"`.
4. **Survey takes a zone or a slot attachment.** `SurveyFrom` is gone. Count takes `zone` or `slot` + `attachment` (Hydro Pump: `$self_slot` + `attachment: "energy"` → `SlotRef` after resolve). No `From` on Count.
5. **Freeze the table.** A new helper that converts `SlotId` → some other seat type is a bug. A new `*Ref` / `*Target` / `*From` for the same entity is a bug.

When this is done, wrapping your head around the engine is six nouns, not a per-function dialect.

## Bindings

Names on the interpret context. Every real attack uses them, not just tests.

- **Seeded** — compute puts `$self_slot` and `$defending` on attacks (also `$energy` / `$discard`). Trainers get `$self_slot`, `$defending`, `$hand`, `$discard`, `$played`. Powers get `$self_slot` and `$hand`. `runAction` copies `action.seed` into `ctx.bindings`.
- **Written** — primitives with `bind` store results (`$damage`, `$coin`); later steps only read
- **Chosen** — `Select` pauses; `Choose` writes the bind and resume runs `remaining`

`attack` runs the damage pipeline and binds a number. `apply_damage` only mutates counters.

## Survey

Read-only. Compute and card text ask the same questions.

- **Where** — `ZoneRef` or `SlotRef` (zone vs slot attachment)
- **Filter** — `energy` (optional `type`), `basic_energy` (optional `type`; subtype Basic only), `basic_pokemon`, `evolves_from`, `name`, `has_type`, `trainer`, `pokemon`, `stage_2`
- **Reduce** — list, count, or sum of `energyValue`

`Count` `kind: "cards"` / `"energy_value"` is one slot’s attachment (Hydro Pump: Water on `$self_slot`). `kind: "damage"` reads `slot.damage`. `kind: "hp"` is printed HP. `kind: "knocked_out"` is `isKnockedOut` as 1/0 (Hurricane). Zone `kind: "random"` binds one id without shuffling (Peek). `kind: "attack_damage"` is printed damage of a named attack on that seat (Metronome). On a zone or slot attachment: `kind: "first"` (first id; Scoop Up Basic) or `"last"` (current form; Buzzap). Zone `kind: "prefix"` binds the top `n` ids. `kind: "slots"` counts occupied seats. `Each` maps those seats. Slot filters (`name`, `has_type`, `has_counters`, …) live in `slotMatches` (interpret), shared with Select. See `coverage.md`.

`canPayEnergyCost` spends typed units first; leftovers pay Colorless. Paying a Water cost is not the same query as “Water Energy attached.”

## Effects

Pure `Expr` on `GameState.effectRegistry`, keyed by printed card id. Pokémon: `attacks` / `abilities` by **name**. Trainers: `trainer` is a name→expr map (`trainerEffect(registry, id)` uses the first value). Compute attaches the expr; Energy cost stays on the card. Missing names are `[]`. Unauthored trainers do not list. A trainer whose expr moves `$played` onto `tools` skips the discard. `effects.ts` is lookup only. Hand-authored rows live in `effect-author/effects/effects.json`.

Attack is the last thing on a turn: run the effect, then Checkup. Passing without attacking is `EndTurn`. `PlayTrainer` is during the turn (discard first, then expr — unless the expr `MoveZoneToSlot`s the card).

Plain numeric damage (`"30"`) gets a default `attack` → `apply_damage` with no effects row. `"40+"` does not.

What is authored vs what Base Set text cannot say yet: `coverage.md`. Status: `status.md`.

## Modifiers

A sticky rewrite of a **field** on an event or card — same idea as extracted rule values. Not a delayed expr. Not `actionStack`.

There is one `Modifier`, on the slot. Card text cannot say “player 2”; the op uses `who: owner | opponent`. Interpret turns that into `until.player` and calls `applyModifier`. Tick only compares `activePlayer`.

```
{ field: "attack_damage" | "attack_use" | "energy_type", …, until: { beat: "end_of_turn", player: 2 }, phase: "pending" | "active" }
```

- **applyModifier** — `pending`, or `active` if `until.player` is already active; `until.next` stays pending (Swords Dance)
- **foldAttackBase** — name-scoped `set` on the attacker before W/R
- **foldAdds / foldDamage** — after W/R in the attack pipeline; `apply_damage` does not fold. `from` only folds when that instance is the attacker (Snivel). Name-scoped mods are not folded here
- **attackBanned / abilityBanned / attackFlipGated** — `attack_use` (`ban` hides the name — Amnesia is end of turn, Leek Slap is `leave_play`; `flip` is a machine coin after Confused). `ability_use` `ban` hides that Power (Curse / Step In until owner’s turn ends)
- **foldedEnergyType** — `energy_type` `set` for payment and energy filters on that seat
- **foldedCard** / **applyFieldOverrides** / **clearFieldOverrides** (`card.ts`) — printed `CardInstance` plus `fieldOverrides`. `physicalForm` is that fold; `currentForm` then overlays Transform `copy_defending`. Survey / lineage read `foldedCard`; combat / KO / retreat read `currentForm`. `apply_field_overrides` writes the map (`types: "$t"` wraps as `[type]`); zone moves clear it. Seat `energy_type` still folds on top.
- **canAttack / canRetreat / retreatCost / mayUsePokemonPower / powersSuppressed / mayEvolve / mayPlayTrainer / acceptsStatus / takesPrizeOnKo / preventsAttackDamage / halveAttackDamage / handIsPublic / energyPaysAny / coinPreventsAttack** (`reads.ts`) — Asleep / Paralyzed; `canAttack` also timed `can_attack` vs a defending instance (Tail Wag); retreat also folded `cannotRetreat` and timed `cannot_retreat` (Acid); `retreatCost` drops Colorless for benched `reduce_retreat`; Power also Confused and `ignore_powers` (Toxic Gas keeps itself); Headache `trainer_use` on that player’s seats; Doll or standing `blocks_status` (Burn still lands); Invisible Wall `prevent_damage` after W/R / splash; Kabuto Armor `halve_damage` after W/R add/sub; evolve is first-turn + `evolvedThisTurn` + `block_evolve` + Transform; Clairvoyance `reveal_hand` for fog; Transform energy is wild for costs; Transparency `coin_prevent_attack` (coin in interpret); `prizesOnKo`. Compute lists; machine fail-closes. Standing triggers with `blockedByStatus` use `mayUsePokemonPower` and `powersSuppressed`. Ops `applyStatus` uses `acceptsStatus`. Checkup prize uses `takesPrizeOnKo`.
- **tickModifiersEnter / tickModifiersEnd** — `pending → active` when `until.player` becomes active; drop `active` when that player’s turn ends

`attack_effects` `prevent: "all"` (Barrier / Agility). `attack_damage` `prevent: 30` (Harden). `set: 0` is still Scrunch. `Op.Attack` writes the hit.

## Loop

```
initialize → opening hands + mulligans (Init)
while not Ended:
  actions = compute(gamestate)
  action  = await client choice
  gamestate = machine(gamestate, action)
```

## Status today

- Init: shuffle, draw 7, mulligan until Basic Pokémon (Energy `"Basic"` does not count)
- Both Ready → 6 prizes from deck top (no shuffle after prizes) → Turn, first-player draw
- Turn: place Bench, attach Energy (once), play Trainers, attack, EndTurn
- Attack ends the turn; empty deck on draw ends the game
- Checkup: KO Active (discard seat, opponent takes `PRIZES_ON_KO`), then prizes / no Pokémon / next turn
- Empty Active + occupied Bench → Promote, then draw
- HTTP: `pnpm serve` (`index.ts`). Fixtures: `pnpm serve:alakazam`, `pnpm serve:scrunch`, `pnpm serve:chansey`, `pnpm serve:poison`, `pnpm serve:asleep`, `pnpm serve:paralyzed`, `pnpm serve:burn`, `pnpm serve:confuse-ray`, `pnpm serve:metronome`, `pnpm serve:count-damage`, `pnpm serve:trainers`, `pnpm serve:deck`, `pnpm serve:energy-pile`, `pnpm serve:tools`, `pnpm serve:leftover`, `pnpm serve:authored`, `pnpm serve:gate`, `pnpm serve:trans`, `pnpm serve:stretch`, `pnpm serve:energy-burn`, `pnpm serve:conversion`, `pnpm serve:leech`, `pnpm serve:init`

## Select → bind → run

Do **not** fan Metronome out in compute. It is one attack whose first step is a choice.

```
select  from $defending  pick attacks  bind $copy
run_effect  $copy
```

`$self_slot` / `$defending` stay the Metronome seats. The player already paid Metronome’s cost. Recoil (`ApplyDamage` a positive literal onto `$self_slot`) is stripped from the copy.

1. **Widen Select** — `pick` says what the menu is; the source type follows `pick` (`among` / `source` / `slot`). See Nouns. Do not add a `From` union. The answer binds a name, same style as `$coin`.
2. **`actionStack` is the paused expr** — `runAction` hits Select, stop, push a frame. Machine does not Checkup until the stack is empty. The Attack action is gone; the **frame owns** `remaining` (unread tail) and `ctx` (`InterpretCtx`). Select last → `remaining` is `[]`.
3. **Compute has two modes** — stack empty: today’s Turn menu. Frame on top: only that Select’s answers. Choosing one is not a new Attack; it writes the bind and pops.
4. **Resume** — write the bind, interpret the rest of the frame. Nested Selects push again. `run_effect` still fetches `cardEffect` for a bound name when a later full copy needs it.
5. **Metronome** — Select defending attacks, `run_effect`. Recoil on `$self_slot` and leading self-Energy pay are dropped. No special case in `attacksFromActive`.
6. **Later** — strip “requirements to use” on the copy (discard Energy, etc.). Weakness uses Clefairy because `$self_slot` is still Clefairy.

**Done:** (1)–(5). **Not done:** (6).

`actionStack` is in-flight only. Lasting shields stay on `slot.modifiers`. Phase beats (poison, “at end of turn”) are a later queue — not this stack.

## Math

Hydro Pump is authored: `count` Water on `$self_slot`, `calc` chain, bound `attack.base`. The 3 and the cap 2 live in the effect, not in compute.

`Count` `kind: "damage"` reads `slot.damage` (HP units). `kind: "hp"` is printed HP. `Calc` `half_up_10` is Super Fang. It does not count Pokémon in play. `Draw` exists (`who` + `count`). `Shuffle` shuffles one zone (`zone: ZoneRef`). `Reveal` writes history only (`cards` zone bind, list bind, or card binds, `to`: self / opponent / both) — no board write, no pause. `Reorder` puts a list of ids already in a zone on top. `If` is bind `equals` or `slot` + `status` (any special condition). Slot Select may set `chooser: "opponent"`.

## Roadmap

- Noun freeze (README: remaining aliases if any)
- Metronome (6): full copy minus use-costs (today: printed damage only)
- Survey seats + zone shuffle/search (`coverage.md`)
- History log for replay
- `evenIf` on Pokémon Powers

## Tests

```bash
pnpm serve                 # HTTP session, default decks
pnpm serve:init            # Init — Play Active
pnpm serve:alakazam        # Alakazam vs Blastoise (Damage Swap)
pnpm serve:scrunch         # Chansey vs Hitmonchan (Scrunch)
pnpm serve:chansey         # Chansey vs Clefairy (Double-edge)
pnpm serve:metronome       # Clefairy vs Magmar (Metronome)
pnpm serve:count-damage    # Flail / Meditate / Karate Chop (reset cycles)
pnpm serve:poison          # Ivysaur vs Chansey (Poisonpowder)
pnpm serve:asleep          # Haunter vs Chansey (Hypnosis / Dream Eater; Chansey starts Asleep)
pnpm serve:paralyzed       # Electabuzz vs Chansey (Thundershock)
pnpm serve:burn            # Rapidash vs Chansey (Super Singe)
pnpm serve:confuse-ray     # Alakazam vs Machop (Confuse Ray)
pnpm serve:trainers        # Both hands: Bill, Potion, Switch, Gust, Full Heal
pnpm serve:deck -- oak     # Deck trainers (search | maintenance | oak | impostor | lass | trader)
pnpm serve:energy-pile     # Poliwrath vs Magmar (Whirlpool, Super Potion, Energy Removal)
pnpm serve:tools           # Magmar vs Hitmonchan (Defender / PlusPower)
pnpm serve:leftover -- fang  # Super Fang / Toxic / Whirlwind (reset cycles)
pnpm serve:authored -- trainers  # Flute / Revive / Scoop / Spray / Breeder + Leek / Metronome / reprints (reset cycles)
pnpm serve:gate -- sand      # Sand-attack / Amnesia (reset cycles)
pnpm serve:trans             # Venusaur Energy Trans (Grass seat → any other of yours)
pnpm serve:stretch -- horn   # Horn / Doubleslap / Hyper Beam / Thunderbolt / Recover
pnpm serve:energy-burn       # Charizard 2 Fire + 2 Lightning; Burn then Fire Spin
pnpm serve:conversion        # Porygon vs Machop (Conversion 1 / 2)
pnpm serve:leech             # Bulbasaur Leech Seed (heal 10 if the 20 landed)
```
