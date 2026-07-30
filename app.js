// กำหนด Firebase URL
const FIREBASE_URL = "https://kcesp32-default-rtdb.asia-southeast1.firebasedatabase.app/esp32_telemetry.json";
const FIREBASE_CONFIG_URL = "https://kcesp32-default-rtdb.asia-southeast1.firebasedatabase.app/home_config.json";

// ตั้งค่าธีมเริ่มต้นจาก localStorage
const savedTheme = localStorage.getItem('theme') || 'dark';
if (savedTheme === 'light') {
    document.getElementById('html-root').classList.remove('dark');
    document.getElementById('theme-icon').innerText = '🌙';
    document.getElementById('theme-text').innerText = 'โหมดมืด';
}

function toggleTheme() {
    const htmlRoot = document.getElementById('html-root');
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');

    if (htmlRoot.classList.contains('dark')) {
        htmlRoot.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        themeIcon.innerText = '🌙';
        themeText.innerText = 'โหมดมืด';
        addLog("เปลี่ยนเป็นโหมดสว่างสำเร็จ");
    } else {
        htmlRoot.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        themeIcon.innerText = '☀️';
        themeText.innerText = 'โหมดสว่าง';
        addLog("เปลี่ยนเป็นโหมดมืดสำเร็จ");
    }
}

// ตั้งค่าตำแหน่งบ้านเริ่มต้น
let homeLat = 6.632795;
let homeLon = 100.421219;
let homeRadius = 100; // เมตร
let isSettingHomeMode = false;

// เริ่มต้นแผนที่หลัก Leaflet
let map = L.map('map', {
    maxZoom: 20,
    zoomControl: false
}).setView([homeLat, homeLon], 17);

L.control.zoom({ position: 'bottomright' }).addTo(map);

const GOOGLE_SUBDOMAINS = ['mt0', 'mt1', 'mt2', 'mt3'];
const GOOGLE_ATTRIBUTION = '&copy; Google Maps';

const googleRoadmap = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: GOOGLE_SUBDOMAINS, attribution: GOOGLE_ATTRIBUTION
});
const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: GOOGLE_SUBDOMAINS, attribution: GOOGLE_ATTRIBUTION
});
const googleSatellite = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: GOOGLE_SUBDOMAINS, attribution: GOOGLE_ATTRIBUTION
});
const googleTerrain = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
    maxZoom: 21, subdomains: GOOGLE_SUBDOMAINS, attribution: GOOGLE_ATTRIBUTION
});

googleHybrid.addTo(map);

const baseMaps = {
    "🗺️ แผนที่ถนน (Roadmap)": googleRoadmap,
    "🛰️ ดาวเทียม + ป้ายชื่อ (Hybrid)": googleHybrid,
    "🌍 ภาพถ่ายดาวเทียมล้วน (Satellite)": googleSatellite,
    "⛰️ แผนที่ภูมิประเทศ (Terrain)": googleTerrain
};

L.control.layers(baseMaps, null, { collapsed: true }).addTo(map);

let deviceMarker = null;
let homeMarker = null;
let homeCircle = null;
let lastDeviceCoords = null;

const homeIcon = L.divIcon({
    className: 'custom-home-icon',
    html: '<div style="background-color: #8b5cf6; width: 34px; height: 34px; border-radius: 50%; border: 3px solid #ffffff; display: flex; align-items: center; justify-content: center; color: white; font-size: 15px; box-shadow: 0 6px 15px rgba(139, 92, 246, 0.5);">🏠</div>',
    iconSize: [34, 34],
    iconAnchor: [17, 17]
});

function addLog(message) {
    const logBox = document.getElementById('activity-log');
    if (!logBox) return;
    const timeStr = new Date().toLocaleTimeString();
    const logItem = document.createElement('div');
    logItem.innerHTML = `<span class="text-slate-500">[${timeStr}]</span> ${message}`;
    logBox.prepend(logItem);
}

function updateHomeOnMap() {
    if (homeMarker) {
        homeMarker.setLatLng([homeLat, homeLon]);
        homeCircle.setLatLng([homeLat, homeLon]);
        homeCircle.setRadius(homeRadius);
    } else {
        homeMarker = L.marker([homeLat, homeLon], { icon: homeIcon }).addTo(map)
            .bindPopup("<b>🏠 ตำแหน่งบ้านของคุณ</b>");
        
        homeCircle = L.circle([homeLat, homeLon], {
            color: '#8b5cf6',
            fillColor: '#a78bfa',
            fillOpacity: 0.18,
            radius: homeRadius,
            weight: 2
        }).addTo(map);
    }
    
    const radiusInput = document.getElementById('input-home-radius');
    if (radiusInput) radiusInput.value = homeRadius;
}

async function saveHomeConfigToFirebase() {
    try {
        const payload = { lat: homeLat, lon: homeLon, radius: homeRadius };
        await fetch(FIREBASE_CONFIG_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (error) {
        console.error("Error saving home config to Firebase:", error);
    }
}

async function fetchHomeConfigFromFirebase() {
    try {
        const response = await fetch(FIREBASE_CONFIG_URL);
        const data = await response.json();
        if (data && data.lat !== undefined && data.lon !== undefined && data.radius !== undefined) {
            homeLat = parseFloat(data.lat);
            homeLon = parseFloat(data.lon);
            homeRadius = parseFloat(data.radius);
            updateHomeOnMap();
            if (lastDeviceCoords) checkGeofence(lastDeviceCoords);
        } else {
            saveHomeConfigToFirebase();
            updateHomeOnMap();
        }
    } catch (error) {
        updateHomeOnMap();
    }
}

function toggleMapSelectMode(forceState) {
    isSettingHomeMode = forceState !== undefined ? forceState : !isSettingHomeMode;
    const btn = document.getElementById('btn-map-mode');
    const instruction = document.getElementById('mode-instruction');
    const mapEl = document.getElementById('map');

    if (isSettingHomeMode) {
        btn.classList.remove('bg-slate-700', 'hover:bg-slate-600', 'border-slate-600');
        btn.classList.add('bg-purple-600', 'hover:bg-purple-700', 'text-white', 'border-purple-500', 'ring-2', 'ring-purple-400');
        btn.innerHTML = '❌ ปิดโหมดคลิกแผนที่';
        instruction.classList.remove('hidden');
        mapEl.classList.add('cursor-crosshair');
        addLog("เปิดโหมดเลือกพิกัดบ้านจากแผนที่แล้ว");
    } else {
        btn.classList.remove('bg-purple-600', 'hover:bg-purple-700', 'text-white', 'border-purple-500', 'ring-2', 'ring-purple-400');
        btn.classList.add('bg-slate-700', 'hover:bg-slate-600', 'border-slate-600');
        btn.innerHTML = '🖱️ คลิกเลือกจากแมพ';
        instruction.classList.add('hidden');
        mapEl.classList.remove('cursor-crosshair');
        addLog("ปิดโหมดเลือกพิกัดบ้านจากแผนที่แล้ว");
    }
}

map.on('click', function(e) {
    if (!isSettingHomeMode) return;
    homeLat = e.latlng.lat;
    homeLon = e.latlng.lng;
    updateHomeOnMap();
    saveHomeConfigToFirebase();
    addLog(`ปักหมุดบ้านใหม่สำเร็จ: ${homeLat.toFixed(6)}, ${homeLon.toFixed(6)}`);
    if (lastDeviceCoords) checkGeofence(lastDeviceCoords);
    toggleMapSelectMode(false);
});

function saveHomeSettings() {
    const radiusInput = document.getElementById('input-home-radius');
    homeRadius = parseFloat(radiusInput.value);

    if (isNaN(homeRadius) || homeRadius <= 0) {
        alert("กรุณากรอกตัวเลขรัศมีให้ถูกต้อง");
        return;
    }

    updateHomeOnMap();
    saveHomeConfigToFirebase();
    addLog(`อัปเดตรัศมีบ้านเป็น ${homeRadius} เมตร`);
    alert("บันทึกรัศมีบ้านเรียบร้อยแล้ว!");
    if (lastDeviceCoords) checkGeofence(lastDeviceCoords);
}

function useCurrentAsHome() {
    if (!navigator.geolocation) {
        alert("เบราว์เซอร์ของคุณไม่รองรับการระบุตำแหน่งปัจจุบัน");
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (position) => {
            homeLat = position.coords.latitude;
            homeLon = position.coords.longitude;
            updateHomeOnMap();
            saveHomeConfigToFirebase();
            map.setView([homeLat, homeLon], 18);
            addLog(`ตั้งค่าบ้านจากตำแหน่งปัจจุบันสำเร็จ: ${homeLat.toFixed(6)}, ${homeLon.toFixed(6)}`);
            alert("ตั้งค่าบ้านเป็นตำแหน่งปัจจุบันเรียบร้อยแล้ว!");
            if (lastDeviceCoords) checkGeofence(lastDeviceCoords);
        },
        (error) => {
            alert("ไม่สามารถดึงตำแหน่งปัจจุบันได้ กรุณาตรวจสอบการอนุญาตสิทธิ์");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

function copyCoordinates() {
    if (!lastDeviceCoords) {
        alert("ยังไม่มีข้อมูลพิกัดอุปกรณ์");
        return;
    }
    const text = `${lastDeviceCoords.lat}, ${lastDeviceCoords.lon}`;
    navigator.clipboard.writeText(text).then(() => {
        alert("คัดลอกพิกัดเรียบร้อย: " + text);
    });
}

function centerToDevice() {
    if (lastDeviceCoords) {
        map.setView([lastDeviceCoords.lat, lastDeviceCoords.lon], 18);
    } else {
        alert("ยังไม่พบตำแหน่งพิกัดจากอุปกรณ์");
    }
}

function checkGeofence(coords) {
    const distance = map.distance([coords.lat, coords.lon], [homeLat, homeLon]);
    document.getElementById('distance-text').innerText = `ระยะห่างจากบ้าน: ${distance.toFixed(1)} เมตร`;

    const statusEl = document.getElementById('home-zone-status');
    const cardZone = document.getElementById('card-zone');
    cardZone.classList.remove('hidden');

    if (distance <= homeRadius) {
        statusEl.innerHTML = '<span class="text-emerald-500 font-extrabold flex items-center gap-1">🏠 อยู่ในบ้าน (In Zone)</span>';
    } else {
        statusEl.innerHTML = '<span class="text-amber-500 font-extrabold flex items-center gap-1">🚗 ออกนอกบ้าน (Out of Zone)</span>';
    }
}

function parseGPS(gpsString) {
    if (!gpsString || gpsString === "No Fix" || gpsString.includes("No Fix")) return null;

    if (gpsString.startsWith("LBS:")) {
        let lbsClean = gpsString.replace("LBS:", "").trim();
        const parts = lbsClean.split(',');
        if (parts.length >= 3) {
            let lat = parseFloat(parts[1]);
            let lon = parseFloat(parts[2]);
            if (!isNaN(lat) && !isNaN(lon)) return { lat, lon, type: 'LBS' };
        }
        return null;
    }

    let cleanStr = gpsString.replace("GPS:", "").replace("+CGNSSINFO:", "").trim();
    const parts = cleanStr.split(',');

    let latVal = NaN, lonVal = NaN;

    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === 'N' || parts[i] === 'S') {
            latVal = parseFloat(parts[i - 1]);
            if (parts[i] === 'S') latVal = -latVal;
        }
        if (parts[i] === 'E' || parts[i] === 'W') {
            lonVal = parseFloat(parts[i - 1]);
            if (parts[i] === 'W') lonVal = -lonVal;
        }
    }

    if (!isNaN(latVal) && !isNaN(lonVal) && Math.abs(latVal) <= 90 && Math.abs(lonVal) <= 180) {
        return { lat: latVal, lon: lonVal, type: 'GPS' };
    }

    if (parts.length >= 7) {
        let lat = parseFloat(parts[4]);
        let lon = parseFloat(parts[6]);
        if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            return { lat, lon, type: 'GPS' };
        }
    }

    return null;
}

// สร้างไอคอนหมุดตามประเภทพิกัด (GPS = เขียว 🛰️, LBS = ส้ม 📡)
function createDeviceIcon(type) {
    const isGps = (type === 'GPS');
    return L.divIcon({
        className: 'custom-device-icon',
        html: `<div style="background-color: ${isGps ? '#10b981' : '#f59e0b'}; width: 36px; height: 36px; border-radius: 50%; border: 3px solid #ffffff; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; box-shadow: 0 6px 15px rgba(0,0,0,0.4);">${isGps ? '🛰️' : '📡'}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
}

async function fetchFirebaseData() {
    try {
        const response = await fetch(FIREBASE_URL);
        const data = await response.json();
        
        if (data) {
            const keys = Object.keys(data);
            const latestKey = keys[keys.length - 1]; 
            const latestData = data[latestKey];

            document.getElementById('status-text').innerText = "ออนไลน์ (Online)";
            document.getElementById('last-update').innerText = "อัปเดตล่าสุด: " + new Date().toLocaleTimeString();

            // อุณหภูมิ
            const cardTemp = document.getElementById('card-temp');
            if (latestData.temperature !== undefined && latestData.temperature !== null) {
                document.getElementById('temp-val').innerText = latestData.temperature;
                cardTemp.classList.remove('hidden');
            } else {
                cardTemp.classList.add('hidden');
            }

            // ความชื้น
            const cardHum = document.getElementById('card-hum');
            if (latestData.humidity !== undefined && latestData.humidity !== null) {
                document.getElementById('hum-val').innerText = latestData.humidity;
                cardHum.classList.remove('hidden');
            } else {
                cardHum.classList.add('hidden');
            }

            // แบตเตอรี่
            const cardBatt = document.getElementById('card-batt');
            const battVal = latestData.battery !== undefined ? latestData.battery : (latestData.batt !== undefined ? latestData.batt : null);
            if (cardBatt && battVal !== null && battVal !== undefined) {
                document.getElementById('batt-val').innerText = battVal;
                cardBatt.classList.remove('hidden');
            } else if (cardBatt) {
                cardBatt.classList.add('hidden');
            }

            // GPS / LBS
            const cardGps = document.getElementById('card-gps');
            if (latestData.gps !== undefined && latestData.gps !== null) {
                cardGps.classList.remove('hidden');
                document.getElementById('gps-status').innerText = latestData.gps;

                const coords = parseGPS(latestData.gps);
                if (coords) {
                    lastDeviceCoords = coords;
                    
                    let typeText = coords.type === 'GPS' ? '🛰️ พิกัดดาวเทียม (แม่นยำสูง)' : '⚠️ 📡 พิกัดเสามือถือ LBS (ความแม่นยำต่ำ)';
                    document.getElementById('lat-lon-text').innerHTML = `Latitude: ${coords.lat.toFixed(6)}, Longitude: ${coords.lon.toFixed(6)} (<span class="${coords.type === 'GPS' ? 'text-emerald-400' : 'text-amber-400 font-bold'}">${coords.type}</span>)`;

                    let popupText = coords.type === 'GPS' ? "<b>🛰️ ตำแหน่งดาวเทียม GPS</b>" : "<b>📡 ตำแหน่งเสามือถือ LBS (ความแม่นยำต่ำ)</b>";
                    const currentIcon = createDeviceIcon(coords.type);

                    if (deviceMarker) {
                        deviceMarker.setLatLng([coords.lat, coords.lon]);
                        deviceMarker.setIcon(currentIcon);
                        deviceMarker.bindPopup(popupText);
                    } else {
                        deviceMarker = L.marker([coords.lat, coords.lon], { icon: currentIcon }).addTo(map)
                            .bindPopup(popupText).openPopup();
                    }
                    checkGeofence(coords);
                } else {
                    document.getElementById('lat-lon-text').innerText = "พิกัด Lat/Lon: รอสัญญาณดาวเทียม (No Fix)";
                }
            } else {
                cardGps.classList.add('hidden');
            }
        } else {
            document.getElementById('status-text').innerText = "ไม่พบข้อมูลในฐานข้อมูล";
        }
    } catch (error) {
        document.getElementById('status-text').innerText = "เชื่อมต่อฐานข้อมูลล้มเหลว";
    }
}

fetchHomeConfigFromFirebase();
fetchFirebaseData();
setInterval(fetchFirebaseData, 5000);
setInterval(fetchHomeConfigFromFirebase, 10000);

// ======================================================================
// 📊 ประวัติข้อมูลย้อนหลัง + แบตเตอรี่ + Side-by-Side Map
// ======================================================================
const PUSH_ID_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";

function decodePushIdTimestamp(pushId) {
    if (!pushId || pushId.length < 8) return null;
    let ms = 0;
    for (let i = 0; i < 8; i++) {
        const idx = PUSH_ID_CHARS.indexOf(pushId.charAt(i));
        if (idx === -1) return null;
        ms = ms * 64 + idx;
    }
    return ms;
}

let historyGroupedByDate = {};
let currentSelectedDateKey = null;
let historyInlineMap = null;
let historyInlineMarker = null;
let activeRowIndex = null;

async function fetchHistoryData() {
    const listEl = document.getElementById('history-date-list');
    listEl.innerHTML = '<div class="text-xs text-slate-400 text-center py-6">กำลังโหลดข้อมูล...</div>';

    try {
        const url = FIREBASE_URL.replace('.json', '.json?orderBy=%22$key%22&limitToLast=3000');
        const response = await fetch(url);
        const data = await response.json();

        historyGroupedByDate = {};

        if (data) {
            Object.keys(data).forEach((key) => {
                const entry = data[key];
                const ms = decodePushIdTimestamp(key);
                if (!ms) return;

                const dateObj = new Date(ms);
                const dateKey = dateObj.toLocaleDateString('th-TH', {
                    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
                });
                const timeStr = dateObj.toLocaleTimeString('th-TH', {
                    timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
                });

                const battVal = entry.battery !== undefined ? entry.battery : (entry.batt !== undefined ? entry.batt : '-');

                if (!historyGroupedByDate[dateKey]) historyGroupedByDate[dateKey] = [];
                historyGroupedByDate[dateKey].push({
                    time: timeStr,
                    rawTime: dateObj.toTimeString().substring(0, 8),
                    ms: ms,
                    temperature: (entry.temperature !== undefined && entry.temperature !== null) ? entry.temperature : '-',
                    humidity: (entry.humidity !== undefined && entry.humidity !== null) ? entry.humidity : '-',
                    battery: battVal,
                    gps: entry.gps || '-'
                });
            });
        }

        renderHistoryDateList();
    } catch (error) {
        listEl.innerHTML = '<div class="text-xs text-rose-400 text-center py-6">โหลดข้อมูลล้มเหลว กรุณาลองใหม่</div>';
    }
}

function renderHistoryDateList() {
    const listEl = document.getElementById('history-date-list');
    const dates = Object.keys(historyGroupedByDate).sort(
        (a, b) => historyGroupedByDate[b][0].ms - historyGroupedByDate[a][0].ms
    );

    if (dates.length === 0) {
        listEl.innerHTML = '<div class="text-xs text-slate-400 text-center py-6">ยังไม่มีข้อมูลบันทึกไว้</div>';
        document.getElementById('history-day-content').innerHTML =
            '<div class="text-xs text-slate-400 text-center py-10">ไม่พบข้อมูล</div>';
        return;
    }

    listEl.innerHTML = '';
    dates.forEach((dateKey, idx) => {
        const count = historyGroupedByDate[dateKey].length;
        const btn = document.createElement('button');
        btn.className = 'history-date-btn w-full text-left text-xs px-3 py-2.5 rounded-xl transition font-medium border border-slate-700/50 hover:border-indigo-500 hover:bg-indigo-950/30 text-slate-300 mb-1.5';
        btn.innerHTML = `📅 ${dateKey}<span class="block text-slate-400 font-normal mt-0.5">${count} รายการ</span>`;
        btn.onclick = () => selectHistoryDate(dateKey, btn);
        listEl.appendChild(btn);
        if (idx === 0) selectHistoryDate(dateKey, btn);
    });
}

function selectHistoryDate(dateKey, btnEl) {
    currentSelectedDateKey = dateKey;
    activeRowIndex = null;
    document.querySelectorAll('.history-date-btn').forEach(b => {
        b.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-500');
    });
    if (btnEl) btnEl.classList.add('bg-indigo-600', 'text-white', 'border-indigo-500');

    renderHistoryTableContent();
}

function renderHistoryTableContent() {
    const contentEl = document.getElementById('history-day-content');
    const entries = (historyGroupedByDate[currentSelectedDateKey] || []).slice().sort((a, b) => a.ms - b.ms);

    if (entries.length === 0) {
        contentEl.innerHTML = '<div class="text-xs text-slate-400 text-center py-10">ไม่มีข้อมูลของวันนี้</div>';
        return;
    }

    const timeStart = document.getElementById('filter-time-start')?.value || "";
    const timeEnd = document.getElementById('filter-time-end')?.value || "";

    const filteredEntries = entries.filter(e => {
        if (timeStart && e.time < timeStart) return false;
        if (timeEnd && e.time > timeEnd) return false;
        return true;
    });

    const temps = filteredEntries.map(e => e.temperature).filter(v => typeof v === 'number');
    const hums = filteredEntries.map(e => e.humidity).filter(v => typeof v === 'number');
    const batts = filteredEntries.map(e => e.battery).filter(v => typeof v === 'number');

    const avgTemp = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : '-';
    const avgHum = hums.length ? (hums.reduce((a, b) => a + b, 0) / hums.length).toFixed(1) : '-';
    const latestBatt = batts.length ? batts[batts.length - 1] : (filteredEntries.length ? filteredEntries[filteredEntries.length - 1].battery : '-');

    let html = `
    <!-- แถบกรองช่วงเวลา -->
    <div class="bg-slate-900/60 border border-slate-800 rounded-xl p-3 mb-4 flex flex-wrap gap-3 items-center justify-between">
        <div class="flex items-center gap-2 text-xs flex-wrap">
            <span class="text-slate-300 font-semibold">⏰ กรองช่วงเวลา:</span>
            <input type="time" id="filter-time-start" value="${timeStart}" class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs">
            <span class="text-slate-400">ถึง</span>
            <input type="time" id="filter-time-end" value="${timeEnd}" class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs">
            <button onclick="renderHistoryTableContent()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg font-medium transition">กรอง</button>
            <button onclick="clearTimeFilter()" class="bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded-lg text-xs transition">ล้างค่า</button>
        </div>
        <div class="text-xs text-slate-400">แสดง: <span class="text-white font-bold">${filteredEntries.length}</span> / ${entries.length} รายการ</div>
    </div>

    <!-- สถิติย่อย -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div class="bg-slate-900/40 rounded-xl p-2.5 text-center">
            <p class="text-[10px] text-slate-400 uppercase tracking-wide">แบตเตอรี่ล่าสุด</p>
            <p class="text-base font-bold text-emerald-400">${latestBatt}${latestBatt !== '-' ? '%' : ''}</p>
        </div>
        <div class="bg-slate-900/40 rounded-xl p-2.5 text-center">
            <p class="text-[10px] text-slate-400 uppercase tracking-wide">อุณหภูมิเฉลี่ย</p>
            <p class="text-base font-bold text-white">${avgTemp}°C</p>
        </div>
        <div class="bg-slate-900/40 rounded-xl p-2.5 text-center">
            <p class="text-[10px] text-slate-400 uppercase tracking-wide">ความชื้นเฉลี่ย</p>
            <p class="text-base font-bold text-white">${avgHum}%</p>
        </div>
        <div class="bg-slate-900/40 rounded-xl p-2.5 text-center">
            <p class="text-[10px] text-slate-400 uppercase tracking-wide">รายการหลังกรอง</p>
            <p class="text-base font-bold text-white">${filteredEntries.length}</p>
        </div>
    </div>

    <!-- โครงสร้าง Side-by-Side -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        <!-- ซ้าย: ตารางข้อมูล -->
        <div class="lg:col-span-7 bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
            <div class="max-h-[360px] overflow-y-auto">
                <table class="w-full text-xs">
                    <thead class="sticky top-0 bg-slate-900 z-10 border-b border-slate-800">
                        <tr class="text-left text-slate-400">
                            <th class="py-2.5 px-3 font-semibold">เวลา</th>
                            <th class="py-2.5 px-3 font-semibold">แบต</th>
                            <th class="py-2.5 px-3 font-semibold">อุณหภูมิ</th>
                            <th class="py-2.5 px-3 font-semibold">ความชื้น</th>
                            <th class="py-2.5 px-3 font-semibold">สถานะ / พิกัด</th>
                        </tr>
                    </thead>
                    <tbody>`;

    if (filteredEntries.length === 0) {
        html += `<tr><td colspan="5" class="text-center py-8 text-slate-400">ไม่พบข้อมูลในช่วงเวลาที่กำหนด</td></tr>`;
    } else {
        filteredEntries.forEach((e, idx) => {
            const hasValidCoords = parseGPS(e.gps) !== null;
            const isSelected = activeRowIndex === idx;
            
            let rowStyle = hasValidCoords ? 'cursor-pointer hover:bg-indigo-950/40 transition' : 'opacity-50';
            if (isSelected) {
                rowStyle += ' bg-indigo-900/60 border-l-4 border-indigo-400';
            }

            html += `
                <tr class="border-b border-slate-800/60 ${rowStyle}" ${hasValidCoords ? `onclick='selectHistoryRow(${idx}, ${JSON.stringify(JSON.stringify(e))})'` : ''}>
                    <td class="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">🕒 ${e.time}</td>
                    <td class="py-2.5 px-3 text-emerald-400 font-semibold whitespace-nowrap">${e.battery}${e.battery !== '-' ? '%' : ''}</td>
                    <td class="py-2.5 px-3 text-slate-300 whitespace-nowrap">${e.temperature}${e.temperature !== '-' ? '°C' : ''}</td>
                    <td class="py-2.5 px-3 text-slate-300 whitespace-nowrap">${e.humidity}${e.humidity !== '-' ? '%' : ''}</td>
                    <td class="py-2.5 px-3 text-slate-400 truncate max-w-[130px]">${e.gps}</td>
                </tr>`;
        });
    }

    html += `
                    </tbody>
                </table>
            </div>
            <div class="p-2 bg-slate-950/40 text-[11px] text-slate-400 text-center border-t border-slate-800">
                💡 คลิกที่แถวข้อมูลในตารางเพื่อดูตำแหน่งบนแผนที่ด้านข้าง
            </div>
        </div>

        <!-- ขวา: แผนที่แสดงตำแหน่งย้อนหลังด้านข้าง -->
        <div class="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-3 flex flex-col gap-3">
            <div class="flex items-center justify-between">
                <h4 class="text-xs font-bold text-white flex items-center gap-1.5">🗺️ ตำแหน่งอุปกรณ์บนแผนที่</h4>
                <span id="side-map-time-label" class="text-[11px] text-indigo-400 font-mono font-semibold">ยังไม่ได้เลือกรายการ</span>
            </div>
            
            <div id="inline-history-map" class="w-full h-64 lg:h-[300px] rounded-xl border border-slate-700/50 overflow-hidden relative z-0"></div>
            
            <div id="inline-history-info" class="text-[11px] text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 font-mono">
                กรุณาคลิกเลือกแถวข้อมูลด้านซ้ายเพื่อดูพิกัด
            </div>
        </div>

    </div>`;

    contentEl.innerHTML = html;

    if (filteredEntries.length > 0) {
        const firstValidIdx = filteredEntries.findIndex(e => parseGPS(e.gps) !== null);
        if (firstValidIdx !== -1) {
            selectHistoryRow(firstValidIdx, JSON.stringify(filteredEntries[firstValidIdx]));
        }
    }
}

function clearTimeFilter() {
    const startInput = document.getElementById('filter-time-start');
    const endInput = document.getElementById('filter-time-end');
    if (startInput) startInput.value = "";
    if (endInput) endInput.value = "";
    renderHistoryTableContent();
}

function selectHistoryRow(index, entryJsonStr) {
    activeRowIndex = index;
    const entry = typeof entryJsonStr === 'string' ? JSON.parse(entryJsonStr) : entryJsonStr;
    const coords = parseGPS(entry.gps);

    const rows = document.querySelectorAll('#history-day-content tbody tr');
    rows.forEach((r, idx) => {
        if (idx === index) {
            r.classList.add('bg-indigo-900/60', 'border-l-4', 'border-indigo-400');
        } else {
            r.classList.remove('bg-indigo-900/60', 'border-l-4', 'border-indigo-400');
        }
    });

    const timeLabel = document.getElementById('side-map-time-label');
    if (timeLabel) timeLabel.innerText = `เวลา ${entry.time}`;

    const infoEl = document.getElementById('inline-history-info');
    if (infoEl) {
        infoEl.innerHTML = `
            <div>📅 วันที่: <span class="text-white">${currentSelectedDateKey}</span> | ⏰ <span class="text-white">${entry.time}</span></div>
            <div class="mt-1">🔋 แบต: <span class="text-emerald-400 font-bold">${entry.battery}%</span> | 🌡️ อุณหภูมิ: <span class="text-white">${entry.temperature}°C</span></div>
            <div class="mt-1 truncate">📍 พิกัด: <span class="${coords && coords.type === 'GPS' ? 'text-emerald-300' : 'text-amber-300 font-bold'}">${coords ? `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)} (${coords.type})` : 'ไม่มีพิกัด'}</span></div>
        `;
    }

    setTimeout(() => {
        const mapContainer = document.getElementById('inline-history-map');
        if (!mapContainer) return;

        if (!historyInlineMap) {
            historyInlineMap = L.map('inline-history-map', { zoomControl: true });
            L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                maxZoom: 21, subdomains: GOOGLE_SUBDOMAINS, attribution: GOOGLE_ATTRIBUTION
            }).addTo(historyInlineMap);
        } else {
            historyInlineMap.invalidateSize();
        }

        if (coords) {
            historyInlineMap.setView([coords.lat, coords.lon], 18);
            const historyIcon = createDeviceIcon(coords.type);
            
            if (historyInlineMarker) {
                historyInlineMarker.setLatLng([coords.lat, coords.lon]);
                historyInlineMarker.setIcon(historyIcon);
            } else {
                historyInlineMarker = L.marker([coords.lat, coords.lon], { icon: historyIcon }).addTo(historyInlineMap);
            }
            historyInlineMarker.bindPopup(`<b>⏰ ${entry.time}</b><br>${coords.type}`).openPopup();
        }
    }, 100);
}

function openHistoryModal() {
    const modal = document.getElementById('history-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    fetchHistoryData();
}

function closeHistoryModal() {
    const modal = document.getElementById('history-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    historyInlineMap = null;
}

document.getElementById('history-modal').addEventListener('click', function (e) {
    if (e.target === this) closeHistoryModal();
});