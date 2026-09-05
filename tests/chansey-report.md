# Chansey

Passed: 6/6

## Action log

- p1: play_active
- p1: ready
- p2: play_active
- p2: ready
- p1: attach_energy  Fighting Energy
- p1: end_turn
- p2: attach_energy  Fighting Energy
- p2: attack  Sing
- p1: attach_energy  Fighting Energy
- p1: attack  Scrunch
- p2: attach_energy  Fighting Energy
- p2: attack  Sing
- p1: attach_energy  Fighting Energy
- p1: attack  Scrunch
- p2: attach_energy  Fighting Energy
- p2: attack  Sing
- p1: attach_energy  Fighting Energy
- p1: attack  Double-edge

## PASS: p1 active

Expected: `"Chansey"`
Realized: `"Chansey"`

## PASS: p1 self damage

Expected: `80`
Realized: `80`

## PASS: p1 energy attached

Expected: `4`
Realized: `4`

## PASS: p2 active empty

Expected: `true`
Realized: `true`

## PASS: phase ended

Expected: `"ended"`
Realized: `"ended"`

## PASS: attacked Double-edge

Expected: `true`
Realized: `true`

## Board

# gamestate

```
  phase    ended
  turn     7
  first    p1
  active   p1
  mulligan p1=0  p2=9
  ready    p1=true  p2=true
  end      end: p2 has no Pokémon in play

  p2
  prize    6
  hand     3  Fighting Energy x3
  deck     18
  discard  4  Clefairy, Fighting Energy x3
  active   -
  bench[0] -
  bench[1] -
  bench[2] -
  bench[3] -
  bench[4] -

> p1
  active   Chansey  |  dmg 80  |  Fighting Energy x4
  bench[0] -
  bench[1] -
  bench[2] -
  bench[3] -
  bench[4] -
  prize    5
  hand     4  Fighting Energy x4
  deck     17
  discard  0
```
