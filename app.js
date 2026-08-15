// ============================================================
// GeoBelt Dashboard v2
// - New history layout: /history/<deviceId>/<YYYY-MM-DD>/<pushId>
// - Loads one day at a time (no 3,000-record global cap)
// - Legacy /esp32_telemetry can still be loaded page-by-page
// - NO Telegram bot token is stored in this browser code.
// ============================================================

const FIREBASE_DB_BASE = "https://kcesp32-default-rtdb.asia-southeast1.firebasedatabase.app";
const HISTORY_ROOT = "history";
const LEGACY_ROOT = "esp32_telemetry";
const HOME_CONFIG_PATH = "home_config";
const HOME_PIN_PATH = "app_settings/home_edit_pin";

const LIVE_REFRESH_MS = 5000;
const STALE_WARNING_SECONDS = 90;
const OFFLINE_WARNING_SECONDS = 180;
const LEGACY_PAGE_SIZE = 1000;

const GOOGLE_SUBDOMAINS = ['mt0', 'mt1', 'mt2', 'mt3'];
const GOOGLE_ATTRIBUTION = '© Google Maps';

// ---------------- Theme ----------------
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'light') {
    document.getElementById('html-root').classList.remove('dark');
}
updateThemeButton();

function updateThemeButton() {
    const dark = document.getElementById('html-root').classList.contains('dark');
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');
    if (icon) icon.innerText = dark ? '☀️' : '🌙';
    if (text) text.innerText = dark ? 'โหมดสว่าง' : 'โหมดมืด';
}

function toggleTheme() {
    const root = document.getElementById('html-root');
    root.classList.toggle('dark');
    localStorage.setItem('theme', root.classList.contains('dark') ? 'dark' : 'light');
    updateThemeButton();
}

// ---------------- General state ----------------
let currentDeviceId = localStorage.getItem('geobelt_device') || '';
let lastDeviceCoords = null;
let latestRecord = null;
let followMode = true;
let latestRecordTimestampMs = 0;

let homeLat = 6.632795;
let homeLon = 100.421219;
let homeRadius = 100;
let isSettingHomeMode = false;
let lastZoneState = null;

let historyDates = [];
let currentSelectedDate = null;
let currentDayEntries = [];
let currentFilteredEntries = [];
let activeHistoryIndex = -1;
let historyRouteEnabled = false;

let legacyGrouped = {};
let legacyOldestKey = null;
let legacyFinished = false;

let historyInlineMap = null;
let historyInlineMarker = null;
let historyRouteLine = null;

// ---------------- Map ----------------
const map = L.map('map', { maxZoom: 20, zoomControl: false })
    .setView([homeLat, homeLon], 17);

L.control.zoom({ position: 'bottomright' }).addTo(map);

const googleRoadmap = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: GOOGLE_SUBDOMAINS, attribution: GOOGLE_ATTRIBUTION
});
const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: GOOGLE_SUBDOMAINS, attribution: GOOGLE_ATTRIBUTION
});
const googleSatellite = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: GOOGLE_SUBDOMAINS, attribution: GOOGLE_ATTRIBUTION
});

googleHybrid.addTo(map);
L.control.layers({
    "🗺️ ถนน": googleRoadmap,
    "🛰️ Hybrid": googleHybrid,
    "🌍 Satellite": googleSatellite
}, null, { collapsed: true }).addTo(map);

let deviceMarker = null;
let accuracyCircle = null;
let homeMarker = null;
let homeCircle = null;

const homeIcon = L.divIcon({
    className: 'custom-home-icon',
    html: '<div style="background:#8b5cf6;width:34px;height:34px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 6px 15px rgba(139,92,246,.5)">🏠</div>',
    iconSize: [34,34], iconAnchor:[17,17]
});

function createDeviceIcon(source, stale=false) {
    let bg = '#64748b', icon = '📍';
    const s = String(source || '').toUpperCase();
    if (s === 'GNSS' || s === 'GPS') { bg='#10b981'; icon='🛰️'; }
    else if (s.includes('GOOGLE')) { bg='#3b82f6'; icon='📍'; }
    else if (s === 'LAST_KNOWN') { bg='#f59e0b'; icon='🕘'; }
    else if (s === 'LBS') { bg='#f97316'; icon='📡'; }
    if (stale) bg='#f59e0b';

    return L.divIcon({
        className:'custom-device-icon',
        html:`<div style="background:${bg};width:38px;height:38px;border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 6px 16px rgba(0,0,0,.42)">${icon}</div>`,
        iconSize:[38,38], iconAnchor:[19,19]
    });
}

// ---------------- Logging / notifications ----------------
function addLog(message) {
    const el = document.getElementById('activity-log');
    if (!el) return;
    const row = document.createElement('div');
    row.innerHTML = `<span class="text-slate-500">[${new Date().toLocaleTimeString('th-TH')}]</span> ${message}`;
    el.prepend(row);
    while (el.children.length > 80) el.removeChild(el.lastChild);
}

async function requestBrowserNotifications() {
    if (!('Notification' in window)) {
        alert('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน');
        return;
    }
    const result = await Notification.requestPermission();
    addLog(`สิทธิ์การแจ้งเตือน: ${result}`);
}

function browserNotify(title, body) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
    }
}

async function createAlertEvent(type, payload={}) {
    if (!currentDeviceId) return;
    try {
        await fetch(`${FIREBASE_DB_BASE}/alerts/${encodeURIComponent(currentDeviceId)}.json`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
                type,
                ...payload,
                created_at: Date.now()
            })
        });
    } catch(e) {
        console.warn('Alert event write failed', e);
    }
}

// ---------------- PIN / home configuration ----------------
async function verifyHomeEditPin() {
    if (typeof db === 'undefined' || typeof hashPassword !== 'function') {
        alert('ไม่พบระบบ auth.js / Firebase db');
        return false;
    }
    try {
        const snap = await db.ref(HOME_PIN_PATH).get();
        if (!snap.exists()) return await setupHomeEditPin();

        const pinData = snap.val();
        const entered = prompt('🔒 กรุณาใส่ PIN เพื่อแก้ไขขอบเขตบ้าน:');
        if (entered === null) return false;

        const enteredHash = await hashPassword(entered.trim(), pinData.salt);
        if (enteredHash !== pinData.pinHash) {
            alert('PIN ไม่ถูกต้อง');
            return false;
        }
        return true;
    } catch(e) {
        console.error(e);
        alert('ตรวจสอบ PIN ไม่สำเร็จ');
        return false;
    }
}

async function setupHomeEditPin() {
    const p1 = prompt('🔑 ตั้ง PIN ใหม่อย่างน้อย 4 หลัก:');
    if (p1 === null || p1.trim().length < 4) return false;
    const p2 = prompt('🔑 ยืนยัน PIN อีกครั้ง:');
    if (p2 === null || p1.trim() !== p2.trim()) {
        alert('PIN ไม่ตรงกัน');
        return false;
    }
    const salt = generateSalt();
    const pinHash = await hashPassword(p1.trim(), salt);
    await db.ref(HOME_PIN_PATH).set({
        salt, pinHash, updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    return true;
}

async function changeHomeEditPin() {
    if (!await verifyHomeEditPin()) return;
    const p1 = prompt('🔑 PIN ใหม่อย่างน้อย 4 หลัก:');
    if (!p1 || p1.trim().length < 4) return;
    const p2 = prompt('🔑 ยืนยัน PIN ใหม่:');
    if (!p2 || p1.trim() !== p2.trim()) return alert('PIN ไม่ตรงกัน');

    const salt = generateSalt();
    const pinHash = await hashPassword(p1.trim(), salt);
    await db.ref(HOME_PIN_PATH).set({
        salt, pinHash, updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    alert('เปลี่ยน PIN สำเร็จ');
}

async function fetchHomeConfigFromFirebase() {
    try {
        const r = await fetch(`${FIREBASE_DB_BASE}/${HOME_CONFIG_PATH}.json`);
        const d = await r.json();
        if (d && Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lon))) {
            homeLat = Number(d.lat);
            homeLon = Number(d.lon);
            homeRadius = Number(d.radius || 100);
        }
    } catch(e) {
        console.warn('home config:', e);
    }
    updateHomeOnMap();
}

async function saveHomeConfigToFirebase() {
    await fetch(`${FIREBASE_DB_BASE}/${HOME_CONFIG_PATH}.json`, {
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({lat:homeLat, lon:homeLon, radius:homeRadius})
    });
}

function updateHomeOnMap() {
    if (!homeMarker) {
        homeMarker = L.marker([homeLat,homeLon], {icon:homeIcon}).addTo(map).bindPopup('<b>🏠 บ้าน</b>');
        homeCircle = L.circle([homeLat,homeLon], {
            radius:homeRadius, color:'#8b5cf6', fillColor:'#a78bfa',
            fillOpacity:.15, weight:2
        }).addTo(map);
    } else {
        homeMarker.setLatLng([homeLat,homeLon]);
        homeCircle.setLatLng([homeLat,homeLon]).setRadius(homeRadius);
    }
    const input = document.getElementById('input-home-radius');
    if (input) input.value = homeRadius;
}

async function toggleMapSelectMode(forceState) {
    const next = forceState !== undefined ? forceState : !isSettingHomeMode;
    if (next && !isSettingHomeMode && !await verifyHomeEditPin()) return;

    isSettingHomeMode = next;
    document.getElementById('mode-instruction')?.classList.toggle('hidden', !next);
    document.getElementById('map')?.classList.toggle('map-selecting', next);
    const btn = document.getElementById('btn-map-mode');
    if (btn) btn.innerText = next ? '✕ ยกเลิก' : '🖱️ เลือกบนแผนที่';
}

map.on('click', async e => {
    if (!isSettingHomeMode) return;
    homeLat = e.latlng.lat;
    homeLon = e.latlng.lng;
    updateHomeOnMap();
    await saveHomeConfigToFirebase();
    toggleMapSelectMode(false);
    if (lastDeviceCoords) checkGeofence(lastDeviceCoords);
});

async function saveHomeSettings() {
    if (!await verifyHomeEditPin()) return;
    const radius = Number(document.getElementById('input-home-radius')?.value);
    if (!Number.isFinite(radius) || radius < 10) return alert('รัศมีต้องไม่น้อยกว่า 10 เมตร');
    homeRadius = radius;
    updateHomeOnMap();
    await saveHomeConfigToFirebase();
    if (lastDeviceCoords) checkGeofence(lastDeviceCoords);
    alert('บันทึกแล้ว');
}

async function useCurrentAsHome() {
    if (!await verifyHomeEditPin()) return;
    if (!navigator.geolocation) return alert('เบราว์เซอร์ไม่รองรับตำแหน่ง');

    navigator.geolocation.getCurrentPosition(async pos => {
        homeLat = pos.coords.latitude;
        homeLon = pos.coords.longitude;
        updateHomeOnMap();
        await saveHomeConfigToFirebase();
        map.setView([homeLat,homeLon], 18);
    }, () => alert('ไม่สามารถอ่านตำแหน่งปัจจุบันได้'), {
        enableHighAccuracy:true, timeout:12000, maximumAge:0
    });
}

// ---------------- Record normalization ----------------
// รองรับทั้ง schema ใหม่และข้อมูลเก่า
function normalizeRecord(raw, key='', dateKey='') {
    if (!raw || typeof raw !== 'object') return null;

    let battery = null;
    if (raw.battery && typeof raw.battery === 'object') {
        battery = raw.battery.modem_percent ?? raw.battery.percent ?? null;
    } else {
        battery = raw.battery ?? raw.batt ?? raw.battery_percent ?? null;
    }

    let lat = null, lon = null, source = 'NONE', accuracy = null, valid = false, stale = false;

    if (raw.location && typeof raw.location === 'object') {
        lat = Number(raw.location.lat);
        lon = Number(raw.location.lng ?? raw.location.lon);
        source = String(raw.location.source || 'NONE');
        accuracy = raw.location.accuracy_m != null ? Number(raw.location.accuracy_m) : null;
        valid = raw.location.valid !== false && Number.isFinite(lat) && Number.isFinite(lon);
        stale = !!raw.location.stale;
    } else if (raw.gps) {
        const p = parseLegacyGPS(raw.gps);
        if (p) {
            lat = p.lat; lon = p.lon; source = p.source; valid = true;
        }
    } else if (raw.lat != null && raw.lng != null) {
        lat = Number(raw.lat); lon = Number(raw.lng);
        source = String(raw.location_source || 'UNKNOWN');
        valid = Number.isFinite(lat) && Number.isFinite(lon);
    }

    let timestampMs = 0;
    if (raw.timestamp) {
        const n = Number(raw.timestamp);
        if (Number.isFinite(n)) timestampMs = n > 1e12 ? n : n * 1000;
    }
    if (!timestampMs && raw.timestamp_iso) {
        timestampMs = Date.parse(raw.timestamp_iso) || 0;
    }
    if (!timestampMs && key && key.length >= 8) {
        timestampMs = decodePushIdTimestamp(key) || 0;
    }

    return {
        key, dateKey, raw,
        battery,
        lat, lon, source, accuracy, valid, stale,
        timestampMs,
        sos: !!raw.sos,
        wifiConnected: !!raw.network?.wifi_connected,
        wifiSsid: raw.network?.wifi_ssid || '',
        wifiRssi: raw.network?.wifi_rssi_dbm ?? null,
        cellularReady: !!raw.network?.cellular_ready
    };
}

function parseLegacyGPS(gps) {
    if (!gps || String(gps).includes('No Fix')) return null;
    let s = String(gps).trim();

    if (s.startsWith('GoogleAPI:')) {
        const p = s.slice(10).split(',');
        const lat=Number(p[0]), lon=Number(p[1]);
        return Number.isFinite(lat)&&Number.isFinite(lon) ? {lat,lon,source:'GOOGLE'} : null;
    }

    if (s.startsWith('LBS:')) {
        const p = s.slice(4).split(',');
        const lat=Number(p[1]), lon=Number(p[2]);
        return Number.isFinite(lat)&&Number.isFinite(lon) ? {lat,lon,source:'LBS'} : null;
    }

    s = s.replace('GPS:','').replace('+CGNSSINFO:','').trim();
    const p = s.split(',');
    for (let i=0;i<p.length;i++) {
        if (p[i] === 'N' || p[i] === 'S') {
            const latRaw = Number(p[i-1]);
            const ewIndex = p.findIndex((x,idx)=>idx>i && (x==='E'||x==='W'));
            if (ewIndex > 0) {
                const lonRaw = Number(p[ewIndex-1]);
                let lat = nmeaToDecimal(latRaw, false);
                let lon = nmeaToDecimal(lonRaw, true);
                if (p[i] === 'S') lat = -lat;
                if (p[ewIndex] === 'W') lon = -lon;
                if (Number.isFinite(lat)&&Number.isFinite(lon)) return {lat,lon,source:'GNSS'};
            }
        }
    }
    return null;
}

function nmeaToDecimal(value, longitude=false) {
    if (!Number.isFinite(value)) return NaN;
    const degDigits = longitude ? 3 : 2;
    const str = String(Math.abs(value));
    const dot = str.indexOf('.');
    const integerLen = dot >= 0 ? dot : str.length;
    if (integerLen <= degDigits) return value;
    const degrees = Math.floor(value / 100);
    const minutes = Math.abs(value) - Math.abs(degrees)*100;
    return degrees + minutes/60;
}

// ---------------- Device discovery ----------------
async function discoverDevices() {
    const select = document.getElementById('device-select');
    try {
        const r = await fetch(`${FIREBASE_DB_BASE}/${HISTORY_ROOT}.json?shallow=true`);
        const data = await r.json();
        const devices = data && typeof data === 'object' ? Object.keys(data) : [];

        select.innerHTML = '';
        if (!devices.length) {
            select.innerHTML = '<option value="">ยังไม่มีข้อมูลรูปแบบใหม่</option>';
            setStatus('รอข้อมูลจากอุปกรณ์', 'offline');
            return;
        }

        devices.sort().forEach(id => {
            const o = document.createElement('option');
            o.value = id;
            o.textContent = id;
            select.appendChild(o);
        });

        if (!currentDeviceId || !devices.includes(currentDeviceId)) currentDeviceId = devices[0];
        select.value = currentDeviceId;
        localStorage.setItem('geobelt_device', currentDeviceId);

        await refreshNow();
    } catch(e) {
        console.error(e);
        select.innerHTML = '<option>เชื่อมต่อ Firebase ไม่สำเร็จ</option>';
    }
}

async function changeDevice(id) {
    currentDeviceId = id;
    localStorage.setItem('geobelt_device', id);
    lastDeviceCoords = null;
    latestRecord = null;
    await refreshNow();
}

// ---------------- Live data ----------------
function bangkokDateKey(date=new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit'
    }).formatToParts(date);
    const obj = Object.fromEntries(parts.map(x=>[x.type,x.value]));
    return `${obj.year}-${obj.month}-${obj.day}`;
}

async function fetchLastRecordForDate(dateKey) {
    if (!currentDeviceId) return null;
    const url = `${FIREBASE_DB_BASE}/${HISTORY_ROOT}/${encodeURIComponent(currentDeviceId)}/${dateKey}.json?orderBy=%22$key%22&limitToLast=1`;
    const r = await fetch(url);
    const data = await r.json();
    if (!data || typeof data !== 'object') return null;
    const keys = Object.keys(data);
    if (!keys.length) return null;
    const key = keys[0];
    return normalizeRecord(data[key], key, dateKey);
}

async function fetchLatestRecord() {
    const today = bangkokDateKey();
    let rec = await fetchLastRecordForDate(today);

    if (!rec) {
        const yesterday = new Date(Date.now() - 86400000);
        rec = await fetchLastRecordForDate(bangkokDateKey(yesterday));
    }

    if (!rec) {
        setStatus('ยังไม่พบข้อมูล', 'offline');
        return;
    }

    latestRecord = rec;
    latestRecordTimestampMs = rec.timestampMs || decodePushIdTimestamp(rec.key) || Date.now();
    updateLiveUI(rec);
}

function updateLiveUI(rec) {
    const now = Date.now();
    const ageSec = rec.timestampMs ? Math.max(0, Math.floor((now-rec.timestampMs)/1000)) : null;

    if (ageSec !== null && ageSec > OFFLINE_WARNING_SECONDS) setStatus('อุปกรณ์ออฟไลน์/ข้อมูลเก่า', 'offline');
    else if (ageSec !== null && ageSec > STALE_WARNING_SECONDS) setStatus('ข้อมูลเริ่มเก่า', 'stale');
    else setStatus('ออนไลน์', 'live');

    const warning = document.getElementById('data-warning');
    if (warning) {
        const warnings = [];
        if (rec.stale) warnings.push('พิกัดนี้เป็น Last Known ไม่ใช่ Fix ปัจจุบัน');
        if (ageSec !== null && ageSec > STALE_WARNING_SECONDS) warnings.push(`ไม่ได้รับข้อมูลใหม่ประมาณ ${ageSec} วินาที`);
        if (rec.source === 'LBS') warnings.push('พิกัด LBS มีความแม่นยำต่ำ ใช้เป็นตัวเลือกสุดท้าย');
        warning.innerText = warnings.join(' • ');
        warning.classList.toggle('hidden', warnings.length === 0);
    }

    updateBattery(rec.battery);
    document.getElementById('location-source').innerText = sourceFriendly(rec.source);
    document.getElementById('accuracy-text').innerText =
        Number.isFinite(rec.accuracy) ? `ความแม่นยำโดยประมาณ ±${Math.round(rec.accuracy)} ม.` : 'ความแม่นยำ: ไม่ระบุ';

    document.getElementById('wifi-status').innerText =
        rec.wifiConnected ? `${rec.wifiSsid || 'เชื่อมต่อ'}${rec.wifiRssi != null ? ` (${rec.wifiRssi} dBm)` : ''}` : 'ไม่ได้เชื่อม';
    document.getElementById('cellular-status').innerText = rec.cellularReady ? 'พร้อม' : 'ไม่พร้อม';

    const displayTime = rec.timestampMs ? new Date(rec.timestampMs).toLocaleString('th-TH', {timeZone:'Asia/Bangkok'}) : '-';
    document.getElementById('last-update').innerText = `อัปเดตล่าสุด: ${displayTime}`;
    document.getElementById('data-age').innerText = ageSec === null ? 'อายุข้อมูล: -' : `อายุข้อมูล: ${ageSec} วินาที`;

    if (rec.valid) {
        lastDeviceCoords = {lat:rec.lat, lon:rec.lon, source:rec.source, stale:rec.stale};
        document.getElementById('lat-lon-text').innerText =
            `${rec.lat.toFixed(6)}, ${rec.lon.toFixed(6)} • ${sourceFriendly(rec.source)}`;

        const icon = createDeviceIcon(rec.source, rec.stale);
        const popup = `<b>${sourceFriendly(rec.source)}</b><br>${rec.lat.toFixed(6)}, ${rec.lon.toFixed(6)}${Number.isFinite(rec.accuracy)?`<br>±${Math.round(rec.accuracy)} m`:''}`;

        if (!deviceMarker) {
            deviceMarker = L.marker([rec.lat,rec.lon], {icon}).addTo(map).bindPopup(popup);
        } else {
            deviceMarker.setLatLng([rec.lat,rec.lon]).setIcon(icon).bindPopup(popup);
        }

        if (accuracyCircle) {
            accuracyCircle.remove();
            accuracyCircle = null;
        }
        if (Number.isFinite(rec.accuracy) && rec.accuracy > 0 && rec.accuracy <= 5000) {
            accuracyCircle = L.circle([rec.lat,rec.lon], {
                radius:rec.accuracy, color:'#60a5fa', fillColor:'#60a5fa',
                fillOpacity:.07, weight:1
            }).addTo(map);
        }

        if (followMode) map.setView([rec.lat,rec.lon], Math.max(map.getZoom(), 17));
        checkGeofence(lastDeviceCoords);
    } else {
        document.getElementById('lat-lon-text').innerText = 'ยังไม่มีพิกัดที่ใช้งานได้';
    }

    if (rec.sos) {
        browserNotify('GeoBelt: SOS', 'อุปกรณ์ส่งสัญญาณ SOS');
        addLog('🚨 ได้รับ SOS จากอุปกรณ์');
    }
}

function setStatus(text, state) {
    document.getElementById('status-text').innerText = text;
    const dot = document.getElementById('online-dot');
    dot.className = `status-dot ${state}`;
}

function updateBattery(v) {
    const value = Number(v);
    const el = document.getElementById('batt-val');
    const bar = document.getElementById('batt-bar');

    if (!Number.isFinite(value)) {
        el.innerText = '--';
        bar.style.width = '0%';
        bar.className = 'h-2 rounded-full bg-slate-500';
        return;
    }

    const p = Math.max(0, Math.min(100, value));
    el.innerText = Math.round(p);
    bar.style.width = `${p}%`;
    bar.className = `h-2 rounded-full transition-all duration-500 ${p>50?'bg-emerald-500':p>20?'bg-amber-500':'bg-rose-500'}`;
}

function sourceFriendly(s) {
    s = String(s || 'NONE').toUpperCase();
    if (s === 'GNSS' || s === 'GPS') return '🛰️ GNSS';
    if (s.includes('GOOGLE')) return '📍 Google Geolocation';
    if (s === 'LAST_KNOWN') return '🕘 Last Known';
    if (s === 'LBS') return '📡 LBS';
    return '— No Fix';
}

function sourceClass(s) {
    s = String(s || '').toUpperCase();
    if (s === 'GNSS' || s === 'GPS') return 'src-gnss';
    if (s.includes('GOOGLE')) return 'src-google';
    if (s === 'LAST_KNOWN') return 'src-last';
    if (s === 'LBS') return 'src-lbs';
    return 'src-none';
}

function checkGeofence(coords) {
    const distance = map.distance([coords.lat,coords.lon], [homeLat,homeLon]);
    document.getElementById('distance-text').innerText = `ห่างจากบ้าน ${distance.toFixed(1)} เมตร`;

    const state = distance <= homeRadius ? 'IN' : 'OUT';
    document.getElementById('home-zone-status').innerHTML =
        state === 'IN'
            ? '<span class="text-emerald-400">🏠 อยู่ในพื้นที่บ้าน</span>'
            : '<span class="text-amber-400">🚗 ออกนอกพื้นที่บ้าน</span>';

    if (lastZoneState && lastZoneState !== state) {
        if (state === 'OUT') {
            browserNotify('GeoBelt', `อุปกรณ์ออกนอกพื้นที่บ้าน ${distance.toFixed(0)} เมตร`);
            createAlertEvent('GEOFENCE_OUT', {distance_m:distance, lat:coords.lat, lng:coords.lon});
            addLog(`🚨 ออกจากขอบเขตบ้าน (${distance.toFixed(1)} ม.)`);
        } else {
            browserNotify('GeoBelt', 'อุปกรณ์กลับเข้าสู่พื้นที่บ้าน');
            createAlertEvent('GEOFENCE_IN', {distance_m:distance, lat:coords.lat, lng:coords.lon});
            addLog('🏠 กลับเข้าสู่ขอบเขตบ้าน');
        }
    }
    lastZoneState = state;
}

function toggleFollowMode() {
    followMode = !followMode;
    document.getElementById('follow-btn')?.classList.toggle('active', followMode);
    if (followMode) centerToDevice();
}

function centerToDevice() {
    if (!lastDeviceCoords) return alert('ยังไม่มีพิกัด');
    map.setView([lastDeviceCoords.lat,lastDeviceCoords.lon], 18);
}

function copyCoordinates() {
    if (!lastDeviceCoords) return alert('ยังไม่มีพิกัด');
    navigator.clipboard.writeText(`${lastDeviceCoords.lat}, ${lastDeviceCoords.lon}`);
}

function openGoogleMaps() {
    if (!lastDeviceCoords) return alert('ยังไม่มีพิกัด');
    window.open(`https://www.google.com/maps?q=${lastDeviceCoords.lat},${lastDeviceCoords.lon}`, '_blank', 'noopener');
}

async function refreshNow() {
    if (!currentDeviceId) return;
    await fetchLatestRecord();
}

// ---------------- History: new structure ----------------
async function fetchHistoryDates() {
    if (!currentDeviceId) return;
    const list = document.getElementById('history-date-list');
    list.innerHTML = '<div class="text-xs text-slate-400 text-center py-6">กำลังโหลด...</div>';

    try {
        const r = await fetch(`${FIREBASE_DB_BASE}/${HISTORY_ROOT}/${encodeURIComponent(currentDeviceId)}.json?shallow=true`);
        const data = await r.json();
        historyDates = data && typeof data === 'object' ? Object.keys(data).sort().reverse() : [];
        renderHistoryDateList();
        if (historyDates.length) await selectHistoryDate(historyDates[0]);
    } catch(e) {
        console.error(e);
        list.innerHTML = '<div class="text-xs text-rose-400 text-center py-6">โหลดวันไม่สำเร็จ</div>';
    }
}

function renderHistoryDateList() {
    const list = document.getElementById('history-date-list');
    list.innerHTML = '';

    if (!historyDates.length && !Object.keys(legacyGrouped).length) {
        list.innerHTML = '<div class="text-xs text-slate-400 text-center py-6">ยังไม่มีข้อมูลรูปแบบใหม่<br>กด “ข้อมูลเดิม” เพื่ออ่านฐานข้อมูลเก่า</div>';
        return;
    }

    historyDates.forEach(dateKey => {
        const b = document.createElement('button');
        b.className = 'history-date-btn' + (currentSelectedDate===dateKey ? ' active':'');
        b.dataset.date = dateKey;
        b.innerHTML = `📅 ${formatDateThai(dateKey)}<span class="block text-slate-400 font-normal mt-1">ข้อมูลรูปแบบใหม่</span>`;
        b.onclick = () => selectHistoryDate(dateKey);
        list.appendChild(b);
    });

    Object.keys(legacyGrouped).sort().reverse().forEach(dateKey => {
        const id = `legacy:${dateKey}`;
        const b = document.createElement('button');
        b.className = 'history-date-btn' + (currentSelectedDate===id ? ' active':'');
        b.dataset.date = id;
        b.innerHTML = `🗃️ ${formatDateThai(dateKey)}<span class="block text-slate-400 font-normal mt-1">${legacyGrouped[dateKey].length} รายการเดิม</span>`;
        b.onclick = () => selectHistoryDate(id);
        list.appendChild(b);
    });
}

async function selectHistoryDate(dateKey) {
    currentSelectedDate = dateKey;
    activeHistoryIndex = -1;
    document.querySelectorAll('.history-date-btn').forEach(b => b.classList.toggle('active', b.dataset.date === dateKey));

    if (dateKey.startsWith('legacy:')) {
        currentDayEntries = legacyGrouped[dateKey.slice(7)] || [];
        renderHistory();
        return;
    }

    document.getElementById('history-table-body').innerHTML =
        '<tr><td colspan="4" class="text-center text-slate-400 py-8">กำลังโหลด...</td></tr>';

    try {
        const r = await fetch(`${FIREBASE_DB_BASE}/${HISTORY_ROOT}/${encodeURIComponent(currentDeviceId)}/${dateKey}.json`);
        const data = await r.json();

        currentDayEntries = data && typeof data === 'object'
            ? Object.entries(data).map(([key,val])=>normalizeRecord(val,key,dateKey)).filter(Boolean)
            : [];

        currentDayEntries.sort((a,b)=>(a.timestampMs||0)-(b.timestampMs||0));
        renderHistory();
    } catch(e) {
        console.error(e);
        currentDayEntries = [];
        renderHistory();
    }
}

function renderHistory() {
    const body = document.getElementById('history-table-body');
    const t1 = document.getElementById('filter-time-start')?.value || '';
    const t2 = document.getElementById('filter-time-end')?.value || '';
    const sourceFilter = document.getElementById('filter-source')?.value || '';

    currentFilteredEntries = currentDayEntries.filter(rec => {
        const time = recordTimeString(rec);
        if (t1 && time < t1) return false;
        if (t2 && time > t2) return false;

        if (sourceFilter) {
            const s = String(rec.source||'NONE').toUpperCase();
            if (sourceFilter === 'GOOGLE' && !s.includes('GOOGLE')) return false;
            else if (sourceFilter !== 'GOOGLE' && s !== sourceFilter) return false;
        }
        return true;
    });

    document.getElementById('history-count').innerText =
        `${currentFilteredEntries.length.toLocaleString()} / ${currentDayEntries.length.toLocaleString()} รายการ`;

    if (!currentFilteredEntries.length) {
        body.innerHTML = '<tr><td colspan="4" class="text-center text-slate-400 py-10">ไม่พบข้อมูล</td></tr>';
        updateHistoryRoute();
        return;
    }

    body.innerHTML = currentFilteredEntries.map((rec,idx)=>{
        const coordText = rec.valid ? `${rec.lat.toFixed(6)}, ${rec.lon.toFixed(6)}` : 'No Fix';
        const batt = Number.isFinite(Number(rec.battery)) ? `${Math.round(Number(rec.battery))}%` : '-';
        return `<tr class="history-row ${rec.valid?'valid':'invalid'} ${idx===activeHistoryIndex?'selected':''}" ${rec.valid?`onclick="selectHistoryRow(${idx})"`:''}>
            <td class="font-mono whitespace-nowrap">🕒 ${recordTimeString(rec)}</td>
            <td class="text-emerald-400 font-bold">${batt}</td>
            <td><span class="source-badge ${sourceClass(rec.source)}">${sourceFriendly(rec.source)}</span></td>
            <td class="max-w-[210px] truncate">${coordText}${rec.stale?' • เก่า':''}</td>
        </tr>`;
    }).join('');

    if (activeHistoryIndex < 0) {
        const first = currentFilteredEntries.findIndex(x=>x.valid);
        if (first >= 0) selectHistoryRow(first);
    } else {
        updateHistoryRoute();
    }
}

function clearHistoryFilters() {
    document.getElementById('filter-time-start').value = '';
    document.getElementById('filter-time-end').value = '';
    document.getElementById('filter-source').value = '';
    renderHistory();
}

function selectHistoryRow(index) {
    activeHistoryIndex = index;
    const rec = currentFilteredEntries[index];
    if (!rec || !rec.valid) return;

    document.querySelectorAll('#history-table-body tr').forEach((r,i)=>r.classList.toggle('selected',i===index));

    document.getElementById('side-map-time-label').innerText = recordTimeString(rec);
    document.getElementById('inline-history-info').innerHTML = `
        <div>📅 ${currentSelectedDate?.replace('legacy:','') || '-'}</div>
        <div class="mt-1">📍 ${rec.lat.toFixed(6)}, ${rec.lon.toFixed(6)}</div>
        <div class="mt-1">${sourceFriendly(rec.source)} ${Number.isFinite(rec.accuracy)?`• ±${Math.round(rec.accuracy)} ม.`:''}</div>
        <div class="mt-1">🔋 ${Number.isFinite(Number(rec.battery))?Math.round(Number(rec.battery))+'%':'-'}</div>
    `;

    setTimeout(()=>{
        if (!historyInlineMap) {
            historyInlineMap = L.map('inline-history-map', {zoomControl:true});
            L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                maxZoom:21, subdomains:GOOGLE_SUBDOMAINS, attribution:GOOGLE_ATTRIBUTION
            }).addTo(historyInlineMap);
        }
        historyInlineMap.invalidateSize();
        historyInlineMap.setView([rec.lat,rec.lon],18);

        const icon = createDeviceIcon(rec.source, rec.stale);
        if (!historyInlineMarker) historyInlineMarker = L.marker([rec.lat,rec.lon],{icon}).addTo(historyInlineMap);
        else historyInlineMarker.setLatLng([rec.lat,rec.lon]).setIcon(icon);

        updateHistoryRoute();
    },80);
}

function toggleHistoryRoute() {
    historyRouteEnabled = !historyRouteEnabled;
    document.getElementById('route-btn')?.classList.toggle('active',historyRouteEnabled);
    updateHistoryRoute();
}

function updateHistoryRoute() {
    if (!historyInlineMap) return;
    if (historyRouteLine) {
        historyRouteLine.remove();
        historyRouteLine = null;
    }
    if (!historyRouteEnabled) return;

    const pts = currentFilteredEntries.filter(r=>r.valid && r.source !== 'LBS').map(r=>[r.lat,r.lon]);
    if (pts.length >= 2) {
        historyRouteLine = L.polyline(pts, {weight:3, opacity:.75}).addTo(historyInlineMap);
        historyInlineMap.fitBounds(historyRouteLine.getBounds(), {padding:[25,25]});
    }
}

function jumpToPickedDate() {
    const date = document.getElementById('history-date-picker').value;
    if (!date) return;
    if (historyDates.includes(date)) return selectHistoryDate(date);
    if (legacyGrouped[date]) return selectHistoryDate(`legacy:${date}`);
    alert('ยังไม่มีข้อมูลของวันที่เลือก');
}

function exportCurrentDayCSV() {
    if (!currentFilteredEntries.length) return alert('ไม่มีข้อมูลให้ส่งออก');
    const rows = [['timestamp','time','battery','source','lat','lng','accuracy_m','stale','sos']];
    currentFilteredEntries.forEach(r => rows.push([
        r.timestampMs ? new Date(r.timestampMs).toISOString() : '',
        recordTimeString(r),
        r.battery ?? '',
        r.source,
        r.valid ? r.lat : '',
        r.valid ? r.lon : '',
        Number.isFinite(r.accuracy) ? r.accuracy : '',
        r.stale,
        r.sos
    ]));

    const csv = rows.map(row=>row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob(["\ufeff"+csv], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `GeoBelt_${currentDeviceId}_${(currentSelectedDate||'history').replace(':','_')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

function csvEscape(v) {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

function formatDateThai(dateKey) {
    const d = new Date(`${dateKey}T12:00:00+07:00`);
    return Number.isNaN(d.getTime()) ? dateKey : d.toLocaleDateString('th-TH', {
        timeZone:'Asia/Bangkok', day:'2-digit', month:'2-digit', year:'numeric'
    });
}

function recordTimeString(rec) {
    const ms = rec.timestampMs || decodePushIdTimestamp(rec.key);
    if (!ms) return '--:--:--';
    return new Date(ms).toLocaleTimeString('th-TH', {
        timeZone:'Asia/Bangkok', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
    });
}

// ---------------- Legacy pagination ----------------
const PUSH_ID_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";

function decodePushIdTimestamp(pushId) {
    if (!pushId || pushId.length < 8) return 0;
    let ms = 0;
    for (let i=0;i<8;i++) {
        const n = PUSH_ID_CHARS.indexOf(pushId[i]);
        if (n < 0) return 0;
        ms = ms*64+n;
    }
    return ms;
}

async function loadLegacyPage() {
    if (legacyFinished) return alert('โหลดข้อมูลเดิมครบแล้ว');
    let query = `orderBy=%22$key%22&limitToLast=${LEGACY_PAGE_SIZE + (legacyOldestKey ? 1 : 0)}`;
    if (legacyOldestKey) query += `&endAt=%22${encodeURIComponent(legacyOldestKey)}%22`;

    try {
        const r = await fetch(`${FIREBASE_DB_BASE}/${LEGACY_ROOT}.json?${query}`);
        const data = await r.json();
        if (!data || typeof data !== 'object') {
            legacyFinished = true;
            return;
        }

        let entries = Object.entries(data).sort(([a],[b])=>a.localeCompare(b));
        if (legacyOldestKey) entries = entries.filter(([k])=>k !== legacyOldestKey);
        if (!entries.length) {
            legacyFinished = true;
            return;
        }

        legacyOldestKey = entries[0][0];

        entries.forEach(([key,val])=>{
            const ms = decodePushIdTimestamp(key);
            if (!ms) return;
            const dateKey = bangkokDateKey(new Date(ms));
            if (!legacyGrouped[dateKey]) legacyGrouped[dateKey] = [];
            const rec = normalizeRecord(val,key,dateKey);
            if (rec && !legacyGrouped[dateKey].some(x=>x.key===key)) legacyGrouped[dateKey].push(rec);
        });

        Object.values(legacyGrouped).forEach(arr=>arr.sort((a,b)=>a.timestampMs-b.timestampMs));
        renderHistoryDateList();
        document.getElementById('legacy-load-more').classList.remove('hidden');

        if (entries.length < LEGACY_PAGE_SIZE) legacyFinished = true;
        addLog(`โหลดข้อมูลเดิมเพิ่ม ${entries.length} รายการ`);
    } catch(e) {
        console.error(e);
        alert('โหลดข้อมูลเดิมไม่สำเร็จ');
    }
}

// ---------------- Modal ----------------
async function openHistoryModal() {
    const modal = document.getElementById('history-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    await fetchHistoryDates();
}

function closeHistoryModal() {
    const modal = document.getElementById('history-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    if (historyInlineMap) {
        historyInlineMap.remove();
        historyInlineMap = null;
    }
    historyInlineMarker = null;
    historyRouteLine = null;
}

document.getElementById('history-modal')?.addEventListener('click', e=>{
    if (e.target === e.currentTarget) closeHistoryModal();
});

// ---------------- Startup ----------------
async function init() {
    await fetchHomeConfigFromFirebase();
    await discoverDevices();

    setInterval(fetchLatestRecord, LIVE_REFRESH_MS);
    setInterval(fetchHomeConfigFromFirebase, 30000);

    addLog('ระบบ Dashboard v2 พร้อมใช้งาน');
}

init();
