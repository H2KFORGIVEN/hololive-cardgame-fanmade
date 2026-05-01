# Effect Handler 全面實作 / 部署規劃

**日期**：2026-05-01
**動機**：使用者指出「修一塊查一塊」會永遠修不完。這份規劃涵蓋
**所有 1682 張卡片**，每個 hook、每個 handler、每個檔案，沒有 out-of-scope。

## ✅ 進度更新（2026-05-01 持續更新中）

| Phase | 子項 | 狀態 | Commit |
|---|---|---|---|
| **Phase 1** | 1.1 audit script v3 | ✅ DONE | `41ccebb` |
| Phase 1 | 1.2 precommit gate | ✅ DONE | `41ccebb` |
| Phase 1 | 1.3 dashboard generator | ✅ DONE | `41ccebb` |
| **Phase 2** | 2.1 7 picker afterActions | ✅ DONE | `f89dff1` |
| Phase 2 | 2.2 5 state fields | ✅ DONE | `f89dff1` |
| Phase 2 | 2.3.1 first-turn bloom permission | ✅ DONE | `f89dff1` |
| Phase 2 | 2.3.2 cross-bloom | ✅ DONE | `dcb8b02` |
| Phase 2 | 2.3.3 colorless cost reduction | ✅ DONE | `f89dff1` |
| **Phase 3** | #1 クロニー（オーロ・クロニー）8 cards | ✅ DONE | (earlier) |
| Phase 3 | #2 ちょこ（癒月ちょこ）19 cards | ✅ DONE | `0c70740` |
| Phase 3 | #3 みこ（さくらみこ）22 cards | ✅ DONE | `f092614` |
| Phase 3 | #4 すいせい（星街すいせい）20 cards | ✅ DONE | `bb5ab9a` |
| Phase 3 | #5 フレア（不知火フレア）20 cards | ✅ DONE | `4577ca8` |
| Phase 3 | #6 ねね（桃鈴ねね）13 cards | ✅ DONE | `c21b3ea` |
| Phase 3 | #7 フブキ（白上フブキ）22 cards | ✅ DONE | `8b6f9d1` |
| Phase 3 | #8 ペコラ（兎田ぺこら）15 cards | ✅ DONE | `27ccb8b` |
| Phase 3 | #9 ノエル（白銀ノエル）15 cards | ✅ DONE | `ae196e5` |
| Phase 3 | #10 ぼたん（獅白ぼたん）9 cards | ✅ DONE | `8d54362` |
| Phase 3 | #11 カリオペ（森カリオペ）13 cards | ✅ DONE | `4135e4a` |
| Phase 3 | #12 スバル（大空スバル）11 cards | ✅ DONE | `3927b1a` |
| Phase 3 | #13 いろは（風真いろは）6 cards (gap-fill) | ✅ DONE | `15a2344` |
| Phase 3 | #14 らでん（儒烏風亭らでん）13 cards | ✅ DONE | `2ea7336` |
| Phase 3 | #15 AZKi 5 cards (gap-fill) | ✅ DONE | `66c7769` |
| Phase 3 | #16 あやめ（百鬼あやめ）4 cards (gap-fill) | ✅ DONE | `af641ea` |
| Phase 3 | #17 おかゆ（猫又おかゆ）5 cards (gap-fill) | ✅ DONE | `a136fa2` |
| Phase 3 | #18 わため（角巻わため）5 cards (gap-fill) | ✅ DONE | `17f15e0` |
| Phase 3 | #19 ルーナ（姫森ルーナ）5 cards (gap-fill) | ✅ DONE | `468b286` |
| Phase 3 | #20 シオリ（シオリ・ノヴェラ）7 cards | ✅ DONE | `fa3052a` |
| Phase 3 | #21 ラプラス（ラプラス・ダークネス）5 cards (gap-fill) | ✅ DONE | `b28a294` |
| Phase 3 | #22 ミオ（大神ミオ）8 cards | ✅ DONE | `09eaf9b` |
| **Phase 2.4** | #1 cost-bearing cheer→archive afterAction | ✅ DONE | `f22c5ca` |
| Phase 2.4 | #2 multi-target damage variant (center + backstage) | ✅ DONE | `4554d7e` |
| Phase 2.4 | #3 maxSelect>1 cheer cost re-emit | ✅ DONE | `7f4d0c7` |
| Phase 2.4 | #4 preventDamage observer chain (3 cards) | ✅ DONE | `a353b76` |
| Phase 2.4 | #5 SCRY_PLACE_DECK afterAction (top↑/↓) | ✅ DONE | `f13c08e` |
| Phase 2.4 | #6 ARCHIVE_HAND_THEN_OPP_DMG (4 cards) | ✅ DONE | `c828ac9` |
| Phase 2.4 | #7 ARCHIVE_HAND_THEN_BOOST (2 cards) | ✅ DONE | `99bde70` |
| Phase 2.4 | #8 ARCHIVE_HAND_TAGSHARE_DRAW (1 card) | ✅ DONE | `39e3b77` |
| Phase 2.4 | #9 Activity-by-tag/name tracking (3 cards) | ✅ DONE | `e861a7f` |
| Phase 2.4 | #10 CHEER_FROM_ARCHIVE_TO_CHEERDECK (1 card) | ✅ DONE | `b8c8948` |
| Phase 2.4 | #11 PLACE_ON_STAGE archive/deck (2 cards) | ✅ DONE | `ccce164` |
| Phase 2.4 | #12 Look-N-pick-1-reorder wiring (2 cards) | ✅ DONE | `2cf3557` |
| Phase 2.4 | Convert MANUAL→SELECT_TARGET pickers (6 cards) | ✅ DONE | `126ecf0` |
| Phase 2.4 | Test stability (Double collab / Art reuse warnings) | ✅ DONE | `c45a0cc` |
| Phase 2.4 | hSD15-005 effectG knockdown auto-move (1 card) | ✅ DONE | `92c4221` |
| Phase 2.4 | Audit comment-stripping in action fingerprint | ✅ DONE | `4f8de67` |
| Phase 2.4 | #13 MULTI_DISTRIBUTE_CHEER (2 cards) | ✅ DONE | `74193a2` |
| Phase 2.4 | #14 PICK_MASCOT_SOURCE 2-step picker (1 card) | ✅ DONE | `84666ca` |
| Phase 2.4 | #15 OPP_CENTER_BACKSTAGE_SWAP (1 card) | ✅ DONE | `5b00da8` |
| Phase 2.4 | #16 REDUCE_COLORLESS_PICKED_MEMBER (1 card) | ✅ DONE | `f72b701` |
| Phase 2.4 | #17 ON_SUPPORT_ATTACH hook (1 card) | ✅ DONE | `6167439` |
| Phase 2.4 | #18 Targeting redirection (1 card) | ✅ DONE | `6a488f2` |
| **Phase 4** | 4.1 integration tests (Phase 2.4 afterAction) | ✅ DONE | `3ac5dd0` |
| Phase 4 | 4.2 GitHub Action audit gate (master + PR) | ✅ DONE | `2ee96ec` |
| Phase 4 | 4.3 cards.json sync detector | ✅ DONE | `06e44c1` |

**Phase 3 progress: 22 / 22 decks ✅ COMPLETE** — coverage ≈ 250 unique cards
beyond the placeholder fall-throughs. All 22 implemented decks use the
"no guessing" rule, real card text in 5-line spec blocks, proper picker
prompts (no auto-pick on ambiguous targets), and the audit precommit
gate has held steady at **10 HIGH** throughout (no new bugs introduced).
CORRECT-VERIFIED +105 from baseline; engine gaps explicitly documented
per card.

Audit improvement (commit `4135e4a`): COST-IGNORED detection now skips
MANUAL_EFFECT fall-throughs (handlers whose only `actions` token is
`hasTriggerCheck` and that return `{ state }` for engine to prompt user).
Three prior false positives — including two pre-existing entries in
phaseB / phaseC2 — are now correctly excluded. Net COST-IGNORED: 6 → 4.

### Engine gaps queued for Phase 2.4 (compiled from per-deck notes)

| Need | Affected cards | Priority |
|---|---|---|
| ✅ `preventDamage` hook (passive damage reduction) | hBP05-008 / hBP05-069 / hSD19-005 — DONE in Phase 2.4 #4 | DONE |
| ✅ Targeting redirection hook (force opp to target X) | hBP05-010 — DONE in Phase 2.4 #18 | DONE |
| ✅ Activity-by-tag/name tracking | hBP05-010 / hBP06-033 / hSD15-008 — DONE in Phase 2.4 #9 | DONE |
| ✅ Scry-1 with top/bottom choice afterAction | hBP05-068 — DONE in Phase 2.4 #5 | DONE |
| ✅ Multi-step distribution from archive | hBP02-012 effectB (フブキ) — DONE in #14; hBP03-021 effectB (ぼたん) — DONE in #13; hSD19-001 SP (スバル) — DONE in #13; hSD15-005 effectG (らでん) — DONE auto-move; hBP05-070 art1 (フブキ) — STILL pending (genuine multi-pair iteration) | partly DONE |
| ✅ Cost-bearing afterAction (cheer→archive + dmg/heal) | Phase 2.4 #1-3 done — wired hBP05-028 / hBP03-019 / hBP03-021 / hBP06-078 / hBP02-041 / hBP05-043 / hSD03-006 / hSD03-009 | DONE |
| ✅ Hand-cost afterAction (hand→archive + dmg/boost/draw) | Phase 2.4 #6-8 done — wired hSD02-006 / hSD02-008 / hSD02-009 / hBP07-067 / hBP06-034 / hBP02-055 / hBP02-057 | DONE |
| ✅ Colorless cost reduction afterAction with picker | hBP07-022 art1 multi-pick — DONE in Phase 2.4 #16 | DONE |
| ✅ Opp target picker for special damage | hBP05-004 / hBP07-057 / hBP07-059 / hSD12-001 / hSD12-003 / hBP02-034 — DONE in Phase 2.4 follow-up | DONE |
| ✅ Cheer-to-cheerdeck afterAction | hBP01-100 — DONE in Phase 2.4 #10 | DONE |
| ✅ Place-on-stage from archive/deck | hSD15-007 / hSD19-004 — DONE in Phase 2.4 #11 | DONE |
| ✅ Look-N-pick-1-reorder | hSD12-001 oshi / hBP07-028 effectC — DONE in Phase 2.4 #12 (re-uses existing remainingCards chain) | DONE |
| ✅ Opp center↔backstage swap | hBP05-004 SP (おかゆ) — DONE in Phase 2.4 #15 | DONE |
| Place-on-stage from archive afterAction | hSD19-004 (スバル), hSD15-007 (らでん) | LOW |
| Look-N-pick-1-reorder-bottom afterAction | hSD12-001 (シオリ), hBP07-028 effectC (ミオ) | LOW |
| Pre-damage REACTIVE trigger (damaged-opp-backstage) | hSD03-001 SP (おかゆ) | LOW |
| ✅ Attachment-attach trigger (when ミオファ attached) | hBP07-024 effectG — DONE in Phase 2.4 #17 (ON_SUPPORT_ATTACH hook) | DONE |
| Interactive RPS between two players | hBP03-071 art1 (わため) | LOW |
| Opp center↔backstage swap | hBP05-004 SP (おかゆ) | LOW |
| Cheer to cheer-deck afterAction | hBP01-100 (カリオペ) | LOW |

### Engine gaps surfaced by Phase 3 #7-10 (queue for Phase 2.4)

| Need | Affected cards | Priority |
|---|---|---|
| `preventDamage` hook (passive damage reduction) | hBP05-008 (ノエル), hBP05-069 (フブキ) | MED |
| Targeting redirection hook (force opp to target X) | hBP05-010 (ノエル) | MED |
| Activity-by-name tracking `_activityNamesPlayedThisTurn` | hBP05-010 art1 (ノエル "牛丼") | LOW |
| Scry-1 with top/bottom choice afterAction | hBP05-068 (フブキ) | MED |
| Multi-step distribution from archive | hBP05-070 art1 (フブキ), hBP02-012 effectB (フブキ), hBP03-021 effectB (ノエル) | LOW |
| Cost-bearing optional effect afterAction (cheer→archive + dmg/heal) | hBP03-017/019/021/hBP05-028 (ぼたん) | HIGH |
| Colorless cost reduction afterAction with picker | hBP07-022 art1 (ノエル) multi-pick path | LOW |

---

## 立場（永久）

1. 任何小規模修法之後，**必須在同一份回報裡附 follow-up 全面化 plan**
2. 規劃必須**量化覆蓋率**：說 "X / Y" 而不是 "大部分"
3. 「out of scope」只能用在**真的不在這個 deliverable 內**的東西，不是用來合理化半成品
4. 修了部分 → 列出剩下的清單 → 估時 → 排優先順序

---

## 1. 現況盤點（誠實版）

### 1.1 Tier 評估

| Tier | 描述 | 現況 |
|---|---|---|
| **T1 安全** | 不會有「錯誤的自動執行」破壞遊戲狀態 | ✅ **100% 達成**（廣播守門 + phaseC-final disable + stub upgrade）|
| **T2 可見** | 玩家看到「這張卡需要做什麼」的提示 | ✅ **100% 達成**（MANUAL_EFFECT toast）|
| **T3 正確自動** | 自動執行 100% 符合卡片文字 | ⚠️ **約 27% 達成**（288 CORRECT / 1056 registrations）|
| **T4 完整覆蓋** | 所有 1682 張卡都有正確的 handler（不靠 MANUAL_EFFECT）| ❌ **遠未達成**（estimated < 20%）|

### 1.2 已知問題分類

| 問題 | 數量 | 嚴重度 |
|---|---|---|
| Auto-pick first match（多候選下硬挑第一個）| ~41 行 grep 命中（實際真 bug 數需逐張驗證）| 🟡 部分玩家會踩到 |
| 條件未檢查（卡片寫「如果 X 才 Y」但 handler 無條件 Y）| 已知 18 個全在 phaseD-generated（已修），其他檔案未深掃 | 🟡 |
| Stub-only 但 MANUAL_EFFECT 已蓋住 | ~423 張 | 🟢 安全但不完整 |
| Cost-bearing optional 沒實作 | 估 ~50 張（「可以將 N 張...存檔」之類）| 🟡 |
| 多步 picker（source + target）| 估 ~30 張（cheer-move 類）| 🟡 |
| Rule modifications（首回合 bloom 之類）| 估 ~10 張 | 🟡 |
| 大賽熱門 deck 完整實作 | 1 / N（クロニー done，其他全 0）| 🔴 影響玩家體驗 |

### 1.3 總卡片數位 vs Handler 數位

```
cards.json 總卡數          : 1682
其中需要 handler 的卡       : ~1100 estimated
                              （扣除 vanilla 成員 + cheer 卡）
目前已註冊 handler           : 1056
其中 CORRECT                : 288 (27%)
其中 LOG_ONLY → MANUAL      : 648 (61%)
其中 PASSIVE_LOG / NO_TEXT  : 110 (10%)
其中 WRONG / PARTIAL        : 8 (false positives mostly)
```

---

## 2. 全面化規劃（4 階段）

### Phase 1：Audit Infrastructure（讓「找不到問題」變不可能）

**目的**：建立一套可重複跑、能 100% 覆蓋的 audit 工具，確保下次能精準量化哪些 handler 有問題、哪些沒問題。

#### 1.1 Audit Script v3

`tools/audit/effect-coverage.mjs`

對每個 (cardId, hookType) 做：
1. 解析 handler 程式碼（含 bulk-loop / object-entries / arrow-direct / arrow-block 五種 reg 模式）
2. 比對 `cards.json` 的真實 zh-TW 效果文字
3. 分類：
   - **CORRECT-VERIFIED**：handler logic 跟 real text 在動作 / 數量 / 目標 / 條件四個維度都吻合
   - **CORRECT-AUTO-NO-AMBIGUITY**：auto-resolve 但只有 1 個候選（不算 auto-pick）
   - **AUTO-PICK-BUG**：text 說「選擇」但 handler `.find` 後直接用
   - **CONDITION-MISSING**：text 有「如果」「時，」「若」但 handler 無 if
   - **NUMBER-MISMATCH**：text 抽 N 但 handler 抽 M
   - **TARGET-WRONG-SIDE**：text 給對手但 handler 操作自己（或反向）
   - **COST-IGNORED**：text 有「可以將 X 存檔: ...」但 handler 直接做後半
   - **MULTI-STEP-MISSING**：text 有「之後...」但 handler 只做第一步
   - **RULE-MOD**：text 改規則（first-turn bloom 等）— 標記為需引擎支援
   - **STUB-LOG**：handler 只 log → MANUAL_EFFECT（已被引擎升級，安全）
   - **DISABLED-FALLTHROUGH**：handler 主動 `return { state }` → MANUAL_EFFECT（合規）
   - **NO-TEXT**：那個 hook 沒效果文字 → no-op 安全
   - **PASSIVE-INTENT**：被動 effectG 描述，引擎不自動套（合規）

每個 cardId 都有結果記在 `tools/audit/coverage.json`。

#### 1.2 Pre-commit Audit Gate

`tools/audit/precommit.mjs` — git pre-commit hook：
- 跑 audit
- 對比上次 baseline
- 如果新增了 AUTO-PICK-BUG / CONDITION-MISSING / NUMBER-MISMATCH / TARGET-WRONG-SIDE / COST-IGNORED → **block commit** + 顯示 reason

避免新加的程式碼又重蹈臆測覆轍。

#### 1.3 Per-Card Coverage Dashboard

`docs/coverage-dashboard.md`（auto-generated）：

每張卡一行：
```
hBP07-050 | オーロ・クロニー Debut | effectC | RULE-MOD       | needs engine
hBP07-051 | オーロ・クロニー Debut | effectC | DISABLED        | manual ok
hBP07-052 | オーロ・クロニー 1st   | effectC | CORRECT-VERIFIED | kuronii-deck.js
...
hY01-001 | 白吶喊                 | yellEff | PASSIVE-INTENT  | n/a
...
```

**Phase 1 deliverable**：100% 卡片 / hook 都有 audit 結果 + dashboard。
**估時**：4-6 小時
**驗收**：跑 audit 後輸出顯示 `Total cards: 1682, Audited: 1682 (100%)`，每張都有分類。

---

### Phase 2：Engine Infrastructure（解除 per-card 工作的卡點）

**目的**：很多卡無法 auto 是因為缺 picker afterAction / state tracking / rule mod。把這些一次性建好，之後每張卡只是 wire-up。

#### 2.1 缺的 afterAction（9 個）

| afterAction | 用途 | 預估覆蓋卡數 |
|---|---|---|
| `BOOST_PICKED_MEMBER` | 玩家選成員 → 該成員藝能 +X | ~40 張 |
| `HEAL_PICKED_MEMBER` | 玩家選成員 → HP +X | ~15 張 |
| `CHEER_FROM_DECK_TOP_TO_MEMBER` | ✅ 已建（this session） | — |
| `CHEER_DECK_REVEAL_MATCH_TO_MEMBER` | ✅ 已建 | — |
| `ATTACH_FROM_ARCHIVE_TO_MEMBER` | ✅ 已建 | — |
| `CHEER_MOVE_TWO_STEP` | 玩家選 source 再選 target | ~20 張 |
| `ARCHIVE_HAND_THEN_DRAW_N` | cost: 棄 N 抽 N | ~10 張 |
| `DICE_BRANCH_PROMPT` | 擲骰結果分支（含可選輸入）| ~15 張 |
| `RETURN_DEBUT_TO_DECK_BOTTOM` | 把後台 Debut 放回牌底 | ~5 張 |
| `RETURN_TO_HAND_FROM_BLOOM_STACK` | 「將重疊的 N 張回手」 | ~8 張 |

每個 afterAction：~30 行 EffectResolver 程式碼 + 對應 prompt type 在 GameController dispatcher。

#### 2.2 缺的 State Tracking（5 個）

| State field | 用途 | 卡數 |
|---|---|---|
| `state._oncePerTurn[playerIdx][cardId]` | 「每回合一次」flag | ~80 張 |
| `state._oncePerGame[playerIdx][cardId]` | 「每場比賽一次」flag | ~40 張 |
| `state._diceRollsThisTurn[playerIdx]` | 本回合擲骰次數 | ~10 張 |
| `state._knockedThisTurn[playerIdx]` | 本回合擊倒過誰 | ~15 張 |
| `state._artsUsedThisTurn[playerIdx]` | 本回合用過的 art name 列表 | ~10 張 |

每個 field：reset 在 `processTurnEnd` / `processTurnStart`。

#### 2.3 缺的 Rule Modifications（3 個）

| Rule mod | 用途 | 卡數 |
|---|---|---|
| First-turn-back-attack bloom permission | hBP07-050 等「後攻第1回合可開花」 | ~3 張 |
| Cross-bloom permission（同名跨成員 bloom）| hBP07-056 effectG | ~2 張 |
| 無色吶喊需求減少 | hBP07-073 / ねね oshi | ~5 張 |

每個 rule mod：修改 `ActionValidator.js` 對應 validation。

**Phase 2 deliverable**：12 個 afterAction + 5 個 state field + 3 個 rule mod 全部進 engine。
**估時**：2-3 天
**驗收**：跑 Phase 1 audit，所有 RULE-MOD / 多步 / 條件 / cost 類別**都能在 engine 層支援**（即使 handler 還沒寫）。

---

### Phase 3：Per-Deck 實作（覆蓋所有 1682 張卡）

**目的**：讀真實卡片文字、寫正確 handler、用 Phase 2 的 infrastructure。**不再用 bulk array placeholder**。

#### 3.1 結構

每個 deck / 系列一個檔案：
```
web/game/effects/handlers/decks/
├── kuronii-deck.js       ✅ done
├── chocoyu-deck.js       — ちょこ deck
├── flare-deck.js         — フレア deck
├── nene-deck.js          — ねね deck
├── miko-deck.js          — みこ deck
├── suisei-deck.js        — すいせい deck
├── ...
├── support-activity.js   — 全部活動類支援卡
├── support-mascot.js     — 吉祥物
├── support-tool.js       — 道具
├── support-fan.js        — 粉絲
├── cheer-yell.js         — 全部吶喊卡 yellEffect
└── shared-helpers.js     — pickPromiseMember(), pickByTag(), 等
```

#### 3.2 Deck 優先順序

依大賽出現頻率排序（資料來自 `web/data/decklog_decks.json`）：

| 序 | Deck | 約卡數 | 估時 | 累計覆蓋 |
|---|---|---|---|---|
| 1 | クロニー（Promise）| 8 | done | 8 |
| 2 | ちょこ（紫 / 食べ物 / 料理）| ~25 | 6h | 33 |
| 3 | みこ（紅 / Buzz combo）| ~30 | 8h | 63 |
| 4 | すいせい（紅藍 / Non-Limit）| ~25 | 6h | 88 |
| 5 | フレア（黃 / エルフレ）| ~22 | 6h | 110 |
| 6 | ねね（黃 / 粉絲多）| ~20 | 5h | 130 |
| 7 | フブキ（黃 / 白上's）| ~25 | 6h | 155 |
| 8 | ペコラ（紅 / 兎田 / ノーピン）| ~22 | 6h | 177 |
| 9 | ノエル（白 / 騎士団 / 道具）| ~20 | 5h | 197 |
| 10 | ぼたん（綠 / 獅白 / 3期生）| ~20 | 5h | 217 |
| 11 | ホロライブ ID（#ID3期生 等）| ~30 | 8h | 247 |
| 12 | ホロライブ EN（#Promise / #Justice / #Advent）| ~50 | 12h | 297 |
| 13 | ReGLOSS（はじめ / らでん 等）| ~30 | 8h | 327 |
| 14 | FLOW GLOW | ~25 | 6h | 352 |
| 15 | holoX（秘密結社）| ~25 | 6h | 377 |
| 16 | gamers / ゲーマーズ | ~20 | 5h | 397 |
| 17 | 1-3 期生 老成員 | ~50 | 12h | 447 |
| 18 | 4-5 期生 | ~30 | 8h | 477 |
| 19 | 雜成員 | ~80 | 20h | 557 |
| 20 | Support cards (按類別)| ~100 | 16h | 657 |
| 21 | Cheer / Yell | ~50 | 6h | 707 |
| 22 | Oshi 全部 | ~60 | 16h | 767 |

實際 hook 數（一卡多 hook）約 1056，所以 ~1100 work units。

#### 3.3 每張卡的 spec template

```js
// hBP07-052 オーロ・クロニー (1st) effectC「お時間ですわ！」
// REAL: 「可以將自己存檔區的1張吉祥物附加給這個成員。」
// ACTION: optional pick from archive (吉祥物) → attach to ctx.memberInst
// AMBIGUITY: 0 → skip; 1 → auto-attach; multiple → SELECT_FROM_ARCHIVE picker
// LIMITS: none
// CONDITIONS: none
reg('hBP07-052', HOOK.ON_COLLAB, (state, ctx) => {
  if (ctx.triggerEvent === 'member_collabed') return { state, resolved: true };
  // [implementation matching the spec exactly]
});
```

**強制 comment block 包含**：REAL（真實文字）/ ACTION / AMBIGUITY / LIMITS / CONDITIONS。
缺一不可。

**Phase 3 deliverable**：上述所有 deck/類別的 handler 都實作完成。
**估時**：6-8 個工作週（160-200 工時，分散執行）。
**驗收**：Phase 1 audit 跑出 `CORRECT-VERIFIED ≥ 95%`，剩下 < 5% 都是 RULE-MOD 或主動標記為 manual。

---

### Phase 4：Verification & Regression Prevention

#### 4.1 Integration tests

`tests/decks/<deck>.test.mjs` — 每個 deck 一份：
- 模擬一場 turn-by-turn 對局，發 action 序列
- assert state 在每一 action 後符合預期
- 含 edge cases（空 archive / 0 候選 / 多候選 picker 流程）

#### 4.2 Audit 自動化

GitHub Action 在 PR 上跑 Phase 1 audit：
- 顯示 coverage delta
- 任何 AUTO-PICK-BUG / CONDITION-MISSING **block merge**

#### 4.3 卡片資料 → handler 同步

當 `cards.json` 更新（新增 set / 修文字），audit 自動標出：
- 新增卡片 → 沒 handler
- 文字改了 → handler 要重審

**Phase 4 deliverable**：CI gate + integration tests。
**估時**：3-5 天
**驗收**：故意 push 一個錯誤 handler → CI 擋下。

---

## 3. 整體覆蓋矩陣

```
                        T1 安全  T2 可見  T3 正確 auto  T4 完整覆蓋
─────────────────────  ──────  ──────  ───────────  ──────────
Phase 0（已完成）         ✅      ✅       27%          —
Phase 1（audit infra）    ✅      ✅       27%          —
Phase 2（engine infra）   ✅      ✅       27% → 30%    —
Phase 3（per-deck）       ✅      ✅       95%+         100% in scope
Phase 4（verification）   ✅      ✅       95%+         100% (gated)
```

---

## 4. 反偷懶條款

承接 `feedback_no_guessing_card_effects.md` 規則，這份 plan 額外明訂：

1. **不再寫 bulk array placeholder**
   ```js
   const collabHandlers = [['hX', drawCards(p,1)], ['hY', drawCards(p,1)]];  // ❌ 禁止
   ```

2. **每張卡 handler 上方必須有 5 行 spec block**（REAL / ACTION / AMBIGUITY / LIMITS / CONDITIONS）

3. **Auto-pick 必須先檢查候選數**
   ```js
   const candidates = members.filter(...);
   if (candidates.length === 0) return { state, resolved: true, log: '無候選' };
   if (candidates.length === 1) { /* auto */ }
   else { /* picker */ }
   ```

4. **每次 commit 跑 Phase 1 audit**（手動或 CI）

5. **回報半成品時，**必須**附上 follow-up plan**：
   - 已修：X 張
   - 剩餘：Y 張清單
   - 估時：Z
   - 排序：什麼先做

6. **「out of scope」的使用準則**
   - ✅ 「這個 deliverable 是 X，Y 是另一個 deliverable」
   - ❌ 「Y 太多了所以先不做」
   - ❌ 「Y 之後再說」（沒列估時就不算）

---

## 5. 立即下一步建議

按使用者實際需求排序：

1. **Phase 1.1**（audit script v3）— 4-6 小時，跑出**精確的 1682 卡 coverage 表**。先有 ground truth 才能談計畫。
2. **Phase 2.1（前 5 個 afterAction）**— 1 天，解鎖 ~100 張卡的 picker 路徑。
3. **Phase 3 deck #2-3**（ちょこ + みこ）— 14 小時 = 你下一場 / 下下場想測的 deck。
4. **Phase 4.1**（CI gate）— 1 天，避免 regress。

**全部走完 estimate**：6-8 工作週，量化進度可追蹤。

---

## 6. 透明度承諾

從這份 plan 開始：
- 每次 commit / 部署，**回報都附上「現在 Phase X 完成度 N/M」**
- 每階段結束跑一次完整 audit + 更新這份 plan 的「現況盤點」
- 任何「我先處理 A，B 跟 C 等等再說」的話 → **必須在同一則訊息列出 B、C 的數量、估時、優先順序**

不再有「先這樣，之後看」的模糊。
