# Base Set coverage (`base1`)

What `effects.ts` can say today vs printed Base Set text. Special Conditions: `status.md`.

Plain numbered damage with empty text is automatic (`attack` → `apply_damage`). `"40+"` / `"30×"` / `"50-"` are not.

## Authored

**Pokémon (by name, under the printed id):** Confuse Ray, Damage Swap, Hydro Pump, Rain Dance, Scrunch, Double-edge, Fire Spin, Whirlpool, Thundershock, Thunder Wave (Magneton), Hypnosis, Dream Eater, Poisonpowder (Ivysaur), Sing, Metronome (copy does **not** strip discards), Meditate, Karate Chop, Flail, Earthquake, Selfdestruct (Magneton / Magnemite).

**Trainers (id is the key, array expr):** Bill `base1-91`, Potion `base1-94`, Switch `base1-95`, Gust of Wind `base1-93`, Full Heal `base1-82`, Super Potion `base1-90`, Energy Removal `base1-92`, Computer Search `base1-71`, Maintenance `base1-83`, Professor Oak `base1-88`, Impostor Professor Oak `base1-73`, Lass `base1-75`, Pokémon Trader `base1-77`, Pokémon Center `base1-85`. Play discards the card first, then this expr.

## Engine holes (cannot author as printed)

| Hole | Blocks |
|---|---|
| Count/If on **seats** is done (`kind: "slots"` + `Each`). Super Fang / Toxic are not seat counts | Super Fang (half HP), Toxic 20 poison |
| Energy pile from a **chosen** `SlotId` (Select already can; “up to 2” cannot) | Super Energy Removal (“up to 2”), Energy Trans (move between seats) |
| `ApplyModifier` is **set `attack_damage`**, not −20 / +10 / ≤30 / ignore effects | Harden, Defender, PlusPower, Agility, Barrier |
| Opponent as chooser | Whirlwind |
| Next-turn attack gate besides Confused | Sand-attack, Amnesia |
| Triggers (on-hit, on-KO, last attack) | Strikes Back, Destiny Bond, Mirror Move, Leech Seed |
| Rewrite Energy type / become Energy / attach as tool | Energy Burn, Buzzap, Defender, PlusPower |
| Optional “up to”, empty Select, half HP, devolve, play-as-Pokémon | Retrieval, Flute, Revive, Scoop Up, Devolution, Doll, Pokédex, Breeder |

Metronome does not strip “discard to use” on the copy.

## Attacks not authorable

Raticate Super Fang; Nidoking Toxic; Dragonair Hyper Beam; Pidgey/Pidgeotto Whirlwind; Raichu Agility; Mewtwo Barrier; Onix Harden; Sand-attack; Poliwhirl Amnesia; Pidgeotto Mirror Move; Gastly Destiny Bond; Farfetch'd Leek Slap; Porygon Conversion 1 / 2; Bulbasaur Leech Seed.

**Stretch (not honest):** Recover (discard Energy + huge negative damage); Thunderbolt discard-all (loop Select on `$energy`); two-coin × damage (two flips + `Calc`); Horn Hazard (hit only on heads).

## Powers not authorable

Energy Burn, Strikes Back, Energy Trans, Buzzap. (Damage Swap and Rain Dance are in.)

## Trainers not authorable

Clefairy Doll, Devolution Spray, Item Finder, Pokémon Breeder, Scoop Up, Super Energy Removal, Defender, Energy Retrieval, PlusPower, Pokémon Flute, Pokédex, Revive.
