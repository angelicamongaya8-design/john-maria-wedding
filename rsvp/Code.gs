var GUEST_SHEET    = 'Guests';
var RESPONSE_SHEET = 'Responses';
var UPLOAD_SHEET   = 'Uploads';

var UPLOAD_FOLDER  = '';
var UPLOAD_FOLDER_NAME = 'John + Maria · Guest photos and videos';

var BIG_FILES_KEY = 'bigfiles';

var LONG_VIDEO_KEY  = 'longvideo';
var DEFAULT_LONG_MB = 100;

var PHOTO_FOLDER = 'Photos';
var VIDEO_FOLDER = 'Videos';
var LONG_FOLDER  = 'Long videos';

var FALLBACK_MAX = 18 * 1024 * 1024;

var NOTIFY_EMAIL   = '';
var SETTINGS_SHEET = 'Settings';

function norm(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
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

  for (var i = 1; i < values.length; i++) {
    var party = String(values[i][0] || '').trim();
    var name  = String(values[i][1] || '').trim();
    if (!party || !name) continue;
    rows.push({ party: party, name: name, key: norm(name) });
  }
  return rows;
}

function repliedMap() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(RESPONSE_SHEET);
  var map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;

  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var name  = String(values[i][2] || '').trim();
    var reply = String(values[i][3] || '').trim();
    if (!name) continue;
    map[norm(name)] = /joyfully/i.test(reply);
  }
  return map;
}

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.folder) {
      return json({ ok: true, folder: settingValue(BIG_FILES_KEY) });
    }

    var typed = norm((e && e.parameter && e.parameter.name) || '');
    if (!typed) return json({ found: false });

    var rows = guestRows();

    var hit = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].key === typed) { hit = rows[i]; break; }
    }

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

    var already = repliedMap();
    var replied = {};
    members.forEach(function (name) {
      var key = norm(name);
      if (already.hasOwnProperty(key)) replied[name] = already[key];
    });

    return json({ found: true, party: hit.party, members: members, replied: replied });
  } catch (err) {
    return json({ found: false, error: String(err) });
  }
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'bad request' });
  }

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
    lock.waitLock(20000);

    var replies = body.replies || [];
    if (!replies.length) return json({ ok: false, error: 'no replies' });

    var already = repliedMap();
    var fresh = replies.filter(function (r) {
      return !already.hasOwnProperty(norm(r.name || ''));
    });

    if (!fresh.length) {
      return json({ ok: false, error: 'already replied', already: true });
    }
    replies = fresh;

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
  }
}

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

function folderFromSetting(key) {
  var configured = settingValue(key);
  if (!configured) return null;

  var match = configured.match(/[-\w]{25,}/);
  if (!match) return null;

  try { return DriveApp.getFolderById(match[0]); } catch (ignored) { return null; }
}

function uploadFolder() {
  var configured = folderFromSetting('uploads');
  if (configured) return configured;

  if (UPLOAD_FOLDER) {
    try { return DriveApp.getFolderById(UPLOAD_FOLDER); } catch (ignored) {}
  }

  var existing = DriveApp.getFoldersByName(UPLOAD_FOLDER_NAME);
  if (existing.hasNext()) return existing.next();

  return DriveApp.createFolder(UPLOAD_FOLDER_NAME);
}

function childFolder(parent, name) {
  var found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

function destinationFor(type, size) {
  var root = uploadFolder();

  if (String(type || '').indexOf('image/') === 0) {
    return childFolder(root, PHOTO_FOLDER);
  }

  if (size > longVideoBytes()) {
    return folderFromSetting(BIG_FILES_KEY) || childFolder(root, LONG_FOLDER);
  }

  return childFolder(root, VIDEO_FOLDER);
}

function uploadName(from, name) {
  var clean = String(name || 'photo')
    .replace(/[\\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  var who = String(from || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return who ? who + ' · ' + clean : clean;
}

function freeSpace() {
  try {
    var left = DriveApp.getStorageLimit() - DriveApp.getStorageUsed();
    return left > 0 ? left : 0;
  } catch (err) {
    return -1;
  }
}

function longVideoBytes() {
  var raw = String(settingValue(LONG_VIDEO_KEY) || '').trim();
  var match = raw.match(/([\d.]+)\s*(gb|mb)?/i);

  var mb = DEFAULT_LONG_MB;
  if (match) {
    var n = parseFloat(match[1]);
    if (n > 0) mb = /gb/i.test(match[2] || '') ? n * 1024 : n;
  }
  return Math.round(mb * 1024 * 1024);
}

function uploadInit(body) {
  try {
    var size = Number(body.size) || 0;
    var type = String(body.type || 'application/octet-stream');
    var name = uploadName(body.from, body.name);

    var where = body.probe ? uploadFolder() : destinationFor(type, size);

    var headers = {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Upload-Content-Type': type,
      'X-Upload-Content-Length': String(size)
    };

    var origin = String(body.origin || '');
    if (/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(origin)) headers.Origin = origin;

    var response = UrlFetchApp.fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
      {
        method: 'post',
        contentType: 'application/json; charset=UTF-8',
        headers: headers,
        payload: JSON.stringify({ name: name, parents: [where.getId()] }),
        muteHttpExceptions: true
      });

    if (response.getResponseCode() !== 200) {
      return json({
        ok: false,
        error: 'init ' + response.getResponseCode() + ' ' +
               String(response.getContentText() || '').slice(0, 200)
      });
    }

    var sent = response.getAllHeaders();
    var session = sent.Location || sent.location || '';
    if (!session) return json({ ok: false, error: 'no session url' });

    return json({
      ok: true, session: session, name: name,
      folder: where.getName(), free: freeSpace()
    });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function uploadBlob(body) {
  try {
    var data = String(body.data || '');
    if (!data) return json({ ok: false, error: 'no data' });

    var bytes = Utilities.base64Decode(data);
    if (bytes.length > FALLBACK_MAX) {
      return json({ ok: false, error: 'too large' });
    }

    var name = uploadName(body.from, body.name);
    var blob = Utilities.newBlob(bytes, String(body.type || 'application/octet-stream'), name);
    var file = destinationFor(body.type, bytes.length).createFile(blob);

    logUpload(body.from, name, bytes.length, 'fallback', body.why,
      file.getParents().hasNext() ? file.getParents().next().getName() : '');
    return json({ ok: true, id: file.getId(), name: name });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function uploadDone(body) {
  try {
    logUpload(body.from, body.name, Number(body.size) || 0, 'direct', '',
      String(body.folder || ''));
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function logUpload(from, name, size, route, note, folder) {
  try {
    var book = SpreadsheetApp.getActive();
    var sheet = book.getSheetByName(UPLOAD_SHEET);

    if (!sheet) {
      sheet = book.insertSheet(UPLOAD_SHEET);
      sheet.appendRow(['Uploaded at', 'From', 'File', 'Size (MB)', 'Folder', 'Route', 'Note']);
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      new Date(),
      String(from || ''),
      String(name || ''),
      Math.round((size / 1048576) * 100) / 100,
      String(folder || ''),
      route,
      String(note || '').slice(0, 300)
    ]);
  } catch (ignored) {}
}

function authorise() {
  var report = [];

  try {
    var folder = uploadFolder();
    report.push('Drive       OK, uploads land in "' + folder.getName() + '"');
  } catch (err) {
    report.push('Drive       FAILED, ' + err);
    Logger.log(report.join('\n'));
    return;
  }

  try {
    var rows = guestRows();
    var parties = {};
    rows.forEach(function (row) { parties[row.party] = true; });

    report.push('Guest list  OK, ' + rows.length + ' names in '
      + Object.keys(parties).length + ' invitations');
  } catch (err) {
    report.push('Guest list  FAILED, ' + err);
  }

  try {
    var probe = uploadInit({
      from: 'Permission check',
      name: 'delete-me.txt',
      type: 'text/plain',
      size: 1,
      origin: 'https://gelaimongaya-design.github.io'
    });
    var answer = JSON.parse(probe.getContent());

    if (answer.ok && answer.session) {
      var left = freeSpace();
      report.push('Fast route  OK, Google opened an upload session');
      report.push('Long video  over ' + Math.round(longVideoBytes() / 1048576)
        + ' MB goes to "' + (folderFromSetting(BIG_FILES_KEY)
            ? folderFromSetting(BIG_FILES_KEY).getName() : LONG_FOLDER) + '"');
      report.push('Room left   ' + (left < 0
        ? 'unknown'
        : (Math.round((left / 1073741824) * 100) / 100) + ' GB in this Drive'));

      try {
        UrlFetchApp.fetch(answer.session, { method: 'delete', muteHttpExceptions: true });
      } catch (ignored) {}
    } else {
      report.push('Fast route  FAILED, ' + (answer.error || 'no session'));
    }
  } catch (err) {
    report.push('Fast route  FAILED, ' + err);
  }

  Logger.log(report.join('\n'));
}
