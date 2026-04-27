# Card Library Effect Coverage Audit
Generated: 2026-04-27T02:32:32.209Z

## Headline

- **Total unique (cardId, hook) entries**: 1304
- **REAL (mutates state / queues prompt or boost)**: 788 (60%)
- **PASSIVE (registry-driven: equipment HP/cost, cheer leave-stage)**: 75 (6%)
- **LOG_ONLY (placeholder logs only)**: 441 (34%)
- **PASSTHROUGH fallback**: 0 (0%)
- **BROKEN (handler threw on synthetic context)**: 0 (0%)
- **MISSING (no handler at all)**: 0 (0%)
- **Effective coverage (REAL + PASSIVE)**: 863 (66%)

## By hook type

| Hook | Total | REAL | PASSIVE | LOG_ONLY | PASSTHROUGH | MISS | BROKEN | Effective % |
|---|---|---|---|---|---|---|---|---|
| oshiSkill | 138 | 54 | 0 | 84 | 0 | 0 | 0 | 39% |
| spSkill | 135 | 50 | 0 | 85 | 0 | 0 | 0 | 37% |
| art1 | 297 | 232 | 0 | 65 | 0 | 0 | 0 | 78% |
| art2 | 55 | 52 | 0 | 3 | 0 | 0 | 0 | 95% |
| effectB | 158 | 126 | 0 | 32 | 0 | 0 | 0 | 80% |
| effectC | 182 | 148 | 0 | 34 | 0 | 0 | 0 | 81% |
| effectG | 94 | 20 | 0 | 74 | 0 | 0 | 0 | 21% |
| support | 184 | 106 | 17 | 61 | 0 | 0 | 0 | 67% |
| stageSkill | 3 | 0 | 0 | 3 | 0 | 0 | 0 | 0% |
| cheer | 58 | 0 | 58 | 0 | 0 | 0 | 0 | 100% |

## By expansion

| Set | Total | REAL | PASSIVE | LOG_ONLY | PASSTHROUGH | MISS | BROKEN | Effective % |
|---|---|---|---|---|---|---|---|---|
| hBD24 | 132 | 0 | 0 | 132 | 0 | 0 | 0 | 0% |
| hBP01 | 126 | 88 | 3 | 35 | 0 | 0 | 0 | 72% |
| hBP02 | 105 | 75 | 7 | 23 | 0 | 0 | 0 | 78% |
| hBP03 | 123 | 91 | 1 | 31 | 0 | 0 | 0 | 75% |
| hBP04 | 114 | 84 | 0 | 30 | 0 | 0 | 0 | 74% |
| hBP05 | 132 | 91 | 1 | 40 | 0 | 0 | 0 | 70% |
| hBP06 | 145 | 93 | 1 | 51 | 0 | 0 | 0 | 65% |
| hBP07 | 166 | 105 | 2 | 59 | 0 | 0 | 0 | 64% |
| hPR | 2 | 1 | 0 | 1 | 0 | 0 | 0 | 50% |
| hSD01 | 19 | 19 | 0 | 0 | 0 | 0 | 0 | 100% |
| hSD02 | 13 | 11 | 2 | 0 | 0 | 0 | 0 | 100% |
| hSD03 | 13 | 9 | 0 | 4 | 0 | 0 | 0 | 69% |
| hSD04 | 14 | 11 | 0 | 3 | 0 | 0 | 0 | 79% |
| hSD05 | 13 | 12 | 0 | 1 | 0 | 0 | 0 | 92% |
| hSD06 | 13 | 11 | 0 | 2 | 0 | 0 | 0 | 85% |
| hSD07 | 16 | 11 | 0 | 5 | 0 | 0 | 0 | 69% |
| hSD08 | 10 | 8 | 0 | 2 | 0 | 0 | 0 | 80% |
| hSD09 | 9 | 9 | 0 | 0 | 0 | 0 | 0 | 100% |
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
| 11 | hBP06-026 | 風真いろは | effectG | LOG_ONLY | 8 | [Limited to center position] When your own members link up, if you have more than 5 cards  |
| 12 | hBP06-027 | 風真いろは | effectG | LOG_ONLY | 8 | When this member knocks down the opponent's center member, one of the "Fengzhen Yuki" that |
| 13 | hBP07-006 | AZKi | stageSkill | LOG_ONLY | 8 | 自己的holo能量區每有1張牌，自己的中心成員「AZKi」藝能傷害+20。 |
| 14 | hBP07-014 | 角巻わため | effectG | LOG_ONLY | 8 | For each member that overlaps this member, this member's HP+10. |
| 15 | hBP07-014 | 角巻わため | art1 | LOG_ONLY | 8 | [Limited to center position] When using this skill to knock down an opponent's member, if  |
| 16 | hBP07-011 | 角巻わため | art1 | LOG_ONLY | 7 | If this member has more than 2 white shout cards, the number of colorless shout cards requ |
| 17 | hBP02-040 | 沙花叉クロヱ | effectG | LOG_ONLY | 6 | [Once per turn] When this member's skill "ホロックスロット" displays a card, if the 3 cards displa |
| 18 | hBP02-077 | レトロパソコン | support | LOG_ONLY | 6 | You can only use it if your HP is below 3.  Return 1 member from your save area to your ha |
| 19 | hBP03-065 | 戌神ころね | effectG | LOG_ONLY | 6 | [Limited linkage position] During the opponent's main phase, the HP of your center member  |
| 20 | hBP07-008 | 角巻わため | effectC | LOG_ONLY | 6 | If on the first turn of your back attack, choose your 1st "Kakusaki Kasumi". During this r |
| 21 | hBP01-050 | 風真いろは | effectG | LOG_ONLY | 5 | [Limited linkage position] The opponent's member's performance can only target his/her own |
| 22 | hBP03-006 | 戌神ころね | oshiSkill | LOG_ONLY | 5 | [Once per turn] Change one of your rested "戌神ころね" to active status. |
| 23 | hBP03-006 | 戌神ころね | spSkill | LOG_ONLY | 5 | [Once per game] When your yellow member is knocked down, you can use: Replace the member's |
| 24 | hBP06-083 | ラムダック | art1 | LOG_ONLY | 5 | [Limited linkage position] If your main recommendation is "Kakusaki Kazuya" or "Osora Sutr |
| 25 | hBP01-027 | ベスティア・ゼータ | effectG | LOG_ONLY | 4 | [Once per round] [Limited linkage position] When one of your own members is damaged by the |
| 26 | hBP01-045 | AZKi | effectG | LOG_ONLY | 4 | When your health is below 3, this member can bloom from hand to become a 2nd member regard |
| 27 | hBP01-061 | 鷹嶺ルイ | effectB | LOG_ONLY | 4 | You can return 1~2 members marked #secret societyholoX in your save area to your hand. |
| 28 | hBP01-070 | 尾丸ポルカ | art1 | LOG_ONLY | 4 | If this member does not have a "seat member", he cannot use this performance. |
| 29 | hBP01-071 | 尾丸ポルカ | effectB | LOG_ONLY | 4 | You can return 1 "seat member" from your save area to your hand. |
| 30 | hBP01-080 | 星街すいせい | effectC | LOG_ONLY | 4 | You can roll the dice once: when the number is odd, knock down an opponent's backstage mem |
| 31 | hBP01-123 | 野うさぎ同盟 | support | LOG_ONLY | 4 | When a member with this fan rolls the dice, he can put the fan in the save area: the dice  |
| 32 | hBP04-085 | 桃鈴ねね | effectB | LOG_ONLY | 4 | Display a shout card from your own shouting deck with the same color as a member marked #5 |
| 33 | hBP06-080 | 大空スバル | effectB | LOG_ONLY | 4 | Reveal 1 "スバルドダック" or "スバFriend" from your deck and add it to your hand. Reshuffle the dec |
| 34 | hBP06-080 | 大空スバル | art1 | LOG_ONLY | 4 | Each time this member has 1 "Suba Friends", the damage of this skill is +20. |
| 35 | hBP07-039 | 赤井はあと | effectG | LOG_ONLY | 4 | [Once per turn] During your turn, when your "Akai Tatsuki" is returned to the deck from th |
| 36 | hBP07-077 | 桃鈴ねね | effectC | LOG_ONLY | 4 | If on the first turn of your back attack, reveal a 2nd member marked #5 from your deck and |
| 37 | hBP07-110 | ねっ子 | support | LOG_ONLY | 4 | [Once per turn] When the bloom level of a member with this fan increases, draw 1 card from |
| 38 | hBP01-006 | 小鳥遊キアラ | oshiSkill | LOG_ONLY | 3 | [Once per turn] Return 1 member from your save area to your hand. |
| 39 | hBP01-006 | 小鳥遊キアラ | spSkill | LOG_ONLY | 3 | [Once per game] During the opponent's turn, when your red member is knocked down, you can  |
| 40 | hBP01-095 | オーロ・クロニー | art1 | LOG_ONLY | 3 | The 1 Debut background member you placed this round can bloom from your hand into a 1st me |
| 41 | hBP07-081 | 桃鈴ねね | art1 | LOG_ONLY | 3 | If this member has "ギラファノコギリクワガタ", this skill will inflict skill damage to the opponent's  |
| 42 | hBP07-082 | 桃鈴ねね | effectC | LOG_ONLY | 3 | Reveal 1 2nd member labeled #5 from your deck and add it to your hand. Reshuffle the deck. |
| 43 | hBP07-099 | ブヒー！ | support | LOG_ONLY | 3 | Draw 2 cards from your deck. After that, if one of your own members was knocked down in th |
| 44 | hSD13-007 | エリザベス・ローズ・ブラッドフレイム | effectG | LOG_ONLY | 3 | For each shout card this member has, this member's HP +10. |
| 45 | hBP01-007 | 星街すいせい | oshiSkill | LOG_ONLY | 2 | [Once per round] You can use it when this leader or your own blue member inflicts damage t |
| 46 | hBP01-007 | 星街すいせい | spSkill | LOG_ONLY | 2 | [Once per game] You can use it when your blue member inflicts damage to the opponent's cen |
| 47 | hBP03-034 | 赤井はあと | effectB | LOG_ONLY | 2 | You can return 1 1st member or 2nd member marked #1st member other than Buzz in your save  |
| 48 | hBP06-089 | ドローイングストリーム | support | LOG_ONLY | 2 | Reveal 1 Scream card from your Scream deck and send it to the member you marked #絵. Reshuf |
| 49 | hBP06-104 | スバ友 | support | LOG_ONLY | 2 | During your opponent's turn, when the member with this fan is knocked down, you can send t |
| 50 | hBP02-007 | 森カリオペ | spSkill | LOG_ONLY | 1 | [Once per game] Can be used when your center member is "Mori Kari": During this round, aft |
| 51 | hBP02-039 | 沙花叉クロヱ | effectG | LOG_ONLY | 1 | [Once per turn] When this member's skill "Horrotech" reveals a card, add the revealed supp |
| 52 | hBP07-001 | 角巻わため | stageSkill | LOG_ONLY | 1 | 自己的「角巻わため」使用了藝能時，將自己牌組上方的1張牌放到holo能量區。 |
| 53 | hBP07-004 | 赤井はあと | stageSkill | LOG_ONLY | 1 | [每個回合一次]自己回合中，自己的「赤井はあと」因自己的效果從舞台上放回牌組時，從自己的牌組抽2張牌。 |
| 54 | hBP07-007 | 桃鈴ねね | oshiSkill | LOG_ONLY | 1 | [Once per round] Send the shouting cards in your save area to all 2nd members marked #5, 1 |
| 55 | hBP07-007 | 桃鈴ねね | spSkill | LOG_ONLY | 1 | [Once per game] Reveal 1~4 Debut member "Momo Suzuko" from your deck and put them on the s |
| 56 | hBP07-079 | 桃鈴ねね | art1 | LOG_ONLY | 1 | Reveal 1 "やめなー" from your deck and attach it to your member. Reshuffle the deck. |
| 57 | hBP07-080 | 桃鈴ねね | effectG | LOG_ONLY | 1 | [Once per turn] If your main push is "Momo Suzu Koko", you can use it in your main phase:  |
| 58 | hBP07-092 | アーカイブパソコン | support | LOG_ONLY | 1 | Put 1~3 members in your save area back into the deck and reshuffle them. After that, draw  |
| 59 | hBD24-001 | パヴォリア・レイネ | oshiSkill | LOG_ONLY | 0 | [Once per round] During this round, one of your green members' skill damage +20. |
| 60 | hBD24-001 | パヴォリア・レイネ | spSkill | LOG_ONLY | 0 | [Once per game] Reveal 1 green member from your deck and add it to your hand. Reshuffle th |

## Tournament-deck coverage (52 community decks)

Sorted ascending by REAL %. Each card counted once.

| Deck | Placement | REAL | LOG | PASS | MISS | Total | REAL % |
|---|---|---|---|---|---|---|---|
| 未公開 | Trio 1st A Block (グランメゾン大阪) | 0 | 0 | 0 | 0 | 0 | 0% |
| ねね単 | 6th(Bombaxus) | 10 | 10 | 0 | 0 | 20 | 50% |
| AZKi単 | 2nd (oKIWIo) | 5 | 4 | 0 | 0 | 9 | 56% |
| ゲーマーズ | 1st D Block (大赦の店主) | 10 | 5 | 0 | 0 | 15 | 67% |
| ころね単 | 1st F Block (おばけ) | 10 | 5 | 0 | 0 | 15 | 67% |
| ポルカ単 | 1st C Block (ころね) | 9 | 4 | 0 | 0 | 13 | 69% |
| ころね単 | 1st E Block (たき@Mush pros) | 11 | 5 | 0 | 0 | 16 | 69% |
| 名古屋 | Trio 1st A Block (グランメゾン大阪) | 12 | 5 | 0 | 0 | 17 | 71% |
| すいせいクロヱ | 1st D Block (めるか) | 9 | 3 | 0 | 0 | 12 | 75% |
| ころね単 | 1st C Block (スマデキン) | 12 | 4 | 0 | 0 | 16 | 75% |
| いろは単 | 1st A Block (藍色) | 13 | 4 | 0 | 0 | 17 | 76% |
| ルーナ単 | Trio 1st A Block (LGW) | 16 | 5 | 0 | 0 | 21 | 76% |
| クロニー単 | 3rd(Natskii) | 16 | 5 | 0 | 0 | 21 | 76% |
| すいせい単 | Trio 1st (おりがみ) | 10 | 3 | 0 | 0 | 13 | 77% |
| クロニー単 | 13th(Jo) | 14 | 4 | 0 | 0 | 18 | 78% |
| かなた単 | 1st B Block (タナカ) | 11 | 3 | 0 | 0 | 14 | 79% |
| クロニー単 | 1st(LightningJason) | 12 | 3 | 0 | 0 | 15 | 80% |
| ござのかーさん | Trio 1st B Block (ういビ〜ム) | 13 | 3 | 0 | 0 | 16 | 81% |
| かなた単 | Trio 1st B Block (仙台女神トリオ頑張ろうの会) | 13 | 3 | 0 | 0 | 16 | 81% |
| かなた単 | 2nd E Block (クーデレスキー) | 9 | 2 | 0 | 0 | 11 | 82% |
| クロニー単 | 15th(PY) | 14 | 3 | 0 | 0 | 17 | 82% |
| はあちゃま単 | 1st (35) | 16 | 3 | 0 | 0 | 19 | 84% |
| かなクロ | 1st E Block (ロール) | 11 | 2 | 0 | 0 | 13 | 85% |
| かなた単 | 2nd C Block (スズカ) | 11 | 2 | 0 | 0 | 13 | 85% |
| スバ単 | Trio 1st A Block (グランメゾン大阪) | 17 | 3 | 0 | 0 | 20 | 85% |
| AZKi単 | Trio 1st B Block (仙台女神トリオ頑張ろうの会) | 17 | 3 | 0 | 0 | 20 | 85% |
| キアラ単 | Individual A 2nd (ける/OGTpros) | 12 | 2 | 0 | 0 | 14 | 86% |
| かなた単 | 2nd D Block (アカシキフ) | 12 | 2 | 0 | 0 | 14 | 86% |
| 設定4 | Trio 1st B Block (ういビ〜ム) | 12 | 2 | 0 | 0 | 14 | 86% |
| AZKi単 | 7th(bisa) | 18 | 3 | 0 | 0 | 21 | 86% |

## Definitions

- **REAL** — handler mutates state, returns a prompt, or returns a damage-boost effect when invoked with a synthetic-but-realistic context. Includes `GATED` (handlers whose source contains state-mutating code that doesn't fire on the default sample due to condition gates).
- **PASSIVE** — effect is handled via a separate registry (e.g. `web/game/core/AttachedSupportEffects.js` for equipment HP/cost; cheer leave-stage cleanup in GameEngine knockdown path). Counts as covered.
- **LOG_ONLY** — handler is registered (often in `phaseC-final.js` dictionaries) but only emits a log line. Indistinguishable from PASSTHROUGH from the engine's perspective.
- **PASSTHROUGH** — universal fallback handler tagged `_passthrough`. Logs the effect text only.
- **BROKEN** — handler threw on synthetic context. May be a false positive; check manually.
- **MISSING** — no handler at all.

## Caveats

Behavioral classification uses synthetic states. The static fallback ("GATED" handlers) catches code that wouldn't fire on the sample, but cannot distinguish "handler is a real implementation pending the right trigger" from "handler is dead code". Treat the LOG_ONLY count as an approximate upper bound — some real handlers gated on rare conditions may be undercounted, and some handlers that intentionally only log (e.g. validator-enforced restrictions like hBP01-009 art1's "target center only") are overcounted.
