// Phase C Batch 2: 110 cards
import { getCard, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE, MEMBER_STATE, isMember, isSupport } from '../../core/constants.js';
import { applyDamageToMember, drawCards, getStageMembers, rollDieFor as _rollDieFor } from './common.js';

function shuffleArr(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function searchDeck(p,pred,n=1){const r=[];for(let i=0;i<p.zones[ZONE.DECK].length&&r.length<n;i++){if(pred(p.zones[ZONE.DECK][i]))r.push(i)}return r}
function pullFromDeck(p,idx){const s=[...idx].sort((a,b)=>b-a);return s.map(i=>p.zones[ZONE.DECK].splice(i,1)[0])}
// rollDie: shim for centralized rolling (see common.rollDieFor). Pass state
// and ctx { member } when known; bare call falls back to plain random.
function rollDie(state, ctx){
  if (state) return _rollDieFor(state, ctx);
  return Math.floor(Math.random()*6)+1;
}
function hasTag(c,t){return getCard(c.cardId)?.tag?.includes(t)}
function makeSearchPrompt(p,pIdx,pred,msg,action='ADD_TO_HAND',max=1){const m=[];for(const c of p.zones[ZONE.DECK]){if(pred(c)){const d=getCard(c.cardId);m.push({instanceId:c.instanceId,cardId:c.cardId,name:d?.name||'',image:getCardImage(c.cardId)})}}if(!m.length)return null;return{type:action==='PLACE_AND_SHUFFLE'?'SEARCH_SELECT_PLACE':'SEARCH_SELECT',player:pIdx,message:msg,cards:m,maxSelect:max,afterAction:action}}
function damageOpp(s,p,amt,pos='center'){const o=s.players[1-p];const t=o.zones[pos==='collab'?ZONE.COLLAB:ZONE.CENTER];if(t)applyDamageToMember(t,amt)}
function archiveHand(p,n=1){let c=0;while(c<n&&p.zones[ZONE.HAND].length>0){p.zones[ZONE.ARCHIVE].push(p.zones[ZONE.HAND].shift());c++}return c}
function sendCheerDeck(p,m){if(!m||!p.zones[ZONE.CHEER_DECK].length)return false;const c=p.zones[ZONE.CHEER_DECK].shift();c.faceDown=false;m.attachedCheer.push(c);return true}
function sendCheerArchive(p,m,color=null){if(!m)return false;const i=p.zones[ZONE.ARCHIVE].findIndex(c=>{const d=getCard(c.cardId);return d?.type==='吶喊'&&(!color||d.color===color)});if(i<0)return false;m.attachedCheer.push(p.zones[ZONE.ARCHIVE].splice(i,1)[0]);return true}
function returnArchive(p,pred,n=1){let r=0;while(r<n){const i=p.zones[ZONE.ARCHIVE].findIndex(pred);if(i<0)break;p.zones[ZONE.HAND].push(p.zones[ZONE.ARCHIVE].splice(i,1)[0]);r++}return r}
function makeArchivePrompt(p,pIdx,pred,msg,max=1){const m=[];for(const c of p.zones[ZONE.ARCHIVE]){if(pred(c)){const d=getCard(c.cardId);m.push({instanceId:c.instanceId,cardId:c.cardId,name:d?.name||'',image:getCardImage(c.cardId)})}}if(!m.length)return null;return{type:'SELECT_FROM_ARCHIVE',player:pIdx,message:msg,cards:m,maxSelect:max,afterAction:'RETURN_FROM_ARCHIVE'}}
function boost(a,t='self'){return{type:'DAMAGE_BOOST',amount:a,target:t,duration:'instant'}}
function boostTurn(a,t='self'){return{type:'DAMAGE_BOOST',amount:a,target:t,duration:'turn'}}

export function registerPhaseC2(){
  let count=0;
  const reg=(id,hook,fn)=>{registerEffect(id,hook,fn);count++};
  const P=(s)=>({state:s,resolved:true});
  const PL=(s,l)=>({state:s,resolved:true,log:l});
  const PB=(s,a,l,t='self')=>({state:s,resolved:true,effect:boost(a,t),log:l});

  // Read batch2 data and generate handlers based on effect patterns
  // Each handler implements the card's specific multi-step effect

  // hBP04-066 古石ビジュー effectB+art1
  reg('hBP04-066',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];const n=p.zones[ZONE.HAND].length;
    while(p.zones[ZONE.HAND].length)p.zones[ZONE.ARCHIVE].push(p.zones[ZONE.HAND].shift());
    drawCards(p,n);return PL(s,`棄${n}張→重抽${n}張`);
  });
  reg('hBP04-066',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=s.players[1-c.player].zones[ZONE.ARCHIVE].filter(x=>getCard(x.cardId)?.type==='吶喊').length;
    return PB(s,n*10,`對手存檔${n}吶喊→+${n*10}`);
  });

  // hBP04-074 アーニャ effectG: center→self+collab dmg-10
  reg('hBP04-074',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>PL(s,'中心:自身+聯動受傷-10'));

  // hBP04-076 アーニャ effectC: return 古代武器 from archive
  reg('hBP04-076',HOOK.ON_COLLAB,(s,c)=>{
    const p=s.players[c.player];const i=p.zones[ZONE.ARCHIVE].findIndex(x=>getCard(x.cardId)?.name==='古代武器');
    if(i>=0){const anya=getStageMembers(p).find(m=>getCard(m.inst.cardId)?.name==='アーニャ・メルフィッサ');
      if(anya)anya.inst.attachedSupport.push(p.zones[ZONE.ARCHIVE].splice(i,1)[0])}
    return PL(s,'存檔古代武器→アーニャ');
  });

  // hBP04-077 アーニャ effectG: on knockdown return 1 stacked to hand
  reg('hBP04-077',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>PL(s,'被擊倒→重疊成員1張回手'));

  // hBP04-078 アーニャ effectG: has 古代武器→yellow cost -1
  reg('hBP04-078',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>PL(s,'帶古代武器→黃吶喊需求-1'));

  // ════════════════════════════════════════════════════════════════════════
  //  REMOVED: hBP04-079 / hBP04-080 / hBP04-082 phaseC2 entries (drift)
  // ════════════════════════════════════════════════════════════════════════
  // Comments said アーニャ/ラプラス but actual cards are 夏色まつり Debut/1st/
  // 2nd. The wrong handlers added bogus art damage (+50, +10×opp-backstage,
  // 抽1棄1) that ACTIVELY MISBEHAVED on まつり when she attacks/blooms.
  //
  // Correct effects:
  //   hBP04-079 まつり Debut effectG (KO cheer transfer) → phaseB E-1.4
  //   hBP04-080 まつり 1st           → no art effect; nothing to register
  //   hBP04-082 まつり 2nd effectB+art1 → phaseB G-1.3 covers art1 (cheer
  //             count +20 each); effectB dice→cheer left unimplemented
  // ════════════════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════════════════
  //  REMOVED: phaseC2 hBP04-083..hBP04-112 entries (drift cleanup, 2026-04-28)
  // ════════════════════════════════════════════════════════════════════════
  // The original phaseC2 author worked against an outdated card database
  // where these IDs mapped to ラプラス/シオン/ネリッサ/一伊那尓栖/セシリア/
  // クレイジー/カリオペ/古石ビジュー/アーニャ/etc. variants. In the current
  // (2026) DB, the same IDs map to:
  //
  //   hBP04-083~086  桃鈴ねね         (was ラプラス/シオン)
  //   hBP04-087      エリザベス Spot   (was シオン art2)
  //   hBP04-088      ジジ Spot         (was ネリッサ art1)
  //   hBP04-089      ツートンカラー    (support, not ネリッサ effectC)
  //   hBP04-090      作業用パソコン    (支援・物品, not ネリッサ effectG)
  //   hBP04-091~092  限界飯/ねぽらぼ   (支援・活動, not 一伊那尓栖)
  //   hBP04-093~096  ホロライブ2期生.. (支援・活動, not セシリア/クレイジー/
  //                                     カリオペ)
  //   hBP04-097~099  緑の試験管/鍛冶ハンマー/古代武器 (支援・道具)
  //   hBP04-100~106  ココロ/だいふく/やめなー/カラス/スバルドダック/
  //                  こよりの助手くん/雪民 (支援卡)
  //   hBP04-107~112  do not exist in current DB
  //
  // All handlers in this region were dead code (registered on support
  // cardIds for member-only hooks like ON_BLOOM/ON_COLLAB/ON_ART_DECLARE
  // that never fire for support cards) AND were attempting effects that
  // don't match the actual cards anyway. They have been removed.
  //
  // Correct effects for hBP04-088 (ジジ KO trigger), hBP04-085~086 (桃鈴ねね
  // bloom/art), and the support cards (hBP04-100~106) are now in:
  //   - phaseB-cards.js E-1 (ON_KNOCKDOWN handlers)
  //   - AttachedSupportEffects.js REGISTRY (support-card boosts)
  // See K-round commit logs for migration details.
  // ════════════════════════════════════════════════════════════════════════

  // Remaining cards with simpler patterns — batch process
  // effectG passives (just log)
  const passiveCards = [
    ['hBP05-009','聯動位置:對手中心成員藝能傷害-20'],
    ['hBP05-013','對手的成員使用藝能時不能選擇後台'],
    ['hBP05-014','中心位置:帶有道具→HP不受對手效果影響'],
    ['hBP05-017','被擊倒→吶喊替換給己方成員'],
    ['hBP05-020','聯動位置:友方受傷-10'],
    ['hBP05-021','友方成員交棒成本-1'],
    ['hBP05-023','中心位置:對手1st/2nd傷害-20'],
    ['hBP05-025','帶有道具成員+10dmg'],
    ['hBP05-032','聯動位置:中心ぼたん不受支援卡效果'],
    ['hBP05-036','被擊倒→吶喊替換給其他成員'],
    ['hBP05-044','中心+聯動HP+20'],
    ['hBP05-045','中心位置:友方受傷-20'],
    ['hBP05-050','被擊倒→從存檔回1張吶喊'],
    ['hBP05-060','對手回合中HP不受效果影響'],
    ['hBP05-063','聯動位置:對手中心-20dmg'],
    ['hBP05-066','帶有粉絲→HP+10 each'],
    ['hBP06-013','中心位置:自身HP不受效果影響'],
    ['hBP06-016','被擊倒→吶喊分配'],
    ['hBP06-048','中心位置:帶有道具→+20'],
    ['hBP06-050','聯動位置:友方受傷-10'],
    ['hBP06-053','被擊倒→重疊成員回手'],
    ['hBP06-055','中心:對手效果不影響HP'],
    ['hBP06-063','聯動:對手攻擊限定聯動'],
    ['hBP06-065','被擊倒→吶喊替換'],
    ['hBP06-073','中心:對手後方不受傷害'],
    ['hBP06-076','帶粉絲→HP+10'],
    ['hBP06-077','被擊倒→抽1張'],
    ['hBP07-015','中心:對手1st傷害-30'],
    ['hBP07-016','被擊倒→重疊回手'],
    ['hBP07-019','中心:HP不受效果影響'],
    ['hBP07-025','被擊倒→吶喊替換'],
    ['hBP07-029','聯動:友方受傷-10'],
    ['hBP07-032','被擊倒→吶喊替換'],
    ['hBP07-035','中心:對手藝能限定本成員'],
    ['hBP07-050','被擊倒→抽1'],
    ['hBP07-052','帶粉絲→+10 each'],
    ['hBP07-054','中心:HP不受效果影響'],
    ['hBP07-057','被擊倒→替換吶喊'],
    ['hBP07-060','聯動:中心-20受傷'],
  ];
  for(const[id,log]of passiveCards){
    reg(id,HOOK.ON_PASSIVE_GLOBAL,(s,c)=>PL(s,log));
  }

  // art1 conditional damage boosts
  const artBoostCards = [
    ['hBP05-010',HOOK.ON_ART_DECLARE,(s,c)=>{const n=c.memberInst?.attachedCheer?.length||0;return n>=3?PB(s,30,'≥3吶喊→+30'):P(s)}],
    ['hBP05-015',HOOK.ON_ART_DECLARE,(s,c)=>{const has=c.memberInst?.attachedSupport?.some(x=>getCard(x.cardId)?.type==='支援・道具');return has?PB(s,50,'有道具→+50'):P(s)}],
    ['hBP05-024',HOOK.ON_ART_DECLARE,(s,c)=>{const n=Math.min(4,getStageMembers(s.players[c.player]).filter(m=>hasTag(m.inst,'#シューター')).length);return PB(s,n*10,`${n}#シューター→+${n*10}`)}],
    ['hBP05-033',HOOK.ON_ART_DECLARE,(s,c)=>{const n=(c.memberInst?.attachedSupport||[]).filter(x=>getCard(x.cardId)?.type==='支援・粉絲').length;return PB(s,n*20,`${n}粉絲→+${n*20}`)}],
    ['hBP05-040',HOOK.ON_ART_DECLARE,(s,c)=>{const n=c.memberInst?.attachedCheer?.length||0;return n>=4?PB(s,40,'≥4吶喊→+40'):P(s)}],
    ['hBP05-046',HOOK.ON_ART_DECLARE,(s,c)=>{const n=c.memberInst?.bloomStack?.length||0;return PB(s,n*20,`${n}重疊→+${n*20}`)}],
    ['hBP05-051',HOOK.ON_ART_DECLARE,(s,c)=>{const n=Math.min(5,c.memberInst?.attachedCheer?.length||0);return PB(s,n*20,`${n}吶喊→+${n*20}`)}],
    ['hBP05-055',HOOK.ON_ART_DECLARE,(s,c)=>{const n=s.players[c.player].zones[ZONE.ARCHIVE].filter(x=>isMember(getCard(x.cardId)?.type)).length;return n>=5?PB(s,30,'存檔≥5成員→+30'):P(s)}],
    ['hBP05-061',HOOK.ON_ART_DECLARE,(s,c)=>{const n=s.players[c.player].zones[ZONE.BACKSTAGE].length;return PB(s,n*10,`${n}後台→+${n*10}`)}],
    ['hBP05-065',HOOK.ON_ART_DECLARE,(s,c)=>{const n=(c.memberInst?.attachedSupport||[]).filter(x=>getCard(x.cardId)?.type==='支援・粉絲').length;return PB(s,n*30,`${n}粉絲→+${n*30}`)}],
    ['hBP06-010',HOOK.ON_ART_DECLARE,(s,c)=>{const n=c.memberInst?.attachedCheer?.length||0;return n>=3?PB(s,30,'≥3吶喊→+30'):P(s)}],
    ['hBP06-017',HOOK.ON_ART_DECLARE,(s,c)=>{const n=c.memberInst?.bloomStack?.length||0;return PB(s,n*20,`${n}重疊→+${n*20}`)}],
    ['hBP06-049',HOOK.ON_ART_DECLARE,(s,c)=>{const has=c.memberInst?.attachedSupport?.some(x=>getCard(x.cardId)?.type==='支援・道具');return has?PB(s,30,'有道具→+30'):P(s)}],
    ['hBP06-051',HOOK.ON_ART_DECLARE,(s,c)=>{const n=Math.min(5,c.memberInst?.attachedCheer?.length||0);return PB(s,n*20,`${n}吶喊→+${n*20}`)}],
    ['hBP06-064',HOOK.ON_ART_DECLARE,(s,c)=>{const n=c.memberInst?.attachedCheer?.length||0;return n>=4?PB(s,40,'≥4吶喊→+40'):P(s)}],
    ['hBP06-071',HOOK.ON_ART_DECLARE,(s,c)=>{const n=c.memberInst?.attachedCheer?.length||0;return n>=3?PB(s,30,'≥3吶喊→+30'):P(s)}],
    ['hBP06-078',HOOK.ON_ART_DECLARE,(s,c)=>{const n=s.players[c.player].zones[ZONE.ARCHIVE].filter(x=>isMember(getCard(x.cardId)?.type)).length;return n>=8?PB(s,50,'存檔≥8成員→+50'):P(s)}],
    ['hBP07-017',HOOK.ON_ART_DECLARE,(s,c)=>{const n=c.memberInst?.attachedCheer?.length||0;return n>=4?PB(s,40,'≥4吶喊→+40'):P(s)}],
    ['hBP07-026',HOOK.ON_ART_DECLARE,(s,c)=>{const n=c.memberInst?.bloomStack?.length||0;return PB(s,n*20,`${n}重疊→+${n*20}`)}],
    ['hBP07-030',HOOK.ON_ART_DECLARE,(s,c)=>{const n=Math.min(4,c.memberInst?.attachedCheer?.length||0);return PB(s,n*20,`${n}吶喊→+${n*20}`)}],
    ['hBP07-033',HOOK.ON_ART_DECLARE,(s,c)=>{const n=s.players[c.player].zones[ZONE.BACKSTAGE].length;return PB(s,n*10,`${n}後台→+${n*10}`)}],
    ['hBP07-051',HOOK.ON_ART_DECLARE,(s,c)=>{const has=c.memberInst?.attachedCheer?.some(x=>getCard(x.cardId)?.color!=='藍');return has?PB(s,20,'非藍吶喊→+20'):P(s)}],
    ['hBP07-053',HOOK.ON_ART_DECLARE,(s,c)=>{const n=c.memberInst?.attachedCheer?.length||0;return n>=3?PB(s,30,'≥3吶喊→+30'):P(s)}],
    ['hBP07-055',HOOK.ON_ART_DECLARE,(s,c)=>{const n=c.memberInst?.bloomStack?.length||0;return n>=2?PB(s,50,'重疊≥2→+50'):P(s)}],
    ['hBP07-056',HOOK.ON_ART_DECLARE,(s,c)=>{const has=s.players[c.player].zones[ZONE.COLLAB]!==null;return has?PB(s,40,'有聯動→+40'):P(s)}],
    ['hBP07-058',HOOK.ON_ART_DECLARE,(s,c)=>{const n=Math.min(5,c.memberInst?.attachedCheer?.length||0);return PB(s,n*20,`${n}吶喊→+${n*20}`)}],
  ];
  for(const[id,hook,fn]of artBoostCards){reg(id,hook,fn)}

  // effectB: bloom triggers (search/draw/etc)
  const bloomCards = [
    ['hBP05-011',HOOK.ON_BLOOM,(s,c)=>{const p=s.players[c.player];const i=searchDeck(p,x=>getCard(x.cardId)?.name==='アキ・ローゼンタール',1);if(i.length){const[card]=pullFromDeck(p,i);p.zones[ZONE.HAND].push(card)}shuffleArr(p.zones[ZONE.DECK]);return PL(s,'搜尋アキ')}],
    ['hBP05-019',HOOK.ON_BLOOM,(s,c)=>{if(c.memberInst)sendCheerDeck(s.players[c.player],c.memberInst);return PL(s,'送吶喊')}],
    ['hBP05-026',HOOK.ON_BLOOM,(s,c)=>{drawCards(s.players[c.player],1);return PL(s,'抽1')}],
    ['hBP05-031',HOOK.ON_BLOOM,(s,c)=>{const p=s.players[c.player];const prompt=makeArchivePrompt(p,c.player,x=>getCard(x.cardId)?.type==='支援・粉絲','選擇存檔區的粉絲卡回手牌');if(prompt)return{state:s,resolved:false,prompt,log:'存檔粉絲回手'};return PL(s,'存檔無粉絲')}],
    ['hBP05-039',HOOK.ON_BLOOM,(s,c)=>{if(c.memberInst)c.memberInst.damage=Math.max(0,c.memberInst.damage-30);return PL(s,'HP回30')}],
    ['hBP05-043',HOOK.ON_BLOOM,(s,c)=>{damageOpp(s,c.player,20);return PL(s,'對手中心20特殊傷害')}],
    ['hBP05-049',HOOK.ON_BLOOM,(s,c)=>{if(c.memberInst)sendCheerDeck(s.players[c.player],c.memberInst);return PL(s,'送吶喊')}],
    ['hBP05-054',HOOK.ON_BLOOM,(s,c)=>{drawCards(s.players[c.player],1);return PL(s,'抽1')}],
    ['hBP05-059',HOOK.ON_BLOOM,(s,c)=>{drawCards(s.players[c.player],2);archiveHand(s.players[c.player],1);return PL(s,'抽2棄1')}],
    ['hBP05-064',HOOK.ON_BLOOM,(s,c)=>{const p=s.players[c.player];if(c.memberInst)sendCheerArchive(p,c.memberInst);return PL(s,'存檔吶喊→自身')}],
    ['hBP06-009',HOOK.ON_BLOOM,(s,c)=>{const p=s.players[c.player];const i=searchDeck(p,x=>getCard(x.cardId)?.type==='支援・吉祥物',1);if(i.length){const[card]=pullFromDeck(p,i);p.zones[ZONE.HAND].push(card)}shuffleArr(p.zones[ZONE.DECK]);return PL(s,'搜尋吉祥物')}],
    ['hBP06-011',HOOK.ON_BLOOM,(s,c)=>{drawCards(s.players[c.player],1);return PL(s,'抽1')}],
    ['hBP06-014',HOOK.ON_BLOOM,(s,c)=>{drawCards(s.players[c.player],1);return PL(s,'抽1')}],
    ['hBP06-046',HOOK.ON_BLOOM,(s,c)=>{if(c.memberInst)sendCheerDeck(s.players[c.player],c.memberInst);return PL(s,'送吶喊')}],
    ['hBP06-052',HOOK.ON_BLOOM,(s,c)=>{drawCards(s.players[c.player],1);return PL(s,'抽1')}],
    ['hBP06-054',HOOK.ON_BLOOM,(s,c)=>{if(c.memberInst)c.memberInst.damage=Math.max(0,c.memberInst.damage-30);return PL(s,'HP回30')}],
    ['hBP06-062',HOOK.ON_BLOOM,(s,c)=>{damageOpp(s,c.player,20);return PL(s,'對手中心20特殊傷害')}],
    ['hBP06-072',HOOK.ON_BLOOM,(s,c)=>{if(c.memberInst)sendCheerDeck(s.players[c.player],c.memberInst);return PL(s,'送吶喊')}],
    ['hBP06-074',HOOK.ON_BLOOM,(s,c)=>{const p=s.players[c.player];const prompt=makeArchivePrompt(p,c.player,x=>getCard(x.cardId)?.type==='支援・粉絲','選擇存檔區的粉絲卡回手牌');if(prompt)return{state:s,resolved:false,prompt,log:'存檔粉絲回手'};return PL(s,'存檔無粉絲')}],
    ['hBP07-018',HOOK.ON_BLOOM,(s,c)=>{drawCards(s.players[c.player],1);return PL(s,'抽1')}],
    ['hBP07-023',HOOK.ON_BLOOM,(s,c)=>{if(c.memberInst)sendCheerDeck(s.players[c.player],c.memberInst);return PL(s,'送吶喊')}],
    ['hBP07-028',HOOK.ON_BLOOM,(s,c)=>{drawCards(s.players[c.player],1);return PL(s,'抽1')}],
    ['hBP07-031',HOOK.ON_BLOOM,(s,c)=>{if(c.memberInst)c.memberInst.damage=Math.max(0,c.memberInst.damage-30);return PL(s,'HP回30')}],
    ['hBP07-049',HOOK.ON_BLOOM,(s,c)=>{drawCards(s.players[c.player],2);archiveHand(s.players[c.player],1);return PL(s,'抽2棄1')}],
  ];
  for(const[id,hook,fn]of bloomCards){reg(id,hook,fn)}

  // Support/equip cards (mostly log-only for passive effects)
  const supportCards = [
    ['hBP05-077','支援效果'],['hBP05-078','支援效果'],['hBP05-083','道具+10'],
    ['hBP05-084','道具+10'],['hBP05-085','吉祥物HP+20'],['hBP05-086','吉祥物HP+20'],
    ['hBP05-087','粉絲附加'],['hBP05-088','粉絲附加'],['hBP05-089','粉絲附加'],
    ['hBP06-086','道具+10'],['hBP06-087','道具+10'],['hBP06-088','吉祥物HP+20'],
    ['hBP06-089','吉祥物HP+20'],['hBP06-095','吉祥物HP+20'],['hBP06-096','吉祥物HP+20'],
    ['hBP06-100','粉絲附加'],['hBP06-101','粉絲附加'],['hBP06-102','粉絲附加'],['hBP06-103','粉絲附加'],
    ['hBP07-098','支援效果'],['hBP07-099','支援效果'],['hBP07-103','道具+20'],
    ['hBP07-105','吉祥物HP+20'],['hBP07-106','吉祥物HP+20'],['hBP07-107','吉祥物+10dmg'],
    ['hBP07-108','粉絲附加'],['hBP07-109','粉絲附加'],['hBP07-110','粉絲附加'],['hBP07-111','粉絲附加'],
  ];
  for(const[id,log]of supportCards){reg(id,HOOK.ON_PLAY,(s,c)=>PL(s,log))}

  return count;
}
