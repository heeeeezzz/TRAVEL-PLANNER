/* =========================================================
   core.js — 상수, 유틸, 저장소, 일정 계산 (화면과 무관한 로직)
   ========================================================= */

const VER = 5;
const CATS = {
  sight:  {label:'관광', color:'#2563eb', icon:'🏯'},
  food:   {label:'맛집', color:'#ea580c', icon:'🍜'},
  shop:   {label:'쇼핑', color:'#9333ea', icon:'🛍️'},
  hotel:  {label:'숙소', color:'#059669', icon:'🏨'},
  station:{label:'역',   color:'#475569', icon:'🚉'},
  air:    {label:'공항', color:'#0f766e', icon:'✈️'},
  etc:    {label:'기타', color:'#64748b', icon:'📍'}
};
const TRMODES = {
  air:  {label:'항공',     icon:'✈️', dep:120, arr:90, color:'#0f766e', placeCat:'air'},
  train:{label:'기차',     icon:'🚄', dep:15,  arr:5,  color:'#7c3aed', placeCat:'station'},
  bus:  {label:'고속버스', icon:'🚌', dep:15,  arr:5,  color:'#a16207', placeCat:'station'},
  ferry:{label:'페리',     icon:'⛴️', dep:30,  arr:10, color:'#0369a1', placeCat:'station'}
};
// 자주 쓰는 공항·역 (좌표는 대략값)
const PRESETS = [
  ['인천국제공항 (ICN)','air',37.4602,126.4407], ['김포국제공항 (GMP)','air',37.5583,126.7906],
  ['김해국제공항 (PUS)','air',35.1795,128.9382], ['제주국제공항 (CJU)','air',33.5113,126.4930],
  ['나리타공항 (NRT)','air',35.7720,140.3929], ['하네다공항 (HND)','air',35.5494,139.7798],
  ['간사이공항 (KIX)','air',34.4320,135.2304], ['이타미공항 (ITM)','air',34.7855,135.4382],
  ['주부 센트레아 (NGO)','air',34.8584,136.8054], ['후쿠오카공항 (FUK)','air',33.5859,130.4510],
  ['신치토세공항 (CTS)','air',42.7752,141.6923], ['나하공항 (OKA)','air',26.1958,127.6459],
  ['도쿄역','station',35.6812,139.7671], ['시나가와역','station',35.6285,139.7388],
  ['신요코하마역','station',35.5079,139.6176], ['나고야역','station',35.1709,136.8815],
  ['교토역','station',34.9858,135.7588], ['신오사카역','station',34.7334,135.5002],
  ['오사카역 (우메다)','station',34.7025,135.4959], ['산노미야역 (고베)','station',34.6946,135.1955],
  ['히로시마역','station',34.3976,132.4754], ['하카타역','station',33.5897,130.4207],
  ['삿포로역','station',43.0687,141.3508], ['가나자와역','station',36.5781,136.6476]
];
const EXP_CATS = ['교통','식비','숙박','입장권','쇼핑','기타'];
const V_CATS = ['항공','기차·교통','숙소','입장권','짐 배송','기타'];
const WEEK = ['일','월','화','수','목','금','토'];

/* ---------- 유틸 ---------- */
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toMin = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmt = m => { if (m == null) return '-'; m = Math.round(m); const d = Math.floor(m / 1440); const r = ((m % 1440) + 1440) % 1440;
  return (d > 0 ? '+' + d + '일 ' : d < 0 ? '전날 ' : '') + String(Math.floor(r / 60)).padStart(2, '0') + ':' + String(r % 60).padStart(2, '0'); };
const hhmm = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const dur = m => { m = Math.round(m); if (m < 60) return m + '분'; const h = Math.floor(m / 60), r = m % 60; return h + '시간' + (r ? ' ' + r + '분' : ''); };
const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
const yen = n => '¥' + Math.round(n).toLocaleString('ja-JP');
const money = (n, cur) => cur === 'JPY' ? yen(n) : won(n);
const daysBetween = (a, b) => (a && b) ? Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000) : 0;
function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoOf(d); }
const todayIso = () => isoOf(new Date());
function shortDate(iso) { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); return (d.getMonth() + 1) + '/' + d.getDate() + '(' + WEEK[d.getDay()] + ')'; }
function hav(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/* 시간 입력: "930" "1430" "9" "14:30" "9시 30분" "오후 3시" → "HH:MM" / 빈칸 → "" / 잘못된 값 → null */
function parseTime(s) {
  s = String(s ?? '').trim(); if (!s) return '';
  let pm = /오후|pm/i.test(s), am = /오전|am/i.test(s), h, m = 0, x;
  s = s.replace(/오전|오후|am|pm/ig, '').trim();
  if ((x = s.match(/^(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분?)?$/))) { h = +x[1]; m = +(x[2] || 0); }
  else if ((x = s.match(/^(\d{1,2})\s*[:.;\s]\s*(\d{1,2})$/))) { h = +x[1]; m = +x[2]; }
  else if (/^\d{1,4}$/.test(s)) {
    if (s.length <= 2) h = +s;
    else if (s.length === 3) { h = +s[0]; m = +s.slice(1); }
    else { h = +s.slice(0, 2); m = +s.slice(2); }
  } else return null;
  if (pm && h < 12) h += 12; if (am && h === 12) h = 0;
  if (h > 23 || m > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
// 시간 칸(.tinput)은 값이 바뀌거나 저장하기 전에 자동으로 정리
if (typeof document !== 'undefined') {
  const fix = el => {
    const v = parseTime(el.value);
    if (v === null) { el.classList.add('bad'); return false; }
    el.classList.remove('bad'); el.value = v; return true;
  };
  document.addEventListener('change', e => {
    if (e.target.classList && e.target.classList.contains('tinput') && !fix(e.target)) {
      e.stopImmediatePropagation(); toast('시간을 다시 확인해 주세요 (예: 930, 14:30)');
    }
  }, true);
  document.addEventListener('submit', e => {
    const bad = [...e.target.querySelectorAll('.tinput')].filter(el => !fix(el));
    if (bad.length) { e.preventDefault(); e.stopImmediatePropagation(); bad[0].focus(); toast('시간을 다시 확인해 주세요 (예: 930, 14:30)'); }
  }, true);
  document.addEventListener('input', e => { if (e.target.classList && e.target.classList.contains('tinput')) e.target.classList.remove('bad'); }, true);
}

function toast(msg) { const t = typeof document !== 'undefined' && $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3000); }

/* 추정식 (조정 가능)
   도보: 직선거리 × 1.3(우회계수) ÷ 4.5km/h
   대중교통: 역까지 도보·대기·환승 15분 + 직선거리 × 1.3 ÷ 30km/h  */
const estWalk = km => Math.max(1, Math.round(km * 1.3 / 4.5 * 60));
const estTransit = km => Math.round(15 + km * 1.3 / 30 * 60);
const AUTO_WALK_KM = 1.0;

/* ---------- 브라우저 저장소 ---------- */
const LS = {
  get(k) { try { const t = localStorage.getItem(k); return t ? JSON.parse(t) : null; } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
// 파일(바우처·대표 사진)은 IndexedDB
const DB = {
  db:null,
  open() { return new Promise((res, rej) => {
    if (this.db) return res(this.db);
    const r = indexedDB.open('travelPlannerFiles', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => { this.db = r.result; res(this.db); };
    r.onerror = () => rej(r.error);
  }); },
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => {
    const t = db.transaction('files', mode), st = t.objectStore('files'); const q = fn(st);
    t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
  }); },
  put(k, v) { return this.tx('readwrite', st => st.put(v, k)); },
  get(k) { return this.tx('readonly', st => st.get(k)); },
  del(k) { return this.tx('readwrite', st => st.delete(k)); }
};
const urlCache = {};
async function fileUrl(fid) {
  if (!fid) return null;
  if (urlCache[fid]) return urlCache[fid];
  try { const b = await DB.get(fid); if (!b) return null; return urlCache[fid] = URL.createObjectURL(b); } catch (e) { return null; }
}
function hydrate(root = document) {
  root.querySelectorAll('[data-fid]').forEach(async el => {
    const u = await fileUrl(el.dataset.fid); if (!u) return;
    if (el.tagName === 'IMG') { el.src = u; el.style.visibility = 'visible'; } else if (el.tagName === 'A') el.href = u; else el.style.backgroundImage = `url("${u}")`;
  });
}
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
function dataURLtoBlob(u) {
  const [h, b64] = u.split(','); const mime = (h.match(/:(.*?);/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], {type:mime});
}

/* ---------- 전역 설정 (모든 여행 공통) ---------- */
let G = Object.assign({apiKey:'', mapLang:'ko', mapStyle:'ofm'}, LS.get('tp.settings') || {});
function saveSettings() { LS.set('tp.settings', G); }

/* ---------- 여행 목록 ---------- */
function tripIds() { return LS.get('tp.index') || []; }
function setTripIds(ids) { LS.set('tp.index', ids); }
function loadTrip(id) { return migrate(LS.get('tp.trip.' + id)); }
function storeTrip(t) { t.updated = Date.now(); return LS.set('tp.trip.' + t.id, t); }
function allTrips() { return tripIds().map(loadTrip).filter(Boolean); }

/* ---------- 여행 데이터 ---------- */
const newPlace = (id, name, cat, lat, lng, stay = 0, extra = {}) => ({id, name, cat, lat, lng, stay, fixed:'', ticket:false, open:'', close:'', memo:'', ...extra});
function defaultChecklist() {
  const L = {'서류':['여권 (유효기간 6개월 이상)', '항공권 e-티켓', '숙소 예약 확인서', 'Visit Japan Web 등록', '여행자 보험'],
    '돈':['엔화 현금', '해외결제 카드', '교통카드 (Suica/PASMO 앱 등)'],
    '전자기기':['휴대폰 충전기', '보조배터리 (기내 반입)', 'eSIM / 포켓와이파이', '멀티어댑터 (일본은 110V, 11자형)'],
    '생활':['상비약', '세면도구', '편한 신발', '우산', '에코백']};
  const out = [];
  for (const [cat, arr] of Object.entries(L)) arr.forEach(text => out.push({id:uid(), cat, text, done:false}));
  return out;
}
function blankTrip({name = '새 여행', startDate = '', days = 3, members = ['나'], checklist = null} = {}) {
  return {ver:VER, id:uid(), created:Date.now(), coverFid:'', color:pickColor(),
    trip:{name, startDate, days}, members, places:[], transports:[], stays:[], luggage:[],
    days:[], legs:{}, vouchers:[], money:{rate:9.3, budget:1000000, items:[]}, checklist:checklist || defaultChecklist()};
}
const COVER_COLORS = ['#9FE1CB', '#F5C4B3', '#CECBF6', '#B5D4F4', '#FAC775', '#F4C0D1', '#C0DD97'];
function pickColor() { return COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)]; }

function sampleTrip() {
  const P = newPlace;
  const t = blankTrip({name:'도쿄·교토 여행 (샘플)', startDate:'2026-12-10', days:3, members:['나', '친구']});
  t.sample = true; t.color = '#9FE1CB';
  t.places = [
    P('h1', '신주쿠 호텔', 'hotel', 35.6938, 139.7034),
    P('p2', '센소지', 'sight', 35.7148, 139.7967, 75, {open:'06:00', close:'17:00'}),
    P('p1', '우에노 공원', 'sight', 35.7156, 139.7745, 60),
    P('p3', '도쿄 스카이트리', 'sight', 35.7101, 139.8107, 90, {fixed:'15:30', ticket:true, memo:'전망대 티켓 구매함'}),
    P('p4', '아키하바라', 'shop', 35.6984, 139.7731, 90),
    P('p5', '츠키지 장외시장', 'food', 35.6655, 139.7707, 60, {open:'07:00', close:'14:00'}),
    P('p6', '메이지 신궁', 'sight', 35.6764, 139.6993, 60),
    P('p7', '시부야 스카이', 'sight', 35.6585, 139.7023, 90, {memo:'다음에 갈 곳 (보관함 예시)'}),
    P('k0', '교토 호텔', 'hotel', 34.9875, 135.7570),
    P('k1', '기요미즈데라', 'sight', 34.9949, 135.7850, 90, {close:'18:00'}),
    P('k2', '기온 거리', 'sight', 35.0037, 135.7752, 60),
    P('k3', '후시미 이나리 신사', 'sight', 34.9671, 135.7727, 90),
    P('k4', '아라시야마', 'sight', 35.0094, 135.6668, 120),
    P('a0', '인천국제공항 (ICN)', 'air', 37.4602, 126.4407),
    P('a1', '하네다공항 (HND)', 'air', 35.5494, 139.7798),
    P('a2', '간사이공항 (KIX)', 'air', 34.4320, 135.2304),
    P('s1', '도쿄역', 'station', 35.6812, 139.7671),
    P('s2', '교토역', 'station', 34.9858, 135.7588)
  ];
  t.transports = [
    {id:'t1', mode:'air', name:'가는 편 (샘플)', from:'a0', to:'a1', depDate:'2026-12-10', depTime:'07:30', arrDate:'2026-12-10', arrTime:'09:50', bufDep:120, bufArr:90, ref:'', seat:'', memo:''},
    {id:'t2', mode:'train', name:'신칸센 노조미 (샘플)', from:'s1', to:'s2', depDate:'2026-12-11', depTime:'13:00', arrDate:'2026-12-11', arrTime:'15:15', bufDep:15, bufArr:5, ref:'', seat:'7호차 12A', memo:''},
    {id:'t3', mode:'air', name:'오는 편 (샘플)', from:'a2', to:'a0', depDate:'2026-12-12', depTime:'19:30', arrDate:'2026-12-12', arrTime:'21:20', bufDep:120, bufArr:0, ref:'', seat:'', memo:''}
  ];
  t.stays = [
    {id:'st1', placeId:'h1', checkIn:'2026-12-10', inTime:'15:00', checkOut:'2026-12-11', outTime:'11:00', ref:'', memo:''},
    {id:'st2', placeId:'k0', checkIn:'2026-12-11', inTime:'15:00', checkOut:'2026-12-12', outTime:'10:00', ref:'', memo:''}
  ];
  t.luggage = [{id:'lg1', from:'h1', dropDate:'2026-12-11', dropTime:'10:00', dropMin:10, to:'k0', arrDate:'2026-12-11', arrTime:'18:00', company:'짐 배송 (샘플)', ref:'', fee:2500, cur:'JPY', memo:'프런트에 맡기기'}];
  t.days = [
    {start:'09:00', startSel:'auto', endSel:'auto', stops:['t:t1', 'p2', 'p1', 'p3', 'p4']},
    {start:'08:30', startSel:'auto', endSel:'auto', stops:['p5', 'p6', 't:t2', 'k1', 'k2']},
    {start:'09:00', startSel:'auto', endSel:'auto', stops:['k3', 'k4', 't:t3']}
  ];
  t.legs = {'k4>a2': {mode:'transit', transitMin:110}};
  t.money = {rate:9.3, budget:1500000, items:[
    {id:uid(), day:-1, title:'항공권', amount:420000, cur:'KRW', payer:'나', among:['나', '친구'], cat:'교통'},
    {id:uid(), day:0, title:'스카이트리 전망대', amount:6600, cur:'JPY', payer:'친구', among:['나', '친구'], cat:'입장권'},
    {id:uid(), day:1, title:'짐 배송 (샘플)', amount:2500, cur:'JPY', payer:'나', among:['나', '친구'], cat:'교통', lugId:'lg1'}
  ]};
  return t;
}
function migrate(s) {
  if (!s) return null;
  s.id = s.id || uid(); s.color = s.color || pickColor(); s.coverFid = s.coverFid || '';
  s.transports = s.transports || []; s.vouchers = s.vouchers || []; s.legs = s.legs || {};
  s.stays = s.stays || []; s.luggage = s.luggage || []; s.days = s.days || []; s.places = s.places || [];
  s.money = s.money || {rate:9.3, budget:1000000, items:[]}; s.checklist = s.checklist || defaultChecklist();
  s.members = s.members && s.members.length ? s.members : ['나'];
  s.days.forEach(d => {
    if (d.startSel === undefined) { d.startSel = d.startPlace || 'auto'; d.endSel = d.endPlace || 'auto'; delete d.startPlace; delete d.endPlace; }
  });
  delete s.mapStyle; delete s.mapLang;
  s.ver = VER; return s;
}

/* ---------- 현재 열려 있는 여행 ---------- */
let S = null;
function save() { if (S) { storeTrip(S); if (typeof Sync !== 'undefined') Sync.schedule(); } }
const P = id => S.places.find(p => p.id === id);
const T = id => S.transports.find(t => t.id === id);
function syncDays() {
  while (S.days.length < S.trip.days) S.days.push({start:'09:00', startSel:'auto', endSel:'auto', stops:[]});
  if (S.days.length > S.trip.days) S.days.length = S.trip.days;
}
function dayIso(i) { if (!S.trip.startDate || i < 0) return ''; return addDays(S.trip.startDate, i); }
const dayDate = i => shortDate(dayIso(i));
const dayIdxOf = iso => S.days.findIndex((d, k) => dayIso(k) === iso);
function dayOf(key) { return S.days.findIndex(d => d.stops.includes(key)); }
const isTransportPlace = p => p.cat === 'air' || p.cat === 'station';
function tripEnd(t) { return t.trip.startDate ? addDays(t.trip.startDate, t.trip.days - 1) : ''; }

/* ---------- 영업시간 (구글 정보 → 그날 요일 기준) ---------- */
function hoursFor(p, iso) {
  if (p.open || p.close) return {open:toMin(p.open), close:toMin(p.close), manual:true};
  if (!p.hours || !p.hours.length || !iso) return {};
  const wd = new Date(iso + 'T00:00:00').getDay();
  const ps = p.hours.filter(x => x.o && x.o.d === wd);
  if (!ps.length) return {closed:true};
  let open = Infinity, close = -Infinity;
  ps.forEach(x => {
    const o = x.o.h * 60 + x.o.m; open = Math.min(open, o);
    if (!x.c) { close = Math.max(close, 1440 * 2); return; }   // 24시간
    let c = x.c.h * 60 + x.c.m; if (x.c.d !== wd || c <= o) c += 1440; close = Math.max(close, c);
  });
  return {open, close};
}

/* ---------- 숙소 → 매일 출발·도착 ---------- */
function stayFor(iso, kind) {   // 'night': 그날 밤 묵는 곳 / 'prev': 전날 밤 묵은 곳
  if (!iso) return null;
  return S.stays.find(s => kind === 'night' ? (s.checkIn <= iso && iso < s.checkOut) : (s.checkIn < iso && iso <= s.checkOut)) || null;
}
function startOf(i) { const d = S.days[i]; if (d.startSel !== 'auto') return d.startSel || ''; const s = stayFor(dayIso(i), 'prev'); return s ? s.placeId : ''; }
function endOf(i) { const d = S.days[i]; if (d.endSel !== 'auto') return d.endSel || ''; const s = stayFor(dayIso(i), 'night'); return s ? s.placeId : ''; }

/* ---------- 이동 구간 ---------- */
function legInfo(a, b) {
  const pa = P(a), pb = P(b);
  const key = a + '>' + b, rkey = b + '>' + a;
  const leg = S.legs[key] || {}, rev = S.legs[rkey] || {};
  const km = hav(pa, pb);
  const mode = leg.mode || (km < AUTO_WALK_KM ? 'walk' : 'transit');
  const walkMin = leg.walkMin ?? rev.walkMin;
  const walkKm = leg.walkKm ?? rev.walkKm;
  const r = {key, a, b, km, mode,
    walkMin: walkMin ?? estWalk(km), walkReal: walkMin != null, walkKm: walkKm ?? km * 1.3,
    transitMin: leg.transitMin ?? estTransit(km), transitReal: leg.transitMin != null};
  r.min = mode === 'walk' ? r.walkMin : r.transitMin;
  return r;
}
function setLeg(key, patch) { S.legs[key] = Object.assign(S.legs[key] || {}, patch); save(); }

/* ---------- 일정 계산 ----------
   day.stops 항목: 장소 id 또는 't:교통편id'
   교통편: 출발 bufDep분 전까지 출발지 도착 → 도착 시각 + bufArr분부터 도착지에서 이어짐
   짐 배송: 맡기는 곳에서 dropMin분 소요(마감 확인), 받는 곳 도착 시 도착 예정 안내
   숙소: 체크인 전 도착 / 체크아웃 후 출발 안내 */
function trTimes(tr, iso) {
  return {dep: toMin(tr.depTime) + 1440 * daysBetween(iso, tr.depDate),
          arr: toMin(tr.arrTime) + 1440 * daysBetween(iso, tr.arrDate || tr.depDate)};
}
function computeDay(day, stops = day.stops) {
  const di = S.days.indexOf(day), iso = dayIso(di);
  const sp = startOf(di), ep = endOf(di);
  const items = [];
  if (sp && P(sp)) items.push({role:'start', id:sp});
  stops.forEach((s, si) => {
    if (s.startsWith('t:')) { const tr = T(s.slice(2)); if (tr && P(tr.from) && P(tr.to)) items.push({role:'tr', tr, si}); }
    else if (P(s)) items.push({role:'stop', id:s, si});
  });
  if (ep && P(ep)) items.push({role:'end', id:ep});
  const drops = S.luggage.filter(l => l.dropDate === iso), arrs = S.luggage.filter(l => l.arrDate === iso), usedDrop = new Set();
  let t = toMin(day.start) ?? 540, loc = null, travel = 0, ride = 0, late = 0, warns = 0, waitSum = 0;
  const rows = [];
  const doDrop = (row, pid) => {
    const l = drops.find(x => x.from === pid && !usedDrop.has(x.id)); if (!l) return;
    usedDrop.add(l.id);
    const cut = toMin(l.dropTime), lateBy = cut != null && t > cut ? t - cut : 0;
    row.drop = {l, at:t, late:lateBy}; if (lateBy) late += lateBy;
    t += (l.dropMin || 0);
  };
  const doArr = (row, pid) => {
    const l = arrs.find(x => x.to === pid); if (!l) return;
    const a = toMin(l.arrTime); row.lugArr = {l, early: a != null && t < a ? a - t : 0};
  };
  const doHotel = (row, pid, kind) => {
    if (kind === 'in') { const s = S.stays.find(x => x.placeId === pid && x.checkIn === iso); if (s && s.inTime && t < toMin(s.inTime)) row.earlyIn = {s, by:toMin(s.inTime) - t}; }
    else { const s = S.stays.find(x => x.placeId === pid && x.checkOut === iso); if (s && s.outTime && t > toMin(s.outTime)) { row.lateOut = {s, by:t - toMin(s.outTime)}; warns++; } }
  };
  items.forEach(it => {
    const row = {...it};
    const moveTo = id => { if (loc && loc !== id) { const li = legInfo(loc, id); row.legIn = li; t += li.min; travel += li.min; } };
    if (it.role === 'tr') {
      const tr = it.tr, tm = trTimes(tr, iso), dl = tm.dep - (tr.bufDep || 0);
      row.first = !loc;
      if (!loc) t = dl; else moveTo(tr.from);
      row.arrive = t; row.deadline = dl; row.dep = tm.dep; row.arr = tm.arr;
      if (t <= dl) { row.wait = dl - t; waitSum += row.wait; } else { row.late = t - dl; late += row.late; }
      t = tm.arr + (tr.bufArr || 0); loc = tr.to;
      doDrop(row, tr.to);
      row.ready = t; ride += tm.arr - tm.dep;
    } else {
      const p = P(it.id); row.p = p; moveTo(it.id);
      if (it.role === 'start') { doDrop(row, it.id); doHotel(row, it.id, 'out'); row.depart = t; }
      else if (it.role === 'end') { row.arrive = t; doArr(row, it.id); doHotel(row, it.id, 'in'); doDrop(row, it.id); }
      else {
        row.arrive = t; doArr(row, it.id); if (p.cat === 'hotel') doHotel(row, it.id, 'in');
        const hr = hoursFor(p, iso); row.hours = hr;
        let st = t;
        if (hr.closed) { row.closedDay = true; warns++; }
        if (p.fixed) {
          const f = toMin(p.fixed);
          if (t <= f) { row.wait = f - t; st = f; } else { row.late = t - f; late += row.late; }
        } else if (hr.open != null && t < hr.open) { row.wait = hr.open - t; st = hr.open; }
        if (hr.close != null && st + (p.stay || 0) > hr.close) { row.closeWarn = true; warns++; }
        row.start = st; t = st + (p.stay || 0);
        doDrop(row, it.id);
        row.depart = t; waitSum += row.wait || 0;
      }
      loc = it.id;
    }
    rows.push(row);
  });
  return {rows, end:t, travel, ride, late, warns, waitSum, sp, ep};
}
function costOf(day, order) {
  const c = computeDay(day, order);
  return c.end + c.late * 1000 + c.warns * 300 + c.travel * 0.01;
}

/* ---------- 최적 순서 (교통편 사이 구간별로) ---------- */
function bestOrder(day) {
  const stops = day.stops, segs = []; let cur = [];
  stops.forEach((s, k) => { if (s.startsWith('t:')) { if (cur.length) segs.push(cur); cur = []; } else cur.push(k); });
  if (cur.length) segs.push(cur);
  if (!segs.some(sg => sg.length >= 2)) return null;
  let best = stops.slice(), bestCost = costOf(day, best);
  segs.forEach(idx => {
    if (idx.length < 2) return;
    const apply = arr => { const c = best.slice(); idx.forEach((k, j) => c[k] = arr[j]); return c; };
    const n = idx.length;
    if (n <= 8) {
      const a = idx.map(k => best[k]), c = new Array(n).fill(0);
      let k = 0, segBest = best;
      while (k < n) {
        if (c[k] < k) {
          const j = k % 2 ? c[k] : 0; [a[j], a[k]] = [a[k], a[j]];
          const cand = apply(a), cost = costOf(day, cand);
          if (cost < bestCost) { bestCost = cost; segBest = cand; }
          c[k]++; k = 0;
        } else { c[k] = 0; k++; }
      }
      best = segBest;
    } else {
      let improved = true;
      while (improved) {
        improved = false;
        const a = idx.map(k => best[k]);
        outer: for (let x = 0; x < n - 1; x++) for (let y = x + 1; y < n; y++) {
          const arr = a.slice(0, x).concat(a.slice(x, y + 1).reverse(), a.slice(y + 1));
          const cand = apply(arr), cost = costOf(day, cand);
          if (cost < bestCost) { bestCost = cost; best = cand; improved = true; break outer; }
        }
      }
    }
  });
  return best;
}

/* 교통편을 날짜에 맞는 일차에, 시간 순서에 맞는 위치로 넣기 */
function placeTransport(tr) {
  const key = 't:' + tr.id;
  S.days.forEach(d => d.stops = d.stops.filter(x => x !== key));
  const i = dayIdxOf(tr.depDate);
  if (i < 0) return -1;
  const day = S.days[i], dep = toMin(tr.depTime);
  const rows = computeDay(day).rows.filter(r => r.si != null);
  const after = rows.find(r => (r.role === 'tr' ? r.dep : r.start) >= dep);
  const pos = after ? after.si : day.stops.length;
  day.stops.splice(pos, 0, key);
  return i;
}

/* ---------- 경비 계산 ---------- */
function moneyCalc(t = S) {
  const m = t.money, rate = +m.rate || 0;
  const krw = it => it.cur === 'JPY' ? it.amount * rate : it.amount;
  const bal = {}; t.members.forEach(x => bal[x] = 0);
  const byCat = {}; let total = 0;
  m.items.forEach(it => {
    const v = krw(it); total += v; byCat[it.cat] = (byCat[it.cat] || 0) + v;
    const among = it.among.filter(x => x in bal);
    if (it.payer in bal) bal[it.payer] += v;
    among.forEach(x => bal[x] -= v / (among.length || 1));
  });
  const cred = [], debt = [];
  Object.entries(bal).forEach(([k, v]) => { if (v > 1) cred.push([k, v]); else if (v < -1) debt.push([k, -v]); });
  cred.sort((a, b) => b[1] - a[1]); debt.sort((a, b) => b[1] - a[1]);
  const transfers = []; let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const x = Math.min(debt[i][1], cred[j][1]);
    transfers.push([debt[i][0], cred[j][0], x]);
    debt[i][1] -= x; cred[j][1] -= x;
    if (debt[i][1] < 1) i++; if (cred[j][1] < 1) j++;
  }
  return {total, byCat, bal, transfers, krw};
}
