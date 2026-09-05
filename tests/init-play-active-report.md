# Init setup

Passed: 8/8

## Setup

- Mulligans: p1=0, p2=0
- p1 opening hand (7): Grass Energy, Water Energy, Grass Energy, Staryu, Staryu, Water Energy, Weedle
- Chosen Active (p1): Staryu
- First player: 1
- p1 Active: Staryu
- p1 Bench: Weedle, Staryu
- p2 Active: Pikachu
- Prizes: p1=6, p2=6
- Phase: turn

## Action log

- p1: play_active  player=1  Staryu
- p1: play_bench  player=1  bench[0]  Weedle
- p1: play_bench  player=1  bench[2]  Staryu
- p1: ready  player=1
- p2: play_active  player=2  Pikachu
- p2: ready  player=2

## PASS: init: full deck loaded

Expected: `60`
Realized: `60`

## PASS: init: opening hand at least 7

Expected: `true`
Realized: `true`

## PASS: after init: phase is turn

Expected: `"turn"`
Realized: `"turn"`

## PASS: after init: turnCount

Expected: `1`
Realized: `1`

## PASS: after init: p1 active filled

Expected: `1`
Realized: `1`

## PASS: after init: p2 active filled

Expected: `1`
Realized: `1`

## PASS: after init: p1 prizes

Expected: `6`
Realized: `6`

## PASS: after init: p2 prizes

Expected: `6`
Realized: `6`
