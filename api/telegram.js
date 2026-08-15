export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return res.status(500).json({
        error: "Telegram environment variables are missing"
      });
    }

    const {
      type = "UNKNOWN",
      deviceId = "-",
      lat,
      lng,
      distance_m,
      battery
    } = req.body || {};

    let title = "GeoBelt แจ้งเตือน";
    let message = "";

    switch (type) {
      case "SOS":
        title = "🚨 SOS ฉุกเฉิน";
        message = "อุปกรณ์ส่งสัญญาณขอความช่วยเหลือ";
        break;

      case "GEOFENCE_OUT":
        title = "⚠️ ออกจากขอบเขตบ้าน";
        message = "อุปกรณ์ออกนอกพื้นที่ที่กำหนด";
        break;

      case "GEOFENCE_IN":
        title = "🏠 กลับเข้าสู่ขอบเขตบ้าน";
        message = "อุปกรณ์กลับเข้าสู่พื้นที่บ้านแล้ว";
        break;

      case "LOW_BATTERY":
        title = "🔋 แบตเตอรี่ต่ำ";
        message = `แบตเตอรี่เหลือ ${battery ?? "-"}%`;
        break;

      case "OFFLINE":
        title = "📴 อุปกรณ์ออฟไลน์";
        message = "ไม่ได้รับข้อมูลจากอุปกรณ์ตามเวลาที่กำหนด";
        break;

      case "ONLINE":
        title = "🟢 อุปกรณ์ออนไลน์";
        message = "อุปกรณ์กลับมาออนไลน์แล้ว";
        break;

      case "TEST":
        title = "✅ ทดสอบ Telegram";
        message = "ระบบแจ้งเตือน GeoBelt ทำงานสำเร็จ";
        break;

      default:
        message = `เหตุการณ์: ${type}`;
    }

    const thaiTime = new Date().toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      dateStyle: "medium",
      timeStyle: "medium"
    });

    let text =
      `${title}\n\n` +
      `${message}\n\n` +
      `🧍🏼‍♂️อุปกรณ์: ${deviceId}\n` +
      `🕑เวลา: ${thaiTime}`;

    if (distance_m != null) {
      text += `\n📏ระยะจากบ้าน: ${Math.round(Number(distance_m))} เมตร`;
    }

    const hasLocation =
      Number.isFinite(Number(lat)) &&
      Number.isFinite(Number(lng));

    if (hasLocation) {
      text +=
        `\n📍พิกัด: ${Number(lat).toFixed(6)}, ` +
        `${Number(lng).toFixed(6)}`;
    }

    const payload = {
      chat_id: chatId,
      text
    };

    if (hasLocation) {
      payload.reply_markup = {
        inline_keyboard: [
          [
            {
              text: "📍 เปิด Google Maps",
              url: `https://www.google.com/maps?q=${lat},${lng}`
            }
          ]
        ]
      };
    }

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const result = await telegramResponse.json();

    if (!telegramResponse.ok || !result.ok) {
      console.error(result);
      return res.status(500).json({
        ok: false,
        error: result.description || "Telegram error"
      });
    }

    return res.status(200).json({
      ok: true,
      messageId: result.result?.message_id
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: String(error.message || error)
    });
  }
}