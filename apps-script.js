// ============================================================
// AquaTrack — Google Apps Script Backend (Optimized)
// ============================================================

const SHEET_NAME  = "AquaTrack";
const INDEX_NAME  = "AquaTrack_Index";   // Lightweight index for sidebar
const OWNER_EMAILS = [
  "mg31629@gmail.com",         // ← Primary
  "letscode291@gmail.com",      // ← Add the actual email here
];

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "manish123";

const SESSION_HOURS = 24;
const TOKEN_SHEET   = "Sessions";
const CACHE_TTL     = 300; // Cache TTL in seconds (5 min)

// ============================================================
// REQUEST ROUTER
// ============================================================
function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  const body   = e.postData ? JSON.parse(e.postData.contents) : {};
  const action = e.parameter.action || body.action;
  const token  = body.token || e.parameter.token;

  let result;
  try {
    if (action === "login") {
      result = handleLogin(body.username, body.password);
    } else if (!validateToken(token)) {
      result = { error: "UNAUTHORIZED" };
    } else {
      switch (action) {
        // ── Optimized fetches ──
        case "getIndex":        result = getIndex(); break;           // Just sidebar data (fast)
        case "getCustomer":     result = getCustomer(body.customerId); break; // One customer
        case "getAll":          result = getAllData(); break;          // Full fetch (fallback)

        // ── Writes ──
        case "saveCustomer":    result = saveCustomer(body.customer); break;
        case "deleteCustomer":  result = deleteCustomer(body.customerId); break;
        case "saveService":     result = saveService(body.customerId, body.service); break;
        case "deleteService":   result = deleteService(body.customerId, body.serviceId); break;

        case "logout":          result = handleLogout(token); break;
        default: result = { error: "Unknown action: " + action };
      }
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// AUTH
// ============================================================
function handleLogin(username, password) {
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    Utilities.sleep(800);
    return { error: "INVALID_CREDENTIALS" };
  }
  const token   = Utilities.getUuid();
  const expires = new Date();
  expires.setHours(expires.getHours() + SESSION_HOURS);
  const sheet = getOrCreateTokenSheet();
  sheet.appendRow([token, expires.toISOString(), new Date().toISOString()]);
  cleanExpiredTokens(sheet);
  return { success: true, token, expiresIn: SESSION_HOURS * 3600 };
}

function handleLogout(token) {
  const sheet = getOrCreateTokenSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] === token) { sheet.deleteRow(i + 1); break; }
  }
  return { success: true };
}

function validateToken(token) {
  if (!token) return false;
  const sheet = getOrCreateTokenSheet();
  const rows  = sheet.getDataRange().getValues();
  const now   = new Date();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === token) return now < new Date(rows[i][1]);
  }
  return false;
}

function cleanExpiredTokens(sheet) {
  const rows = sheet.getDataRange().getValues();
  const now  = new Date();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (new Date(rows[i][1]) < now) sheet.deleteRow(i + 1);
  }
}

function getOrCreateTokenSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TOKEN_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(TOKEN_SHEET);
    sheet.getRange(1,1,1,3).setValues([["TOKEN","EXPIRES","CREATED"]]);
    sheet.getRange(1,1,1,3).setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.hideSheet();
  }
  return sheet;
}

// ============================================================
// CACHE HELPERS
// Uses Apps Script CacheService — survives between requests
// for up to CACHE_TTL seconds before re-reading the sheet
// ============================================================
function getCached(key) {
  const cache = CacheService.getScriptCache();
  const raw   = cache.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch(e) { return null; }
}

function setCached(key, data) {
  try {
    const cache = CacheService.getScriptCache();
    const str   = JSON.stringify(data);
    // CacheService max value is 100KB per key — chunk if needed
    if (str.length < 100000) {
      cache.put(key, str, CACHE_TTL);
    }
    // If data is too large, just skip caching (sheet will be read directly)
  } catch(e) {}
}

function bustCache() {
  const cache = CacheService.getScriptCache();
  cache.removeAll(['aquatrack_index', 'aquatrack_nextid']);
}

// ============================================================
// DATA SHEETS
// ============================================================
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1,1,1,3).setValues([["ID","TYPE","DATA"]]);
    sheet.getRange(1,1,1,3).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getOrCreateIndexSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(INDEX_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(INDEX_NAME);
    // Lightweight columns only — no full JSON stored here
    sheet.getRange(1,1,1,7).setValues([["ID","NAME","PHONE","TYPE","AMC_END","ROW_IN_MAIN","LAST_VISIT"]]);
    sheet.getRange(1,1,1,7).setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.hideSheet();
  }
  return sheet;
}

// ============================================================
// READ — FAST INDEX (for sidebar, no full JSON)
// ============================================================
function getIndex() {
  // Try cache first
  const cached = getCached('aquatrack_index');
  if (cached) return cached;

  const sheet     = getOrCreateSheet();
  const idxSheet  = getOrCreateIndexSheet();
  const rows      = sheet.getDataRange().getValues();
  const customers = [];
  let nextId = 1;

  // Rebuild index from main sheet
  const indexRows = [["ID","NAME","PHONE","TYPE","AMC_END","ROW_IN_MAIN","LAST_VISIT"]];

  for (let i = 1; i < rows.length; i++) {
    const [id, type, dataStr] = rows[i];
    if (type !== "CUSTOMER") continue;
    try {
      const c = JSON.parse(dataStr);
      if (c.id >= nextId) nextId = c.id + 1;

      // Last visit date for sidebar
      const lastVisit = (c.services || []).length
        ? [...(c.services)].sort((a,b)=>new Date(b.date)-new Date(a.date))[0].date
        : null;

      // Pending complaints count
      const pendingComplaints = (c.services || []).filter(s => s.type==='complaint' && s.status!=='done').length;

      customers.push({
        id:        c.id,
        name:      c.name,
        phone:     c.phone || '',
        address:   c.address || '',
        customerType: c.customerType || 'amc',
        amcEnd:    c.amcEnd || null,
        amcStart:  c.amcStart || null,
        amcAmount: c.amcAmount || null,
        roModel:   c.roModel || '',
        notes:     c.notes || '',
        pendingComplaints,
        lastVisit,
        _row: i + 1  // row number in main sheet for fast lookup
      });

      indexRows.push([c.id, c.name, c.phone||'', c.customerType||'amc', c.amcEnd||'', i+1, lastVisit||'']);
    } catch(e) {}
  }

  const result = { customers, nextId };

  // Update the index sheet (async-ish — write after returning would be ideal but GAS is sync)
  if (indexRows.length > 1) {
    idxSheet.clearContents();
    idxSheet.getRange(1, 1, indexRows.length, 7).setValues(indexRows);
  }

  setCached('aquatrack_index', result);
  return result;
}

// ============================================================
// READ — SINGLE CUSTOMER (for detail view)
// ============================================================
function getCustomer(customerId) {
  const cacheKey = 'customer_' + customerId;
  const cached   = getCached(cacheKey);
  if (cached) return cached;

  const sheet = getOrCreateSheet();
  const rows  = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == customerId && rows[i][1] === "CUSTOMER") {
      const customer = JSON.parse(rows[i][2]);
      const result   = { customer };
      setCached(cacheKey, result);
      return result;
    }
  }
  return { error: "Customer not found" };
}

// ============================================================
// READ — FULL (kept as fallback / initial load safety net)
// ============================================================
function getAllData() {
  const sheet = getOrCreateSheet();
  const rows  = sheet.getDataRange().getValues();
  const customers = [];
  let nextId = 1;
  for (let i = 1; i < rows.length; i++) {
    const [id, type, dataStr] = rows[i];
    if (type === "CUSTOMER") {
      try {
        const c = JSON.parse(dataStr);
        customers.push(c);
        if (c.id >= nextId) nextId = c.id + 1;
      } catch(e) {}
    }
  }
  return { customers, nextId };
}

// ============================================================
// WRITE — SAVE CUSTOMER
// ============================================================
function saveCustomer(customer) {
  const sheet = getOrCreateSheet();
  const rows  = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == customer.id && rows[i][1] === "CUSTOMER") {
      sheet.getRange(i + 1, 3).setValue(JSON.stringify(customer));
      bustCache();
      // Also bust individual customer cache
      CacheService.getScriptCache().remove('customer_' + customer.id);
      return { success: true, action: "updated" };
    }
  }
  // New customer
  sheet.appendRow([customer.id, "CUSTOMER", JSON.stringify(customer)]);
  bustCache();
  return { success: true, action: "inserted" };
}

// ============================================================
// WRITE — DELETE CUSTOMER
// ============================================================
function deleteCustomer(customerId) {
  const sheet = getOrCreateSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] == customerId && rows[i][1] === "CUSTOMER") {
      sheet.deleteRow(i + 1);
      bustCache();
      CacheService.getScriptCache().remove('customer_' + customerId);
      return { success: true };
    }
  }
  return { success: false, error: "Customer not found" };
}

// ============================================================
// WRITE — SAVE SERVICE (append only — fast, no full row scan)
// ============================================================
function saveService(customerId, service) {
  const sheet = getOrCreateSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == customerId && rows[i][1] === "CUSTOMER") {
      const customer = JSON.parse(rows[i][2]);
      if (!customer.services) customer.services = [];
      customer.services.push(service);
      sheet.getRange(i + 1, 3).setValue(JSON.stringify(customer));
      bustCache();
      CacheService.getScriptCache().remove('customer_' + customerId);
      return { success: true };
    }
  }
  return { success: false, error: "Customer not found" };
}

// ============================================================
// WRITE — DELETE SERVICE
// ============================================================
function deleteService(customerId, serviceId) {
  const sheet = getOrCreateSheet();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == customerId && rows[i][1] === "CUSTOMER") {
      const customer = JSON.parse(rows[i][2]);
      customer.services = (customer.services || []).filter(s => s.id !== serviceId);
      sheet.getRange(i + 1, 3).setValue(JSON.stringify(customer));
      bustCache();
      CacheService.getScriptCache().remove('customer_' + customerId);
      return { success: true };
    }
  }
  return { success: false, error: "Customer not found" };
}

// ============================================================
// DAILY EMAIL REMINDER
// ============================================================
function dailyReminderCheck() {
  const sheet = getOrCreateSheet();
  const rows  = sheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiring = [];

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] !== "CUSTOMER") continue;
    try {
      const customer = JSON.parse(rows[i][2]);
      if (customer.customerType === 'regular' || !customer.amcEnd) continue;
      const endDate = new Date(customer.amcEnd);
      endDate.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((endDate - today) / 86400000);
      if (daysLeft >= 0 && daysLeft <= 7) expiring.push({ customer, daysLeft });
    } catch(e) {}
  }

  if (!expiring.length) return;
  expiring.sort((a, b) => a.daysLeft - b.daysLeft);

  let html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0a0f1e;padding:24px;border-radius:8px 8px 0 0;">
        <h2 style="color:#00d4ff;margin:0;">💧 AquaTrack — AMC Expiry Reminder</h2>
        <p style="color:#94a3b8;margin:8px 0 0;">The following AMCs are expiring within 7 days</p>
      </div>
      <div style="background:#111827;padding:20px;border-radius:0 0 8px 8px;border:1px solid #1f2d47;">`;

  expiring.forEach(({ customer, daysLeft }) => {
    const urgency = daysLeft === 0 ? '🔴 EXPIRES TODAY'
      : daysLeft <= 2 ? `🟠 Expires in ${daysLeft} day(s)`
      : `🟡 Expires in ${daysLeft} days`;
    const endFormatted = new Date(customer.amcEnd).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
    html += `
      <div style="background:#1a2235;border:1px solid #1f2d47;border-radius:8px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <strong style="color:#e2e8f0;font-size:16px;">${customer.name}</strong>
          <span style="font-size:13px;">${urgency}</span>
        </div>
        <div style="color:#94a3b8;font-size:13px;margin-top:8px;">📅 AMC End: <strong style="color:#00d4ff;">${endFormatted}</strong></div>
        ${customer.phone   ? `<div style="color:#94a3b8;font-size:13px;margin-top:4px;">📞 ${customer.phone}</div>` : ''}
        ${customer.roModel ? `<div style="color:#94a3b8;font-size:13px;margin-top:4px;">🔧 ${customer.roModel}</div>` : ''}
      </div>`;
  });

  html += `<p style="color:#64748b;font-size:12px;margin-top:16px;">${expiring.length} AMC(s) expiring soon.</p></div></div>`;

  GmailApp.sendEmail(OWNER_EMAIL,
    `⚠️ AquaTrack: ${expiring.length} AMC(s) Expiring Within 7 Days`,
    '', { htmlBody: html });
}

function testReminder() {
  try {
    const { customers } = getAllData();
    const amcCustomers = customers.filter(c => c.customerType !== 'regular' && c.amcEnd);
    Logger.log("AMC customers: " + amcCustomers.length);
    GmailApp.sendEmail(OWNER_EMAIL, "AquaTrack — Test Email",
      "✅ Working!\n\nAMC customers: " + amcCustomers.length + "\n\n" +
      amcCustomers.map(c => "• " + c.name + " — ends: " + c.amcEnd).join("\n"));
    Logger.log("Sent to " + OWNER_EMAIL);
  } catch(e) { Logger.log("ERROR: " + e.toString()); }
}
