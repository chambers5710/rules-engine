# Status (Special Conditions)

How Asleep, Confused, Paralyzed, Poisoned, and Burned work in this engine. Physical card turns / markers from the [TCGplayer recap](https://www.tcgplayer.com/content/article/Rule-Recap-Special-Conditions/7ad943f6-a14c-48ad-ba76-73baca6ed830/) and the official rulebook are display. We store flags on `Slot.status`.

## Rulebook

Every behavior in this file is tied to a **rulebook generation**. Name it here when the spec changes — do not leave it implicit. Special Conditions, Checkup order, and overlap rules drift across eras (Burn arrives later; Ability vs Pokémon Power; extra-turn Checkup skips).

**This engine targets:** Wizards of the Coast **Version 1** — the original Base Set era (`base1` and contemporaries).

| Source | URL |
|---|---|
| WOTC v1 rulebook | [judgeball.com — WOTC_v1.pdf](https://www.judgeball.com/files/archives/tcg-rulebooks/en/WOTC_v1.pdf) |
| Rulebook archive | [judgeball.com/archives/tcg-rulebooks](https://www.judgeball.com/archives/tcg-rulebooks/) |
| Rulings compendium | [compendium.pokegym.net](https://compendium.pokegym.net/) |
| Current tournament handbook (2026) | [play-pokemon-tcg-tournament-handbook-en.pdf](https://www.pokemon.com/static-assets/content-assets/cms2/pdf/play-pokemon/rules/play-pokemon-tcg-tournament-handbook-en.pdf) |

When implementing a card from another set, check whether its era matches this generation. If not, update the **Rulebook** line above and revise this doc before changing engine behavior.

`Status`: `asleep` | `confused` | `paralyzed` | `poison` | `burn`. More than one flag may be on, with the overlap rule below.

Amounts use `DAMAGE_COUNTER` (10). Poison = `slot.poisonCounters` (default 1; Toxic sets 2) × 10, Burn = 2, Confused fail = 3. Card text that changes poison amount writes `poisonCounters`, not a new condition.

## Where they sit

```
Turn (compute)
  Attack / Retreat / Pokémon Power listed or not
  Attack chosen while Confused → flip, then either run the attack expr or fail

Attack / EndTurn completes
  → enterCheckup
       tickModifiersEnd
       Pokémon Checkup (status), in this order:
         1. Poisoned
         2. Burned
         3. Asleep
         4. Paralyzed
       then KO / prizes / win-lose
       then Promote if an Active is empty
  → enterTurn (next player)
```

Checkup is `Phase.Checkup` between turns. Status work runs **in that phase, before** `resolveKnockouts`. Poison/Burn damage can KO. Confused does **not** run here.

An extra turn skips Checkup entirely. When extra turns exist, skip this block for that handoff.

Status damage is `ApplyDamage`, not `Attack`. No weakness / resistance.

Coins (Burn recover, Asleep wake, Confused attack) are `FlipCoin` and go on `history` like Scrunch. Those three write `check` on the history entry so the UI can label the overlay.

## Overlap

**Asleep, Confused, Paralyzed** — one at a time. Applying one clears the other two. Last write wins.

**Poisoned and Burned** — independent of each other and of the three above. A Pokémon can be Burned + Paralyzed + Poisoned.

`ApplyStatus` enforces the ACP replace.

Conditions only exist on the **Active**. Evolve or leave Active (retreat / swap / KO discard) → all five flags off on that Pokémon. `RemoveStatus` is card text that clears one named flag.

## During the turn (compute)

| | Attack | Retreat | Pokémon Power (Base) |
|---|---|---|---|
| Asleep | no | no | no |
| Paralyzed | no | no | no |
| Confused | yes, with flip | yes | no |
| Poisoned | yes | yes | yes |
| Burned | yes | yes | yes |

`mayUsePokemonPower` matches the Power column. Attack and Retreat use `canAttack` / `canRetreat` (`reads.ts`) for those columns (`canRetreat` also folds `cannotRetreat`).

Per-card `evenIf` overrides the Power column when card text says so (e.g. some later Abilities work while Asleep).

## Confused — attack time, not Checkup

Before the attack expr runs:

1. `FlipCoin`
2. Heads → run the attack as written
3. Tails → do not run the attack; `ApplyDamage` 3 × `DAMAGE_COUNTER` to `$self_slot`

The flip is the owner attacking with a Confused Active. It is not a menu. Tails still ends the turn (attack was chosen); Checkup still runs.

## Checkup — both Actives, this order

`activePlayer` here is the player whose turn just ended.

**1. Poisoned.** Each Active with `poison`: `ApplyDamage` 1 × `DAMAGE_COUNTER`. Flag stays.

**2. Burned.** Each Active with `burn`: `ApplyDamage` 2 × `DAMAGE_COUNTER`, then `FlipCoin`. Heads → `RemoveStatus` `burn`. Tails → stays.

**3. Asleep.** Each Active with `asleep`: `FlipCoin`. Heads → `RemoveStatus` `asleep`. Tails → stays.

**4. Paralyzed.** If the player who just went has `paralyzed` on their Active: `RemoveStatus` `paralyzed`. The opponent’s Paralyzed Active is left for the Checkup after *their* turn.

Then KO / prizes / next turn.

## Each condition

**Asleep (`asleep`)**
- While on: cannot attack, retreat, or use a Pokémon Power.
- Checkup: flip to wake (both Actives, every Checkup).
- Also leaves on evolve / leave Active / `RemoveStatus`.

**Paralyzed (`paralyzed`)**
- While on: cannot attack, retreat, or use a Pokémon Power.
- Checkup: auto-clear only for the player who just ended their turn. If you become Paralyzed on the opponent’s turn, you are Paralyzed for your whole next turn, then it drops in the Checkup after that turn.
- Also leaves on evolve / leave Active / `RemoveStatus`.

**Confused (`confused`)**
- While on: can retreat; Pokémon Power blocked; attack is the flip above.
- Does not tick in Checkup. Stays until evolve / leave Active / `RemoveStatus`.

**Poisoned (`poison`)**
- While on: no menu restriction.
- Checkup: 1 counter, stays on.
- Also leaves on evolve / leave Active / `RemoveStatus`.

**Burned (`burn`)**
- While on: no menu restriction.
- Checkup: 2 counters, then flip to recover.
- Also leaves on evolve / leave Active / `RemoveStatus`.

## Do not

- Rotate or flip cards in the snapshot. The UI reads `status`.
- Put Confused in Checkup.
- Run Poison/Burn through the attack pipeline.
- Invent a second status queue. This is Checkup plus the Confused gate on `Action.Attack`.
