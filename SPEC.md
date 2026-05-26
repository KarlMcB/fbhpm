# Software Specification: Restroom Pass Manager

**Version:** 1.0
**Date:** 2026-04-05
**Status:** Draft for Review

---

## Table of Contents

1. [Overview](#1-overview)
2. [Users & Use Cases](#2-users--use-cases)
3. [Functional Requirements](#3-functional-requirements)
4. [Data Models](#4-data-models)
5. [Business Rules](#5-business-rules)
6. [User Interface](#6-user-interface)
7. [External Integrations](#7-external-integrations)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Configuration](#9-configuration)
10. [Out of Scope](#10-out-of-scope)

---

## 1. Overview

Restroom Pass Manager is a browser-based web application for school classrooms. A teacher mounts a device (phone or tablet) near the classroom door. Students scan their ID barcode (or enter their ID manually) to check out and back in. The system tracks how long each student is gone, enforces configurable leave limits, and logs all activity to a connected Google Sheet so records persist and multiple devices can stay in sync.

### Goals

- Give teachers a real-time view of which students are currently out of the classroom and for how long.
- Automatically enforce daily and rolling 7-day leave limits per student.
- Log every event to a Google Sheet for accountability and reporting.
- Work reliably on cheap school devices with intermittent connectivity.

### Non-Goals

- This is not a general-purpose attendance or grade management system.
- It does not integrate with any student information system (SIS).

---

## 2. Users & Use Cases

### 2.1 Primary User: Teacher / Monitor

A single teacher or aide operates the device. They do not need to interact with it during normal operation — the system is student-self-service. The teacher may:

- View which students are currently out and for how long.
- Access settings to configure limits and the connected spreadsheet.
- Clear the log at end of day.

### 2.2 Secondary Actor: Student

A student walks up to the device, scans their ID barcode (or taps it in manually), and receives instant visual feedback. On check-out they see a "Take the Pass" message. On check-in they see how many minutes they were gone and whether they were within the time limit.

### 2.3 Key Use Cases

| ID | Use Case | Actor |
|----|----------|-------|
| UC-1 | Check out via barcode scan | Student |
| UC-2 | Check in via barcode scan | Student |
| UC-3 | Check out/in via manual ID entry | Student |
| UC-4 | View current activity log | Teacher |
| UC-5 | View historical log in Google Sheet | Teacher |
| UC-6 | Configure leave limits and max time | Teacher |
| UC-7 | Configure Google Sheets Web App URL | Teacher |
| UC-8 | Clear daily log | Teacher |

---

## 3. Functional Requirements

### 3.1 Barcode Scanning

**REQ-SCAN-1:** The app must access the device camera and continuously decode barcodes in real time using the ZXing MultiFormat reader (supports QR, EAN-13, UPC-A, Code-128, and other common formats).

**REQ-SCAN-2:** When multiple cameras are available, the app must prefer a rear-facing or environment-facing camera. If none is labeled as such, use the last enumerated device. If no camera is available, the scanner section must be hidden and manual entry offered.

**REQ-SCAN-3:** A scanned ID must be ignored if the same ID was processed within the last 2.5 seconds (debounce). This prevents accidental double-scans of a single barcode.

**REQ-SCAN-4:** A scan result must trigger the full processing pipeline (see Section 5.1) within 200 ms of decode.

### 3.2 Manual ID Entry

**REQ-MANUAL-1:** In landscape orientation, a numeric keypad (digits 0–9, backspace, submit) must be visible alongside the scanner. Pressing submit with a non-empty input field must trigger the same processing pipeline as a barcode scan.

**REQ-MANUAL-2:** The keypad input field must be cleared after each submission.

### 3.3 Check-Out / Check-In Toggle

**REQ-TOGGLE-1:** Each student has two states: **in** (present in class) and **out** (currently gone). Default state is **in**.

**REQ-TOGGLE-2:** Processing a student ID flips their state: **in → out** (check-out) or **out → in** (check-in).

**REQ-TOGGLE-3:** On check-out, the current timestamp must be recorded for that student.

**REQ-TOGGLE-4:** On check-in, the elapsed minutes since check-out must be calculated and recorded. If no check-out timestamp is available (e.g., device restart), `minsGone` must be null.

### 3.4 Activity Log

**REQ-LOG-1:** The activity log must display all students currently checked out, showing: student name, time of check-out, and elapsed minutes (updating in real time, recalculated every 10 seconds while any student is out).

**REQ-LOG-2:** Students who have been out longer than `maxMinutes` must be visually distinguished (e.g., highlighted row, warning color).

**REQ-LOG-3:** The log must survive page refresh (persisted to localStorage).

**REQ-LOG-4:** Clearing the log must remove all local state (log entries, student statuses, checkout timestamps) after explicit user confirmation.

### 3.5 Leave Limit Enforcement

**REQ-LIMIT-1:** If `maxDailyLeaves` is greater than 0 and a student has already checked out `maxDailyLeaves` times today, the check-out attempt must be denied. The student must be shown a denial overlay. The event must be logged with `action="denied"` and `incident="Daily leave limit reached"`.

**REQ-LIMIT-2:** If `maxWeeklyLeaves` is greater than 0 and a student has checked out `maxWeeklyLeaves` or more times in the past 7 days (rolling window), the check-out attempt must be denied with the same logging and overlay behavior.

**REQ-LIMIT-3:** Limits of 0 mean unlimited; the check must be skipped entirely.

**REQ-LIMIT-4:** The daily count is the number of `action="out"` log entries for this student where `date` equals today. The 7-day count uses `checkoutTimestamp` (epoch ms) when available, or parses the `date` field as a fallback.

### 3.6 Conflict Detection

**REQ-CONFLICT-1:** If a student attempts to check out while at least one other student is already checked out, a warning overlay must be displayed. The check-out must still proceed (this is a warning, not a hard block).

**REQ-CONFLICT-2:** The event must be logged with `incident="Someone is already checked out"`.

### 3.7 Roster Validation

**REQ-ROSTER-1:** On startup (and after settings are saved), the app must fetch the student roster from the Google Sheet's `Roster` tab. The roster is a list of `{id, name}` pairs.

**REQ-ROSTER-2:** If a scanned/entered ID is not in the roster, the app must display an "ID not recognized" overlay and must not log or change any state. If the roster has not yet loaded successfully, the ID must be treated as valid with name "Unrecognized" rather than rejected.

**REQ-ROSTER-3:** Roster lookups must be O(1) (use a Map or similar structure).

### 3.8 Google Sheets Sync

**REQ-SYNC-1:** Every log entry (check-out, check-in, denied) must be immediately POST-ed to the Google Apps Script Web App as an `append` action.

**REQ-SYNC-2:** The app must poll the sheet every 5 seconds to read the authoritative log and rebuild local state. This enables multi-device operation.

**REQ-SYNC-3:** After a local write, polling must be paused for 5 seconds to avoid the app reading back its own write prematurely.

**REQ-SYNC-4:** If the sheet connection fails, the app must retry every 30 seconds. A sync status indicator must be visible in the header (states: ok / syncing / error).

**REQ-SYNC-5:** When rebuilding state from the sheet, the app must determine row ordering (oldest-first vs. newest-first) by comparing `checkoutTimestamp` values, then normalize to newest-first before processing. The first occurrence of each student ID in the normalized list is their current status.

**REQ-SYNC-6:** A "Clear log" action must POST `action=clear` to the sheet Web App, deleting all data rows and keeping the header.

### 3.9 Settings

**REQ-SETTINGS-1:** Settings must be accessible behind a 4-digit PIN. The PIN is hardcoded at `5700`. Incorrect entry must show an error message that auto-dismisses.

**REQ-SETTINGS-2:** The settings panel must expose: `maxMinutes` (integer, default 15), `maxDailyLeaves` (integer, default 0), `maxWeeklyLeaves` (integer, default 0), orientation override (auto / portrait / landscape), and the Google Apps Script Web App URL.

**REQ-SETTINGS-3:** A "Test Connection" button must make a GET request to the configured URL and display a success or error message.

**REQ-SETTINGS-4:** Settings must persist to localStorage and be loaded on startup.

### 3.10 Visual Feedback

**REQ-VIS-1:** The app must display a full-screen **check-out overlay** on successful check-out: "See You Soon! Please Take The Pass."

**REQ-VIS-2:** The app must display a full-screen **check-in overlay** showing student name, minutes absent, and whether they were within the time limit (on time vs. late). Overlay dismisses on tap.

**REQ-VIS-3:** The app must display a **conflict overlay** when a second student attempts to check out. Auto-dismiss after 10 seconds.

**REQ-VIS-4:** The app must display an **invalid ID overlay** for unrecognized IDs. Auto-dismiss after 3 seconds.

**REQ-VIS-5:** The app must display a **leave limit denied overlay** when check-out is denied. Auto-dismiss after 3 seconds.

**REQ-VIS-6:** The app's color scheme must switch to a **red/alert theme** when at least one student is currently out and within their time limit. It must return to the default **green/neutral theme** when no students are out.

---

## 4. Data Models

### 4.1 Log Entry

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | Date formatted as `M/d/yyyy` |
| `time` | string | Time formatted as `h:mm:ss a` (12-hour) |
| `id` | string | Student ID (matches roster) |
| `name` | string | Student display name |
| `action` | `"out"` \| `"in"` \| `"denied"` | Event type |
| `minsGone` | number \| null | Minutes absent; populated only on `action="in"` |
| `checkoutTimestamp` | number \| null | Unix epoch ms; populated only on `action="out"` |
| `incident` | string | Incident note, empty string if none |

### 4.2 Settings Object

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxMinutes` | integer | 15 | Minutes before absence is flagged as "late" |
| `maxDailyLeaves` | integer | 0 | Max check-outs per day (0 = unlimited) |
| `maxWeeklyLeaves` | integer | 0 | Max check-outs per rolling 7 days (0 = unlimited) |
| `forcedOrientation` | `null` \| `"portrait"` \| `"landscape"` | null | Override device orientation detection |
| `sheetUrl` | string | (default Web App URL) | Google Apps Script deployment URL |

### 4.3 Student Status (runtime/localStorage)

| Key | Value | Description |
|-----|-------|-------------|
| `restroom_pass_status` | `{[studentId]: "in" \| "out"}` | Current in/out state per student |
| `restroom_checkout_times` | `{[studentId]: number}` | Epoch ms of most recent check-out |
| `restroom_pass_log` | `LogEntry[]` | Ordered log (newest first) |
| `restroom_settings` | `Settings` | Persisted settings object |

### 4.4 Google Sheet Structure

#### `Log` Tab

| Column | Header | Content |
|--------|--------|---------|
| A | Date | `M/d/yyyy` |
| B | Time | `h:mm:ss a` |
| C | Student ID | string |
| D | Name | string |
| E | Action | `out` / `in` / `denied` |
| F | Minutes Gone | number or blank |
| G | Checkout Timestamp | epoch ms or blank |
| H | Incident | string or blank |

Row 1 is a header row, bold, purple text on light purple background, frozen.

#### `Roster` Tab

| Column | Header | Content |
|--------|--------|---------|
| A | ID | Student unique identifier |
| B | Name | Student display name |

### 4.5 Google Apps Script API

Base URL: `https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec`

All responses are JSON: `{ ok: boolean, ...payload }` or `{ ok: false, error: string }`.

**GET `?action=read`**
Returns all log entries.
Response: `{ ok: true, entries: LogEntry[] }`

**GET `?action=readRoster`**
Returns the student roster.
Response: `{ ok: true, roster: [{id: string, name: string}] }`

**POST `{ action: "append", entry: LogEntry }`**
Appends one log entry as a new row.
Response: `{ ok: true }`

**POST `{ action: "clear" }`**
Deletes all data rows in the Log tab (keeps header).
Response: `{ ok: true }`

---

## 5. Business Rules

### 5.1 Scan Processing Pipeline

When an ID is received (via scan or manual entry), execute the following steps in order. Abort at the first failing step.

```
1. DEBOUNCE CHECK
   If this ID was processed within the last 2.5 seconds → ignore silently.

2. ROSTER VALIDATION
   If roster is loaded AND ID is not in roster → show invalid-ID overlay, stop.
   If roster is not loaded → continue with name = "Unrecognized".

3. DETERMINE ACTION
   Look up current status for this ID (default: "in").

   IF status is "in" (attempting to CHECK OUT):
     a. DAILY LIMIT CHECK
        If maxDailyLeaves > 0 AND today's out-count >= maxDailyLeaves
        → log denied entry, show denied overlay, stop.

     b. WEEKLY LIMIT CHECK
        If maxWeeklyLeaves > 0 AND 7-day out-count >= maxWeeklyLeaves
        → log denied entry, show denied overlay, stop.

     c. CONFLICT CHECK
        If any other student currently has status="out"
        → set incident = "Someone is already checked out"
        (continue processing — this is a warning only)

     d. EXECUTE CHECK-OUT
        Set status[id] = "out"
        Set checkoutTimes[id] = Date.now()
        Append log entry: action="out", checkoutTimestamp=now, incident=(from c)
        Show check-out overlay.

   IF status is "out" (checking IN):
     a. EXECUTE CHECK-IN
        Set status[id] = "in"
        Calculate minsGone = (Date.now() - checkoutTimes[id]) / 60000, rounded
        Append log entry: action="in", minsGone=minsGone
        Clear checkoutTimes[id]
        Show check-in overlay with minsGone and on-time/late status.

4. PERSIST
   Write updated state to localStorage.
   POST new log entry to Google Sheet (fire-and-forget, non-blocking).
```

### 5.2 Multi-Device Sync State Rebuild

When the app receives entries from the sheet poll:

1. Sort entries to newest-first by comparing `checkoutTimestamp` values of adjacent rows to determine sheet ordering. If the sheet is oldest-first, reverse the array.
2. Walk the sorted entries. For each student ID, record the first (most recent) entry seen. This is their authoritative current status.
3. Rebuild `status` and `checkoutTimes` maps from these authoritative entries.
4. Replace the local log with the sheet entries (sheet is the source of truth).

### 5.3 Theme Logic

After any state change:

- If any student has `status = "out"` → apply alert theme (red).
- Otherwise → apply default theme (green).

This check must run after every scan event and after every sync poll.

---

## 6. User Interface

### 6.1 Layout Modes

The app has two layout modes determined by device orientation (or settings override).

**Portrait mode:** Single-column layout. Scanner occupies the upper portion; activity log occupies the lower portion.

**Landscape mode:** Two-column layout. Left column: scanner + activity log. Right column: numeric keypad for manual ID entry.

Orientation detection must use the `screen.orientation` API with a fallback to `window.innerWidth > window.innerHeight`.

### 6.2 Header

Always visible. Contains:
- App title / logo
- Sync status indicator: one of three states with distinct icons/colors (synced, syncing, error)
- Hamburger menu button that opens the settings drawer

### 6.3 Scanner Component

- Live camera feed in a box with decorative corner markers and an animated scan-line.
- "Start Scanning" button that requests camera permission and begins decoding.
- If camera is unavailable or permission denied, show a clear error message.

### 6.4 Activity Log Table

Columns: Time Out, Name, Action, Minutes Gone.

- Only rows where `action="out"` and the student is still out are shown in the live view.
- Rows where elapsed time > `maxMinutes` must be visually highlighted (e.g., red background or warning icon).
- Time elapsed updates every 10 seconds while any row is visible.

### 6.5 Overlays

All overlays are full-viewport, centered, and displayed above everything else (high z-index).

| Overlay | Trigger | Content | Dismiss |
|---------|---------|---------|---------|
| Check-Out | Successful check-out | "See You Soon! Please Take The Pass." | Auto (3s) or tap |
| Check-In (on time) | Check-in within `maxMinutes` | ✅ Name, X minutes, "Within time limit" | Tap |
| Check-In (late) | Check-in after `maxMinutes` | ⚠️ Name, X minutes, "LATE" | Tap |
| Conflict | Check-out while another out | ⚠️ "Someone is already checked out" | Auto (10s) |
| Invalid ID | ID not in roster | 🚫 "ID not recognized" | Auto (3s) |
| Leave Limit Denied | Limit exceeded | 🚫 "Pass denied – [daily/7-day] limit reached" | Auto (3s) |
| PIN Entry | Settings access | 4-dot PIN input, error state | Cancel button |

### 6.6 Settings Drawer

Slides in from the side (or top) over the main content. Divided into sections:

**General:**
- Max minutes before late (number input)
- Max daily leaves (number input, 0 = unlimited)
- Max weekly leaves (number input, 0 = unlimited)
- Orientation (select: Auto / Portrait / Landscape)

**Google Sheets Sync:**
- Web App URL (text input)
- Test Connection button (shows inline success/error)
- View Spreadsheet button (opens spreadsheet viewer modal)

**Danger Zone:**
- Clear Log button (requires typed confirmation or confirm dialog)

### 6.7 Spreadsheet Viewer Modal

- Displays all entries from the Google Sheet in a scrollable table.
- Columns match the Log tab schema.
- Newest entries first.
- Refresh button to reload.
- Error state if sheet is unreachable.
- Full-screen on small viewports, centered modal on desktop.

### 6.8 Visual Design

- Mobile-first responsive design.
- Two color themes controlled by a CSS class on `<body>`:
  - **Default theme:** Green-dominant palette (calm, all-in state).
  - **Alert theme:** Red-dominant palette (student is currently out).
- Dark mode via `prefers-color-scheme: dark` media query.
- No external CSS frameworks required; CSS custom properties for theming.

---

## 7. External Integrations

### 7.1 Google Apps Script Web App

The backend is a Google Apps Script project deployed as a Web App with "Anyone" access (no authentication required). It must:

- Read from and write to a Google Sheet identified by the spreadsheet ID baked into the script.
- Handle the four API actions described in Section 4.5.
- Return CORS-appropriate headers (`Access-Control-Allow-Origin: *`) so the browser can call it directly.
- Handle OPTIONS preflight requests.

The Apps Script source file (`Code.gs`) is part of this project and must be deployed by the developer via the Google Apps Script editor.

### 7.2 ZXing Barcode Library

- Library: `@zxing/library` v0.18.6
- Load via CDN: `https://unpkg.com/@zxing/library@0.18.6/umd/index.min.js`
- Class used: `ZXing.BrowserMultiFormatReader`
- Camera enumeration must call `listVideoInputDevices()` after a brief initial permission check.

---

## 8. Non-Functional Requirements

### 8.1 Performance

- Scan-to-visual-feedback latency must be under 200 ms on a mid-range Android phone.
- The app must remain usable on devices as old as 2018 with 2 GB RAM.
- Poll requests to Google Sheets must not block the UI (all network calls async/non-blocking).

### 8.2 Reliability / Offline Behavior

- The app must function for check-out/check-in even if the Google Sheet is unreachable. All state is preserved locally and synced when connectivity returns.
- If a sheet write fails, the app must silently retry on the next poll cycle rather than alerting the user for every failure.
- The sync status indicator must turn to "error" state after a failed connection attempt.

### 8.3 Compatibility

- Must work in: Chrome 90+, Safari 14+ (iOS), Firefox 90+.
- Must work without any build step — a single `index.html` file plus `Code.gs` is the entire deliverable.
- Must work when loaded from `localhost`, a local network IP, or any HTTPS origin.

### 8.4 Security

- The settings PIN (`5700`) protects only the settings drawer; it is not a security boundary. The app is intended for a physically controlled environment (classroom device).
- No user credentials or PII beyond student names and IDs are handled. The Google Sheet should have access restricted to appropriate school staff by the deploying teacher.
- All network requests go to Google-hosted infrastructure (Apps Script). No third-party analytics or tracking.

### 8.5 Accessibility

- All overlays must be keyboard-dismissible.
- Font sizes must be legible at arm's length on a tablet (minimum 16px body, 24px+ overlay text).
- Color is not the sole indicator of status (icons accompany all color-coded states).

---

## 9. Configuration

### 9.1 Hardcoded Values (code constants, not user-configurable)

| Constant | Value | Description |
|----------|-------|-------------|
| `SETTINGS_PIN` | `"5700"` | PIN to access settings drawer |
| `SCAN_DEBOUNCE_MS` | `2500` | Milliseconds to ignore repeat scans of same ID |
| `SYNC_POLL_INTERVAL_MS` | `5000` | Sheet poll frequency |
| `SYNC_WRITE_PAUSE_MS` | `5000` | Pause polling after a local write |
| `SYNC_RETRY_INTERVAL_MS` | `30000` | Retry interval after connection failure |
| `LOG_UPDATE_INTERVAL_MS` | `10000` | How often elapsed time refreshes in the log |
| `CONFLICT_OVERLAY_MS` | `10000` | Auto-dismiss duration for conflict overlay |
| `DENIED_OVERLAY_MS` | `3000` | Auto-dismiss duration for denied/invalid overlays |

### 9.2 User-Configurable Settings (stored in localStorage)

See Section 4.2.

### 9.3 Google Apps Script Configuration

The following values are set inside `Code.gs` at deploy time:

| Variable | Description |
|----------|-------------|
| `LOG_SHEET_NAME` | Name of the log tab (default: `"Log"`) |
| `ROSTER_SHEET_NAME` | Name of the roster tab (default: `"Roster"`) |

---

## 10. Out of Scope

The following are explicitly out of scope for this version:

- User accounts or role-based access control.
- Integration with any SIS (PowerSchool, Infinite Campus, etc.).
- Push notifications or SMS alerts.
- Native mobile app (iOS/Android).
- Server-side hosting (this is a static HTML file + Google Apps Script only).
- Printing passes or generating QR codes.
- Reporting dashboards or analytics beyond the raw Google Sheet.
- Configurable PIN (PIN is fixed in code).
- Support for more than one classroom per Google Sheet deployment (each deployment is one classroom).

---

*End of Specification*
