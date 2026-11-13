import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';
import {getFirestore,doc,collection,onSnapshot,runTransaction,query,orderBy,limit} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const $=id=>document.getElementById(id), safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const configured=!firebaseConfig.apiKey.startsWith('PASTE_');
const app=configured?initializeApp(firebaseConfig):null,auth=app?getAuth(app):null,db=app?getFirestore(app):null;
let attendance=[],user=null,season='2026-H2',members=[],games=[],events=[],meta={},mode=1,unsubs=[],busy=false;
const seasons=['2026-H2','2027-H1','2027-H2','2028-H1','2028-H2','2029-H1','2029-H2'];
$('season').innerHTML=seasons.map(s=>`<option value="${s}">${s.replace('-H1',' 상반기').replace('-H2',' 하반기')}</option>`).join('');
$('season').value=season;
const memberRef=id=>doc(db,'seasons',season,'members',id),gameRef=id=>doc(db,'seasons',season,'games',id),eventRef=id=>doc(db,'seasons',season,'events',id),metaRef=()=>doc(db,'seasons',season);
const attendanceRef=(date,id)=>doc(db,'seasons',season,'attendance',date+'_'+id);
const uid=()=>crypto.randomUUID(), now=()=>new Date().toISOString(), nameOf=id=>members.find(m=>m.id===id)?.name||'알 수 없음', admin=()=>!!user?.email&&meta.adminEmails?.includes(user.email);
function note(s){$('message').textContent=s;}
function requireLogin(){if(!user)throw Error('로그인이 필요합니다.');if(meta.closed)throw Error('마감된 시즌입니다.');}
async function transact(fn){if(busy)return;busy=true;try{await runTransaction(db,fn);note('저장되었습니다.')}catch(e){note('처리 실패: '+(e.message||e))}finally{busy=false}}
function listen(){attendance=[];unsubs.forEach(f=>f());unsubs=[];if(!user)return;const base=collection(db,'seasons',season);unsubs.push(onSnapshot(metaRef(),s=>{meta=s.exists()?s.data():{};render()},e=>note(e.message)));unsubs.push(onSnapshot(collection(base,'members'),s=>{members=s.docs.map(d=>({id:d.id,...d.data()}));render()},e=>note(e.message)));unsubs.push(onSnapshot(collection(base,'attendance'),s=>{attendance=s.docs.map(d=>({id:d.id,...d.data()}));render()},e=>note(e.message)));unsubs.push(onSnapshot(collection(base,'games'),s=>{games=s.docs.map(d=>({id:d.id,...d.data()}));render()},e=>note(e.message)));unsubs.push(onSnapshot(query(collection(base,'events'),orderBy('at','desc'),limit(150)),s=>{events=s.docs.map(d=>d.data());render()},e=>note(e.message)))}
function render(){if(!user)return;renderSchedule();$('memberCount').textContent=members.length;$('gameCount').textContent=games.filter(g=>g.winner).length;$('loanCount').textContent=members.reduce((n,m)=>n+m.loans,0);const sorted=[...members].filter(m=>!m.isGuest).sort((a,b)=>(b.coins-b.loans)-(a.coins-a.loans)||b.wins-a.wins||a.name.localeCompare(b.name,'ko'));
let last=null,rank=0;$('rankRows').innerHTML=sorted.map((m,i)=>{const score=m.coins-m.loans;if(score!==last)rank=i+1;last=score;return `<div class="item"><span><b>${rank}. ${safe(m.name)}</b> ${m.active?'':'<small class="muted">퇴장</small>'}<br><small class="muted">${m.wins}승 ${m.losses}패 · 대출 ${m.loans}개</small></span><span style="text-align:right"><b>🟡 ${score}</b><br><small class="muted">보유 ${m.coins}</small></span></div>`}).join('')||'<p class="muted">시즌 참가자를 추가해 주세요.</p>';
$('memberRows').innerHTML=members.map(m=>`<div class="item"><span><b>${safe(m.name)}${m.isGuest?' (게스트)':''}</b><br><small class="muted">보유 ${m.coins} · 대출 ${m.loans} · ${m.active?'참가':'퇴장'}${m.rosterStatus?' · 명단 '+safe(m.rosterStatus):''}</small></span><button data-toggle="${m.id}" ${meta.closed?'disabled':''}>${m.active?'퇴장':'재참가'}</button></div>`).join('');
const opts='<option value="">선수 선택</option>'+members.filter(m=>m.active).map(m=>`<option value="${m.id}">${safe(m.name)} (${m.coins}개)</option>`).join('');$('teamA').innerHTML=Array.from({length:mode},()=>`<select data-team="a">${opts}</select>`).join('');$('teamB').innerHTML=Array.from({length:mode},()=>`<select data-team="b">${opts}</select>`).join('');
$('borrowMember').innerHTML='<option value="">회원 선택</option>'+members.map(m=>`<option value="${m.id}">${safe(m.name)}</option>`).join('');$('borrow').disabled=!admin()||!!meta.closed;$('closeSeason').disabled=!admin()||!!meta.closed;$('closeSeason').textContent=meta.closed?'마감 완료':'시즌 마감';$('addMember').disabled=!!meta.closed;$('createGame').disabled=!!meta.closed;
$('pending').innerHTML=games.filter(g=>!g.winner).map(g=>`<div class="card"><small class="muted">${g.type==='single'?'단식':'복식'} · ${safe(g.day||'')}</small><p>${safe(g.a.map(nameOf).join(' / '))} <b>VS</b> ${safe(g.b.map(nameOf).join(' / '))}</p><div class="row"><button data-win="${g.id}:a" ${meta.closed?'disabled':''}>A팀 승</button><button data-win="${g.id}:b" ${meta.closed?'disabled':''}>B팀 승</button><button data-cancel="${g.id}" ${meta.closed?'disabled':''}>취소</button></div></div>`).join('')||'<p class="muted">진행 중인 경기 없음</p>';
$('finished').innerHTML=games.filter(g=>g.winner).sort((a,b)=>b.completedAt.localeCompare(a.completedAt)).slice(0,30).map(g=>`<div class="item"><span>${safe(g.a.map(nameOf).join(' / '))} vs ${safe(g.b.map(nameOf).join(' / '))}</span><b>${g.winner==='a'?'A':'B'}팀 승</b></div>`).join('')||'<p class="muted">완료 경기 없음</p>';
$('settlement').innerHTML=sorted.map(m=>`<tr><td>${safe(m.name)}</td><td>${m.coins}</td><td>${m.loans}</td><td><b>${m.coins-m.loans}</b></td></tr>`).join('');$('events').innerHTML=events.map(e=>`<div class="item"><span>${safe(e.description)}</span><small class="muted">${safe(e.at.slice(0,16).replace('T',' '))}</small></div>`).join('');}
$('login').onclick=()=>{if(!auth){note('firebase-config.js 설정이 필요합니다.');return}signInWithPopup(auth,new GoogleAuthProvider()).catch(e=>note(e.message))};$('logout').onclick=()=>signOut(auth);
if(auth)onAuthStateChanged(auth,u=>{user=u;$('identity').textContent=u?u.email:'로그인 후 이용하세요';$('login').classList.toggle('hidden',!!u);$('logout').classList.toggle('hidden',!u);$('app').classList.toggle('hidden',!u);listen()});else note('Firebase 설정 전입니다. README.md를 따라 설정하세요.');
$('season').onchange=e=>{season=e.target.value;members=[];games=[];events=[];meta={};listen()};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('selected',x===b));['ranking','schedule','games','members','ledger'].forEach(id=>$(id).classList.toggle('hidden',id!==b.dataset.tab))});
$('single').onclick=()=>{mode=1;$('single').classList.add('primary');$('double').classList.remove('primary');render()};$('double').onclick=()=>{mode=2;$('double').classList.add('primary');$('single').classList.remove('primary');render()};
$('addMember').onclick=async()=>{const name=$('newMember').value.trim();if(!name||members.some(m=>m.name===name)){note('이름이 비어 있거나 중복됩니다.');return}const id=uid(),eid=uid();await transact(async t=>{requireLogin();const mr=memberRef(id),er=eventRef(eid),sr=metaRef();const [m,s]=await Promise.all([t.get(mr),t.get(sr)]);if(m.exists()||s.data()?.closed)throw Error('이미 등록되었거나 마감되었습니다.');t.set(mr,{name,coins:3,loans:0,wins:0,losses:0,active:true,initialGranted:true,isGuest:false,createdAt:now()});t.set(er,{at:now(),description:`${name} 최초 3개 지급`,actor:user.uid})});$('newMember').value=''};
$('borrow').onclick=async()=>{const id=$('borrowMember').value,q=Number($('borrowQty').value);if(!admin()){note('운영진만 대출을 지급할 수 있습니다.');return}if(!id||!Number.isSafeInteger(q)||q<1||q>1000){note('회원과 1~1000 사이의 정수 수량을 입력하세요.');return}const eid=uid();await transact(async t=>{requireLogin();const mr=memberRef(id),sr=metaRef(),er=eventRef(eid);const [m,s]=await Promise.all([t.get(mr),t.get(sr)]);if(!m.exists()||s.data()?.closed)throw Error('회원 없음 또는 마감');t.update(mr,{coins:m.data().coins+q,loans:m.data().loans+q});t.set(er,{at:now(),description:`${m.data().name} 대출 +${q}개`,actor:user.uid})})};
$('createGame').onclick=async()=>{const a=[...document.querySelectorAll('[data-team="a"]')].map(x=>x.value),b=[...document.querySelectorAll('[data-team="b"]')].map(x=>x.value),ids=[...a,...b];if(ids.some(x=>!x)||new Set(ids).size!==ids.length){note('선수를 중복 없이 선택하세요.');return}if(games.some(g=>!g.winner&&ids.some(id=>[...g.a,...g.b].includes(id)))){note('진행 중인 다른 경기에 등록된 선수가 있습니다.');return}const gid=uid(),eid=uid();await transact(async t=>{requireLogin();const refs=ids.map(memberRef),sr=metaRef();const reads=await Promise.all([t.get(sr),...refs.map(r=>t.get(r))]);if(reads[0].data()?.closed||reads.slice(1).some(s=>!s.exists()||!s.data().active||s.data().coins<1))throw Error('마감/비활성/코인 부족');t.set(gameRef(gid),{a,b,type:mode===1?'single':'double',winner:null,createdAt:now(),day:new Date().toLocaleDateString('ko-KR'),actor:user.uid});t.set(eventRef(eid),{at:now(),description:'경기 생성',actor:user.uid})})};
document.addEventListener('click',async e=>{const btn=e.target.closest('button');if(!btn)return;
if(btn.dataset.toggle){const id=btn.dataset.toggle,eid=uid();if(games.some(g=>!g.winner&&[...g.a,...g.b].includes(id))){note('진행 중인 경기를 먼저 마무리하세요.');return}await transact(async t=>{requireLogin();const mr=memberRef(id),sr=metaRef(),er=eventRef(eid);const [m,s]=await Promise.all([t.get(mr),t.get(sr)]);if(!m.exists()||s.data()?.closed)throw Error('변경 불가');t.update(mr,{active:!m.data().active});t.set(er,{at:now(),description:`${m.data().name} ${m.data().active?'퇴장':'재참가'}`,actor:user.uid})});return}
if(btn.dataset.win){const [id,side]=btn.dataset.win.split(':'),eid=uid();await transact(async t=>{requireLogin();const gr=gameRef(id),sr=metaRef(),g=await t.get(gr),s=await t.get(sr);if(!g.exists()||g.data().winner||s.data()?.closed)throw Error('이미 완료/마감된 경기');const data=g.data(),ids=[...data.a,...data.b],refs=ids.map(memberRef),docs=await Promise.all(refs.map(r=>t.get(r)));if(docs.some(x=>!x.exists()))throw Error('선수 정보 없음');const winners=side==='a'?data.a:data.b,losers=side==='a'?data.b:data.a;if(docs.some((d,i)=>losers.includes(ids[i])&&d.data().coins<1))throw Error('패배팀 코인 부족: 먼저 대출하세요');docs.forEach((d,i)=>{const win=winners.includes(ids[i]),m=d.data();t.update(refs[i],{coins:m.coins+(win?1:-1),wins:m.wins+(win?1:0),losses:m.losses+(win?0:1)})});t.update(gr,{winner:side,completedAt:now()});t.set(eventRef(eid),{at:now(),description:`경기 결과 ${side.toUpperCase()}팀 승리`,actor:user.uid})});return}
if(btn.dataset.cancel){const id=btn.dataset.cancel,eid=uid();await transact(async t=>{requireLogin();const gr=gameRef(id),sr=metaRef(),[g,s]=await Promise.all([t.get(gr),t.get(sr)]);if(!g.exists()||g.data().winner||s.data()?.closed)throw Error('취소 불가');t.delete(gr);t.set(eventRef(eid),{at:now(),description:'미완료 경기 취소',actor:user.uid})})}
});
$('closeSeason').onclick=async()=>{if(!admin())return;if(games.some(g=>!g.winner)){note('진행 중인 경기를 먼저 종료하세요.');return}if(!confirm('정말 시즌을 마감할까요? 이후 변경할 수 없습니다.'))return;const eid=uid();await transact(async t=>{const sr=metaRef(),s=await t.get(sr);if(s.data()?.closed)throw Error('이미 마감');t.set(sr,{closed:true,closedAt:now(),closedBy:user.uid},{merge:true});t.set(eventRef(eid),{at:now(),description:'시즌 마감',actor:user.uid})})};
$('exportCsv').onclick=()=>{const rows=[['시즌','회원','보유','누적대출','순보유','승','패'],...members.map(m=>[season,m.name,m.coins,m.loans,m.coins-m.loans,m.wins,m.losses])],csv='\ufeff'+rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`MTC_${season}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};

// Daily attendance is separate from half-year membership and never grants fresh coins.
function localDay(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
$('playDate').value=localDay();
$('playDate').addEventListener('change',render);
$('meetingDates').addEventListener('change',e=>{if(e.target.value){$('playDate').value=e.target.value;render()}});
function todays(){return $('playDate').value||localDay()}
function presentIds(){return new Set(attendance.filter(a=>a.date===todays()&&a.present).map(a=>a.memberId))}
function dayGames(){return games.filter(g=>g.playDate===todays())}
function renderSchedule(){
 if(!user)return;
 const present=presentIds(),today=dayGames(),ongoing=today.filter(g=>!g.winner);
 const dates=[...new Set([...attendance.map(a=>a.date),...games.map(g=>g.playDate),...members.filter(m=>m.isGuest).map(m=>m.guestDate)].filter(Boolean))].sort().reverse();
 const choices=[...new Set([todays(),...dates])].sort().reverse();
 $('meetingDates').innerHTML=choices.map(d=>`<option value="${safe(d)}" ${d===todays()?'selected':''}>${safe(d)}${dates.includes(d)?' · 기록 있음':' · 새 모임'}</option>`).join('');
 const finished=today.filter(g=>g.winner).sort((a,b)=>(a.completedAt||'').localeCompare(b.completedAt||''));
 const playedIds=new Set(today.flatMap(g=>[...g.a,...g.b]));
 const participants=new Set([...present,...playedIds,...members.filter(m=>m.isGuest&&m.guestDate===todays()).map(m=>m.id)]);
 const wins=new Map(),losses=new Map();
 for(const g of finished){for(const id of g[g.winner])wins.set(id,(wins.get(id)||0)+1);for(const id of g[g.winner==='a'?'b':'a'])losses.set(id,(losses.get(id)||0)+1)}
 $('daySummary').innerHTML=`<b>${safe(todays())} 모임</b><p>참여 기록 ${participants.size}명 · 완료 ${finished.length}경기 · 진행 중 ${ongoing.length}경기 · 게스트 ${members.filter(m=>m.isGuest&&m.guestDate===todays()).length}명</p>`+
 [...participants].map(id=>`<div class="item"><span>${safe(nameOf(id))}${members.find(m=>m.id===id)?.isGuest?' (게스트)':''}</span><span>${wins.get(id)||0}승 ${losses.get(id)||0}패 · ${((wins.get(id)||0)-(losses.get(id)||0))>=0?'+':''}${(wins.get(id)||0)-(losses.get(id)||0)}코인</span></div>`).join('');
 $('dayFinished').innerHTML=finished.map(g=>`<div class="item"><span>${safe(g.a.map(nameOf).join(' / '))} vs ${safe(g.b.map(nameOf).join(' / '))}</span><b>${g.winner.toUpperCase()}팀 승</b></div>`).join('')||'<p class="muted">완료된 경기가 없습니다.</p>';
 const busyIds=new Set(ongoing.flatMap(g=>[...g.a,...g.b]));
 $('attendanceRows').innerHTML=members.filter(m=>!m.isGuest||m.guestDate===todays()).map(m=>`<div class="item"><label><input style="width:auto" type="checkbox" data-attend="${m.id}" ${present.has(m.id)?'checked':''} ${meta.closed||!admin()||m.returnedAt?'disabled':''}> ${safe(m.name)}${m.isGuest?' (게스트)':''}</label><span class="muted">${present.has(m.id)?'출석':'미출석'} · 코인 ${m.coins}</span></div>`).join('')||'<p class="muted">먼저 시즌 회원을 등록하세요.</p>';
 $('scheduledGames').innerHTML=ongoing.map(g=>`<div class="card"><b>${safe(g.court||'배정')} · ${g.type==='single'?'단식':'복식'}</b><p>${safe(g.a.map(nameOf).join(' / '))} <b>VS</b> ${safe(g.b.map(nameOf).join(' / '))}</p><div class="row"><button data-win="${g.id}:a">A팀 승</button><button data-win="${g.id}:b">B팀 승</button><button data-cancel="${g.id}">취소</button></div></div>`).join('')||'<p class="muted">현재 배정된 진행 중 경기가 없습니다.</p>';
 $('guestReturnRows').innerHTML=members.filter(m=>m.isGuest&&m.guestDate===todays()).map(m=>`<div class="item"><span><b>${safe(m.name)}</b> · ${m.returnedAt?'반납 완료':'보유 '+m.coins+'개'}</span><button data-guest-return="${m.id}" ${m.returnedAt||meta.closed||!admin()?'disabled':''}>${m.returnedAt?'반납 완료':'코인 회수·퇴장'}</button></div>`).join('')||'<p class="muted">오늘 등록된 게스트가 없습니다.</p>';
 $('waitingPlayers').textContent=members.filter(m=>present.has(m.id)&&!busyIds.has(m.id)&&!m.returnedAt).map(m=>m.name).join(', ')||'대기 인원 없음';
 $('generateRound').disabled=!!meta.closed||!admin();
}
document.addEventListener('change',async e=>{
 const id=e.target?.dataset?.attend;if(!id)return;if(!admin()){note('운영진만 출석을 변경할 수 있습니다.');render();return}
 const date=todays(),present=e.target.checked,m=members.find(x=>x.id===id);
 if(!m||m.returnedAt)return;
 if(!present&&dayGames().some(g=>!g.winner&&[...g.a,...g.b].includes(id))){note('진행 중인 경기부터 종료하거나 취소하세요.');render();return}
 const ref=attendanceRef(date,id),eid=uid();
 await transact(async t=>{
   requireLogin();
   const sr=metaRef(),ar=ref;
   const [s,a]=await Promise.all([t.get(sr),t.get(ar)]);
   if(s.data()?.closed)throw Error('마감된 시즌');
   const mr=memberRef(id),md=await t.get(mr);
   if(!md.exists())throw Error('회원이 없습니다.');
   if(present&&md.data().initialGranted===false){t.update(mr,{coins:3,active:true,initialGranted:true});}
   else if(present&&!md.data().active){t.update(mr,{active:true});}
   t.set(ar,{date,memberId:id,present,updatedAt:now(),actor:user.uid});
   t.set(eventRef(eid),{at:now(),description:`${m.name} ${date} ${present?'출석':'퇴장'}`,actor:user.uid});
 });
});
function pairKey(a,b){return [a,b].sort().join('|')}
function buildRound(pool,slots,size,history){
 const played=new Map(pool.map(m=>[m.id,history.filter(g=>[...g.a,...g.b].includes(m.id)).length]));
 const teammates=new Map();
 for(const g of history){for(const side of [g.a,g.b])if(side.length===2){const key=pairKey(...side);teammates.set(key,(teammates.get(key)||0)+1)}}
 const lastPlayed=new Map(pool.map(m=>[m.id,Math.max(-1,...history.map((g,i)=>[...g.a,...g.b].includes(m.id)?i:-1))]));
 const ordered=[...pool].sort((a,b)=>(played.get(a.id)-played.get(b.id))||(lastPlayed.get(a.id)-lastPlayed.get(b.id))||a.name.localeCompare(b.name,'ko'));
 const chosen=ordered.slice(0,Math.min(ordered.length,slots*size*2));
 const results=[];
 for(let i=0;i<chosen.length;i+=size*2){
  const chunk=chosen.slice(i,i+size*2);if(chunk.length<size*2)break;
  if(size===1){results.push({a:[chunk[0].id],b:[chunk[1].id]});continue}
  const ids=chunk.map(x=>x.id);
  const options=[
   [[ids[0],ids[1]],[ids[2],ids[3]]],
   [[ids[0],ids[2]],[ids[1],ids[3]]],
   [[ids[0],ids[3]],[ids[1],ids[2]]]
  ];
  options.sort((x,y)=>x.reduce((n,p)=>n+(teammates.get(pairKey(...p))||0),0)-y.reduce((n,p)=>n+(teammates.get(pairKey(...p))||0),0));
  results.push({a:options[0][0],b:options[0][1]});
 }
 return results;
}
$('generateRound').onclick=async()=>{if(!admin()){note('운영진만 대진을 배정할 수 있습니다.');return}
 if(!admin()){note('운영진만 자동 대진을 생성할 수 있습니다.');return}
 const date=todays(),size=Number($('scheduleMode').value),courts=Number($('courtCount').value);
 if(!Number.isInteger(courts)||courts<1||courts>2){note('코트 수는 1~2 사이로 설정하세요.');return}
 const pending=dayGames().filter(g=>!g.winner),occupied=new Set(pending.flatMap(g=>[...g.a,...g.b]));
 const present=presentIds();
 const pool=members.filter(m=>present.has(m.id)&&!occupied.has(m.id)&&!m.returnedAt&&m.coins>=1);
 const availableCourts=Math.max(0,courts-pending.length);
 if(!availableCourts){note('모든 코트가 사용 중입니다. 결과 입력 또는 경기 취소 후 배정하세요.');return}
 const proposals=buildRound(pool,availableCourts,size,dayGames().filter(g=>g.winner));
 if(!proposals.length){note(`출석한 대기 선수 중 코인이 있는 선수가 ${size*2}명 이상 필요합니다. 코인 부족 시 먼저 대출하세요.`);return}
 const ids=proposals.flatMap(g=>[...g.a,...g.b]);
 const gameIds=proposals.map(()=>uid()),eid=uid();
 await transact(async t=>{
   requireLogin();
   const sr=metaRef(),refs=ids.map(memberRef),attRefs=ids.map(id=>attendanceRef(date,id));
   const existingGames=dayGames().filter(g=>!g.winner).map(g=>gameRef(g.id));
   const dayRef=doc(db,'seasons',season,'days',date);
   const reads=await Promise.all([t.get(sr),t.get(dayRef),...refs.map(r=>t.get(r)),...attRefs.map(r=>t.get(r)),...existingGames.map(r=>t.get(r))]);
   if(reads[0].data()?.closed)throw Error('시즌 마감');
   const memberDocs=reads.slice(2,2+ids.length),attDocs=reads.slice(2+ids.length,2+ids.length*2);
   if(memberDocs.some(d=>!d.exists()||d.data().coins<1)||attDocs.some(d=>!d.exists()||!d.data().present))throw Error('선수 출석 또는 코인 상태가 변경되었습니다.');
   // Concurrent generators should be serialized using a per-day revision document.
   const daySnap=reads[1];
   const rev=daySnap.exists()?daySnap.data().revision||0:0;
   t.set(dayRef,{revision:rev+1,updatedAt:now()},{merge:true});
   proposals.forEach((g,i)=>t.set(gameRef(gameIds[i]),{...g,type:size===1?'single':'double',winner:null,createdAt:now(),playDate:date,day:date,court:`코트 ${pending.length+i+1}`,actor:user.uid,autoAssigned:true}));
   t.set(eventRef(eid),{at:now(),description:`${date} 자동 경기 ${proposals.length}개 배정`,actor:user.uid});
 });
};

// Club roster is loaded on demand, not exposed with contact information.
$('importRoster').onclick=async()=>{
 if(!admin()){note('운영진만 명단을 가져올 수 있습니다.');return}
 if(members.length){note('현재 시즌에 등록된 사람이 있습니다. 중복 지급 방지를 위해 빈 시즌에서만 명단을 가져올 수 있습니다.');return}
 if(!confirm('2026년 11월 클럽 명단을 시즌에 최초 등록할까요? 활동 회원은 3개, 휴회·탈퇴 회원은 0개로 시작합니다.'))return;
 try{
  const response=await fetch('./club-roster.json');if(!response.ok)throw Error('명단 파일을 읽을 수 없습니다.');
  const roster=await response.json(),eid=uid();
  await transact(async t=>{
   requireLogin();if(!admin())throw Error('권한 없음');
   const sr=metaRef(),s=await t.get(sr);
   if(s.data()?.closed)throw Error('마감된 시즌');
   const ids=roster.map(()=>uid());
   roster.forEach((r,i)=>{const active=r.status==='활동';t.set(memberRef(ids[i]),{name:r.name,coins:active?3:0,loans:0,wins:0,losses:0,active,initialGranted:active,rosterStatus:r.status,isGuest:false,createdAt:now()})});
   t.set(eventRef(eid),{at:now(),description:`클럽 명단 ${roster.length}명 가져오기`,actor:user.uid});
  });
 }catch(e){note('명단 가져오기 실패: '+e.message)}
};
$('addGuest').onclick=async()=>{
 if(!admin()){note('운영진만 게스트를 등록할 수 있습니다.');return}
 const name=$('guestName').value.trim(),date=todays();
 if(!name){note('게스트 이름을 입력하세요.');return}
 if(members.some(m=>m.isGuest&&m.guestDate===date&&m.name===name)){note('같은 날짜에 등록된 게스트입니다. 출석 체크로 재참가 처리하세요.');return}
 const id=uid(),eid=uid();
 await transact(async t=>{
  requireLogin();const sr=metaRef(),ar=attendanceRef(date,id),s=await t.get(sr);
  if(s.data()?.closed)throw Error('마감된 시즌');
  t.set(memberRef(id),{name,coins:3,loans:0,wins:0,losses:0,active:true,initialGranted:true,isGuest:true,guestDate:date,returnedAt:null,returnedCoins:0,createdAt:now()});
  t.set(ar,{date,memberId:id,present:true,updatedAt:now(),actor:user.uid});
  t.set(eventRef(eid),{at:now(),description:`${date} 게스트 ${name} 등록·출석 (3개 지급)`,actor:user.uid});
 });
 $('guestName').value='';
};

// Guest settlement: remove all remaining guest coins from circulation at departure.
document.addEventListener('click',async e=>{
 const id=e.target.closest('[data-guest-return]')?.dataset.guestReturn;if(!id)return;
 if(!admin()){note('운영진만 게스트 코인을 회수할 수 있습니다.');return}
 const guest=members.find(m=>m.id===id),date=todays();
 if(!guest||!guest.isGuest||guest.guestDate!==date||guest.returnedAt)return;
 if(games.some(g=>!g.winner&&[...g.a,...g.b].includes(id))){note('게스트가 참가 중인 경기를 먼저 완료하거나 취소하세요.');return}
 if(!confirm(`${guest.name} 게스트의 잔여 코인 ${guest.coins}개를 회수하고 퇴장할까요?`))return;
 const eid=uid();await transact(async t=>{
  requireLogin();const mr=memberRef(id),ar=attendanceRef(date,id),sr=metaRef();
  const [m,s,a]=await Promise.all([t.get(mr),t.get(sr),t.get(ar)]);
  if(!m.exists()||!m.data().isGuest||m.data().returnedAt||s.data()?.closed)throw Error('회수 불가');
  const balance=m.data().coins;
  t.update(mr,{coins:0,active:false,returnedAt:now(),returnedCoins:balance});
  t.set(ar,{date,memberId:id,present:false,updatedAt:now(),actor:user.uid});
  t.set(eventRef(eid),{at:now(),description:`${m.data().name} 게스트 코인 ${balance}개 회수·퇴장`,actor:user.uid});
 });
});

$('downloadDay').onclick=()=>{
 const date=todays(),gs=dayGames().filter(g=>g.winner),rows=[['날짜','경기','A팀','B팀','승리팀'],...gs.map((g,i)=>[date,i+1,g.a.map(nameOf).join('/'),g.b.map(nameOf).join('/'),g.winner.toUpperCase()])];
 const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`MTC_${date}_경기기록.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
