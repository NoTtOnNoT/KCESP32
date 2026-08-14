// ==========================================================
// auth.js
// ระบบจัดการบัญชีผู้ใช้ (สมัคร/เข้าสู่ระบบ) โดยเก็บข้อมูลใน
// Firebase Realtime Database แทนการใช้ Firebase Authentication
// ==========================================================
//
// โครงสร้างข้อมูลใน Realtime Database:
// /users/{userKey}
//     email        : string  (อีเมลจริงของผู้ใช้)
//     displayName  : string
//     salt         : string  (hex, สุ่มต่อผู้ใช้)
//     passwordHash : string  (hex, SHA-256(salt + password))
//     createdAt    : number  (timestamp, ms)
//
// userKey = อีเมลที่ผ่านการ sanitize (แทนที่ตัวอักษรต้องห้ามของ
// Realtime Database key: . # $ [ ] /)
//
// ⚠️ ข้อควรระวังด้านความปลอดภัย:
// วิธีนี้ตรวจสอบรหัสผ่าน "ฝั่ง client" ทั้งหมด ไม่มี backend คอยตรวจสอบ
// ดังนั้นต้องตั้งกฎความปลอดภัย (Security Rules) ของ Realtime Database
// ให้รัดกุม เช่น ห้ามอ่าน/เขียน node /users แบบเปิดสาธารณะทั้งหมด
// และควรพิจารณาใช้ Firebase Authentication ในระยะยาวหากต้องการความ
// ปลอดภัยระดับ production จริงจัง
// ==========================================================

// TODO: แทนที่ค่าด้านล่างด้วย firebaseConfig ของโปรเจกต์ kcesp32
const firebaseConfig = {
  apiKey: "AIzaSyD3XfwBBlEEqb8OLT9fBQFTDtvmQSBpP_0",
  authDomain: "kcesp32.firebaseapp.com",
  databaseURL: "https://kcesp32-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "kcesp32",
  storageBucket: "kcesp32.firebasestorage.app",
  messagingSenderId: "423199475877",
  appId: "1:423199475877:web:d95bec6ed2d966cb3e654c"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

const SESSION_KEY = "geobelt_session";

// ----------------------------------------------------------
// แปลงอีเมลให้เป็น key ที่ใช้ได้กับ Realtime Database
// ----------------------------------------------------------
function sanitizeEmailKey(email) {
    return email
        .trim()
        .toLowerCase()
        .replace(/\./g, ",")
        .replace(/[#$\[\]\/]/g, "_");
}

// ----------------------------------------------------------
// สุ่ม salt (hex string ยาว 32 ตัวอักษร)
// ----------------------------------------------------------
function generateSalt() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ----------------------------------------------------------
// แฮชรหัสผ่านด้วย SHA-256 (salt + password)
// ----------------------------------------------------------
async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(salt + password);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ----------------------------------------------------------
// ตรวจสอบว่ามีอีเมลนี้ในระบบแล้วหรือยัง
// ----------------------------------------------------------
async function emailExists(email) {
    const key = sanitizeEmailKey(email);
    const snapshot = await db.ref("users/" + key).get();
    return snapshot.exists();
}

// ----------------------------------------------------------
// สมัครสมาชิกใหม่
// คืนค่า { success: true } หรือ { success: false, message }
// ----------------------------------------------------------
async function registerUser(email, password, displayName) {
    const key = sanitizeEmailKey(email);
    const ref = db.ref("users/" + key);

    const snapshot = await ref.get();
    if (snapshot.exists()) {
        return { success: false, message: "อีเมลนี้มีการสมัครใช้งานในระบบแล้ว" };
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    await ref.set({
        email: email.trim().toLowerCase(),
        displayName: displayName ? displayName.trim() : "",
        salt: salt,
        passwordHash: passwordHash,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    });

    return { success: true, userKey: key };
}

// ----------------------------------------------------------
// เข้าสู่ระบบ
// คืนค่า { success: true, user } หรือ { success: false, message }
// ----------------------------------------------------------
async function loginUser(email, password) {
    const key = sanitizeEmailKey(email);
    const snapshot = await db.ref("users/" + key).get();

    if (!snapshot.exists()) {
        return { success: false, message: "ไม่พบบัญชีผู้ใช้นี้ในระบบ" };
    }

    const userData = snapshot.val();
    const attemptHash = await hashPassword(password, userData.salt);

    if (attemptHash !== userData.passwordHash) {
        return { success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
    }

    return {
        success: true,
        user: {
            userKey: key,
            email: userData.email,
            displayName: userData.displayName || ""
        }
    };
}

// ----------------------------------------------------------
// จัดการ Session (แทนที่ auth.onAuthStateChanged ของ Firebase Auth)
// ----------------------------------------------------------
function saveSession(user, remember) {
    const payload = JSON.stringify(user);
    if (remember) {
        localStorage.setItem(SESSION_KEY, payload);
        sessionStorage.removeItem(SESSION_KEY);
    } else {
        sessionStorage.setItem(SESSION_KEY, payload);
        localStorage.removeItem(SESSION_KEY);
    }
}

function getSession() {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
}

// ----------------------------------------------------------
// เรียกใช้ในหน้าที่ต้องล็อกอินก่อนถึงจะเข้าได้ เช่น index.html
// วางไว้บนสุดของหน้า: requireAuth();
// ----------------------------------------------------------
function requireAuth(loginPage = "login.html") {
    const user = getSession();
    if (!user) {
        window.location.href = loginPage;
    }
    return user;
}