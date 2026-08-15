# GeoBelt Dashboard v2

## สิ่งที่เปลี่ยน
- ประวัติใหม่ใช้ `/history/<deviceId>/<YYYY-MM-DD>/...`
- หน้าเว็บโหลด "รายชื่อวัน" แบบ `shallow=true` แล้วโหลดเฉพาะวันเมื่อกด
- ไม่มี `limitToLast=3000` ครอบประวัติทั้งหมดอีกแล้ว
- รองรับ schema ใหม่ของ ESP32 (`location`, `network`, `battery.modem_percent`)
- อ่านข้อมูลเก่าจาก `/esp32_telemetry` แบบแบ่งหน้า 1,000 รายการได้
- Export CSV
- แสดงเส้นทางย้อนหลัง
- Filter เวลา + แหล่งพิกัด
- แสดง Accuracy, stale/Last Known, Wi-Fi/4G, SOS
- Browser notifications
- ไม่ฝัง Telegram Bot Token ใน frontend

## ไฟล์ที่ต้องคงไว้จากเว็บไซต์เดิม
เว็บไซต์นี้ยังอ้างถึง:
- `auth.js`
- `login.html`

ให้นำไฟล์เดิมของคุณมาไว้โฟลเดอร์เดียวกับ `index.html`

## Telegram
Bot token เดิมไม่ควรอยู่ใน `app.js` เพราะผู้ใช้เว็บเปิด DevTools แล้วเห็น token ได้
Dashboard v2 จะสร้าง alert event ที่ `/alerts/<deviceId>` แทน
ถ้าต้องการส่ง Telegram ให้ใช้ backend / Cloud Function อ่าน event แล้วส่งข้อความ

## Firebase structure
```
history/
  CT-xxxx/
    2026-08-15/
      -pushid/
        ...

alerts/
  CT-xxxx/
    -pushid/
      ...
```


## v2.1 - exact board display
Dashboard now maps fields exactly from `GeoBeltTracker.ino`:

- `battery.modem_percent`
- `network.wifi_connected`
- `network.wifi_ssid`
- `network.wifi_rssi_dbm`
- `network.cellular_ready`
- `location.valid`
- `location.source`
- `location.stale`
- `location.lat`
- `location.lng`
- `location.accuracy_m`
- `location.age_ms`
- `location.satellites`
- `nearby_wifi`
- `sos`
- `uptime_ms`
- `timestamp`
- `timestamp_iso`
- `history_date`

It also supports `unknown-date` if the ESP32/modem clock has not been set.
