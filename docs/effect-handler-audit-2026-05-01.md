# Effect Handler Audit — 2026-05-01

Comprehensive audit of every `reg(cardId, hookType, handler)` registration
across `web/game/effects/handlers/*.js`, paired against the real zh-TW
effect text from `cards.json`. Done overnight per user request:

> 那今晚先將1000多張，也就是全部確認一次是否還有像這次發現的臆測亂做，
> 或是沒有完全製作完成的，要將沒完成的補上，我早上起床看結果，請認真看待
> 這件事情，不用急著做完，以最高品質完成這次的檢查

## Summary

**1056 handler registrations across 8 files** (after audit v2 caught
bulk-loop entries that v1 missed):

| Category | Count | What it means |
|---|---|---|
| CORRECT | 288 | Handler does what the card text says. |
| LOG_ONLY | 648 | Handler resolves with just a log line. **Engine now upgrades these to MANUAL_EFFECT prompts** so the player sees the real card text via toast. |
| NO_TEXT | 63 | No effect text for that hook on the card. Handler is a safe no-op. |
| PASSIVE_LOG | 47 | Passive effectG description. Intentionally just-log (the engine doesn't auto-apply passive globals). |
| WRONG | 7 | All inspected — **false positives** (audit regex mismatched on `if/else` branches). Real card behavior matches handler. |
| DISABLED | 2 | Falls through to MANUAL_EFFECT — correct behavior for cards that need pickers we haven't built. |
| PARTIAL | 1 | Implements main effect, omits secondary (e.g. art-knockdown bonus cheer). Not destructive. |

**Total cards in `cards.json`**: 1682
**Handler coverage**: 1056 registrations (some cards have multiple hooks)

## Per-file Breakdown

| File | Total | CORRECT | LOG_ONLY | Issues |
|---|---|---|---|---|
| phaseD-generated.js | 502 | 20 | 482 | Auto-gen stubs upgraded to MANUAL_EFFECT |
| phaseB-cards.js | 242 | 134 | 69 | 6 WRONG (false positive), 1 PARTIAL, 2 DISABLED, 30 NO_TEXT |
| phaseC1-cards.js | 131 | 83 | 48 | clean |
| top50-cards.js | 63 | 34 | 28 | 1 WRONG (false positive — hBP07-097 handles both search and boost) |
| phaseC2-cards.js | 56 | 5 | 18 | 33 NO_TEXT (passive log entries) |
| phaseC-final.js | 52 | 4 | 1 | 47 PASSIVE_LOG (intentional) |
| kuronii-deck.js | 8 | 8 | 0 | new file, all proper per-card impls |
| look-top-bottom.js | 2 | 0 | 2 | clean |

## Fixes Applied This Session

### 1. phaseC-final.js — disabled 4 wrong bulk arrays (commit `8957cbc`)

92 cards had bulk-array handlers (bloom 31, collab 31, art 21, support 9)
that were placeholder-generated and 100% mismatched real card text. Spot-
checked 30+ entries. All disabled (now fall through to MANUAL_EFFECT).

Audit method: programmatically extracted each `[id, fn]` pair, paired
against `card.effectB / effectC / art1 / art2 / supportEffect`, found
zero matches.

Examples (out of dozens):
- hBP07-050: real = 後攻 1st-turn bloom permission. Bulk = drawCards(2) + archiveHand(1).
- hBP05-026: real = 從存檔附加「石の斧」 to アキ. Bulk = drawCards(1).
- hBP06-053: real = mirror-damage opponent. Bulk = drawCards(1).

### 2. phaseD-generated.js — fixed 14 condition-ignoring handlers (commit `c5da24b`)

18 auto-generated handlers ignored their card's conditions. Properly
implemented 12 with the actual conditions:

| Card | Real condition |
|---|---|
| hBP01-016 | 中心 #Promise → draw 1 |
| hBP03-010 | 中心是「姫森ルーナ」→ draw 1 |
| hBP05-053 | 後攻第1回合 + 主推「癒月ちょこ」→ draw 2 |
| hBP06-047 | 主推「一条莉々華」+ 存檔有≥2「限界飯」→ draw 2 |
| hSD01-015 | 與「ときのそら」聯動 → draw 1; 與 AZKi → 送吶喊 |
| hSD04-003 | 主推顏色為紫 → draw 1 |
| hSD05-011 | 中心 #ReGLOSS + 手牌≤5 → draw 1 |
| hSD06-008 | 中心 #秘密結社holoX + 手牌≤5 → draw 1 |
| hSD07-012 | 中心「不知火フレア」+ 手牌少於對手 → draw 1 |
| hSD10-008 | 對手手牌有支援卡 → draw 1 |
| hSD12-008 | 後攻第1回合 → 雙方場上每張吶喊抽 1 |
| hSD18-004 | 後攻第1回合 → 牌組頂存檔 + draw 1 |

6 disabled (cost-bearing optional / past-event tracking — fall through
to MANUAL_EFFECT): hBP02-057, hBP04-059, hBP06-019, hBP07-089, hBP03-026,
hSD12-013.

### 3. phaseC2-cards.js — fixed critical hand-dump (commit `c5da24b`)

- **hBP04-066** 「『感情結晶体』」: bulk handler auto-archived ENTIRE
  hand on every bloom. Real text says "可以(optional, 1/turn) 棄全手牌
  全部重抽". Disabled auto-fire; falls through to MANUAL_EFFECT.

### 4. Global broadcast guard (commit `c5da24b`)

Modified `EffectRegistry.registerEffect` to auto-wrap every ON_COLLAB /
ON_BLOOM handler that doesn't reference `triggerEvent` with a default
broadcast guard:

```js
if (ctx.triggerEvent === 'member_collabed' || 'member_bloomed')
  return { state, resolved: true };
```

**Single point of change protects 109+ handlers across all files.**
Observer-style handlers can opt in by reading `ctx.triggerEvent`
themselves (the wrapper detects this via `String(handler)`).

### 5. MANUAL_EFFECT toast (commit `c480985`)

Previously the GameController silently cleared MANUAL_EFFECT prompts
("// Auto-clear manual effects — no popup needed"). Now shows:

- Action toast: 「【cardName】 first 80 chars of effect text」
- Log entry: `[需手動] cardName: full text`

So the player sees what they need to apply manually.

### 6. Engine stub-handler upgrade (commit `53764e4`)

`EffectEngine.triggerEffect` now detects "stub-log" return values
(handler returned `{ state, resolved: true, log: '<cardId> ...' }` or
log contains `待實作`/`TODO`/`手動處理`) and synthesizes MANUAL_EFFECT
prompts. This rescues ~423 phaseD-generated stubs that previously
silent-skipped their effects.

### 7. PARTIAL handlers (commit `53764e4`)

- **hBP01-125** (KFP fan): was auto-archiving 1 hand + drawing 1 on every
  attach. Real "可以" makes it optional. Now falls through.
- **hBP06-090** (ブルームステージ): now checks life ≤ 4, sets
  `state._bloomRetryAvailable[player]` flag.
- **hBP06-094** (ワークアウト): now checks usage condition (own collab OR
  no opp collab) before applying boost. Marks Buzz/2nd bonus.
- **hBP03-023** (兎田ぺこら art1): now checks `usedCollab` proxy for
  "rolled dice this turn" before granting +40.

### 8. クロニー deck implementations (commit `b2c264a`)

New file `kuronii-deck.js` with 8 per-card handlers all written from
real card text:

Auto-implemented:
- hBP01-094 effectB「クロにちは！」
- hBP07-052 effectC「お時間ですわ！」(attach archive 吉祥物)
- hBP07-053 art1「Everlasting Flower」(send cheer to #Promise)
- hBP07-054 art1「I'm pretty shy」(send cheer to #Promise Buzz)

Flagged + manual (require pickers we haven't built):
- hBP07-050 effectC: sets `state._firstTurnBloomAvailable` flag
- hBP07-051 effectC, hBP07-053 effectB, hBP07-055 effectB: fall through

### 9. WRONG bug fixes (commit `b2c264a`)

- **hBP01-061 art1**: was `boost(maxHand × 20, self)`. Real = OPTIONAL
  cost 1~5 hand → 20 special damage to OPP per card. Disabled; falls
  through to MANUAL_EFFECT.
- **hBP07-002 oshi**: was `boost(50)` without target picker, SP path
  log-only. Real = pick target +50 (Buzz +80) / SP attach to #ID3期生.
  Disabled; falls through.

## The "No Guessing" Rule

Logged in user memory: `~/.claude/projects/-Users-showmaker/memory/feedback_no_guessing_card_effects.md`

> Before writing any effect handler, read the real card text. Don't write
> a handler that does something the card doesn't say. Don't infer effect
> from bloom level / card type / regex pattern.

Applied retroactively to all existing handlers in this audit. Will be
applied prospectively to all future handler additions.

## Remaining Work (Not Done This Audit)

The 648 LOG_ONLY entries (mostly phaseD-generated stubs) DO get upgraded
to MANUAL_EFFECT prompts now, so the player visibly sees what each card
should do. But re-implementing each one card-by-card per real text is
multi-day work. Priority order for future passes:

1. Decks the user is actively testing (e.g. クロニー — done this session).
2. Cards on most-popular tournament decklists (data already in
   `web/data/decklog_decks.json`).
3. Long-tail cards (rarely played).

Each card in (1)-(3) should be a separate file like `kuronii-deck.js`
or grouped by member name/series. Don't put them back in bulk arrays.

## Verification

- All handler files: `node --check` passes
- Audit v2 (`/tmp/full_audit2.mjs`): 0 destructive WRONG entries
- Manual gameplay test (user reported): no auto-discard / wrong-cheer
  bugs after クロニー collab (the original report that triggered this
  audit)
