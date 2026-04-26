# Card Library Effect Coverage Audit
Generated: 2026-04-26T19:21:53.476Z

## Headline

- **Total unique (cardId, hook) entries**: 1304
- **REAL (mutates state / queues prompt or boost)**: 770 (59%)
- **PASSIVE (registry-driven: equipment HP/cost, cheer leave-stage)**: 60 (5%)
- **LOG_ONLY (placeholder logs only)**: 474 (36%)
- **PASSTHROUGH fallback**: 0 (0%)
- **BROKEN (handler threw on synthetic context)**: 0 (0%)
- **MISSING (no handler at all)**: 0 (0%)
- **Effective coverage (REAL + PASSIVE)**: 830 (64%)

## By hook type

| Hook | Total | REAL | PASSIVE | LOG_ONLY | PASSTHROUGH | MISS | BROKEN | Effective % |
|---|---|---|---|---|---|---|---|---|
| oshiSkill | 138 | 54 | 0 | 84 | 0 | 0 | 0 | 39% |
| spSkill | 135 | 50 | 0 | 85 | 0 | 0 | 0 | 37% |
| art1 | 297 | 231 | 0 | 66 | 0 | 0 | 0 | 78% |
| art2 | 55 | 52 | 0 | 3 | 0 | 0 | 0 | 95% |
| effectB | 158 | 126 | 0 | 32 | 0 | 0 | 0 | 80% |
| effectC | 182 | 148 | 0 | 34 | 0 | 0 | 0 | 81% |
| effectG | 94 | 3 | 0 | 91 | 0 | 0 | 0 | 3% |
| support | 184 | 106 | 2 | 76 | 0 | 0 | 0 | 59% |
| stageSkill | 3 | 0 | 0 | 3 | 0 | 0 | 0 | 0% |
| cheer | 58 | 0 | 58 | 0 | 0 | 0 | 0 | 100% |

## By expansion

| Set | Total | REAL | PASSIVE | LOG_ONLY | PASSTHROUGH | MISS | BROKEN | Effective % |
|---|---|---|---|---|---|---|---|---|
| hBD24 | 132 | 0 | 0 | 132 | 0 | 0 | 0 | 0% |
| hBP01 | 126 | 88 | 0 | 38 | 0 | 0 | 0 | 70% |
| hBP02 | 105 | 74 | 0 | 31 | 0 | 0 | 0 | 70% |
| hBP03 | 123 | 86 | 0 | 37 | 0 | 0 | 0 | 70% |
| hBP04 | 114 | 78 | 0 | 36 | 0 | 0 | 0 | 68% |
| hBP05 | 132 | 90 | 0 | 42 | 0 | 0 | 0 | 68% |
| hBP06 | 145 | 90 | 1 | 54 | 0 | 0 | 0 | 63% |
| hBP07 | 166 | 104 | 1 | 61 | 0 | 0 | 0 | 63% |
| hPR | 2 | 1 | 0 | 1 | 0 | 0 | 0 | 50% |
| hSD01 | 19 | 19 | 0 | 0 | 0 | 0 | 0 | 100% |
| hSD02 | 13 | 11 | 0 | 2 | 0 | 0 | 0 | 85% |
| hSD03 | 13 | 9 | 0 | 4 | 0 | 0 | 0 | 69% |
| hSD04 | 14 | 11 | 0 | 3 | 0 | 0 | 0 | 79% |
| hSD05 | 13 | 12 | 0 | 1 | 0 | 0 | 0 | 92% |
| hSD06 | 13 | 11 | 0 | 2 | 0 | 0 | 0 | 85% |
| hSD07 | 16 | 11 | 0 | 5 | 0 | 0 | 0 | 69% |
| hSD08 | 10 | 8 | 0 | 2 | 0 | 0 | 0 | 80% |
| hSD09 | 9 | 8 | 0 | 1 | 0 | 0 | 0 | 89% |
| hSD10 | 16 | 11 | 0 | 5 | 0 | 0 | 0 | 69% |
| hSD11 | 13 | 10 | 0 | 3 | 0 | 0 | 0 | 77% |
| hSD12 | 22 | 18 | 0 | 4 | 0 | 0 | 0 | 82% |
| hSD13 | 22 | 12 | 0 | 10 | 0 | 0 | 0 | 55% |
| hY01 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | 100% |
| hY02 | 9 | 0 | 9 | 0 | 0 | 0 | 0 | 100% |
| hY03 | 13 | 0 | 13 | 0 | 0 | 0 | 0 | 100% |
| hY04 | 10 | 0 | 10 | 0 | 0 | 0 | 0 | 100% |
| hY05 | 8 | 0 | 8 | 0 | 0 | 0 | 0 | 100% |
| hY06 | 8 | 0 | 8 | 0 | 0 | 0 | 0 | 100% |
| hYS01 | 8 | 8 | 0 | 0 | 0 | 0 | 0 | 100% |

## Tournament backlog: top 60 most-played cards still on LOG_ONLY/PASSTHROUGH/MISSING

Usage = total copies across 52 tournament decks.

| # | ID | Name | Hook | Status | Usage | Effect (truncated) |
|---|---|---|---|---|---|---|
| 1 | hBP01-009 | 天音かなた | art1 | LOG_ONLY | 57 | This skill can only target the opponent's central member. |
| 2 | hBP07-048 | エリザベス・ローズ・ブラッドフレイム | effectG | LOG_ONLY | 32 | This member can use all the arts of all members marked #EN on their stage (there must be a |
| 3 | hBP01-014 | 天音かなた | art1 | LOG_ONLY | 20 | When using this skill to knock down an opponent's member, if the damage exceeds the member |
| 4 | hBP06-070 | 戌神ころね | effectG | LOG_ONLY | 20 | [Limited to the center position] [Once per round] You can put 1 "Yuび" on your stage back t |
| 5 | hBP06-099 | ゆび | support | LOG_ONLY | 19 | Members with this prop have +10 skill damage.  When this item is attached to "戌神ころね" from  |
| 6 | hBP01-094 | オーロ・クロニー | effectB | LOG_ONLY | 16 | Display a shout card of the same color as one of your members marked #Promise from your Sc |
| 7 | hBP07-056 | オーロ・クロニー | effectG | LOG_ONLY | 16 | [Limited to the center position] When your own performance phase starts, one other member, |
| 8 | hBP06-069 | 戌神ころね | art1 | LOG_ONLY | 14 | If this member becomes active this round due to his main skill "Infinite Stamina", the dam |
| 9 | hBP01-092 | オーロ・クロニー | art1 | LOG_ONLY | 13 | You can replace 1 shout card of this member with another member marked #Promise. |
| 10 | hBP01-124 | 開拓者 | support | LOG_ONLY | 9 | During the opponent's turn, when the member with this fan is knocked down, replace 1 of th |
| 11 | hBP06-039 | 百鬼あやめ | effectG | LOG_ONLY | 8 | [Limited to center position] If you have linkage members and your opponent has no linkage  |
| 12 | hBP07-006 | AZKi | stageSkill | LOG_ONLY | 8 | 自己的holo能量區每有1張牌，自己的中心成員「AZKi」藝能傷害+20。 |
| 13 | hBP07-014 | 角巻わため | effectG | LOG_ONLY | 8 | For each member that overlaps this member, this member's HP+10. |
| 14 | hBP07-014 | 角巻わため | art1 | LOG_ONLY | 8 | [Limited to center position] When using this skill to knock down an opponent's member, if  |
| 15 | hSD02-014 | ぽよ余 | support | LOG_ONLY | 8 | Members with this mascot have HP +20.  ◆Adds additional effects to "Hyakki Yuki" When a me |
| 16 | hBP07-011 | 角巻わため | art1 | LOG_ONLY | 7 | If this member has more than 2 white shout cards, the number of colorless shout cards requ |
| 17 | hBP02-040 | 沙花叉クロヱ | effectG | LOG_ONLY | 6 | [Once per turn] When this member's skill "ホロックスロット" displays a card, if the 3 cards displa |
| 18 | hBP02-077 | レトロパソコン | support | LOG_ONLY | 6 | You can only use it if your HP is below 3.  Return 1 member from your save area to your ha |
| 19 | hBP03-065 | 戌神ころね | effectG | LOG_ONLY | 6 | [Limited linkage position] During the opponent's main phase, the HP of your center member  |
| 20 | hBP07-008 | 角巻わため | effectC | LOG_ONLY | 6 | If on the first turn of your back attack, choose your 1st "Kakusaki Kasumi". During this r |
| 21 | hBP03-006 | 戌神ころね | oshiSkill | LOG_ONLY | 5 | [Once per turn] Change one of your rested "戌神ころね" to active status. |
| 22 | hBP03-006 | 戌神ころね | spSkill | LOG_ONLY | 5 | [Once per game] When your yellow member is knocked down, you can use: Replace the member's |
| 23 | hBP05-082 | アキ・ローゼンタールの斧 | support | LOG_ONLY | 5 | You can only use it by putting 1 card in your hand or 1 "Stone Ax" on your stage into the  |
| 24 | hBP06-083 | ラムダック | art1 | LOG_ONLY | 5 | [Limited linkage position] If your main recommendation is "Kakusaki Kazuya" or "Osora Sutr |
| 25 | hBP01-027 | ベスティア・ゼータ | effectG | LOG_ONLY | 4 | [Once per round] [Limited linkage position] When one of your own members is damaged by the |
| 26 | hBP01-045 | AZKi | effectG | LOG_ONLY | 4 | When your health is below 3, this member can bloom from hand to become a 2nd member regard |
| 27 | hBP01-061 | 鷹嶺ルイ | effectB | LOG_ONLY | 4 | You can return 1~2 members marked #secret societyholoX in your save area to your hand. |
| 28 | hBP01-070 | 尾丸ポルカ | art1 | LOG_ONLY | 4 | If this member does not have a "seat member", he cannot use this performance. |
| 29 | hBP01-071 | 尾丸ポルカ | effectB | LOG_ONLY | 4 | You can return 1 "seat member" from your save area to your hand. |
| 30 | hBP01-080 | 星街すいせい | effectC | LOG_ONLY | 4 | You can roll the dice once: when the number is odd, knock down an opponent's backstage mem |
| 31 | hBP01-123 | 野うさぎ同盟 | support | LOG_ONLY | 4 | When a member with this fan rolls the dice, he can put the fan in the save area: the dice  |
| 32 | hBP01-126 | 座員 | support | LOG_ONLY | 4 | ■When a member with this fan uses performance skills, this fan is also regarded as a red s |
| 33 | hBP03-044 | 星街すいせい | art1 | LOG_ONLY | 4 | When your main player is "Hoshijie Hoshi", you can replace this member's 1 blue shout card |
| 34 | hBP04-085 | 桃鈴ねね | effectB | LOG_ONLY | 4 | Display a shout card from your own shouting deck with the same color as a member marked #5 |
| 35 | hBP06-026 | 風真いろは | effectG | LOG_ONLY | 4 | [Limited to center position] When your own members link up, if you have more than 5 cards  |
| 36 | hBP06-027 | 風真いろは | effectG | LOG_ONLY | 4 | When this member knocks down the opponent's center member, one of the "Fengzhen Yuki" that |
| 37 | hBP06-080 | 大空スバル | effectB | LOG_ONLY | 4 | Reveal 1 "スバルドダック" or "スバFriend" from your deck and add it to your hand. Reshuffle the dec |
| 38 | hBP06-080 | 大空スバル | art1 | LOG_ONLY | 4 | Each time this member has 1 "Suba Friends", the damage of this skill is +20. |
| 39 | hBP07-039 | 赤井はあと | effectG | LOG_ONLY | 4 | [Once per turn] During your turn, when your "Akai Tatsuki" is returned to the deck from th |
| 40 | hBP07-077 | 桃鈴ねね | effectC | LOG_ONLY | 4 | If on the first turn of your back attack, reveal a 2nd member marked #5 from your deck and |
| 41 | hBP07-110 | ねっ子 | support | LOG_ONLY | 4 | [Once per turn] When the bloom level of a member with this fan increases, draw 1 card from |
| 42 | hSD02-013 | 阿修羅＆羅刹 | support | LOG_ONLY | 4 | Members with this prop have +10 skill damage.  ◆Additional effects are added to "Hyakki Yu |
| 43 | hBP01-006 | 小鳥遊キアラ | oshiSkill | LOG_ONLY | 3 | [Once per turn] Return 1 member from your save area to your hand. |
| 44 | hBP01-006 | 小鳥遊キアラ | spSkill | LOG_ONLY | 3 | [Once per game] During the opponent's turn, when your red member is knocked down, you can  |
| 45 | hBP01-050 | 風真いろは | effectG | LOG_ONLY | 3 | [Limited linkage position] The opponent's member's performance can only target his/her own |
| 46 | hBP01-095 | オーロ・クロニー | art1 | LOG_ONLY | 3 | The 1 Debut background member you placed this round can bloom from your hand into a 1st me |
| 47 | hBP04-068 | 大空スバル | effectG | LOG_ONLY | 3 | [Limited to center position or linkage position] The damage caused by the opponent's 1st m |
| 48 | hBP07-081 | 桃鈴ねね | art1 | LOG_ONLY | 3 | If this member has "ギラファノコギリクワガタ", this skill will inflict skill damage to the opponent's  |
| 49 | hBP07-082 | 桃鈴ねね | effectC | LOG_ONLY | 3 | Reveal 1 2nd member labeled #5 from your deck and add it to your hand. Reshuffle the deck. |
| 50 | hBP07-099 | ブヒー！ | support | LOG_ONLY | 3 | Draw 2 cards from your deck. After that, if one of your own members was knocked down in th |
| 51 | hBP07-103 | ギラファノコギリクワガタ | support | LOG_ONLY | 3 | The skill damage of "Momo Suzu" with this item is +20.  ◆Additional effects are added to " |
| 52 | hSD09-007 | 不知火フレア | effectG | LOG_ONLY | 3 | [Limited linkage position] During the opponent's turn, when this member is knocked down, i |
| 53 | hSD13-007 | エリザベス・ローズ・ブラッドフレイム | effectG | LOG_ONLY | 3 | For each shout card this member has, this member's HP +10. |
| 54 | hBP01-007 | 星街すいせい | oshiSkill | LOG_ONLY | 2 | [Once per round] You can use it when this leader or your own blue member inflicts damage t |
| 55 | hBP01-007 | 星街すいせい | spSkill | LOG_ONLY | 2 | [Once per game] You can use it when your blue member inflicts damage to the opponent's cen |
| 56 | hBP03-034 | 赤井はあと | effectB | LOG_ONLY | 2 | You can return 1 1st member or 2nd member marked #1st member other than Buzz in your save  |
| 57 | hBP03-095 | ホロキャップ | support | LOG_ONLY | 2 | ◆Additional effect to Debut members or Spot members ■Members with this item have HP +30. ■ |
| 58 | hBP06-089 | ドローイングストリーム | support | LOG_ONLY | 2 | Reveal 1 Scream card from your Scream deck and send it to the member you marked #絵. Reshuf |
| 59 | hBP06-104 | スバ友 | support | LOG_ONLY | 2 | During your opponent's turn, when the member with this fan is knocked down, you can send t |
| 60 | hBP02-007 | 森カリオペ | spSkill | LOG_ONLY | 1 | [Once per game] Can be used when your center member is "Mori Kari": During this round, aft |

## Tournament-deck coverage (52 community decks)

Sorted ascending by REAL %. Each card counted once.

| Deck | Placement | REAL | LOG | PASS | MISS | Total | REAL % |
|---|---|---|---|---|---|---|---|
| 未公開 | Trio 1st A Block (グランメゾン大阪) | 0 | 0 | 0 | 0 | 0 | 0% |
| ねね単 | 6th(Bombaxus) | 9 | 11 | 0 | 0 | 20 | 45% |
| AZKi単 | 2nd (oKIWIo) | 5 | 4 | 0 | 0 | 9 | 56% |
| ポルカ単 | 1st C Block (ころね) | 8 | 5 | 0 | 0 | 13 | 62% |
| ゲーマーズ | 1st D Block (大赦の店主) | 10 | 5 | 0 | 0 | 15 | 67% |
| ころね単 | 1st F Block (おばけ) | 10 | 5 | 0 | 0 | 15 | 67% |
| すいせい単 | Trio 1st (おりがみ) | 9 | 4 | 0 | 0 | 13 | 69% |
| ころね単 | 1st C Block (スマデキン) | 11 | 5 | 0 | 0 | 16 | 69% |
| ころね単 | 1st E Block (たき@Mush pros) | 11 | 5 | 0 | 0 | 16 | 69% |
| いろは単 | 1st A Block (藍色) | 12 | 5 | 0 | 0 | 17 | 71% |
| 名古屋 | Trio 1st A Block (グランメゾン大阪) | 12 | 5 | 0 | 0 | 17 | 71% |
| すいせいクロヱ | 1st D Block (めるか) | 9 | 3 | 0 | 0 | 12 | 75% |
| スバ単 | Trio 1st A Block (グランメゾン大阪) | 15 | 5 | 0 | 0 | 20 | 75% |
| ルーナ単 | Trio 1st A Block (LGW) | 16 | 5 | 0 | 0 | 21 | 76% |
| クロニー単 | 3rd(Natskii) | 16 | 5 | 0 | 0 | 21 | 76% |
| AZKi単(1フレア) | 10th(ephyra) | 16 | 5 | 0 | 0 | 21 | 76% |
| クロニー単 | 13th(Jo) | 14 | 4 | 0 | 0 | 18 | 78% |
| かなた単 | 1st B Block (タナカ) | 11 | 3 | 0 | 0 | 14 | 79% |
| クロニー単 | 1st(LightningJason) | 12 | 3 | 0 | 0 | 15 | 80% |
| かなた単 | Trio 1st B Block (仙台女神トリオ頑張ろうの会) | 13 | 3 | 0 | 0 | 16 | 81% |
| AZKi単 | 7th(bisa) | 17 | 4 | 0 | 0 | 21 | 81% |
| AZKi単(1フレア) | 9th(Noark) | 17 | 4 | 0 | 0 | 21 | 81% |
| かなた単 | 2nd E Block (クーデレスキー) | 9 | 2 | 0 | 0 | 11 | 82% |
| AZKi単 | 8th(Mojito) | 18 | 4 | 0 | 0 | 22 | 82% |
| クロニー単 | 15th(PY) | 14 | 3 | 0 | 0 | 17 | 82% |
| いじっぱりAS252 | Trio 1st B Block (ういビ〜ム) | 15 | 3 | 0 | 0 | 18 | 83% |
| はあちゃま単 | 1st (35) | 16 | 3 | 0 | 0 | 19 | 84% |
| あやめ単 | 1st B Block (THE STAR.) | 16 | 3 | 0 | 0 | 19 | 84% |
| かなクロ | 1st E Block (ロール) | 11 | 2 | 0 | 0 | 13 | 85% |
| かなた単 | 2nd C Block (スズカ) | 11 | 2 | 0 | 0 | 13 | 85% |

## Definitions

- **REAL** — handler mutates state, returns a prompt, or returns a damage-boost effect when invoked with a synthetic-but-realistic context. Includes `GATED` (handlers whose source contains state-mutating code that doesn't fire on the default sample due to condition gates).
- **PASSIVE** — effect is handled via a separate registry (e.g. `web/game/core/AttachedSupportEffects.js` for equipment HP/cost; cheer leave-stage cleanup in GameEngine knockdown path). Counts as covered.
- **LOG_ONLY** — handler is registered (often in `phaseC-final.js` dictionaries) but only emits a log line. Indistinguishable from PASSTHROUGH from the engine's perspective.
- **PASSTHROUGH** — universal fallback handler tagged `_passthrough`. Logs the effect text only.
- **BROKEN** — handler threw on synthetic context. May be a false positive; check manually.
- **MISSING** — no handler at all.

## Caveats

Behavioral classification uses synthetic states. The static fallback ("GATED" handlers) catches code that wouldn't fire on the sample, but cannot distinguish "handler is a real implementation pending the right trigger" from "handler is dead code". Treat the LOG_ONLY count as an approximate upper bound — some real handlers gated on rare conditions may be undercounted, and some handlers that intentionally only log (e.g. validator-enforced restrictions like hBP01-009 art1's "target center only") are overcounted.
