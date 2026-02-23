// ============================================================
// AquaTrack — Google Apps Script Backend (v3 — AMC Expiry Reminders)
// ============================================================

const SHEET_NAME = "AquaTrack";
const OWNER_EMAIL = "mg31629@gmail.com"; // ← CHANGE THIS to the owner's email

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, 3).setValues([["ID", "TYPE", "DATA"]]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  const action = e.parameter.action || (e.postData ? JSON.parse(e.postData.contents).action : null);
  const body = e.postData ? JSON.parse(e.postData.contents) : e.parameter;

  let result;
  try {
    switch (action) {
      case "getAll":          result = getAllData(); break;
      case "saveCustomer":    result = saveCustomer(body.customer); break;
      case "deleteCustomer":  result = deleteCustomer(body.customerId); break;
      case "saveService":     result = saveService(body.customerId, body.service); break;
      case "deleteService":   result = deleteService(body.customerId, body.serviceId); break;
      default: result = { error: "Unknown action: " + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- GET ALL ----
function getAllData() {
  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues();
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

// ---- SAVE CUSTOMER ----
function saveCustomer(customer) {
  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == customer.id && rows[i][1] === "CUSTOMER") {
      sheet.getRange(i + 1, 3).setValue(JSON.stringify(customer));
      return { success: true, action: "updated" };
    }
  }
  sheet.appendRow([customer.id, "CUSTOMER", JSON.stringify(customer)]);
  return { success: true, action: "inserted" };
}

// ---- DELETE CUSTOMER ----
function deleteCustomer(customerId) {
  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][0] == customerId && rows[i][1] === "CUSTOMER") {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: "Customer not found" };
}

// ---- SAVE SERVICE ----
function saveService(customerId, service) {
  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == customerId && rows[i][1] === "CUSTOMER") {
      const customer = JSON.parse(rows[i][2]);
      if (!customer.services) customer.services = [];
      customer.services.push(service);
      sheet.getRange(i + 1, 3).setValue(JSON.stringify(customer));
      return { success: true };
    }
  }
  return { success: false, error: "Customer not found" };
}

// ---- DELETE SERVICE ----
function deleteService(customerId, serviceId) {
  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == customerId && rows[i][1] === "CUSTOMER") {
      const customer = JSON.parse(rows[i][2]);
      customer.services = (customer.services || []).filter(s => s.id !== serviceId);
      sheet.getRange(i + 1, 3).setValue(JSON.stringify(customer));
      return { success: true };
    }
  }
  return { success: false, error: "Customer not found" };
}

// ============================================================
// DAILY EMAIL REMINDER — Checks AMC expiry within 7 days
// Trigger: Triggers → Add Trigger → dailyReminderCheck
//          Time-driven → Day timer → 9am to 10am
// ============================================================
function dailyReminderCheck() {
  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues();
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

      if (daysLeft >= 0 && daysLeft <= 7) {
        expiring.push({ customer, daysLeft });
      }
    } catch(e) {}
  }

  if (expiring.length === 0) return; // nothing to send

  // Sort by days left ascending
  expiring.sort((a, b) => a.daysLeft - b.daysLeft);

  // Build email
  let html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0a0f1e;padding:24px;border-radius:8px 8px 0 0;">
        <h2 style="color:#00d4ff;margin:0;">💧 AquaTrack — AMC Expiry Reminder</h2>
        <p style="color:#94a3b8;margin:8px 0 0;">The following customer AMCs are expiring within 7 days</p>
      </div>
      <div style="background:#111827;padding:20px;border-radius:0 0 8px 8px;border:1px solid #1f2d47;">
  `;

  expiring.forEach(({ customer, daysLeft }) => {
    const urgency = daysLeft === 0
      ? '🔴 EXPIRES TODAY'
      : daysLeft <= 2
      ? `🟠 Expires in ${daysLeft} day(s)`
      : `🟡 Expires in ${daysLeft} days`;

    const endFormatted = new Date(customer.amcEnd).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric'
    });

    html += `
      <div style="background:#1a2235;border:1px solid #1f2d47;border-radius:8px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <strong style="color:#e2e8f0;font-size:16px;">${customer.name}</strong>
          <span style="font-size:13px;">${urgency}</span>
        </div>
        <div style="color:#94a3b8;font-size:13px;margin-top:8px;">📅 AMC End Date: <strong style="color:#00d4ff;">${endFormatted}</strong></div>
        ${customer.phone ? `<div style="color:#94a3b8;font-size:13px;margin-top:4px;">📞 ${customer.phone}</div>` : ''}
        ${customer.roModel ? `<div style="color:#94a3b8;font-size:13px;margin-top:4px;">🔧 ${customer.roModel}</div>` : ''}
      </div>`;
  });

  html += `
        <p style="color:#64748b;font-size:12px;margin-top:16px;">
          ${expiring.length} AMC(s) expiring soon. Log in to AquaTrack to take action.
        </p>
      </div>
    </div>`;

  MailApp.sendEmail({
    to: OWNER_EMAIL,
    subject: `⚠️ AquaTrack: ${expiring.length} AMC(s) Expiring Within 7 Days`,
    htmlBody: html
  });
}

// ============================================================
// TEST FUNCTION — Run this manually to verify email works
// ============================================================
function testReminder() {
  try {
    Logger.log("Step 1: Getting data...");
    const { customers } = getAllData();
    const amcCustomers = customers.filter(c => c.customerType !== 'regular' && c.amcEnd);
    Logger.log("AMC customers found: " + amcCustomers.length);

    Logger.log("Step 2: Sending test email...");
    MailApp.sendEmail({
      to: OWNER_EMAIL,
      subject: "AquaTrack — Test Email",
      body: "Email reminders are working!\n\nAMC customers on record: " + amcCustomers.length +
            "\nCustomers: " + amcCustomers.map(c => c.name + " (ends " + c.amcEnd + ")").join(", ")
    });
    Logger.log("Step 3: Email sent successfully!");
  } catch(e) {
    Logger.log("ERROR: " + e.toString());
  }
}
