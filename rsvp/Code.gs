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
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(20000);   // two families replying at once must not collide

    var body = JSON.parse(e.postData.contents);
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
