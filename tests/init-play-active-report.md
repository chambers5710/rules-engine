# Init play active

Passed: 8/8

## Setup

- Mulligans: p1=0, p2=0
- p1 opening hand (7): Water Energy, Potion, Bill, Weedle, Magikarp, Staryu, Grass Energy
- p1 PlayActive options: Weedle, Magikarp, Staryu
- Chosen Active: Magikarp (1-18-base1-35)
- p1 hand after: Water Energy, Potion, Bill, Weedle, Staryu, Grass Energy

## PASS: init: full deck loaded

Expected: `60`
Realized: `60`

## PASS: init: opening hand at least 7

Expected: `true`
Realized: `true`

## PASS: init: has play_active

Expected: `true`
Realized: `true`

## PASS: init: action kind

Expected: `"play_active"`
Realized: `"play_active"`

## PASS: after play_active: p1 active filled

Expected: `1`
Realized: `1`

## PASS: after play_active: chosen card is active

Expected: `"1-18-base1-35"`
Realized: `"1-18-base1-35"`

## PASS: after play_active: hand down by one

Expected: `6`
Realized: `6`

## PASS: after play_active: still init

Expected: `"init"`
Realized: `"init"`
