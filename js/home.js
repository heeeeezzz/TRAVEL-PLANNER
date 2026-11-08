/* =========================================================
   home.js — 여행 목록 첫 화면, 여행 만들기·복제·삭제·내보내기, 화면 전환
   ========================================================= */

let view = 'home', mapInited = false;

/* ---------- 공용 창 ---------- */
function openModal() { $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
function confirmBox(msg, cb) {
  $('#modalBox').innerHTML = `<div style="margin-bottom:16px">${esc(msg)}</div><div class="row" style="justify-content:flex-end"><button onclick="closeModal()">취소</button><button class="primary" id="cfOk">확인</button></div>`;
  openModal();
  $('#cfOk').onclick = () => { closeModal(); cb(); };
}

/* ---------- 화면 전환 (주소 #trip-아이디) ---------- */
function route() {
  const m = location.hash.match(/^#trip-([a-z0-9]+)$/);
  if (m && tripIds().includes(m[1])) openPlanner(m[1]); else showHome();
}
function goHome() { if (location.hash) location.hash = ''; else showHome(); }
function goTrip(id) { location.hash = 'trip-' + id; }
function showHome() {
  view = 'home'; S = null; closeModal();
  $('#home').style.display = ''; $('#planner').style.display = 'none';
  document.title = 'TRAVEL PLANNER';
  renderHome();
}
async function openPlanner(id) {
  const t = loadTrip(id); if (!t) { showHome(); return; }
  S = t; view = 'planner';
  Object.assign(ui, {tab:'plan', day:0, addMode:false, results:[], fit:true});
  $('#home').style.display = 'none'; $('#planner').style.display = '';
  document.title = (S.trip.name || '여행') + ' · TRAVEL PLANNER';
  render();
  if (!mapInited) { mapInited = true; await MapX.init($('#map'), mapClicked); ui.fit = true; if (S) render(); }
  ensureWalks();
}

/* ---------- 여행 목록 ---------- */
function tripStatus(t) {
  const s = t.trip.startDate, e = tripEnd(t), today = todayIso();
  if (!s) return {label:'날짜 미정', past:false, order:99999};
  if (today < s) { const n = daysBetween(today, s); return {label:'D-' + n, past:false, order:n}; }
  if (today === s) return {label:'D-DAY', past:false, order:0};
  if (today <= e) return {label:'여행 중', past:false, order:-1};
  return {label:'', past:true, order:daysBetween(e, today)};
}
function renderHome() {
  const trips = allTrips().map(t => ({t, st:tripStatus(t)}));
  const up = trips.filter(x => !x.st.past).sort((a, b) => a.st.order - b.st.order);
  const past = trips.filter(x => x.st.past).sort((a, b) => a.st.order - b.st.order);
  let h = `<div class="homehead">
      <div class="brandwrap"><img src="icons/icon-192.png" alt=""><div><div class="brand">TRAVEL PLANNER</div><div class="brandby">made by 희지</div></div></div>
      <div class="row">
        ${installEvt ? `<button onclick="installApp()">📲 앱 설치</button>` : ''}
        <button onclick="openGlobalSettings()" title="설정">⚙️ 설정</button>
        <label class="btnlike">⬆️ 불러오기<input type="file" accept=".json,application/json" style="display:none" onchange="importTripFile(this.files[0]);this.value=''"></label>
        <button class="primary" onclick="openNewTrip()">＋ 새 여행</button>
      </div></div>`;
  if (!G.apiKey) h += `<div class="notice">🔑 구글 API 키를 넣으면 한글 장소 검색과 한국어 지도를 쓸 수 있어요. <button class="small" onclick="openGlobalSettings()">키 넣기</button></div>`;
  h += `<div class="sec">다가오는 여행</div><div class="cards">`;
  up.forEach(({t, st}) => { h += tripCard(t, st); });
  h += `<div class="tcard newcard" onclick="openNewTrip()"><div style="font-size:26px">＋</div>새 여행 만들기</div></div>`;
  if (past.length) {
    h += `<div class="sec">지난 여행</div>`;
    past.forEach(({t}) => {
      const total = moneyCalc(t).total, n = t.trip.days;
      h += `<div class="pastrow" onclick="goTrip('${t.id}')">
        <div class="pastthumb" style="background-color:${t.color}" ${t.coverFid ? `data-fid="${t.coverFid}"` : ''}></div>
        <div style="flex:1;min-width:0"><b>${esc(t.trip.name)}</b>
          <div class="sub">${t.trip.startDate.replace(/-/g, '. ')} ~ ${shortDate(tripEnd(t))} · ${n - 1}박 ${n}일${total ? ' · 총 경비 ' + won(total) : ''}</div></div>
        ${menuBtn(t.id)}</div>`;
    });
  }
  h += `<div class="homefoot">✈️ TRAVEL PLANNER · made by 희지</div>`;
  $('#home').innerHTML = `<div class="homewrap">${h}</div>`;
  hydrate($('#home'));
}
function tripCard(t, st) {
  const n = t.trip.days;
  const places = t.places.filter(p => p.cat !== 'hotel' && p.cat !== 'air' && p.cat !== 'station').length;
  const range = t.trip.startDate ? `${shortDate(t.trip.startDate)} ~ ${shortDate(tripEnd(t))} · ${n > 1 ? (n - 1) + '박 ' : ''}${n}일` : '날짜를 정해주세요';
  return `<div class="tcard" onclick="goTrip('${t.id}')">
    <div class="cover" style="background-color:${t.color}" ${t.coverFid ? `data-fid="${t.coverFid}"` : ''}>
      <span class="dday">${st.label}</span>${menuBtn(t.id)}
    </div>
    <div class="tbody"><div class="tname">${esc(t.trip.name)}</div>
      <div class="sub">${range}</div>
      <div class="tcount"><span>📍 ${places}곳</span>${t.transports.length ? `<span>🚄 ${t.transports.length}편</span>` : ''}<span>👥 ${t.members.length}명</span></div>
    </div></div>`;
}
function menuBtn(id) {
  return `<div class="menuwrap" onclick="event.stopPropagation()"><button class="ghost dots" onclick="toggleMenu(this)">⋯</button>
    <div class="menu">
      <div onclick="openTripEdit('${id}')">✏️ 이름·사진 바꾸기</div>
      <div onclick="openNewTrip('${id}')">📄 복제해서 새 여행</div>
      <div onclick="exportTrip('${id}')">⬇️ 내보내기</div>
      <div class="danger" onclick="confirmBox('이 여행을 삭제할까요? 되돌릴 수 없어요.',()=>deleteTrip('${id}'))">🗑️ 삭제</div>
    </div></div>`;
}
function toggleMenu(btn) {
  const m = btn.nextElementSibling, open = m.classList.contains('open');
  document.querySelectorAll('.menu.open').forEach(x => x.classList.remove('open'));
  if (!open) m.classList.add('open');
}
document.addEventListener('click', () => document.querySelectorAll('.menu.open').forEach(x => x.classList.remove('open')));

/* ---------- 새 여행 / 복제 ---------- */
function openNewTrip(srcId) {
  const trips = allTrips();
  const src = srcId ? trips.find(t => t.id === srcId) : null;
  const opts = sel => trips.map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.trip.name)}</option>`).join('');
  const lastPast = trips.filter(t => tripStatus(t).past)[0];
  $('#modalBox').innerHTML = `<div class="h2">${src ? '복제해서 새 여행' : '새 여행'}</div>
  <form id="ntform" onsubmit="event.preventDefault();createTrip()">
    <label class="f">여행 이름<input name="name" required value="${src ? esc(src.trip.name) + ' (복사본)' : ''}" placeholder="예: 후쿠오카 주말"></label>
    <div class="grid2" style="margin-top:8px">
      <label class="f">출발일<input name="start" type="date"></label>
      <label class="f">돌아오는 날<input name="end" type="date"></label>
    </div>
    <label class="f" style="margin-top:8px">동행자 (쉼표로 구분)<input name="members" value="${esc(src ? src.members.join(', ') : '나')}"></label>
    <label class="f" style="margin-top:8px">대표 사진 (선택)<input name="cover" type="file" accept="image/*"></label>
    ${trips.length ? `<div class="sub" style="margin:12px 0 4px">시작 방법</div>
    <label class="row" style="gap:6px"><input type="radio" name="from" value="blank" ${src ? '' : 'checked'}> 빈 여행</label>
    <label class="row" style="gap:6px;margin-top:4px"><input type="radio" name="from" value="dup" ${src ? 'checked' : ''}> 다른 여행 복제 (장소 보관함·동행자·환율·예산)
      <select name="dupSrc" style="width:auto">${opts(srcId)}</select></label>
    <div class="sub" style="margin:12px 0 4px">준비물 목록</div>
    <label class="row" style="gap:6px"><input type="radio" name="ck" value="basic" ${src ? '' : 'checked'}> 기본 목록 (일본 여행용)</label>
    <label class="row" style="gap:6px;margin-top:4px"><input type="radio" name="ck" value="copy" ${src ? 'checked' : ''}> 다른 여행에서 가져오기
      <select name="ckSrc" style="width:auto">${opts(srcId || (lastPast && lastPast.id))}</select></label>` : ''}
    <div class="row" style="justify-content:flex-end;margin-top:16px"><button type="button" onclick="closeModal()">취소</button><button class="primary">만들고 시작하기</button></div>
  </form>`;
  openModal();
}
async function createTrip() {
  const f = $('#ntform');
  const start = f.start.value, end = f.end.value;
  if (start && end && end < start) { toast('돌아오는 날이 출발일보다 빠를 수 없어요'); return; }
  const days = start && end ? Math.min(30, daysBetween(start, end) + 1) : 3;
  const members = f.members.value.split(',').map(s => s.trim()).filter(Boolean);
  const t = blankTrip({name:f.name.value.trim() || '새 여행', startDate:start, days, members:members.length ? members : ['나']});
  const get = id => loadTrip(id);
  if (f.from && f.from.value === 'dup') {
    const src = get(f.dupSrc.value);
    if (src) {
      t.places = JSON.parse(JSON.stringify(src.places));
      t.money.rate = src.money.rate; t.money.budget = src.money.budget;
    }
  }
  if (f.ck && f.ck.value === 'copy') {
    const src = get(f.ckSrc.value);
    if (src) t.checklist = src.checklist.map(x => ({id:uid(), cat:x.cat, text:x.text, done:false}));
  }
  const file = f.cover.files[0];
  if (file) { try { const fid = uid(); await DB.put(fid, file); t.coverFid = fid; } catch (e) { toast('사진 저장에 실패했어요'); } }
  syncDaysOf(t); storeTrip(t);
  setTripIds([t.id].concat(tripIds()));
  closeModal(); goTrip(t.id);
  toast('새 여행을 만들었어요. 장소 탭에서 가고 싶은 곳부터 넣어보세요');
}
function syncDaysOf(t) { const keep = S; S = t; syncDays(); S = keep; }

/* ---------- 이름·사진 바꾸기 ---------- */
function openTripEdit(id) {
  const t = S && S.id === id ? S : loadTrip(id);
  $('#modalBox').innerHTML = `<div class="h2">이름·사진 바꾸기</div>
  <form id="teform" onsubmit="event.preventDefault();saveTripEdit('${id}')">
    <div class="cover editcover" style="background-color:${t.color}" ${t.coverFid ? `data-fid="${t.coverFid}"` : ''}></div>
    <label class="f" style="margin-top:10px">여행 이름<input name="name" value="${esc(t.trip.name)}" required></label>
    <label class="f" style="margin-top:8px">대표 사진<input name="cover" type="file" accept="image/*"></label>
    ${t.coverFid ? `<label class="row" style="gap:6px;margin-top:6px"><input type="checkbox" name="rm"> 사진 지우기 (색으로 표시)</label>` : ''}
    <div class="sub" style="margin:10px 0 4px">사진이 없을 때 색</div>
    <div class="row">${COVER_COLORS.map(c => `<label style="cursor:pointer"><input type="radio" name="color" value="${c}" ${c === t.color ? 'checked' : ''} style="display:none"><span class="swatch${c === t.color ? ' on' : ''}" style="background:${c}" onclick="this.parentNode.parentNode.querySelectorAll('.swatch').forEach(x=>x.classList.remove('on'));this.classList.add('on')"></span></label>`).join('')}</div>
    <div class="row" style="justify-content:flex-end;margin-top:16px"><button type="button" onclick="closeModal()">취소</button><button class="primary">저장</button></div>
  </form>`;
  openModal(); hydrate($('#modalBox'));
}
async function saveTripEdit(id) {
  const f = $('#teform'), t = S && S.id === id ? S : loadTrip(id);
  t.trip.name = f.name.value.trim() || t.trip.name;
  const c = f.querySelector('[name=color]:checked'); if (c) t.color = c.value;
  if (f.rm && f.rm.checked && t.coverFid) { try { await DB.del(t.coverFid); } catch (e) {} t.coverFid = ''; }
  const file = f.cover.files[0];
  if (file) { try { if (t.coverFid) await DB.del(t.coverFid); const fid = uid(); await DB.put(fid, file); t.coverFid = fid; } catch (e) { toast('사진 저장에 실패했어요'); } }
  storeTrip(t); closeModal();
  if (view === 'home') renderHome(); else render(true);
  toast('저장했어요');
}

/* ---------- 삭제·내보내기·불러오기 ---------- */
async function deleteTrip(id, fromPlanner) {
  const t = loadTrip(id); if (!t) return;
  const fids = [t.coverFid].concat(...t.vouchers.map(v => v.files.map(f => f.fid))).filter(Boolean);
  for (const fid of fids) { try { await DB.del(fid); } catch (e) {} }
  LS.del('tp.trip.' + id); setTripIds(tripIds().filter(x => x !== id));
  toast('여행을 삭제했어요');
  if (fromPlanner || view === 'planner') goHome(); else renderHome();
}
async function exportTrip(id) {
  const t = S && S.id === id ? S : loadTrip(id);
  const out = JSON.parse(JSON.stringify(t)); out.files = {};
  const fids = [t.coverFid].concat(...t.vouchers.map(v => v.files.map(f => f.fid))).filter(Boolean);
  for (const fid of fids) { try { const b = await DB.get(fid); if (b) out.files[fid] = await blobToDataURL(b); } catch (e) {} }
  const blob = new Blob([JSON.stringify(out)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = (t.trip.name || 'trip').replace(/[\\/:*?"<>|]/g, '_') + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importTripFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = async () => {
    try {
      const d = JSON.parse(r.result); if (!d.places || !d.days) throw 0;
      if (d.files) { for (const [fid, u] of Object.entries(d.files)) await DB.put(fid, dataURLtoBlob(u)); delete d.files; }
      const t = migrate(d); delete t.sample;
      if (tripIds().includes(t.id)) t.id = uid();
      if (!t.trip.name) t.trip.name = '불러온 여행';
      storeTrip(t); setTripIds([t.id].concat(tripIds()));
      renderHome(); toast(`'${t.trip.name}'을(를) 불러왔어요`);
    } catch (e) { toast('올바른 여행 파일이 아니에요'); }
  };
  r.readAsText(file);
}

/* ---------- 전역 설정 (API 키) ---------- */
function settingsKeyCard() {
  const st = !G.apiKey ? '키가 없어서 무료 지도와 무료 검색을 쓰고 있어요.'
    : MapX.kind === 'google' && !Search.googleBroken ? '✅ 구글 지도와 장소 검색을 쓰고 있어요.'
    : MapX.kind ? '⚠️ 키가 저장돼 있지만 구글 지도를 불러오지 못했어요. 키 제한(웹사이트 주소)과 API 사용 설정을 확인하세요.'
    : '키가 저장돼 있어요. 여행을 열면 구글 지도로 보여요.';
  return `<div class="card"><div class="h2">구글 지도 API 키</div>
    <div class="sub" style="margin-bottom:8px">${st}</div>
    <div class="row" style="flex-wrap:nowrap"><input id="apiKeyIn" type="password" value="${esc(G.apiKey)}" placeholder="AIza로 시작하는 키" style="flex:1" autocomplete="off">
      <button type="button" onclick="const i=$('#apiKeyIn');i.type=i.type==='password'?'text':'password'">보기</button></div>
    <div class="row" style="margin-top:8px"><button class="primary" onclick="saveApiKey()">저장</button>${G.apiKey ? `<button onclick="$('#apiKeyIn').value='';saveApiKey()">키 지우기</button>` : ''}</div>
    <div class="sub" style="margin-top:8px">키는 이 브라우저에만 저장되고 GitHub에는 올라가지 않아요. 저장하면 페이지가 새로고침돼요. 폰에서도 쓰려면 폰 브라우저에서도 한 번 넣어주세요.</div></div>`;
}
function saveApiKey() {
  G.apiKey = $('#apiKeyIn').value.trim(); saveSettings();
  toast('저장했어요. 새로고침할게요'); setTimeout(() => location.reload(), 600);
}
function openGlobalSettings() {
  $('#modalBox').innerHTML = settingsKeyCard() + `<div class="row" style="justify-content:flex-end"><button onclick="closeModal()">닫기</button></div>`;
  openModal();
}

/* ---------- 홈 화면에 앱 설치 (크롬·삼성 인터넷) ---------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (view === 'home') renderHome(); });
window.addEventListener('appinstalled', () => { installEvt = null; toast('홈 화면에 앱을 추가했어요'); if (view === 'home') renderHome(); });
async function installApp() {
  if (!installEvt) { toast('브라우저 메뉴(⋮)에서 "홈 화면에 추가"를 눌러주세요'); return; }
  installEvt.prompt();
  try { await installEvt.userChoice; } catch (e) {}
  installEvt = null; if (view === 'home') renderHome();
}

/* ---------- 시작 ---------- */
function boot() {
  if (!tripIds().length) {
    const ids = [];
    const old = LS.get('travelPlanner.v1');   // 예전 버전(파일로 열던 것) 데이터
    if (old && !old.sample) { const t = migrate(old); storeTrip(t); ids.push(t.id); }
    const sample = sampleTrip(); storeTrip(sample); ids.push(sample.id);
    setTripIds(ids);
  }
  document.querySelectorAll('#nav button').forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; render(); });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  $('#btnAddMode').onclick = () => setAddMode(!ui.addMode);
  $('#btnFit').onclick = () => { ui.fit = true; renderMap(); };
  window.addEventListener('hashchange', route);
  route();
}
