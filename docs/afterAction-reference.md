# afterAction Reference

**For handler authors writing card effects in `web/game/effects/handlers/`.**

When an effect handler returns `{ state, resolved: false, prompt: { ... } }`,
the engine displays a UI prompt for the player. Once the player picks, the
**afterAction** field on the prompt determines how the resolver processes
the selection.

This document catalogs all 36 afterActions implemented in
`web/game/core/EffectResolver.js`. Use it to find the right one for your
card's effect text instead of falling through to MANUAL_EFFECT.

---

## 1. Deck/hand basic ops

### `PLACE_AND_SHUFFLE` / `SEARCH_SELECT_PLACE`
Search deck → place selected card on backstage; shuffle deck.
**Prompt:** `{ type: 'SEARCH_SELECT_PLACE', cards: [...deck cards], maxSelect: 1 }`

### `SEARCH_SELECT` / `ADD_TO_HAND`
Search deck → move selected card to hand; reshuffle (unless `noShuffle: true`).
**Prompt:** `{ type: 'SEARCH_SELECT', cards: [...deck cards], maxSelect: 1-N }`
Multi-pick (maxSelect>1) re-emits with picked card removed.

### `RETURN_FROM_ARCHIVE` / `SELECT_FROM_ARCHIVE`
Return picked card from archive to hand.
**Prompt:** `{ type: 'SELECT_FROM_ARCHIVE', cards: [...archive cards], maxSelect: 1-N }`

### `HAND_TO_ARCHIVE`
Move picked hand card to archive (used by クロニー oshi etc.).
**Prompt:** `{ type: 'HAND_TO_ARCHIVE', cards: [...hand cards], maxSelect: 1 }`

### `ORDER_TO_BOTTOM`
Player picks ordering of cards to be placed at deck bottom (last picked = bottom).
**Prompt:** `{ type: 'ORDER_TO_BOTTOM', cards: [...remaining cards] }`

### `SEND_TO_ARCHIVE`
Move selected stage member to archive.
**Prompt:** `{ type: 'SEND_TO_ARCHIVE', cards: [...members], maxSelect: 1 }`

### `BLOOM_FROM_ARCHIVE`
Re-bloom a stage member from archive (used by 紫咲シオン effectB).
**Prompt:** with member + archive Debut details.

### `REVERT_TO_DEBUT`
Player picks an own member to revert to its Debut form (return bloom stack to archive).
**Prompt:** `{ type: 'REVERT_TO_DEBUT', cards: [...members], targetPlayer: idx }`

### `SCRY_PLACE_DECK` ★ Phase 2.4 #5
Look at top card → choose top or bottom. Player picks one of 2 synthetic option-cards
(instanceId -1 = top, -2 = bottom).
**Prompt:**
```js
{ type: 'CHOOSE_DECK_POSITION', cards: [/* -1 top option, -2 bottom option */],
  afterAction: 'SCRY_PLACE_DECK', scryCardInstanceId: <id of revealed card> }
```

### `PLACE_ON_STAGE` ★ Phase 2.4 #11
Place a member from archive or deck onto own backstage. Initializes
attached arrays + clears damage + sets `placedThisTurn`. Backstage cap (5) enforced.
**Prompt fields:** `cards`, `source: 'archive' | 'deck'`, `shuffleAfter: bool`

---

## 2. Damage / boost / heal

### `BOOST_PICKED_MEMBER`
Apply turn-scoped damage boost to picked member.
**Prompt fields:** `cards: [...members]`, `amount: N`, `bonusFor: { tag: '#X', requireBloom: '?', bonus: M }` (optional)

### `HEAL_PICKED_MEMBER`
Heal picked member by `amount` HP.
**Prompt fields:** `cards: [...damaged members]`, `amount: N`

### `OPP_MEMBER_DAMAGE`
Player picks opp member to receive `damageAmount` special damage. Triggers post-damage
sweep for knockouts. Doesn't cost life unless `causeLifeLoss: true`.
**Prompt:** `{ type: 'SELECT_TARGET', cards: [...opp members], damageAmount: N }`

### `REDUCE_COLORLESS_PICKED_MEMBER` ★ Phase 2.4 #16
Apply turn-scoped colorless cheer-cost reduction to picked member's arts.
Sets `state._artColorlessReductionByInstance[player][instanceId]`.
**Prompt fields:** `amount: N`, `bonusName: '...'`, `bonusBloom: '?'`, `bonusReduction: M`

### `LIFE_CHEER`
Defender picks own member to attach revealed life cheer cards.
**Prompt fields:** `cheerInstances: [...]`

---

## 3. Cheer manipulation

### `CHEER_MOVE`
Move a cheer between own members. Source picker is implicit (resolver picks).
**Prompt fields:** `cards: [...candidate targets]`, `sourceInstanceId`, `cheerPredicate: 'any' | 'color'`

### `CHEER_MOVE_TWO_STEP_PICK_SOURCE` / `CHEER_MOVE_TWO_STEP_PICK_TARGET`
Two-step cheer move with explicit source picker first.
Step 1: pick source member; resolver queues step 2 with target options.

### `CHEER_FROM_ARCHIVE_TO_MEMBER`
Pick cheer card from archive, then attach to a target member (from `prompt.targets`).
**Prompt fields:** `cards: [...archive cheers]`, `targets: [...members]`

### `CHEER_FROM_DECK_TOP_TO_MEMBER`
Cheer top of cheer-deck → picked member.
**Prompt:** `{ type: 'SELECT_OWN_MEMBER', cards: [...members], maxSelect: 1 }`

### `CHEER_DECK_REVEAL_MATCH_TO_MEMBER`
Reveal top cheer; if matches predicate, attach to picked member; else discard.

### `CHEER_FROM_ARCHIVE_TO_CHEERDECK` ★ Phase 2.4 #10
Return cheer(s) from archive to cheer deck (and shuffle on final pick).
Supports maxSelect>1.

### `MULTI_DISTRIBUTE_CHEER` ★ Phase 2.4 #13
Distribute 1 cheer per picked member, drawing from archive or cheer deck.
Re-emits up to `maxSelect`. Optional `sourceFilter: { color: '綠' }`.

---

## 4. Support card manipulation

### `ATTACH_SUPPORT`
Attach a support card to picked member.
**Prompt:** `{ type: 'ATTACH_SUPPORT', cards: [...members], supportCardInstanceId }`

### `SUPPORT_MOVE`
Move a support card from one member to another.
**Prompt fields:** `sourceInstanceId`, `supportIndex`, `cards: [...target members]`

### `ATTACH_FROM_ARCHIVE_TO_MEMBER`
Pick support card from archive → attach to fixed `prompt.targetInstanceId`.

### `PICK_MASCOT_SOURCE` ★ Phase 2.4 #14
2-step: pick source member with mascot → queue SUPPORT_MOVE for target.
**Prompt fields:** `cards: [...mascot-bearing members]`, `targetFilter: 'mascot_excluded' | undefined`

---

## 5. Cost-bearing afterActions (cost + benefit)

### `ARCHIVE_OWN_CHEER_THEN_DMG` ★ Phase 2.4 #1-3
Archive picked cheer (from any own stage member) as cost; then apply special
damage per `damageTarget`. Supports maxSelect>1 (multi-cost cheers).
**Prompt fields:**
- `cards: [...stage cheer instances]`
- `damageAmount: N`
- `damageTarget: 'opp_center' | 'opp_collab' | 'opp_center_or_collab' | 'opp_pick' | 'opp_center_AND_pick_backstage' | 'none'`
- `followupSearch: { type: 'SEARCH_SELECT', ... }` (optional, queued post-damage)

### `ARCHIVE_HAND_THEN_OPP_DMG` ★ Phase 2.4 #6
Archive picked hand card(s) as cost; then apply special damage. Supports
`perCardScaling: true` (each archived hand triggers another damage hit).

### `ARCHIVE_HAND_THEN_BOOST` ★ Phase 2.4 #7
Archive picked hand card as cost; then apply turn-boost.
**Prompt fields:** `boostAmount`, `boostTarget: 'self_center' | 'self_collab' | 'pick_member'`,
`tagFilter: '#X'` (optional, only for pick_member)

### `ARCHIVE_HAND_THEN_DRAW_N`
Archive 1+ hand cards (via `selected.instanceIds[]`); draw N where N = archived count.

### `ARCHIVE_HAND_TAGSHARE_DRAW` ★ Phase 2.4 #8
Archive 2 hand cards that share ≥1 tag, then draw N. Re-emits with tag-filtered
candidates after first pick.

### `RETURN_DEBUT_TO_DECK_BOTTOM`
Return picked Debut from backstage to deck bottom (clears attached + damage).
Optional `thenDrawN` for follow-up draw.

### `RETURN_TO_HAND_FROM_BLOOM_STACK`
Pop bloom stack of picked member back to hand. Optional `takeAll: true` or
`takeN: N`.

---

## 6. Member positioning / state

### `OPP_CENTER_BACKSTAGE_SWAP` ★ Phase 2.4 #15
Swap opp center with picked opp backstage. Optional follow-up draw if own
center matches `drawIfOwnCenterName`.

---

## 7. Misc

### `DICE_BRANCH_PROMPT`
Player chooses to roll or skip. If roll, engine rolls and stashes
`state._lastDiceResult`. Handler can then dispatch on the result.

---

## ★ Phase 2.4 additions summary (2026-05-01)

11 new afterActions added in Phase 2.4:

| # | afterAction | Cards using it |
|---|---|---|
| #1-3 | `ARCHIVE_OWN_CHEER_THEN_DMG` (incl. multi-cost re-emit) | hBP05-028, hBP03-019, hBP03-021 art1, hBP06-078, hBP02-041, hBP05-043, hSD03-006, hSD03-009 |
| #5 | `SCRY_PLACE_DECK` | hBP05-068 |
| #6 | `ARCHIVE_HAND_THEN_OPP_DMG` | hSD02-006, hSD02-008, hSD02-009, hBP07-067 |
| #7 | `ARCHIVE_HAND_THEN_BOOST` | hBP06-034, hBP02-055 |
| #8 | `ARCHIVE_HAND_TAGSHARE_DRAW` | hBP02-057 |
| #10 | `CHEER_FROM_ARCHIVE_TO_CHEERDECK` | hBP01-100 |
| #11 | `PLACE_ON_STAGE` | hSD15-007, hSD19-004 |
| #13 | `MULTI_DISTRIBUTE_CHEER` | hSD19-001 SP, hBP03-021 effectB |
| #14 | `PICK_MASCOT_SOURCE` 2-step | hBP02-012 effectB |
| #15 | `OPP_CENTER_BACKSTAGE_SWAP` | hBP05-004 SP |
| #16 | `REDUCE_COLORLESS_PICKED_MEMBER` | hBP07-022 art1 multi-pick |

Engine improvements (no new afterAction, but new mechanism):
- #4: `preventDamage` observer chain in DamageCalculator (3 cards)
- #9: `_activityTagsPlayedThisTurn` / `_activityNamesPlayedThisTurn` (3 cards)
- #12: Look-N-pick-1-reorder via existing `remainingCards` chain (2 cards)
- #17: `ON_SUPPORT_ATTACH` engine hook (1 card)
- #18: Targeting redirection in ActionValidator (1 card)

Plus 6 cards converted from MANUAL → SELECT_TARGET pickers in the same window.

---

## Common patterns

### Auto-pick when only 1 candidate
```js
if (candidates.length === 0) return { state, resolved: true, log: '無候選' };
if (candidates.length === 1) {
  // auto-apply directly
  return { state, resolved: true, ... };
}
// emit picker for multi-candidate case
return { state, resolved: false, prompt: { ... } };
```

### Broadcast guard for ON_BLOOM / ON_COLLAB
```js
if (ctx.triggerEvent && ctx.triggerEvent !== 'self') return { state, resolved: true };
```

### Once-per-turn / once-per-game
```js
state.players[ctx.player]._oncePerTurn = state.players[ctx.player]._oncePerTurn || {};
if (state.players[ctx.player]._oncePerTurn['<cardId>_<effect>']) return { state, resolved: true, log: '本回合已使用' };
state.players[ctx.player]._oncePerTurn['<cardId>_<effect>'] = true;
```

### Optional cost-bearing effect
Always use a picker afterAction (don't auto-spend resources). The patterns
in section 5 cover most cost shapes.
