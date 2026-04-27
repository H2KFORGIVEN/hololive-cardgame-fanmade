// Phase C Batch 1: Card-specific handlers (100 cards)
import { getCard, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE, MEMBER_STATE, isMember, isSupport } from '../../core/constants.js';
import { applyDamageToMember, drawCards, getStageMembers, rollDieFor as _rollDieFor } from './common.js';

function shuffleArr(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function searchDeck(p,pred,n=1){const r=[];for(let i=0;i<p.zones[ZONE.DECK].length&&r.length<n;i++){if(pred(p.zones[ZONE.DECK][i]))r.push(i)}return r}
function pullFromDeck(p,idx){const s=[...idx].sort((a,b)=>b-a);return s.map(i=>p.zones[ZONE.DECK].splice(i,1)[0])}
// rollDie: shim that delegates to centralized common.rollDieFor for state-level
// override (hBP01-004 SP) and per-member reroll (hBP03-108, hBP01-123) support.
// Pass state and ctx (rolling member) when available; falls back to plain
// Math.random when called bare (legacy call sites).
function rollDie(state, ctx){
  if (state) return _rollDieFor(state, ctx);
  return Math.floor(Math.random()*6)+1;
}
function hasTag(c,t){return getCard(c.cardId)?.tag?.includes(t)}
function makeSearchPrompt(p,pIdx,pred,msg,action='ADD_TO_HAND',max=1){const m=[];for(const c of p.zones[ZONE.DECK]){if(pred(c)){const d=getCard(c.cardId);m.push({instanceId:c.instanceId,cardId:c.cardId,name:d?.name||'',image:getCardImage(c.cardId)})}}if(!m.length)return null;return{type:action==='PLACE_AND_SHUFFLE'?'SEARCH_SELECT_PLACE':'SEARCH_SELECT',player:pIdx,message:msg,cards:m,maxSelect:max,afterAction:action}}
function isMemberOfName(c,n){const d=getCard(c.cardId);return d&&isMember(d.type)&&d.name===n}
function damageOpp(s,p,amt,pos='center'){const o=s.players[1-p];const t=o.zones[pos==='collab'?ZONE.COLLAB:ZONE.CENTER];if(t)applyDamageToMember(t,amt)}
function archiveHand(p,n=1){let c=0;while(c<n&&p.zones[ZONE.HAND].length>0){p.zones[ZONE.ARCHIVE].push(p.zones[ZONE.HAND].shift());c++}return c}
function sendCheerDeck(p,m){if(!m||!p.zones[ZONE.CHEER_DECK].length)return false;const c=p.zones[ZONE.CHEER_DECK].shift();c.faceDown=false;m.attachedCheer.push(c);return true}
function sendCheerArchive(p,m,color=null){if(!m)return false;const i=p.zones[ZONE.ARCHIVE].findIndex(c=>{const d=getCard(c.cardId);return d?.type==='吶喊'&&(!color||d.color===color)});if(i<0)return false;const c=p.zones[ZONE.ARCHIVE].splice(i,1)[0];m.attachedCheer.push(c);return true}
function returnArchive(p,pred,n=1){let r=0;while(r<n){const i=p.zones[ZONE.ARCHIVE].findIndex(pred);if(i<0)break;p.zones[ZONE.HAND].push(p.zones[ZONE.ARCHIVE].splice(i,1)[0]);r++}return r}
function makeArchivePrompt(p,pIdx,pred,msg,max=1){const m=[];for(const c of p.zones[ZONE.ARCHIVE]){if(pred(c)){const d=getCard(c.cardId);m.push({instanceId:c.instanceId,cardId:c.cardId,name:d?.name||'',image:getCardImage(c.cardId)})}}if(!m.length)return null;return{type:'SELECT_FROM_ARCHIVE',player:pIdx,message:msg,cards:m,maxSelect:max,afterAction:'RETURN_FROM_ARCHIVE'}}
function makeCheerMovePrompt(player,pIdx,sourceInst,targetPred,msg,cheerColor){
  const targets=[];
  const members=getStageMembers(player);
  for(const m of members){
    if(m.inst.instanceId===sourceInst?.instanceId)continue;
    if(targetPred&&!targetPred(m.inst))continue;
    const d=getCard(m.inst.cardId);
    targets.push({instanceId:m.inst.instanceId,cardId:m.inst.cardId,name:d?.name||'',image:getCardImage(m.inst.cardId)});
  }
  if(!targets.length||!sourceInst?.attachedCheer?.length)return null;
  return{type:'CHEER_MOVE',player:pIdx,message:msg,cards:targets,maxSelect:1,afterAction:'CHEER_MOVE',sourceInstanceId:sourceInst.instanceId,cheerPredicate:cheerColor||'any'};
}
function boost(amt,t='self'){return{type:'DAMAGE_BOOST',amount:amt,target:t,duration:'instant'}}
function boostTurn(amt,t='self'){return{type:'DAMAGE_BOOST',amount:amt,target:t,duration:'turn'}}

export function registerPhaseC1(){
  let count=0;
  const reg=(id,hook,fn)=>{registerEffect(id,hook,fn);count++};

  // hBP01-004 兎田ぺこら oshi — real handler in phaseB-cards.js Round F-3
  // hBP01-005 鷹嶺ルイ oshi — real handler in phaseB-cards.js Round F-3
  // (Removed log-only placeholders that were clobbering the F-3 handlers
  // because phaseC1 registers AFTER phaseB.)
  // hBP01-015 七詩ムメイ art1: used support → +20
  reg('hBP01-015',HOOK.ON_ART_DECLARE,(s,c)=>{
    const p=s.players[c.player];
    if(p.usedLimited||p.zones[ZONE.ARCHIVE].some(x=>isSupport(getCard(x.cardId)?.type)))
      return{state:s,resolved:true,effect:boost(20),log:'本回合用過支援→+20'};
    return{state:s,resolved:true};
  });
  // hBP01-020 七詩ムメイ effectC+art1
  reg('hBP01-020',HOOK.ON_COLLAB,(s,c)=>{
    const p=s.players[c.player];
    const prompt=makeSearchPrompt(p,c.player,x=>hasTag(x,'#Promise'),'搜尋 #Promise 成員加入手牌');
    if(prompt)return{state:s,resolved:false,prompt,log:'搜尋#Promise成員'};
    shuffleArr(p.zones[ZONE.DECK]);
    return{state:s,resolved:true,log:'牌組無#Promise成員'};
  });
  reg('hBP01-020',HOOK.ON_ART_DECLARE,(s,c)=>{
    const back=s.players[c.player].zones[ZONE.BACKSTAGE].length;
    return{state:s,resolved:true,effect:boostTurn(back*10,'center_collab'),log:`${back}後台→中心聯動+${back*10}`};
  });
  // hBP01-023 ときのそら effectC+art1
  reg('hBP01-023',HOOK.ON_COLLAB,(s,c)=>{drawCards(s.players[c.player],2);return{state:s,resolved:true,log:'抽2張'}});
  reg('hBP01-023',HOOK.ON_ART_DECLARE,(s,c)=>{
    const roll=rollDie(s, { player: c.player, member: c.memberInst });
    if(roll%2===1)return{state:s,resolved:true,log:`骰${roll}:再次使用同藝能`};
    return{state:s,resolved:true,log:`骰${roll}`};
  });
  // hBP01-031 IRyS effectC+art1
  reg('hBP01-031',HOOK.ON_COLLAB,(s,c)=>{
    const p=s.players[c.player];
    if(p.zones[ZONE.HOLO_POWER].length>0){const card=p.zones[ZONE.HOLO_POWER].pop();card.faceDown=false;p.zones[ZONE.HAND].push(card)}
    if(p.zones[ZONE.DECK].length>0){const card=p.zones[ZONE.DECK].shift();card.faceDown=true;p.zones[ZONE.HOLO_POWER].push(card)}
    return{state:s,resolved:true,log:'能量區取1→手牌，牌組→能量區'};
  });
  reg('hBP01-031',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=getStageMembers(s.players[c.player]).filter(m=>hasTag(m.inst,'#Promise')).length;
    return{state:s,resolved:true,effect:boost(n*20),log:`${n}#Promise→+${n*20}`};
  });
  // hBP01-035 アキ effectB+art1
  reg('hBP01-035',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];
    const i=p.zones[ZONE.ARCHIVE].findIndex(x=>getCard(x.cardId)?.type==='支援・道具');
    if(i>=0&&c.memberInst){c.memberInst.attachedSupport.push(p.zones[ZONE.ARCHIVE].splice(i,1)[0])}
    return{state:s,resolved:true,log:'存檔道具附加給成員'};
  });
  reg('hBP01-035',HOOK.ON_ART_RESOLVE,(s,c)=>{
    if(c.memberInst?.attachedSupport?.some(x=>getCard(x.cardId)?.type==='支援・道具')){
      const p=s.players[c.player];const t=getStageMembers(p)[0];if(t)sendCheerDeck(p,t.inst)}
    return{state:s,resolved:true,log:'有道具→送吶喊'};
  });
  // hBP01-037 アキ effectB+art1
  reg('hBP01-037',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];if(c.memberInst)sendCheerDeck(p,c.memberInst);
    if(c.memberInst?.attachedSupport?.some(x=>getCard(x.cardId)?.type==='支援・道具'))
      c.memberInst.damage=Math.max(0,c.memberInst.damage-40);
    return{state:s,resolved:true,log:'送吶喊+有道具HP回40'};
  });
  reg('hBP01-037',HOOK.ON_ART_DECLARE,(s,c)=>{
    if(c.memberInst?.attachedSupport?.some(x=>getCard(x.cardId)?.type==='支援・道具'))
      return{state:s,resolved:true,effect:boost(50),log:'有道具→+50'};
    return{state:s,resolved:true};
  });
  // hBP01-042 兎田ぺこら art2: dice per point +10
  reg('hBP01-042',HOOK.ON_ART_DECLARE,(s,c)=>{
    if(c.artKey!=='art2')return{state:s,resolved:true};
    const r=rollDie(s, { player: c.player, member: c.memberInst });return{state:s,resolved:true,effect:boost(r*10),log:`骰${r}→+${r*10}`};
  });
  // hBP01-043 兎田ぺこら effectB+art1
  reg('hBP01-043',HOOK.ON_BLOOM,(s,c)=>{if(c.memberInst)c.memberInst.damage=Math.max(0,c.memberInst.damage-50);return{state:s,resolved:true,log:'HP回50'}});
  reg('hBP01-043',HOOK.ON_ART_DECLARE,(s,c)=>{
    let t=0;for(let i=0;i<3;i++)t+=rollDie(s, { player: c.player, member: c.memberInst });
    return{state:s,resolved:true,effect:boost(t*10),log:`骰3次=${t}→+${t*10}`};
  });
  // hBP01-052 アイラニ art1: move cheer to #ID member
  reg('hBP01-052',HOOK.ON_ART_RESOLVE,(s,c)=>{
    const p=s.players[c.player];
    const prompt=makeCheerMovePrompt(p,c.player,c.memberInst,x=>hasTag(x,'#ID'),'選擇要接收吶喊的 #ID 成員');
    if(prompt)return{state:s,resolved:false,prompt,log:'吶喊替換給#ID成員'};
    return{state:s,resolved:true,log:'無可替換對象'};
  });
  // hBP01-075 ハコス effectC: both return hand then draw
  reg('hBP01-075',HOOK.ON_COLLAB,(s,c)=>{
    for(let p=0;p<2;p++){const pl=s.players[p];const n=pl.zones[ZONE.HAND].length;while(pl.zones[ZONE.HAND].length)pl.zones[ZONE.DECK].push(pl.zones[ZONE.HAND].pop());drawCards(pl,n)}
    return{state:s,resolved:true,log:'雙方手牌洗回→各重抽'};
  });
  // hBP01-092 オーロ art1: move cheer to #Promise
  reg('hBP01-092',HOOK.ON_ART_RESOLVE,(s,c)=>{
    const p=s.players[c.player];
    const prompt=makeCheerMovePrompt(p,c.player,c.memberInst,x=>hasTag(x,'#Promise'),'選擇要接收吶喊的 #Promise 成員');
    if(prompt)return{state:s,resolved:false,prompt,log:'吶喊替換給#Promise成員'};
    return{state:s,resolved:true};
  });
  // hBP01-095 オーロ effectC+art1
  reg('hBP01-095',HOOK.ON_COLLAB,(s,c)=>{
    const opp=s.players[1-c.player];
    const targets=[];
    for(const m of opp.zones[ZONE.BACKSTAGE]){
      const d=getCard(m.cardId);
      if(d&&d.bloom!=='Debut'&&d.bloom!=='Spot'){
        targets.push({instanceId:m.instanceId,cardId:m.cardId,name:d?.name||'',image:getCardImage(m.cardId)});
      }
    }
    if(targets.length){
      return{state:s,resolved:false,prompt:{type:'SELECT_TARGET',player:c.player,message:'選擇對手後台 1 位成員返回 Debut',cards:targets,maxSelect:1,afterAction:'REVERT_TO_DEBUT',targetPlayer:1-c.player}};
    }
    return{state:s,resolved:true,log:'對手後台無可返回的成員'};
  });
  reg('hBP01-095',HOOK.ON_ART_RESOLVE,(s,c)=>{
    // Flag all backstage Debut members placed this turn: allow bloom
    const p=s.players[c.player];
    for(const m of p.zones[ZONE.BACKSTAGE]){
      if(m.placedThisTurn){const d=getCard(m.cardId);if(d&&d.bloom==='Debut')m.canBloomThisTurn=true}
    }
    return{state:s,resolved:true,log:'本回合放置的Debut可綻放為1st'};
  });
  // hBP01-097 不知火フレア effectC
  reg('hBP01-097',HOOK.ON_COLLAB,(s,c)=>{
    const p=s.players[c.player];const center=p.zones[ZONE.CENTER];
    const i=p.zones[ZONE.BACKSTAGE].findIndex(m=>m.state===MEMBER_STATE.ACTIVE);
    if(center&&i>=0){const b=p.zones[ZONE.BACKSTAGE].splice(i,1)[0];p.zones[ZONE.BACKSTAGE].push(center);p.zones[ZONE.CENTER]=b;b.state=MEMBER_STATE.ACTIVE}
    return{state:s,resolved:true,log:'中心↔後台交換'};
  });
  // hBP01-110 鈍器
  reg('hBP01-110',HOOK.ON_PLAY,(s,c)=>{
    const roll=rollDie(s, { player: c.player, member: c.memberInst });const opp=s.players[1-c.player];
    if(roll<=3){const t=opp.zones[ZONE.CENTER]||opp.zones[ZONE.COLLAB];
      if(t&&t.attachedCheer.length)opp.zones[ZONE.ARCHIVE].push(t.attachedCheer.shift())}
    return{state:s,resolved:true,log:`骰${roll}:${roll<=3?'對手吶喊→存檔':'無效'}`};
  });
  // hBP01-118 あん肝 mascot HP+10
  reg('hBP01-118',HOOK.ON_PLAY,(s,c)=>({state:s,resolved:true,log:'吉祥物HP+10'}));
  // hBP01-119 ジョブズ mascot HP+10 + heal on art
  reg('hBP01-119',HOOK.ON_PLAY,(s,c)=>({state:s,resolved:true,log:'吉祥物HP+10'}));
  reg('hBP01-119',HOOK.ON_ART_RESOLVE,(s,c)=>{
    const m=getStageMembers(s.players[c.player]).find(x=>x.inst.damage>0);
    if(m)m.inst.damage=Math.max(0,m.inst.damage-10);
    return{state:s,resolved:true,log:'1位成員HP回10'};
  });
  // hBP02-009 白上フブキ Debut effectG:
  //   [Limited collab] All own members carrying a 吉祥物 (mascot) +10 art damage.
  // Fires per art declaration via firePassiveModifiers. Pushes +10 when this
  // フブキ is in collab AND the attacker is own AND the attacker has at least
  // one 吉祥物 attached.
  reg('hBP02-009',HOOK.ON_PASSIVE_GLOBAL,(state,ctx)=>{
    if(!ctx.attacker)return{state,resolved:true};
    if(ctx.player!==ctx.attackerPlayer)return{state,resolved:true};
    const me=ctx.memberInst;
    const myPlayer=state.players[ctx.player];
    if(myPlayer?.zones[ZONE.COLLAB]?.instanceId!==me?.instanceId){
      return{state,resolved:true};
    }
    const hasMascot=(ctx.attacker.attachedSupport||[]).some(s=>{
      const d=getCard(s.cardId);
      return d?.type==='支援・吉祥物';
    });
    if(!hasMascot)return{state,resolved:true};
    return{
      state,resolved:true,
      effect:{type:'DAMAGE_BOOST',amount:10,target:'self',duration:'instant'},
      log:'フブキ passive: 帶吉祥物成員 +10',
    };
  });
  // hBP02-012 白上フブキ effectB+art1
  reg('hBP02-012',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];
    // Find a member with a mascot
    const srcMember=getStageMembers(p).find(m=>(m.inst.attachedSupport||[]).some(x=>getCard(x.cardId)?.type==='支援・吉祥物'));
    if(srcMember){
      // Build target list (other members without a mascot)
      const targets=[];
      for(const m of getStageMembers(p)){
        if(m.inst.instanceId===srcMember.inst.instanceId)continue;
        if((m.inst.attachedSupport||[]).some(x=>getCard(x.cardId)?.type==='支援・吉祥物'))continue;
        const d=getCard(m.inst.cardId);
        targets.push({instanceId:m.inst.instanceId,cardId:m.inst.cardId,name:d?.name||'',image:getCardImage(m.inst.cardId)});
      }
      if(targets.length){
        // Move mascot from source
        const mascotIdx=(srcMember.inst.attachedSupport||[]).findIndex(x=>getCard(x.cardId)?.type==='支援・吉祥物');
        return{state:s,resolved:false,prompt:{type:'CHEER_MOVE',player:c.player,message:'選擇要接收吉祥物的成員',cards:targets,maxSelect:1,afterAction:'SUPPORT_MOVE',sourceInstanceId:srcMember.inst.instanceId,supportIndex:mascotIdx}};
      }
    }
    return{state:s,resolved:true,log:'無可替換的吉祥物'};
  });
  reg('hBP02-012',HOOK.ON_ART_DECLARE,(s,c)=>({state:s,resolved:true,effect:boostTurn(20,'mascot_members'),log:'帶吉祥物中心聯動+20'}));
  // hBP02-013 白上フブキ effectG+art1
  reg('hBP02-013',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>({state:s,resolved:true,log:'可帶2張不同吉祥物'}));
  reg('hBP02-013',HOOK.ON_ART_DECLARE,(s,c)=>{
    let n=0;for(const m of getStageMembers(s.players[c.player]))n+=(m.inst.attachedSupport||[]).filter(x=>getCard(x.cardId)?.type==='支援・吉祥物').length;
    return{state:s,resolved:true,effect:boost(n*20),log:`${n}吉祥物→+${n*20}`};
  });
  // hBP02-017 白銀ノエル art2
  reg('hBP02-017',HOOK.ON_ART_DECLARE,(s,c)=>{
    if(c.artKey!=='art2')return{state:s,resolved:true};
    const n=Math.min(4,getStageMembers(s.players[c.player]).filter(m=>m.inst.instanceId!==c.memberInst?.instanceId&&hasTag(m.inst,'#3期生')).length);
    return{state:s,resolved:true,effect:boost(n*20),log:`${n}#3期生→+${n*20}`};
  });
  // hBP02-024 大神ミオ art1: move cheer
  reg('hBP02-024',HOOK.ON_ART_RESOLVE,(s,c)=>{
    const p=s.players[c.player];
    const prompt=makeCheerMovePrompt(p,c.player,c.memberInst,x=>hasTag(x,'#JP'),'選擇要接收吶喊的 #JP 成員');
    if(prompt)return{state:s,resolved:false,prompt,log:'吶喊替換給#JP成員'};
    return{state:s,resolved:true};
  });
  // hBP02-041 猫又おかゆ effectG+art1
  reg('hBP02-041',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>({state:s,resolved:true,log:'中心位置:おかゆ特殊傷害+20'}));
  reg('hBP02-041',HOOK.ON_ART_RESOLVE,(s,c)=>{
    const m=c.memberInst;const bi=m?.attachedCheer.findIndex(x=>getCard(x.cardId)?.color==='藍');
    if(bi>=0){s.players[c.player].zones[ZONE.ARCHIVE].push(m.attachedCheer.splice(bi,1)[0]);
      damageOpp(s,c.player,20,'center');const opp=s.players[1-c.player];
      if(opp.zones[ZONE.BACKSTAGE].length)applyDamageToMember(opp.zones[ZONE.BACKSTAGE][0],20)}
    return{state:s,resolved:true,log:'棄藍吶喊→中心+後台各20'};
  });
  // hBP02-046 紫咲シオン effectB+art1
  reg('hBP02-046',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];if(p.zones[ZONE.HAND].length){archiveHand(p,1);
      const prompt=makeArchivePrompt(p,c.player,x=>hasTag(x,'#魔法'),'選擇存檔區的 #魔法 卡回手牌');
      if(prompt)return{state:s,resolved:false,prompt,log:'棄1→取存檔#魔法'}}
    return{state:s,resolved:true,log:'棄1，存檔無#魔法'};
  });
  reg('hBP02-046',HOOK.ON_ART_DECLARE,(s,c)=>{
    const r=rollDie(s, { player: c.player, member: c.memberInst });if(r>=5)return{state:s,resolved:true,log:`骰${r}:對手吶喊替換`};
    return{state:s,resolved:true,log:`骰${r}`};
  });
  // hBP02-049 クレイジー effectC
  reg('hBP02-049',HOOK.ON_COLLAB,(s,c)=>{const p=s.players[c.player];drawCards(p,1);archiveHand(p,1);return{state:s,resolved:true,log:'抽1棄1'}});
  // hBP02-051 クレイジー effectB
  reg('hBP02-051',HOOK.ON_BLOOM,(s,c)=>{
    // Allow 1 #ID2期生 Debut to bloom using archive member
    const p=s.players[c.player];
    // Find Debut #ID2期生 members on stage
    const debuts=getStageMembers(p).filter(m=>{
      const d=getCard(m.inst.cardId);
      return d&&d.bloom==='Debut'&&hasTag(m.inst,'#ID2期生');
    });
    if(!debuts.length)return{state:s,resolved:true,log:'無 Debut #ID2期生'};
    // Find valid bloom targets in archive (1st members with same name)
    const archiveCards=[];
    for(const d of debuts){
      const name=getCard(d.inst.cardId)?.name;
      for(const ac of p.zones[ZONE.ARCHIVE]){
        const ad=getCard(ac.cardId);
        if(ad&&ad.name===name&&isMember(ad.type)&&(ad.bloom==='1st'||ad.bloom==='2nd')){
          archiveCards.push({instanceId:ac.instanceId,cardId:ac.cardId,name:ad.name+' ('+ad.bloom+')',image:getCardImage(ac.cardId),targetDebutId:d.inst.instanceId});
        }
      }
    }
    if(archiveCards.length){
      return{state:s,resolved:false,prompt:{type:'SELECT_FROM_ARCHIVE',player:c.player,message:'選擇存檔區的成員進行綻放（限界化）',cards:archiveCards,maxSelect:1,afterAction:'BLOOM_FROM_ARCHIVE'}};
    }
    return{state:s,resolved:true,log:'存檔無可用於綻放的成員'};
  });
  // hBP02-052 クレイジー effectB+art1
  reg('hBP02-052',HOOK.ON_BLOOM,(s,c)=>{drawCards(s.players[c.player],1);return{state:s,resolved:true,log:'抽1'}});
  reg('hBP02-052',HOOK.ON_ART_DECLARE,(s,c)=>{
    const m=c.memberInst;const hasNonPurple=m?.attachedCheer.some(x=>getCard(x.cardId)?.color!=='紫');
    return hasNonPurple?{state:s,resolved:true,effect:boost(20),log:'非紫吶喊→+20'}:{state:s,resolved:true};
  });
  // hBP02-053 クレイジー effectB+art1
  reg('hBP02-053',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];if(p.zones[ZONE.HAND].length>=2){archiveHand(p,2);
      return{state:s,resolved:true,effect:boostTurn(40),log:'棄2→本回合+40'}}
    return{state:s,resolved:true};
  });
  reg('hBP02-053',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=getStageMembers(s.players[c.player]).filter(m=>{const d=getCard(m.inst.cardId);return d?.bloom==='2nd'&&hasTag(m.inst,'#ID2期生')&&m.inst.instanceId!==c.memberInst?.instanceId}).length;
    return n>=2?{state:s,resolved:true,effect:boost(40),log:`2+個2nd #ID2期生→+40`}:{state:s,resolved:true};
  });
  // hBP02-058 森カリオペ effectB+art1
  reg('hBP02-058',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];
    const prompt=makeArchivePrompt(p,c.player,x=>{const n=getCard(x.cardId)?.name;return n==='森カリオペの鎌'||n==='Death-sensei'},'選擇存檔區的鎌或Death-sensei回手牌');
    if(prompt)return{state:s,resolved:false,prompt,log:'存檔鎌/Death回手牌'};
    return{state:s,resolved:true,log:'存檔無鎌/Death'};
  });
  reg('hBP02-058',HOOK.ON_ART_DECLARE,(s,c)=>{
    const has=c.memberInst?.attachedSupport?.some(x=>{const t=getCard(x.cardId)?.type;return t==='支援・道具'||t==='支援・吉祥物'});
    return has?{state:s,resolved:true,effect:boost(30),log:'有道具/吉祥物→+30'}:{state:s,resolved:true};
  });
  // hBP02-059 森カリオペ effectB+art1
  reg('hBP02-059',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];if(p.zones[ZONE.DECK].length){const card=p.zones[ZONE.DECK].shift();card.faceDown=false;p.zones[ZONE.ARCHIVE].push(card)}
    shuffleArr(p.zones[ZONE.DECK]);return{state:s,resolved:true,log:'牌頂→存檔+洗牌'};
  });
  reg('hBP02-059',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=s.players[c.player].zones[ZONE.ARCHIVE].filter(x=>isMember(getCard(x.cardId)?.type)&&hasTag(x,'#Myth')).length;
    let b=0;if(n>=4)b+=40;if(n>=8)b+=40;
    return b?{state:s,resolved:true,effect:boost(b),log:`${n}#Myth存檔→+${b}`}:{state:s,resolved:true};
  });
  // hBP02-064 一伊那尓栖 art1
  reg('hBP02-064',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=s.players[c.player].zones[ZONE.ARCHIVE].filter(x=>isMember(getCard(x.cardId)?.type)&&hasTag(x,'#Myth')).length;
    return n>=10?{state:s,resolved:true,effect:boost(50),log:`${n}#Myth→+50`}:{state:s,resolved:true};
  });
  // hBP02-065 ネリッサ art1
  reg('hBP02-065',HOOK.ON_ART_DECLARE,(s,c)=>{
    const has=c.memberInst?.attachedCheer.some(x=>getCard(x.cardId)?.color==='紅');
    return has?{state:s,resolved:true,effect:boost(10),log:'紅吶喊→+10'}:{state:s,resolved:true};
  });
  // hBP02-068 ネリッサ effectC
  reg('hBP02-068',HOOK.ON_COLLAB,(s,c)=>({state:s,resolved:true,effect:boostTurn(30,'tag:#歌'),log:'#歌中心聯動+30'}));
  // hBP02-083 魔法のタンス
  reg('hBP02-083',HOOK.ON_PLAY,(s,c)=>{
    const p=s.players[c.player];if(p.zones[ZONE.HOLO_POWER].length){p.zones[ZONE.ARCHIVE].push(p.zones[ZONE.HOLO_POWER].shift())}
    const shion=getStageMembers(p).find(m=>getCard(m.inst.cardId)?.name==='紫咲シオン');
    if(shion)sendCheerArchive(p,shion.inst,'紫');
    return{state:s,resolved:true,log:'能量→存檔，紫吶喊→シオン'};
  });
  // hBP02-086 ホロスパークリング tool +20
  reg('hBP02-086',HOOK.ON_ART_DECLARE,(s,c)=>({state:s,resolved:true,effect:boost(20),log:'道具+20'}));
  // hBP02-087 シオンのステッキ tool +10
  reg('hBP02-087',HOOK.ON_ART_DECLARE,(s,c)=>({state:s,resolved:true,effect:boost(10),log:'道具+10'}));
  // hBP02-090 ネジマキツネ mascot HP+20
  reg('hBP02-090',HOOK.ON_PLAY,(s,c)=>({state:s,resolved:true,log:'吉祥物HP+20'}));
  // hBP02-093 ミテイル mascot HP+20
  reg('hBP02-093',HOOK.ON_PLAY,(s,c)=>({state:s,resolved:true,log:'吉祥物HP+20，後方免傷'}));
  // hBP02-098 Death-sensei mascot HP+20
  reg('hBP02-098',HOOK.ON_PLAY,(s,c)=>({state:s,resolved:true,log:'吉祥物HP+20，藝能吶喊變無色'}));
  // hBP02-099 すこん部 fan HP+10
  reg('hBP02-099',HOOK.ON_PLAY,(s,c)=>({state:s,resolved:true,log:'粉絲HP+10'}));
  // hBP02-100 白銀聖騎士団 fan dmg-10
  reg('hBP02-100',HOOK.ON_PLAY,(s,c)=>({state:s,resolved:true,log:'粉絲受傷-10'}));
  // hBP03-013 姫森ルーナ effectG+art1
  // effectG: [Limited collab] If own center 姫森ルーナ has a 粉絲 attached,
  // that center +20 art damage. We're a real boost push when:
  //   • This passive owner (this ルーナ) is in own collab
  //   • Attacker is the own center 姫森ルーナ with at least 1 attached 粉絲
  reg('hBP03-013',HOOK.ON_PASSIVE_GLOBAL,(state,ctx)=>{
    if(!ctx.attacker)return{state,resolved:true};
    if(ctx.player!==ctx.attackerPlayer)return{state,resolved:true};
    const me=ctx.memberInst;
    const myPlayer=state.players[ctx.player];
    if(myPlayer?.zones[ZONE.COLLAB]?.instanceId!==me?.instanceId){
      return{state,resolved:true};
    }
    if(myPlayer.zones[ZONE.CENTER]?.instanceId!==ctx.attacker.instanceId){
      return{state,resolved:true};
    }
    const atkCard=getCard(ctx.attacker.cardId);
    if(atkCard?.name!=='姫森ルーナ')return{state,resolved:true};
    const hasFan=(ctx.attacker.attachedSupport||[]).some(s=>{
      const d=getCard(s.cardId);
      return d?.type==='支援・粉絲';
    });
    if(!hasFan)return{state,resolved:true};
    return{
      state,resolved:true,
      effect:{type:'DAMAGE_BOOST',amount:20,target:'self',duration:'instant'},
      log:'ルーナ passive: 帶粉絲中心ルーナ +20',
    };
  });
  reg('hBP03-013',HOOK.ON_ART_RESOLVE,(s,c)=>{
    const p=s.players[c.player];const t=getStageMembers(p).find(m=>getCard(m.inst.cardId)?.name==='姫森ルーナ');
    if(t){const i=p.zones[ZONE.ARCHIVE].findIndex(x=>getCard(x.cardId)?.name==='ルーナイト');
      if(i>=0)t.inst.attachedSupport.push(p.zones[ZONE.ARCHIVE].splice(i,1)[0])}
    return{state:s,resolved:true,log:'存檔ルーナイト附加'};
  });
  // hBP03-014 姫森ルーナ effectB+art1
  reg('hBP03-014',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];if(getCard(p.oshi?.cardId)?.name==='姫森ルーナ'){
      const i=p.zones[ZONE.ARCHIVE].findIndex(x=>getCard(x.cardId)?.name==='ルーナイト');
      if(i>=0&&c.memberInst)c.memberInst.attachedSupport.push(p.zones[ZONE.ARCHIVE].splice(i,1)[0])}
    return{state:s,resolved:true,log:'存檔ルーナイト附加'};
  });
  reg('hBP03-014',HOOK.ON_ART_DECLARE,(s,c)=>{
    const has=c.memberInst?.attachedSupport?.some(x=>getCard(x.cardId)?.name==='ルーナイト');
    return has?{state:s,resolved:true,effect:boost(50),log:'有ルーナイト→+50'}:{state:s,resolved:true};
  });
  // hBP03-015 轟はじめ 2nd effectG:
  //   [Limited center] Own #ReGLOSS collab members take −20 damage.
  // Pushes DAMAGE_REDUCTION 20 when:
  //   • This passive owner (轟はじめ) is in own center
  //   • The attack target is own collab AND has #ReGLOSS tag
  reg('hBP03-015',HOOK.ON_PASSIVE_GLOBAL,(state,ctx)=>{
    if(!ctx.target||!ctx.attacker)return{state,resolved:true};
    if(ctx.player===ctx.attackerPlayer)return{state,resolved:true};
    const me=ctx.memberInst;
    const myPlayer=state.players[ctx.player];
    if(myPlayer?.zones[ZONE.CENTER]?.instanceId!==me?.instanceId)return{state,resolved:true};
    if(myPlayer.zones[ZONE.COLLAB]?.instanceId!==ctx.target.instanceId)return{state,resolved:true};
    if(!hasTag(ctx.target,'#ReGLOSS'))return{state,resolved:true};
    return{
      state,resolved:true,
      effect:{type:'DAMAGE_REDUCTION',amount:20,target:'self',duration:'instant'},
      log:'はじめ passive: #ReGLOSS 聯動受傷 -20',
    };
  });
  reg('hBP03-015',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=s.players[c.player].zones[ZONE.BACKSTAGE].filter(m=>hasTag(m,'#ReGLOSS')).length;
    return n>=4?{state:s,resolved:true,effect:boost(40),log:`${n}#ReGLOSS後台→+40`}:{state:s,resolved:true};
  });
  // hBP03-021 獅白ぼたん effectB+art1
  reg('hBP03-021',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];const backs=p.zones[ZONE.BACKSTAGE].filter(m=>hasTag(m,'#シューター')).slice(0,2);
    for(const m of backs)sendCheerArchive(p,m,'綠');
    return{state:s,resolved:true,log:'綠吶喊→#シューター後台'};
  });
  reg('hBP03-021',HOOK.ON_ART_RESOLVE,(s,c)=>{
    const p=s.players[c.player];if(getCard(p.oshi?.cardId)?.name==='獅白ぼたん'){
      const back=p.zones[ZONE.BACKSTAGE].find(m=>m.attachedCheer.length>0);
      if(back){p.zones[ZONE.ARCHIVE].push(back.attachedCheer.shift());damageOpp(s,c.player,40)}}
    return{state:s,resolved:true,log:'後台吶喊→存檔，40特殊傷害'};
  });
  // hBP03-022 アキ effectG+art1
  reg('hBP03-022',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>({state:s,resolved:true,log:'表演階段開始:生命不受效果影響'}));
  reg('hBP03-022',HOOK.ON_ART_RESOLVE,(s,c)=>{
    const p=s.players[c.player];if(getCard(p.oshi?.cardId)?.name!=='アキ・ローゼンタール')return{state:s,resolved:true};
    for(const m of getStageMembers(p)){if(m.inst.attachedSupport?.some(x=>getCard(x.cardId)?.type==='支援・道具'))m.inst.damage=Math.max(0,m.inst.damage-10)}
    return{state:s,resolved:true,log:'帶道具成員HP回10'};
  });
  // hBP03-023 兎田ぺこら effectC+art1
  reg('hBP03-023',HOOK.ON_COLLAB,(s,c)=>{
    const r=rollDie(s, { player: c.player, member: c.memberInst });if(r%2===0){const p=s.players[c.player];
      const prompt=makeSearchPrompt(p,c.player,x=>getCard(x.cardId)?.type==='支援・粉絲','搜尋粉絲卡加入手牌');
      if(prompt)return{state:s,resolved:false,prompt,log:`骰${r}:搜尋粉絲`};
      shuffleArr(p.zones[ZONE.DECK])}
    return{state:s,resolved:true,log:`骰${r}:${r%2===0?'牌組無粉絲':'無效果'}`};
  });
  reg('hBP03-023',HOOK.ON_ART_DECLARE,(s,c)=>({state:s,resolved:true,effect:boost(40),log:'本回合擲過骰→+40'}));
  // hBP03-024 風真いろは effectB+art1
  reg('hBP03-024',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];
    const iroha=getStageMembers(p).find(m=>getCard(m.inst.cardId)?.name==='風真いろは');
    const suisei=getStageMembers(p).find(m=>getCard(m.inst.cardId)?.name==='星街すいせい');
    if(iroha)sendCheerArchive(p,iroha.inst);if(suisei)sendCheerArchive(p,suisei.inst);
    return{state:s,resolved:true,log:'存檔吶喊→風真+星街'};
  });
  reg('hBP03-024',HOOK.ON_ART_DECLARE,(s,c)=>{
    const nonGreen=c.memberInst?.attachedCheer.filter(x=>getCard(x.cardId)?.color!=='綠').length||0;
    return nonGreen>=2?{state:s,resolved:true,effect:boost(50),log:'非綠吶喊≥2→+50'}:{state:s,resolved:true};
  });
  // hBP03-029 さくらみこ effectB+art1
  reg('hBP03-029',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];
    const prompt=makeSearchPrompt(p,c.player,x=>getCard(x.cardId)?.name==='35P','搜尋 35P 加入手牌');
    if(prompt)return{state:s,resolved:false,prompt,log:'搜尋35P'};
    shuffleArr(p.zones[ZONE.DECK]);
    return{state:s,resolved:true,log:'牌組無35P'};
  });
  reg('hBP03-029',HOOK.ON_ART_DECLARE,(s,c)=>{
    const has=c.memberInst?.attachedSupport?.some(x=>getCard(x.cardId)?.name==='35P');
    return has?{state:s,resolved:true,effect:boost(30),log:'有35P→+30'}:{state:s,resolved:true};
  });
  // hBP03-030 さくらみこ effectG+art1
  reg('hBP03-030',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>{
    const m=c.memberInst;if(!m?.attachedSupport?.some(x=>getCard(x.cardId)?.name==='35P'))return{state:s,resolved:true};
    const r=rollDie(s, { player: c.player, member: c.memberInst });return(r===3||r===5)?{state:s,resolved:true,effect:boostTurn(50),log:`骰${r}→本回合+50`}:{state:s,resolved:true,log:`骰${r}`};
  });
  reg('hBP03-030',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=(c.memberInst?.attachedSupport||[]).filter(x=>getCard(x.cardId)?.name==='35P').length;
    return{state:s,resolved:true,effect:boost(n*20),log:`${n}×35P→+${n*20}`};
  });
  // hBP03-037 モココ art1
  reg('hBP03-037',HOOK.ON_ART_DECLARE,(s,c)=>{
    const center=s.players[c.player].zones[ZONE.CENTER];
    if(center&&getCard(center.cardId)?.name==='フワワ・アビスガード')return{state:s,resolved:true,log:'中心為フワワ→不需吶喊'};
    return{state:s,resolved:true};
  });
  // hBP03-039 モココ effectG+art1
  reg('hBP03-039',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>({state:s,resolved:true,log:'フワワ為中心→不需休息'}));
  reg('hBP03-039',HOOK.ON_ART_DECLARE,(s,c)=>{
    const center=s.players[c.player].zones[ZONE.CENTER];
    if(center&&getCard(center.cardId)?.name==='フワワ・アビスガード')return{state:s,resolved:true,effect:boost(30),log:'中心フワワ→+30'};
    return{state:s,resolved:true};
  });
  // hBP03-045 こぼ effectB+art1
  reg('hBP03-045',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];const m=getStageMembers(p).find(x=>hasTag(x.inst,'#ID')&&x.inst.attachedCheer.length);
    if(m){p.zones[ZONE.ARCHIVE].push(m.inst.attachedCheer.shift());
      const opp=s.players[1-c.player];const backs=opp.zones[ZONE.BACKSTAGE].slice(0,3);
      let dmgLeft=30;for(const b of backs){const d=Math.min(10,dmgLeft);applyDamageToMember(b,d);dmgLeft-=d;if(dmgLeft<=0)break}}
    return{state:s,resolved:true,log:'對手後台分配30特殊傷害'};
  });
  reg('hBP03-045',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=s.players[1-c.player].zones[ZONE.BACKSTAGE].filter(m=>m.damage>0).length;
    return{state:s,resolved:true,effect:boost(n*10),log:`${n}受傷後台→+${n*10}`};
  });
  // hBP03-048 火威青 art2
  reg('hBP03-048',HOOK.ON_ART_RESOLVE,(s,c)=>{
    if(c.artKey!=='art2')return{state:s,resolved:true};
    const p=s.players[c.player];
    const backTargets=x=>{const d=getCard(x.cardId);return hasTag(x,'#ReGLOSS')&&p.zones[ZONE.BACKSTAGE].includes(x)};
    const prompt=makeCheerMovePrompt(p,c.player,c.memberInst,backTargets,'選擇要接收吶喊的 #ReGLOSS 後台成員');
    if(prompt)return{state:s,resolved:false,prompt,log:'吶喊替換給#ReGLOSS後台'};
    return{state:s,resolved:true};
  });
  // hBP03-054 常闇トワ effectC+art1
  reg('hBP03-054',HOOK.ON_COLLAB,(s,c)=>{damageOpp(s,c.player,20);return{state:s,resolved:true,log:'中心/聯動20特殊傷害'}});
  reg('hBP03-054',HOOK.ON_ART_RESOLVE,(s,c)=>{
    const p=s.players[c.player];const member=c.memberInst;
    if(!member)return{state:s,resolved:true};
    // Remove 4 purple cheer from this member
    let removed=0;
    for(let i=member.attachedCheer.length-1;i>=0&&removed<4;i--){
      if(getCard(member.attachedCheer[i].cardId)?.color==='紫'){
        p.zones[ZONE.ARCHIVE].push(member.attachedCheer.splice(i,1)[0]);removed++;
      }
    }
    if(removed>=4){
      // Remove 1 cheer from opponent's stage member, return to cheer deck
      const opp=s.players[1-c.player];
      const oppMembers=getStageMembers(opp);
      for(const m of oppMembers){
        if(m.inst.attachedCheer?.length>0){
          const cheer=m.inst.attachedCheer.shift();
          opp.zones[ZONE.CHEER_DECK].push(cheer);break;
        }
      }
    }
    return{state:s,resolved:true,log:`棄${removed}紫吶喊${removed>=4?'→對手吶喊回牌組':''}`};
  });
  // hBP03-060 ロボ子さん art1
  reg('hBP03-060',HOOK.ON_ART_DECLARE,(s,c)=>{
    let n=0;for(const m of getStageMembers(s.players[1-c.player]))n+=m.inst.attachedCheer.length;
    return n>=7?{state:s,resolved:true,effect:boost(70),log:`對手${n}吶喊≥7→+70`}:{state:s,resolved:true};
  });
  // hBP03-068 角巻わため art1
  reg('hBP03-068',HOOK.ON_ART_RESOLVE,(s,c)=>{
    const p=s.players[c.player];const has=c.memberInst?.attachedSupport?.some(x=>getCard(x.cardId)?.name==='わためいと');
    if(has){const y=getStageMembers(p).find(m=>getCard(m.inst.cardId)?.color==='黃');if(y)sendCheerArchive(p,y.inst)}
    return{state:s,resolved:true,log:'有わためいと→存檔吶喊送黃色成員'};
  });
  // hBP03-072 角巻わため effectG+art1
  reg('hBP03-072',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>({state:s,resolved:true,log:'被擊倒→吶喊替換給其他わため'}));
  reg('hBP03-072',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=c.memberInst?.attachedCheer?.length||0;
    return n>=6?{state:s,resolved:true,effect:boostTurn(100,'center_collab'),log:'吶喊≥6→中心+聯動+100'}:{state:s,resolved:true};
  });
  // hBP03-073 アユンダ art2
  reg('hBP03-073',HOOK.ON_ART_RESOLVE,(s,c)=>{
    if(c.artKey!=='art2')return{state:s,resolved:true};
    const p=s.players[c.player];
    const korone=getStageMembers(p).find(m=>getCard(m.inst.cardId)?.name==='戌神ころね');
    if(korone&&c.memberInst?.attachedCheer?.length>0){
      const cheer=c.memberInst.attachedCheer.shift();
      korone.inst.attachedCheer.push(cheer);
      return{state:s,resolved:true,log:'吶喊→戌神ころね'};
    }
    return{state:s,resolved:true};
  });
  // hBP03-074 アユンダ art1
  reg('hBP03-074',HOOK.ON_ART_DECLARE,(s,c)=>{
    const p=s.players[c.player];let b=0;
    if(getStageMembers(p).some(m=>getCard(m.inst.cardId)?.name==='アイラニ・イオフィフティーン'))b+=10;
    if(getStageMembers(p).some(m=>getCard(m.inst.cardId)?.name==='ムーナ・ホシノヴァ'))b+=10;
    return b?{state:s,resolved:true,effect:boost(b),log:`同伴→+${b}`}:{state:s,resolved:true};
  });
  // hBP03-078 アユンダ effectB+art1
  reg('hBP03-078',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];
    // Find a #ID1期生 member with cheer as source
    const source=getStageMembers(p).find(m=>hasTag(m.inst,'#ID1期生')&&m.inst.attachedCheer?.length>0);
    if(source){
      const prompt=makeCheerMovePrompt(p,c.player,source.inst,null,'選擇要接收 #ID1期生 吶喊的成員');
      if(prompt)return{state:s,resolved:false,prompt,log:'#ID1期生吶喊替換'};
    }
    return{state:s,resolved:true};
  });
  reg('hBP03-078',HOOK.ON_ART_DECLARE,(s,c)=>{
    let b=0;const cheers=c.memberInst?.attachedCheer||[];
    if(cheers.some(x=>getCard(x.cardId)?.color==='綠'))b+=50;
    if(cheers.some(x=>getCard(x.cardId)?.color==='藍'))b+=50;
    return b?{state:s,resolved:true,effect:boost(b),log:`綠/藍吶喊→+${b}`}:{state:s,resolved:true};
  });
  // hBP03-079 不知火フレア effectB+art1
  reg('hBP03-079',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];const ci=p.zones[ZONE.CHEER_DECK].findIndex(x=>getCard(x.cardId)?.color==='黃');
    if(ci>=0&&c.memberInst){const ch=p.zones[ZONE.CHEER_DECK].splice(ci,1)[0];ch.faceDown=false;c.memberInst.attachedCheer.push(ch)}
    shuffleArr(p.zones[ZONE.CHEER_DECK]);return{state:s,resolved:true,log:'吶喊牌組黃→自身'};
  });
  reg('hBP03-079',HOOK.ON_ART_DECLARE,(s,c)=>{
    return(c.memberInst?.attachedCheer?.length||0)>=3?{state:s,resolved:true,effect:boost(30),log:'≥3吶喊→+30'}:{state:s,resolved:true};
  });
  // hBP03-082 音乃瀬奏 effectB
  reg('hBP03-082',HOOK.ON_BLOOM,(s,c)=>{
    // Move 1-2 cheer from other stage members to this member
    const p=s.players[c.player];
    const source=getStageMembers(p).find(m=>m.inst.instanceId!==c.memberInst?.instanceId&&m.inst.attachedCheer?.length>0);
    if(source&&c.memberInst){
      const cheer=source.inst.attachedCheer.shift();
      c.memberInst.attachedCheer.push(cheer);
      return{state:s,resolved:true,log:'1張吶喊替換給自身'};
    }
    return{state:s,resolved:true};
  });
  // hBP03-083 音乃瀬奏 effectG
  reg('hBP03-083',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>({state:s,resolved:true,log:'對手表演結束生命減→送吶喊'}));
  // hBP03-087 コールアンドレスポンス
  reg('hBP03-087',HOOK.ON_PLAY,(s,c)=>{
    const p=s.players[c.player];
    const source=getStageMembers(p).find(m=>m.inst.attachedCheer?.length>0);
    if(source){
      const prompt=makeCheerMovePrompt(p,c.player,source.inst,null,'選擇要接收吶喊的成員');
      if(prompt)return{state:s,resolved:false,prompt,log:'吶喊替換給成員'};
    }
    return{state:s,resolved:true};
  });
  // hBP03-097 リコーダー tool +10
  reg('hBP03-097',HOOK.ON_ART_DECLARE,(s,c)=>({state:s,resolved:true,effect:boost(10),log:'道具+10'}));
  // hBP03-100 ペロ mascot HP+20
  reg('hBP03-100',HOOK.ON_PLAY,(s,c)=>({state:s,resolved:true,log:'吉祥物HP+20，吶喊變無色'}));
  // hBP03-106 SSRB fan
  reg('hBP03-106',HOOK.ON_PLAY,(s,c)=>({state:s,resolved:true,log:'SSRB附加'}));
  // hBP03-108 はあとん fan
  reg('hBP03-108',HOOK.ON_PLAY,(s,c)=>({state:s,resolved:true,log:'はあとん附加(可重擲骰)'}));
  // hBP03-109 Ruffians fan
  reg('hBP03-109',HOOK.ON_PLAY,(s,c)=>({state:s,resolved:true,log:'Ruffians附加'}));
  // hBP03-110 ろぼさー fan
  reg('hBP03-110',HOOK.ON_PLAY,(s,c)=>({state:s,resolved:true,log:'ろぼさー附加(視為紫吶喊,-10dmg)'}));
  // hBP03-111 ころねすきー fan
  reg('hBP03-111',HOOK.ON_PLAY,(s,c)=>({state:s,resolved:true,log:'ころねすきー(交棒-1)'}));
  // hBP03-112 わためいと fan
  reg('hBP03-112',HOOK.ON_PLAY,(s,c)=>({state:s,resolved:true,log:'わためいと附加'}));
  // hBP04-011 博衣こより art1
  reg('hBP04-011',HOOK.ON_ART_RESOLVE,(s,c)=>{
    const p=s.players[c.player];const i=p.zones[ZONE.ARCHIVE].findIndex(x=>getCard(x.cardId)?.name==='こよりの助手くん');
    if(i>=0){const card=p.zones[ZONE.ARCHIVE].splice(i,1)[0];
      const t=getStageMembers(p).find(m=>getCard(m.inst.cardId)?.name==='博衣こより'&&m.inst.instanceId!==c.memberInst?.instanceId);
      if(t)t.inst.attachedSupport.push(card)}
    return{state:s,resolved:true,log:'存檔助手くん附加給其他こより'};
  });
  // hBP04-013 博衣こより effectG+art1
  reg('hBP04-013',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>({state:s,resolved:true,log:'擊倒時牌組→能量區+取1張手牌'}));
  reg('hBP04-013',HOOK.ON_ART_DECLARE,(s,c)=>{
    if(!c.memberInst?.attachedSupport?.some(x=>hasTag(x,'#こよラボ')))return{state:s,resolved:true};
    const p=s.players[c.player];
    const prompt=makeSearchPrompt(p,c.player,x=>hasTag(x,'#こよラボ'),'搜尋 #こよラボ 支援卡加入手牌');
    if(prompt)return{state:s,resolved:false,prompt,log:'搜尋#こよラボ支援卡'};
    shuffleArr(p.zones[ZONE.DECK]);
    return{state:s,resolved:true,log:'牌組無#こよラボ'};
  });
  // hBP04-014 白上フブキ effectB+art1
  reg('hBP04-014',HOOK.ON_BLOOM,(s,c)=>{
    const prompt=makeArchivePrompt(s.players[c.player],c.player,x=>hasTag(x,'#白上\'sキャラクター'),'選擇存檔區的 #白上キャラ 回手牌（最多 2 張）',2);
    if(prompt)return{state:s,resolved:false,prompt,log:'存檔#白上キャラ回手牌'};
    return{state:s,resolved:true,log:'存檔無#白上キャラ'};
  });
  reg('hBP04-014',HOOK.ON_ART_DECLARE,(s,c)=>{
    const has=getStageMembers(s.players[c.player]).some(m=>getCard(m.inst.cardId)?.name!=='白上フブキ'&&hasTag(m.inst,'#ゲーマーズ'));
    return has?{state:s,resolved:true,effect:boost(50),log:'有其他#ゲーマーズ→+50'}:{state:s,resolved:true};
  });
  // hBP04-015 IRyS art1
  reg('hBP04-015',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=Math.min(4,getStageMembers(s.players[c.player]).filter(m=>hasTag(m.inst,'#Promise')).length);
    return{state:s,resolved:true,effect:boost(n*10),log:`${n}#Promise→+${n*10}`};
  });
  // hBP04-019 ラオーラ effectC+art1
  reg('hBP04-019',HOOK.ON_COLLAB,(s,c)=>{
    const p=s.players[c.player];const top3=p.zones[ZONE.DECK].slice(0,3);
    const cards=[];
    for(const x of top3){if(hasTag(x,'#絵')){const d=getCard(x.cardId);cards.push({instanceId:x.instanceId,cardId:x.cardId,name:d?.name||'',image:getCardImage(x.cardId)})}}
    if(cards.length)return{state:s,resolved:false,prompt:{type:'SEARCH_SELECT',player:c.player,message:'牌組頂 3 張中選擇 #絵 成員加入手牌',cards,maxSelect:1,afterAction:'ADD_TO_HAND'}};
    return{state:s,resolved:true,log:'頂3張無#絵成員'};
  });
  reg('hBP04-019',HOOK.ON_ART_DECLARE,(s,c)=>{
    const center=s.players[c.player].zones[ZONE.CENTER];
    return center&&hasTag(center,'#絵')?{state:s,resolved:true,effect:boost(80),log:'中心#絵→+80'}:{state:s,resolved:true};
  });
  // hBP04-021 儒烏風亭らでん effectC
  reg('hBP04-021',HOOK.ON_COLLAB,(s,c)=>{
    const p=s.players[c.player];
    // Check if player used a #きのこ activity this turn
    const usedKinoko=p.zones[ZONE.ARCHIVE].some(x=>hasTag(x,'#きのこ')&&getCard(x.cardId)?.type==='支援・活動');
    if(usedKinoko){
      const target=getStageMembers(p).find(m=>hasTag(m.inst,'#ReGLOSS')&&m.inst.damage>0);
      if(target)target.inst.damage=Math.max(0,target.inst.damage-20);
      return{state:s,resolved:true,log:'用過#きのこ→#ReGLOSS回20HP'};
    }
    return{state:s,resolved:true};
  });
  // hBP04-023 儒烏風亭らでん effectG
  reg('hBP04-023',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>({state:s,resolved:true,log:'被擊倒→吶喊替換給#ReGLOSS'}));
  // hBP04-024 儒烏風亭らでん effectG+art1
  reg('hBP04-024',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>({state:s,resolved:true,log:'中心:對手主要階段HP不受效果影響'}));
  reg('hBP04-024',HOOK.ON_ART_RESOLVE,(s,c)=>{
    if(c.memberInst)sendCheerArchive(s.players[c.player],c.memberInst);
    return{state:s,resolved:true,log:'存檔吶喊→自身'};
  });
  // hBP04-025 儒烏風亭らでん effectC+art1
  reg('hBP04-025',HOOK.ON_COLLAB,(s,c)=>{
    const p=s.players[c.player];
    const prompt=makeSearchPrompt(p,c.player,x=>hasTag(x,'#きのこ')&&getCard(x.cardId)?.type==='支援・活動','搜尋 #きのこ 活動卡加入手牌');
    if(prompt)return{state:s,resolved:false,prompt,log:'搜尋#きのこ活動'};
    shuffleArr(p.zones[ZONE.DECK]);
    return{state:s,resolved:true,log:'牌組無#きのこ活動'};
  });
  reg('hBP04-025',HOOK.ON_ART_DECLARE,(s,c)=>{
    if(getCard(s.players[c.player].oshi?.cardId)?.name!=='儒烏風亭らでん')return{state:s,resolved:true};
    return{state:s,resolved:true,effect:boost(30),log:'推し=らでん→+30'};
  });
  // hBP04-026 大神ミオ effectB+art1
  reg('hBP04-026',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];if(getCard(p.oshi?.cardId)?.name!=='白上フブキ')return{state:s,resolved:true};
    const fubuki=getStageMembers(p).find(m=>getCard(m.inst.cardId)?.name==='白上フブキ');
    if(fubuki){const ci=p.zones[ZONE.CHEER_DECK].findIndex(x=>getCard(x.cardId)?.color==='白');
      if(ci>=0){const ch=p.zones[ZONE.CHEER_DECK].splice(ci,1)[0];ch.faceDown=false;fubuki.inst.attachedCheer.push(ch)}
      shuffleArr(p.zones[ZONE.CHEER_DECK])}
    return{state:s,resolved:true,log:'白吶喊→白上フブキ'};
  });
  reg('hBP04-026',HOOK.ON_ART_DECLARE,(s,c)=>{
    const has=getStageMembers(s.players[c.player]).some(m=>getCard(m.inst.cardId)?.name!=='大神ミオ'&&hasTag(m.inst,'#ゲーマーズ'));
    return has?{state:s,resolved:true,effect:boost(50),log:'有其他#ゲーマーズ→+50'}:{state:s,resolved:true};
  });
  // hBP04-030 セシリア effectB
  reg('hBP04-030',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];
    const source=getStageMembers(p).find(m=>m.inst.attachedCheer?.length>0);
    if(source){
      const prompt=makeCheerMovePrompt(p,c.player,source.inst,null,'選擇要接收吶喊的成員（1-2 張）');
      if(prompt)return{state:s,resolved:false,prompt,log:'吶喊重分配'};
    }
    return{state:s,resolved:true};
  });
  // hBP04-031 セシリア effectG+art1
  reg('hBP04-031',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>{
    const opp=s.players[1-c.player];const hasJPorID=getStageMembers(opp).some(m=>hasTag(m.inst,'#JP')||hasTag(m.inst,'#ID'));
    return hasJPorID?{state:s,resolved:true,effect:boostTurn(30),log:'對手有#JP/#ID→+30'}:{state:s,resolved:true};
  });
  reg('hBP04-031',HOOK.ON_ART_RESOLVE,(s,c)=>{
    const p=s.players[c.player];const back=p.zones[ZONE.BACKSTAGE].find(m=>hasTag(m,'#語学'));
    if(back){const col=getCard(back.cardId)?.color;if(col){
      const ci=p.zones[ZONE.CHEER_DECK].findIndex(x=>getCard(x.cardId)?.color===col);
      if(ci>=0){const ch=p.zones[ZONE.CHEER_DECK].splice(ci,1)[0];ch.faceDown=false;back.attachedCheer.push(ch)}
      shuffleArr(p.zones[ZONE.CHEER_DECK])}}
    return{state:s,resolved:true,log:'同色吶喊→#語学後台'};
  });
  // hBP04-038 宝鐘マリン effectB+art1
  reg('hBP04-038',HOOK.ON_BLOOM,(s,c)=>{damageOpp(s,c.player,10);damageOpp(s,c.player,10,'collab');return{state:s,resolved:true,log:'中心+聯動各10特殊傷害'}});
  reg('hBP04-038',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=(c.memberInst?.bloomStack?.length||0);
    return{state:s,resolved:true,effect:boost(n*20),log:`${n}重疊→+${n*20}`};
  });
  // hBP04-055 ラプラス effectC+art1
  reg('hBP04-055',HOOK.ON_COLLAB,(s,c)=>{
    const r=rollDie(s, { player: c.player, member: c.memberInst });if(r>=3){const opp=s.players[1-c.player];
      const back=opp.zones[ZONE.BACKSTAGE].find(m=>m.state===MEMBER_STATE.ACTIVE);
      if(back)back.state=MEMBER_STATE.REST}
    return{state:s,resolved:true,log:`骰${r}:${r>=3?'對手後台→休息':'無'}`};
  });
  reg('hBP04-055',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=s.players[1-c.player].zones[ZONE.BACKSTAGE].filter(m=>m.state===MEMBER_STATE.REST).length;
    return{state:s,resolved:true,effect:boost(n*10),log:`${n}休息→+${n*10}`};
  });
  // hBP04-060 紫咲シオン effectB+art1
  reg('hBP04-060',HOOK.ON_BLOOM,(s,c)=>{
    const opp=s.players[1-c.player];const center=opp.zones[ZONE.CENTER];
    if(center){const ci=opp.zones[ZONE.ARCHIVE].findIndex(x=>getCard(x.cardId)?.type==='吶喊');
      if(ci>=0)center.attachedCheer.push(opp.zones[ZONE.ARCHIVE].splice(ci,1)[0])}
    return{state:s,resolved:true,log:'對手存檔吶喊→對手中心'};
  });
  reg('hBP04-060',HOOK.ON_ART_DECLARE,(s,c)=>{
    const opp=s.players[1-c.player];const center=opp.zones[ZONE.CENTER];
    const n=center?.attachedCheer?.length||0;
    if(n>0){damageOpp(s,c.player,n*10);damageOpp(s,c.player,n*10,'collab')}
    return{state:s,resolved:true,log:`對手中心${n}吶喊→各${n*10}特殊傷害`};
  });
  // hBP04-061 クレイジー effectB+art1
  reg('hBP04-061',HOOK.ON_BLOOM,(s,c)=>{
    // If bloomed via SP skill, heal 1 クレイジー・オリー fully
    const p=s.players[c.player];
    const ollie=getStageMembers(p).find(m=>getCard(m.inst.cardId)?.name==='クレイジー・オリー'&&m.inst.damage>0);
    if(ollie)ollie.inst.damage=0;
    return{state:s,resolved:true,log:'1位クレイジー・オリー完全回復'};
  });
  reg('hBP04-061',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=getStageMembers(s.players[c.player]).filter(m=>{const d=getCard(m.inst.cardId);return d?.bloom==='2nd'&&hasTag(m.inst,'#ID2期生')&&m.inst.instanceId!==c.memberInst?.instanceId}).length;
    return{state:s,resolved:true,effect:boost(n*20),log:`${n}其他2nd #ID2期生→+${n*20}`};
  });
  // hBP04-062 森カリオペ effectG+art1
  reg('hBP04-062',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>({state:s,resolved:true,log:'有鎌/Death→#Myth中心+30'}));
  reg('hBP04-062',HOOK.ON_ART_RESOLVE,(s,c)=>{
    const p=s.players[c.player];const top2=p.zones[ZONE.DECK].splice(0,2);
    if(top2.length>0){top2[0].faceDown=false;p.zones[ZONE.ARCHIVE].push(top2[0])}
    if(top2.length>1)p.zones[ZONE.DECK].unshift(top2[1]);
    return{state:s,resolved:true,log:'頂2→1進存檔，1回頂'};
  });
  // hBP04-063 古石ビジュー effectG
  reg('hBP04-063',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>({state:s,resolved:true,log:'被擊倒→抽1張'}));
  // hBP04-065 古石ビジュー effectB+art1
  reg('hBP04-065',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];const m=getStageMembers(p).find(x=>x.inst.attachedCheer.some(ch=>getCard(ch.cardId)?.color==='紅'));
    if(m){const ri=m.inst.attachedCheer.findIndex(ch=>getCard(ch.cardId)?.color==='紅');
      if(ri>=0){p.zones[ZONE.ARCHIVE].push(m.inst.attachedCheer.splice(ri,1)[0]);drawCards(p,2)}}
    return{state:s,resolved:true,log:'棄紅吶喊→抽2'};
  });
  reg('hBP04-065',HOOK.ON_ART_DECLARE,(s,c)=>{
    const has=s.players[c.player].zones[ZONE.ARCHIVE].some(x=>{const d=getCard(x.cardId);return d?.type==='吶喊'&&d?.color==='紅'});
    return has?{state:s,resolved:true,effect:boost(20),log:'存檔有紅吶喊→+20'}:{state:s,resolved:true};
  });

  return count;
}
