/**
 * John + Maria — RSVP backend
 *
 * The guest list lives in this spreadsheet and never in the website, so the
 * public repository cannot leak who was invited or how many seats each
 * family was given. The page only ever asks one question — "is this name on
 * the list, and who is in their party?" — and posts back the replies.
 *
 * Setup is in rsvp/README.md. Two sheets are expected:
 *
 *   Guests      A: Party        B: Name
 *   Responses   written by this script; create it empty, or let it appear
 *
 * Deploy as a Web app, execute as yourself, access "Anyone".
 */

var GUEST_SHEET    = 'Guests';
var RESPONSE_SHEET = 'Responses';
var UPLOAD_SHEET   = 'Uploads';

/** Where guest photos and videos land.
 *
 *  Leave this empty and the script makes a folder in the owner's Drive the
 *  first time someone uploads. To use a folder that already exists, put its
 *  ID in the `Settings` tab under the key `uploads` — a cell, not a redeploy. */
var UPLOAD_FOLDER  = '';
var UPLOAD_FOLDER_NAME = 'John + Maria · Guest photos and videos';

/** The ceiling on the fallback path only. The ordinary path streams straight
 *  to Drive from the guest's phone and has no practical limit; this is the
 *  size below which a file can also survive the detour through Apps Script,
 *  which has to carry it base64 encoded. */
var FALLBACK_MAX = 18 * 1024 * 1024;

/** Fallback for who gets an email as each reply lands.
 *
 *  Prefer setting this in the sheet instead — see notifyAddress() below.
 *  Editing this file means redeploying before the change reaches the live
 *  URL, and that trips people up every time. A cell does not. */
var NOTIFY_EMAIL   = '';
var SETTINGS_SHEET = 'Settings';


/* ── helpers ─────────────────────────────────────────────── */

/** Compare names forgivingly: case, accents, punctuation and double spaces
 *  should never be the reason a guest cannot find their own invitation. */
function norm(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')      // punctuation, hyphens, periods
    .replace(/\s+/g, ' ')
    .trim();
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function guestRows() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(GUEST_SHEET);
  if (!sheet) throw new Error('No sheet named "' + GUEST_SHEET + '"');

  var values = sheet.getDataRange().getValues();
  var rows = [];

  for (var i = 1; i < values.length; i++) {          // row 1 is the header
    var party = String(values[i][0] || '').trim();
    var name  = String(values[i][1] || '').trim();
    if (!party || !name) continue;
    rows.push({ party: party, name: name, key: norm(name) });
  }
  return rows;
}


/* ── lookup ──────────────────────────────────────────────── */

function doGet(e) {
  try {
    var typed = norm((e && e.parameter && e.parameter.name) || '');
    if (!typed) return json({ found: false });

    var rows = guestRows();

    // exact match first
    var hit = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].key === typed) { hit = rows[i]; break; }
    }

    // then: every word typed appears in the name, but only when that
    // narrows to exactly one person — never guess between two guests
    if (!hit) {
      var words = typed.split(' ');
      var near = rows.filter(function (row) {
        return words.every(function (w) {
          return row.key.split(' ').indexOf(w) !== -1;
        });
      });
      if (near.length === 1) hit = near[0];
    }

    if (!hit) return json({ found: false });

    var members = rows
      .filter(function (row) { return row.party === hit.party; })
      .map(function (row) { return row.name; });

    return json({ found: true, party: hit.party, members: members });

  } catch (err) {
    return json({ found: false, error: String(err) });
  }
}


/* ── reply ───────────────────────────────────────────────── */

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'bad request' });
  }

  // The same URL serves both the replies and the guests' photos. Anything
  // without an action is a reply, which is how the page asked before uploads
  // existed and how it must keep working.
  switch (body.action) {
    case 'upload-init': return uploadInit(body);
    case 'upload-blob': return uploadBlob(body);
    case 'upload-done': return uploadDone(body);
    default:            return recordReplies(body);
  }
}

function recordReplies(body) {
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(20000);   // two families replying at once must not collide

    var replies = body.replies || [];
    if (!replies.length) return json({ ok: false, error: 'no replies' });

    var book = SpreadsheetApp.getActive();
    var sheet = book.getSheetByName(RESPONSE_SHEET);

    if (!sheet) {
      sheet = book.insertSheet(RESPONSE_SHEET);
      sheet.appendRow(['Replied at', 'Party', 'Guest', 'Reply', 'Looked up as']);
      sheet.setFrozenRows(1);
    }

    var stamp = new Date();
    var rows = replies.map(function (r) {
      return [
        stamp,
        body.party || '',
        r.name || '',
        r.attending ? 'Joyfully accepts' : 'Regretfully declines',
        body.lookup || ''
      ];
    });

    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, 5)
      .setValues(rows);

    notify(body.party, replies);

    return json({ ok: true, recorded: rows.length });

  } catch (err) {
    return json({ ok: false, error: String(err) });

  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}


/* ── the nudge ───────────────────────────────────────────── */

/** A reply that only lands in a spreadsheet is a reply nobody reads until
 *  they remember to look. This sends it. It must never be the reason a
 *  guest sees an error, so it swallows its own failures — the row is
 *  already saved by the time we get here. */
/** Reads the address from a `Settings` tab — column A `notify`, column B the
 *  address — so it can be changed by typing in a cell, with no redeploy.
 *  Falls back to NOTIFY_EMAIL when there is no such tab or row. */
function notifyAddress() {
  try {
    var sheet = SpreadsheetApp.getActive().getSheetByName(SETTINGS_SHEET);
    if (!sheet) return NOTIFY_EMAIL;

    var values = sheet.getDataRange().getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0] || '').trim().toLowerCase() === 'notify') {
        return String(values[i][1] || '').trim() || NOTIFY_EMAIL;
      }
    }
  } catch (ignored) {}

  return NOTIFY_EMAIL;
}

function notify(party, replies) {
  var to = notifyAddress();
  if (!to) return;

  try {
    var yes = replies.filter(function (r) { return r.attending; });
    var no  = replies.filter(function (r) { return !r.attending; });

    var lines = [];
    lines.push(party || 'A guest');
    lines.push('');
    lines.push(yes.length + ' of ' + replies.length + ' attending');
    lines.push('');

    replies.forEach(function (r) {
      lines.push((r.attending ? '  Yes  ' : '  No   ') + (r.name || ''));
    });

    if (no.length) {
      lines.push('');
      lines.push(no.length + (no.length === 1 ? ' seat frees up.' : ' seats free up.'));
    }

    lines.push('');
    lines.push('Full list: ' + SpreadsheetApp.getActive().getUrl());

    MailApp.sendEmail({
      to: to,
      subject: 'RSVP — ' + (party || 'a guest') + ' (' + yes.length + '/' + replies.length + ')',
      body: lines.join('\n')
    });

  } catch (ignored) {
    // the reply is safely recorded; a failed email is not the guest's problem
  }
}


/* ── guest photos and videos ──────────────────────────────────
 *
 * A guest at a wedding is standing in a forest on phone signal, holding a
 * 200 MB video. Carrying those bytes through Apps Script would mean base64
 * encoding them into a single POST, and the big ones simply would not fit.
 *
 * So the bytes never come here. This script only opens a resumable upload
 * session on Drive with its own credentials and hands the session URL back;
 * the phone then streams the file to Google directly, in chunks it can retry
 * one at a time. Nothing about the couple's Drive is exposed by that URL: it
 * accepts the bytes of one named file and nothing else.
 *
 * uploadBlob is the fallback for when that route is unavailable, and is
 * capped, because there it really is Apps Script carrying the payload. */

function settingValue(key) {
  try {
    var sheet = SpreadsheetApp.getActive().getSheetByName(SETTINGS_SHEET);
    if (!sheet) return '';

    var values = sheet.getDataRange().getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0] || '').trim().toLowerCase() === key) {
        return String(values[i][1] || '').trim();
      }
    }
  } catch (ignored) {}
  return '';
}

/** The `uploads` setting may hold a bare folder ID or the whole Drive URL,
 *  because one of those is what you get when you copy from the address bar. */
function uploadFolder() {
  var configured = settingValue('uploads') || UPLOAD_FOLDER;

  if (configured) {
    var match = configured.match(/[-\w]{25,}/);
    if (match) {
      try { return DriveApp.getFolderById(match[0]); } catch (ignored) {}
    }
  }

  var existing = DriveApp.getFoldersByName(UPLOAD_FOLDER_NAME);
  if (existing.hasNext()) return existing.next();

  return DriveApp.createFolder(UPLOAD_FOLDER_NAME);
}

/** Keep the guest's name on the file, since Drive will only ever show the
 *  couple that the script owner uploaded everything. */
function uploadName(from, name) {
  var clean = String(name || 'photo')
    .replace(/[\\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  var who = String(from || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return who ? who + ' · ' + clean : clean;
}

function uploadInit(body) {
  try {
    var size = Number(body.size) || 0;
    var type = String(body.type || 'application/octet-stream');
    var name = uploadName(body.from, body.name);

    var headers = {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Upload-Content-Type': type,
      'X-Upload-Content-Length': String(size)
    };

    // The phone, not this script, is what will PUT the bytes, and that is a
    // cross-origin request. Google decides whether to allow it from the
    // Origin on THIS call, the one that opens the session — so the page
    // sends its own origin along and it is passed through here. Without it
    // the browser's preflight is refused and every upload quietly takes the
    // slow route instead.
    var origin = String(body.origin || '');
    if (/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(origin)) headers.Origin = origin;

    var response = UrlFetchApp.fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
      {
        method: 'post',
        contentType: 'application/json; charset=UTF-8',
        headers: headers,
        payload: JSON.stringify({ name: name, parents: [uploadFolder().getId()] }),
        muteHttpExceptions: true
      });

    if (response.getResponseCode() !== 200) {
      return json({
        ok: false,
        error: 'init ' + response.getResponseCode() + ' ' +
               String(response.getContentText() || '').slice(0, 200)
      });
    }

    // Header capitalisation is not guaranteed, so look for either spelling.
    var sent = response.getAllHeaders();
    var session = sent.Location || sent.location || '';
    if (!session) return json({ ok: false, error: 'no session url' });

    return json({ ok: true, session: session, name: name });

  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/** Small files, when the direct route is unavailable. */
function uploadBlob(body) {
  try {
    var data = String(body.data || '');
    if (!data) return json({ ok: false, error: 'no data' });

    var bytes = Utilities.base64Decode(data);
    if (bytes.length > FALLBACK_MAX) {
      return json({ ok: false, error: 'too large for the fallback route' });
    }

    var name = uploadName(body.from, body.name);
    var blob = Utilities.newBlob(bytes, String(body.type || 'application/octet-stream'), name);
    var file = uploadFolder().createFile(blob);

    logUpload(body.from, name, bytes.length, 'fallback', body.why);
    return json({ ok: true, id: file.getId(), name: name });

  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function uploadDone(body) {
  try {
    logUpload(body.from, body.name, Number(body.size) || 0, 'direct', '');
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/** A log, so the couple can see who sent what without opening every file,
 *  and so a guest who asks "did mine go through" has an answer. It must
 *  never be the reason an upload reports failure: the file is already in
 *  Drive by the time this runs. */
function logUpload(from, name, size, route, note) {
  try {
    var book = SpreadsheetApp.getActive();
    var sheet = book.getSheetByName(UPLOAD_SHEET);

    if (!sheet) {
      sheet = book.insertSheet(UPLOAD_SHEET);
      sheet.appendRow(['Uploaded at', 'From', 'File', 'Size (MB)', 'Route', 'Note']);
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      new Date(),
      String(from || ''),
      String(name || ''),
      Math.round((size / 1048576) * 100) / 100,
      route,
      String(note || '').slice(0, 300)
    ]);
  } catch (ignored) {}
}
