/* =========================================================
   planner.js — 여행 하나의 플래너 화면 (일정·장소·교통편·숙소·바우처·경비·준비물·설정)
   ========================================================= */

const ui = {tab:'plan', day:0, addMode:false, results:[], fit:true};

/* ---------- 지도 그리기 ---------- */
function renderMap() {
  if (!MapX.ok() || !S) return;
  MapX.clear();
  const day = S.days[ui.day];
  const c = day ? computeDay(day) : {rows:[]};
  const inDay = new Set();
  c.rows.forEach(r => { if (r.role === 'tr') { inDay.add(r.tr.from); inDay.add(r.tr.to); } else inDay.add(r.id); });
  const bounds = [];
  S.places.forEach(p => {
    if (inDay.has(p.id) || isTransportPlace(p)) return;
    const d = dayOf(p.id);
    MapX.dot(p.lat, p.lng, {color:d >= 0 || p.cat === 'hotel' ? '#9aa3af' : CATS[p.cat].color, opacity:d >= 0 ? .6 : .9,
      html:`<b>${esc(p.name)}</b><br><span style="color:#6b7280">${p.cat === 'hotel' ? '숙소' : d >= 0 ? (d + 1) + '일차 일정' : '보관함 (일정 미배정)'}</span><br>
      ${rw((d < 0 && p.cat !== 'hotel' ? `<button onclick="addToDay('${p.id}',${ui.day})" style="margin-top:6px">${ui.day + 1}일차에 추가</button> ` : '') + `<button onclick="openPlaceModal('${p.id}')" style="margin-top:6px">수정</button>`)}`});
  });
  c.rows.forEach(r => {
    if (r.legIn) {
      const l = r.legIn, pa = P(l.a), pb = P(l.b);
      if (l.mode === 'walk' && geomCache[l.key]) MapX.line(geomCache[l.key], {color:'#2563eb', weight:4, opacity:.8});
      else if (l.mode === 'walk') MapX.line([[pa.lat, pa.lng], [pb.lat, pb.lng]], {color:'#2563eb', weight:3, dash:'dot'});
      else MapX.line([[pa.lat, pa.lng], [pb.lat, pb.lng]], {color:'#ea580c', weight:3, dash:'dash', opacity:.9});
    }
    if (r.role === 'tr') {
      const m = TRMODES[r.tr.mode], a = P(r.tr.from), b = P(r.tr.to);
      MapX.line([[a.lat, a.lng], [b.lat, b.lng]], {color:m.color, weight:4, opacity:.85});
    }
  });
  let n = 0; const drawn = new Set();
  const addPin = (p, label, color, fixed, html, z) => {
    if (drawn.has(p.id)) return; drawn.add(p.id);
    MapX.pin(p.lat, p.lng, {label, color, fixed, html, z}); bounds.push([p.lat, p.lng]);
  };
  c.rows.forEach(r => {
    if (r.role === 'tr') {
      const m = TRMODES[r.tr.mode], a = P(r.tr.from), b = P(r.tr.to);
      addPin(a, CATS[a.cat].icon, CATS[a.cat].color, true, `<b>${esc(a.name)}</b><br>${m.icon} ${esc(r.tr.name || m.label)} ${hhmm(r.dep)} 출발`, 5);
      addPin(b, CATS[b.cat].icon, CATS[b.cat].color, true, `<b>${esc(b.name)}</b><br>${m.icon} ${hhmm(r.arr)} 도착`, 5);
      return;
    }
    const p = r.p;
    if (r.role === 'stop') {
      n++;
      addPin(p, n, CATS[p.cat].color, !!p.fixed, `<b>${esc(p.name)}</b><br>${fmt(r.start)} ~ ${fmt(r.depart)}${p.fixed ? '<br>🎫 ' + p.fixed + ' 고정' : ''}${rw(`<br><button onclick="openPlaceModal('${p.id}')" style="margin-top:6px">수정</button>`)}`, 20 + n);
    } else {
      addPin(p, CATS[p.cat].icon, CATS[p.cat].color, false, `<b>${esc(p.name)}</b><br>${r.role === 'start' ? '출발 ' + fmt(r.depart) : '도착 ' + fmt(r.arrive)}`, 6);
    }
  });
  if (ui.fit) {
    ui.fit = false;
    let fitPts = bounds;   // 국제선 반대편 공항은 화면 맞추기에서 제외
    if (bounds.length > 2) {
      const cLat = bounds.reduce((s, b) => s + b[0], 0) / bounds.length, cLng = bounds.reduce((s, b) => s + b[1], 0) / bounds.length;
      const near = bounds.filter(b => hav({lat:b[0], lng:b[1]}, {lat:cLat, lng:cLng}) < 400);
      if (near.length >= 2) fitPts = near;
    }
    const all = fitPts.length ? fitPts : S.places.filter(p => !isTransportPlace(p)).map(p => [p.lat, p.lng]);
    MapX.fit(all);
  }
}

/* ---------- 렌더 ---------- */
const VIEWS = {plan:() => viewPlan(), places:() => viewPlaces(), trans:() => viewTrans(), stay:() => viewStay(), vouch:() => viewVouch(), money:() => viewMoney(), check:() => viewCheck(), settings:() => viewSettings()};
function render(keepScroll) {
  if (!S) return;
  syncDays();
  if (ui.day >= S.days.length) ui.day = Math.max(0, S.days.length - 1);
  $('#tripTitle').textContent = S.trip.name || '여행';
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  document.body.classList.toggle('nomap', !['plan', 'places'].includes(ui.tab));
  const panel = $('#panel'), y = panel.scrollTop;
  panel.innerHTML = VIEWS[ui.tab]();
  if (keepScroll) panel.scrollTop = y;
  hydrate(panel);
  renderMap();
  MapX.resize();
}
function vouchersFor(link) { return S.vouchers.filter(v => v.link === link); }
function vTag(link) {
  const vs = vouchersFor(link); if (!vs.length) return '';
  return `<button class="tag vch" onclick="openVouchers('${link}')">🎟️ 바우처${vs.length > 1 ? ' ' + vs.length : ''}</button>`;
}
function extraTags(r) {
  let h = '';
  if (r.drop) {
    const l = r.drop.l;
    h += `<span class="tag lug">🧳 짐 맡기기 ${fmt(r.drop.at)}${l.dropMin ? ' (' + l.dropMin + '분)' : ''} → ${esc(P(l.to)?.name || '?')}${l.dropTime ? ' · 마감 ' + l.dropTime : ''}</span>`;
    if (r.drop.late) h += `<span class="tag late">⚠️ 짐 맡기기 마감보다 ${dur(r.drop.late)} 늦어요</span>`;
    h += vTag('l:' + l.id);
  }
  if (r.lugArr) {
    h += `<span class="tag lug">🧳 짐 도착 예정 ${r.lugArr.l.arrTime || '?'}${r.lugArr.l.arrTime ? ' 이후' : ''}</span>`;
    if (r.lugArr.early) h += `<span class="tag wait">짐보다 ${dur(r.lugArr.early)} 먼저 도착해요</span>`;
  }
  if (r.earlyIn) h += `<span class="tag wait">🏨 체크인 ${r.earlyIn.s.inTime} 전 도착 (${dur(r.earlyIn.by)} 일찍)</span>`;
  if (r.lateOut) h += `<span class="tag late">⚠️ 체크아웃 ${r.lateOut.s.outTime}보다 ${dur(r.lateOut.by)} 늦게 나가요</span>`;
  return h;
}
const stars = p => p.rating ? `<span class="tag star">★ ${p.rating.toFixed(1)}${p.ratingCount ? ' (' + p.ratingCount.toLocaleString() + ')' : ''}</span>` : '';

function viewPlan() {
  const day = S.days[ui.day];
  let h = `<div class="daytabs">${S.days.map((d, i) => `<button class="${i === ui.day ? 'on' : ''}" onclick="selDay(${i})">${i + 1}일차 ${dayDate(i)}</button>`).join('')}</div>`;
  if (!day) return h + '<div class="empty">설정에서 여행 기간을 정하세요</div>';
  const di = ui.day;
  const autoS = stayFor(dayIso(di), 'prev'), autoE = stayFor(dayIso(di), 'night');
  const placeOpts = (sel, auto) => `<option value="auto" ${sel === 'auto' ? 'selected' : ''}>🔄 자동: ${auto ? esc(P(auto.placeId)?.name) : '숙소 없음'}</option><option value="" ${sel === '' ? 'selected' : ''}>없음</option>` +
    S.places.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${CATS[p.cat].icon} ${esc(p.name)}</option>`).join('');
  const unassigned = S.places.filter(p => dayOf(p.id) < 0 && !isTransportPlace(p) && p.cat !== 'hotel');
  if (RO) h += roDayCard(di); else h += `<div class="card"><div class="grid2">
      <label class="f">출발 시각<input type="text" inputmode="numeric" class="tinput" placeholder="예: 930" autocomplete="off" maxlength="12" value="${day.start}" onchange="S.days[${di}].start=this.value;save();render(true)"></label>
      <label class="f">출발지<select onchange="S.days[${di}].startSel=this.value;save();render(true);ensureWalks()">${placeOpts(day.startSel, autoS)}</select></label>
      <label class="f">추가할 장소<select onchange="if(this.value){addToDay(this.value,${di})}"><option value="">보관함에서 선택…</option>${unassigned.map(p => `<option value="${p.id}">${CATS[p.cat].icon} ${esc(p.name)}</option>`).join('')}</select></label>
      <label class="f">도착지<select onchange="S.days[${di}].endSel=this.value;save();render(true);ensureWalks()">${placeOpts(day.endSel, autoE)}</select></label>
    </div>
    <div class="row" style="margin-top:10px"><button class="primary" onclick="optimizeDay(${di})">✨ 최적 순서 추천</button>
      <button onclick="openTransportModal(null,'train')">🚄 교통편 추가</button></div>
    <div class="sub" style="margin-top:6px">출발지·도착지는 🏨 숙소 탭 기준으로 자동으로 정해져요. 그날만 다르게 하려면 직접 고르세요.</div>
  </div>`;
  const c = computeDay(day);
  if (!c.rows.length) return h + '<div class="empty">아직 장소가 없어요.<br>위에서 추가하거나 📍 장소 탭에서 검색하세요.</div>';
  let n = 0;
  c.rows.forEach((r, idx) => {
    if (r.legIn) h += legView(r.legIn);
    else if (idx > 0) h += '<div class="gap"></div>';
    if (r.role === 'tr') { h += trRow(r); return; }
    const p = r.p;
    if (r.role !== 'stop') {
      const tm = r.role === 'start' ? '출발 ' + fmt(r.depart) : '도착 ' + fmt(r.arrive);
      h += `<div class="stop endpt"><div class="badge" style="background:${CATS[p.cat].color}">${CATS[p.cat].icon}</div><div class="body">
        <div class="name">${esc(p.name)} <span class="sub">${r.role === 'start' ? '출발지' : '도착지'}</span></div>
        <div class="time">${tm}</div><div>${extraTags(r)}${vTag('p:' + p.id)}</div></div></div>`;
      return;
    }
    n++;
    let tags = '';
    if (p.fixed) tags += `<span class="tag fixed">🎫 ${p.fixed} 고정${p.ticket ? ' · 티켓 있음' : ''}</span>`;
    if (r.late) tags += `<span class="tag late">⚠️ ${dur(r.late)} 늦게 도착</span>`;
    if (r.wait && p.fixed) tags += `<span class="tag wait">⏳ ${dur(r.wait)} 여유 · 앞 일정에서 더 머물 수 있어요</span>`;
    else if (r.wait) tags += `<span class="tag wait">⏳ ${dur(r.wait)} 대기 (${hhmm(r.hours.open)} 개장)</span>`;
    if (r.closedDay) tags += `<span class="tag late">⚠️ 이날(${WEEK[new Date(dayIso(di) + 'T00:00:00').getDay()]}) 휴무예요</span>`;
    if (r.closeWarn) tags += `<span class="tag late">⚠️ 영업 종료(${hhmm(r.hours.close)}) 전에 다 못 봐요</span>`;
    else if (r.hours && r.hours.open != null && !r.hours.manual) tags += `<span class="tag memo">영업 ${hhmm(r.hours.open)}~${r.hours.close >= 2880 ? '24시간' : hhmm(r.hours.close)}</span>`;
    tags += stars(p) + extraTags(r);
    if (p.memo) tags += `<span class="tag memo">${esc(p.memo)}</span>`;
    tags += vTag('p:' + p.id);
    h += `<div class="stop"><div class="badge" style="background:${CATS[p.cat].color}">${n}</div>
      <div class="body"><div class="name">${CATS[p.cat].icon} ${esc(p.name)}</div>
        <div class="time"><b>${fmt(r.start)}</b> ~ <b>${fmt(r.depart)}</b> <span class="sub">(체류 ${dur(p.stay || 0)}${r.wait ? ', 도착 ' + fmt(r.arrive) : ''})</span></div>
        <div>${tags}</div></div>
      ${ctrls(r.si, `openPlaceModal('${p.id}')`, '일정에서 빼기')}</div>`;
  });
  h += `<div class="card" style="margin-top:12px"><div class="summary">
    <div><span class="sub">종료</span><b>${fmt(c.end)}</b></div>
    <div><span class="sub">이동</span><b>${dur(c.travel)}</b></div>
    ${c.ride ? `<div><span class="sub">교통편 탑승</span><b>${dur(c.ride)}</b></div>` : ''}
    <div><span class="sub">여유/대기</span><b>${dur(c.waitSum)}</b></div>
    ${c.late ? `<div><span class="sub" style="color:var(--warn)">지각</span><b style="color:var(--warn)">${dur(c.late)}</b></div>` : ''}
  </div><div class="sub" style="margin-top:8px">🟠 <b>추정</b> 표시된 대중교통 시간은 거리로 계산한 대략치예요. 구글맵에서 확인한 시간을 입력하면 정확해져요.</div></div>`;
  return h;
}
function ctrls(si, editJs, delTitle) {
  if (RO) return '';
  return `<div class="ctrls"><button class="ghost" title="위로" onclick="moveStop(${si},-1)">▲</button><button class="ghost" title="아래로" onclick="moveStop(${si},1)">▼</button></div>
    <div class="ctrls"><button class="ghost" title="수정" onclick="${editJs}">✏️</button><button class="ghost" title="${delTitle}" onclick="removeStop(${si})">✕</button></div>`;
}
function trRow(r) {
  const tr = r.tr, m = TRMODES[tr.mode], a = P(tr.from), b = P(tr.to);
  let tags = '';
  if (r.late) tags += `<span class="tag late">⚠️ ${dur(r.late)} 늦어요 — 놓칠 수 있어요</span>`;
  else if (!r.first && r.wait) tags += `<span class="tag wait">⏳ ${dur(r.wait)} 여유 · 앞 일정에서 더 머물 수 있어요</span>`;
  tags += extraTags(r);
  if (tr.seat) tags += `<span class="tag memo">💺 ${esc(tr.seat)}</span>`;
  if (tr.ref) tags += `<span class="tag memo">예약 ${esc(tr.ref)}</span>`;
  tags += vTag('t:' + tr.id);
  return `<div class="stop trcard" style="border-color:${m.color}"><div class="badge" style="background:${m.color}">${m.icon}</div>
    <div class="body"><div class="name">${esc(tr.name || m.label)} <span class="sub">${m.label}</span></div>
      <div class="time">${esc(a.name)} <b>${fmt(r.dep)}</b> → ${esc(b.name)} <b>${fmt(r.arr)}</b></div>
      <div class="sub">${r.first ? '' : `${esc(a.name)} 도착 ${fmt(r.arrive)} · `}출발 ${tr.bufDep}분 전(${fmt(r.deadline)})까지 도착 · 내린 뒤 ${tr.bufArr}분 → <b>${fmt(r.ready)}</b>부터 다음 일정</div>
      <div>${tags}</div></div>
    ${ctrls(r.si, `openTransportModal('${tr.id}')`, '이 날 일정에서 빼기')}</div>`;
}
function legView(l) {
  if (RO) return legViewRO(l);
  const gm = `https://www.google.com/maps/dir/?api=1&origin=${P(l.a).lat},${P(l.a).lng}&destination=${P(l.b).lat},${P(l.b).lng}&travelmode=${l.mode === 'walk' ? 'walking' : 'transit'}`;
  let detail;
  if (l.mode === 'walk') {
    detail = `<span class="legmin">🚶 ${dur(l.walkMin)}</span> <span class="sub">${l.walkKm.toFixed(1)}km</span> ${l.walkReal ? '<span class="real">경로</span>' : '<span class="est">추정</span>'}`;
  } else {
    detail = `<span class="legmin">🚃</span> <input class="legmin-input" type="number" min="1" value="${l.transitMin}" onchange="setLeg('${l.key}',{transitMin:+this.value||null});render(true)">분
      ${l.transitReal ? `<span class="real">입력함</span> <button class="ghost sub" onclick="setLeg('${l.key}',{transitMin:null});render(true)" title="추정치로 되돌리기">↺</button>` : '<span class="est">추정</span>'}
      <span class="sub">직선 ${l.km.toFixed(1)}km</span>`;
  }
  return `<div class="leg ${l.mode}">
    <div class="row"><div class="seg">
      <button class="${l.mode === 'walk' ? 'on' : ''}" onclick="setLeg('${l.key}',{mode:'walk'});render(true);ensureWalks()">🚶 도보</button>
      <button class="${l.mode === 'transit' ? 'on' : ''}" onclick="setLeg('${l.key}',{mode:'transit'});render(true)">🚃 대중교통</button>
    </div><a class="gm" href="${gm}" target="_blank" rel="noopener">구글맵 경로 ↗</a></div>
    <div class="row">${detail}</div></div>`;
}

/* ---------- 보기 전용(공유 화면)용 ---------- */
const rw = html => RO ? '' : html;
function roDayCard(di) {
  const sp = startOf(di), ep = endOf(di), d = S.days[di];
  return `<div class="card sub" style="font-size:13px">출발 <b style="color:var(--text)">${d.start}</b>${sp ? ' · ' + esc(P(sp)?.name || '') + '에서' : ''}${ep ? ' → ' + esc(P(ep)?.name || '') + '로' : ''}</div>`;
}
function legViewRO(l) {
  const gm = `https://www.google.com/maps/dir/?api=1&origin=${P(l.a).lat},${P(l.a).lng}&destination=${P(l.b).lat},${P(l.b).lng}&travelmode=${l.mode === 'walk' ? 'walking' : 'transit'}`;
  const t = l.mode === 'walk' ? `🚶 도보 ${dur(l.walkMin)} <span class="sub">${l.walkKm.toFixed(1)}km</span>` : `🚃 대중교통 ${dur(l.transitMin)}${l.transitReal ? '' : ' <span class="est">추정</span>'}`;
  return `<div class="leg ${l.mode}"><div class="row"><span class="legmin">${t}</span><a class="gm" href="${gm}" target="_blank" rel="noopener">구글맵 경로 ↗</a></div></div>`;
}

/* ---------- 장소 탭 ---------- */
function viewPlaces() {
  const g = MapX.kind === 'google' && !Search.googleBroken;
  let h = RO ? '' : `<div class="card"><div class="h2">장소 검색</div>
    <input id="placeQ" placeholder="${g ? '예: 이치란 시부야, 스카이트리' : '예: 一蘭 渋谷, Shibuya Sky'}" style="width:100%" autocomplete="off" oninput="onPlaceInput(this.value)">
    <div id="placeRes"></div>
    <div class="sub" style="margin-top:6px">${g ? '한글로 검색해도 돼요. 지도에서 가게·관광지 아이콘을 눌러 추가할 수도 있어요 (📍 지도에서 추가를 켠 상태에서).' : '무료 검색이라 일본어·영어 이름이 더 잘 찾아져요. 설정에서 구글 API 키를 넣으면 한글 검색이 돼요.'}</div>
  </div>`;
  const normal = S.places.filter(p => !isTransportPlace(p) && p.cat !== 'hotel');
  const groups = [['일정 미배정 (보관함)', normal.filter(p => dayOf(p.id) < 0)]]
    .concat(S.days.map((d, i) => [`${i + 1}일차 ${dayDate(i)}`, normal.filter(p => dayOf(p.id) === i)]))
    .concat([['숙소', S.places.filter(p => p.cat === 'hotel')], ['역·공항', S.places.filter(isTransportPlace)]]);
  groups.forEach(([title, list]) => {
    if (!list.length) return;
    h += `<div class="card"><div class="h2">${title} <span class="sub">${list.length}곳</span></div><div class="plist">`;
    list.forEach(p => {
      const d = dayOf(p.id), addable = d < 0 && p.cat !== 'hotel' && !isTransportPlace(p);
      h += `<div class="pitem"><span class="dot" style="background:${CATS[p.cat].color}"></span>
        <div style="flex:1;min-width:0"><div><b>${CATS[p.cat].icon} ${esc(p.name)}</b> ${p.rating ? `<span class="sub">★ ${p.rating.toFixed(1)}</span>` : ''}</div>
        <div class="sub">${CATS[p.cat].label}${p.stay ? ' · 체류 ' + dur(p.stay) : ''}${p.fixed ? ' · 🎫 ' + p.fixed : ''}${p.open || p.close ? ' · 영업 ' + (p.open || '?') + '~' + (p.close || '?') : p.hours ? ' · 영업시간 있음' : ''}</div></div>
        ${addable && !RO ? `<select onchange="if(this.value!=='')addToDay('${p.id}',+this.value)" style="width:auto"><option value="">일정에 추가</option>${S.days.map((x, i) => `<option value="${i}">${i + 1}일차</option>`).join('')}</select>` : ''}
        <button class="ghost" onclick="focusPlace('${p.id}')" title="지도에서 보기">🔍</button>
        ${rw(`<button class="ghost" onclick="openPlaceModal('${p.id}')" title="수정">✏️</button>`)}</div>`;
    });
    h += '</div></div>';
  });
  if (!S.places.length) h += '<div class="empty">아직 저장한 장소가 없어요</div>';
  return h;
}
let placeTimer = null, placeSeq = 0;
function onPlaceInput(q) {
  clearTimeout(placeTimer);
  placeTimer = setTimeout(async () => {
    const seq = ++placeSeq, box = $('#placeRes'); if (!box) return;
    if (q.trim().length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="sub" style="padding:8px 2px">검색 중…</div>';
    const res = await Search.suggest(q);
    if (seq !== placeSeq || !$('#placeRes')) return;
    ui.results = res;
    $('#placeRes').innerHTML = res.length ? `<div class="results">${res.map((r, i) => `<div onclick="pickResult(${i})"><b>${esc(r.name)}</b><br><span class="sub">${esc(r.addr)}</span></div>`).join('')}</div>`
      : '<div class="sub" style="padding:8px 2px">결과가 없어요</div>';
  }, 300);
}
async function pickResult(i) {
  const r = ui.results[i]; if (!r) return;
  try {
    const info = await Search.details(r);
    if (info.lat != null) MapX.view(info.lat, info.lng, 16);
    openPlaceModal(null, info);
  } catch (e) { console.warn(e); toast('장소 정보를 가져오지 못했어요'); }
}
async function mapClicked(lat, lng, placeId) {
  if (placeId && Search.useGoogle()) {
    try { const info = await Search.details({placeId}); openPlaceModal(null, info); return; } catch (e) { console.warn(e); }
  }
  openPlaceModal(null, {lat, lng}, true);
}

/* ---------- 장소 추가·수정 창 ---------- */
let placeDraft = null;
function openPlaceModal(id, init = {}, fromMap) {
  const isNew = !id;
  const p = isNew ? newPlace(uid(), init.name || '', init.cat || 'sight', init.lat, init.lng, init.cat === 'hotel' ? 0 : 60,
    {gid:init.gid || '', rating:init.rating || null, ratingCount:init.ratingCount || 0, hours:init.hours || null, hoursText:init.hoursText || null, gmaps:init.gmaps || '', addr:init.addr || ''}) : P(id);
  placeDraft = p;
  MapX.closePopup();
  const photo = init.photo ? `<img src="${esc(init.photo)}" alt="" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;margin-bottom:4px">
    ${init.photoBy ? `<div class="sub" style="margin-bottom:8px">사진: ${esc(init.photoBy)} · Google</div>` : ''}` : '';
  const ginfo = (p.rating || p.hoursText || p.addr) ? `<div class="ginfo">
      ${p.rating ? `<div>★ <b>${p.rating.toFixed(1)}</b> <span class="sub">리뷰 ${(p.ratingCount || 0).toLocaleString()}개</span></div>` : ''}
      ${p.addr ? `<div class="sub">${esc(p.addr)}</div>` : ''}
      ${p.hoursText ? `<details><summary class="sub">영업시간 보기</summary><div class="sub">${p.hoursText.map(esc).join('<br>')}</div></details>` : ''}
    </div>` : '';
  $('#modalBox').innerHTML = `<div class="h2">${isNew ? '장소 추가' : '장소 수정'}</div>${photo}${ginfo}
  <form id="pform" onsubmit="event.preventDefault();savePlace('${p.id}',${isNew})">
    <label class="f">이름<input name="name" value="${esc(p.name)}" required placeholder="${fromMap ? '이름 불러오는 중…' : ''}"></label>
    <div class="grid2" style="margin-top:8px">
      <label class="f">분류<select name="cat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${k === p.cat ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}</select></label>
      <label class="f">체류 시간 (분)<input name="stay" type="number" min="0" step="5" value="${p.stay}"></label>
      <label class="f">🎫 고정 방문 시각<input name="fixed" type="text" inputmode="numeric" class="tinput" placeholder="예: 930" autocomplete="off" maxlength="12" value="${p.fixed}"></label>
      <label class="f" style="justify-content:flex-end"><span class="row" style="gap:6px;color:var(--text)"><input name="ticket" type="checkbox" ${p.ticket ? 'checked' : ''}> 티켓 구매함</span></label>
      <label class="f">영업 시작${p.hours ? ' (비우면 구글 정보)' : ''}<input name="open" type="text" inputmode="numeric" class="tinput" placeholder="예: 930" autocomplete="off" maxlength="12" value="${p.open}"></label>
      <label class="f">영업 종료${p.hours ? ' (비우면 구글 정보)' : ''}<input name="close" type="text" inputmode="numeric" class="tinput" placeholder="예: 930" autocomplete="off" maxlength="12" value="${p.close}"></label>
    </div>
    <label class="f" style="margin-top:8px">메모<textarea name="memo" rows="2">${esc(p.memo)}</textarea></label>
    <div class="sub" style="margin-top:6px">${p.hours ? '영업시간은 구글 정보로 방문하는 날 요일에 맞춰 자동으로 계산돼요. ' : ''}고정 시각을 넣으면 그 시간에 맞춰 일정이 짜이고, 앞 일정의 여유시간이 표시돼요.</div>
    ${isNew ? `<label class="f" style="margin-top:8px">바로 일정에 넣기<select name="day"><option value="">보관함에만 저장</option>${S.days.map((d, i) => `<option value="${i}" ${ui.tab === 'plan' && i === ui.day ? 'selected' : ''}>${i + 1}일차 ${dayDate(i)}</option>`).join('')}</select></label>` : ''}
    <div class="row between" style="margin-top:14px">
      <div>${isNew ? '' : `<button type="button" class="danger" onclick="confirmBox('이 장소를 삭제할까요?',()=>delPlace('${p.id}'))">삭제</button>`}
        ${!isNew && p.gid && Search.useGoogle() ? `<button type="button" onclick="refreshPlace('${p.id}')" title="구글에서 사진·영업시간 다시 가져오기">🔄 정보</button>` : ''}
        <a class="gm" href="${gmapsLink(p)}" target="_blank" rel="noopener" style="margin-left:6px">구글맵 ↗</a></div>
      <div class="row"><button type="button" onclick="closeModal()">취소</button><button class="primary">저장</button></div>
    </div>
  </form>`;
  openModal();
  if (fromMap) Search.reverse(p.lat, p.lng).then(n => { const inp = document.querySelector('#pform [name=name]'); if (inp && !inp.value) inp.value = n; if (inp) inp.placeholder = '장소 이름'; });
}
async function refreshPlace(id) {
  const p = P(id);
  try {
    const info = await Search.details({placeId:p.gid});
    Object.assign(p, {rating:info.rating, ratingCount:info.ratingCount, hours:info.hours, hoursText:info.hoursText, gmaps:info.gmaps, addr:info.addr});
    save(); openPlaceModal(id, info); toast('구글 정보를 새로 가져왔어요');
  } catch (e) { toast('정보를 가져오지 못했어요'); }
}
function savePlace(id, isNew) {
  const f = $('#pform'), p = isNew ? placeDraft : P(id);
  p.name = f.name.value.trim(); p.cat = f.cat.value; p.stay = +f.stay.value || 0; p.fixed = f.fixed.value;
  p.ticket = f.ticket.checked; p.open = f.open.value; p.close = f.close.value; p.memo = f.memo.value.trim();
  if (isNew) {
    S.places.push(p);
    const d = f.day && f.day.value !== '' ? +f.day.value : -1;
    if (d >= 0 && p.cat !== 'hotel' && !isTransportPlace(p)) { save(); addToDay(p.id, d); }
    setAddMode(false);
    const q = $('#placeQ'); if (q) q.value = ''; const pr = $('#placeRes'); if (pr) pr.innerHTML = '';
  }
  save(); closeModal(); render(true); ensureWalks();
  toast(isNew && p.cat === 'hotel' ? '저장했어요. 숙박 날짜는 🏨 숙소 탭에서 넣어주세요' : '저장했어요');
}
function delPlace(id) {
  S.places = S.places.filter(p => p.id !== id);
  S.days.forEach(d => { d.stops = d.stops.filter(x => x !== id); if (d.startSel === id) d.startSel = 'auto'; if (d.endSel === id) d.endSel = 'auto'; });
  S.stays = S.stays.filter(s => s.placeId !== id);
  Object.keys(S.legs).forEach(k => { if (k.split('>').includes(id)) delete S.legs[k]; });
  S.vouchers.forEach(v => { if (v.link === 'p:' + id) v.link = ''; });
  save(); closeModal(); render(true);
}

/* ---------- 위치 고르기 (교통편·숙소 공용) ---------- */
const ep = {pick:{}, results:{}};
function epField(formId, k, label, ph, value, listId) {
  return `<label class="f" style="margin-top:8px">${label}
      <div class="row" style="flex-wrap:nowrap"><input name="${k}" list="${listId}" value="${esc(value)}" placeholder="${ph}" style="flex:1" autocomplete="off"><button type="button" onclick="epSearch('${formId}','${k}')" title="검색">🔍</button></div></label>
    <div id="res_${k}"></div>`;
}
async function epSearch(formId, k) {
  const f = $('#' + formId), q = f[k].value.trim(); if (!q) { toast('검색할 이름을 먼저 쓰세요'); return; }
  const box = $('#res_' + k); box.innerHTML = '<div class="sub" style="padding:6px">검색 중…</div>';
  const res = await Search.suggest(q);
  ep.results[k] = res;
  box.innerHTML = res.length ? `<div class="results">${res.map((r, i) => `<div onclick="epChoose('${formId}','${k}',${i})"><b>${esc(r.name)}</b><br><span class="sub">${esc(r.addr)}</span></div>`).join('')}</div>` : '<div class="sub" style="padding:6px">결과가 없어요</div>';
}
async function epChoose(formId, k, i) {
  const r = ep.results[k][i]; $('#res_' + k).innerHTML = '<div class="sub" style="padding:6px">불러오는 중…</div>';
  try { const info = await Search.details(r); ep.pick[k] = info; $('#' + formId)[k].value = info.name; } catch (e) { toast('위치를 가져오지 못했어요'); }
  $('#res_' + k).innerHTML = '';
}
function resolveEndpoint(name, picked, cat) {
  name = name.trim(); if (!name) return null;
  const findOrCreate = (nm, lat, lng, c, extra = {}) => {
    const ex = S.places.find(p => p.name === nm && hav(p, {lat, lng}) < 0.5);
    if (ex) return ex.id;
    const p = newPlace(uid(), nm, c, lat, lng, 0, extra); S.places.push(p); return p.id;
  };
  if (picked && picked.name === name) return findOrCreate(name, picked.lat, picked.lng, cat, {gid:picked.gid || '', addr:picked.addr || '', gmaps:picked.gmaps || '', rating:picked.rating || null, ratingCount:picked.ratingCount || 0});
  const ex = S.places.find(p => p.name === name); if (ex) return ex.id;
  const pr = PRESETS.find(x => x[0] === name); if (pr) return findOrCreate(pr[0], pr[2], pr[3], pr[1]);
  return null;
}

/* ---------- 교통편 탭 ---------- */
function viewTrans() {
  let h = RO ? '' : `<div class="card"><div class="h2">예약 교통편</div>
    <div class="sub">항공편, 신칸센·특급열차, 고속버스처럼 시간이 정해진 교통편을 넣으면 일정에 고정 블록으로 들어가요. 출발 날짜에 맞는 일차에 시간 순서대로 자동 배치돼요.</div>
    <div class="row" style="margin-top:10px">
      <button class="primary" onclick="openTransportModal(null,'air')">✈️ 항공편 추가</button>
      <button class="primary" onclick="openTransportModal(null,'train')">🚄 기차 추가</button>
      <button onclick="openTransportModal(null,'bus')">🚌 버스</button>
      <button onclick="openTransportModal(null,'ferry')">⛴️ 페리</button>
    </div></div>`;
  const list = S.transports.slice().sort((a, b) => (a.depDate + a.depTime).localeCompare(b.depDate + b.depTime));
  if (!list.length) return h + '<div class="empty">아직 교통편이 없어요</div>';
  list.forEach(tr => {
    const m = TRMODES[tr.mode], a = P(tr.from), b = P(tr.to), d = dayOf('t:' + tr.id);
    const over = daysBetween(tr.depDate, tr.arrDate || tr.depDate);
    h += `<div class="card" style="border-left:4px solid ${m.color};border-radius:0 var(--r) var(--r) 0">
      <div class="row between"><div><b>${m.icon} ${esc(tr.name || m.label)}</b> <span class="sub">${m.label}</span></div>
        <div>${rw(`<button class="ghost" onclick="openTransportModal('${tr.id}')">✏️</button><button class="ghost" onclick="confirmBox('이 교통편을 삭제할까요?',()=>delTransport('${tr.id}'))">🗑️</button>`)}</div></div>
      <div class="route">${esc(a ? a.name : '?')} ${tr.depTime} → ${esc(b ? b.name : '?')} ${tr.arrTime}${over > 0 ? ` <span class="sub">(+${over}일)</span>` : ''}</div>
      <div class="sub">${shortDate(tr.depDate)} 출발 · 탑승 ${dur(toMin(tr.arrTime) + over * 1440 - toMin(tr.depTime))} · 출발 ${tr.bufDep}분 전 도착 / 내린 뒤 ${tr.bufArr}분 준비</div>
      <div>${d >= 0 ? `<button class="tag fixed" onclick="ui.tab='plan';selDay(${d})">🗓️ ${d + 1}일차 일정에 들어있음</button>` : `<span class="tag late">일정에 없음 (여행 날짜 밖이거나 빼둠)</span> ${rw(`<button class="small" onclick="reTransport('${tr.id}')">다시 넣기</button>`)}`}
        ${tr.seat ? `<span class="tag memo">💺 ${esc(tr.seat)}</span>` : ''}${tr.ref ? `<span class="tag memo">예약 ${esc(tr.ref)}</span>` : ''}${tr.memo ? `<span class="tag memo">${esc(tr.memo)}</span>` : ''}${vTag('t:' + tr.id)}</div>
    </div>`;
  });
  return h;
}
function openTransportModal(id, mode) {
  const isNew = !id; mode = mode || 'train';
  const tr = isNew ? {id:uid(), mode, name:'', from:'', to:'', depDate:dayIso(ui.day) || S.trip.startDate, depTime:'', arrDate:'', arrTime:'', bufDep:TRMODES[mode].dep, bufArr:TRMODES[mode].arr, ref:'', seat:'', memo:''} : T(id);
  ep.pick = {}; ep.results = {};
  const names = [...new Set(S.places.filter(isTransportPlace).map(p => p.name).concat(PRESETS.map(x => x[0])))];
  $('#modalBox').innerHTML = `<div class="h2">${isNew ? '교통편 추가' : '교통편 수정'}</div>
  <form id="trform" onsubmit="event.preventDefault();saveTransport('${tr.id}',${isNew})">
    <div class="grid2">
      <label class="f">종류<select name="mode" onchange="trModeChange(this.value)">${Object.entries(TRMODES).map(([k, v]) => `<option value="${k}" ${k === tr.mode ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}</select></label>
      <label class="f">이름 (편명·열차명)<input name="name" value="${esc(tr.name)}" placeholder="예: KE703, 노조미 21호"></label>
    </div>
    <datalist id="eplist">${names.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    ${epField('trform', 'from', '출발 (역·공항)', '예: 도쿄역, 하네다공항 (HND)', P(tr.from)?.name || '', 'eplist')}
    ${epField('trform', 'to', '도착 (역·공항)', '예: 교토역', P(tr.to)?.name || '', 'eplist')}
    <div class="sub" style="margin-top:4px">목록에 없으면 이름을 쓰고 🔍로 검색해서 고르세요.</div>
    <div class="grid2" style="margin-top:8px">
      <label class="f">출발 날짜<input name="depDate" type="date" value="${tr.depDate}" required onchange="if(!this.form.arrDate.value)this.form.arrDate.value=this.value"></label>
      <label class="f">출발 시각<input name="depTime" type="text" inputmode="numeric" class="tinput" placeholder="예: 930" autocomplete="off" maxlength="12" value="${tr.depTime}" required></label>
      <label class="f">도착 날짜<input name="arrDate" type="date" value="${tr.arrDate || tr.depDate}"></label>
      <label class="f">도착 시각<input name="arrTime" type="text" inputmode="numeric" class="tinput" placeholder="예: 930" autocomplete="off" maxlength="12" value="${tr.arrTime}" required></label>
      <label class="f">출발 몇 분 전까지 도착<input name="bufDep" type="number" min="0" step="5" value="${tr.bufDep}"></label>
      <label class="f">내린 뒤 준비 시간 (분)<input name="bufArr" type="number" min="0" step="5" value="${tr.bufArr}"></label>
      <label class="f">예약번호<input name="ref" value="${esc(tr.ref)}"></label>
      <label class="f">좌석<input name="seat" value="${esc(tr.seat)}" placeholder="예: 7호차 12A"></label>
    </div>
    <label class="f" style="margin-top:8px">메모<input name="memo" value="${esc(tr.memo)}"></label>
    <div class="sub" style="margin-top:6px">시각은 각 지역 현지 시각으로 넣으세요 (한국·일본은 시차 없음). 항공은 입국 심사·수하물 때문에 내린 뒤 준비 시간을 넉넉히.</div>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button type="button" onclick="closeModal()">취소</button><button class="primary">저장</button></div>
  </form>`;
  openModal();
}
function trModeChange(mode) { const f = $('#trform'); f.bufDep.value = TRMODES[mode].dep; f.bufArr.value = TRMODES[mode].arr; }
function saveTransport(id, isNew) {
  const f = $('#trform'), mode = f.mode.value, cat = TRMODES[mode].placeCat;
  const from = resolveEndpoint(f.from.value, ep.pick.from, cat), to = resolveEndpoint(f.to.value, ep.pick.to, cat);
  if (!from) { toast('출발 위치를 찾지 못했어요. 목록에서 고르거나 🔍로 검색해 주세요'); return; }
  if (!to) { toast('도착 위치를 찾지 못했어요. 목록에서 고르거나 🔍로 검색해 주세요'); return; }
  const tr = isNew ? {id} : T(id);
  Object.assign(tr, {mode, name:f.name.value.trim(), from, to, depDate:f.depDate.value, depTime:f.depTime.value,
    arrDate:f.arrDate.value || f.depDate.value, arrTime:f.arrTime.value, bufDep:+f.bufDep.value || 0, bufArr:+f.bufArr.value || 0,
    ref:f.ref.value.trim(), seat:f.seat.value.trim(), memo:f.memo.value.trim()});
  if (isNew) S.transports.push(tr);
  const d = placeTransport(tr);
  save(); closeModal();
  if (d >= 0) { ui.day = d; ui.fit = true; toast(`${d + 1}일차 일정에 넣었어요. 위치가 다르면 ▲▼로 옮기세요`); }
  else toast('저장했어요. 출발 날짜가 여행 기간 밖이라 일정에는 안 들어갔어요');
  render(true); ensureWalks();
}
function reTransport(id) { const d = placeTransport(T(id)); save(); if (d < 0) toast('출발 날짜가 여행 기간 밖이에요. 교통편 날짜나 여행 날짜를 확인하세요'); else toast(`${d + 1}일차에 넣었어요`); render(true); }
function delTransport(id) {
  S.transports = S.transports.filter(t => t.id !== id);
  S.days.forEach(d => d.stops = d.stops.filter(x => x !== 't:' + id));
  S.vouchers.forEach(v => { if (v.link === 't:' + id) v.link = ''; });
  save(); render(true);
}

/* ---------- 숙소 탭 (+ 짐 배송) ---------- */
function viewStay() {
  let h = RO ? '' : `<div class="card"><div class="h2">숙소</div>
    <div class="sub">숙박 날짜를 넣으면 매일 출발지(전날 묵은 곳)와 도착지(그날 묵을 곳)가 일정에 자동으로 들어가요.</div>
    <button class="primary" style="margin-top:10px" onclick="openStayModal()">🏨 숙소 추가</button></div>`;
  if (S.trip.startDate && S.days.length > 1) {
    h += `<div class="card"><div class="h2">밤별 숙소</div>`;
    for (let i = 0; i < S.days.length - 1; i++) {
      const s = stayFor(dayIso(i), 'night');
      h += `<div class="nightrow"><span>${i + 1}일차 ${dayDate(i)} 밤</span>${s ? `<b>🏨 ${esc(P(s.placeId)?.name)}</b>` : '<span class="tag late" style="margin:0">숙소 없음</span>'}</div>`;
    }
    h += '</div>';
  }
  const list = S.stays.slice().sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  list.forEach(s => {
    const p = P(s.placeId), nights = daysBetween(s.checkIn, s.checkOut);
    h += `<div class="card" style="border-left:4px solid ${CATS.hotel.color};border-radius:0 var(--r) var(--r) 0">
      <div class="row between"><b>🏨 ${esc(p ? p.name : '?')}</b>
        <div><button class="ghost" onclick="focusStay('${s.id}')" title="지도">🔍</button>${rw(`<button class="ghost" onclick="openStayModal('${s.id}')">✏️</button><button class="ghost" onclick="confirmBox('이 숙소를 삭제할까요?',()=>delStay('${s.id}'))">🗑️</button>`)}</div></div>
      <div class="route" style="font-size:14px">${shortDate(s.checkIn)} ${s.inTime || ''} 체크인 → ${shortDate(s.checkOut)} ${s.outTime || ''} 체크아웃 <span class="sub">${nights}박</span></div>
      <div>${p && p.rating ? stars(p) : ''}${s.ref ? `<span class="tag memo">예약 ${esc(s.ref)}</span>` : ''}${s.memo ? `<span class="tag memo">${esc(s.memo)}</span>` : ''}${vTag('p:' + s.placeId)}</div>
    </div>`;
  });
  if (!list.length) h += '<div class="empty">아직 숙소가 없어요</div>';
  h += `<div class="card"><div class="row between"><div class="h2" style="margin:0">🧳 짐 배송</div>${rw(`<button class="small primary" onclick="openLugModal()">+ 추가</button>`)}</div>
    <div class="sub" style="margin-top:6px">맡기는 날 일정에 "짐 맡기기" 시간이 들어가고, 받는 숙소에 도착 예정 시각이 표시돼요.</div>`;
  S.luggage.slice().sort((a, b) => (a.dropDate + a.dropTime).localeCompare(b.dropDate + b.dropTime)).forEach(l => {
    h += `<div style="padding:10px 0;border-top:1px solid var(--line);margin-top:10px">
      <div class="row between"><b>${esc(P(l.from)?.name || '?')} → ${esc(P(l.to)?.name || '?')}</b>
        <div>${rw(`<button class="ghost" onclick="openLugModal('${l.id}')">✏️</button><button class="ghost" onclick="confirmBox('이 짐 배송을 삭제할까요?',()=>delLug('${l.id}'))">🗑️</button>`)}</div></div>
      <div class="sub">맡기기 ${shortDate(l.dropDate)} ${l.dropTime ? l.dropTime + ' 마감' : ''} (${l.dropMin || 0}분) · 도착 예정 ${shortDate(l.arrDate)} ${l.arrTime || ''}</div>
      <div>${l.company ? `<span class="tag memo">${esc(l.company)}</span>` : ''}${l.ref ? `<span class="tag memo">예약 ${esc(l.ref)}</span>` : ''}${l.fee ? `<span class="tag memo">${money(l.fee, l.cur)}</span>` : ''}${l.memo ? `<span class="tag memo">${esc(l.memo)}</span>` : ''}${vTag('l:' + l.id)}</div></div>`;
  });
  if (!S.luggage.length) h += '<div class="sub" style="margin-top:8px">아직 없어요</div>';
  return h + '</div>';
}
function openStayModal(id) {
  const isNew = !id;
  const last = S.stays.slice().sort((a, b) => b.checkOut.localeCompare(a.checkOut))[0];
  const ci = last ? last.checkOut : (S.trip.startDate || '');
  const s = isNew ? {id:uid(), placeId:'', checkIn:ci, inTime:'15:00', checkOut:ci ? addDays(ci, 1) : '', outTime:'11:00', ref:'', memo:''} : S.stays.find(x => x.id === id);
  ep.pick = {}; ep.results = {};
  const names = [...new Set(S.places.filter(p => p.cat === 'hotel').map(p => p.name))];
  $('#modalBox').innerHTML = `<div class="h2">${isNew ? '숙소 추가' : '숙소 수정'}</div>
  <form id="stform" onsubmit="event.preventDefault();saveStay('${s.id}',${isNew})">
    <datalist id="htlist">${names.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    ${epField('stform', 'hotel', '숙소 이름', '이름을 쓰고 🔍로 위치를 찾으세요', P(s.placeId)?.name || '', 'htlist')}
    <div class="grid2" style="margin-top:8px">
      <label class="f">체크인 날짜<input name="checkIn" type="date" value="${s.checkIn}" required></label>
      <label class="f">체크인 시각<input name="inTime" type="text" inputmode="numeric" class="tinput" placeholder="예: 930" autocomplete="off" maxlength="12" value="${s.inTime}"></label>
      <label class="f">체크아웃 날짜<input name="checkOut" type="date" value="${s.checkOut}" required></label>
      <label class="f">체크아웃 시각<input name="outTime" type="text" inputmode="numeric" class="tinput" placeholder="예: 930" autocomplete="off" maxlength="12" value="${s.outTime}"></label>
      <label class="f">예약번호<input name="ref" value="${esc(s.ref)}"></label>
      <label class="f">메모<input name="memo" value="${esc(s.memo)}" placeholder="예: 조식 포함"></label>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button type="button" onclick="closeModal()">취소</button><button class="primary">저장</button></div>
  </form>`;
  openModal();
}
function saveStay(id, isNew) {
  const f = $('#stform');
  const pid = resolveEndpoint(f.hotel.value, ep.pick.hotel, 'hotel');
  if (!pid) { toast('숙소 위치를 찾지 못했어요. 이름을 쓰고 🔍로 검색해서 고르세요'); return; }
  if (P(pid).cat !== 'hotel') P(pid).cat = 'hotel';
  if (f.checkOut.value <= f.checkIn.value) { toast('체크아웃 날짜가 체크인 날짜보다 뒤여야 해요'); return; }
  const s = isNew ? {id} : S.stays.find(x => x.id === id);
  Object.assign(s, {placeId:pid, checkIn:f.checkIn.value, inTime:f.inTime.value, checkOut:f.checkOut.value, outTime:f.outTime.value, ref:f.ref.value.trim(), memo:f.memo.value.trim()});
  if (isNew) S.stays.push(s);
  const overlap = S.stays.find(x => x !== s && x.checkIn < s.checkOut && s.checkIn < x.checkOut);
  save(); closeModal(); render(true); ensureWalks();
  toast(overlap ? `저장했어요. ⚠️ ${P(overlap.placeId)?.name}와 숙박 날짜가 겹쳐요` : '저장했어요. 일정의 출발·도착지가 자동으로 바뀌었어요');
}
function delStay(id) { S.stays = S.stays.filter(x => x.id !== id); save(); render(true); }
function focusStay(id) { const s = S.stays.find(x => x.id === id); ui.tab = 'places'; render(); focusPlace(s.placeId); }

function openLugModal(id) {
  const isNew = !id;
  const l = isNew ? {id:uid(), from:'', dropDate:dayIso(ui.day) || S.trip.startDate, dropTime:'', dropMin:10, to:'', arrDate:dayIso(ui.day) || S.trip.startDate, arrTime:'', company:'', ref:'', fee:'', cur:'JPY', memo:''} : S.luggage.find(x => x.id === id);
  const opts = sel => `<option value="">선택…</option>` + ['hotel', 'air', 'station'].map(c => S.places.filter(p => p.cat === c).map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${CATS[p.cat].icon} ${esc(p.name)}</option>`).join('')).join('');
  const hasExp = S.money.items.some(x => x.lugId === l.id);
  $('#modalBox').innerHTML = `<div class="h2">${isNew ? '짐 배송 추가' : '짐 배송 수정'}</div>
  <form id="lgform" onsubmit="event.preventDefault();saveLug('${l.id}',${isNew})">
    <label class="f">맡기는 곳<select name="from" required>${opts(l.from)}</select></label>
    <div class="grid2" style="margin-top:8px">
      <label class="f">맡기는 날<input name="dropDate" type="date" value="${l.dropDate}" required></label>
      <label class="f">맡기기 마감 시각<input name="dropTime" type="text" inputmode="numeric" class="tinput" placeholder="예: 930" autocomplete="off" maxlength="12" value="${l.dropTime}"></label>
      <label class="f">맡기는 데 걸리는 시간 (분)<input name="dropMin" type="number" min="0" step="5" value="${l.dropMin}"></label>
      <span></span>
    </div>
    <label class="f" style="margin-top:8px">받는 곳<select name="to" required>${opts(l.to)}</select></label>
    <div class="grid2" style="margin-top:8px">
      <label class="f">도착 예정 날짜<input name="arrDate" type="date" value="${l.arrDate}" required></label>
      <label class="f">도착 예정 시각<input name="arrTime" type="text" inputmode="numeric" class="tinput" placeholder="예: 930" autocomplete="off" maxlength="12" value="${l.arrTime}"></label>
      <label class="f">업체<input name="company" value="${esc(l.company)}"></label>
      <label class="f">예약번호<input name="ref" value="${esc(l.ref)}"></label>
      <label class="f">요금<input name="fee" type="number" step="any" value="${l.fee}"></label>
      <label class="f">통화<select name="cur"><option value="JPY" ${l.cur === 'JPY' ? 'selected' : ''}>엔 (¥)</option><option value="KRW" ${l.cur === 'KRW' ? 'selected' : ''}>원 (₩)</option></select></label>
    </div>
    <label class="row" style="gap:6px;margin-top:8px"><input type="checkbox" name="toExp" ${isNew || hasExp ? 'checked' : ''}> 요금을 경비에 기록</label>
    <label class="f" style="margin-top:8px">메모<input name="memo" value="${esc(l.memo)}"></label>
    <div class="sub" style="margin-top:6px">맡기는 곳·받는 곳 목록에는 숙소·공항·역이 나와요. 숙소는 🏨 숙소에서 먼저 추가하세요.</div>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button type="button" onclick="closeModal()">취소</button><button class="primary">저장</button></div>
  </form>`;
  openModal();
}
function saveLug(id, isNew) {
  const f = $('#lgform');
  const l = isNew ? {id} : S.luggage.find(x => x.id === id);
  Object.assign(l, {from:f.from.value, dropDate:f.dropDate.value, dropTime:f.dropTime.value, dropMin:+f.dropMin.value || 0, to:f.to.value,
    arrDate:f.arrDate.value, arrTime:f.arrTime.value, company:f.company.value.trim(), ref:f.ref.value.trim(), fee:+f.fee.value || 0, cur:f.cur.value, memo:f.memo.value.trim()});
  if (isNew) S.luggage.push(l);
  const idx = S.money.items.findIndex(x => x.lugId === l.id);
  if (f.toExp.checked && l.fee) {
    const item = {id:idx >= 0 ? S.money.items[idx].id : uid(), day:dayIdxOf(l.dropDate), title:'짐 배송' + (l.company ? ' (' + l.company + ')' : ''), amount:l.fee, cur:l.cur,
      payer:idx >= 0 ? S.money.items[idx].payer : S.members[0], among:idx >= 0 ? S.money.items[idx].among : S.members.slice(), cat:'교통', lugId:l.id};
    if (idx >= 0) S.money.items[idx] = item; else S.money.items.push(item);
  } else if (idx >= 0) S.money.items.splice(idx, 1);
  save(); closeModal(); render(true); toast('저장했어요');
}
function delLug(id) {
  S.luggage = S.luggage.filter(x => x.id !== id);
  S.money.items = S.money.items.filter(x => x.lugId !== id);
  S.vouchers.forEach(v => { if (v.link === 'l:' + id) v.link = ''; });
  save(); render(true);
}

/* ---------- 바우처 탭 ---------- */
function linkOptions(sel) {
  const o = [`<option value="">연결 안 함</option>`];
  if (S.transports.length) o.push(`<optgroup label="교통편">${S.transports.map(t => `<option value="t:${t.id}" ${sel === 't:' + t.id ? 'selected' : ''}>${TRMODES[t.mode].icon} ${esc(t.name || TRMODES[t.mode].label)} (${shortDate(t.depDate)})</option>`).join('')}</optgroup>`);
  const hs = S.places.filter(p => p.cat === 'hotel');
  if (hs.length) o.push(`<optgroup label="숙소">${hs.map(p => `<option value="p:${p.id}" ${sel === 'p:' + p.id ? 'selected' : ''}>🏨 ${esc(p.name)}</option>`).join('')}</optgroup>`);
  if (S.luggage.length) o.push(`<optgroup label="짐 배송">${S.luggage.map(l => `<option value="l:${l.id}" ${sel === 'l:' + l.id ? 'selected' : ''}>🧳 ${esc(P(l.from)?.name || '?')} → ${esc(P(l.to)?.name || '?')}</option>`).join('')}</optgroup>`);
  const ps = S.places.filter(p => !isTransportPlace(p) && p.cat !== 'hotel');
  if (ps.length) o.push(`<optgroup label="장소">${ps.map(p => `<option value="p:${p.id}" ${sel === 'p:' + p.id ? 'selected' : ''}>${CATS[p.cat].icon} ${esc(p.name)}</option>`).join('')}</optgroup>`);
  return o.join('');
}
function linkLabel(link) {
  if (!link) return '';
  const k = link.slice(0, 1), id = link.slice(2);
  if (k === 't') { const t = T(id); return t ? TRMODES[t.mode].icon + ' ' + (t.name || TRMODES[t.mode].label) : ''; }
  if (k === 'l') { const l = S.luggage.find(x => x.id === id); return l ? '🧳 ' + (P(l.from)?.name || '?') + ' → ' + (P(l.to)?.name || '?') : ''; }
  const p = P(id); return p ? CATS[p.cat].icon + ' ' + p.name : '';
}
function fileThumb(f, onclick) {
  if ((f.type || '').startsWith('image/')) return `<img class="thumb" data-fid="${f.fid}" alt="${esc(f.name)}" onclick="${onclick}" style="visibility:hidden">`;
  const pdf = /pdf/.test(f.type || '') || /\.pdf$/i.test(f.name);
  return `<div class="filebox" onclick="${onclick}"><b>${pdf ? '📄' : '📎'}</b>${esc(f.name.length > 18 ? f.name.slice(0, 16) + '…' : f.name)}</div>`;
}
function viewVouch() {
  let h = `<div class="card"><div class="h2">바우처 올리기</div>
    <form onsubmit="event.preventDefault();addVoucher(this)">
      <label class="f">파일 (사진·PDF, 여러 개 가능)<input type="file" name="file" multiple accept="image/*,application/pdf"></label>
      <div class="grid2" style="margin-top:8px">
        <label class="f">제목<input name="title" placeholder="예: 스카이트리 전망대 티켓"></label>
        <label class="f">분류<select name="cat">${V_CATS.map(x => `<option>${x}</option>`).join('')}</select></label>
      </div>
      <label class="f" style="margin-top:8px">일정과 연결<select name="link">${linkOptions('')}</select></label>
      <label class="f" style="margin-top:8px">메모<input name="memo" placeholder="예: 입장 시 QR 제시"></label>
      <button class="primary" style="margin-top:10px">올리기</button>
    </form>
    <div class="sub" style="margin-top:8px">연결해 두면 일정 화면의 해당 칸에 🎟️ 버튼이 생겨요. 파일은 이 브라우저에만 저장돼요.</div></div>`;
  if (!S.vouchers.length) return h + '<div class="empty">아직 올린 바우처가 없어요</div>';
  V_CATS.forEach(cat => {
    const list = S.vouchers.filter(v => v.cat === cat); if (!list.length) return;
    h += `<div class="card"><div class="h2">${cat}</div>`;
    list.forEach(v => {
      h += `<div style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div class="row between"><b>${esc(v.title)}</b><div><button class="ghost" onclick="editVoucher('${v.id}')">✏️</button><button class="ghost" onclick="confirmBox('이 바우처를 삭제할까요?',()=>delVoucher('${v.id}'))">🗑️</button></div></div>
        <div class="sub">${v.link ? '🔗 ' + esc(linkLabel(v.link)) : '연결 없음'}${v.memo ? ' · ' + esc(v.memo) : ''}</div>
        <div class="thumbs">${v.files.map(f => fileThumb(f, `openVouchers('v:${v.id}')`)).join('') || '<span class="sub">파일 없음</span>'}</div></div>`;
    });
    h += '</div>';
  });
  return h;
}
async function addVoucher(f) {
  const files = [...f.file.files];
  if (!files.length) { toast('파일을 선택하세요'); return; }
  const v = {id:uid(), title:f.title.value.trim() || files[0].name.replace(/\.[^.]+$/, ''), cat:f.cat.value, link:f.link.value, memo:f.memo.value.trim(), files:[]};
  try {
    for (const file of files) { const fid = uid(); await DB.put(fid, file); v.files.push({fid, name:file.name, type:file.type, size:file.size}); }
  } catch (e) { toast('파일 저장에 실패했어요 (브라우저 저장공간 확인)'); return; }
  S.vouchers.push(v); save(); render(true); toast('바우처를 올렸어요');
}
function editVoucher(id) {
  const v = S.vouchers.find(x => x.id === id);
  $('#modalBox').innerHTML = `<div class="h2">바우처 수정</div>
  <form id="vform" onsubmit="event.preventDefault();saveVoucher('${id}')">
    <label class="f">제목<input name="title" value="${esc(v.title)}"></label>
    <label class="f" style="margin-top:8px">분류<select name="cat">${V_CATS.map(x => `<option ${x === v.cat ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="f" style="margin-top:8px">일정과 연결<select name="link">${linkOptions(v.link)}</select></label>
    <label class="f" style="margin-top:8px">메모<input name="memo" value="${esc(v.memo)}"></label>
    <label class="f" style="margin-top:8px">파일 더 추가<input type="file" name="file" multiple accept="image/*,application/pdf"></label>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button type="button" onclick="closeModal()">취소</button><button class="primary">저장</button></div>
  </form>`;
  openModal();
}
async function saveVoucher(id) {
  const v = S.vouchers.find(x => x.id === id), f = $('#vform');
  v.title = f.title.value.trim() || v.title; v.cat = f.cat.value; v.link = f.link.value; v.memo = f.memo.value.trim();
  try { for (const file of f.file.files) { const fid = uid(); await DB.put(fid, file); v.files.push({fid, name:file.name, type:file.type, size:file.size}); } }
  catch (e) { toast('파일 저장에 실패했어요'); }
  save(); closeModal(); render(true);
}
async function delVoucher(id) {
  const v = S.vouchers.find(x => x.id === id);
  for (const f of v.files) { try { await DB.del(f.fid); } catch (e) {} }
  S.vouchers = S.vouchers.filter(x => x.id !== id); save(); render(true);
}
function openVouchers(key) {
  const list = key.startsWith('v:') ? S.vouchers.filter(v => v.id === key.slice(2)) : vouchersFor(key);
  let h = '<div class="viewer">';
  list.forEach(v => {
    h += `<div class="h2">${esc(v.title)}</div>${v.memo ? `<div class="sub">${esc(v.memo)}</div>` : ''}`;
    v.files.forEach(f => {
      if ((f.type || '').startsWith('image/')) h += `<img data-fid="${f.fid}" alt="${esc(f.name)}" style="visibility:hidden">`;
      else h += `<div class="filebox" style="width:100%;height:auto;flex-direction:row;gap:8px;margin-top:8px;padding:12px"><b>📄</b>${esc(f.name)}</div>`;
      h += `<div class="row" style="margin:6px 0 12px"><a class="gm" data-fid="${f.fid}" target="_blank" rel="noopener">새 탭에서 크게 보기 ↗</a><a class="gm" data-fid="${f.fid}" download="${esc(f.name)}">저장</a></div>`;
    });
  });
  h += '</div><div class="row" style="justify-content:flex-end"><button onclick="closeModal()">닫기</button></div>';
  $('#modalBox').innerHTML = h; openModal(); hydrate($('#modalBox'));
}

/* ---------- 경비 탭 ---------- */
function viewMoney() {
  const m = S.money, c = moneyCalc(), rate = +m.rate || 0;
  const pct = m.budget ? Math.min(100, c.total / m.budget * 100) : 0;
  let h = `<div class="card"><div class="grid2">
      <label class="f">환율 (1엔 = ?원)<input type="number" step="0.01" value="${m.rate}" ${RO ? 'disabled' : ''} onchange="S.money.rate=+this.value;save();render(true)"></label>
      <label class="f">총 예산 (원)<input type="number" value="${m.budget}" ${RO ? 'disabled' : ''} onchange="S.money.budget=+this.value;save();render(true)"></label></div>
    <div class="summary" style="margin-top:10px">
      <div><span class="sub">총 지출</span><b>${won(c.total)}</b><span class="sub">${rate ? yen(c.total / rate) : ''}</span></div>
      <div><span class="sub">남은 예산</span><b style="color:${m.budget - c.total < 0 ? 'var(--warn)' : 'inherit'}">${won(m.budget - c.total)}</b></div></div>
    <div class="bar"><i class="${c.total > m.budget ? 'over' : ''}" style="width:${pct}%"></i></div>
    <div class="sub" style="margin-top:8px">${Object.entries(c.byCat).map(([k, v]) => `${k} ${won(v)}`).join(' · ') || '지출 없음'}</div>
  </div>`;
  if (!RO) h += `<div class="card"><div class="h2">지출 추가</div>
    <form onsubmit="event.preventDefault();addExpense(this)">
      <div class="grid2">
        <label class="f">항목<input name="title" required placeholder="예: 라멘"></label>
        <label class="f">날짜<select name="day"><option value="-1">여행 전</option>${S.days.map((d, i) => `<option value="${i}" ${i === ui.day ? 'selected' : ''}>${i + 1}일차 ${dayDate(i)}</option>`).join('')}</select></label>
        <label class="f">금액<input name="amount" type="number" step="any" required></label>
        <label class="f">통화<select name="cur"><option value="JPY">엔 (¥)</option><option value="KRW">원 (₩)</option></select></label>
        <label class="f">결제한 사람<select name="payer">${S.members.map(x => `<option>${esc(x)}</option>`).join('')}</select></label>
        <label class="f">분류<select name="cat">${EXP_CATS.map(x => `<option>${x}</option>`).join('')}</select></label>
      </div>
      <div class="sub" style="margin:8px 0 4px">나눠 낼 사람</div>
      <div class="row">${S.members.map(x => `<label class="row" style="gap:4px"><input type="checkbox" name="among" value="${esc(x)}" checked>${esc(x)}</label>`).join('')}</div>
      <button class="primary" style="margin-top:10px">추가</button>
    </form></div>`;
  if (S.members.length > 1) {
    h += `<div class="card"><div class="h2">정산</div>
      ${c.transfers.length ? c.transfers.map(([a, b, v]) => `<div class="row between" style="padding:4px 0"><span><b>${esc(a)}</b> → <b>${esc(b)}</b></span><span>${won(v)} <span class="sub">${rate ? '(' + yen(v / rate) + ')' : ''}</span></span></div>`).join('') : '<div class="sub">정산할 금액이 없어요</div>'}
      <div class="sub" style="margin-top:6px">${Object.entries(c.bal).map(([k, v]) => `${esc(k)} ${v >= 0 ? '+' : ''}${won(v)}`).join(' · ')}</div></div>`;
  }
  h += `<div class="card"><div class="h2">지출 내역</div>`;
  if (!m.items.length) h += '<div class="sub">아직 없어요</div>';
  else {
    h += `<table><tr><th>항목</th><th>결제</th><th class="num">금액</th><th></th></tr>`;
    m.items.slice().sort((a, b) => a.day - b.day).forEach(it => {
      h += `<tr><td>${esc(it.title)}${it.lugId ? ' <span class="sub">🧳</span>' : ''}<div class="sub">${it.day < 0 ? '여행 전' : (it.day + 1) + '일차'} · ${it.cat}</div></td>
        <td>${esc(it.payer)}<div class="sub">${it.among.map(esc).join(', ')}</div></td>
        <td class="num">${money(it.amount, it.cur)}${it.cur === 'JPY' ? `<div class="sub">${won(c.krw(it))}</div>` : ''}</td>
        <td>${rw(`<button class="ghost" onclick="delExpense('${it.id}')">✕</button>`)}</td></tr>`;
    });
    h += '</table>';
  }
  return h + '</div>';
}

/* ---------- 준비물 탭 ---------- */
function viewCheck() {
  const L = S.checklist, done = L.filter(x => x.done).length;
  const cats = [...new Set(L.map(x => x.cat))];
  let h = `<div class="card"><div class="row between"><div class="h2" style="margin:0">준비물</div><span class="sub">${done} / ${L.length}</span></div>
    <div class="bar"><i style="width:${L.length ? done / L.length * 100 : 0}%;background:var(--ok)"></i></div>
    ${rw(`<form class="row" style="margin-top:10px" onsubmit="event.preventDefault();addCheck(this)">
      <input name="text" placeholder="추가할 준비물" style="flex:1" required>
      <input name="cat" list="chkcats" placeholder="분류" style="width:90px" value="${esc(cats[0] || '기타')}">
      <datalist id="chkcats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <button class="primary">추가</button></form>`)}</div>`;
  cats.forEach(cat => {
    h += `<div class="card"><div class="h2">${esc(cat)}</div>`;
    L.filter(x => x.cat === cat).forEach(x => {
      h += `<div class="chk ${x.done ? 'done' : ''}"><input type="checkbox" ${x.done ? 'checked' : ''} ${RO ? 'disabled' : ''} onchange="toggleCheck('${x.id}')"><span>${esc(x.text)}</span>${rw(`<button class="ghost" onclick="delCheck('${x.id}')">✕</button>`)}</div>`;
    });
    h += '</div>';
  });
  return h;
}

/* ---------- 설정 탭 ---------- */
function viewSettings() {
  const end = tripEnd(S);
  return `<div class="card"><div class="h2">여행 정보</div>
    <label class="f">여행 이름<input value="${esc(S.trip.name)}" onchange="S.trip.name=this.value;save();render(true)"></label>
    <div class="grid2" style="margin-top:8px">
      <label class="f">출발일<input type="date" value="${S.trip.startDate}" onchange="setTripDates(this.value,null)"></label>
      <label class="f">돌아오는 날<input type="date" value="${end}" onchange="setTripDates(null,this.value)"></label>
    </div>
    <label class="f" style="margin-top:8px">동행자 (쉼표로 구분)<input value="${esc(S.members.join(', '))}" onchange="S.members=this.value.split(',').map(s=>s.trim()).filter(Boolean);if(!S.members.length)S.members=['나'];save();render(true)"></label>
    <div class="row" style="margin-top:10px"><button onclick="openTripEdit('${S.id}')">🖼️ 대표 사진 바꾸기</button>
      <button onclick="shareTrip('${S.id}')">🔗 ${S.share ? '공유 링크 보기' : '공유 링크 만들기'}</button></div>
  </div>
  ${settingsKeyCard()}
  <div class="card"><div class="h2">이 여행 데이터</div>
    <div class="sub" style="margin-bottom:8px">데이터는 이 브라우저에만 저장돼요. 다른 기기로 옮길 땐 내보내기한 파일을 그 기기의 여행 목록에서 불러오세요 (바우처 파일도 같이 들어가요).</div>
    <div class="row">
      <button onclick="exportTrip('${S.id}')">⬇️ 내보내기 (.json)</button>
      <button class="danger" onclick="confirmBox('이 여행을 삭제할까요? 되돌릴 수 없어요.',()=>deleteTrip('${S.id}',true))">🗑️ 여행 삭제</button>
    </div></div>
  <div class="sub" style="padding:4px">${MapX.kind === 'google' ? '지도·장소 정보 © Google' : '지도 © OpenFreeMap, OpenMapTiles, OpenStreetMap contributors, Esri · 검색 Photon(komoot)'} · 도보 경로 OSRM</div>`;
}
function setTripDates(start, end) {
  if (start !== null) { S.trip.startDate = start; }
  if (end !== null && S.trip.startDate) { const n = daysBetween(S.trip.startDate, end) + 1; if (n < 1) { toast('돌아오는 날이 출발일보다 빠를 수 없어요'); render(true); return; } S.trip.days = Math.min(30, n); }
  syncDays(); save(); render(true);
}

/* ---------- 동작 ---------- */
function selDay(i) { ui.day = i; ui.fit = true; render(); ensureWalks(); }
function addToDay(pid, d) {
  const cur = dayOf(pid); if (cur >= 0) S.days[cur].stops = S.days[cur].stops.filter(x => x !== pid);
  const day = S.days[d];
  const lastIsTr = day.stops.length && day.stops[day.stops.length - 1].startsWith('t:') && !endOf(d);
  if (lastIsTr) day.stops.splice(day.stops.length - 1, 0, pid); else day.stops.push(pid);
  save(); ui.day = d; MapX.closePopup();
  toast(`${P(pid).name} → ${d + 1}일차에 추가했어요`); render(true); ensureWalks();
}
function moveStop(i, dir) {
  const s = S.days[ui.day].stops, j = i + dir; if (j < 0 || j >= s.length) return;
  [s[i], s[j]] = [s[j], s[i]]; save(); render(true); ensureWalks();
}
function removeStop(i) { S.days[ui.day].stops.splice(i, 1); save(); render(true); ensureWalks(); }
function focusPlace(id) { const p = P(id); if (p) MapX.view(p.lat, p.lng, 16); if (innerWidth <= 820) window.scrollTo(0, 0); }
function setAddMode(on) { ui.addMode = on; $('#btnAddMode').classList.toggle('on', on); $('#addhint').style.display = on ? 'block' : 'none'; }
function optimizeDay(i) {
  const day = S.days[i];
  const best = bestOrder(day);
  if (!best) { toast('순서를 바꿀 장소가 2개 이상 있어야 해요'); return; }
  const before = computeDay(day);
  const changed = best.join() !== day.stops.join();
  day.stops = best; save();
  const after = computeDay(day);
  const saved = Math.round(before.end - after.end), lessMove = Math.round(before.travel - after.travel);
  let msg = !changed ? '지금 순서가 이미 가장 좋아요'
    : saved > 0 ? `순서를 바꿔서 일정이 ${dur(saved)} 일찍 끝나요`
    : before.late > after.late ? '지각을 줄이는 순서로 바꿨어요'
    : `끝나는 시각은 같지만 이동이 ${dur(Math.max(lessMove, 1))} 줄어드는 순서로 바꿨어요`;
  if (after.late) msg += ` · 정해진 시간에 ${dur(after.late)} 늦는 건 피할 수 없어요`;
  toast(msg); ui.fit = true; render(true); ensureWalks();
}
function addExpense(f) {
  const among = [...f.querySelectorAll('[name=among]:checked')].map(x => x.value);
  S.money.items.push({id:uid(), day:+f.day.value, title:f.title.value.trim(), amount:+f.amount.value, cur:f.cur.value, payer:f.payer.value, among:among.length ? among : [f.payer.value], cat:f.cat.value});
  save(); render(true); toast('지출을 추가했어요');
}
function delExpense(id) { S.money.items = S.money.items.filter(x => x.id !== id); save(); render(true); }
function addCheck(f) { S.checklist.push({id:uid(), cat:f.cat.value.trim() || '기타', text:f.text.value.trim(), done:false}); save(); render(true); }
function toggleCheck(id) { const x = S.checklist.find(c => c.id === id); x.done = !x.done; save(); render(true); }
function delCheck(id) { S.checklist = S.checklist.filter(c => c.id !== id); save(); render(true); }
