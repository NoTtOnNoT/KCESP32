// GeoBelt Vercel Telegram endpoint
// Environment variables required:
// TELEGRAM_BOT_TOKEN
// TELEGRAM_CHAT_ID

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeText(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function formatThaiTime(value) {
  const ms = finiteNumber(value);
  const date = ms !== null ? new Date(ms) : new Date();

  try {
    return date.toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch {
    return date.toISOString();
  }
}

function formatAlert(body) {
  const type = safeText(body.type, 'ALERT').toUpperCase();
  const deviceId = safeText(body.deviceId || body.device_id, 'ไม่ทราบอุปกรณ์');

  const lat = finiteNumber(body.lat);
  const lng = finiteNumber(body.lng);
  const distance_m = finiteNumber(body.distance_m);
  const battery = finiteNumber(body.battery_percent);
  const accuracy = finiteNumber(body.accuracy_m);
  const source = safeText(body.location_source, 'UNKNOWN');
  const ageSeconds = finiteNumber(body.age_seconds);

  const thaiTime = formatThaiTime(body.created_at || body.timestamp_ms);

  const titleMap = {
    GEOFENCE_OUT: '🚨 ออกจากขอบเขตบ้าน',
    GEOFENCE_IN: '🏠 กลับเข้าสู่ขอบเขตบ้าน',
    DEVICE_OFFLINE: '📴 อุปกรณ์ออฟไลน์',
    DEVICE_ONLINE: '🟢 อุปกรณ์กลับมาออนไลน์',
    LOW_BATTERY: '🔋 แบตเตอรี่ต่ำ',
    CRITICAL_BATTERY: '🪫 แบตเตอรี่ใกล้หมด',
    SOS: '🆘 แจ้งเตือน SOS',
    TEST: '🧪 ทดสอบการแจ้งเตือน'
  };

  const messageMap = {
    GEOFENCE_OUT: 'ตรวจพบว่าอุปกรณ์อยู่นอกขอบเขตบ้านที่กำหนด',
    GEOFENCE_IN: 'ตรวจพบว่าอุปกรณ์กลับเข้าสู่ขอบเขตบ้านแล้ว',
    DEVICE_OFFLINE: 'ไม่ได้รับข้อมูลใหม่จากอุปกรณ์ตามเวลาที่กำหนด',
    DEVICE_ONLINE: 'อุปกรณ์กลับมาเชื่อมต่อและส่งข้อมูลแล้ว',
    LOW_BATTERY: 'ระดับแบตเตอรี่ของอุปกรณ์อยู่ในระดับต่ำ',
    CRITICAL_BATTERY: 'ระดับแบตเตอรี่ของอุปกรณ์ต่ำมาก กรุณาตรวจสอบ',
    SOS: 'ได้รับสัญญาณขอความช่วยเหลือจากอุปกรณ์',
    TEST: 'ข้อความทดสอบระบบแจ้งเตือน GeoBelt'
  };

  const title = titleMap[type] || `⚠️ ${type}`;
  const message = safeText(body.message, messageMap[type] || 'มีเหตุการณ์ใหม่จาก GeoBelt');

  let text =
    `${title}\n\n` +
    `${message}\n\n` +
    `🧍🏼‍♂️ อุปกรณ์: ${deviceId}\n` +
    `🕑 เวลา: ${thaiTime}`;

  if (distance_m !== null) {
    text += `\n📏 ระยะจากบ้าน: ${Math.round(distance_m)} เมตร`;
  }

  if (battery !== null) {
    text += `\n🔋 แบตเตอรี่: ${Math.round(battery)}%`;
  }

  if (ageSeconds !== null && type === 'DEVICE_OFFLINE') {
    text += `\n⏱️ ไม่ได้รับข้อมูล: ${Math.round(ageSeconds)} วินาที`;
  }

  const hasLocation = lat !== null && lng !== null;

  if (hasLocation) {
    text +=
      `\n📍 พิกัด: ${lat.toFixed(6)}, ` +
      `${lng.toFixed(6)}`;

    if (source !== 'UNKNOWN') {
      text += `\n🛰️ แหล่งพิกัด: ${source}`;
    }

    if (accuracy !== null) {
      text += `\n🎯 ความแม่นยำ: ±${Math.round(accuracy)} เมตร`;
    }

  }

  return text;
}

function buildMapUrl(body) {
  const lat = finiteNumber(body.lat);
  const lng = finiteNumber(body.lng);

  if (lat === null || lng === null) return null;

  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({
      ok: false,
      error: 'Telegram environment variables are not configured'
    });
  }

  const body = req.body && typeof req.body === 'object'
    ? req.body
    : {};

  const text = formatAlert(body);

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
          ...(buildMapUrl(body)
            ? {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: '📍 เปิด Google Maps',
                        url: buildMapUrl(body)
                      }
                    ]
                  ]
                }
              }
            : {})
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.ok) {
      return res.status(502).json({
        ok: false,
        error: result?.description || `Telegram HTTP ${response.status}`
      });
    }

    return res.status(200).json({
      ok: true,
      deviceId: body.deviceId || body.device_id || null,
      type: body.type || null
    });

  } catch (error) {
    console.error('Telegram API error:', error);

    return res.status(500).json({
      ok: false,
      error: error?.message || 'Telegram request failed'
    });
  }
}
