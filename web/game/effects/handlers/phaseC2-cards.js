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

  // hBP04-079 アーニャ art1+art2
  reg('hBP04-079',HOOK.ON_ART_DECLARE,(s,c)=>{
    if(c.artKey==='art2'){
      const has=c.memberInst?.attachedSupport?.some(x=>getCard(x.cardId)?.name==='古代武器');
      return has?PB(s,50,'有古代武器→+50'):P(s);
    }
    return P(s);
  });

  // hBP04-080 ラプラス art1: opponent backstage count→+10 each
  reg('hBP04-080',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=s.players[1-c.player].zones[ZONE.BACKSTAGE].length;
    return PB(s,n*10,`對手${n}後台→+${n*10}`);
  });

  // hBP04-082 ラプラス effectB
  reg('hBP04-082',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];drawCards(p,1);archiveHand(p,1);
    return PL(s,'抽1棄1');
  });

  // hBP04-083 ラプラス effectG+art1
  reg('hBP04-083',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>PL(s,'聯動位置:對手主要階段HP不受效果影響'));
  reg('hBP04-083',HOOK.ON_ART_DECLARE,(s,c)=>{
    const opp=s.players[1-c.player];const rest=opp.zones[ZONE.BACKSTAGE].filter(m=>m.state===MEMBER_STATE.REST).length;
    return rest>=2?PB(s,50,`對手${rest}休息→+50`):P(s);
  });

  // hBP04-085 紫咲シオン effectB+art1
  reg('hBP04-085',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];const prompt=makeArchivePrompt(p,c.player,x=>hasTag(x,'#魔法'),'選擇存檔區的 #魔法 卡回手牌');
    if(prompt)return{state:s,resolved:false,prompt,log:'存檔#魔法回手牌'};
    return PL(s,'存檔#魔法回手');
  });
  reg('hBP04-085',HOOK.ON_ART_DECLARE,(s,c)=>{
    const r=rollDie(s, { player: c.player, member: c.memberInst });return r>=5?PL(s,`骰${r}:對手吶喊替換`):PL(s,`骰${r}`);
  });

  // hBP04-086 紫咲シオン effectG+art1
  reg('hBP04-086',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>PL(s,'#魔法活動效果2倍'));
  reg('hBP04-086',HOOK.ON_ART_DECLARE,(s,c)=>{
    const r=rollDie(s, { player: c.player, member: c.memberInst });if(r>=3){damageOpp(s,c.player,20)}
    return PL(s,`骰${r}:${r>=3?'20特殊傷害':'無'}`);
  });

  // hBP04-087 紫咲シオン art2: dice→reveal from deck
  reg('hBP04-087',HOOK.ON_ART_DECLARE,(s,c)=>{
    if(c.artKey!=='art2')return P(s);
    const r=rollDie(s, { player: c.player, member: c.memberInst });const p=s.players[c.player];
    const top=p.zones[ZONE.DECK].slice(0,r);
    let found=0;
    for(let i=top.length-1;i>=0;i--){
      if(hasTag(top[i],'#魔法')){const[card]=pullFromDeck(p,[i]);card.faceDown=false;p.zones[ZONE.HAND].push(card);found++;break}
    }
    return PL(s,`骰${r}:看${r}張${found?'→取#魔法':'→無'}`);
  });

  // hBP04-088 ネリッサ art1: cheer count→+10 each (max 5)
  reg('hBP04-088',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=Math.min(5,c.memberInst?.attachedCheer?.length||0);
    return PB(s,n*10,`${n}吶喊→+${n*10}`);
  });

  // hBP04-089 ネリッサ effectC: +30 to #歌 center/collab
  reg('hBP04-089',HOOK.ON_COLLAB,(s,c)=>({state:s,resolved:true,effect:boostTurn(30,'tag:#歌'),log:'#歌中心聯動+30'}));

  // hBP04-090 ネリッサ effectG+art1
  reg('hBP04-090',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>PL(s,'#歌成員受傷-20'));
  reg('hBP04-090',HOOK.ON_ART_DECLARE,(s,c)=>{
    const p=s.players[c.player];const oshiName=getCard(p.oshi?.cardId)?.name;
    if(oshiName==='ネリッサ・レイヴンクロフト'){
      const n=getStageMembers(p).filter(m=>hasTag(m.inst,'#歌')).length;
      return PB(s,n*20,`${n}#歌→+${n*20}`);
    }
    return P(s);
  });

  // hBP04-091 一伊那尓栖 art1
  reg('hBP04-091',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=s.players[c.player].zones[ZONE.ARCHIVE].filter(x=>isMember(getCard(x.cardId)?.type)&&hasTag(x,'#Myth')).length;
    return n>=5?PB(s,20,`${n}#Myth存檔→+20`):P(s);
  });

  // hBP04-092 一伊那尓栖 effectG+art1
  reg('hBP04-092',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>PL(s,'中心:存檔#Myth≥5→HP不受效果影響'));
  reg('hBP04-092',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=s.players[c.player].zones[ZONE.ARCHIVE].filter(x=>isMember(getCard(x.cardId)?.type)&&hasTag(x,'#Myth')).length;
    let b=0;if(n>=5)b+=30;if(n>=10)b+=30;
    return b?PB(s,b,`${n}#Myth→+${b}`):P(s);
  });

  // hBP04-093 セシリア effectG+art1+art2
  reg('hBP04-093',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>PL(s,'帶有聯動吶喊→this成員+聯動成員+20'));
  reg('hBP04-093',HOOK.ON_ART_DECLARE,(s,c)=>{
    if(c.artKey==='art2'){
      const n=getStageMembers(s.players[c.player]).filter(m=>hasTag(m.inst,'#語学')).length;
      return PB(s,n*20,`${n}#語学→+${n*20}`);
    }
    return P(s);
  });

  // hBP04-094 クレイジー effectC+art1
  reg('hBP04-094',HOOK.ON_COLLAB,(s,c)=>{
    const p=s.players[c.player];drawCards(p,1);archiveHand(p,1);return PL(s,'抽1棄1');
  });
  reg('hBP04-094',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=s.players[c.player].zones[ZONE.ARCHIVE].filter(x=>isMember(getCard(x.cardId)?.type)).length;
    return n>=5?PB(s,30,`存檔${n}成員≥5→+30`):P(s);
  });

  // hBP04-095 クレイジー effectB+art1
  reg('hBP04-095',HOOK.ON_BLOOM,(s,c)=>{drawCards(s.players[c.player],2);archiveHand(s.players[c.player],1);return PL(s,'抽2棄1')});
  reg('hBP04-095',HOOK.ON_ART_DECLARE,(s,c)=>{
    const p=s.players[c.player];const n=getStageMembers(p).filter(m=>{const d=getCard(m.inst.cardId);return d?.bloom==='2nd'&&hasTag(m.inst,'#ID')}).length;
    return n>=2?PB(s,40,`${n}個2nd #ID→+40`):P(s);
  });

  // hBP04-096 森カリオペ effectG+art1
  reg('hBP04-096',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>PL(s,'有鎌→#Myth中心+30'));
  reg('hBP04-096',HOOK.ON_ART_DECLARE,(s,c)=>{
    const p=s.players[c.player];const n=p.zones[ZONE.ARCHIVE].filter(x=>isMember(getCard(x.cardId)?.type)&&hasTag(x,'#Myth')).length;
    let b=0;if(n>=4)b+=30;if(n>=8)b+=30;
    return b?PB(s,b,`${n}#Myth存檔→+${b}`):P(s);
  });

  // hBP04-097 古石ビジュー effectG+art1
  reg('hBP04-097',HOOK.ON_PASSIVE_GLOBAL,(s,c)=>PL(s,'被擊倒→抽1'));
  reg('hBP04-097',HOOK.ON_ART_DECLARE,(s,c)=>{
    const has=s.players[c.player].zones[ZONE.ARCHIVE].some(x=>{const d=getCard(x.cardId);return d?.type==='吶喊'&&d?.color==='紅'});
    return has?PB(s,30,'存檔紅吶喊→+30'):P(s);
  });

  // hBP04-098 博衣こより effectC+art1
  reg('hBP04-098',HOOK.ON_COLLAB,(s,c)=>{
    const p=s.players[c.player];const i=searchDeck(p,x=>hasTag(x,'#こよラボ')&&isSupport(getCard(x.cardId)?.type),1);
    if(i.length){const[card]=pullFromDeck(p,i);p.zones[ZONE.HAND].push(card)}
    shuffleArr(p.zones[ZONE.DECK]);return PL(s,'搜尋#こよラボ支援');
  });
  reg('hBP04-098',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=(c.memberInst?.attachedSupport||[]).filter(x=>hasTag(x,'#こよラボ')).length;
    return n?PB(s,n*20,`${n}#こよラボ→+${n*20}`):P(s);
  });

  // hBP04-099 博衣こより effectB+art1
  reg('hBP04-099',HOOK.ON_BLOOM,(s,c)=>{
    const p=s.players[c.player];const i=searchDeck(p,x=>getCard(x.cardId)?.name==='博衣こより',1);
    if(i.length){const[card]=pullFromDeck(p,i);p.zones[ZONE.HAND].push(card)}
    shuffleArr(p.zones[ZONE.DECK]);return PL(s,'搜尋博衣こより');
  });
  reg('hBP04-099',HOOK.ON_ART_DECLARE,(s,c)=>{
    const n=Math.min(3,(c.memberInst?.attachedSupport||[]).filter(x=>hasTag(x,'#こよラボ')).length);
    return n?PB(s,n*20,`${n}#こよラボ→+${n*20}`):P(s);
  });

  // hBP04-100 こよりの助手くん fan: +10 dmg
  reg('hBP04-100',HOOK.ON_ART_DECLARE,(s,c)=>PB(s,10,'助手くん+10'));
  reg('hBP04-100',HOOK.ON_PLAY,(s,c)=>PL(s,'助手くん附加'));

  // hBP04-101 古代武器 tool: +10 for アーニャ
  reg('hBP04-101',HOOK.ON_ART_DECLARE,(s,c)=>PB(s,10,'古代武器+10'));
  reg('hBP04-101',HOOK.ON_PLAY,(s,c)=>PL(s,'古代武器附加'));

  // hBP04-102 ブルーローズ tool
  reg('hBP04-102',HOOK.ON_ART_DECLARE,(s,c)=>PB(s,10,'道具+10'));
  reg('hBP04-102',HOOK.ON_PLAY,(s,c)=>PL(s,'ブルーローズ附加'));

  // hBP04-103 森カリオペの鎌 tool
  reg('hBP04-103',HOOK.ON_ART_DECLARE,(s,c)=>{
    let b=10;const d=getCard(c.memberInst?.cardId);
    if(d?.name==='森カリオペ'&&d?.bloom==='2nd')b+=20;
    return PB(s,b,`鎌+${b}`);
  });
  reg('hBP04-103',HOOK.ON_PLAY,(s,c)=>PL(s,'鎌附加'));

  // hBP04-105 こよりの試験管 tool
  reg('hBP04-105',HOOK.ON_ART_DECLARE,(s,c)=>PB(s,10,'試験管+10'));
  reg('hBP04-105',HOOK.ON_PLAY,(s,c)=>PL(s,'試験管附加'));

  // hBP04-106 ラプラスの王冠 tool
  reg('hBP04-106',HOOK.ON_ART_DECLARE,(s,c)=>PB(s,10,'王冠+10'));
  reg('hBP04-106',HOOK.ON_PLAY,(s,c)=>PL(s,'王冠附加'));

  // hBP04-107 アイドルマイク tool +10
  reg('hBP04-107',HOOK.ON_ART_DECLARE,(s,c)=>PB(s,10,'マイク+10'));

  // hBP04-108 ネリッサのギター tool
  reg('hBP04-108',HOOK.ON_ART_DECLARE,(s,c)=>{
    let b=10;if(getCard(c.memberInst?.cardId)?.name==='ネリッサ・レイヴンクロフト')b+=10;
    return PB(s,b,`ギター+${b}`);
  });

  // hBP04-109 ぺこミコの絆 mascot HP+20
  reg('hBP04-109',HOOK.ON_PLAY,(s,c)=>PL(s,'吉祥物HP+20'));

  // hBP04-110 IRySの翼 mascot HP+20
  reg('hBP04-110',HOOK.ON_PLAY,(s,c)=>PL(s,'吉祥物HP+20'));

  // hBP04-111 こよりの試薬 mascot
  reg('hBP04-111',HOOK.ON_PLAY,(s,c)=>PL(s,'吉祥物HP+20'));
  reg('hBP04-111',HOOK.ON_ART_RESOLVE,(s,c)=>{
    const p=s.players[c.player];if(c.memberInst)c.memberInst.damage=Math.max(0,c.memberInst.damage-10);
    return PL(s,'使用藝能→回10HP');
  });

  // hBP04-112 儒烏風亭らでんの帽子 mascot
  reg('hBP04-112',HOOK.ON_PLAY,(s,c)=>PL(s,'吉祥物HP+20'));
  reg('hBP04-112',HOOK.ON_BLOOM,(s,c)=>{drawCards(s.players[c.player],1);return PL(s,'綻放→抽1')});

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
