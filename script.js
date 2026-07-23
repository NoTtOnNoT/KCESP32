// ค่าพิกัดเริ่มต้นบ้าน (ค่าเริ่มต้นกลางกรุงเทพฯ หรือคุณสามารถกดดึงจากมือถือได้ทันที)
let homeLat = 13.746538;
let homeLon = 100.539426;
let safeRadius = 50; // เมตร
let isPickingMode = false;
let isFirstGpsFix = true; // สำหรับซูมเข้าตำแหน่งมือถือครั้งแรก

// สร้างแผนที่แบบโปร (รองรับการสลับระหว่างแผนที่ถนนสมจริง และภาพถ่ายดาวเทียม)
const voyagerLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
});

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri'
});

const map = L.map('map', {
    center: [homeLat, homeLon],
    zoom: 17,
    zoomControl: false,
    layers: [voyagerLayer]
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

const baseMaps = {
    "🌐 แผนที่ถนน (Modern)": voyagerLayer,
    "🛰️ ภาพถ่ายดาวเทียม (Satellite)": satelliteLayer
};
L.control.layers(baseMaps, null, { position: 'topleft' }).addTo(map);

// สร้างหมุดบ้าน (ลากย้ายได้)
let homeMarker = L.marker([homeLat, homeLon], { draggable: true }).addTo(map)
    .bindPopup("<b>🏠 บ้าน (ศูนย์กลาง)</b><br>ลากหมุดนี้เพื่อเปลี่ยนตำแหน่งบ้านได้");

// สร้างวงกลมขอบเขตปลอดภัย
let geofenceCircle = L.circle([homeLat, homeLon], {
    color: '#0d6efd',
    fillColor: '#0d6efd',
    fillOpacity: 0.18,
    weight: 2,
    radius: safeRadius
}).addTo(map);

// สร้างหมุดตัวแทนผู้ป่วย (มือถือจริง) สีแดง
const patientIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.x-png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

let patientMarker = L.marker([homeLat, homeLon], { icon: patientIcon }).addTo(map)
    .bindPopup("<b>📍 ตำแหน่ง GPS มือถือของคุณ</b>");

// กำหนดค่าเริ่มต้นในฟอร์ม
document.getElementById('home-lat').value = homeLat;
document.getElementById('home-lon').value = homeLon;
document.getElementById('safe-radius').value = safeRadius;

// ฟังก์ชันคำนวณระยะทาง (Haversine Formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // เมตร
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ควบคุมการเปิด-ปิดหน้าต่าง Slide Panel
const settingsPanel = document.getElementById('settings-panel');
const infoPanel = document.getElementById('info-panel');

document.getElementById('toggle-settings').addEventListener('click', () => {
    settingsPanel.classList.toggle('active');
    infoPanel.classList.remove('active');
});
document.getElementById('close-settings').addEventListener('click', () => settingsPanel.classList.remove('active'));

document.getElementById('toggle-info').addEventListener('click', () => {
    infoPanel.classList.toggle('active');
    settingsPanel.classList.remove('active');
});
document.getElementById('close-info').addEventListener('click', () => infoPanel.classList.remove('active'));

// อัปเดตพิกัดบ้านเมื่อลากหมุด
homeMarker.on('dragend', function (e) {
    const pos = homeMarker.getLatLng();
    updateHomeCoordinates(pos.lat, pos.lng);
});

function updateHomeCoordinates(lat, lon) {
    homeLat = lat;
    homeLon = lon;
    document.getElementById('home-lat').value = homeLat.toFixed(6);
    document.getElementById('home-lon').value = homeLon.toFixed(6);
    homeMarker.setLatLng([homeLat, homeLon]);
    geofenceCircle.setLatLng([homeLat, homeLon]);
}

// บันทึกฟอร์มตั้งค่า
document.getElementById('geofence-form').addEventListener('submit', function (e) {
    e.preventDefault();
    const newLat = parseFloat(document.getElementById('home-lat').value);
    const newLon = parseFloat(document.getElementById('home-lon').value);
    safeRadius = parseFloat(document.getElementById('safe-radius').value);

    updateHomeCoordinates(newLat, newLon);
    geofenceCircle.setRadius(safeRadius);
    map.setView([homeLat, homeLon], 17);
    settingsPanel.classList.remove('active');
});

// ดึงพิกัดปัจจุบันตั้งเป็นบ้าน
document.getElementById('btn-get-location').addEventListener('click', function() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                updateHomeCoordinates(lat, lon);
                map.setView([lat, lon], 18);
                alert("📍 ตั้งค่าตำแหน่งปัจจุบันของคุณเป็นพิกัดบ้านเรียบร้อยแล้ว!");
            },
            (error) => {
                alert("ไม่สามารถดึงพิกัดได้: กรุณาอนุญาตการเข้าถึงตำแหน่ง GPS");
            },
            { enableHighAccuracy: true }
        );
    } else {
        alert("เบราว์เซอร์ไม่รองรับ Geolocation");
    }
});

// โหมดคลิกปักหมุดบ้านจากแผนที่
document.getElementById('btn-pick-map').addEventListener('click', function() {
    isPickingMode = true;
    settingsPanel.classList.remove('active');
    document.getElementById('picking-banner').style.display = 'block';
    map.getContainer().style.cursor = 'crosshair';
});

document.getElementById('cancel-pick').addEventListener('click', exitPickingMode);

function exitPickingMode() {
    isPickingMode = false;
    document.getElementById('picking-banner').style.display = 'none';
    map.getContainer().style.cursor = '';
}

map.on('click', function(e) {
    if (isPickingMode) {
        updateHomeCoordinates(e.latlng.lat, e.latlng.lng);
        exitPickingMode();
        settingsPanel.classList.add('active');
        alert("✅ ปักหมุดตำแหน่งบ้านใหม่สำเร็จ!");
    }
});

// ==========================================
// ส่วนดึง GPS จริงจากมือถือแบบเรียลไทม์ (Real Device Tracking)
// ==========================================
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        (position) => {
            const currentLat = position.coords.latitude;
            const currentLon = position.coords.longitude;

            // อัปเดตตำแหน่งหมุดมือถือบนแผนที่
            patientMarker.setLatLng([currentLat, currentLon]);

            // ซูมไปยังตำแหน่งมือถือในครั้งแรกที่จับพิกัดได้
            if (isFirstGpsFix) {
                map.setView([currentLat, currentLon], 17);
                // ตั้งค่าเริ่มต้นบ้านให้อยู่จุดเดียวกับมือถือก่อนในรอบแรก (เพื่อให้เทสง่าย)
                updateHomeCoordinates(currentLat, currentLon);
                isFirstGpsFix = false;
            }

            // คำนวณระยะห่างจากบ้าน
            let dist = calculateDistance(homeLat, homeLon, currentLat, currentLon);

            // แสดงผลบนหน้าจอแผงข้อมูล
            document.getElementById('patient-coords').innerText = `${currentLat.toFixed(5)}, ${currentLon.toFixed(5)}`;
            document.getElementById('distance-text').innerText = `${dist.toFixed(1)} เมตร`;

            // อัปเดตสถานะแจ้งเตือนด้านบน
            const statusText = document.getElementById('status-text');
            const statusDot = document.getElementById('status-dot');
            const pill = document.getElementById('system-status-pill');

            if (dist > safeRadius) {
                statusText.innerText = `🚨 เตือน! ออกนอกขอบเขต (${dist.toFixed(0)}ม.)`;
                statusDot.className = "status-dot bg-danger";
                pill.style.borderColor = "#dc3545";
            } else {
                statusText.innerText = "ปกติ: มือถืออยู่ในพื้นที่ปลอดภัย";
                statusDot.className = "status-dot bg-success";
                pill.style.borderColor = "rgba(0,0,0,0.08)";
            }
        },
        (error) => {
            console.error("GPS Error:", error);
            document.getElementById('status-text').innerText = "❌ ไม่สามารถเข้าถึง GPS มือถือได้";
            document.getElementById('gps-status-badge').className = "badge bg-danger px-3 py-2 rounded-pill";
            document.getElementById('gps-status-badge').innerText = "GPS ผิดพลาด/ไม่อนุญาต";
        },
        {
            enableHighAccuracy: true, // เปิดความแม่นยำสูง (ใช้ GPS ฮาร์ดแวร์มือถือ)
            maximumAge: 0,            // ไม่ใช้ค่าเก่า
            timeout: 10000
        }
    );
} else {
    alert("เบราว์เซอร์ของคุณไม่รองรับการติดตาม GPS แบบเรียลไทม์");
}