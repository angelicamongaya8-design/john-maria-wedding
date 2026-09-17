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

  /* ── rsvp: show the button only once a real link is set ── */
  (function rsvp(){
    var a = document.getElementById('rsvp-link');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href && href.indexOf('#') !== 0){
      a.hidden = false;
      a.target = '_blank';
      a.rel = 'noopener';
      var alt = document.getElementById('rsvp-alt');
      if (alt) alt.textContent = 'Or simply reply to the invitation you received';
    }
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

  function enterSuite(){
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
  }

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
