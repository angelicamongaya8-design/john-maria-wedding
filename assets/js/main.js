(function(){
  "use strict";

  var overture = document.getElementById('overture');
  var suite    = document.getElementById('suite');
  var score    = document.getElementById('score');
  var toggle   = document.getElementById('music-toggle');
  var calm     = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  function play(fade){
    if (scoreBroken) return;
    score.volume = fade ? 0 : LEVEL;
    var attempt = score.play();
    if (attempt && typeof attempt.then === 'function'){
      attempt.then(function(){
        showToggle(); setPlaying(true); if (fade) fadeUp();
      }).catch(function(){
        // autoplay refused — leave the control ready for a deliberate tap
        clearInterval(fadeTimer);
        score.volume = LEVEL;
        showToggle(); setPlaying(false);
      });
    } else {
      showToggle(); setPlaying(true); if (fade) fadeUp();
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

  // pausing the tab shouldn't leave music running behind them
  document.addEventListener('visibilitychange', function(){
    if (document.hidden && !score.paused){
      score.pause();
      setPlaying(false);
    }
  });

  /* ── opening the envelope ──────────────────────────────── */

  // Card finishes rising at ~1.5s, is held still so it can be read, and the
  // overture fades from 3.4s. Mirrors the transition delays in style.css.
  var HOLD = 4400;
  var HOLD_CALM = 1800;   // no motion, but still time enough to read the card

  var opened = false;
  var handoff = null;

  function enterSuite(){
    if (!overture.isConnected) return;
    window.clearTimeout(handoff);
    overture.remove();
    suite.removeAttribute('aria-hidden');
    suite.classList.add('is-lit');
    reveal();
  }

  function unseal(){
    if (opened) return;
    opened = true;

    overture.classList.add('is-open');
    startScore();

    handoff = window.setTimeout(enterSuite, calm ? HOLD_CALM : HOLD);

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
