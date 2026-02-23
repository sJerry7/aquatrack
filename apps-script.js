// ============================================================
// AquaTrack — Google Apps Script Backend
// Paste this entire code in Google Apps Script editor
// ============================================================

const SHEET_NAME = "AquaTrack";

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Create header row
    sheet.getRange(1, 1, 1, 3).setValues([["ID", "TYPE", "DATA"]]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  const action = e.parameter.action || (e.postData ? JSON.parse(e.postData.contents).action : null);
  const body = e.postData ? JSON.parse(e.postData.contents) : e.parameter;

  let result;
  try {
    switch (action) {
      case "getAll":      result = getAllData(); break;
      case "saveCustomer": result = saveCustomer(body.customer); break;
      case "deleteCustomer": result = deleteCustomer(body.customerId); break;
      case "saveService":  result = saveService(body.customerId, body.service); break;
      case "deleteService": result = deleteService(body.customerId, body.serviceId); break;
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

// ---- SAVE CUSTOMER (insert or update) ----
function saveCustomer(customer) {
  const sheet = getOrCreateSheet();
  const rows = sheet.getDataRange().getValues();

  // Check if customer already exists
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == customer.id && rows[i][1] === "CUSTOMER") {
      sheet.getRange(i + 1, 3).setValue(JSON.stringify(customer));
      return { success: true, action: "updated" };
    }
  }

  // New customer — append
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

// ---- SAVE SERVICE (updates the customer row which contains services array) ----
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
