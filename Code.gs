// Restroom Pass Scanner — Google Apps Script Backend
// Deploy as a Web App (see documentation for instructions)
// Paste this entire file into the Apps Script editor

const SHEET_NAME = 'Log';   // Change if you want a different tab name

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
  if (e.parameter.action === 'read') return readAll();
  return jsonResponse({ ok: true, message: 'Restroom Pass Log API is running.' });
}

/* ── Append a single log entry row ── */
function appendRow(entry) {
  const sheet = getOrCreateSheet();
  sheet.appendRow([
    entry.date     || '',
    entry.time     || '',
    entry.id       || '',
    entry.action   || '',
    entry.minsGone !== null && entry.minsGone !== undefined ? entry.minsGone : ''
  ]);
  return jsonResponse({ ok: true });
}

/* ── Read all rows back as JSON ── */
function readAll() {
  const sheet  = getOrCreateSheet();
  const values = sheet.getDataRange().getValues();

  // Skip header row (index 0)
  const entries = values.slice(1).map(row => ({
    date:     row[0] ? String(row[0]) : '',
    time:     row[1] ? String(row[1]) : '',
    id:       row[2] ? String(row[2]) : '',
    action:   row[3] ? String(row[3]) : '',
    minsGone: row[4] !== '' && row[4] !== null ? Number(row[4]) : null
  }));

  return jsonResponse({ ok: true, entries });
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
    sheet.appendRow(['Date', 'Time', 'Student ID', 'Action', 'Minutes Gone']);

    const header = sheet.getRange(1, 1, 1, 5);
    header.setFontWeight('bold');
    header.setBackground('#ede8f9');
    header.setFontColor('#6d4fb5');

    sheet.setColumnWidth(1, 110);
    sheet.setColumnWidth(2, 110);
    sheet.setColumnWidth(3, 120);
    sheet.setColumnWidth(4, 110);
    sheet.setColumnWidth(5, 120);
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