# 💧 AquaTrack — RO Filter AMC Management System

> A full-stack web application for managing Annual Maintenance Contracts (AMC) for RO water filter service businesses. Built with vanilla HTML/CSS/JS on the frontend and Google Apps Script + Google Sheets as the backend and database.

![AquaTrack](https://img.shields.io/badge/AquaTrack-RO%20AMC%20Manager-00d4ff?style=for-the-badge)
![Tech Stack](https://img.shields.io/badge/Stack-HTML%20%7C%20Google%20Apps%20Script%20%7C%20Google%20Sheets-brightgreen?style=for-the-badge)
![Hosted On](https://img.shields.io/badge/Hosted%20On-GitHub%20Pages-black?style=for-the-badge)

---

## 📖 Table of Contents

- [Project Overview](#-project-overview)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Features](#-features)
- [Data Model](#-data-model)
- [Setup & Deployment](#-setup--deployment)
- [API Reference](#-api-reference)
- [Development Journey](#-development-journey)
- [Challenges & Solutions](#-challenges--solutions)
- [Performance Optimizations](#-performance-optimizations)
- [File Structure](#-file-structure)
- [Configuration](#-configuration)

---

## 🎯 Project Overview

AquaTrack was built for a small RO water filter service business that needed a simple way to:

- Track customer AMC contracts (start date, end date, amount paid)
- Log every service visit and the components replaced during each visit
- Automatically calculate **profit or loss** per AMC customer based on component costs
- Get **email reminders** when any AMC contract is about to expire (within 7 days)
- Track **regular (non-AMC) customers** who come in for one-off purchases or complaints
- Manage **complaint tickets** with a pending/done status system

The entire system runs without any paid hosting or a traditional database — Google Sheets serves as the data store and Google Apps Script acts as the REST API backend, all deployed as a Web App for free.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML, CSS, JavaScript (no frameworks) |
| **Backend / API** | Google Apps Script (deployed as Web App) |
| **Database** | Google Sheets (document-oriented JSON storage) |
| **Hosting** | GitHub Pages (static HTML) |
| **Email** | Gmail via `GmailApp` in Apps Script |
| **Fonts** | Google Fonts (Syne, DM Sans, DM Mono) |
| **Auth** | Token-based session auth via Apps Script + Google Sheets |

---

## 🏗 Architecture

```
┌─────────────────────────────────────┐
│         GitHub Pages                │
│    (Static HTML + JS + CSS)         │
│                                     │
│  ┌──────────┐    ┌───────────────┐  │
│  │  Login   │───▶│   Main App    │  │
│  │  Screen  │    │  (SPA-style)  │  │
│  └──────────┘    └──────┬────────┘  │
└─────────────────────────┼───────────┘
                          │ HTTPS POST/GET
                          ▼
┌─────────────────────────────────────┐
│       Google Apps Script            │
│         (Web App / REST API)        │
│                                     │
│  • Auth (login / token / logout)    │
│  • CRUD for customers & services    │
│  • Lightweight index builder        │
│  • CacheService (5 min TTL)         │
│  • Daily email trigger              │
└─────────────────────────┬───────────┘
                          │
                          ▼
┌─────────────────────────────────────┐
│          Google Sheets              │
│                                     │
│  Sheet: AquaTrack                   │
│  ┌────┬──────────┬───────────────┐  │
│  │ ID │   TYPE   │     DATA      │  │
│  │  1 │ CUSTOMER │ {"name":...}  │  │
│  │  2 │ CUSTOMER │ {"name":...}  │  │
│  └────┴──────────┴───────────────┘  │
│                                     │
│  Sheet: AquaTrack_Index (hidden)    │
│  Sheet: Sessions (hidden)           │
└─────────────────────────────────────┘
```

### Why This Architecture?

The business requirement was zero hosting cost and zero server maintenance. Google Apps Script provides a free, always-on HTTPS endpoint that can read/write Google Sheets. GitHub Pages hosts the static frontend for free. Together, this creates a fully functional web app with no monthly costs.

---

## ✨ Features

### Customer Management
- **Dual customer types:** AMC customers (with contract details) and Regular customers (walk-in / one-off)
- Add, edit, and delete customers
- Store: name, phone, address, RO model, notes
- Filter sidebar by All / AMC / Regular
- Live search with 200ms debounce for smooth typing

### AMC Customers
- Track AMC start date, end date, and contract amount
- **Profit/Loss calculation** — AMC amount minus total component costs across all visits
- AMC progress bar showing % of contract period elapsed
- Status badges: Active / Expiring (within 30 days) / Expired
- Sidebar shows 🔴 Pending badge when open complaints exist

### Regular Customers
- Purchase history log with items and prices
- Total visits, total amount spent, last visit date
- Complaint tracking same as AMC customers

### Service Visit Ledger
- Log service visits with: date, type (Free / Complaint / Paid for AMC; Purchase / Complaint for Regular), components replaced with individual prices, and notes
- **Edit** any existing entry — update components, change status, fix mistakes
- **Delete** entries with confirmation
- Complaint entries have a **Pending 🔴 / Done ✅ status** system:
  - Create the entry immediately when a complaint call comes in (Pending)
  - Edit it after the visit to add components and mark as Done
- Pending complaint rows highlighted with a red left border

### Email Reminders
- Daily automated email listing all AMC contracts expiring within 7 days
- Color-coded urgency: 🔴 Today, 🟠 ≤2 days, 🟡 ≤7 days
- Styled HTML email matching the app's dark theme
- Supports multiple recipient emails
- Set up via Google Apps Script Time-driven Trigger (9am daily)

### In-App Reminder Banner
- Yellow warning banner appears at the top of the app
- Shows chips for each expiring AMC — click to jump to that customer

### Security
- Admin login screen with username + password
- **Credentials stored only in Google Apps Script** — never in the HTML
- Server-side token generation (UUID) stored in a hidden Google Sheet
- Every API call validated against token + expiry
- Token expires after 24 hours
- Logout invalidates token server-side immediately
- 800ms artificial delay on failed login to slow brute force attempts
- Wrong password shakes the login card UI

### Mobile Responsive
- Sidebar stacks above main content on small screens
- Service table scrolls horizontally — no columns cut off
- Notes column hidden on mobile to save space
- Modal slides up from bottom on mobile (native feel)

---

## 📊 Data Model

Each customer is stored as a single row in Google Sheets with their entire data (including service history) serialized as JSON in one cell. This is a **document-oriented** approach — similar to how MongoDB stores documents.

```json
{
  "id": 1,
  "customerType": "amc",
  "name": "Ramesh Kumar",
  "phone": "9876543210",
  "address": "Sector 12, Noida",
  "roModel": "Kent Grand Plus",
  "amcAmount": 5000,
  "amcStart": "2025-02-01",
  "amcEnd": "2026-02-01",
  "notes": "",
  "services": [
    {
      "id": "id_1706123456_ab12",
      "date": "2025-05-10",
      "type": "free",
      "status": null,
      "notes": "Routine service",
      "components": [
        { "name": "Sediment Filter", "price": 120 },
        { "name": "Carbon Filter", "price": 180 }
      ]
    },
    {
      "id": "id_1706789012_cd34",
      "date": "2025-09-15",
      "type": "complaint",
      "status": "done",
      "notes": "Low pressure issue",
      "components": [
        { "name": "Membrane", "price": 1800 }
      ]
    }
  ]
}
```

### Google Sheets Structure

| Sheet Name | Purpose | Visibility |
|---|---|---|
| `AquaTrack` | Main data — one row per customer | Visible |
| `AquaTrack_Index` | Lightweight index (name, phone, AMC end, pending count) | Hidden |
| `Sessions` | Auth tokens with expiry timestamps | Hidden |

---

## 🚀 Setup & Deployment

### Step 1 — Google Apps Script

1. Go to [script.google.com](https://script.google.com) → **New Project**
2. Delete the default code and paste the entire contents of `apps-script.js`
3. Update the configuration at the top of the file:
   ```javascript
   const OWNER_EMAILS = [
     "your-email@gmail.com",      // Primary recipient
     "second-email@gmail.com",    // Add as many as needed
   ];
   const ADMIN_USERNAME = "admin";          // Change this
   const ADMIN_PASSWORD = "yourpassword";   // Change this — make it strong
   ```
4. Click **Save** (Ctrl+S)
5. Click **Deploy → New Deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy** → Authorize permissions when prompted
7. Copy the **Web App URL** (looks like `https://script.google.com/macros/s/XXXXX/exec`)

### Step 2 — Set Up Daily Email Trigger

1. In Apps Script editor, click **Triggers** (clock icon in left sidebar)
2. Click **+ Add Trigger**
3. Configure:
   - Function: `dailyReminderCheck`
   - Event source: **Time-driven**
   - Type: **Day timer**
   - Time: **9am to 10am**
4. Click **Save** → Authorize Gmail permissions

### Step 3 — Test Email

1. In Apps Script editor, select `testReminder` from the function dropdown
2. Click ▶ **Run**
3. Authorize Gmail when prompted
4. Check your inbox for the test email

### Step 4 — Frontend Deployment

1. Open `index.html` and update the Script URL:
   ```javascript
   const SCRIPT_URL = 'YOUR_WEB_APP_URL_HERE'; // ← Paste the URL from Step 1
   ```
2. Push `index.html` to your GitHub repository
3. Enable **GitHub Pages** in repository Settings → Pages → Source: main branch
4. Your app is live at `https://yourusername.github.io/your-repo/`

### Step 5 — First Login

1. Open your GitHub Pages URL
2. Enter the username and password you set in Step 1
3. The app will connect to your Google Sheet automatically (the sheet is created if it doesn't exist)

---

## 📡 API Reference

All requests are HTTPS POST to the Apps Script Web App URL. Every request (except `login`) must include a valid `token`.

### Authentication

**Login**
```json
POST { "action": "login", "username": "admin", "password": "yourpassword" }
Response: { "success": true, "token": "uuid-here", "expiresIn": 86400 }
```

**Logout**
```json
POST { "action": "logout", "token": "uuid-here" }
Response: { "success": true }
```

### Data Operations

**Get Index** *(lightweight — for sidebar)*
```json
POST { "action": "getIndex", "token": "..." }
Response: { "customers": [ { "id", "name", "phone", "customerType", "amcEnd", "pendingComplaints", "lastVisit" } ], "nextId": 42 }
```

**Get Single Customer** *(full data — for detail view)*
```json
POST { "action": "getCustomer", "token": "...", "customerId": 1 }
Response: { "customer": { ...full customer object with services array... } }
```

**Save Customer** *(create or update)*
```json
POST { "action": "saveCustomer", "token": "...", "customer": { ...customer object... } }
Response: { "success": true, "action": "inserted" | "updated" }
```

**Delete Customer**
```json
POST { "action": "deleteCustomer", "token": "...", "customerId": 1 }
Response: { "success": true }
```

**Save Service Visit**
```json
POST { "action": "saveService", "token": "...", "customerId": 1, "service": { "id", "date", "type", "status", "notes", "components": [] } }
Response: { "success": true }
```

**Delete Service Visit**
```json
POST { "action": "deleteService", "token": "...", "customerId": 1, "serviceId": "id_xxx" }
Response: { "success": true }
```

---

## 🛤 Development Journey

The project was built incrementally across multiple sessions, with each session adding a new layer of functionality.

### Phase 1 — Core App (localStorage version)
The first version stored all data in the browser's `localStorage`. This worked for a single device but wasn't suitable for real use since data wouldn't sync across devices (phone vs laptop).

### Phase 2 — Google Sheets Backend
Switched to a proper backend using Google Apps Script as a REST API and Google Sheets as the database. The frontend now syncs all data to the cloud on every action.

### Phase 3 — Dual Customer Types
The client realized they needed to track two kinds of customers:
- **AMC Customers** — on annual contracts with full service tracking and profit/loss
- **Regular Customers** — walk-in customers for one-off purchases or complaints, no contract

Added a customer type toggle in the form, filter tabs in the sidebar (All / AMC / Regular), and completely separate detail views for each type.

### Phase 4 — Service Schedule Removal
Originally the app had a complex "service schedule" system where you could define rules like "service every 3 months from start date." After testing, the client decided AMC contracts don't have a fixed visit limit — visits are unlimited — so the entire schedule system was removed to simplify the app.

### Phase 5 — AMC Expiry Email Reminders
Added automated daily email reminders for AMC contracts expiring within 7 days. Originally used `MailApp` but switched to `GmailApp` because `MailApp` only allows sending to the script owner's email, not arbitrary addresses.

### Phase 6 — Edit Service Entries + Complaint Status
Added the ability to edit any service/purchase entry (previously only delete was available). Added a Pending/Done status system specifically for complaint entries — when a complaint call comes in, log it immediately as Pending; after the visit, edit it to add components and mark it Done.

### Phase 7 — Admin Login
Added a login screen so only the admin can access the app. Initially implemented with username/password hardcoded in the HTML — then upgraded to a proper server-side auth system where credentials live only in Apps Script and a UUID session token is used for all subsequent API calls.

### Phase 8 — Mobile Responsiveness
Fixed two major mobile issues discovered through real-world testing on a phone:
1. Sidebar customer names were cramped in a tiny area
2. The service table's edit/delete buttons were cut off and unreachable

### Phase 9 — Performance Optimization
With the potential for 3000–4000 customers, the original architecture of fetching all customer data on every load would become very slow. Implemented a multi-layer optimization strategy.

---

## ⚠️ Challenges & Solutions

### Challenge 1 — `MailApp` vs `GmailApp` Permission Issue

**Problem:** After setting the recipient email to the client's address, the Apps Script threw a permission error. `MailApp.sendEmail()` in a script deployed with "Execute as: Me" can only send to the script owner or contacts — not arbitrary addresses.

**Solution:** Switched from `MailApp` to `GmailApp`. The `GmailApp` service sends emails from the authenticated Gmail account and can send to any address without restriction.

```javascript
// ❌ Before — failed for non-owner addresses
MailApp.sendEmail({ to: OWNER_EMAIL, subject: "...", htmlBody: html });

// ✅ After — works for any address
GmailApp.sendEmail(OWNER_EMAIL, subject, '', { htmlBody: html });
```

---

### Challenge 2 — Regex Removal Wiped Entire File

**Problem:** During the removal of the service schedule system, a regex replacement accidentally matched too broadly and deleted all JavaScript functions after line 562. The file went from ~1150 lines to 562 lines, wiping all CRUD functions.

**Solution:** Manually identified every missing function by diffing against the original and re-appended them one by one. After this incident, all subsequent edits were done using exact string matching instead of regex.

---

### Challenge 3 — `testReminder` Referenced Undefined Variables

**Problem:** The `testReminder` function was written to call the same HTML building code as `dailyReminderCheck`, but it referenced local variables (`expiring`, `html`) that only existed inside `dailyReminderCheck`'s scope. Running it in the Apps Script editor produced a `ReferenceError`.

**Solution:** Rewrote `testReminder` as a fully self-contained function that fetches its own data, builds a simple plain-text email body, and sends without depending on any other function's variables.

---

### Challenge 4 — Credentials in HTML Source

**Problem:** The first version of the login system had the admin username and password hardcoded directly in the HTML file. Since the HTML is publicly hosted on GitHub Pages, anyone could view the page source and find the credentials.

**Solution:** Moved credentials entirely to Google Apps Script (which is not public). The HTML only knows the Apps Script URL. On login, the browser sends credentials to Apps Script over HTTPS, which verifies them and returns a UUID token. All subsequent requests use only the token — the password is never stored in the browser or visible in the HTML.

```
Before: HTML contains password → Anyone with the URL can find it in source
After:  HTML → sends credentials → Apps Script verifies → returns token
        HTML only stores the token, never the password
```

---

### Challenge 5 — Mobile Table Overflow

**Problem:** On mobile phones, the service visit table had too many columns (Date, Type, Status, Components, Cost, Notes, Actions). The Edit and Delete buttons at the right edge were completely cut off and users couldn't scroll to reach them.

**Solution:** Two-part fix:
1. Wrapped the table in a `div` with `overflow-x: auto` so it scrolls horizontally
2. Added a `col-notes` class to the Notes column and set `display: none` on mobile — hiding the least important column frees enough space for the action buttons to be visible without scrolling

---

### Challenge 6 — Slow Initial Load with Growing Data

**Problem:** As customer count grows toward 3000–4000, fetching all customers on every app load becomes slow. Each customer stores their full service history as JSON, so the total payload could be several megabytes.

**Solution:** See [Performance Optimizations](#-performance-optimizations) below.

---

## ⚡ Performance Optimizations

Implemented when planning for scale to 3000–4000 customers.

### 1. Index vs Full Fetch (10x less data on load)

**Before:** `getAll` fetched every customer's complete JSON including all service history on every page load.

**After:** `getIndex` fetches only the lightweight fields needed for the sidebar (id, name, phone, customerType, amcEnd, pendingComplaints, lastVisit). Full service history is only fetched when you actually click on a customer.

```
getAll  → Downloads all 4000 customers × full JSON = ~4MB
getIndex → Downloads all 4000 customers × 7 fields = ~400KB
```

### 2. Lazy Load Customer Detail

Full customer data (including all service visits) is only fetched when the user clicks that customer. It's then stored in `fullCustomerCache` (in-memory JavaScript object) so clicking the same customer again is instant — no network request.

### 3. localStorage Cache for Sidebar

The index is saved to `localStorage` after every fetch. On the next page load, the sidebar renders instantly from the cache while a background network request quietly checks for updates. If the cache is less than 5 minutes old, the background sync is skipped entirely.

```javascript
// App loads → render from localStorage instantly
// Then in background: check if data is stale, refresh if needed
```

### 4. Apps Script CacheService (Server-side Cache)

The `getIndex` function caches its result in Apps Script's `CacheService` for 5 minutes. If 10 users refresh within 5 minutes (or the same user refreshes repeatedly), the Google Sheet is only read once — subsequent requests are served from the server-side cache.

### 5. Debounced Search

Previously, every keystroke in the search box immediately filtered and re-rendered the entire customer list. At 4000 customers this would cause lag. Now there's a 200ms debounce — the filter only runs after the user stops typing.

### 6. Virtual List (200 item cap)

The sidebar never renders more than 200 customer DOM nodes at once. Rendering 4000 list items simultaneously would freeze the browser. If the search has more than 200 results, a message prompts the user to refine their search.

### Performance Summary

| Operation | Before (4000 customers) | After |
|---|---|---|
| App load (first time) | ~4MB fetch, 3-5 seconds | ~400KB index fetch |
| App load (repeat) | Re-fetches everything | Instant from localStorage |
| Click customer | Already in memory (all loaded) | Single customer fetch, then cached |
| Search/type | Filter 4000 full objects | Filter 4000 lightweight index entries |
| Write (save/delete) | Bust all memory, re-fetch | Update only that customer in cache |

---

## 📁 File Structure

```
aquatrack/
│
├── index.html          # Entire frontend — single file SPA
│                       # Contains HTML, CSS, and JavaScript
│
├── apps-script.js      # Google Apps Script backend
│                       # Deploy this as a Web App in script.google.com
│                       # (This file is for reference — paste into Apps Script editor)
│
└── README.md           # This file
```

> **Note:** `apps-script.js` is not served from GitHub Pages. It must be manually copied into the Google Apps Script editor and deployed from there. It's kept in the repository purely for version control and reference.

---

## ⚙️ Configuration

### In `apps-script.js` (Google Apps Script editor)

```javascript
// Email recipients for AMC expiry reminders
const OWNER_EMAILS = [
  "primary@gmail.com",    // ← Change to your email
  "second@gmail.com",     // ← Add more or remove this line
];

// Admin login credentials — stored server-side, never in HTML
const ADMIN_USERNAME = "admin";           // ← Change this
const ADMIN_PASSWORD = "aquatrack2024";   // ← Change to a strong password

// Session token expiry (hours)
const SESSION_HOURS = 24;

// Server-side cache TTL (seconds) — how long getIndex result is cached
const CACHE_TTL = 300; // 5 minutes
```

### In `index.html`

```javascript
// The only thing in the HTML that needs to be configured
const SCRIPT_URL = 'YOUR_APPS_SCRIPT_WEB_APP_URL'; // ← Paste after deploying
```

### Changing the Password

1. Open your Google Apps Script project
2. Change `ADMIN_PASSWORD` to your new password
3. Click Save
4. **Redeploy** (Deploy → Manage Deployments → Edit → New version → Deploy)
5. Log out of the app and log back in with the new password

> ⚠️ Always redeploy after changing Apps Script code. Changes to the script do not take effect until a new version is deployed.

---

## 📝 Notes & Limitations

- **Google Apps Script limits:** Free tier allows 6 minutes of execution per script run and 20,000 UrlFetch calls/day. For a single-admin business app this is more than sufficient.
- **Concurrent writes:** If two people somehow logged in simultaneously and both saved at the same time, there's a theoretical race condition on the Google Sheet row. Not a real concern for a single-admin setup.
- **localStorage cache size:** Browser localStorage is typically limited to 5MB. At large customer counts the index cache may approach this — the code silently skips caching if it fails.
- **Apps Script cold start:** The first API call after a period of inactivity may take 2-3 seconds due to Google's script initialization. Subsequent calls are faster.
- **CORS:** Apps Script Web Apps set `Access-Control-Allow-Origin: *` by default when deployed with "Anyone" access, so no CORS issues from GitHub Pages.

---

## 👤 Author

Built for a real RO filter service business to replace paper-based AMC tracking.

---

*AquaTrack — Because every drop (of data) counts 💧*
