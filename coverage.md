# Base Set coverage (`base1`)

What `effects.ts` can say today vs printed Base Set text. Special Conditions: `status.md`.

Plain numbered damage with empty text is automatic (`attack` → `apply_damage`). `"40+"` / `"30×"` / `"50-"` and integer-plus-text attacks are not.

## Authored

**Pokémon (by name, under the printed id):** Confuse Ray, Damage Swap, Hydro Pump, Rain Dance, Energy Trans, Energy Burn, Scrunch, Double-edge, Fire Spin, Whirlpool, Thundershock, Thunder Wave (Magneton), Hypnosis, Dream Eater, Poisonpowder (Ivysaur), Sing, Metronome (copy minus recoil), Meditate, Doubleslap (Jynx / Poliwhirl), Karate Chop, Flail, Earthquake, Selfdestruct (Magneton / Magnemite), Harden (Onix), Agility (Raichu), Barrier (Mewtwo), Super Fang, Toxic, Whirlwind (Pidgey / Pidgeotto), Sand-attack (Sandshrew), Amnesia (Poliwhirl), Horn Hazard, Slam, Twineedle, Double Kick, Fury Attack, Hyper Beam, Thunderbolt (Zapdos), Recover (Kadabra / Starmie), Conversion 1 / 2 (Porygon), Leech Seed (Bulbasaur).

**Trainers (id is the key, array expr):** Bill `base1-91`, Potion `base1-94`, Switch `base1-95`, Gust of Wind `base1-93`, Full Heal `base1-82`, Super Potion `base1-90`, Energy Removal `base1-92`, Computer Search `base1-71`, Maintenance `base1-83`, Professor Oak `base1-88`, Impostor Professor Oak `base1-73`, Lass `base1-75`, Pokémon Trader `base1-77`, Pokémon Center `base1-85`, Item Finder `base1-74`, Super Energy Removal `base1-79`, Energy Retrieval `base1-81`, Defender `base1-80`, PlusPower `base1-84`. Play discards the card first, then this expr — unless the expr attaches it as a tool.

## Engine holes (cannot author as printed)

| Hole | Blocks |
|---|---|
| Triggers (on-hit, on-KO, last attack) | Strikes Back, Destiny Bond, Mirror Move |
| Become Energy | Buzzap |
| Empty Select / devolve / play-as-Pokémon (optional card Select is done) | Flute, Revive, Scoop Up, Devolution, Doll, Pokédex, Breeder |

Metronome copies the attack expr and drops recoil (`ApplyDamage` a positive literal onto `$self_slot`). Discard-to-use on the copy is later.

## Attacks not authorable

Pidgeotto Mirror Move; Gastly Destiny Bond; Farfetch'd Leek Slap.

## Powers not authorable

Strikes Back, Buzzap. (Damage Swap, Rain Dance, Energy Trans, and Energy Burn are in.)

## Trainers not authorable

Clefairy Doll, Devolution Spray, Pokémon Breeder, Scoop Up, Pokémon Flute, Pokédex, Revive.
