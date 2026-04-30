// Phase C Final: All remaining 204 cards
import { getCard, getCardImage } from '../../core/CardDatabase.js';
import { registerEffect, HOOK } from '../EffectRegistry.js';
import { ZONE, MEMBER_STATE, isMember, isSupport } from '../../core/constants.js';
import { applyDamageToMember, drawCards, getStageMembers } from './common.js';

function shuffleArr(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function searchDeck(p,pred,n=1){const r=[];for(let i=0;i<p.zones[ZONE.DECK].length&&r.length<n;i++){if(pred(p.zones[ZONE.DECK][i]))r.push(i)}return r}
function pullFromDeck(p,idx){return[...idx].sort((a,b)=>b-a).map(i=>p.zones[ZONE.DECK].splice(i,1)[0])}
function rollDie(){return Math.floor(Math.random()*6)+1}
function hasTag(c,t){return getCard(c.cardId)?.tag?.includes(t)}
function makeSearchPrompt(p,pIdx,pred,msg,action='ADD_TO_HAND',max=1){const m=[];for(const c of p.zones[ZONE.DECK]){if(pred(c)){const d=getCard(c.cardId);m.push({instanceId:c.instanceId,cardId:c.cardId,name:d?.name||'',image:getCardImage(c.cardId)})}}if(!m.length)return null;return{type:action==='PLACE_AND_SHUFFLE'?'SEARCH_SELECT_PLACE':'SEARCH_SELECT',player:pIdx,message:msg,cards:m,maxSelect:max,afterAction:action}}
function damageOpp(s,p,a,pos='center'){const o=s.players[1-p];const t=o.zones[pos==='collab'?ZONE.COLLAB:ZONE.CENTER];if(t)applyDamageToMember(t,a)}
function archiveHand(p,n=1){let c=0;while(c<n&&p.zones[ZONE.HAND].length>0){p.zones[ZONE.ARCHIVE].push(p.zones[ZONE.HAND].shift());c++}return c}
function sendCheerDeck(p,m){if(!m||!p.zones[ZONE.CHEER_DECK].length)return;const c=p.zones[ZONE.CHEER_DECK].shift();c.faceDown=false;m.attachedCheer.push(c)}
function sendCheerArchive(p,m,col=null){if(!m)return false;const i=p.zones[ZONE.ARCHIVE].findIndex(c=>{const d=getCard(c.cardId);return d?.type==='吶喊'&&(!col||d.color===col)});if(i<0)return false;m.attachedCheer.push(p.zones[ZONE.ARCHIVE].splice(i,1)[0]);return true}
function returnArchive(p,pred,n=1){let r=0;while(r<n){const i=p.zones[ZONE.ARCHIVE].findIndex(pred);if(i<0)break;p.zones[ZONE.HAND].push(p.zones[ZONE.ARCHIVE].splice(i,1)[0]);r++}return r}
function makeArchivePrompt(p,pIdx,pred,msg,max=1){const m=[];for(const c of p.zones[ZONE.ARCHIVE]){if(pred(c)){const d=getCard(c.cardId);m.push({instanceId:c.instanceId,cardId:c.cardId,name:d?.name||'',image:getCardImage(c.cardId)})}}if(!m.length)return null;return{type:'SELECT_FROM_ARCHIVE',player:pIdx,message:msg,cards:m,maxSelect:max,afterAction:'RETURN_FROM_ARCHIVE'}}
function makeCheerMovePrompt(p,pIdx,src,tPred,msg,col){const t=[];for(const m of getStageMembers(p)){if(m.inst.instanceId===src?.instanceId)continue;if(tPred&&!tPred(m.inst))continue;const d=getCard(m.inst.cardId);t.push({instanceId:m.inst.instanceId,cardId:m.inst.cardId,name:d?.name||'',image:getCardImage(m.inst.cardId)})}if(!t.length||!src?.attachedCheer?.length)return null;return{type:'CHEER_MOVE',player:pIdx,message:msg,cards:t,maxSelect:1,afterAction:'CHEER_MOVE',sourceInstanceId:src.instanceId,cheerPredicate:col||'any'}}
function boost(a){return{type:'DAMAGE_BOOST',amount:a,target:'self',duration:'instant'}}
function boostTurn(a,t='self'){return{type:'DAMAGE_BOOST',amount:a,target:t,duration:'turn'}}

export function registerPhaseCFinal(){
  let count=0;
  const reg=(id,hook,fn)=>{registerEffect(id,hook,fn);count++};
  const P=s=>({state:s,resolved:true});
  const PL=(s,l)=>({state:s,resolved:true,log:l});
  const PB=(s,a,l)=>({state:s,resolved:true,effect:boost(a),log:l});

  // ═══ PASSIVE GLOBAL (49 cards) — effectG logs ═══
  const passiveG = {
    'hBP05-008':'中心:帶道具成員+10','hBP05-010':'中心:帶粉絲→+10每張',
    'hBP05-016':'被擊倒→吶喊替換','hBP05-023':'中心:受傷-20',
    'hBP05-028':'中心:對手1st傷害-20','hBP05-035':'帶吉祥物→+10',
    'hBP05-038':'被擊倒→吶喊替換','hBP05-043':'中心:免疫對手藝能',
    'hBP05-050':'被擊倒→存檔吶喊回','hBP05-055':'中心:HP不受效果影響',
    'hBP05-061':'後台成員數→+10/位','hBP05-065':'帶粉絲→+30每張',
    'hBP05-066':'帶粉絲→HP+10每張','hBP05-067':'中心:友方受傷-20',
    'hBP05-069':'被擊倒→吶喊回','hBP06-009':'中心:免疫特殊傷害',
    'hBP06-014':'中心:HP不受效果影響','hBP06-020':'被擊倒→吶喊分配',
    'hBP06-030':'中心:友方受傷-20','hBP06-046':'帶粉絲→HP+10',
    'hBP06-052':'中心:HP不受效果影響','hBP06-056':'被擊倒→吶喊替換',
    'hBP06-066':'帶吉祥物→+10','hBP06-072':'被擊倒→吶喊回',
    'hBP06-082':'中心:對手藝能限定本成員','hBP06-084':'聯動:中心成員受傷-20',
    'hBP07-017':'中心:帶粉絲+10每張','hBP07-022':'被擊倒→吶喊替換',
    'hBP07-024':'中心:HP不受效果影響','hBP07-044':'中心:帶道具→+20',
    'hBP07-049':'被擊倒→吶喊回',
    // hBP07-056 has a real ON_PASSIVE_GLOBAL handler in phaseB-cards.js
    // (時界を統べし者: performance-start cross-bloom hint). Don't clobber it
    // with the placeholder here.
    'hBP07-075':'中心:受傷-20','hBP07-080':'被擊倒→重疊回手',
    'hBP07-084':'中心:免疫對手藝能','hBP07-085':'被擊倒→吶喊分配',
    'hBP07-088':'聯動:友方受傷-10','hSD03-008':'中心:HP不受效果影響',
    'hSD07-009':'被擊倒→吶喊替換','hSD08-004':'中心:帶道具→+10',
    'hSD08-005':'被擊倒→吶喊分配',
    // hSD09-007 has a real ON_KNOCKDOWN handler in phaseB-cards.js
    // (life-loss-1 when own life < opp life on knockout from collab).
    // Don't clobber it with the placeholder here.
    'hSD10-004':'中心:友方受傷-10','hSD11-006':'被擊倒→吶喊替換',
    'hSD12-007':'中心:HP不受效果影響','hSD13-005':'被擊倒→吶喊回',
    'hSD13-012':'中心:受傷-20','hSD13-013':'帶粉絲→HP+10',
    'hSD13-014':'被擊倒→重疊回手',
  };
  for(const[id,log]of Object.entries(passiveG)){reg(id,HOOK.ON_PASSIVE_GLOBAL,(s,c)=>PL(s,log))}

  // ═══ YELL/CHEER (58 cards) — cheer card passive rules ═══
  const yellCards = [
    'hY01-001','hY01-002','hY01-003','hY01-004','hY01-005','hY01-006','hY01-007','hY01-009','hY01-010','hY01-012',
    'hY02-001','hY02-002','hY02-003','hY02-004','hY02-005','hY02-006','hY02-007','hY02-008','hY02-010',
    'hY03-001','hY03-002','hY03-003','hY03-004','hY03-005','hY03-006','hY03-007','hY03-008','hY03-009','hY03-011','hY03-012','hY03-013','hY03-014',
    'hY04-001','hY04-002','hY04-003','hY04-004','hY04-005','hY04-006','hY04-007','hY04-009','hY04-010','hY04-011',
    'hY05-001','hY05-002','hY05-003','hY05-004','hY05-005','hY05-007','hY05-008','hY05-009',
    'hY06-001','hY06-002','hY06-003','hY06-004','hY06-005','hY06-006','hY06-007','hY06-009',
  ];
  for(const id of yellCards){
    reg(id,HOOK.ON_CHEER_ATTACH,(s,c)=>PL(s,'吶喊卡規則適用'));
  }

  // ═══ BLOOM (was 31 cards, now 0) — DISABLED 2026-05-01 ═══
  //
  // The entire bulk array below was placeholder-generated and DID NOT match
  // the real card text. Audit verified ~30/30 entries were wrong (e.g.
  // hBP05-021 「アイラニ・イオフィフティーン」 effectB is "send cheer to THIS
  // member", which the bulk happened to match — but most others were random
  // patterns like "draw 1" / "中心20特殊傷害" applied to bloom levels).
  //
  // Disabled wholesale so all these cards now fall through to MANUAL_EFFECT
  // prompts, where the engine surfaces the actual zh-TW effect text and the
  // player can apply the effect manually. This is the correct behavior for
  // unimplemented cards; the prior state was "auto-execute wrong logic".
  //
  // Re-implement card-by-card (with proper conditions / costs / prompts)
  // as time permits, prioritizing decks the user is currently testing.
  const bloomHandlers = [];
  // Wrap each bulk handler so it only fires on the card's OWN bloom, not on
  // engine broadcasts to other stage members (triggerEvent='member_bloomed').
  // Without this guard, every bloom anywhere ran every bulk handler.
  for(const[id,fn]of bloomHandlers){
    reg(id,HOOK.ON_BLOOM,(s,c)=>{
      if(c && c.triggerEvent && c.triggerEvent !== 'self') return {state:s,resolved:true};
      return fn(s,c);
    });
  }

  // ═══ COLLAB (was 31 cards, now 0) — DISABLED 2026-05-01 ═══
  //
  // Same systemic placeholder problem as bloomHandlers above: spot-checked
  // ~10 entries, 100% mismatched the actual card text (e.g. hBP07-050 was
  // mapped to "抽2棄1" but real effect is 1st-turn bloom permission).
  // hBP07-051 broadcast on collab → auto-sent cheer when other クロニー
  // collab'd, which was the user-reported bug.
  //
  // Disabled wholesale; cards fall through to MANUAL_EFFECT.
  // Re-implement card-by-card per real effectC text as time permits.
  const collabHandlers = [];
  // Wrap each bulk collab handler so it only fires on the card's OWN collab,
  // not on engine broadcasts to other own-stage members
  // (triggerEvent='member_collabed'). Without this guard, every collab fired
  // every bulk handler on every other stage member, causing wrong "送吶喊"
  // / "抽1" effects to chain off any collab. This was the source of the
  // user-reported "進行聯動，突然就 [效果] 送吶喊" bug.
  for(const[id,fn]of collabHandlers){
    reg(id,HOOK.ON_COLLAB,(s,c)=>{
      if(c && c.triggerEvent === 'member_collabed') return {state:s,resolved:true};
      return fn(s,c);
    });
  }

  // ═══ ART EFFECTS (was 21 cards, now 0) — DISABLED 2026-05-01 ═══
  //
  // The "art effect" boosts were also placeholder — pattern-mapped to
  // generic "if attached cheer ≥ N → +X damage" without reading the real
  // card text. Verified mismatch on every spot-checked entry (e.g.
  // hBP05-017 「ぱくぱく」 real effect is "-1 colorless cheer per ルーナイト
  // attached", but the bulk handler said "≥3吶喊→+30").
  //
  // Engine still surfaces art effect text via MANUAL_EFFECT prompts when
  // arts trigger; the ON_ART_DECLARE hook just won't auto-apply boosts
  // anymore. Re-implement card-by-card later.
  const artHandlers = [];

  // ═══ SUPPORT (was 9 cards, now 0) — DISABLED 2026-05-01 ═══
  //
  // hBP05-076 「ちょこのビーフストロガノフ」 real effect is "+10 art damage
  // to a member, +10 again to a 2nd ちょこ" — bulk wrote "draw 2".
  // Other support entries equally wrong.
  // Disabled; falls through to MANUAL_EFFECT.
  const supportHandlers = [];

  // ═══ OSHI SKILLS (5 cards) ═══
  // hBP05-006 ネリッサ oshi
  reg('hBP05-006',HOOK.ON_OSHI_SKILL,(s,c)=>{
    if(c.skillType==='sp')return{state:s,resolved:true,effect:boostTurn(0,'name:ネリッサ'),log:'SP:ネリッサ無色-1（永久）'};
    return{state:s,resolved:true,effect:boostTurn(10,'tag:#歌'),log:'#歌中心聯動+10'};
  });
  // hBP05-007 不知火フレア oshi
  reg('hBP05-007',HOOK.ON_OSHI_SKILL,(s,c)=>{
    if(c.skillType==='sp'){
      const p=s.players[c.player];const center=p.zones[ZONE.CENTER];
      const n=center?.attachedCheer?.length||0;
      return{state:s,resolved:true,effect:boostTurn(n*10),log:`SP:中心${n}吶喊→全員+${n*10}`};
    }
    return PL(s,'聯動位置Debut/1st/Spot↔後台フレア');
  });
  // hBP07-002 ベスティア・ゼータ oshi
  reg('hBP07-002',HOOK.ON_OSHI_SKILL,(s,c)=>{
    if(c.skillType==='sp')return PL(s,'SP:存檔吉祥物/粉絲附加給#ID3期生(3+→+100)');
    return{state:s,resolved:true,effect:boostTurn(50),log:'1位成員+50(#ID3期生Buzz→+80)'};
  });
  // hSD01-001 ときのそら oshi
  reg('hSD01-001',HOOK.ON_OSHI_SKILL,(s,c)=>{
    if(c.skillType==='reactive') return {state:s,resolved:true};
    if(c.skillType==='sp'){
      const opp=s.players[1-c.player];const center=opp.zones[ZONE.CENTER];
      if(center&&opp.zones[ZONE.BACKSTAGE].length){const b=opp.zones[ZONE.BACKSTAGE].shift();opp.zones[ZONE.BACKSTAGE].push(center);opp.zones[ZONE.CENTER]=b;b.state=MEMBER_STATE.ACTIVE}
      return{state:s,resolved:true,effect:boostTurn(50),log:'SP:對手中心↔後台,白色中心+50'};
    }
    return PL(s,'吶喊替換給成員');
  });
  // hSD13-001 エリザベス oshi
  reg('hSD13-001',HOOK.ON_OSHI_SKILL,(s,c)=>{
    if(c.skillType==='sp'){
      const p=s.players[c.player];
      const i=p.zones[ZONE.ARCHIVE].findIndex(x=>hasTag(x,'#Justice')&&isMember(getCard(x.cardId)?.type));
      if(i>=0){const card=p.zones[ZONE.ARCHIVE].splice(i,1)[0];card.faceDown=false;p.zones[ZONE.BACKSTAGE].push(card);
        let sent=0;while(sent<5){if(!sendCheerArchive(p,card))break;sent++}}
      return PL(s,'SP:存檔#Justice成員上場+送吶喊');
    }
    return PL(s,'友方受傷→可指定Buzz/2nd承受');
  });

  return count;
}
