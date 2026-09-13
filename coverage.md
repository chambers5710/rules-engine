# Base Set coverage (`base1`)

What `effects.ts` can say today vs printed Base Set text. Special Conditions: `status.md`.

Plain numbered damage with empty text is automatic (`attack` → `apply_damage`). `"40+"` / `"30×"` / `"50-"` and integer-plus-text attacks are not.

## Authored

**Pokémon (by name, under the printed id):** Confuse Ray, Damage Swap, Hydro Pump, Water Gun (Poliwag / Poliwrath), Rain Dance, Energy Trans, Energy Burn, Buzzap, Scrunch, Double-edge, Fire Spin, Whirlpool, Thundershock, Thunderpunch, Thunder Wave (Magneton), Hypnosis, Dream Eater, Poisonpowder (Ivysaur), Sing, Metronome (copy minus recoil), Meditate, Doubleslap (Jynx / Poliwhirl), Karate Chop, Flail, Earthquake, Selfdestruct (Magneton / Magnemite), Harden (Onix), Agility (Raichu), Barrier / Psychic (Mewtwo), Super Fang, Toxic, Thrash, Whirlwind (Pidgey / Pidgeotto), Sand-attack (Sandshrew), Amnesia (Poliwhirl), Horn Hazard, Slam, Twineedle, Double Kick, Fury Attack, Hyper Beam, Thunderbolt (Zapdos), Recover (Kadabra / Starmie), Conversion 1 / 2 (Porygon), Leech Seed (Bulbasaur), Foul Gas, Leek Slap, Lure / Fire Blast (Ninetales).

**Trainers (id is the key, array expr):** Bill `base1-91`, Potion `base1-94`, Switch `base1-95`, Gust of Wind `base1-93`, Full Heal `base1-82`, Super Potion `base1-90`, Energy Removal `base1-92`, Computer Search `base1-71`, Maintenance `base1-83`, Professor Oak `base1-88`, Impostor Professor Oak `base1-73`, Lass `base1-75`, Pokémon Trader `base1-77`, Pokémon Center `base1-85`, Item Finder `base1-74`, Super Energy Removal `base1-79`, Energy Retrieval `base1-81`, Defender `base1-80`, PlusPower `base1-84`, Pokémon Flute `base1-86`, Pokédex `base1-87`, Revive `base1-89`, Scoop Up `base1-78`, Devolution Spray `base1-72`, Pokémon Breeder `base1-76`, Clefairy Doll `base1-70`. Play discards the card first, then this expr — unless the expr `MoveZoneToSlot`s it (tool or play-as-Pokémon).

## Engine holes (cannot author as printed)

None left in Base Set. Pokédex is prefix look + in-zone `reorder`. Buzzap is authored (override + attach + `discard_slot`, not checkup KO).

Metronome copies the attack expr and drops recoil (`ApplyDamage` a positive literal onto `$self_slot`) plus leading self-Energy pay (Fire Spin / Recover / Barrier / Thunderbolt). Hyper Beam / Whirlpool stay.

## Attacks not authorable (engine hole)

None left in Base Set. Leek Slap is authored (`attack_use` `ban` until `leave_play`). Buzzap is authored (peel + override, not checkup KO).

Writable Base Set reprints are in `effects.json` (Stiffen / Withdraw as Scrunch; Water Gun as Hydro Pump with cost 1 / Poliwrath cost 2; Thrash / Thunderpunch; Foul Gas; Psychic; Lure).

## Powers not authorable

None. Buzzap is in. (Strikes Back, Damage Swap, Rain Dance, Energy Trans, Energy Burn, Buzzap.)

## Trainers not authorable

None. Pokédex is prefix look + `reorder`. Clefairy Doll is authored (play onto empty bench, then identity override).
