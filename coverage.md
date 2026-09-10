# Base Set coverage (`base1`)

What `effects.ts` can say today vs printed Base Set text. Special Conditions: `status.md`.

Plain numbered damage with empty text is automatic (`attack` → `apply_damage`). `"40+"` / `"30×"` / `"50-"` are not.

## Authored

**Pokémon (by name, under the printed id):** Confuse Ray, Damage Swap, Hydro Pump, Rain Dance, Scrunch, Double-edge, Fire Spin, Whirlpool, Thundershock, Hypnosis, Poisonpowder (Ivysaur), Sing, Metronome (copy does **not** strip discards), Meditate, Karate Chop, Flail.

**Trainers (id is the key, array expr):** Bill `base1-91`, Potion `base1-94`, Switch `base1-95`, Gust of Wind `base1-93`, Full Heal `base1-82`, Super Potion `base1-90`, Energy Removal `base1-92`. Play discards the card first, then this expr.

## Engine holes (cannot author as printed)

| Hole | Blocks |
|---|---|
| Count/If on **seats** (`Count` pile is still one slot attachment or `kind: "damage"`; `If` is `equals` only) | Super Fang, Dream Eater, Toxic 20 poison, “if any Bench” as a check |
| Energy pile from a **chosen** `SlotId` (only Active `$energy`) | Super Energy Removal (“up to 2”), Energy Trans (move between seats) |
| For-each Bench / all your Pokémon | Selfdestruct, Earthquake, Pokémon Center |
| Shuffle, search deck, discard/move a **whole zone** | Oak, Impostor Oak, Computer Search, Trader, Maintenance, Lass |
| `ApplyModifier` is **set `attack_damage`**, not −20 / +10 / ≤30 / ignore effects | Harden, Defender, PlusPower, Agility, Barrier |
| Opponent as chooser | Whirlwind |
| Next-turn attack gate besides Confused | Sand-attack, Amnesia |
| Triggers (on-hit, on-KO, last attack) | Strikes Back, Destiny Bond, Mirror Move, Leech Seed |
| Rewrite Energy type / become Energy / attach as tool | Energy Burn, Buzzap, Defender, PlusPower |
| Optional “up to”, empty Select, half HP, devolve, play-as-Pokémon | Retrieval, Flute, Revive, Scoop Up, Devolution, Doll, Pokédex, Breeder |

Metronome does not strip “discard to use” on the copy.

## Attacks not authorable

Raticate Super Fang; Nidoking Toxic; Haunter Dream Eater; Dragonair Hyper Beam; Magneton/Magnemite Selfdestruct; Dugtrio Earthquake; Pidgey/Pidgeotto Whirlwind; Raichu Agility; Mewtwo Barrier; Onix Harden; Sand-attack; Poliwhirl Amnesia; Pidgeotto Mirror Move; Gastly Destiny Bond; Farfetch'd Leek Slap; Porygon Conversion 1 / 2; Bulbasaur Leech Seed.

**Stretch (not honest):** Recover (discard Energy + huge negative damage); Thunderbolt discard-all (loop Select on `$energy`); two-coin × damage (two flips + `Calc`); Horn Hazard (hit only on heads).

## Powers not authorable

Energy Burn, Strikes Back, Energy Trans, Buzzap. (Damage Swap and Rain Dance are in.)

## Trainers not authorable

Clefairy Doll, Computer Search, Devolution Spray, Impostor Oak, Item Finder, Lass, Pokémon Breeder, Pokémon Trader, Scoop Up, Super Energy Removal, Defender, Energy Retrieval, Maintenance, PlusPower, Pokémon Center, Pokémon Flute, Pokédex, Professor Oak, Revive.
