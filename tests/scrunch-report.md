# Scrunch

Passed: 10/10

## PASS: heads: pending

Expected: `"pending"`
Realized: `"pending"`

## PASS: heads: until p2

Expected: `2`
Realized: `2`

## PASS: heads: field

Expected: `"attack_damage"`
Realized: `"attack_damage"`

## PASS: p2 turn: active

Expected: `"active"`
Realized: `"active"`

## PASS: p2 jab: chansey damage

Expected: `0`
Realized: `0`

## PASS: apply_damage still lands

Expected: `20`
Realized: `20`

## PASS: p2 checkup: modifier gone

Expected: `0`
Realized: `0`

## PASS: after drop: jab lands

Expected: `50`
Realized: `50`

## PASS: tails: no modifier

Expected: `0`
Realized: `0`

## PASS: tails: jab lands

Expected: `30`
Realized: `30`

## Board (heads path, after second jab)

# gamestate

```
  phase    init
  turn     0
  first    p2
  active   p2
  mulligan p1=0  p2=0
  ready    p1=false  p2=false

> p2
  prize    0
  hand     0  -
  deck     0
  discard  0
  active   Clefairy  |  dmg 0
  bench[0] -
  bench[1] -
  bench[2] -
  bench[3] -
  bench[4] -

  p1
  active   Chansey  |  dmg 50
  bench[0] -
  bench[1] -
  bench[2] -
  bench[3] -
  bench[4] -
  prize    0
  hand     0  -
  deck     0
  discard  0
```
