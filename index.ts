import { interpret } from "./interpret.js"
import { Op } from "./dsl.js"
import type { Card, GameState } from "./types.js"
import { Phase } from "./types.js"
import { initializeGameState } from "./initialize.js"

console.log("Initializing...")

async function fetchDeckData(deckId: string) {
  const response = await fetch(`http://localhost:8787/api/decks/${deckId}`)
  return await response.json() as Card[]
}

const decks = {
  1: "d-base1-1",
  2: "d-base1-2",
  3: "d-base1-3",
}

const p1Deck = await fetchDeckData(decks[2])
const p2Deck = await fetchDeckData(decks[3])

let gamestate = initializeGameState(p1Deck, p2Deck)

while (gamestate.phase !== Phase.Ended) {
  // gamestate and avail actions goes to client. await input.
  // get input and enter state machine
  let action
  gamestate = stateMachine(gamestate, action)
}


function stateMachine(gamestate: GameState, action: any): GameState {

  switch(gamestate.phase) {
    case Phase.Init:
      
      // both players, no attack:
      //   select { card, zone: $owner.deck, filter: basic } bind $active
      //   move_zone_to_slot $active deck → $owner.active.evolution
      //   select { card, zone: $owner.deck, filter: basic } bind $bench[]  (0..5)
      //   move_zone_to_slot each $bench deck → $owner.bench[i].evolution
      //   move_card deck → prize ×6
      //   shuffle deck
      // wait both ready → phase = turn
      return gamestate

    case Phase.Turn:
      // if opening the turn (no action yet):
      //   draw { player: $active, count: 1 }
      if (!action) {
        const player = gamestate.activePlayer
        const card = gamestate.players[player].deck[0]
        if (card) {
          gamestate = interpret(gamestate, {
            op: Op.MoveZoneToZone,
            card,
            from: { player, zone: "deck" },
            to: { player, zone: "hand", position: "bottom" },
          })
        }
        // compute legal actions → client → wait
        return gamestate
      }
      // action is Primitive[] already deemed legal, e.g.
      //   play_active | play_bench | attach_energy
      //   trainer: [select, move_card, …]
      //   attack:  [apply_damage slot amount]
      //            | [flip_coin bind $c, if $c heads then apply_damage …]
      //   retreat: [move_slot_to_slot active ↔ bench]
      //   end_turn → phase = checkup
      return gamestate

    case Phase.Checkup:
      // no player action; walk slots:
      //   if psn → apply_damage slot 10
      //   if brn → apply_damage slot 20; flip_coin bind $c; if tails remove_status brn
      //   if slp → flip_coin bind $c; if heads remove_status slp
      //   if par → remove_status par
      //   if cnf → (attack already flipped; clear if needed)
      //   if slot.damage >= hp →
      //     move_slot_to_zone evolution/energy/tools → discard
      //     move_card prize → hand
      //     if prize empty | no active → phase = ended
      // phase = turn; activePlayer = opponent
      return gamestate

    case Phase.Ended:
      // no primitives
      // freeze; history is the log
      return gamestate

    default:
      return gamestate
  }
}
