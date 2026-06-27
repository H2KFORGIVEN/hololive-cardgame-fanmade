# Card-ID Integrity Audit

Cross-checks every `reg(cardId, HOOK)` call site in the handler files against
the canonical `web/data/cards.json` database.

## Why

A LLM-authored bulk dump (initial `phaseC2-cards.js`) registered handlers
against a fabricated card list — wrong IDs, wrong card names, wrong card
types. Some of those handlers actually misbehaved at runtime (e.g. attaching
+50 art damage to a Debut card via the wrong ID).

This script is the static check that prevents that class of regression.

## What it detects

| Class | Description | Example |
|---|---|---|
| **A. NotInDB** | `cardId` doesn't exist in `cards.json` | `reg('hBP04-107', ...)` when DB only has `hBP04-001..106` |
| **B. HookTypeMismatch** | Member-only hook on a support card | `reg('hBP02-094', HOOK.ON_ART_DECLARE, ...)` where hBP02-094 is a 支援・吉祥物 |
| **C. CommentNameDrift** | `// hBPxx-xxx CARDNAME ...` comment claims a name that doesn't match the card's actual name | `// hBP04-082 ラプラス` when hBP04-082 is actually 夏色まつり |

## Whitelist

Some legitimate patterns register member-only hooks on support cardIds — these
are explicitly listed in `WHITELIST` inside `audit.mjs` with comments
explaining the reason (e.g. I-2 `attached_support_wearer_knocked` engine
broadcast).

**Add to whitelist sparingly** — only for documented engine broadcasts that
specifically key on a support's cardId. Never to suppress real bugs.

## Run

```bash
node tools/audit-cardids/audit.mjs
```

Exit code:
- `0` — clean (or only whitelisted findings)
- `1` — at least one un-whitelisted issue (CI fails)

## Wire into pre-commit

Add to `.git/hooks/pre-commit` (or use husky):

```bash
node tools/audit-cardids/audit.mjs || {
  echo "Card-ID audit failed. Fix or whitelist the listed issues first."
  exit 1
}
```
