// กำหนด Firebase URL
const FIREBASE_URL = "https://kcesp32-default-rtdb.asia-southeast1.firebasedatabase.app/esp32_telemetry.json";
const FIREBASE_CONFIG_URL = "https://kcesp32-default-rtdb.asia-southeast1.firebasedatabase.app/home_config.json";

// ===================== ตั้งค่า Telegram Bot =====================
const TELEGRAM_BOT_TOKEN = "8839107909:AAEw_v3RKagQYerl38WIRtmRYf0rc3oDVqY"; 
const TELEGRAM_CHAT_ID = "8530891463";                                      
let lastZoneState = null;                                                   
// ==============================================================

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
const GOOGLE_ATTRIBUTION = '© Google Maps';

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

// ฟังก์ชันอัปเดต UI แบตเตอรี่แบบเรียลไทม์
function updateBatteryUI(batteryPercent) {
    const battVal = document.getElementById('batt-val');
    const battBar = document.getElementById('batt-bar');
    const battCard = document.getElementById('card-batt');
    
    if (battVal && battBar) {
        battVal.innerText = batteryPercent;
        battBar.style.width = batteryPercent + '%';

        if (batteryPercent > 50) {
            battBar.className = "bg-emerald-500 h-2 rounded-full transition-all duration-500";
            if(battCard) battCard.style.borderLeftColor = "#10b981";
        } else if (batteryPercent > 20) {
            battBar.className = "bg-amber-500 h-2 rounded-full transition-all duration-500";
            if(battCard) battCard.style.borderLeftColor = "#f59e0b";
        } else {
            battBar.className = "bg-rose-500 h-2 rounded-full transition-all duration-500 animate-pulse";
            if(battCard) battCard.style.borderLeftColor = "#f43f5e";
        }
    }
}

// ฟังก์ชันส่งข้อความเข้า Telegram Bot
async function sendTelegramAlert(message) {
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === "YOUR_BOT_TOKEN_HERE" || 
        !TELEGRAM_CHAT_ID || TELEGRAM_CHAT_ID === "YOUR_CHAT_ID_HERE") {
        return; 
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
    };

    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        addLog("ส่งแจ้งเตือนเข้า Telegram สำเร็จ");
    } catch (error) {
        console.error("Telegram Error:", error);
    }
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

// ตรวจสอบ Geofence พร้อมระบบส่ง Telegram อัตโนมัติ (แก้ไขลิงก์ Google Maps)
function checkGeofence(coords) {
    const distance = map.distance([coords.lat, coords.lon], [homeLat, homeLon]);
    document.getElementById('distance-text').innerText = `ระยะห่างจากบ้าน: ${distance.toFixed(1)} เมตร`;

    const statusEl = document.getElementById('home-zone-status');
    const cardZone = document.getElementById('card-zone');
    cardZone.classList.remove('hidden');

    const currentState = (distance <= homeRadius) ? 'IN' : 'OUT';

    if (currentState === 'IN') {
        statusEl.innerHTML = '<span class="text-emerald-500 font-extrabold flex items-center gap-1">🏠 อยู่ในบ้าน (In Zone)</span>';
        
        if (lastZoneState === 'OUT') {
            sendTelegramAlert(`🏠 *แจ้งเตือน*: อุปกรณ์กลับเข้าสู่พื้นที่บ้านแล้ว!\n📍 ระยะห่าง: ${distance.toFixed(1)} เมตร`);
        }
    } else {
        statusEl.innerHTML = '<span class="text-amber-500 font-extrabold flex items-center gap-1">🚗 ออกนอกบ้าน (Out of Zone)</span>';
        
        if (lastZoneState === 'IN' || lastZoneState === null) {
            // Fix: ลิงก์ Google Maps ที่ถูกต้อง
            const mapsLink = `https://www.google.com/maps?q=${coords.lat},${coords.lon}`;
            const msg = `🚨 *แจ้งเตือนฉุกเฉิน!*\n🚗 อุปกรณ์ออกนอกพื้นที่บ้านแล้ว!\n📏 ระยะห่าง: ${distance.toFixed(1)} เมตร\n📍 พิกัด: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}\n🔗 [คลิกเปิดดูบน Google Maps](${mapsLink})`;
            sendTelegramAlert(msg);
        }
    }
    
    lastZoneState = currentState;
}

function parseGPS(gpsString) {
    if (!gpsString || gpsString === "No Fix" || gpsString.includes("No Fix")) return null;

    // เพิ่มการรองรับ Google Geolocation API (WiFi / Cell)
    if (gpsString.startsWith("GoogleAPI:")) {
        let cleanStr = gpsString.replace("GoogleAPI:", "").trim();
        const parts = cleanStr.split(',');
        if (parts.length >= 2) {
            let lat = parseFloat(parts[0]);
            let lon = parseFloat(parts[1]);
            if (!isNaN(lat) && !isNaN(lon)) return { lat, lon, type: 'GoogleAPI' };
        }
        return null;
    }

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

function createDeviceIcon(type) {
    let bgColor = '#f59e0b'; // สีส้มสำหรับ LBS (ค่าเริ่มต้น)
    let icon = '📡';

    if (type === 'GPS') {
        bgColor = '#10b981'; // สีเขียวสำหรับ GPS
        icon = '🛰️';
    } else if (type === 'GoogleAPI') {
        bgColor = '#3b82f6'; // สีฟ้าสำหรับ Google API (WiFi)
        icon = '📍';
    }

    return L.divIcon({
        className: 'custom-device-icon',
        html: `<div style="background-color: ${bgColor}; width: 36px; height: 36px; border-radius: 50%; border: 3px solid #ffffff; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; box-shadow: 0 6px 15px rgba(0,0,0,0.4);">${icon}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });
}

// ==============================================================
// 🌟 ดึงข้อมูล Real-time (รายการล่าสุด)
// ==============================================================
async function fetchFirebaseData() {
    try {
        const url = FIREBASE_URL.replace('.json', '.json?orderBy=%22$key%22&limitToLast=1');
        const response = await fetch(url);
        const data = await response.json();
        
        if (data && Object.keys(data).length > 0) {
            const latestKey = Object.keys(data)[0]; 
            const latestData = data[latestKey];

            document.getElementById('status-text').innerText = "ออนไลน์ (Online)";
            document.getElementById('last-update').innerText = "อัปเดตล่าสุด: " + new Date().toLocaleTimeString();

            // จัดการข้อมูลแบตเตอรี่จริง
            const cardBatt = document.getElementById('card-batt');
            const battVal = latestData.battery !== undefined ? latestData.battery : (latestData.batt !== undefined ? latestData.batt : null);
            if (cardBatt && battVal !== null && battVal !== undefined) {
                updateBatteryUI(parseInt(battVal));
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
                    
                    // ค้นหาบรรทัดนี้ในฟังก์ชัน fetchFirebaseData()
                    document.getElementById('lat-lon-text').innerHTML = `Latitude: ${coords.lat.toFixed(6)}, Longitude: ${coords.lon.toFixed(6)} (<span class="${coords.type === 'GPS' ? 'text-emerald-400' : (coords.type === 'GoogleAPI' ? 'text-blue-400 font-bold' : 'text-amber-400 font-bold')}">${coords.type}</span>)`;

                    let popupText = "<b>📡 ตำแหน่งเสามือถือ LBS (ความแม่นยำต่ำ)</b>";
                    if (coords.type === 'GPS') {
                        popupText = "<b>🛰️ ตำแหน่งดาวเทียม GPS</b>";
                    } else if (coords.type === 'GoogleAPI') {
                        popupText = "<b>📍 ตำแหน่งจากเครือข่าย WiFi (Google API)</b>";
                    }
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
        console.error("Firebase fetch error:", error);
    }
}

fetchHomeConfigFromFirebase();
fetchFirebaseData();
setInterval(fetchFirebaseData, 5000);
setInterval(fetchHomeConfigFromFirebase, 10000);

// ======================================================================
// 📊 ประวัติข้อมูลย้อนหลัง + Side-by-Side Map
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
let currentFilteredEntries = []; // ตัวแปรเก็บรายการหลังกรองไว้เรียกด้วย Index

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
                    battery: battVal,
                    gps: entry.gps || '-'
                });
            });
        }

        renderHistoryDateList();
    } catch (error) {
        listEl.innerHTML = '<div class="text-xs text-rose-400 text-center py-6">โหลดข้อมูลล้มเหลว กรุณาลองใหม่</div>';
        console.error("History fetch error:", error);
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

    currentFilteredEntries = entries.filter(e => {
        if (timeStart && e.time < timeStart) return false;
        if (timeEnd && e.time > timeEnd) return false;
        return true;
    });

    const batts = currentFilteredEntries.map(e => Number(e.battery)).filter(v => !isNaN(v));
    const latestBatt = batts.length ? batts[batts.length - 1] : (currentFilteredEntries.length ? currentFilteredEntries[currentFilteredEntries.length - 1].battery : '-');

    let html = `
    <div class="bg-slate-900/60 border border-slate-800 rounded-xl p-3 mb-4 flex flex-wrap gap-3 items-center justify-between">
        <div class="flex items-center gap-2 text-xs flex-wrap">
            <span class="text-slate-300 font-semibold">⏰ กรองช่วงเวลา:</span>
            <input type="time" id="filter-time-start" value="${timeStart}" class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs">
            <span class="text-slate-400">ถึง</span>
            <input type="time" id="filter-time-end" value="${timeEnd}" class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs">
            <button onclick="renderHistoryTableContent()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg font-medium transition">กรอง</button>
            <button onclick="clearTimeFilter()" class="bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded-lg text-xs transition">ล้างค่า</button>
        </div>
        <div class="text-xs text-slate-400">แสดง: <span class="text-white font-bold">${currentFilteredEntries.length}</span> / ${entries.length} รายการ</div>
    </div>

    <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="bg-slate-900/40 rounded-xl p-3 text-center border border-slate-800">
            <p class="text-[11px] text-slate-400 uppercase tracking-wide">แบตเตอรี่ล่าสุด</p>
            <p class="text-lg font-bold text-emerald-400 mt-1">${latestBatt}${latestBatt !== '-' ? '%' : ''}</p>
        </div>
        <div class="bg-slate-900/40 rounded-xl p-3 text-center border border-slate-800">
            <p class="text-[11px] text-slate-400 uppercase tracking-wide">รายการหลังกรอง</p>
            <p class="text-lg font-bold text-white mt-1">${currentFilteredEntries.length}</p>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        <div class="lg:col-span-7 bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
            <div class="max-h-[360px] overflow-y-auto">
                <table class="w-full text-xs">
                    <thead class="sticky top-0 bg-slate-900 z-10 border-b border-slate-800">
                        <tr class="text-left text-slate-400">
                            <th class="py-2.5 px-3 font-semibold">เวลา</th>
                            <th class="py-2.5 px-3 font-semibold">แบตเตอรี่</th>
                            <th class="py-2.5 px-3 font-semibold">สถานะ / พิกัด</th>
                        </tr>
                    </thead>
                    <tbody>`;

    if (currentFilteredEntries.length === 0) {
        html += `<tr><td colspan="3" class="text-center py-8 text-slate-400">ไม่พบข้อมูลในช่วงเวลาที่กำหนด</td></tr>`;
    } else {
        currentFilteredEntries.forEach((e, idx) => {
            const hasValidCoords = parseGPS(e.gps) !== null;
            const isSelected = activeRowIndex === idx;
            
            let rowStyle = hasValidCoords ? 'cursor-pointer hover:bg-indigo-950/40 transition' : 'opacity-50';
            if (isSelected) {
                rowStyle += ' bg-indigo-900/60 border-l-4 border-indigo-400';
            }

            // Fix: เรียกใช้ selectHistoryRow(idx) ผ่าน Index ป้องกันปัญหาสตริงหลุด
            html += `
                <tr class="border-b border-slate-800/60 ${rowStyle}" ${hasValidCoords ? `onclick="selectHistoryRow(${idx})"` : ''}>
                    <td class="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">🕒 ${e.time}</td>
                    <td class="py-2.5 px-3 text-emerald-400 font-semibold whitespace-nowrap">🔋 ${e.battery}${e.battery !== '-' ? '%' : ''}</td>
                    <td class="py-2.5 px-3 text-slate-400 truncate max-w-[180px]">${e.gps}</td>
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

    if (currentFilteredEntries.length > 0) {
        const firstValidIdx = currentFilteredEntries.findIndex(e => parseGPS(e.gps) !== null);
        if (firstValidIdx !== -1) {
            selectHistoryRow(firstValidIdx);
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

// Fix: รับค่าจาก Index ของ Array
function selectHistoryRow(index) {
    activeRowIndex = index;
    const entry = currentFilteredEntries[index];
    if (!entry) return;

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
        let coordStyle = 'text-amber-300 font-bold'; // LBS
        if (coords && coords.type === 'GPS') coordStyle = 'text-emerald-300';
        else if (coords && coords.type === 'GoogleAPI') coordStyle = 'text-blue-300 font-bold';

        infoEl.innerHTML = `
            <div>📅 วันที่: <span class="text-white">${currentSelectedDateKey}</span> | ⏰ <span class="text-white">${entry.time}</span></div>
            <div class="mt-1">🔋 แบตเตอรี่: <span class="text-emerald-400 font-bold">${entry.battery}%</span></div>
            <div class="mt-1 truncate">📍 พิกัด: <span class="${coordStyle}">${coords ? `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)} (${coords.type})` : 'ไม่มีพิกัด'}</span></div>
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

// Fix: ลบอินสแตนซ์ของแผนที่ทิ้งเมื่อปิด Modal ป้องกัน Leaflet Error
function closeHistoryModal() {
    const modal = document.getElementById('history-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    
    if (historyInlineMap) {
        historyInlineMap.remove();
        historyInlineMap = null;
    }
    historyInlineMarker = null;
}

document.getElementById('history-modal').addEventListener('click', function (e) {
    if (e.target === this) closeHistoryModal();
});