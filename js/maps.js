/* =========================================================
   maps.js — 지도와 장소 검색
   - API 키가 있으면: 구글 지도(한국어) + 구글 장소 검색(Places API New)
   - 없거나 실패하면: OpenFreeMap/Esri 지도 + Photon 검색 (무료)
   화면 코드는 MapX / Search 만 사용
   ========================================================= */

const MapX = {
  kind:null, el:null, clickCb:null,
  async init(el, onClick) {
    this.el = el; this.clickCb = onClick;
    if (G.apiKey) {
      try { await GoogleMap.init(el); this.kind = 'google'; return; }
      catch (e) { console.warn(e); toast('구글 지도를 불러오지 못해서 무료 지도로 보여드려요. 설정에서 API 키를 확인하세요.'); }
    }
    if (FreeMap.init(el)) this.kind = 'free';
  },
  impl() { return this.kind === 'google' ? GoogleMap : FreeMap; },
  ok() { return !!this.kind; },
  clear() { this.ok() && this.impl().clear(); },
  pin(lat, lng, o) { this.ok() && this.impl().pin(lat, lng, o); },
  dot(lat, lng, o) { this.ok() && this.impl().dot(lat, lng, o); },
  line(pts, o) { this.ok() && this.impl().line(pts, o); },
  fit(pts) { this.ok() && this.impl().fit(pts); },
  view(lat, lng, z) { this.ok() && this.impl().view(lat, lng, z); },
  center() { return this.ok() ? this.impl().center() : {lat:35.69, lng:139.75}; },
  closePopup() { this.ok() && this.impl().closePopup(); },
  resize() { this.ok() && this.impl().resize(); },
  // 구글 인증 실패 시 무료 지도로 전환
  fallback() {
    if (this.kind !== 'google') return;
    GoogleMap.destroy(); this.el.innerHTML = ''; this.kind = null;
    if (FreeMap.init(this.el)) this.kind = 'free';
    if (typeof renderMap === 'function') { ui.fit = true; renderMap(); }
  }
};

/* ---------- 구글 지도 ---------- */
const GoogleMap = {
  map:null, objs:[], iw:null, lib:{},
  load() {
    if (window.google && google.maps && google.maps.importLibrary) return Promise.resolve();
    return new Promise((res, rej) => {
      window.__gmReady = () => res();
      window.gm_authFailure = () => {
        toast('구글 API 키가 거부됐어요. 키 제한(웹사이트 주소)과 사용 설정된 API를 확인하세요. 지금은 무료 지도로 보여드려요.');
        MapX.fallback(); Search.googleBroken = true;
      };
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(G.apiKey)}&v=weekly&language=ko&loading=async&callback=__gmReady`;
      s.async = true; s.onerror = () => rej(new Error('google maps script failed'));
      document.head.appendChild(s);
      setTimeout(() => rej(new Error('google maps timeout')), 15000);
    });
  },
  async init(el) {
    await this.load();
    const {Map, InfoWindow} = await google.maps.importLibrary('maps');
    const {Marker} = await google.maps.importLibrary('marker');
    this.lib = {Map, InfoWindow, Marker};
    this.map = new Map(el, {center:{lat:35.69, lng:139.75}, zoom:12, gestureHandling:'greedy',
      streetViewControl:false, fullscreenControl:false, mapTypeControl:true, clickableIcons:true,
      mapTypeControlOptions:{position:google.maps.ControlPosition.LEFT_BOTTOM}});
    this.iw = new InfoWindow();
    this.map.addListener('click', e => {
      if (!ui.addMode) return;
      if (e.placeId) e.stop();
      MapX.clickCb && MapX.clickCb(e.latLng.lat(), e.latLng.lng(), e.placeId || null);
    });
  },
  destroy() { this.clear(); this.map = null; },
  clear() { this.objs.forEach(o => o.setMap(null)); this.objs = []; },
  popup(marker, html) {
    if (!html) return;
    marker.addListener('click', () => { this.iw.setContent(`<div style="font-size:13px;line-height:1.5">${html}</div>`); this.iw.open({anchor:marker, map:this.map}); });
  },
  pin(lat, lng, {label = '', color = '#2563eb', fixed = false, html = '', z = 10} = {}) {
    const m = new this.lib.Marker({position:{lat, lng}, map:this.map, zIndex:z,
      icon:{path:google.maps.SymbolPath.CIRCLE, scale:13, fillColor:color, fillOpacity:1, strokeColor:fixed ? '#1d2330' : '#ffffff', strokeWeight:fixed ? 3 : 2},
      label:{text:String(label), color:'#ffffff', fontSize:'12px', fontWeight:'700'}});
    this.popup(m, html); this.objs.push(m);
  },
  dot(lat, lng, {color = '#9aa3af', opacity = .9, html = ''} = {}) {
    const m = new this.lib.Marker({position:{lat, lng}, map:this.map, zIndex:1,
      icon:{path:google.maps.SymbolPath.CIRCLE, scale:6, fillColor:color, fillOpacity:opacity, strokeColor:'#ffffff', strokeWeight:2}});
    this.popup(m, html); this.objs.push(m);
  },
  line(pts, {color = '#2563eb', weight = 4, dash = null, opacity = .85} = {}) {
    const path = pts.map(([lat, lng]) => ({lat, lng}));
    const o = {path, map:this.map, strokeColor:color, strokeWeight:weight, strokeOpacity:opacity};
    if (dash) {
      o.strokeOpacity = 0;
      o.icons = [{icon:{path:'M 0,-1 0,1', strokeOpacity:opacity, strokeColor:color, scale:weight * 0.8}, offset:'0', repeat:dash === 'dot' ? '8px' : '16px'}];
    }
    this.objs.push(new google.maps.Polyline(o));
  },
  fit(pts) {
    if (!pts.length) return;
    if (pts.length === 1) { this.view(pts[0][0], pts[0][1], 15); return; }
    const b = new google.maps.LatLngBounds(); pts.forEach(([lat, lng]) => b.extend({lat, lng}));
    this.map.fitBounds(b, 50);
  },
  view(lat, lng, z) { this.map.setCenter({lat, lng}); if (z) this.map.setZoom(z); },
  center() { const c = this.map.getCenter(); return {lat:c.lat(), lng:c.lng()}; },
  closePopup() { this.iw && this.iw.close(); },
  resize() {}
};

/* ---------- 무료 지도 (Leaflet + OpenFreeMap/Esri) ---------- */
const TILES = {
  ofm: {name:'지도 (한글/영어 전환)', vector:true, style:'https://tiles.openfreemap.org/styles/liberty',
        attr:'<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © OpenMapTiles · © OpenStreetMap contributors'},
  esri:{name:'지도 (Esri, 현지어)', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', attr:'Tiles &copy; Esri'},
  osm: {name:'OpenStreetMap', url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr:'&copy; OpenStreetMap contributors'},
  sat: {name:'위성 (Esri)', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr:'Tiles &copy; Esri'}
};
const FreeMap = {
  map:null, group:null, base:{},
  init(el) {
    if (typeof L === 'undefined') { el.innerHTML = '<div class="empty" style="padding-top:40px">지도를 불러오지 못했어요. 인터넷 연결을 확인하세요.</div>'; return false; }
    this.map = L.map(el, {zoomControl:true}).setView([35.69, 139.75], 12);
    const named = {};
    Object.entries(TILES).forEach(([k, t]) => {
      let layer;
      if (t.vector) {
        if (typeof L.maplibreGL !== 'function' || typeof maplibregl === 'undefined') return;
        layer = L.maplibreGL({style:t.style, attribution:t.attr, localIdeographFontFamily:"'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif"});
      } else layer = L.tileLayer(t.url, {attribution:t.attr, subdomains:t.sub || 'abc', maxZoom:19});
      this.base[k] = layer; named[t.name] = layer;
    });
    try { (this.base[G.mapStyle] || this.base.ofm || this.base.esri).addTo(this.map); }
    catch (e) { delete this.base.ofm; this.base.esri.addTo(this.map); }
    L.control.layers(named, null, {position:'bottomright'}).addTo(this.map);
    this.map.on('baselayerchange', e => { const k = Object.keys(TILES).find(x => TILES[x].name === e.name); if (k) { G.mapStyle = k; saveSettings(); } this.hookVector(); this.updateLang(); });
    this.group = L.layerGroup().addTo(this.map);
    this.map.on('click', e => { if (ui.addMode) MapX.clickCb && MapX.clickCb(e.latlng.lat, e.latlng.lng, null); });
    const seg = $('#langSeg'); if (seg) {
      seg.style.display = '';
      seg.querySelectorAll('button').forEach(b => b.onclick = () => { G.mapLang = b.dataset.lang; saveSettings(); this.updateLang(); this.applyLang(); });
    }
    this.hookVector(); this.updateLang();
    return true;
  },
  vectorOn() { return !!(this.base.ofm && this.map && this.map.hasLayer(this.base.ofm)); },
  gl() { try { return this.base.ofm && this.base.ofm.getMaplibreMap ? this.base.ofm.getMaplibreMap() : null; } catch (e) { return null; } },
  hookVector() {
    setTimeout(() => {
      const gl = this.gl(); if (!gl) return;
      if (!gl._tpHooked) { gl._tpHooked = true; gl.on('load', () => this.applyLang()); }
      this.applyLang();
    }, 0);
  },
  updateLang() {
    document.querySelectorAll('#langSeg button').forEach(b => b.classList.toggle('on', b.dataset.lang === G.mapLang));
    const seg = $('#langSeg'); if (seg) seg.style.opacity = this.vectorOn() ? 1 : .55;
  },
  applyLang() {
    const gl = this.gl(); if (!gl || !gl.isStyleLoaded || !gl.isStyleLoaded()) return;
    const expr = G.mapLang === 'ko' ? ['coalesce', ['get', 'name:ko'], ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']]
      : G.mapLang === 'en' ? ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']] : ['get', 'name'];
    try {
      gl.getStyle().layers.forEach(l => {
        if (l.type !== 'symbol') return;
        const tf = gl.getLayoutProperty(l.id, 'text-field');
        if (!tf || !/name/.test(JSON.stringify(tf))) return;
        gl.setLayoutProperty(l.id, 'text-field', expr);
      });
    } catch (e) {}
  },
  clear() { this.group && this.group.clearLayers(); },
  pin(lat, lng, {label = '', color = '#2563eb', fixed = false, html = ''} = {}) {
    const icon = L.divIcon({className:'', html:`<div class="pin${fixed ? ' fixed' : ''}" style="background:${color}">${label}</div>`, iconSize:[26, 26], iconAnchor:[13, 13]});
    const m = L.marker([lat, lng], {icon}).addTo(this.group); if (html) m.bindPopup(html);
  },
  dot(lat, lng, {color = '#9aa3af', opacity = .9, html = ''} = {}) {
    const m = L.circleMarker([lat, lng], {radius:6, color:'#fff', weight:2, fillColor:color, fillOpacity:opacity}).addTo(this.group); if (html) m.bindPopup(html);
  },
  line(pts, {color = '#2563eb', weight = 4, dash = null, opacity = .85} = {}) {
    L.polyline(pts, {color, weight, opacity, dashArray:dash === 'dot' ? '2 6' : dash ? '8 6' : null}).addTo(this.group);
  },
  fit(pts) { if (pts.length > 1) this.map.fitBounds(pts, {padding:[40, 40]}); else if (pts.length) this.map.setView(pts[0], 15); },
  view(lat, lng, z) { this.map.setView([lat, lng], z || this.map.getZoom()); },
  center() { const c = this.map.getCenter(); return {lat:c.lat, lng:c.lng}; },
  closePopup() { this.map && this.map.closePopup(); },
  resize() { this.map && setTimeout(() => this.map.invalidateSize(), 0); }
};

/* ---------- 장소 검색 ---------- */
function catFromTypes(types = []) {
  const t = types.join(' ');
  if (/airport/.test(t)) return 'air';
  if (/train_station|subway_station|transit_station|bus_station|light_rail_station/.test(t)) return 'station';
  if (/lodging|hotel/.test(t)) return 'hotel';
  if (/restaurant|cafe|food|bar|bakery|meal/.test(t)) return 'food';
  if (/store|shopping_mall|department_store|market/.test(t)) return 'shop';
  return 'sight';
}
const Search = {
  googleBroken:false, token:null,
  useGoogle() { return MapX.kind === 'google' && !this.googleBroken; },
  // 입력 중 후보 목록
  async suggest(q) {
    q = q.trim(); if (q.length < 2) return [];
    return this.useGoogle() ? this.gSuggest(q) : this.photon(q);
  },
  // 후보 하나 → 장소 정보
  async details(item) {
    if (item.pred || item.placeId) return this.gDetails(item);
    return item;   // photon 결과는 이미 정보 포함
  },
  async gSuggest(q) {
    try {
      const {AutocompleteSuggestion, AutocompleteSessionToken} = await google.maps.importLibrary('places');
      if (!this.token) this.token = new AutocompleteSessionToken();
      const c = MapX.center();
      const {suggestions} = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input:q, sessionToken:this.token, language:'ko', locationBias:{center:c, radius:50000}});
      return suggestions.filter(s => s.placePrediction).map(s => {
        const p = s.placePrediction;
        return {pred:p, name:(p.mainText && p.mainText.text) || p.text.text, addr:(p.secondaryText && p.secondaryText.text) || ''};
      });
    } catch (e) { console.warn(e); toast('구글 검색에 실패했어요. Places API (New)가 켜져 있는지 확인하세요.'); return []; }
  },
  async gDetails(item) {
    const {Place} = await google.maps.importLibrary('places');
    const place = item.pred ? item.pred.toPlace() : new Place({id:item.placeId, requestedLanguage:'ko'});
    await place.fetchFields({fields:['displayName', 'location', 'formattedAddress', 'types', 'rating', 'userRatingCount', 'regularOpeningHours', 'googleMapsURI', 'photos']});
    this.token = null;
    const oh = place.regularOpeningHours;
    let photo = '', photoBy = '';
    try { if (place.photos && place.photos[0]) { photo = place.photos[0].getURI({maxWidth:480}); const a = place.photos[0].authorAttributions; photoBy = a && a[0] ? a[0].displayName : ''; } } catch (e) {}
    return {
      name:place.displayName || item.name || '', lat:place.location.lat(), lng:place.location.lng(),
      addr:place.formattedAddress || '', cat:catFromTypes(place.types), gid:place.id,
      rating:place.rating || null, ratingCount:place.userRatingCount || 0, gmaps:place.googleMapsURI || '',
      hours:oh && oh.periods ? oh.periods.map(x => ({o:x.open ? {d:x.open.day, h:x.open.hour, m:x.open.minute} : null, c:x.close ? {d:x.close.day, h:x.close.hour, m:x.close.minute} : null})).filter(x => x.o) : null,
      hoursText:oh && oh.weekdayDescriptions ? oh.weekdayDescriptions : null,
      photo, photoBy
    };
  },
  async photon(q) {
    const c = MapX.center();
    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lat=${c.lat}&lon=${c.lng}`);
      const js = await res.json();
      return (js.features || []).map(f => {
        const pr = f.properties;
        return {name:pr.name || pr.street || q, lat:f.geometry.coordinates[1], lng:f.geometry.coordinates[0],
          addr:[pr.street, pr.district, pr.city, pr.state, pr.country].filter(Boolean).join(', '), cat:catFromTypes([pr.osm_value || ''])};
      });
    } catch (e) { toast('검색에 실패했어요. 인터넷 연결을 확인하세요.'); return []; }
  },
  async reverse(lat, lng) {
    try {
      const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`);
      const js = await res.json(); const pr = js.features && js.features[0] && js.features[0].properties;
      return pr ? (pr.name || [pr.street, pr.housenumber].filter(Boolean).join(' ')) : '';
    } catch (e) { return ''; }
  }
};
function gmapsLink(p) {
  if (p.gmaps) return p.gmaps;
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}${p.gid ? '&query_place_id=' + p.gid : ''}`;
}

/* ---------- 도보 경로 (OSRM, 무료) ---------- */
const geomCache = {};
const walkFailed = new Set();
let walkBusy = false;
async function ensureWalks() {
  if (walkBusy || !S) return; walkBusy = true;
  try {
    for (;;) {
      const day = S.days[ui.day]; if (!day) break;
      const need = computeDay(day).rows.map(r => r.legIn).filter(l => l && l.mode === 'walk' && !walkFailed.has(l.key) && (!l.walkReal || !geomCache[l.key]));
      if (!need.length) break;
      const l = need[0], pa = P(l.a), pb = P(l.b);
      try {
        const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${pa.lng},${pa.lat};${pb.lng},${pb.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url); const js = await res.json();
        if (!js.routes || !js.routes[0]) throw new Error('no route');
        const r = js.routes[0];
        setLeg(l.key, {walkMin:Math.max(1, Math.round(r.duration / 60)), walkKm:r.distance / 1000});
        geomCache[l.key] = r.geometry.coordinates.map(c => [c[1], c[0]]);
        geomCache[l.b + '>' + l.a] = geomCache[l.key].slice().reverse();
      } catch (e) { walkFailed.add(l.key); }
      if (S && view === 'planner') render(true);
      await new Promise(r => setTimeout(r, 350));
    }
  } finally { walkBusy = false; }
}
