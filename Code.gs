// Restroom Pass Scanner — Google Apps Script Backend
// Deploy as a Web App (see documentation for instructions)
// Paste this entire file into the Apps Script editor

const SHEET_NAME  = 'Log';     // Change if you want a different tab name
const ROSTER_NAME = 'Roster';  // Tab where you paste student IDs and names

function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === 'append') return appendRow(data.entry);
    if (action === 'read')   return readAll();
    if (action === 'clear')  return clearLog();

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// Also allow GET for simple testing in a browser tab
function doGet(e) {
  if (e.parameter.action === 'read')        return readAll();
  if (e.parameter.action === 'readRoster')  return readRoster();
  return jsonResponse({ ok: true, message: 'Restroom Pass Log API is running.' });
}

/* ── Append a single log entry row ── */
function appendRow(entry) {
  const sheet = getOrCreateSheet();
  sheet.appendRow([
    entry.date              || '',
    entry.time              || '',
    entry.id                || '',
    entry.name              || '',
    entry.action            || '',
    entry.minsGone !== null && entry.minsGone !== undefined ? entry.minsGone : '',
    entry.checkoutTimestamp || '',
    entry.incident          || ''
  ]);
  return jsonResponse({ ok: true });
}

/* ── Read all rows back as JSON ── */
function readAll() {
  const sheet  = getOrCreateSheet();
  const values = sheet.getDataRange().getValues();

  const tz = Session.getScriptTimeZone();

  // Skip header row (index 0)
  const entries = values.slice(1).map(row => ({
    date:              row[0] instanceof Date ? Utilities.formatDate(row[0], tz, 'M/d/yyyy')    : (row[0] ? String(row[0]) : ''),
    time:              row[1] instanceof Date ? Utilities.formatDate(row[1], tz, 'h:mm:ss a')  : (row[1] ? String(row[1]) : ''),
    id:                row[2] ? String(row[2]) : '',
    name:              row[3] ? String(row[3]) : '',
    action:            row[4] ? String(row[4]) : '',
    minsGone:          row[5] !== '' && row[5] !== null ? Number(row[5]) : null,
    checkoutTimestamp: row[6] ? Number(row[6]) : null,
    incident:          row[7] ? String(row[7]) : ''
  }));

  return jsonResponse({ ok: true, entries });
}

/* ── Read the Roster tab (col A = ID, col B = Name) ── */
function readRoster() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ROSTER_NAME);
  if (!sheet) return jsonResponse({ ok: true, roster: [] });

  const values = sheet.getDataRange().getValues();
  // Skip header row (expected: "ID" / "Name")
  const roster = values.slice(1)
    .filter(row => row[0] !== '' && row[0] !== null && row[0] !== undefined)
    .map(row => ({
      id:   String(row[0]).trim(),
      name: row[1] ? String(row[1]).trim() : ''
    }));

  return jsonResponse({ ok: true, roster });
}

/* ── Clear all data rows, keep header ── */
function clearLog() {
  const sheet   = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
  return jsonResponse({ ok: true });
}

/* ── Get the log sheet, creating it with headers if needed ── */
function getOrCreateSheet() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Date', 'Time', 'Student ID', 'Name', 'Action', 'Minutes Gone', 'Checkout Timestamp', 'Incident']);

    const header = sheet.getRange(1, 1, 1, 8);
    header.setFontWeight('bold');
    header.setBackground('#ede8f9');
    header.setFontColor('#6d4fb5');

    sheet.setColumnWidth(1, 110);
    sheet.setColumnWidth(2, 110);
    sheet.setColumnWidth(3, 120);
    sheet.setColumnWidth(4, 150);
    sheet.setColumnWidth(5, 110);
    sheet.setColumnWidth(6, 120);
    sheet.setColumnWidth(7, 160);
    sheet.setColumnWidth(8, 200);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/* ── Return a JSON ContentService response ── */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
