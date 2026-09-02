/* ============================================================
   app-data.js  (เวอร์ชันสมบูรณ์ รองรับระบบสิทธิ์ RBAC และ Owner)
   เก็บข้อมูลลง LocalStorage จำลองการทำงานของ API แบบ Async/Await
   ============================================================ */

var LS_TOKEN = 'sms_token';
var LS_USER  = 'sms_current_user';
var LS_ROLE  = 'sms_role';

// ---------- ระบบ Role (RBAC) ----------
const SYSTEM_ROLES = [
  { id: 'owner', name: 'เจ้าของธุรกิจ (Owner)' },
  { id: 'admin', name: 'ผู้ดูแลระบบ (Admin)' },
  { id: 'manager', name: 'ผู้จัดการร้าน (Manager)' },
  { id: 'cashier', name: 'พนักงานแคชเชียร์ (Cashier)' },
  { id: 'stock_staff', name: 'พนักงานคลังสินค้า (Stock)' }
];

const ROLE_LEVELS = {
    'owner': 5,        // เลเวลสูงสุด (เจ้าของร้าน)
    'admin': 4,        // ผู้ดูแลระบบ
    'manager': 3,      // ผู้จัดการร้าน
    'cashier': 2,      // พนักงานแคชเชียร์
    'stock_staff': 1   // พนักงานคลังสินค้า
};

function getRoleName(roleId) {
  var role = SYSTEM_ROLES.find(function(r) { return r.id === roleId; });
  return role ? role.name : 'พนักงานทั่วไป';
}

function hasAccess(allowedRoles) {
    var userRole = currentRole();
    if (allowedRoles.includes('all')) return true;
    return allowedRoles.includes(userRole);
}

function requireAccess(allowedRoles) {
    requireAuth(); 
    if (!hasAccess(allowedRoles)) {
        showErrorToast('คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
        setTimeout(function() {
            window.location.href = 'home.html'; 
        }, 1500);
    }
}

function renderRoleUI() {
    var restrictedElements = document.querySelectorAll('[data-role]');
    restrictedElements.forEach(function(el) {
        var rolesStr = el.getAttribute('data-role');
        var allowedRoles = rolesStr.split(',').map(function(r) { return r.trim(); });
        if (!hasAccess(allowedRoles)) {
            el.remove(); // ลบปุ่มหรือเมนูทิ้งทันทีหากไม่มีสิทธิ์
        }
    });
}

// ---------- สินค้า (products) แบบ Async ----------
async function getProducts(){
    return JSON.parse(localStorage.getItem('sms_products') || '[]');
}
async function getProduct(sku){
    var prods = await getProducts();
    var p = prods.find(x => x.sku === sku);
    if(!p) throw new Error('ไม่พบสินค้า');
    return p;
}
async function addProduct(product){
    var prods = await getProducts();
    prods.push(product);
    localStorage.setItem('sms_products', JSON.stringify(prods));
}
async function updateProduct(sku, changes){
    var prods = await getProducts();
    var idx = prods.findIndex(x => x.sku === sku);
    if(idx > -1){
        prods[idx] = Object.assign({}, prods[idx], changes);
        localStorage.setItem('sms_products', JSON.stringify(prods));
    }
}
async function deleteProduct(sku){
    var prods = await getProducts();
    prods = prods.filter(x => x.sku !== sku);
    localStorage.setItem('sms_products', JSON.stringify(prods));
}
async function adjustProductQty(sku, delta, type, actor){
    var p = await getProduct(sku);
    var newQty = p.qty + delta;
    if(newQty < 0) throw new Error('สต็อกไม่เพียงพอ');
    await updateProduct(sku, { qty: newQty });
}

// ---------- ประวัติ (history) ----------
async function getHistory(){
    return JSON.parse(localStorage.getItem('sms_history') || '[]');
}
async function addHistory(entry){
    var hist = await getHistory();
    entry.date = new Date().toISOString();
    entry.dt = formatNowThai();
    hist.push(entry);
    localStorage.setItem('sms_history', JSON.stringify(hist));
}

// ---------- สถานะสต็อกและ UI ----------
function getStockStatus(p){
    if(p.qty <= 0) return 'หมด';
    if(p.qty <= p.minQty) return 'ใกล้หมด';
    return 'ปกติ';
}
function stockBadgeClass(status){ return status === 'ปกติ' ? 'badge-green' : 'badge-red'; }
function stockRowClass(status){ return status === 'ปกติ' ? '' : 'row-alert'; }

var HISTORY_BADGE = {
    'รับเข้าสินค้า': 'badge-green',
    'จ่ายสินค้า': 'badge-red',
    'ยืมสินค้า': 'badge-yellow',
    'คืนสินค้า': 'badge-blue',
    'แก้ไขข้อมูล': 'badge-blue',
    'เพิ่มสินค้า': 'badge-green',
    'ลบสินค้า': 'badge-red'
};

// ---------- วันเวลาภาษาไทย ----------
function formatNowThai(){
    var d = new Date();
    return d.toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' }) + ' ' + d.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });
}

// ---------- ระบบคำขอยืม-คืน (Borrows) ----------
async function getBorrows(){
    return JSON.parse(localStorage.getItem('sms_borrows') || '[]');
}
async function saveBorrows(borrows){
    localStorage.setItem('sms_borrows', JSON.stringify(borrows));
}
var BORROW_BADGE = {
    'รอการตอบรับ': 'badge-yellow',
    'ส่งคำขอสำเร็จ': 'badge-blue',
    'รอส่งมอบสินค้า': 'badge-yellow',
    'ส่งมอบสินค้าสำเร็จ': 'badge-green',
    'รอคืนสินค้า': 'badge-red',
    'คืนสำเร็จ': 'badge-green'
};

// ---------- ระบบล็อกอิน (Mock Auth) ----------
function currentUser(){ return localStorage.getItem(LS_USER); }
function currentRole(){ return localStorage.getItem(LS_ROLE) || 'stock_staff'; }

async function _getUsers() {
    let users = JSON.parse(localStorage.getItem('sms_users') || '[]');
    if(users.length === 0) {
        let defaultAdmin = { username: 'admin', password: 'password', fullname: 'ผู้ดูแลระบบสูงสุด', role: 'admin' };
        users.push(defaultAdmin);
        localStorage.setItem('sms_users', JSON.stringify(users));
    }
    return users;
}

// ---------- ฟังก์ชันสร้างบัญชีแบบต้องมีผู้อนุมัติ ----------
async function doAuthorizedRegister(newUser, authUser, authPass){
    await new Promise(resolve => setTimeout(resolve, 500)); 
    var users = await _getUsers();
    
    var authorizer = users.find(u => u.username === authUser && u.password === authPass);
    if(!authorizer) {
        throw new Error('Username หรือ Password ของผู้อนุมัติไม่ถูกต้อง');
    }
    
    var authLevel = ROLE_LEVELS[authorizer.role] || 0;
    
    // กำหนดให้ต้องเป็นระดับ 3 (Manager) ขึ้นไปเท่านั้น ถึงจะสร้างบัญชีได้
    if(authLevel < 3) {
        throw new Error('สิทธิ์ไม่ถูกต้อง! ต้องเป็นระดับ "ผู้จัดการร้าน" ขึ้นไปเท่านั้น');
    }
    
    if(users.find(u => u.username === newUser.username)) {
        throw new Error('Username นี้มีคนใช้งานในระบบแล้ว');
    }
    
    users.push({ 
        username: newUser.username, 
        password: newUser.password, 
        fullname: newUser.fullname, 
        role: newUser.role 
    });
    localStorage.setItem('sms_users', JSON.stringify(users));
    return true;
}

async function doLogin(username, password){
    await new Promise(resolve => setTimeout(resolve, 500));
    var users = await _getUsers();
    var user = users.find(u => u.username === username && u.password === password);
    
    if(!user){
        throw new Error('Username หรือ Password ไม่ถูกต้อง');
    }

    localStorage.setItem(LS_TOKEN, 'mock_token_' + Date.now());
    localStorage.setItem(LS_USER, user.username);
    localStorage.setItem(LS_ROLE, user.role);

    return { token: localStorage.getItem(LS_TOKEN), username: user.username, role: user.role };
}

function doLogout(){
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
    localStorage.removeItem(LS_ROLE);
    window.location.href = 'login.html';
}

function requireAuth(){
    if(!currentUser() || !localStorage.getItem(LS_TOKEN)){
        window.location.href = 'login.html';
    }
}

function initSidebarUser(){
    var el = document.querySelector('.sidebar-user');
    if(el && currentUser()){ 
        el.innerHTML = currentUser() + '<span>' + getRoleName(currentRole()) + '</span>'; 
    }
    var logoutBtn = document.querySelector('.nav-item.logout');
    if(logoutBtn){
        logoutBtn.addEventListener('click', function(e){
            e.preventDefault();
            doLogout();
        });
    }
}

// ---------- Toast แจ้งเตือน ----------
function showToast(msg){
    var existing = document.getElementById('smsToast');
    if(existing) existing.remove();
    var el = document.createElement('div');
    el.id = 'smsToast';
    el.textContent = msg;
    el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#1e293b;color:#fff;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:600;z-index:999;box-shadow:0 6px 20px rgba(0,0,0,.25);opacity:0;transition:opacity .2s ease;';
    document.body.appendChild(el);
    requestAnimationFrame(function(){ el.style.opacity = '1'; });
    setTimeout(function(){
        el.style.opacity = '0';
        setTimeout(function(){ el.remove(); }, 250);
    }, 2200);
}

function showErrorToast(msg){
    var existing = document.getElementById('smsToast');
    if(existing) existing.remove();
    var el = document.createElement('div');
    el.id = 'smsToast';
    el.textContent = msg;
    el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#b91c1c;color:#fff;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:600;z-index:999;box-shadow:0 6px 20px rgba(0,0,0,.25);opacity:0;transition:opacity .2s ease;';
    document.body.appendChild(el);
    requestAnimationFrame(function(){ el.style.opacity = '1'; });
    setTimeout(function(){
        el.style.opacity = '0';
        setTimeout(function(){ el.remove(); }, 2800);
    }, 2200);
}

// ---------- Modal ----------
function openModal(titleText){
    closeModal();
    var overlay = document.createElement('div');
    overlay.id = 'smsModalOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,35,.45);z-index:998;display:flex;align-items:center;justify-content:center;padding:20px;';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:18px;width:420px;max-width:100%;max-height:88vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.25);';
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

function fieldHtml(labelText, inputHtml){
    return '<label style="font-size:13px;font-weight:600;color:#384252;display:flex;flex-direction:column;gap:6px;">' + labelText + inputHtml + '</label>';
}
var inputStyle = 'height:40px;border:1px solid #d9dbe0;border-radius:10px;padding:0 12px;font-size:14px;font-family:inherit;outline:none;';