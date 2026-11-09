/* =========================================================
   sync.js — 구글 드라이브 동기화
   - 희지님 드라이브의 "TRAVEL PLANNER" 폴더에 여행(.json)과 파일(files/)을 저장
   - 권한은 drive.file: 이 앱이 만든 파일만 접근
   - 병합 규칙: 여행마다 최근에 고친 쪽(updated)이 우선
   - 삭제: 이 기기에서 지운 여행은 드라이브 휴지통으로, 다른 기기에서 지운 여행은 여기서도 지움
   - 샘플 여행은 동기화하지 않음
   ========================================================= */

const GOOGLE_CLIENT_ID = '505716812414-r44m58q5s9mennj6j8uknn2q2tveje3j.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DAPI = 'https://www.googleapis.com/drive/v3';
const UAPI = 'https://www.googleapis.com/upload/drive/v3';

const Sync = {
  state:'off',      // off | idle | syncing | error | login(다시 로그인 필요)
  msg:'', running:false, again:false, timer:null, tokenClient:null,

  /* ---------- 상태 ---------- */
  on() { return !!G.syncOn; },
  tokenOk() { return G.token && G.tokenExp && Date.now() < G.tokenExp - 60000; },
  setState(s, msg = '') { this.state = s; this.msg = msg; updateSyncChips(); },
  label() {
    if (!this.on()) return '☁️ 드라이브 동기화';
    if (this.state === 'syncing') return '☁️ 동기화 중…';
    if (this.state === 'login' || !this.tokenOk()) return '⚠️ 다시 로그인';
    if (this.state === 'error') return '⚠️ 동기화 실패';
    if (G.lastSync) { const d = new Date(G.lastSync); return `☁️ ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 동기화됨`; }
    return '☁️ 동기화 켜짐';
  },

  /* ---------- 로그인 (구글 로그인 창) ---------- */
  loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error('gsi load failed')); document.head.appendChild(s);
    });
  },
  async login() {   // 반드시 버튼 클릭에서 호출 (팝업)
    try { await this.loadGis(); } catch (e) { toast('구글 로그인 화면을 불러오지 못했어요. 인터넷 연결을 확인하세요.'); return false; }
    return new Promise(res => {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id:GOOGLE_CLIENT_ID, scope:DRIVE_SCOPE,
        callback:r => {
          if (r.error || !r.access_token) { toast('로그인이 취소됐어요'); res(false); return; }
          G.token = r.access_token; G.tokenExp = Date.now() + (r.expires_in || 3600) * 1000;
          const first = !G.syncOn; G.syncOn = true; saveSettings();
          if (first) toast('로그인했어요. 이 기기의 여행을 드라이브와 맞출게요');
          res(true); this.syncNow();
        },
        error_callback:e => { toast(e && e.type === 'popup_closed' ? '로그인 창이 닫혔어요' : '로그인하지 못했어요'); res(false); }
      });
      this.tokenClient.requestAccessToken({prompt:G.syncOn ? '' : 'consent'});
    });
  },
  logout() {
    try { if (G.token && window.google && google.accounts) google.accounts.oauth2.revoke(G.token, () => {}); } catch (e) {}
    Object.assign(G, {syncOn:false, token:'', tokenExp:0, folderId:'', filesFolderId:''}); saveSettings();
    this.setState('off'); toast('동기화를 껐어요. 이 기기의 데이터는 그대로 남아 있어요');
  },
  // 칩을 눌렀을 때
  async tap() {
    if (!this.on() || !this.tokenOk()) { await this.login(); return; }
    openSyncMenu();
  },

  /* ---------- 드라이브 요청 ---------- */
  async req(url, opt = {}) {
    if (!this.tokenOk()) throw {login:true};
    const res = await fetch(url, {...opt, headers:{...(opt.headers || {}), Authorization:'Bearer ' + G.token}});
    if (res.status === 401) { G.tokenExp = 0; saveSettings(); throw {login:true}; }
    if (!res.ok) throw new Error('drive ' + res.status + ' ' + (await res.text()).slice(0, 200));
    return res;
  },
  async list(q, fields = 'files(id,name,modifiedTime,appProperties,trashed)') {
    let out = [], token = '';
    do {
      const r = await this.req(`${DAPI}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,${encodeURIComponent(fields)}&pageSize=1000&spaces=drive${token ? '&pageToken=' + token : ''}`);
      const js = await r.json(); out = out.concat(js.files || []); token = js.nextPageToken || '';
    } while (token);
    return out;
  },
  async folder(name, parent) {
    const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false` + (parent ? ` and '${parent}' in parents` : '');
    const f = (await this.list(q, 'files(id)'))[0];
    if (f) return f.id;
    const r = await this.req(`${DAPI}/files?fields=id`, {method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name, mimeType:'application/vnd.google-apps.folder', parents:parent ? [parent] : undefined})});
    return (await r.json()).id;
  },
  async ensureFolders() {
    // 저장해 둔 폴더가 아직 있는지 확인 (지워졌으면 다시 만들기)
    if (G.folderId) {
      try { const r = await this.req(`${DAPI}/files/${G.folderId}?fields=id,trashed`); if ((await r.json()).trashed) G.folderId = ''; }
      catch (e) { if (e.login) throw e; G.folderId = ''; }
    }
    if (!G.folderId) { G.folderId = await this.folder('TRAVEL PLANNER'); G.filesFolderId = ''; }
    if (!G.filesFolderId) G.filesFolderId = await this.folder('files', G.folderId);
    saveSettings();
  },
  multipart(meta, data, mime) {
    const b = 'tp' + Math.random().toString(36).slice(2);
    return {headers:{'Content-Type':'multipart/related; boundary=' + b},
      body:new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`, data, `\r\n--${b}--`])};
  },
  async upload(id, meta, data, mime) {
    const mp = this.multipart(meta, data, mime);
    const url = id ? `${UAPI}/files/${id}?uploadType=multipart&fields=id` : `${UAPI}/files?uploadType=multipart&fields=id`;
    const r = await this.req(url, {method:id ? 'PATCH' : 'POST', ...mp});
    return (await r.json()).id;
  },
  async trash(id) { await this.req(`${DAPI}/files/${id}`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({trashed:true})}); },
  async download(id, asBlob) { const r = await this.req(`${DAPI}/files/${id}?alt=media`); return asBlob ? r.blob() : r.json(); },

  /* ---------- 동기화 ---------- */
  schedule(delay = 4000) {
    if (!this.on()) return;
    clearTimeout(this.timer); this.timer = setTimeout(() => this.syncNow(), delay);
  },
  async syncNow() {
    if (!this.on()) return;
    if (!this.tokenOk()) { this.setState('login'); return; }
    if (!navigator.onLine) { this.setState('idle'); return; }
    if (this.running) { this.again = true; return; }
    this.running = true; this.setState('syncing');
    try {
      const changed = await this.run();
      G.lastSync = Date.now(); saveSettings(); this.setState('idle');
      if (changed) afterSyncChanged(changed);
    } catch (e) {
      if (e && e.login) this.setState('login');
      else { console.warn(e); this.setState('error', String(e.message || e)); }
    } finally {
      this.running = false;
      if (this.again) { this.again = false; this.schedule(1000); }
    }
  },
  // 실제 병합. 바뀐 여행 정보 반환 {downloaded:[id], removed:[id]} 또는 null
  async run() {
    await this.ensureFolders();
    const map = LS.get('tp.syncmap') || {};          // 여행id → 마지막으로 맞춘 updated
    const tomb = LS.get('tp.deleted') || [];         // 이 기기에서 지운 여행 id
    const remote = (await this.list(`'${G.folderId}' in parents and trashed=false and mimeType='application/json'`))
      .filter(f => f.appProperties && f.appProperties.tpId);
    const rById = {}; remote.forEach(f => { const id = f.appProperties.tpId; if (!rById[id] || +f.appProperties.updated > +rById[id].appProperties.updated) rById[id] = f; });
    const localIds = tripIds();
    const result = {downloaded:[], removed:[]};

    // 1) 이 기기에서 지운 여행 → 드라이브 휴지통
    for (const id of tomb) { if (rById[id]) { await this.trash(rById[id].id); delete rById[id]; } delete map[id]; }
    LS.set('tp.deleted', []);

    // 2) 이 기기에 있는 여행
    for (const id of localIds) {
      const t = loadTrip(id); if (!t || t.sample) continue;
      const r = rById[id];
      if (!r) {
        if (map[id] != null) { await removeTripLocal(id); result.removed.push(id); delete map[id]; continue; }  // 다른 기기에서 지움
        await this.pushTrip(t, null); map[id] = t.updated; continue;                                            // 새 여행
      }
      const ru = +r.appProperties.updated || 0;
      if ((t.updated || 0) > ru) { await this.pushTrip(t, r.id); map[id] = t.updated; }
      else if (ru > (t.updated || 0)) { await this.pullTrip(r); map[id] = ru; result.downloaded.push(id); }
      else map[id] = ru;
      // 같은 여행 파일이 여러 개면 나머지 정리
      for (const f of remote) if (f.appProperties.tpId === id && f.id !== r.id) await this.trash(f.id);
    }
    // 3) 드라이브에만 있는 여행 → 받아오기
    for (const [id, r] of Object.entries(rById)) {
      if (localIds.includes(id)) continue;
      await this.pullTrip(r); map[id] = +r.appProperties.updated || 0; result.downloaded.push(id);
    }
    LS.set('tp.syncmap', map);

    // 4) 파일(바우처·대표 사진) 맞추기
    const rFiles = await this.list(`'${G.filesFolderId}' in parents and trashed=false`);
    const rf = {}; rFiles.forEach(f => { if (f.appProperties && f.appProperties.fid) rf[f.appProperties.fid] = f.id; });
    const used = new Set();
    for (const t of allTrips()) {
      if (t.sample) continue;
      for (const f of tripFiles(t)) {
        used.add(f.fid);
        let local = null; try { local = await DB.get(f.fid); } catch (e) {}
        if (local && !rf[f.fid]) rf[f.fid] = await this.upload(null, {name:f.name || f.fid, parents:[G.filesFolderId], appProperties:{fid:f.fid}}, local, local.type || f.type || 'application/octet-stream');
        else if (!local && rf[f.fid]) { const b = await this.download(rf[f.fid], true); await DB.put(f.fid, b); }
      }
    }
    for (const [fid, id] of Object.entries(rf)) if (!used.has(fid)) await this.trash(id);   // 안 쓰는 파일 정리

    return result.downloaded.length || result.removed.length ? result : null;
  },
  async pushTrip(t, driveId) {
    const meta = {name:(t.trip.name || '여행').replace(/[\\/:*?"<>|]/g, '_') + '.json', mimeType:'application/json',
      appProperties:{tpId:t.id, updated:String(t.updated || 0)}};
    if (!driveId) meta.parents = [G.folderId];
    await this.upload(driveId, meta, JSON.stringify(t), 'application/json');
  },
  async pullTrip(r) {
    const t = migrate(await this.download(r.id));
    t.id = r.appProperties.tpId; t.updated = +r.appProperties.updated || t.updated || 0;
    LS.set('tp.trip.' + t.id, t);   // updated 시각은 그대로 유지
    if (!tripIds().includes(t.id)) setTripIds([t.id].concat(tripIds()));
  }
};

function tripFiles(t) {
  const out = [];
  if (t.coverFid) out.push({fid:t.coverFid, name:'cover-' + t.coverFid, type:'image/*'});
  (t.vouchers || []).forEach(v => v.files.forEach(f => out.push(f)));
  return out;
}
async function removeTripLocal(id) {
  const t = loadTrip(id); if (!t) return;
  for (const f of tripFiles(t)) { try { await DB.del(f.fid); } catch (e) {} }
  LS.del('tp.trip.' + id); setTripIds(tripIds().filter(x => x !== id));
}
// 여행을 지울 때 (home.js에서 호출)
function syncNoteDeleted(id, wasSample) {
  if (!Sync.on() || wasSample) return;
  const tomb = LS.get('tp.deleted') || []; if (!tomb.includes(id)) tomb.push(id); LS.set('tp.deleted', tomb);
  Sync.schedule(500);
}
// 동기화로 데이터가 바뀌었을 때 화면 갱신
function afterSyncChanged(r) {
  if (view === 'home') { renderHome(); return; }
  if (view === 'planner' && S) {
    if (r.removed.includes(S.id)) { toast('이 여행은 다른 기기에서 삭제됐어요'); goHome(); return; }
    if (r.downloaded.includes(S.id) && $('#modal').classList.contains('hidden')) {
      S = loadTrip(S.id); render(true); toast('다른 기기에서 고친 내용을 받아왔어요');
    }
  }
}
function updateSyncChips() {
  document.querySelectorAll('.syncchip').forEach(el => {
    el.textContent = Sync.label();
    el.classList.toggle('warn', Sync.on() && (Sync.state === 'login' || Sync.state === 'error' || !Sync.tokenOk()));
    el.classList.toggle('on', Sync.on() && Sync.tokenOk() && Sync.state !== 'error');
  });
}
function openSyncMenu() {
  const t = G.lastSync ? new Date(G.lastSync).toLocaleString('ko-KR') : '아직 없음';
  $('#modalBox').innerHTML = `<div class="h2">☁️ 구글 드라이브 동기화</div>
    <div class="sub" style="line-height:1.6">마지막 동기화: ${t}<br>
    여행은 희지님 구글 드라이브의 <b>TRAVEL PLANNER</b> 폴더에 저장돼요. 앱을 열 때와 고친 뒤 몇 초 뒤에 자동으로 맞춰요.<br>
    구글 정책상 로그인은 한 시간쯤 지나면 풀릴 수 있어요. 그때는 ⚠️ 다시 로그인을 눌러주세요.
    ${Sync.state === 'error' ? `<br><span style="color:var(--warn)">최근 오류: ${esc(Sync.msg)}</span>` : ''}</div>
    <div class="row" style="justify-content:space-between;margin-top:16px">
      <button class="danger" onclick="closeModal();Sync.logout()">동기화 끄기</button>
      <div class="row"><button onclick="closeModal()">닫기</button><button class="primary" onclick="closeModal();Sync.syncNow()">지금 동기화</button></div>
    </div>`;
  openModal();
}
const syncChip = () => `<button class="syncchip" onclick="event.stopPropagation();Sync.tap()">${Sync.label()}</button>`;

// 자동 동기화 시점: 인터넷 다시 연결 / 앱으로 돌아왔을 때
window.addEventListener('online', () => Sync.schedule(500));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') Sync.schedule(800); });
