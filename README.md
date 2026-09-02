# Notes

Captured from earlier engine notes so the ideas stay around while the code moves.

## Engine

Action needs no "check" string key because gamestate is omnipotent.

Central engine is a state machine.

State is captured by GameState including all game and player values as well as rules resolution stack.

Drive stack frame interpretation.

Game state is base state. Each action calculation combines various conditions into resulting values inside gamestate variables, replaces them, and returns new gamestate.

Stack frames are expressions of an alteration to the game state provided by an effect, or game action.

The engine interprets the resulting gamestate by evaluating one stack at a time.

Some interrupts may pause the stack execution, for example K.O.

The position of stack frames in the stack may be altered by an effect.

Expressions are built on primitive operations defined in a DSL.

Game action intent is interpreted and an expression with proper gamestate variables is produced.

The expression is pushed onto the stack.

## Loop

1. Compute legal actions based on game state current
2. Provide action options to active player
3. Player selects an action already deemed legal
4. Interpreter decodes primitive operations
5. Delta gamestate computed and returned

## UI

Outcomes may potentially be pre-computed by available choice calculator.

Allows for optimistic UI.

## Instantiation

Deck cards should be constructed as a set of classes from data at game start.

## Deck API types

IDK I THINK THESE TYPES MIGHT NEED WORK.

Interface representing a Deck as defined in the schema.

Interface representing a card within a deck, including quantity.

Interface representing a complete deck with its cards.

## Effects

Card action (move, draw, discard, shuffle).

Apply status (+ / -).

Apply damage (+ / -).

## Messages

Messages come from "event listener" system; centralized message definition.

## Moves

Throw error if invalid action should never make it here.

## Damage

Can be negative.

## Stack

Stack is for async actions that need to occur in order.

Gamestate in suspended "awaiting" resolution.

## Evaluate action

Reads primitive expression and returns delta gamestate.

Business logical difference between gameplay and atomic action.

Log action history.

Action already determined legal before getting here.

Should be purely updating values to gamestate directly.

Effects are always sourced by some card whether environmental or active play.

MOVE_CARD: remove from subject zone, place in target zone.
