<?php
// อนุญาตให้ยิง API ได้จากทุกที่ (CORS)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

// รับข้อมูล JSON ที่ส่งมาจาก ESP32
$jsonInput = file_get_contents("php://input");
$data = json_decode($jsonInput, true);

// ตรวจสอบว่ามีข้อมูล lat และ lng ส่งมาไหม
if ($data && isset($data['lat']) && isset($data['lng'])) {
    
    // บันทึกเวลาที่อัปเดตล่าสุด (เวลาไทย)
    date_default_timezone_set("Asia/Bangkok");
    $data['updated_at'] = date("H:i:s d/m/Y");

    // บันทึกทับลงในไฟล์ location.json
    $fileSaved = file_put_contents("location.json", json_encode($data, JSON_PRETTY_PRINT));

    if ($fileSaved !== false) {
        http_response_code(200);
        echo json_encode(["status" => "success", "message" => "Location updated"]);
    } else {
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Failed to write file"]);
    }
} else {
    http_response_code(400);
    echo json_encode(["status" => "error", "message" => "Invalid JSON data"]);
}
?>