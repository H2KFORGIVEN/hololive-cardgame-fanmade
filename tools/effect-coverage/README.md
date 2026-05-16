# Effect coverage audit

Inventories the card-effect handler registry against `effect_analysis.json` and
the tournament deck list. Surfaces every (cardId, hook) pair that is still on
a placeholder log handler so we know what to implement next.

## Run

```sh
node tools/effect-coverage/audit.mjs
```

Outputs (overwritten):

- `report.md` — human-readable markdown (headline %, by-hook table, by-set
  table, top-60 tournament backlog, per-deck coverage)
- `backlog.json` — full list of non-REAL/non-PASSIVE entries with usage counts
  (suitable for slicing the next batch of work)

## Status definitions

| Status      | Meaning                                                              |
|-------------|----------------------------------------------------------------------|
| REAL        | handler mutates state, returns a prompt, or queues a damage boost    |
| PASSIVE     | handled at runtime by `AttachedSupportEffects.js` registry / leave-stage cleanup — not via the hook handler |
| LOG_ONLY    | handler is registered but only emits a log line                      |
| PASSTHROUGH | universal fallback (`registerPassthrough`)                           |
| BROKEN      | handler threw on synthetic context (likely false positive)           |
| MISSING     | no handler at all (passthrough should have caught these)             |

## How a handler is classified as REAL

The audit invokes each handler against a synthetic-but-realistic state and
observes:

1. The handler returns `{ prompt: ... }` → REAL (interactive).
2. The handler returns `{ effect: ... }` → REAL (boost / modifier).
3. The handler mutates zone counts / damage / boosts / extraTurnQueued → REAL.
4. None of the above, but the handler's **source code** matches a state-mutating
   pattern (`drawCards()`, `state._turnBoosts.push`, `state.pendingEffect = …`,
   `memberInst.attachedCheer.push`, …) → REAL (treated as `GATED` — real but
   conditioned on state the synthetic doesn't satisfy).
5. Otherwise → LOG_ONLY.

For arts (`art1`, `art2`), both `ON_ART_RESOLVE` AND `ON_ART_DECLARE` are
checked because many cards put the boost on declare and only log on resolve.

For oshi/sp skills the audit forces the matching `skillType`. For `effectG`
the audit also tries `triggerEvent: sp_skill_used`, `performance_start`,
`turn_start` so handlers gated on those don't get marked LOG_ONLY.

## Caveats

- Single-snapshot synthetic state. Handlers that need very specific deck
  contents (e.g. card with a particular tag) may legitimately log "no match"
  and look LOG_ONLY. The static-source fallback catches most of these but is
  a heuristic, not a proof.
- Some handlers intentionally only log because the rule is enforced elsewhere
  (e.g. `hBP01-009` art1 logs "target center only" — that target restriction
  is enforced by `ActionValidator`). Those still appear in the backlog;
  cross-check the effect text before assuming work is needed.
- `PASSIVE_EQUIP_IDS` is hand-maintained — keep it in sync with the `REGISTRY`
  constant in `web/game/core/AttachedSupportEffects.js` when adding new
  equipment effects.
