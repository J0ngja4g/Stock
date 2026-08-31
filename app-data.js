/* ============================================================
   app-data.js  (เวอร์ชัน MySQL ผ่าน Backend API)
   ชั้นข้อมูลกลางของระบบจัดการสต็อกสินค้า
   *** ไม่ใช้ localStorage เก็บข้อมูลจริงอีกต่อไป ***
   ข้อมูลจริงทั้งหมดอยู่ใน MySQL และเข้าถึงผ่าน REST API
   (backend ต้องรันอยู่ที่ API_BASE ด้านล่างนี้)

   ข้อควรระวัง: ฟังก์ชันเกือบทั้งหมดเปลี่ยนจาก synchronous เป็น
   async (คืนค่าเป็น Promise) เพราะต้องรอผลจาก server
   ทุกหน้าที่เรียกใช้ฟังก์ชันเหล่านี้ต้องใช้ await หรือ .then()
   ไฟล์ทุกหน้าต้อง <script src="app-data.js"></script> ก่อน script ของหน้าตัวเอง
   ============================================================ */

// ---------- ตั้งค่า URL ของ backend API ----------
// ถ้า backend รันคนละ host/port ให้แก้ตรงนี้ เช่น 'http://localhost:3000/api'
var API_BASE = 'http://localhost/sms-api';

// เก็บ token การล็อกอินไว้ใน localStorage (เก็บแค่ session token ไม่ใช่ข้อมูลสินค้า)
var LS_TOKEN = 'sms_token';
var LS_USER  = 'sms_current_user';

// ---------- ฟังก์ชันช่วยเรียก API กลาง ----------
// จัดการเรื่อง header, แนบ token, และ parse error ให้ทุกจุดเรียกใช้ร่วมกัน
async function apiRequest(path, options){
  options = options || {};
  var headers = Object.assign(
    { 'Content-Type': 'application/json' },
    options.headers || {}
  );
  var token = localStorage.getItem(LS_TOKEN);
  if(token){ headers['Authorization'] = 'Bearer ' + token; }

  var res;
  try{
    res = await fetch(API_BASE + path, Object.assign({}, options, { headers: headers }));
  }catch(networkErr){
    throw new Error('เชื่อมต่อ server ไม่ได้ กรุณาตรวจสอบว่า backend กำลังรันอยู่');
  }

  // ถ้า token หมดอายุหรือไม่ได้ล็อกอิน ให้เด้งกลับหน้า login
  if(res.status === 401){
    doLogout();
    throw new Error('เซสชันหมดอายุ กรุณาล็อกอินใหม่');
  }

  var data = null;
  var text = await res.text();
  if(text){
    try{ data = JSON.parse(text); }catch(e){ data = text; }
  }

  if(!res.ok){
    var msg = (data && data.message) ? data.message : ('เกิดข้อผิดพลาด (HTTP ' + res.status + ')');
    throw new Error(msg);
  }
  return data;
}

// ---------- สินค้า (products) ----------
async function getProducts(){
  return apiRequest('/products', { method: 'GET' });
}
async function getProduct(sku){
  return apiRequest('/products/' + encodeURIComponent(sku), { method: 'GET' });
}
async function addProduct(product){
  // product = { sku, name, category, qty, unit, minQty }
  return apiRequest('/products', {
    method: 'POST',
    body: JSON.stringify(product)
  });
}
async function updateProduct(sku, changes){
  return apiRequest('/products/' + encodeURIComponent(sku), {
    method: 'PUT',
    body: JSON.stringify(changes)
  });
}
async function deleteProduct(sku){
  return apiRequest('/products/' + encodeURIComponent(sku), { method: 'DELETE' });
}
// ปรับจำนวนสต็อก (รับเข้า / จ่ายออก) โดยให้ backend อัปเดต qty และบันทึก history ให้ในทีเดียว
async function adjustProductQty(sku, delta, type, actor){
  // delta เป็นบวก = รับเข้า, ลบ = จ่ายออก
  return apiRequest('/products/' + encodeURIComponent(sku) + '/adjust', {
    method: 'POST',
    body: JSON.stringify({ delta: delta, type: type, actor: actor })
  });
}

// ---------- ประวัติ (history) ----------
async function getHistory(){
  return apiRequest('/history', { method: 'GET' });
}
// ปกติแล้ว history ควรถูกสร้างฝั่ง server อัตโนมัติตอนมีการรับเข้า/จ่าย/ยืม-คืนสินค้า
// แต่เผื่อกรณีต้องเพิ่มเองตรงๆ (เช่น "แก้ไขข้อมูล") ก็ยังเรียกใช้ได้
async function addHistory(entry){
  // entry = { type, sku, name, qtyText, actor }
  return apiRequest('/history', {
    method: 'POST',
    body: JSON.stringify(entry)
  });
}

// ---------- คำขอยืม-คืน (borrows) ----------
async function getBorrows(){
  return apiRequest('/borrows', { method: 'GET' });
}
async function addBorrow(borrow){
  // borrow = { sku, name, category, qty, unit, status, borrower, date }
  return apiRequest('/borrows', {
    method: 'POST',
    body: JSON.stringify(borrow)
  });
}
async function updateBorrowStatus(id, status){
  return apiRequest('/borrows/' + encodeURIComponent(id) + '/status', {
    method: 'PUT',
    body: JSON.stringify({ status: status })
  });
}
async function deleteBorrow(id){
  return apiRequest('/borrows/' + encodeURIComponent(id), { method: 'DELETE' });
}

// ---------- สถานะสต็อก (คำนวณฝั่ง client เหมือนเดิม ไม่ต้องยิง API) ----------
function getStockStatus(p){
  if(p.qty <= 0) return 'หมด';
  if(p.qty <= p.minQty) return 'ใกล้หมด';
  return 'ปกติ';
}
function stockBadgeClass(status){
  if(status === 'ปกติ') return 'badge-green';
  return 'badge-red'; // ใช้สีแดงทั้งใกล้หมดและหมด เหมือนดีไซน์ต้นฉบับ
}
function stockRowClass(status){
  return status === 'ปกติ' ? '' : 'row-alert';
}

// ป้ายสีของประเภทรายการในหน้าประวัติ
var HISTORY_BADGE = {
  'รับเข้าสินค้า':'badge-green',
  'จ่ายสินค้า':'badge-red',
  'ยืมสินค้า':'badge-blue',
  'คืนสินค้า':'badge-green',
  'แก้ไขข้อมูล':'badge-yellow',
  'เพิ่มสินค้า':'badge-green',
  'ลบสินค้า':'badge-red'
};

// ป้ายสีของสถานะคำขอยืม-คืน (ตามดีไซน์ต้นฉบับ)
var BORROW_BADGE = {
  'รอการตอบรับ':'badge-yellow',
  'ส่งคำขอสำเร็จ':'badge-green',
  'รอส่งมอบสินค้า':'badge-green',
  'ส่งมอบสินค้าสำเร็จ':'badge-green',
  'รอคืนสินค้า':'badge-red',
  'คืนสำเร็จ':'badge-blue'
};

// ---------- ระบบล็อกอิน (ตรวจกับ server จริง + เก็บ token) ----------
function currentUser(){ return localStorage.getItem(LS_USER); }

// เรียก API /auth/login ให้ server ตรวจ username/password จริง แล้วคืน token กลับมา
async function doLogin(username, password){
  var data = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: username, password: password })
  });
  // คาดว่า backend ตอบกลับ { token: '...', username: '...' }
  localStorage.setItem(LS_TOKEN, data.token);
  localStorage.setItem(LS_USER, data.username || username);
  return data;
}

// เรียก API /auth/register เพื่อสมัครสมาชิกใหม่ แล้ว backend จะบันทึกผู้ใช้ลงฐานข้อมูล (MySQL)
// หน้า register.html จะพากลับไปหน้า login.html ให้ผู้ใช้ล็อกอินเองอีกที
// จึงไม่บันทึก token ในฟังก์ชันนี้ (ไม่ auto-login)
async function doRegister(username, password, fullname){
  return apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: username, password: password, fullname: fullname })
  });
}

function doLogout(){
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_USER);
  window.location.href = 'login.html';
}

// เรียกฟังก์ชันนี้ที่บนสุดของทุกหน้า (ยกเว้น login.html) เพื่อกันการเข้าหน้าโดยไม่ได้ล็อกอิน
function requireAuth(){
  if(!currentUser() || !localStorage.getItem(LS_TOKEN)){
    window.location.href = 'login.html';
  }
}

// เติมชื่อผู้ใช้ปัจจุบันลงในแถบด้านข้าง และผูกปุ่ม Logout ให้ล้าง session ก่อนออก
function initSidebarUser(){
  var el = document.querySelector('.sidebar-user');
  var u = currentUser();
  if(el && u){ el.childNodes[0].nodeValue = u; }
  var logoutBtn = document.querySelector('.nav-item.logout');
  if(logoutBtn){
    logoutBtn.addEventListener('click', function(e){
      e.preventDefault();
      doLogout();
    });
  }
}

// ---------- Toast แจ้งเตือนแบบง่าย (เหมือนเดิม ไม่เกี่ยวกับข้อมูล) ----------
function showToast(msg){
  var existing = document.getElementById('smsToast');
  if(existing) existing.remove();
  var el = document.createElement('div');
  el.id = 'smsToast';
  el.textContent = msg;
  el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);' +
    'background:#1e293b;color:#fff;padding:12px 22px;border-radius:999px;font-size:14px;' +
    'font-weight:600;z-index:999;box-shadow:0 6px 20px rgba(0,0,0,.25);opacity:0;transition:opacity .2s ease;';
  document.body.appendChild(el);
  requestAnimationFrame(function(){ el.style.opacity = '1'; });
  setTimeout(function(){
    el.style.opacity = '0';
    setTimeout(function(){ el.remove(); }, 250);
  }, 2200);
}
// แจ้งเตือน error แบบสีแดง ใช้คู่กับ try/catch ตอนเรียก API
function showErrorToast(msg){
  var existing = document.getElementById('smsToast');
  if(existing) existing.remove();
  var el = document.createElement('div');
  el.id = 'smsToast';
  el.textContent = msg;
  el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);' +
    'background:#b91c1c;color:#fff;padding:12px 22px;border-radius:999px;font-size:14px;' +
    'font-weight:600;z-index:999;box-shadow:0 6px 20px rgba(0,0,0,.25);opacity:0;transition:opacity .2s ease;';
  document.body.appendChild(el);
  requestAnimationFrame(function(){ el.style.opacity = '1'; });
  setTimeout(function(){
    el.style.opacity = '0';
    setTimeout(function(){ el.remove(); }, 2800);
  }, 2200);
}

// ---------- Modal แบบใช้ซ้ำได้ (เหมือนเดิมทั้งหมด ไม่เกี่ยวกับข้อมูล) ----------
function openModal(titleText){
  closeModal(); // กันเปิดซ้อนกัน
  var overlay = document.createElement('div');
  overlay.id = 'smsModalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,35,.45);z-index:998;' +
    'display:flex;align-items:center;justify-content:center;padding:20px;';
  var box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:18px;width:420px;max-width:100%;max-height:88vh;' +
    'overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.25);';
  var head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #edf0f2;';
  var h = document.createElement('div');
  h.textContent = titleText;
  h.style.cssText = 'font-size:17px;font-weight:700;color:#1e293b;';
  var closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;';
  closeBtn.style.cssText = 'border:none;background:none;font-size:22px;line-height:1;color:#6b7582;cursor:pointer;';
  closeBtn.addEventListener('click', closeModal);
  head.appendChild(h); head.appendChild(closeBtn);
  var body = document.createElement('div');
  body.id = 'smsModalBody';
  body.style.cssText = 'padding:20px 22px;display:flex;flex-direction:column;gap:14px;';
  box.appendChild(head); box.appendChild(body);
  overlay.appendChild(box);
  overlay.addEventListener('click', function(e){ if(e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
  return body;
}
function closeModal(){
  var el = document.getElementById('smsModalOverlay');
  if(el) el.remove();
}
// ช่องกรอกข้อมูลสไตล์เดียวกับหน้า login (ใช้ในฟอร์มต่างๆ ของ modal)
function fieldHtml(labelText, inputHtml){
  return '<label style="font-size:13px;font-weight:600;color:#384252;display:flex;flex-direction:column;gap:6px;">' +
    labelText + inputHtml + '</label>';
}
var inputStyle = 'height:40px;border:1px solid #d9dbe0;border-radius:10px;padding:0 12px;font-size:14px;font-family:inherit;outline:none;';