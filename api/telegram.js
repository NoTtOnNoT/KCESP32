// GeoBelt Vercel Telegram endpoint
// Environment variables required:
// TELEGRAM_BOT_TOKEN
// TELEGRAM_CHAT_ID

function finiteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeText(v, fallback = '-') {
  const s = String(v ?? '').trim();
  return s || fallback;
}

function formatAlert(body) {
  const type = safeText(body.type, 'ALERT').toUpperCase();
  const deviceId = safeText(body.deviceId || body.device_id, 'Unknown device');
  const lat = finiteNumber(body.lat);
  const lng = finiteNumber(body.lng);
  const distance = finiteNumber(body.distance_m);
  const battery = finiteNumber(body.battery_percent);
  const accuracy = finiteNumber(body.accuracy_m);
  const source = safeText(body.location_source, 'UNKNOWN');

  const titleMap = {
    GEOFENCE_OUT: '🚨 ออกนอกขอบเขตบ้าน',
    GEOFENCE_IN: '🏠 กลับเข้าสู่ขอบเขตบ้าน',
    DEVICE_OFFLINE: '📴 อุปกรณ์ออฟไลน์',
    DEVICE_ONLINE: '🟢 อุปกรณ์กลับมาออนไลน์',
    LOW_BATTERY: '🔋 แบตเตอรี่ต่ำ',
    CRITICAL_BATTERY: '🪫 แบตเตอรี่ใกล้หมด',
    SOS: '🆘 SOS',
    TEST: '🧪 ทดสอบการแจ้งเตือน'
  };

  const lines = [
    titleMap[type] || `⚠️ ${type}`,
    `อุปกรณ์: ${deviceId}`
  ];

  if (distance !== null) lines.push(`ห่างจากบ้าน: ${Math.round(distance)} เมตร`);
  if (battery !== null) lines.push(`แบตเตอรี่: ${Math.round(battery)}%`);
  if (lat !== null && lng !== null) {
    lines.push(`พิกัด: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    lines.push(`แหล่งพิกัด: ${source}`);
    if (accuracy !== null) lines.push(`ความแม่นยำ: ±${Math.round(accuracy)} เมตร`);
    lines.push(`Google Maps: https://www.google.com/maps?q=${lat},${lng}`);
  }

  const when = finiteNumber(body.created_at || body.timestamp_ms);
  if (when !== null) {
    try {
      lines.push(
        `เวลา: ${new Date(when).toLocaleString('th-TH', {
          timeZone: 'Asia/Bangkok'
        })}`
      );
    } catch {}
  }

  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({
      ok: false,
      error: 'Telegram environment variables are not configured'
    });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const text = formatAlert(body);

  try {
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true
      })
    });

    const data = await tg.json();

    if (!tg.ok || !data.ok) {
      return res.status(502).json({
        ok: false,
        error: data?.description || `Telegram HTTP ${tg.status}`
      });
    }

    return res.status(200).json({
      ok: true,
      deviceId: body.deviceId || body.device_id || null,
      type: body.type || null
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e?.message || 'Telegram request failed'
    });
  }
}
