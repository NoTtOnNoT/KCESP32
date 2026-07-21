<?php
// อนุญาตให้เรียกข้อมูลได้จากทุกที่ (CORS)
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

$file = "location.json";

// ถ้ามีไฟล์ location.json ให้ส่งข้อมูลออกไป
if (file_exists($file)) {
    echo file_get_contents($file);
} else {
    // ค่าเริ่มต้นถ้ายังไม่มีข้อมูลส่งมาจาก ESP32
    echo json_encode([
        "lat" => 13.7563,
        "lng" => 100.5018,
        "distance" => 0.0,
        "status" => "WAITING_DATA",
        "net_type" => "NONE",
        "updated_at" => "ยังไม่มีข้อมูล"
    ]);
}
?>