// กำหนด Firebase URL
const FIREBASE_URL = "https://kcesp32-default-rtdb.asia-southeast1.firebasedatabase.app/esp32_telemetry.json";

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

// ตั้งค่าตำแหน่งบ้านเริ่มต้นจาก localStorage
let homeLat = localStorage.getItem('home_lat') ? parseFloat(localStorage.getItem('home_lat')) : 6.632795;
let homeLon = localStorage.getItem('home_lon') ? parseFloat(localStorage.getItem('home_lon')) : 100.421219;
let homeRadius = localStorage.getItem('home_radius') ? parseFloat(localStorage.getItem('home_radius')) : 100; // เมตร
let isSettingHomeMode = false; // ตัวแปรสถานะเปิด/ปิดโหมดคลิกแผนที่

// แสดงค่ารัศมีในฟอร์ม
document.getElementById('input-home-radius').value = homeRadius;

// เริ่มต้นแผนที่ Leaflet
let map = L.map('map').setView([homeLat, homeLon], 16);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let deviceMarker = null;
let homeMarker = null;
let homeCircle = null;
let lastDeviceCoords = null;

// ไอคอนบ้านสีม่วง
const homeIcon = L.divIcon({
    className: 'custom-home-icon',
    html: '<div style="background-color: #8b5cf6; width: 34px; height: 34px; border-radius: 50%; border: 3px solid #ffffff; display: flex; align-items: center; justify-content: center; color: white; font-size: 15px; box-shadow: 0 6px 15px rgba(139, 92, 246, 0.5);">🏠</div>',
    iconSize: [34, 34],
    iconAnchor: [17, 17]
});

// ฟังก์ชันเพิ่มข้อความลงใน Activity Log
function addLog(message) {
    const logBox = document.getElementById('activity-log');
    const timeStr = new Date().toLocaleTimeString();
    const logItem = document.createElement('div');
    logItem.innerHTML = `<span class="text-slate-500">[${timeStr}]</span> ${message}`;
    logBox.prepend(logItem);
}

// อัปเดตตำแหน่งบ้านและวงกลมรัศมีบนแผนที่
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
}
updateHomeOnMap();

// ฟังก์ชันสลับโหมดเปิด/ปิดการคลิกแผนที่เพื่อปักหมุดบ้าน
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
        mapEl.classList.add('map-selecting');
        addLog("เปิดโหมดเลือกพิกัดบ้านจากแผนที่แล้ว");
    } else {
        btn.classList.remove('bg-purple-600', 'hover:bg-purple-700', 'text-white', 'border-purple-500', 'ring-2', 'ring-purple-400');
        btn.classList.add('bg-slate-700', 'hover:bg-slate-600', 'border-slate-600');
        btn.innerHTML = '🖱️ คลิกเลือกจากแมพ';
        instruction.classList.add('hidden');
        mapEl.classList.remove('map-selecting');
        addLog("ปิดโหมดเลือกพิกัดบ้านจากแผนที่แล้ว");
    }
}

// เหตุการณ์คลิกบนแผนที่ (ทำงานเฉพาะตอนเปิดโหมดแก้ไขเท่านั้น)
map.on('click', function(e) {
    if (!isSettingHomeMode) return;

    homeLat = e.latlng.lat;
    homeLon = e.latlng.lng;

    localStorage.setItem('home_lat', homeLat);
    localStorage.setItem('home_lon', homeLon);

    updateHomeOnMap();
    addLog(`ปักหมุดบ้านใหม่สำเร็จ: ${homeLat.toFixed(6)}, ${homeLon.toFixed(6)}`);

    if (lastDeviceCoords) {
        checkGeofence(lastDeviceCoords);
    }

    toggleMapSelectMode(false);
});

// บันทึกการตั้งค่ารัศมีบ้าน
function saveHomeSettings() {
    homeRadius = parseFloat(document.getElementById('input-home-radius').value);

    if (isNaN(homeRadius) || homeRadius <= 0) {
        alert("กรุณากรอกตัวเลขรัศมีให้ถูกต้อง");
        return;
    }

    localStorage.setItem('home_radius', homeRadius);
    updateHomeOnMap();
    addLog(`อัปเดตรัศมีบ้านเป็น ${homeRadius} เมตร`);
    alert("บันทึกรัศมีบ้านเรียบร้อยแล้ว!");
    if (lastDeviceCoords) checkGeofence(lastDeviceCoords);
}

// ตั้งค่าพิกัดบ้านด้วยตำแหน่งปัจจุบันของอุปกรณ์
function useCurrentAsHome() {
    if (!lastDeviceCoords) {
        alert("ยังไม่ได้รับพิกัดปัจจุบันจากอุปกรณ์ กรุณารอสักครู่");
        return;
    }
    homeLat = lastDeviceCoords.lat;
    homeLon = lastDeviceCoords.lon;

    localStorage.setItem('home_lat', homeLat);
    localStorage.setItem('home_lon', homeLon);

    updateHomeOnMap();
    addLog("ตั้งค่าพิกัดบ้านด้วยตำแหน่งปัจจุบันของอุปกรณ์สำเร็จ");
    alert("ย้ายตำแหน่งบ้านมายังพิกัดปัจจุบันเรียบร้อยแล้ว!");
    checkGeofence(lastDeviceCoords);
}

// ฟังก์ชันคัดลอกพิกัด
function copyCoordinates() {
    if (!lastDeviceCoords) {
        alert("ยังไม่มีข้อมูลพิกัดอุปกรณ์");
        return;
    }
    const text = `${lastDeviceCoords.lat}, ${lastDeviceCoords.lon}`;
    navigator.clipboard.writeText(text).then(() => {
        alert("คัดลอกพิกัดเรียบร้อย: " + text);
        addLog("คัดลอกพิกัดลงคลิปบอร์ด");
    });
}

// ซูมไปที่ตำแหน่งอุปกรณ์
function centerToDevice() {
    if (lastDeviceCoords) {
        map.setView([lastDeviceCoords.lat, lastDeviceCoords.lon], 17);
    } else {
        alert("ยังไม่พบตำแหน่งพิกัดจากอุปกรณ์");
    }
}

// ตรวจสอบระยะห่าง Geofence
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

// 🛠️ ฟังก์ชันแปลงสตริง GPS และ LBS ที่ปรับปรุงใหม่ให้แม่นยำ ตรงกับ Google Earth 100%
// 🛠️ ฟังก์ชันแปลงสตริง GPS และ LBS ที่ปรับปรุงใหม่ให้ตรงเป๊ะกับ AT+CGNSSINFO ของ A7672E
function parseGPS(gpsString) {
    if (!gpsString || gpsString === "No Fix" || gpsString.includes("No Fix")) return null;

    // 1. รองรับรูปแบบ LBS (เช่น LBS:0,6.632448,100.422928,550)
    if (gpsString.startsWith("LBS:")) {
        let lbsClean = gpsString.replace("LBS:", "").trim();
        const parts = lbsClean.split(',');
        if (parts.length >= 3) {
            let lat = parseFloat(parts[1]);
            let lon = parseFloat(parts[2]);
            if (!isNaN(lat) && !isNaN(lon)) {
                return { lat, lon, type: 'LBS' };
            }
        }
        return null;
    }

    // 2. ทำความสะอาดข้อความจาก AT+CGNSSINFO
    let cleanStr = gpsString.replace("GPS:", "").replace("+CGNSSINFO:", "").trim();
    const parts = cleanStr.split(',');

    // รูปแบบมาตรฐานของ AT+CGNSSINFO: 
    // [0]=mode, [1]=satellites, [2]=..., [3]=..., [4]=Latitude, [5]=NS, [6]=Longitude, [7]=EW
    // ตัวอย่าง: 3,19,16,11,6.6328139,N,100.4212036,E,250604...
    
    // ตรวจสอบว่าเป็นรูปแบบที่มีทิศทาง N/S และ E/W กำกับชัดเจนหรือไม่
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

    // ถ้าเจอทิศทางและแปลงค่าได้ถูกต้อง คืนค่าทันที
    if (!isNaN(latVal) && !isNaN(lonVal) && Math.abs(latVal) <= 90 && Math.abs(lonVal) <= 180) {
        return { lat: latVal, lon: lonVal, type: 'GPS' };
    }

    // 3. กรณีสำรอง: ถ้าไม่มีตัวอักษร N/S แต่อยู่ในตำแหน่งช่องที่ 4 และ 6 ตายตัวของ AT+CGNSSINFO
    if (parts.length >= 7) {
        let lat = parseFloat(parts[4]);
        let lon = parseFloat(parts[6]);
        if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            return { lat, lon, type: 'GPS' };
        }
    }

    return null;
}

// ดึงข้อมูลจาก Firebase
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

            // 1. อุณหภูมิ
            const cardTemp = document.getElementById('card-temp');
            if (latestData.temperature !== undefined && latestData.temperature !== null) {
                document.getElementById('temp-val').innerText = latestData.temperature;
                cardTemp.classList.remove('hidden');
            } else {
                cardTemp.classList.add('hidden');
            }

            // 2. ความชื้น
            const cardHum = document.getElementById('card-hum');
            if (latestData.humidity !== undefined && latestData.humidity !== null) {
                document.getElementById('hum-val').innerText = latestData.humidity;
                cardHum.classList.remove('hidden');
            } else {
                cardHum.classList.add('hidden');
            }

            // 3. GPS / LBS
            const cardGps = document.getElementById('card-gps');
            if (latestData.gps !== undefined && latestData.gps !== null) {
                cardGps.classList.remove('hidden');
                document.getElementById('gps-status').innerText = latestData.gps;

                const coords = parseGPS(latestData.gps);
                if (coords) {
                    lastDeviceCoords = coords;
                    document.getElementById('lat-lon-text').innerText = `Latitude: ${coords.lat.toFixed(6)}, Longitude: ${coords.lon.toFixed(6)} (${coords.type})`;

                    let popupText = coords.type === 'GPS' ? "<b>🛰️ ตำแหน่งดาวเทียม GPS</b>" : "<b>📡 ตำแหน่งเสามือถือ LBS</b>";

                    if (deviceMarker) {
                        deviceMarker.setLatLng([coords.lat, coords.lon]);
                        deviceMarker.bindPopup(popupText);
                    } else {
                        deviceMarker = L.marker([coords.lat, coords.lon]).addTo(map)
                            .bindPopup(popupText).openPopup();
                        addLog(`พบพิกัดอุปกรณ์บนแผนที่ครั้งแรก (${coords.type})`);
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
        console.error("Error fetching data:", error);
        document.getElementById('status-text').innerText = "เชื่อมต่อฐานข้อมูลล้มเหลว";
    }
}

// โหลดข้อมูลทันทีและรีเฟรชทุกๆ 5 วินาที
fetchFirebaseData();
setInterval(fetchFirebaseData, 5000);