(function(){
  "use strict";

  var overture = document.getElementById('overture');
  var suite    = document.getElementById('suite');
  var score    = document.getElementById('score');
  var toggle   = document.getElementById('music-toggle');
  var calm     = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  try { history.scrollRestoration = 'manual'; } catch (e) {}
  document.documentElement.classList.add('is-sealed');
  window.scrollTo(0, 0);

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

  var RSVP_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwX7itsDawc_Cr2QFfYpwr4Q4VMH3MoiU3BDVISYa8P35Sl_t4vzWMe3ndbmg5jAn4N/exec';

  var woken = false;

  function wakeScript(){
    if (woken || !RSVP_ENDPOINT) return;
    woken = true;
    fetch(RSVP_ENDPOINT + '?name=').catch(function(){});
  }

  function askGoogle(url, options, ms){
    var ctl = ('AbortController' in window) ? new AbortController() : null;
    var bell = window.setTimeout(function(){
      try { if (ctl) ctl.abort(); } catch (ignored) {}
    }, ms);

    var sent = {};
    if (options) for (var k in options) if (options.hasOwnProperty(k)) sent[k] = options[k];
    if (ctl) sent.signal = ctl.signal;

    return fetch(url, sent)
      .then(function(r){ window.clearTimeout(bell); return r.json(); },
            function(err){ window.clearTimeout(bell); throw err; });
  }

  function askGoogleTwice(url, options){
    return askGoogle(url, options, 20000).catch(function(){
      return new Promise(function(go){ window.setTimeout(go, 1200); })
        .then(function(){ return askGoogle(url, options, 30000); })
        .then(function(res){
          if (res && typeof res === 'object') res.retried = true;
          return res;
        });
    });
  }

  (function coverPhotos(){
    var shots = document.querySelectorAll('.cover-photo img');

    Array.prototype.forEach.call(shots, function(img){
      function fallBack(){
        var cover = img.closest ? img.closest('section.cover') : null;
        if (!cover) return;
        cover.classList.remove('has-photo');
        cover.classList.add('no-photo');
      }

      img.addEventListener('error', fallBack);
      if (img.complete && img.naturalWidth === 0) fallBack();
    });
  })();

  (function coverJumps(){
    var cues = document.querySelectorAll('.cover-cue');

    Array.prototype.forEach.call(cues, function(cue){
      cue.addEventListener('click', function(ev){
        var id = String(cue.getAttribute('href') || '').replace('#', '');
        var target = id && document.getElementById(id);
        if (!target) return;

        ev.preventDefault();
        target.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
      });
    });
  })();

  function wakeWhenSeen(el){
    if (!el) return;
    if (!('IntersectionObserver' in window)) return;

    var watcher = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (!entry.isIntersecting) return;
        wakeScript();
        watcher.disconnect();
      });
    }, { rootMargin: '0px 0px -20% 0px' });

    watcher.observe(el);
  }

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

    if (!find || !RSVP_ENDPOINT) return;

    find.hidden = false;
    if (alt) alt.textContent = 'If your name does not come up, let us know';

    var current = null;

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

    input.addEventListener('focus', wakeScript);
    wakeWhenSeen(find);

    find.addEventListener('submit', function(ev){
      ev.preventDefault();
      var name = input.value.trim();
      if (!name){ say('Please enter your name first.'); input.focus(); return; }

      party.hidden = true;
      say('');
      busy(look, true, 'Looking…');

      var slow = window.setTimeout(function(){
        say('Still looking. This can take a few seconds.');
      }, 4000);

      function done(){
        window.clearTimeout(slow);
        busy(look, false);
      }

      askGoogleTwice(RSVP_ENDPOINT + '?name=' + encodeURIComponent(name))
        .then(function(data){
          done();
          if (!data || !data.found){
            say(data && data.several
              ? 'That name belongs to more than one guest. Please type your first name, or your full name.'
              : 'We could not find that name. Try your first name. If it still does not come up, please let us know.',
              'bad');
            return;
          }
          current = data;
          render(data);
        })
        .catch(function(){
          done();
          say('Something went wrong reaching our guest list. Please try again in a moment, or let us know.', 'bad');
        });
    });

    function render(data){
      var members = data.members || [];
      var replied = data.replied || {};

      current = { party: data.party || '', members: members, done: {}, going: {} };

      seats.textContent = members.length;
      seatsL.textContent = members.length === 1 ? 'seat' : 'seats';

      list.textContent = '';
      members.forEach(function(person, i){ list.appendChild(guestRow(person, i)); });

      members.forEach(function(person, i){
        if (replied.hasOwnProperty(person)) markDone(i, person, replied[person]);
      });

      var waiting = members.filter(function(m){ return !current.done[m]; });

      others.hidden = members.length < 2 || !waiting.length;
      party.hidden = false;
      again.hidden = waiting.length > 0;
      send.hidden = !waiting.length;
      busy(send, false);

      if (!waiting.length){
        say(members.length === 1
          ? 'You have already replied. Thank you.'
          : 'Everyone on this invitation has replied. Thank you.');
      } else {
        say('');
      }

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
      current.going[person] = !!attending;
    }

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

    send.addEventListener('click', function(){
      if (!current) return;

      var members = current.members || [];
      var replies = [];

      members.forEach(function(person, i){
        if (current.done[person]) return;
        var picked = list.querySelector('input[name="guest-' + i + '"]:checked');
        if (picked) replies.push({ index: i, name: person, attending: picked.value === 'yes' });
      });

      if (!replies.length){
        say('Please reply for at least one guest before confirming.', 'bad');
        return;
      }

      busy(send, true, 'Sending');
      say('');

      askGoogleTwice(RSVP_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          party: current.party || '',
          lookup: input.value.trim(),
          replies: replies.map(function(r){ return { name: r.name, attending: r.attending }; })
        })
      })
        .then(function(res){
          var landed = res && res.already && res.retried;

          if (res && res.already && !landed){
            busy(send, false);
            say('That has already been answered. Search again to see what is recorded.', 'bad');
            return;
          }
          if (!res || (!res.ok && !landed)) throw new Error('rejected');

          replies.forEach(function(r){ markDone(r.index, r.name, r.attending); });

          var waiting = members.filter(function(m){ return !current.done[m]; });
          var names = replies.map(function(r){ return r.name; });

          busy(send, false);

          if (!waiting.length){
            party.hidden = true;
            again.hidden = false;
            var coming = members.some(function(m){ return current.going[m]; });
            say(coming
              ? 'Thank you. Your reply is in, and we cannot wait to celebrate with you.'
              : (members.length === 1
                  ? 'Thank you for letting us know. You will be missed on the day.'
                  : 'Thank you for letting us know. You will all be missed on the day.'));
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

  (function share(){
    var box    = document.getElementById('share');
    var nameEl = document.getElementById('share-name');
    var pick   = document.getElementById('share-pick');
    var choose = document.getElementById('share-choose');
    var list   = document.getElementById('share-list');
    var msg    = document.getElementById('share-msg');
    var send   = document.getElementById('share-send');
    var again  = document.getElementById('share-again');

    if (!box || !RSVP_ENDPOINT) return;
    box.hidden = false;

    nameEl.addEventListener('focus', wakeScript);
    wakeWhenSeen(box);

    var link = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var thin = !!(link && /^(slow-)?2g$|^3g$/.test(String(link.effectiveType || '')));

    var CHUNK = (thin ? 1 : 4) * 1024 * 1024;
    var CHUNK_TRIES = 3;
    var CHUNK_WAIT = 90000;
    var FALLBACK_MAX = 18 * 1024 * 1024;
    var INIT_WAIT = 12000;
    var picked = [];
    var seq = 0;
    var sending = false;
    var stopped = false;
    var inFlight = null;

    var directWorks = true;
    var directKnown = false;
    var roomLeft = -1;

    function checkRoute(){
      if (directKnown) return Promise.resolve(directWorks);

      return ask({
        action: 'upload-init',
        probe: true,
        from: '',
        name: 'route check',
        type: 'text/plain',
        size: 1,
        origin: window.location.origin
      }, 12000)
      .then(function(res){
        directWorks = !!(res && res.ok && res.session);
        directKnown = true;
        if (res && typeof res.free === 'number' && res.free >= 0) roomLeft = res.free;
        return directWorks;
      })
      .catch(function(){
        directWorks = false;
        directKnown = true;
        return false;
      });
    }

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

    function sayWithDropOff(before, linkText, plainText, after, tone){
      dropOff().then(function(url){
        if (!url){
          say(before + plainText + '. ' + after, tone);
          return;
        }

        msg.textContent = '';
        msg.appendChild(document.createTextNode(before));

        var a = document.createElement('a');
        a.className = 'map-cta';
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = linkText;
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

    function rowFor(entry){
      var li = document.createElement('li');
      li.className = 'share-item';
      li.setAttribute('data-id', String(entry.id));

      var f = document.createElement('p');
      f.className = 'share-f';
      f.textContent = entry.file.name;

      var s = document.createElement('p');
      s.className = 'share-s';
      s.textContent = mb(entry.file.size);

      var bar = document.createElement('div');
      bar.className = 'share-bar';
      bar.appendChild(document.createElement('span'));

      var drop = document.createElement('button');
      drop.type = 'button';
      drop.className = 'share-x';
      drop.textContent = '×';
      drop.setAttribute('aria-label', 'Remove ' + entry.file.name);
      drop.addEventListener('click', function(){
        if (entry.sending) return;
        var at = picked.indexOf(entry);
        if (at === -1) return;
        picked.splice(at, 1);
        redraw();
        say(picked.length ? '' : 'Nothing chosen.');
      });

      li.appendChild(f);
      li.appendChild(s);
      li.appendChild(drop);
      li.appendChild(bar);
      return li;
    }

    function draw(){
      for (var i = list.children.length; i < picked.length; i++){
        list.appendChild(rowFor(picked[i]));
      }
      send.hidden = !picked.length;
    }

    function redraw(){
      list.textContent = '';
      draw();
    }

    function row(id){ return list.querySelector('[data-id="' + id + '"]'); }

    function progress(id, fraction){
      var li = row(id); if (!li) return;
      var fill = li.querySelector('.share-bar span');
      if (fill) fill.style.width = Math.round(fraction * 100) + '%';

      var s = li.querySelector('.share-s');
      if (s && !li.classList.contains('is-done') && !li.classList.contains('is-failed')){
        s.textContent = Math.round(fraction * 100) + '%';
      }
    }

    function state(id, text, klass){
      var li = row(id); if (!li) return;
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
        picked.push({ id: ++seq, file: file, done: false });
      });
      send.textContent = 'Send them';

      draw();

      var anyBig = picked.some(function(p){ return !p.done && p.file.size > FALLBACK_MAX; });

      if (anyBig && !directKnown){
        say('Checking whether these can be sent…');
        checkRoute().then(finishPick);
        return;
      }

      finishPick();
    });

    function finishPick(){
      if (sending){
        say('Added. They will go after the ones already on their way.');
        return;
      }

      finishPickIdle();
    }

    function ceiling(){
      var limits = [];
      if (!directWorks) limits.push(FALLBACK_MAX);
      if (roomLeft >= 0) limits.push(roomLeft);
      return limits.length ? Math.min.apply(null, limits) : Infinity;
    }

    function whyRefused(size){
      return (!directWorks && size > FALLBACK_MAX) ? 'route' : 'room';
    }

    function finishPickIdle(){
      var cap = ceiling();
      var overCap = 0;
      var reason = '';

      picked.forEach(function(p){
        if (p.done || p.file.size <= cap) return;
        p.hopeless = true;
        overCap++;
        reason = whyRefused(p.file.size);
        state(p.id, reason === 'room' ? 'No room left for this' : 'Too large to send', 'is-failed');
      });

      var heavy = picked.filter(function(p){ return !p.hopeless && p.file.size > 200 * 1048576; });
      var total = picked.reduce(function(n, p){ return n + p.file.size; }, 0);

      var opening = (picked.length === 1 ? 'One file' : picked.length + ' files')
        + ', ' + mb(total) + ' in all. ';
      var anyLeft = picked.some(function(p){ return !p.done && !p.hopeless; });
      var closing = !anyLeft
        ? ''
        : heavy.length
          ? 'A long video takes many minutes on phone signal, so keep this page open. If it is easier, send it later on wifi.'
          : 'Keep this page open while they go.';

      if (!overCap){
        say(opening + closing);
        return;
      }

      var many = overCap === 1 ? 'One is' : overCap + ' are';

      var them = overCap === 1 ? 'it' : 'those';

      if (reason === 'room'){
        say(opening + many + ' larger than the ' + mb(roomLeft)
          + ' of space left, so please send ' + them + ' to us directly. ' + closing, 'bad');
      } else {
        sayWithDropOff(opening + many + ' longer than this page can carry, so please ',
          overCap === 1 ? 'drop it here instead' : 'drop those here instead',
          overCap === 1 ? 'send it to us directly' : 'send those to us directly',
          closing, 'bad');
      }
    }

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

    function openSession(entry, tries){
      return ask({
        action: 'upload-init',
        from: nameEl.value.trim(),
        name: entry.file.name,
        type: entry.file.type || 'application/octet-stream',
        size: entry.file.size,

        origin: window.location.origin
      }, tries ? 30000 : INIT_WAIT)
      .catch(function(err){
        if (tries || String(err && err.message) !== 'timeout') throw err;

        return openSession(entry, 1);
      });
    }

    function putDirect(entry, id){
      var carried = entry.session && entry.at > 0
        ? Promise.resolve({ ok: true, session: entry.session,
            name: entry.sentAs, folder: entry.folder })
        : openSession(entry, 0).then(function(res){
            if (!res || !res.ok || !res.session){
              throw new Error('init: ' + ((res && res.error) || 'no session'));
            }
            entry.session = res.session;
            entry.sentAs = res.name || entry.file.name;
            entry.folder = res.folder || '';
            entry.at = 0;
            return res;
          });

      return carried.then(function(res){
        return putChunks(entry.session, entry, id).then(function(){
          ask({
            action: 'upload-done',
            from: nameEl.value.trim(),
            name: entry.sentAs || entry.file.name,
            folder: entry.folder || '',
            size: entry.file.size
          }).catch(function(){});
        });
      });
    }

    function putChunks(session, entry, id){
      var total = entry.file.size;

      function sendChunk(start, end, tries){
        var ctl = ('AbortController' in window) ? new AbortController() : null;
        inFlight = ctl;

        var giveUp = window.setTimeout(function(){
          try { if (ctl) ctl.abort(); } catch (ignored) {}
        }, CHUNK_WAIT);

        function rest(){ window.clearTimeout(giveUp); }

        return fetch(session, {
          method: 'PUT',
          headers: {
            'Content-Range': 'bytes ' + start + '-' + (end - 1) + '/' + total
          },
          body: entry.file.slice(start, end),
          signal: ctl ? ctl.signal : undefined
        })
        .then(function(r){ rest(); return r; }, function(err){ rest(); throw err; })
        .catch(function(){
          if (stopped) throw new Error('stopped');

          throw new Error('chunk: blocked or offline');
        })
        .then(function(r){
          if (r.status === 200 || r.status === 201 || r.status === 308) return r.status;

          if (r.status === 404 || r.status === 410){
            entry.session = null;
            entry.at = 0;
          }
          throw new Error('chunk: ' + r.status);
        })
        .catch(function(err){
          if (stopped || String(err && err.message) === 'stopped') throw new Error('stopped');

          var n = (tries || 0) + 1;
          if (n >= CHUNK_TRIES || !entry.session) throw err;

          return new Promise(function(resolve){
            window.setTimeout(resolve, 1500 * n);
          }).then(function(){ return sendChunk(start, end, n); });
        });
      }

      function step(start){
        if (stopped) return Promise.reject(new Error('stopped'));
        if (start >= total) return Promise.resolve();

        var end = Math.min(start + CHUNK, total);
        return sendChunk(start, end, 0).then(function(status){
          entry.at = end;
          progress(id, end / total);
          if (status === 308) return step(end);
        });
      }

      return step(entry.at || 0);
    }

    function putThroughScript(entry, id, why){
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
        progress(id, 0.6);
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
        progress(id, 1);
      });
    }

    function sendOne(entry, id){
      if (entry.done) return Promise.resolve(true);
      state(id, 'Sending');

      var route = directWorks
        ? putDirect(entry, id).catch(function(err){
            var why = String((err && err.message) || '');
            var wobble = why === 'timeout' || why.indexOf('chunk:') === 0;

            if (!wobble){
              directWorks = false;
              directKnown = true;
            }

            if (entry.file.size > FALLBACK_MAX) throw err;

            return putThroughScript(entry, id, why);
          })
        : putThroughScript(entry, id, 'direct route already refused this visit');

      return route
        .then(function(){
          entry.done = true;
          state(id, 'Sent', 'is-done');
          return true;
        })
        .catch(function(err){
          var why = String(err && err.message);
          if (why === 'stopped' || stopped){
            state(id, 'Stopped', 'is-failed');
            progress(id, 0);
            return false;
          }

          var tooBig = why === 'too large';
          entry.hopeless = tooBig;
          state(id, tooBig ? 'Too large to send' : 'Did not send', 'is-failed');
          progress(id, 0);
          return false;
        });
    }

    function clearSent(){
      picked = picked.filter(function(p){ return !p.done && !p.hopeless; });
      redraw();
      say('');
    }

    function retryable(){
      return picked.filter(function(p){ return !p.done && !p.hopeless; });
    }

    function openPicker(){
      pick.value = '';
      pick.click();
    }

    function startPicking(){
      picked = [];
      redraw();
      say('');
      again.hidden = true;
      openPicker();
    }

    again.addEventListener('click', function(){
      if (sending) openPicker();
      else startPicking();
    });

    function stopSending(){
      stopped = true;
      send.disabled = true;
      send.textContent = 'Stopping';
      try { if (inFlight) inFlight.abort(); } catch (ignored) {}
      say('Stopping after the piece that is on its way.');
    }

    send.addEventListener('click', function(){
      if (sending){ stopSending(); return; }

      if (!retryable().length){
        startPicking();
        return;
      }

      if (!nameEl.value.trim()){
        say('Please add your name first, so we know whose photos these are.', 'bad');
        nameEl.focus();
        return;
      }

      sending = true;
      stopped = false;
      send.textContent = 'Stop sending';

      again.textContent = 'Add more photos';
      again.hidden = false;

      say('Please keep this page open until it says they are through.');

      var sent = 0, failed = 0;
      picked.forEach(function(p){ p.tried = false; });

      function next(){
        var entry = null;
        for (var k = 0; k < picked.length; k++){
          if (!picked[k].done && !picked[k].hopeless && !picked[k].tried){
            entry = picked[k]; break;
          }
        }
        if (!entry || stopped) return Promise.resolve();

        entry.tried = true;
        entry.sending = true;
        return sendOne(entry, entry.id).then(function(ok){
          entry.sending = false;
          if (ok) sent++; else failed++;
          return next();
        });
      }

      var run = next();

      run.then(function(){
        sending = false;
        send.disabled = false;
        inFlight = null;

        again.textContent = 'Choose other photos';

        if (stopped){
          again.hidden = false;
          send.textContent = 'Send them';
          say(sent
            ? 'Stopped. ' + sent + (sent === 1 ? ' had already been sent.' : ' had already been sent.')
            : 'Stopped. Nothing was sent.');
          stopped = false;
          return;
        }

        var left = retryable().length;
        var tooBig = picked.filter(function(p){ return p.hopeless; }).length;

        again.hidden = !left;
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
          : 'Tap Send more photos for another batch.';

        if (tooBig){
          sayWithDropOff(
            lines.join(', ') + '. A long video is beyond what we can take here, so please ',
            tooBig === 1 ? 'drop it here instead' : 'drop those here instead',
            tooBig === 1 ? 'send it to us directly' : 'send those to us directly',
            closing, 'bad');
        } else {
          say(lines.join(', ') + '. ' + closing, 'bad');
        }
      });
    });
  })();

  var LEVEL = 0.55;
  var scoreBroken = false;
  var fadeTimer = null;

  function showToggle(){ if (!scoreBroken) toggle.hidden = false; }
  function breakScore(){ scoreBroken = true; toggle.hidden = true; }

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
        clearInterval(fadeTimer);
        score.volume = LEVEL;
        showToggle(); setPlaying(false);
      });
    } else {
      showToggle(); setPlaying(true);
    }
  }

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

  document.addEventListener('visibilitychange', function(){
    if (document.hidden && !score.paused){
      score.pause();
      setPlaying(false);
    }
  });

  var RISEN = 1500;
  var HOLD = 3400;
  var ZOOM = 1250;
  var HOLD_CALM = 1600;

  var card     = document.querySelector('.env-card');
  var envelope = document.querySelector('.envelope');
  var leaf     = document.querySelector('.leaf');

  var opened = false;
  var handoff = null;

  function zoomCard(){
    if (!overture.isConnected || calm) return enterSuite();
    window.clearTimeout(handoff);

    var EASE = 'cubic-bezier(.4, 0, .2, 1)';
    var here = card.getBoundingClientRect();

    overture.appendChild(card);

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

    void card.offsetWidth;

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

    var sheet = leaf ? leaf.getBoundingClientRect() : null;

    card.style.background  = 'var(--paper)';
    card.style.borderColor = 'transparent';
    card.style.boxShadow   = '0 0 70px -34px rgba(17,17,16,.30)';
    card.style.left   = (sheet ? sheet.left  : 0) + 'px';
    card.style.top    = '0px';
    card.style.width  = (sheet ? sheet.width : window.innerWidth) + 'px';
    card.style.height = window.innerHeight + 'px';

    handoff = window.setTimeout(enterSuite, ZOOM * 0.92);
  }

  function enterSuite(landOn){
    if (suite.classList.contains('is-lit')) return;
    window.clearTimeout(handoff);

    window.scrollTo(0, 0);
    document.documentElement.classList.remove('is-sealed');

    suite.removeAttribute('aria-hidden');
    suite.classList.add('is-lit');
    reveal();
    wakeScript();
    if (!score.paused && score.volume < 0.02) fadeUp();

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

    window.setTimeout(function(){
      if (!score.paused) fadeUp();
    }, calm ? 0 : RISEN);

    handoff = window.setTimeout(zoomCard, calm ? HOLD_CALM : HOLD);

    window.setTimeout(function(){
      overture.addEventListener('click', enterSuite, { once: true });
    }, 600);
  }

  ['unseal', 'unseal-cue'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', unseal);
  });

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
