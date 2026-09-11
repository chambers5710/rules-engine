import { Op, type BindingName, type Expr } from "./dsl.js"
import { printedAttackDamage } from "./survey.js"
import { DAMAGE_COUNTER } from "./types.js"

// Pokémon: attacks / abilities by name. Trainers: the expr is the entry (id only).
export type CardEffects = {
  attacks?: Record<string, Expr>
  abilities?: Record<string, Expr>
}

function selfdestruct(hit: number, splash: number): Expr {
  return [
    { op: Op.Attack, base: hit, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
    { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
    {
      op: Op.Each, who: "both", among: "bench", bind: "$seat", then: [
        { op: Op.ApplyDamage, amount: splash, slot: "$seat" },
      ],
    },
    { op: Op.ApplyDamage, amount: hit, slot: "$self_slot" },
  ]
}

function optionalEnergy(source: BindingName, dest: BindingName): Expr {
  return [
    { op: Op.Select, pick: "cards", source, attachment: "energy", bind: "$opt", optional: true },
    {
      op: Op.MoveSlotToZone,
      card: "$opt",
      source,
      attachment: "energy",
      dest,
      position: "bottom",
    },
  ]
}

function trainersIntoDeck(hand: BindingName, deck: BindingName): Expr {
  return [
    { op: Op.Count, kind: "cards", zone: hand, filter: { kind: "trainer" }, bind: "$n" },
    {
      op: Op.Loop, bind: "$n", until: 0, then: [
        { op: Op.Count, kind: "first", zone: hand, filter: { kind: "trainer" }, bind: "$card" },
        { op: Op.MoveZoneToZone, card: "$card", source: hand, dest: deck, position: "bottom" },
        { op: Op.Count, kind: "cards", zone: hand, filter: { kind: "trainer" }, bind: "$n" },
      ],
    },
    { op: Op.Shuffle, zone: deck },
  ]
}

export const effects: Record<string, CardEffects | Expr> = {
  // Chansey — first Basic Pokémon in base1
  "base1-1": {
    attacks: {
      "Confuse Ray": [
        { op: Op.Attack, base: 30, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        { op: Op.FlipCoin, bind: "$coin" },
        {
          op: Op.If, bind: "$coin", equals: "heads", then: [
            { op: Op.ApplyStatus, status: "confused", slot: "$defending" }
          ]
        },
      ]
    },
    abilities: {
      "Damage Swap": [
        {
          op: Op.Select,
          bind: "$from",
          pick: "slots",
          who: "self",
          filter: { kind: "has_counters", counters: 1 },
        },
        {
          op: Op.Select,
          bind: "$to",
          pick: "slots",
          who: "self",
          filter: [
            { kind: "other_than", bind: "$from" },
            { kind: "survives_counters", counters: 1 },
          ],
        },
        { op: Op.ApplyDamage, amount: -DAMAGE_COUNTER, slot: "$from" },
        { op: Op.ApplyDamage, amount: DAMAGE_COUNTER, slot: "$to" },
      ],
    },
  },
  "base1-2": {
    attacks: {
      "Hydro Pump": [
        { op: Op.Count, kind: "energy_value", slot: "$self_slot", attachment: "energy", filter: { kind: "energy", type: "Water" }, bind: "$water" },
        { op: Op.Calc, fn: "sub", a: "$water", b: 3, bind: "$extra" },
        { op: Op.Calc, fn: "max", a: "$extra", b: 0, bind: "$extra" },
        { op: Op.Calc, fn: "min", a: "$extra", b: 2, bind: "$extra" },
        { op: Op.Calc, fn: "mul", a: "$extra", b: 10, bind: "$bonus" },
        { op: Op.Calc, fn: "add", a: 40, b: "$bonus", bind: "$base" },
        { op: Op.Attack, base: "$base", attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
      ],
    },
    abilities: {
      "Rain Dance": [
        {
          op: Op.Select,
          pick: "cards",
          source: "$hand",
          bind: "$energy",
          filter: { kind: "energy", type: "Water" },
        },
        {
          op: Op.Select,
          pick: "slots",
          who: "self",
          bind: "$to",
          filter: { kind: "has_type", type: "Water" },
        },
        {
          op: Op.MoveZoneToSlot,
          card: "$energy",
          source: "$hand",
          dest: "$to",
          attachment: "energy",
        },
      ]
    }
  },
  "base1-3": {
    attacks: {
      "Scrunch": [
        { op: Op.FlipCoin, bind: "$coin" },
        {
          op: Op.If, bind: "$coin", equals: "heads", then: [
            { op: Op.ApplyModifier, slot: "$self_slot", field: "attack_damage", set: 0, until: { beat: "end_of_turn", who: "opponent" } }
          ]
        },
      ],
      "Double-edge": [
        { op: Op.Attack, base: 80, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        { op: Op.ApplyDamage, amount: 80, slot: "$self_slot" },
      ],
    },
  },
  "base1-4": {
    attacks: {
      "Fire Spin": [
        {
          op: Op.Select,
          pick: "cards",
          source: "$energy",
          bind: "$pay",
        },
        {
          op: Op.MoveSlotToZone,
          card: "$pay",
          source: "$energy",
          dest: "$discard",
          position: "bottom",
        },
        {
          op: Op.Select,
          pick: "cards",
          source: "$energy",
          bind: "$pay",
        },
        {
          op: Op.MoveSlotToZone,
          card: "$pay",
          source: "$energy",
          dest: "$discard",
          position: "bottom",
        },
        { op: Op.Attack, base: 100, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
      ],
    },
  },
  "base1-9": {
    attacks: {
      "Thunder Wave": [
        { op: Op.Attack, base: 30, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        { op: Op.FlipCoin, bind: "$coin" },
        {
          op: Op.If, bind: "$coin", equals: "heads", then: [
            { op: Op.ApplyStatus, status: "paralyzed", slot: "$defending" }
          ]
        },
      ],
      "Selfdestruct": selfdestruct(80, 20),
    },
  },
  "base1-10": {
    attacks: {
      "Barrier": [
        {
          op: Op.Select,
          pick: "cards",
          source: "$energy",
          bind: "$pay",
          filter: { kind: "energy", type: "Psychic" },
        },
        {
          op: Op.MoveSlotToZone,
          card: "$pay",
          source: "$energy",
          dest: "$discard",
          position: "bottom",
        },
        {
          op: Op.ApplyModifier,
          slot: "$self_slot",
          field: "attack_damage",
          prevent: "all",
          until: { beat: "end_of_turn", who: "opponent" },
        },
      ],
    },
  },
  "base1-14": {
    attacks: {
      "Agility": [
        { op: Op.Attack, base: 20, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        { op: Op.FlipCoin, bind: "$coin" },
        {
          op: Op.If, bind: "$coin", equals: "heads", then: [
            {
              op: Op.ApplyModifier,
              slot: "$self_slot",
              field: "attack_damage",
              prevent: "all",
              until: { beat: "end_of_turn", who: "opponent" },
            },
          ],
        },
      ],
    },
  },
  "base1-56": {
    attacks: {
      "Harden": [
        {
          op: Op.ApplyModifier,
          slot: "$self_slot",
          field: "attack_damage",
          prevent: 30,
          until: { beat: "end_of_turn", who: "opponent" },
        },
      ],
    },
  },
  "base1-19": {
    attacks: {
      "Earthquake": [
        { op: Op.Attack, base: 70, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        {
          op: Op.Each, who: "self", among: "bench", bind: "$seat", then: [
            { op: Op.ApplyDamage, amount: 10, slot: "$seat" },
          ],
        },
      ],
    },
  },
  "base1-53": {
    attacks: {
      "Selfdestruct": selfdestruct(40, 10),
    },
  },
  "base1-13": {
    attacks: {
      "Whirlpool": [
        { op: Op.Attack, base: 40, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        {
          op: Op.Select,
          pick: "cards",
          source: "$defending",
          attachment: "energy",
          bind: "$pay",
        },
        {
          op: Op.MoveSlotToZone,
          card: "$pay",
          source: "$defending",
          attachment: "energy",
          dest: "$opp_discard",
          position: "bottom",
        },
      ],
    },
  },
  "base1-20": {
    attacks: {
      "Thundershock": [
        { op: Op.Attack, base: 10, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        { op: Op.FlipCoin, bind: "$coin" },
        {
          op: Op.If, bind: "$coin", equals: "heads", then: [
            { op: Op.ApplyStatus, status: "paralyzed", slot: "$defending" }
          ]
        },
      ],
    },
  },
  "base1-29": {
    attacks: {
      "Hypnosis": [
        { op: Op.ApplyStatus, status: "asleep", slot: "$defending" },
      ],
      "Dream Eater": [
        {
          op: Op.If, slot: "$defending", status: "asleep", then: [
            { op: Op.Attack, base: 50, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
            { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
          ],
        },
      ],
    },
  },
  "base1-30": {
    attacks: {
      "Poisonpowder": [
        { op: Op.Attack, base: 20, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        { op: Op.ApplyStatus, status: "poison", slot: "$defending" },
      ],
    },
  },
  "base1-31": {
    attacks: {
      "Meditate": [
        { op: Op.Count, kind: "damage", slot: "$defending", bind: "$slot_damage" },
        { op: Op.Calc, fn: "add", a: 20, b: "$slot_damage", bind: "$base" },
        { op: Op.Attack, base: "$base", attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
      ],
    },
  },
  "base1-34": {
    attacks: {
      "Karate Chop": [
        { op: Op.Count, kind: "damage", slot: "$self_slot", bind: "$slot_damage" },
        { op: Op.Calc, fn: "sub", a: 50, b: "$slot_damage", bind: "$base" },
        { op: Op.Calc, fn: "max", a: "$base", b: 0, bind: "$base" },
        { op: Op.Attack, base: "$base", attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
      ],
    },
  },
  "base1-35": {
    attacks: {
      "Flail": [
        { op: Op.Count, kind: "damage", slot: "$self_slot", bind: "$base" },
        { op: Op.Attack, base: "$base", attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
      ],
    },
  },
  "base1-5": {
    attacks: {
      "Sing": [
        { op: Op.FlipCoin, bind: "$coin" },
        {
          op: Op.If, bind: "$coin", equals: "heads", then: [
            { op: Op.ApplyStatus, status: "asleep", slot: "$defending" }
          ]
        },
      ],
      "Metronome": [
        { op: Op.Select, pick: "attacks", slot: "$defending", bind: "$copy" },
        { op: Op.RunEffect, attack: "$copy", slot: "$defending" },
      ],
    },
  },
  "basep-51": {
    attacks: {
      "Super Singe": [
        { op: Op.Attack, base: 30, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
        { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
        { op: Op.FlipCoin, bind: "$coin" },
        {
          op: Op.If, bind: "$coin", equals: "heads", then: [
            { op: Op.ApplyStatus, status: "burn", slot: "$defending" }
          ]
        },
      ],
    },
  },
  "base1-84": [
    {
      op: Op.MoveZoneToSlot,
      card: "$played",
      source: "$hand",
      dest: "$self_slot",
      attachment: "tools",
    },
    {
      op: Op.ApplyModifier,
      slot: "$self_slot",
      field: "attack_damage",
      add: 10,
      until: { beat: "end_of_turn", who: "owner" },
      card: "$played",
    },
  ],
  "base1-85": [
    {
      op: Op.Each,
      who: "self",
      among: "in_play",
      filter: { kind: "has_counters", counters: 1 },
      bind: "$seat",
      then: [
        { op: Op.Count, kind: "damage", slot: "$seat", bind: "$heal" },
        { op: Op.Calc, fn: "mul", a: "$heal", b: -1, bind: "$heal" },
        { op: Op.ApplyDamage, amount: "$heal", slot: "$seat" },
        { op: Op.Count, kind: "cards", slot: "$seat", attachment: "energy", bind: "$n" },
        {
          op: Op.Loop, bind: "$n", until: 0, then: [
            { op: Op.Count, kind: "first", slot: "$seat", attachment: "energy", bind: "$card" },
            {
              op: Op.MoveSlotToZone,
              card: "$card",
              source: "$seat",
              attachment: "energy",
              dest: "$discard",
              position: "bottom",
            },
            { op: Op.Count, kind: "cards", slot: "$seat", attachment: "energy", bind: "$n" },
          ],
        },
      ],
    },
  ],
  "base1-74": [
    { op: Op.Select, pick: "cards", source: "$hand", bind: "$a" },
    { op: Op.MoveZoneToZone, card: "$a", source: "$hand", dest: "$discard", position: "bottom" },
    { op: Op.Select, pick: "cards", source: "$hand", bind: "$b" },
    { op: Op.MoveZoneToZone, card: "$b", source: "$hand", dest: "$discard", position: "bottom" },
    {
      op: Op.Select,
      pick: "cards",
      source: "$discard",
      bind: "$find",
      filter: [{ kind: "trainer" }, { kind: "other_than", bind: "$played" }],
    },
    { op: Op.MoveZoneToZone, card: "$find", source: "$discard", dest: "$hand", position: "bottom" },
  ],
  "base1-79": [
    { op: Op.Select, pick: "slots", who: "self", bind: "$from", filter: { kind: "has_energy" } },
    {
      op: Op.Select,
      pick: "cards",
      source: "$from",
      attachment: "energy",
      bind: "$pay",
    },
    {
      op: Op.MoveSlotToZone,
      card: "$pay",
      source: "$from",
      attachment: "energy",
      dest: "$discard",
      position: "bottom",
    },
    { op: Op.Select, pick: "slots", who: "opponent", bind: "$to" },
    ...optionalEnergy("$to", "$opp_discard"),
    ...optionalEnergy("$to", "$opp_discard"),
  ],
  "base1-81": [
    { op: Op.Select, pick: "cards", source: "$hand", bind: "$pay" },
    { op: Op.MoveZoneToZone, card: "$pay", source: "$hand", dest: "$discard", position: "bottom" },
    {
      op: Op.Select,
      pick: "cards",
      source: "$discard",
      bind: "$a",
      filter: [{ kind: "energy" }, { kind: "other_than", bind: "$pay" }],
      optional: true,
    },
    { op: Op.MoveZoneToZone, card: "$a", source: "$discard", dest: "$hand", position: "bottom" },
    {
      op: Op.Select,
      pick: "cards",
      source: "$discard",
      bind: "$b",
      filter: [{ kind: "energy" }, { kind: "other_than", bind: "$pay" }],
      optional: true,
    },
    { op: Op.MoveZoneToZone, card: "$b", source: "$discard", dest: "$hand", position: "bottom" },
  ],
  "base1-80": [
    { op: Op.Select, pick: "slots", who: "self", bind: "$to" },
    {
      op: Op.MoveZoneToSlot,
      card: "$played",
      source: "$hand",
      dest: "$to",
      attachment: "tools",
    },
    {
      op: Op.ApplyModifier,
      slot: "$to",
      field: "attack_damage",
      sub: 20,
      until: { beat: "end_of_turn", who: "opponent" },
      card: "$played",
    },
  ],
  "base1-82": [
    { op: Op.RemoveStatus, status: "asleep", slot: "$self_slot" },
    { op: Op.RemoveStatus, status: "confused", slot: "$self_slot" },
    { op: Op.RemoveStatus, status: "paralyzed", slot: "$self_slot" },
    { op: Op.RemoveStatus, status: "poison", slot: "$self_slot" },
  ],
  "base1-90": [
    { op: Op.Select, pick: "slots", who: "self", bind: "$to", filter: { kind: "has_energy" } },
    {
      op: Op.Select,
      pick: "cards",
      source: "$to",
      attachment: "energy",
      bind: "$pay",
    },
    {
      op: Op.MoveSlotToZone,
      card: "$pay",
      source: "$to",
      attachment: "energy",
      dest: "$discard",
      position: "bottom",
    },
    { op: Op.ApplyDamage, amount: -4 * DAMAGE_COUNTER, slot: "$to" },
  ],
  "base1-71": [
    { op: Op.Select, pick: "cards", source: "$hand", bind: "$a" },
    { op: Op.MoveZoneToZone, card: "$a", source: "$hand", dest: "$discard", position: "bottom" },
    { op: Op.Select, pick: "cards", source: "$hand", bind: "$b" },
    { op: Op.MoveZoneToZone, card: "$b", source: "$hand", dest: "$discard", position: "bottom" },
    { op: Op.Select, pick: "cards", source: "$deck", bind: "$find" },
    { op: Op.MoveZoneToZone, card: "$find", source: "$deck", dest: "$hand", position: "bottom" },
    { op: Op.Shuffle, zone: "$deck" },
  ],
  "base1-75": [
    { op: Op.Reveal, cards: "$hand", to: "both" },
    { op: Op.Reveal, cards: "$opp_hand", to: "both" },
    ...trainersIntoDeck("$hand", "$deck"),
    ...trainersIntoDeck("$opp_hand", "$opp_deck"),
  ],
  "base1-77": [
    { op: Op.Select, pick: "cards", source: "$hand", bind: "$give", filter: { kind: "pokemon" } },
    { op: Op.Select, pick: "cards", source: "$deck", bind: "$take", filter: { kind: "pokemon" } },
    { op: Op.Reveal, cards: "$give", to: "opponent" },
    { op: Op.Reveal, cards: "$take", to: "opponent" },
    { op: Op.MoveZoneToZone, card: "$give", source: "$hand", dest: "$deck", position: "bottom" },
    { op: Op.MoveZoneToZone, card: "$take", source: "$deck", dest: "$hand", position: "bottom" },
    { op: Op.Shuffle, zone: "$deck" },
  ],
  "base1-73": [
    { op: Op.Count, kind: "cards", zone: "$opp_hand", bind: "$n" },
    {
      op: Op.Loop, bind: "$n", until: 0, then: [
        { op: Op.Count, kind: "first", zone: "$opp_hand", bind: "$card" },
        { op: Op.MoveZoneToZone, card: "$card", source: "$opp_hand", dest: "$opp_deck", position: "bottom" },
        { op: Op.Count, kind: "cards", zone: "$opp_hand", bind: "$n" },
      ],
    },
    { op: Op.Shuffle, zone: "$opp_deck" },
    { op: Op.Draw, who: "opponent", count: 7 },
  ],
  "base1-83": [
    { op: Op.Select, pick: "cards", source: "$hand", bind: "$a" },
    { op: Op.MoveZoneToZone, card: "$a", source: "$hand", dest: "$deck", position: "bottom" },
    { op: Op.Select, pick: "cards", source: "$hand", bind: "$b" },
    { op: Op.MoveZoneToZone, card: "$b", source: "$hand", dest: "$deck", position: "bottom" },
    { op: Op.Shuffle, zone: "$deck" },
    { op: Op.Draw, who: "self", count: 1 },
  ],
  "base1-88": [
    { op: Op.Count, kind: "cards", zone: "$hand", bind: "$n" },
    {
      op: Op.Loop, bind: "$n", until: 0, then: [
        { op: Op.Count, kind: "first", zone: "$hand", bind: "$card" },
        { op: Op.MoveZoneToZone, card: "$card", source: "$hand", dest: "$discard", position: "bottom" },
        { op: Op.Count, kind: "cards", zone: "$hand", bind: "$n" },
      ],
    },
    { op: Op.Draw, who: "self", count: 7 },
  ],
  "base1-91": [
    { op: Op.Draw, who: "self", count: 2 },
  ],
  "base1-92": [
    { op: Op.Select, pick: "slots", who: "opponent", bind: "$to" },
    {
      op: Op.Select,
      pick: "cards",
      source: "$to",
      attachment: "energy",
      bind: "$pay",
    },
    {
      op: Op.MoveSlotToZone,
      card: "$pay",
      source: "$to",
      attachment: "energy",
      dest: "$opp_discard",
      position: "bottom",
    },
  ],
  "base1-93": [
    {
      op: Op.Select,
      pick: "slots",
      who: "opponent",
      bind: "$to",
      filter: { kind: "other_than", bind: "$defending" },
    },
    { op: Op.SwapActive, slot: "$to" },
  ],
  "base1-94": [
    { op: Op.Select, pick: "slots", who: "self", bind: "$to" },
    { op: Op.ApplyDamage, amount: -2 * DAMAGE_COUNTER, slot: "$to" },
  ],
  "base1-95": [
    {
      op: Op.Select,
      pick: "slots",
      who: "self",
      bind: "$to",
      filter: { kind: "other_than", bind: "$self_slot" },
    },
    { op: Op.SwapActive, slot: "$to" },
  ],
}

export function cardEffect(
  sourceId: string,
  bucket: keyof CardEffects,
  name: string
): Expr {
  const entry = effects[sourceId]
  if (!entry || Array.isArray(entry)) return []
  return entry[bucket]?.[name] ?? []
}

export function trainerEffect(sourceId: string): Expr {
  const entry = effects[sourceId]
  return Array.isArray(entry) ? entry : []
}

export function trainerAttaches(sourceId: string): boolean {
  return trainerEffect(sourceId).some(
    (step) => step.op === Op.MoveZoneToSlot && step.attachment === "tools"
  )
}

// Written effect, or printed numeric damage through the attack pipeline.
export function attackExpr(
  sourceId: string,
  attack: { name: string; damage?: string | number | null }
): Expr {
  const written = cardEffect(sourceId, "attacks", attack.name)
  if (written.length > 0) return written
  const base = printedAttackDamage(attack.damage)
  if (base <= 0) return []
  return [
    { op: Op.Attack, base, attacker: "$self_slot", defender: "$defending", bind: "$damage" },
    { op: Op.ApplyDamage, amount: "$damage", slot: "$defending" },
  ]
}
