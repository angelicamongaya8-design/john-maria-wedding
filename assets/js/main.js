(function(){
  "use strict";

  var overture = document.getElementById('overture');
  var suite    = document.getElementById('suite');
  var score    = document.getElementById('score');
  var toggle   = document.getElementById('music-toggle');
  var calm     = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The invitation is in the document the whole time, just hidden behind the
  // overture — so a browser restoring the last scroll position drops the
  // reader into the middle of the entourage the moment the envelope opens.
  try { history.scrollRestoration = 'manual'; } catch (e) {}
  document.documentElement.classList.add('is-sealed');   // locks scrolling
  window.scrollTo(0, 0);

  /* ── drifting specks ───────────────────────────────────── */
  (function motes(){
    if (calm) return;
    var host = document.getElementById('motes');
    if (!host) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 7; i++){
      var m = document.createElement('span');
      m.className = 'mote';
      m.style.left = (6 + Math.random() * 88).toFixed(2) + '%';
      m.style.animationDuration = (16 + Math.random() * 14).toFixed(1) + 's';
      m.style.animationDelay = (-Math.random() * 22).toFixed(1) + 's';
      frag.appendChild(m);
    }
    host.appendChild(frag);
  })();

  /* ── countdown: 2 Feb 2027, 3:00 PM in Manila ──────────── */
  (function countdown(){
    var when = new Date('2027-02-02T15:00:00+08:00').getTime();
    var d = document.getElementById('c-d'),
        h = document.getElementById('c-h'),
        m = document.getElementById('c-m'),
        s = document.getElementById('c-s');
    if (!d) return;

    function pad(n){ return n < 10 ? '0' + n : String(n); }

    function tick(){
      var left = when - Date.now();
      if (left <= 0){
        d.textContent = h.textContent = m.textContent = s.textContent = '00';
        var label = document.querySelector('#count');
        if (label) label.setAttribute('data-done', 'true');
        clearInterval(timer);
        return;
      }
      var sec = Math.floor(left / 1000);
      d.textContent = String(Math.floor(sec / 86400));
      h.textContent = pad(Math.floor(sec / 3600) % 24);
      m.textContent = pad(Math.floor(sec / 60) % 60);
      s.textContent = pad(sec % 60);
    }
    tick();
    var timer = setInterval(tick, 1000);
  })();

  /* ─────────────────────────────────────────────────────────
     RSVP

     Paste the Google Apps Script web app URL below — the one ending
     in /exec — and the form appears. Leave it empty and the section
     falls back to a quiet line, with nothing broken on
     screen. The guest list itself never lives in this page: it stays
     in the couple's private Sheet, so a public repo cannot leak who
     was invited or how many seats they were given.
     ───────────────────────────────────────────────────────── */
  var RSVP_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwlQBPyX8trdCC81Dh9jSd6EGbNR2GF01Y-fVlDCbKOrogHUe4VaJHzKKylUycxhKsFVQ/exec';

  (function rsvp(){
    var find   = document.getElementById('rsvp-find');
    var input  = document.getElementById('rsvp-name');
    var look   = document.getElementById('rsvp-look');
    var msg    = document.getElementById('rsvp-msg');
    var party  = document.getElementById('rsvp-party');
    var seats  = document.getElementById('rsvp-seats');
    var seatsL = document.getElementById('rsvp-seats-l');
    var list   = document.getElementById('rsvp-guests');
    var others = document.getElementById('rsvp-others');
    var send   = document.getElementById('rsvp-send');
    var again  = document.getElementById('rsvp-again');
    var alt    = document.getElementById('rsvp-alt');

    if (!find || !RSVP_ENDPOINT) return;   // not connected yet

    find.hidden = false;
    if (alt) alt.textContent = 'If your name does not come up, kindly let us know';

    var current = null;   // { party, members, me }

    /* Same forgiveness the script applies, so the page can work out WHICH
       member of the party was looked up without another round trip. */
    function norm(value){
      return String(value == null ? '' : value)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function whoWasLookedUp(typed, members){
      var key = norm(typed);

      for (var i = 0; i < members.length; i++){
        if (norm(members[i]) === key) return members[i];
      }

      var words = key.split(' ');
      var near = members.filter(function(m){
        var parts = norm(m).split(' ');
        return words.every(function(w){ return parts.indexOf(w) !== -1; });
      });

      return near.length === 1 ? near[0] : null;
    }

    function say(text, tone){
      if (!text){ msg.hidden = true; return; }
      msg.textContent = text;
      msg.setAttribute('data-tone', tone || 'soft');
      msg.hidden = false;
    }

    function busy(el, on, label){
      el.disabled = on;
      el.textContent = on ? label : el.getAttribute('data-idle');
    }

    look.setAttribute('data-idle', look.textContent);
    send.setAttribute('data-idle', send.textContent);

    /* ── find the invitation ── */
    find.addEventListener('submit', function(ev){
      ev.preventDefault();
      var name = input.value.trim();
      if (!name){ say('Please enter your name first.'); input.focus(); return; }

      party.hidden = true;
      say('');
      busy(look, true, 'Looking…');

      fetch(RSVP_ENDPOINT + '?name=' + encodeURIComponent(name))
        .then(function(r){ return r.json(); })
        .then(function(data){
          busy(look, false);
          if (!data || !data.found){
            say('We could not find that name. Kindly try your full name. If it still does not come up, please let us know.', 'bad');
            return;
          }
          current = data;
          render(data);
        })
        .catch(function(){
          busy(look, false);
          say('Something went wrong reaching our guest list. Please try again in a moment, or let us know.', 'bad');
        });
    });

    /* ── show the invitation ──
       Everyone on the invitation gets a control, as in the reference the
       couple chose. But only the ones actually answered are sent: a parent
       can reply for their children in one pass, and anyone unsure of
       another adult simply leaves them blank for that person to answer.
       Unanswered names are therefore visibly outstanding in the sheet,
       rather than indistinguishable from a family that never replied. */
    function render(data){
      var members = data.members || [];
      current = { party: data.party || '', members: members, done: {} };

      seats.textContent = members.length;
      seatsL.textContent = members.length === 1 ? 'seat' : 'seats';

      list.textContent = '';
      members.forEach(function(person, i){ list.appendChild(guestRow(person, i)); });

      others.hidden = members.length < 2;
      party.hidden = false;
      again.hidden = true;
      busy(send, false);
      say('');
      party.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
    }

    function guestRow(person, i){
      var li = document.createElement('li');
      var wrap = document.createElement('div');
      wrap.className = 'guest';
      wrap.setAttribute('data-guest', String(i));

      var n = document.createElement('p');
      n.className = 'guest-n';
      n.textContent = person;
      wrap.appendChild(n);

      var reply = document.createElement('div');
      reply.className = 'reply';
      reply.setAttribute('role', 'radiogroup');
      reply.setAttribute('aria-label', 'Reply for ' + person);

      [['yes', 'Joyfully accepts'], ['no', 'Regretfully declines']].forEach(function(opt){
        var id = 'g' + i + '-' + opt[0];
        var r = document.createElement('input');
        r.type = 'radio'; r.name = 'guest-' + i; r.id = id; r.value = opt[0];
        var l = document.createElement('label');
        l.setAttribute('for', id);
        l.textContent = opt[1];
        reply.appendChild(r);
        reply.appendChild(l);
      });

      reply.addEventListener('change', function(){ say(''); });

      wrap.appendChild(reply);
      li.appendChild(wrap);
      return li;
    }

    /** Swap a recorded guest's control for the reply itself, so a second
     *  pass shows what is already in and what is still owed. */
    function markDone(i, person, attending){
      var wrap = list.querySelector('[data-guest="' + i + '"]');
      if (!wrap) return;
      var reply = wrap.querySelector('.reply');
      if (reply) reply.remove();

      var done = document.createElement('p');
      done.className = 'reply-done';
      done.textContent = attending ? 'Joyfully accepts' : 'Regretfully declines';
      wrap.appendChild(done);
      wrap.classList.add('is-done');

      current.done[person] = true;
    }

    /* ── back to the search, for another invitation ── */
    function reset(){
      current = null;
      party.hidden = true;
      again.hidden = true;
      find.hidden = false;
      busy(send, false);
      say('');
      input.value = '';
      input.focus();
      find.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
    }

    again.addEventListener('click', reset);

    /* ── send it ── */
    send.addEventListener('click', function(){
      if (!current) return;

      var members = current.members || [];
      var replies = [];

      members.forEach(function(person, i){
        if (current.done[person]) return;                    // already recorded
        var picked = list.querySelector('input[name="guest-' + i + '"]:checked');
        if (picked) replies.push({ index: i, name: person, attending: picked.value === 'yes' });
      });

      if (!replies.length){
        say('Kindly reply for at least one guest before confirming.', 'bad');
        return;
      }

      busy(send, true, 'Sending');
      say('');

      // text/plain keeps this a simple request. Apps Script cannot answer
      // the CORS preflight that application/json would trigger
      fetch(RSVP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          party: current.party || '',
          lookup: input.value.trim(),
          replies: replies.map(function(r){ return { name: r.name, attending: r.attending }; })
        })
      })
        .then(function(r){ return r.json(); })
        .then(function(res){
          if (!res || !res.ok) throw new Error('rejected');

          replies.forEach(function(r){ markDone(r.index, r.name, r.attending); });

          var waiting = members.filter(function(m){ return !current.done[m]; });
          var names = replies.map(function(r){ return r.name; });

          busy(send, false);

          if (!waiting.length){
            party.hidden = true;
            again.hidden = false;
            say('Thank you. Your reply is in, and we cannot wait to celebrate with you.');
            msg.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
            return;
          }

          send.hidden = false;
          again.hidden = false;
          say('Recorded for ' + names.join(', ') + '. '
            + (waiting.length === 1 ? waiting[0] + ' has' : waiting.join(', ') + ' have')
            + ' still to reply, whenever is convenient.');
        })
        .catch(function(){
          busy(send, false);
          say('We could not record that just now. Please try again in a moment.', 'bad');
        });
    });
  })();

  /* ─────────────────────────────────────────────────────────
     GUESTS SENDING THEIR OWN PHOTOS

     A guest is standing in a forest holding a 200 MB video on whatever
     signal reaches Antipolo. Two things follow from that.

     First, the bytes go straight from the phone to Google, never through
     the script: the script only opens an upload session and hands back the
     URL. So there is no ceiling on size, and a chunk that fails can be
     retried on its own instead of restarting the file.

     Second, everything is sequential and visible. One file at a time, a
     thread filling under each, and a failure says so rather than leaving
     someone to wonder — the worst outcome here is a guest who believes
     their photos are safely sent when they are not.
     ───────────────────────────────────────────────────────── */
  (function share(){
    var box    = document.getElementById('share');
    var nameEl = document.getElementById('share-name');
    var pick   = document.getElementById('share-pick');
    var choose = document.getElementById('share-choose');
    var list   = document.getElementById('share-list');
    var msg    = document.getElementById('share-msg');
    var send   = document.getElementById('share-send');
    var again  = document.getElementById('share-again');

    if (!box || !RSVP_ENDPOINT) return;   // nothing to upload to
    box.hidden = false;

    var CHUNK = 4 * 1024 * 1024;          // per PUT, so a retry is cheap
    var CHUNK_TRIES = 3;                  // forest signal drops; one drop is not a failure
    var FALLBACK_MAX = 18 * 1024 * 1024;  // matches the script's own ceiling
    var picked = [];
    var sending = false;

    /* Once the direct route has been refused, it will be refused again for
       every other file in the batch. Finding that out costs a round trip to
       Apps Script each time, which is exactly the waiting the guest notices,
       so the answer is remembered for the rest of the visit. */
    var directWorks = true;

    /* Where a guest can put a video this page cannot carry. Asked for only
       when that actually happens, so an ordinary visit never pays for it. */
    var bigFiles = null;

    function dropOff(){
      if (bigFiles !== null) return Promise.resolve(bigFiles);

      return fetch(RSVP_ENDPOINT + '?folder=1')
        .then(function(r){ return r.json(); })
        .then(function(res){
          bigFiles = (res && res.folder) || '';
          return bigFiles;
        })
        .catch(function(){ bigFiles = ''; return ''; });
    }

    /** The closing line, with a real place to go when one is configured.
     *  Built as a link rather than pasted as text, because a guest holding a
     *  phone is not going to retype a Drive URL. */
    function sayWithDropOff(before, after, tone){
      dropOff().then(function(url){
        if (!url){
          say(before + 'kindly send those to us directly. ' + after, tone);
          return;
        }

        msg.textContent = '';
        msg.appendChild(document.createTextNode(before));

        var a = document.createElement('a');
        a.className = 'map-cta';
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'drop them here instead';
        msg.appendChild(a);

        msg.appendChild(document.createTextNode('. ' + after));
        msg.hidden = false;
        if (tone) msg.setAttribute('data-tone', tone);
        else msg.removeAttribute('data-tone');
      });
    }

    function say(text, tone){
      if (!text){ msg.hidden = true; return; }
      msg.textContent = text;
      msg.hidden = false;
      if (tone) msg.setAttribute('data-tone', tone);
      else msg.removeAttribute('data-tone');
    }

    function mb(bytes){
      return bytes < 1048576
        ? Math.max(1, Math.round(bytes / 1024)) + ' KB'
        : (Math.round((bytes / 1048576) * 10) / 10) + ' MB';
    }

    /* ── the list ── */
    function draw(){
      list.textContent = '';

      picked.forEach(function(entry, i){
        var li = document.createElement('li');
        li.className = 'share-item';
        li.setAttribute('data-i', String(i));

        var f = document.createElement('p');
        f.className = 'share-f';
        f.textContent = entry.file.name;

        var s = document.createElement('p');
        s.className = 'share-s';
        s.textContent = mb(entry.file.size);

        var bar = document.createElement('div');
        bar.className = 'share-bar';
        bar.appendChild(document.createElement('span'));

        li.appendChild(f);
        li.appendChild(s);
        li.appendChild(bar);
        list.appendChild(li);
      });

      send.hidden = !picked.length;
    }

    function row(i){ return list.querySelector('[data-i="' + i + '"]'); }

    function progress(i, fraction){
      var li = row(i); if (!li) return;
      var fill = li.querySelector('.share-bar span');
      if (fill) fill.style.width = Math.round(fraction * 100) + '%';

      // A bar alone on a long upload reads as stuck. A number does not.
      // Once a row has its verdict, the percentage must not write over it.
      var s = li.querySelector('.share-s');
      if (s && !li.classList.contains('is-done') && !li.classList.contains('is-failed')){
        s.textContent = Math.round(fraction * 100) + '%';
      }
    }

    function state(i, text, klass){
      var li = row(i); if (!li) return;
      var s = li.querySelector('.share-s');
      if (s) s.textContent = text;
      if (klass) li.classList.add(klass);
    }

    choose.addEventListener('click', function(){ pick.click(); });

    pick.addEventListener('change', function(){
      var chosen = Array.prototype.slice.call(pick.files || []);
      if (!chosen.length) return;

      if (picked.length && picked.every(function(p){ return p.done || p.hopeless; })) picked = [];

      chosen.forEach(function(file){
        picked.push({ file: file, done: false });
      });
      send.textContent = 'Send them';

      draw();

      // Once the slow route is the only one left, a file over its ceiling can
      // be called before anyone waits on it rather than after.
      var overCap = 0;
      if (!directWorks){
        picked.forEach(function(p, i){
          if (p.done || p.file.size <= FALLBACK_MAX) return;
          p.hopeless = true;
          overCap++;
          state(i, 'Too large to send', 'is-failed');
        });
      }

      var heavy = picked.filter(function(p){ return !p.hopeless && p.file.size > 200 * 1048576; });
      var total = picked.reduce(function(n, p){ return n + p.file.size; }, 0);

      var opening = (picked.length === 1 ? 'One file' : picked.length + ' files')
        + ', ' + mb(total) + ' in all. ';
      var closing = heavy.length
        ? 'A long video takes many minutes on phone signal, so keep this page open. If it is easier, send it later on wifi.'
        : 'Keep this page open while they go.';

      if (overCap){
        sayWithDropOff(
          opening + (overCap === 1 ? 'One is' : overCap + ' are')
            + ' longer than this page can carry, so ',
          closing);
      } else {
        say(opening + closing);
      }
    });

    /** Apps Script is not fast, and a request to it can also simply hang.
     *  Either way the guest should be moved on to the route that works
     *  rather than left watching a spinner. */
    function ask(payload, ms){
      return new Promise(function(resolve, reject){
        var settled = false;
        var timer = window.setTimeout(function(){
          if (!settled){ settled = true; reject(new Error('timeout')); }
        }, ms || 20000);

        fetch(RSVP_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        })
        .then(function(r){ return r.json(); })
        .then(function(res){
          if (settled) return;
          settled = true; window.clearTimeout(timer); resolve(res);
        })
        .catch(function(err){
          if (settled) return;
          settled = true; window.clearTimeout(timer); reject(err);
        });
      });
    }

    /* ── one file, streamed to Drive in chunks ── */
    function putDirect(entry, i){
      return ask({
        action: 'upload-init',
        from: nameEl.value.trim(),
        name: entry.file.name,
        type: entry.file.type || 'application/octet-stream',
        size: entry.file.size,
        // Google decides whether the phone may PUT to the session from this
        // page, and it decides from the origin on the call that opens it.
        origin: window.location.origin
      })
      .then(function(res){
        if (!res || !res.ok || !res.session){
          throw new Error('init: ' + ((res && res.error) || 'no session'));
        }
        return putChunks(res.session, entry, i).then(function(){
          // The log is a convenience, never a reason to keep the guest
          // waiting and never a reason to call a sent file failed.
          ask({
            action: 'upload-done',
            from: nameEl.value.trim(),
            name: res.name || entry.file.name,
            size: entry.file.size
          }).catch(function(){});
        });
      });
    }

    function putChunks(session, entry, i){
      var total = entry.file.size;

      /** One chunk, with its own retries. Nothing here advances the offset:
       *  a retry that also retried the rest of the file would multiply
       *  attempts and re-send bytes Google already has. */
      function sendChunk(start, end, tries){
        return fetch(session, {
          method: 'PUT',
          headers: {
            'Content-Range': 'bytes ' + start + '-' + (end - 1) + '/' + total
          },
          body: entry.file.slice(start, end)
        })
        .catch(function(){
          // A blocked cross-origin request reaches JavaScript as nothing at
          // all, so a CORS refusal and a dropped signal land here alike.
          // They are told apart by whether a retry ever gets through.
          throw new Error('chunk: blocked or offline');
        })
        .then(function(r){
          // 308 means Google has the chunk and wants the next one.
          if (r.status === 200 || r.status === 201 || r.status === 308) return r.status;
          throw new Error('chunk: ' + r.status);
        })
        .catch(function(err){
          // Half an hour of a guest's upload should not be thrown away
          // because one 4 MB piece met a dead spot under the trees.
          var n = (tries || 0) + 1;
          if (n >= CHUNK_TRIES) throw err;

          return new Promise(function(resolve){
            window.setTimeout(resolve, 1500 * n);
          }).then(function(){ return sendChunk(start, end, n); });
        });
      }

      function step(start){
        if (start >= total) return Promise.resolve();

        var end = Math.min(start + CHUNK, total);
        return sendChunk(start, end, 0).then(function(status){
          progress(i, end / total);
          if (status === 308) return step(end);
        });
      }

      return step(0);
    }

    /* ── the fallback, for small files, when the direct route is shut ── */
    function putThroughScript(entry, i, why){
      if (entry.file.size > FALLBACK_MAX){
        return Promise.reject(new Error('too large'));
      }

      return new Promise(function(resolve, reject){
        var reader = new FileReader();
        reader.onerror = function(){ reject(new Error('unreadable')); };
        reader.onload = function(){
          var data = String(reader.result || '');
          var comma = data.indexOf(',');
          resolve(comma === -1 ? data : data.slice(comma + 1));
        };
        reader.readAsDataURL(entry.file);
      })
      .then(function(base64){
        progress(i, 0.6);
        return fetch(RSVP_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'upload-blob',
            from: nameEl.value.trim(),
            name: entry.file.name,
            type: entry.file.type || 'application/octet-stream',
            why: String(why || ''),
            data: base64
          })
        });
      })
      .then(function(r){ return r.json(); })
      .then(function(res){
        if (!res || !res.ok) throw new Error((res && res.error) || 'refused');
        progress(i, 1);
      });
    }

    function sendOne(entry, i){
      if (entry.done) return Promise.resolve(true);
      state(i, 'Sending');

      var route = directWorks
        ? putDirect(entry, i).catch(function(err){
            directWorks = false;         // do not pay for this discovery twice
            // Slower, and capped, but at least the photo arrives. The reason
            // goes into the sheet rather than in front of the guest.
            return putThroughScript(entry, i, err && err.message);
          })
        : putThroughScript(entry, i, 'direct route already refused this visit');

      return route
        .then(function(){
          entry.done = true;
          state(i, 'Sent', 'is-done');
          return true;
        })
        .catch(function(err){
          var tooBig = String(err && err.message) === 'too large';
          entry.hopeless = tooBig;       // retrying this changes nothing
          state(i, tooBig ? 'Too large to send' : 'Did not send', 'is-failed');
          progress(i, 0);
          return false;
        });
    }

    /** After everything on the list is in, the same button has to mean
     *  something different: there is nothing left to send, so it opens the
     *  picker for the next batch. Leaving it saying "Send more" while doing
     *  nothing is what a guest reads as broken. */
    function clearSent(){
      picked = picked.filter(function(p){ return !p.done && !p.hopeless; });
      draw();
      say('');
    }

    /** What is left that another tap could actually change. A file the script
     *  will never accept is not one of them. */
    function retryable(){
      return picked.filter(function(p){ return !p.done && !p.hopeless; });
    }

    function startPicking(){
      picked = [];
      draw();
      say('');
      again.hidden = true;
      pick.value = '';     // choosing the same file again still counts as a change
      pick.click();
    }

    again.addEventListener('click', startPicking);

    send.addEventListener('click', function(){
      if (sending) return;

      if (!retryable().length){
        startPicking();
        return;
      }

      if (!nameEl.value.trim()){
        say('Kindly add your name first, so we know whose photos these are.', 'bad');
        nameEl.focus();
        return;
      }

      sending = true;
      send.disabled = true;
      send.textContent = 'Sending';
      say('Please keep this page open until it says they are through.');

      var sent = 0, failed = 0;

      var run = picked.reduce(function(chain, entry, i){
        return chain.then(function(){
          if (entry.done || entry.hopeless) return;
          return sendOne(entry, i).then(function(ok){
            if (ok) sent++; else failed++;
          });
        });
      }, Promise.resolve());

      run.then(function(){
        sending = false;
        send.disabled = false;

        var left = retryable().length;
        var tooBig = picked.filter(function(p){ return p.hopeless; }).length;

        // Always a way onward from the bottom of the list, whatever happened.
        again.hidden = false;
        send.textContent = left ? 'Try the rest again' : 'Send more photos';

        if (!failed){
          say(sent === 1
            ? 'Sent. Thank you for sharing it.'
            : 'All ' + sent + ' sent. Thank you for sharing them.');
          return;
        }

        var lines = [];
        if (sent) lines.push(sent + (sent === 1 ? ' sent' : ' sent'));
        if (tooBig) lines.push(tooBig + (tooBig === 1 ? ' too large to send' : ' too large to send'));
        if (left) lines.push(left + ' still to try');

        var closing = left
          ? 'Tap again for the rest.'
          : 'Tap Choose other photos for another batch.';

        if (tooBig){
          sayWithDropOff(
            lines.join(', ') + '. A long video is beyond what this page can carry, so ',
            closing, 'bad');
        } else {
          say(lines.join(', ') + '. ' + closing, 'bad');
        }
      });
    });
  })();

  /* ── music ─────────────────────────────────────────────── */
  var LEVEL = 0.55;
  var scoreBroken = false;
  var fadeTimer = null;

  function showToggle(){ if (!scoreBroken) toggle.hidden = false; }
  function breakScore(){ scoreBroken = true; toggle.hidden = true; }

  // iOS never fires canplay before a user gesture, so don't gate the control on it
  score.addEventListener('loadedmetadata', showToggle);
  score.addEventListener('canplay', showToggle);
  score.addEventListener('error', breakScore);
  var src = score.querySelector('source');
  if (src) src.addEventListener('error', breakScore);

  function setPlaying(on){
    toggle.classList.toggle('is-playing', on);
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    toggle.setAttribute('aria-label', on ? 'Pause music' : 'Play music');
  }

  function fadeUp(){
    clearInterval(fadeTimer);
    var step = 0;
    fadeTimer = setInterval(function(){
      step += 1;
      score.volume = Math.min(LEVEL, (step / 44) * LEVEL);
      if (step >= 44) clearInterval(fadeTimer);
    }, 50);
  }

  function play(silent){
    if (scoreBroken) return;
    score.volume = silent ? 0 : LEVEL;
    var attempt = score.play();
    if (attempt && typeof attempt.then === 'function'){
      attempt.then(function(){
        showToggle(); setPlaying(true);
      }).catch(function(){
        // autoplay refused — leave the control ready for a deliberate tap
        clearInterval(fadeTimer);
        score.volume = LEVEL;
        showToggle(); setPlaying(false);
      });
    } else {
      showToggle(); setPlaying(true);
    }
  }

  // Playback has to begin inside the tap that opened the envelope — that
  // gesture is what browsers grant permission on. So it starts silent, and
  // the volume only comes up once the invitation itself is on screen.
  function startScore(){ play(true); }

  toggle.addEventListener('click', function(){
    if (score.paused){
      play(false);
    } else {
      clearInterval(fadeTimer);
      score.pause();
      setPlaying(false);
    }
  });

  // pausing the tab shouldn't leave music running behind them
  document.addEventListener('visibilitychange', function(){
    if (document.hidden && !score.paused){
      score.pause();
      setPlaying(false);
    }
  });

  /* ── opening the envelope ──────────────────────────────── */

  // Card finishes rising at ~1.5s and is held still so it can be read.
  // Then it expands until it IS the page — the envelope is what the
  // invitation comes out of, so the card has to carry the handover rather
  // than the two cross-fading past each other.
  var RISEN = 1500;       // card is clear of the envelope by here
  var HOLD = 3400;        // card readable until here
  var ZOOM = 1250;        // card grows to fill the screen
  var HOLD_CALM = 1600;   // no motion: just time enough to read it

  var card     = document.querySelector('.env-card');
  var envelope = document.querySelector('.envelope');
  var leaf     = document.querySelector('.leaf');

  var opened = false;
  var handoff = null;

  // The card grows into the page by animating its BOX, not by scaling.
  // Scaling a landscape card until it covers a portrait screen means a 5x
  // blow-up and a shape that never matches the page — it stops reading as
  // the same piece of paper. Widening and lengthening the sheet does.
  function zoomCard(){
    if (!overture.isConnected || calm) return enterSuite();
    window.clearTimeout(handoff);

    var EASE = 'cubic-bezier(.4, 0, .2, 1)';
    var here = card.getBoundingClientRect();

    // The envelope sets perspective, and gets a transform on the way out.
    // Both make it the containing block for position:fixed descendants, so
    // a card left inside it would size against the ENVELOPE and stop at
    // ~300px instead of covering the screen. Lift it out first.
    overture.appendChild(card);

    // pin it exactly where it appears, in viewport coordinates, with the
    // rise folded into left/top so no transform is left to fight
    card.style.transition = 'none';
    card.style.transform  = 'none';
    card.style.position   = 'fixed';
    card.style.margin     = '0';
    card.style.right  = 'auto';
    card.style.bottom = 'auto';
    card.style.left   = here.left   + 'px';
    card.style.top    = here.top    + 'px';
    card.style.width  = here.width  + 'px';
    card.style.height = here.height + 'px';

    void card.offsetWidth;   // commit that state before animating away from it

    overture.classList.add('is-zooming');

    card.style.transition = [
      'left '   + ZOOM + 'ms ' + EASE,
      'top '    + ZOOM + 'ms ' + EASE,
      'width '  + ZOOM + 'ms ' + EASE,
      'height ' + ZOOM + 'ms ' + EASE,
      'background .5s ease',
      'border-color .45s ease',
      'box-shadow .5s ease'
    ].join(', ');

    // Land on the sheet the invitation is actually printed on, not the whole
    // window. On a wide screen the page is a column of paper on a deeper
    // ground, so a card that grew edge to edge arrived as the wrong object.
    // The leaf fills the width on a phone, so this is right at both ends.
    var sheet = leaf ? leaf.getBoundingClientRect() : null;

    card.style.background  = 'var(--paper)';
    card.style.borderColor = 'transparent';
    card.style.boxShadow   = '0 0 70px -34px rgba(17,17,16,.30)';   // matches .leaf
    card.style.left   = (sheet ? sheet.left  : 0) + 'px';
    card.style.top    = '0px';
    card.style.width  = (sheet ? sheet.width : window.innerWidth) + 'px';
    card.style.height = window.innerHeight + 'px';

    handoff = window.setTimeout(enterSuite, ZOOM * 0.92);
  }

  function enterSuite(landOn){
    if (suite.classList.contains('is-lit')) return;
    window.clearTimeout(handoff);

    window.scrollTo(0, 0);                                    // open at the top
    document.documentElement.classList.remove('is-sealed');   // scrolling back on

    suite.removeAttribute('aria-hidden');
    suite.classList.add('is-lit');
    reveal();
    if (!score.paused && score.volume < 0.02) fadeUp();   // skipped ahead

    window.setTimeout(function(){
      if (overture.isConnected) overture.remove();
    }, calm ? 0 : 480);

    if (landOn){
      var target = document.getElementById(landOn);
      if (target) window.setTimeout(function(){
        target.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
      }, calm ? 0 : 120);
    }
  }

  /* A guest scanning the QR code at the reception wants the upload form, not
     a ceremony they are already sitting in. The envelope is the first-time
     arrival; a link that names a section skips straight to it. */
  (function skipToSection(){
    var wanted = (window.location.hash || '').replace('#', '');
    if (!wanted || !document.getElementById(wanted)) return;

    opened = true;
    if (overture.isConnected) overture.remove();
    enterSuite(wanted);
  })();

  function unseal(){
    if (opened) return;
    opened = true;

    overture.classList.add('is-open');
    startScore();

    // The music comes up with the paper, not over the sealed envelope and
    // not held back until the page. Playback already began, silently, inside
    // the tap — this is only the volume arriving.
    window.setTimeout(function(){
      if (!score.paused) fadeUp();
    }, calm ? 0 : RISEN);

    handoff = window.setTimeout(zoomCard, calm ? HOLD_CALM : HOLD);

    // let an impatient second tap skip the rest of the sequence
    window.setTimeout(function(){
      overture.addEventListener('click', enterSuite, { once: true });
    }, 600);
  }

  document.getElementById('unseal').addEventListener('click', unseal);
  document.getElementById('unseal-cue').addEventListener('click', unseal);

  /* ── scroll reveals (applied only once JS is running) ──── */
  function reveal(){
    var items = Array.prototype.slice.call(document.querySelectorAll('.js-reveal'));
    if (calm || !('IntersectionObserver' in window)) return;

    items.forEach(function(el){ el.classList.add('armed'); });

    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if (!e.isIntersecting) return;
        e.target.classList.add('seen');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });

    items.forEach(function(el){ io.observe(el); });
  }
})();
