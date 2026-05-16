# Integration Test Suite

End-to-end battle simulator that drives the full engine through real action
sequences. Catches integration bugs that handler-level smoke tests can miss
(bloom rule edge cases, phase transition errors, win condition checks, etc.).

## Run

```bash
node tools/integration-test/full-match-v1.mjs   # ~16-turn match to GAME_OVER
node tools/integration-test/full-match-v2.mjs   # targeted invariant probes
```

## What v1 covers

- Build deterministic 50+20 white deck for both sides
- Initialize state (hand=7, life=5, cheer-deck=15)
- Setup phase (place center)
- Driven turn loop: RESET → DRAW → CHEER → MAIN → PERFORMANCE → END
- Bloom Debut → 1st → 2nd
- Place backstage members + collab placement
- Cheer assignment from cheer-deck
- Art attacks (center + collab)
- Knockdown + life loss
- Win condition (life=0)

## What v2 covers

- AttachedSupportEffects REGISTRY direct probes (5 entries)
- DamageCalculator passive observer chain (K-3): hBP04-074, hBP01-121
- H-5 reactive oshi auto-fire (hBP01-007 SP on blue → opp center)
- Stage-empty win path
- No-Debut hand stability

## Bugs caught

- **Bloom level rule** (2026-04-28): `BLOOM_ORDER.indexOf` treated `1st Buzz`
  as a separate level so 1st → 2nd was rejected as +2. Fixed by introducing
  a numeric `bloomLevelOf()` map where 1st and 1st Buzz are both level 1.

## When to run

- Before every release
- After any change to `GameEngine.js`, `ActionValidator.js`, `DamageCalculator.js`
- After registering a new effect handler that uses a non-trivial mechanic
