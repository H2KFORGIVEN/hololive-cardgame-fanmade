# Card Library Effect Coverage Audit
Generated: 2026-04-26T19:05:53.835Z

## Headline

- **Total unique (cardId, hook) entries**: 1304
- **REAL (mutates state / queues prompt or boost)**: 753 (58%)
- **PASSIVE (registry-driven: equipment HP/cost, cheer leave-stage)**: 60 (5%)
- **LOG_ONLY (placeholder logs only)**: 491 (38%)
- **PASSTHROUGH fallback**: 0 (0%)
- **BROKEN (handler threw on synthetic context)**: 0 (0%)
- **MISSING (no handler at all)**: 0 (0%)
- **Effective coverage (REAL + PASSIVE)**: 813 (62%)

## By hook type

| Hook | Total | REAL | PASSIVE | LOG_ONLY | PASSTHROUGH | MISS | BROKEN | Effective % |
|---|---|---|---|---|---|---|---|---|
| oshiSkill | 138 | 53 | 0 | 85 | 0 | 0 | 0 | 38% |
| spSkill | 135 | 50 | 0 | 85 | 0 | 0 | 0 | 37% |
| art1 | 297 | 229 | 0 | 68 | 0 | 0 | 0 | 77% |
| art2 | 55 | 51 | 0 | 4 | 0 | 0 | 0 | 93% |
| effectB | 158 | 122 | 0 | 36 | 0 | 0 | 0 | 77% |
| effectC | 182 | 141 | 0 | 41 | 0 | 0 | 0 | 77% |
| effectG | 94 | 3 | 0 | 91 | 0 | 0 | 0 | 3% |
| support | 184 | 104 | 2 | 78 | 0 | 0 | 0 | 58% |
| stageSkill | 3 | 0 | 0 | 3 | 0 | 0 | 0 | 0% |
| cheer | 58 | 0 | 58 | 0 | 0 | 0 | 0 | 100% |

## By expansion

| Set | Total | REAL | PASSIVE | LOG_ONLY | PASSTHROUGH | MISS | BROKEN | Effective % |
|---|---|---|---|---|---|---|---|---|
| hBD24 | 132 | 0 | 0 | 132 | 0 | 0 | 0 | 0% |
| hBP01 | 126 | 83 | 0 | 43 | 0 | 0 | 0 | 66% |
| hBP02 | 105 | 70 | 0 | 35 | 0 | 0 | 0 | 67% |
| hBP03 | 123 | 84 | 0 | 39 | 0 | 0 | 0 | 68% |
| hBP04 | 114 | 77 | 0 | 37 | 0 | 0 | 0 | 68% |
| hBP05 | 132 | 90 | 0 | 42 | 0 | 0 | 0 | 68% |
| hBP06 | 145 | 90 | 1 | 54 | 0 | 0 | 0 | 63% |
| hBP07 | 166 | 102 | 1 | 63 | 0 | 0 | 0 | 62% |
| hPR | 2 | 1 | 0 | 1 | 0 | 0 | 0 | 50% |
| hSD01 | 19 | 17 | 0 | 2 | 0 | 0 | 0 | 89% |
| hSD02 | 13 | 11 | 0 | 2 | 0 | 0 | 0 | 85% |
| hSD03 | 13 | 9 | 0 | 4 | 0 | 0 | 0 | 69% |
| hSD04 | 14 | 11 | 0 | 3 | 0 | 0 | 0 | 79% |
| hSD05 | 13 | 12 | 0 | 1 | 0 | 0 | 0 | 92% |
| hSD06 | 13 | 11 | 0 | 2 | 0 | 0 | 0 | 85% |
| hSD07 | 16 | 11 | 0 | 5 | 0 | 0 | 0 | 69% |
| hSD08 | 10 | 7 | 0 | 3 | 0 | 0 | 0 | 70% |
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
| 2 | hBP07-048 | エリザベス・ローズ・ブラッドフレイム | effectG | LOG_ONLY | 28 | This member can use all the arts of all members marked #EN on their stage (there must be a |
| 3 | hBP01-014 | 天音かなた | art1 | LOG_ONLY | 20 | When using this skill to knock down an opponent's member, if the damage exceeds the member |
| 4 | hBP06-070 | 戌神ころね | effectG | LOG_ONLY | 20 | [Limited to the center position] [Once per round] You can put 1 "Yuび" on your stage back t |
| 5 | hBP06-099 | ゆび | support | LOG_ONLY | 19 | Members with this prop have +10 skill damage.  When this item is attached to "戌神ころね" from  |
| 6 | hBP01-094 | オーロ・クロニー | effectB | LOG_ONLY | 16 | Display a shout card of the same color as one of your members marked #Promise from your Sc |
| 7 | hBP07-056 | オーロ・クロニー | effectG | LOG_ONLY | 16 | [Limited to the center position] When your own performance phase starts, one other member, |
| 8 | hBP06-069 | 戌神ころね | art1 | LOG_ONLY | 14 | If this member becomes active this round due to his main skill "Infinite Stamina", the dam |
| 9 | hBP01-092 | オーロ・クロニー | art1 | LOG_ONLY | 13 | You can replace 1 shout card of this member with another member marked #Promise. |
| 10 | hBP02-029 | 宝鐘マリン | effectC | LOG_ONLY | 10 | Inflict 20 points of special damage to the opponent's linkage members. |
| 11 | hBP02-031 | 宝鐘マリン | effectB | LOG_ONLY | 10 | Inflict 20 points of special damage to the opponent's linkage members. |
| 12 | hBP01-124 | 開拓者 | support | LOG_ONLY | 9 | During the opponent's turn, when the member with this fan is knocked down, replace 1 of th |
| 13 | hBP01-054 | アイラニ・イオフィフティーン | effectB | LOG_ONLY | 8 | Send the top card of your shout deck to the member with #ID other than your "アイラニ・イオフィフティー |
| 14 | hBP06-026 | 風真いろは | effectG | LOG_ONLY | 8 | [Limited to center position] When your own members link up, if you have more than 5 cards  |
| 15 | hBP06-027 | 風真いろは | effectG | LOG_ONLY | 8 | When this member knocks down the opponent's center member, one of the "Fengzhen Yuki" that |
| 16 | hBP06-039 | 百鬼あやめ | effectG | LOG_ONLY | 8 | [Limited to center position] If you have linkage members and your opponent has no linkage  |
| 17 | hBP07-006 | AZKi | stageSkill | LOG_ONLY | 8 | 自己的holo能量區每有1張牌，自己的中心成員「AZKi」藝能傷害+20。 |
| 18 | hBP07-014 | 角巻わため | effectG | LOG_ONLY | 8 | For each member that overlaps this member, this member's HP+10. |
| 19 | hBP07-014 | 角巻わため | art1 | LOG_ONLY | 8 | [Limited to center position] When using this skill to knock down an opponent's member, if  |
| 20 | hSD02-014 | ぽよ余 | support | LOG_ONLY | 8 | Members with this mascot have HP +20.  ◆Adds additional effects to "Hyakki Yuki" When a me |
| 21 | hBP07-011 | 角巻わため | art1 | LOG_ONLY | 7 | If this member has more than 2 white shout cards, the number of colorless shout cards requ |
| 22 | hBP01-046 | AZKi | effectB | LOG_ONLY | 6 | You can assign 1 to 3 shout cards on your stage to your members. |
| 23 | hBP02-040 | 沙花叉クロヱ | effectG | LOG_ONLY | 6 | [Once per turn] When this member's skill "ホロックスロット" displays a card, if the 3 cards displa |
| 24 | hBP02-077 | レトロパソコン | support | LOG_ONLY | 6 | You can only use it if your HP is below 3.  Return 1 member from your save area to your ha |
| 25 | hBP03-065 | 戌神ころね | effectG | LOG_ONLY | 6 | [Limited linkage position] During the opponent's main phase, the HP of your center member  |
| 26 | hBP07-008 | 角巻わため | effectC | LOG_ONLY | 6 | If on the first turn of your back attack, choose your 1st "Kakusaki Kasumi". During this r |
| 27 | hSD01-012 | アイラニ・イオフィフティーン | effectC | LOG_ONLY | 6 | You can send a white shouting card or a green shouting card in your archive area to your c |
| 28 | hBP01-050 | 風真いろは | effectG | LOG_ONLY | 5 | [Limited linkage position] The opponent's member's performance can only target his/her own |
| 29 | hBP01-050 | 風真いろは | art1 | LOG_ONLY | 5 | Send the 1 card at the top of your shouting deck to the members marked with #secret societ |
| 30 | hBP01-055 | アイラニ・イオフィフティーン | effectC | LOG_ONLY | 5 | You can send the shouting cards in your archive area to 1 to 3 members marked with #ID, on |
| 31 | hBP02-019 | パヴォリア・レイネ | effectC | LOG_ONLY | 5 | You can send 1 shouting card in your save area to your own members. |
| 32 | hBP03-006 | 戌神ころね | oshiSkill | LOG_ONLY | 5 | [Once per turn] Change one of your rested "戌神ころね" to active status. |
| 33 | hBP03-006 | 戌神ころね | spSkill | LOG_ONLY | 5 | [Once per game] When your yellow member is knocked down, you can use: Replace the member's |
| 34 | hBP05-082 | アキ・ローゼンタールの斧 | support | LOG_ONLY | 5 | You can only use it by putting 1 card in your hand or 1 "Stone Ax" on your stage into the  |
| 35 | hBP06-083 | ラムダック | art1 | LOG_ONLY | 5 | [Limited linkage position] If your main recommendation is "Kakusaki Kazuya" or "Osora Sutr |
| 36 | hBP01-027 | ベスティア・ゼータ | effectG | LOG_ONLY | 4 | [Once per round] [Limited linkage position] When one of your own members is damaged by the |
| 37 | hBP01-045 | AZKi | effectG | LOG_ONLY | 4 | When your health is below 3, this member can bloom from hand to become a 2nd member regard |
| 38 | hBP01-061 | 鷹嶺ルイ | effectB | LOG_ONLY | 4 | You can return 1~2 members marked #secret societyholoX in your save area to your hand. |
| 39 | hBP01-070 | 尾丸ポルカ | art1 | LOG_ONLY | 4 | If this member does not have a "seat member", he cannot use this performance. |
| 40 | hBP01-071 | 尾丸ポルカ | effectB | LOG_ONLY | 4 | You can return 1 "seat member" from your save area to your hand. |
| 41 | hBP01-080 | 星街すいせい | effectC | LOG_ONLY | 4 | You can roll the dice once: when the number is odd, knock down an opponent's backstage mem |
| 42 | hBP01-123 | 野うさぎ同盟 | support | LOG_ONLY | 4 | When a member with this fan rolls the dice, he can put the fan in the save area: the dice  |
| 43 | hBP01-126 | 座員 | support | LOG_ONLY | 4 | ■When a member with this fan uses performance skills, this fan is also regarded as a red s |
| 44 | hBP03-044 | 星街すいせい | art1 | LOG_ONLY | 4 | When your main player is "Hoshijie Hoshi", you can replace this member's 1 blue shout card |
| 45 | hBP04-085 | 桃鈴ねね | effectB | LOG_ONLY | 4 | Display a shout card from your own shouting deck with the same color as a member marked #5 |
| 46 | hBP06-080 | 大空スバル | effectB | LOG_ONLY | 4 | Reveal 1 "スバルドダック" or "スバFriend" from your deck and add it to your hand. Reshuffle the dec |
| 47 | hBP06-080 | 大空スバル | art1 | LOG_ONLY | 4 | Each time this member has 1 "Suba Friends", the damage of this skill is +20. |
| 48 | hBP07-039 | 赤井はあと | effectG | LOG_ONLY | 4 | [Once per turn] During your turn, when your "Akai Tatsuki" is returned to the deck from th |
| 49 | hBP07-042 | 赤井はあと | art2 | LOG_ONLY | 4 | If one of your own members is returned from the stage to the deck this round, this skill w |
| 50 | hBP07-077 | 桃鈴ねね | effectC | LOG_ONLY | 4 | If on the first turn of your back attack, reveal a 2nd member marked #5 from your deck and |
| 51 | hBP07-110 | ねっ子 | support | LOG_ONLY | 4 | [Once per turn] When the bloom level of a member with this fan increases, draw 1 card from |
| 52 | hSD02-013 | 阿修羅＆羅刹 | support | LOG_ONLY | 4 | Members with this prop have +10 skill damage.  ◆Additional effects are added to "Hyakki Yu |
| 53 | hBP01-006 | 小鳥遊キアラ | oshiSkill | LOG_ONLY | 3 | [Once per turn] Return 1 member from your save area to your hand. |
| 54 | hBP01-006 | 小鳥遊キアラ | spSkill | LOG_ONLY | 3 | [Once per game] During the opponent's turn, when your red member is knocked down, you can  |
| 55 | hBP01-095 | オーロ・クロニー | art1 | LOG_ONLY | 3 | The 1 Debut background member you placed this round can bloom from your hand into a 1st me |
| 56 | hBP01-098 | 白銀ノエル | effectC | LOG_ONLY | 3 | You can send 1 shouting card in your save area to your own members. |
| 57 | hBP02-003 | 宝鐘マリン | oshiSkill | LOG_ONLY | 3 | [Once per round] The member marked #3 who bloomed this round will bloom again using the me |
| 58 | hBP04-068 | 大空スバル | effectG | LOG_ONLY | 3 | [Limited to center position or linkage position] The damage caused by the opponent's 1st m |
| 59 | hBP04-072 | 大空スバル | effectB | LOG_ONLY | 3 | You can send 1 yellow shouting card in your archive area to your own members. |
| 60 | hBP07-081 | 桃鈴ねね | art1 | LOG_ONLY | 3 | If this member has "ギラファノコギリクワガタ", this skill will inflict skill damage to the opponent's  |

## Tournament-deck coverage (52 community decks)

Sorted ascending by REAL %. Each card counted once.

| Deck | Placement | REAL | LOG | PASS | MISS | Total | REAL % |
|---|---|---|---|---|---|---|---|
| 未公開 | Trio 1st A Block (グランメゾン大阪) | 0 | 0 | 0 | 0 | 0 | 0% |
| ねね単 | 6th(Bombaxus) | 9 | 11 | 0 | 0 | 20 | 45% |
| AZKi単 | 2nd (oKIWIo) | 5 | 4 | 0 | 0 | 9 | 56% |
| ポルカ単 | 1st C Block (ころね) | 8 | 5 | 0 | 0 | 13 | 62% |
| ルーナ単 | Trio 1st A Block (LGW) | 13 | 8 | 0 | 0 | 21 | 62% |
| マリン単 | Individual B 2nd (RasK) | 11 | 6 | 0 | 0 | 17 | 65% |
| ゲーマーズ | 1st D Block (大赦の店主) | 10 | 5 | 0 | 0 | 15 | 67% |
| ころね単 | 1st F Block (おばけ) | 10 | 5 | 0 | 0 | 15 | 67% |
| すいせい単 | Trio 1st (おりがみ) | 9 | 4 | 0 | 0 | 13 | 69% |
| ころね単 | 1st C Block (スマデキン) | 11 | 5 | 0 | 0 | 16 | 69% |
| ころね単 | 1st E Block (たき@Mush pros) | 11 | 5 | 0 | 0 | 16 | 69% |
| スバ単 | Trio 1st A Block (グランメゾン大阪) | 14 | 6 | 0 | 0 | 20 | 70% |
| オリー単 | Individual A 1st (マトフ) | 10 | 4 | 0 | 0 | 14 | 71% |
| かなた単 | 1st B Block (タナカ) | 10 | 4 | 0 | 0 | 14 | 71% |
| いろは単 | 1st A Block (藍色) | 12 | 5 | 0 | 0 | 17 | 71% |
| 名古屋 | Trio 1st A Block (グランメゾン大阪) | 12 | 5 | 0 | 0 | 17 | 71% |
| AZKi単(1フレア) | 10th(ephyra) | 15 | 6 | 0 | 0 | 21 | 71% |
| はあちゃま単 | 1st (35) | 14 | 5 | 0 | 0 | 19 | 74% |
| すいせいクロヱ | 1st D Block (めるか) | 9 | 3 | 0 | 0 | 12 | 75% |
| レイネイオフィ | 2nd A Block (ける/OGTpros) | 9 | 3 | 0 | 0 | 12 | 75% |
| かなた単 | Trio 1st B Block (仙台女神トリオ頑張ろうの会) | 12 | 4 | 0 | 0 | 16 | 75% |
| クロニー単 | 3rd(Natskii) | 16 | 5 | 0 | 0 | 21 | 76% |
| AZKi単(1フレア) | 9th(Noark) | 16 | 5 | 0 | 0 | 21 | 76% |
| ぺこマリ | 2nd B Block (くるはむ) | 10 | 3 | 0 | 0 | 13 | 77% |
| クロニー単 | 13th(Jo) | 14 | 4 | 0 | 0 | 18 | 78% |
| キアラ単 | Individual A 2nd (ける/OGTpros) | 11 | 3 | 0 | 0 | 14 | 79% |
| ぺこマリ | 1st A Block (ユキ) | 11 | 3 | 0 | 0 | 14 | 79% |
| かなた単 | 2nd D Block (アカシキフ) | 11 | 3 | 0 | 0 | 14 | 79% |
| AZKi単 | Individual B 1st (ギリャー) | 12 | 3 | 0 | 0 | 15 | 80% |
| AZKi単 | Trio 1st A Block (LGW) | 16 | 4 | 0 | 0 | 20 | 80% |

## Definitions

- **REAL** — handler mutates state, returns a prompt, or returns a damage-boost effect when invoked with a synthetic-but-realistic context. Includes `GATED` (handlers whose source contains state-mutating code that doesn't fire on the default sample due to condition gates).
- **PASSIVE** — effect is handled via a separate registry (e.g. `web/game/core/AttachedSupportEffects.js` for equipment HP/cost; cheer leave-stage cleanup in GameEngine knockdown path). Counts as covered.
- **LOG_ONLY** — handler is registered (often in `phaseC-final.js` dictionaries) but only emits a log line. Indistinguishable from PASSTHROUGH from the engine's perspective.
- **PASSTHROUGH** — universal fallback handler tagged `_passthrough`. Logs the effect text only.
- **BROKEN** — handler threw on synthetic context. May be a false positive; check manually.
- **MISSING** — no handler at all.

## Caveats

Behavioral classification uses synthetic states. The static fallback ("GATED" handlers) catches code that wouldn't fire on the sample, but cannot distinguish "handler is a real implementation pending the right trigger" from "handler is dead code". Treat the LOG_ONLY count as an approximate upper bound — some real handlers gated on rare conditions may be undercounted, and some handlers that intentionally only log (e.g. validator-enforced restrictions like hBP01-009 art1's "target center only") are overcounted.
