/* Skill Sprouts — first-party funnel tracking.
 *
 * Records which steps of the funnel a visitor reaches, so we can see where
 * people fall out. Posts to our own API rather than an analytics vendor for two
 * reasons: the endpoint is on a domain no ad blocker filters (Meta and GA lose a
 * slice of every cohort), and the data lands in our own Postgres next to the
 * subscriptions it should be compared against.
 *
 * Carries no personal data. A session is a random id in localStorage; the only
 * other fields sent are quiz answers, for segmenting drop-off. No email, ever —
 * see api/routes/funnel.py in the backend.
 *
 * Load as a classic script before anything that calls it:
 *     <script src="/funnel.js"></script>
 * then from anywhere:
 *     sproutsFunnel.track('quiz_start');
 *     sproutsFunnel.track('q_areas', { area: 'eating' });
 *
 * Every call is safe to repeat. Steps already sent this session are dropped
 * client-side, and the server ignores duplicates too — so a visitor pressing
 * Back through the quiz costs nothing and can't inflate the numbers.
 */
(function () {
  'use strict';

  var API_BASE = 'http://localhost:8893';
  var SID_KEY = 'sprouts_funnel_sid';
  var SEEN_KEY = 'sprouts_funnel_seen';
  var TOUCH_KEY = 'sprouts_funnel_touch';
  var OPTOUT_KEY = 'sprouts_funnel_optout';
  var TESTMODE_KEY = 'sprouts_funnel_test';

  // Which shape of funnel this page implements. Sent with every batch so the
  // backend files these steps under the funnel the visitor actually walked —
  // during a deploy some browsers are still running the previous version from
  // cache, and folding their steps into the new one would corrupt exactly the
  // before/after comparison the version exists to enable.
  //
  // Bump when steps are added, removed, or reordered — NOT for copy or styling.
  // Must match a key of FUNNEL_VERSIONS in the backend's api/routes/funnel.py.
  var FUNNEL_VERSION = 2;

  // A funnel session is one attempt at the funnel, not one person forever. Come
  // back tomorrow and you're a new session — otherwise a returning visitor is
  // invisible, because every step they take has already been recorded and
  // deduplicated away.
  var SESSION_MAX_IDLE_MS = 12 * 60 * 60 * 1000;

  // Steps fire in bursts (a question answered, the plan built, the gate shown),
  // so they're queued and sent together rather than one request per tap.
  var FLUSH_DELAY_MS = 1200;
  var MAX_BATCH = 25;

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }
  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  // 22 chars of base64url — matches the server's ^[A-Za-z0-9_-]{8,64}$ and is
  // random enough that ids never collide across visitors.
  function newSessionId() {
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    var out = '';
    var bytes = new Uint8Array(22);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (var j = 0; j < 22; j++) bytes[j] = Math.floor(Math.random() * 256);
    }
    for (var i = 0; i < 22; i++) out += alphabet[bytes[i] % 64];
    return out;
  }

  // ── Keeping our own visits out of the numbers ─────────────
  //
  // Two switches, because they answer different needs:
  //
  //   ?test=true   Silences this browser TAB. Meant for a one-off walk through
  //                the funnel: it lives in sessionStorage, so it follows you
  //                across the quiz and on to /checkout/success, and it is gone
  //                the moment you close the tab. Nothing to remember to undo.
  //
  //   ?notrack=1   Silences this DEVICE until told otherwise, in localStorage.
  //                For your own phone and laptop, which you don't want counted
  //                ever. Undo with ?track=1.
  //
  // At a few hundred sessions a week a handful of your own runs is a visible
  // distortion, and the ones you take deliberately are the longest and most
  // complete — exactly the sessions that most flatter the numbers.
  function sessionStore(key, value) {
    try { sessionStorage.setItem(key, value); } catch (e) {}
  }
  function sessionRead(key) {
    try { return sessionStorage.getItem(key); } catch (e) { return null; }
  }

  (function () {
    var q = location.search;
    // Anchored on a delimiter: a bare indexOf('track=1') also matches
    // 'notrack=1', which would make the off switch turn itself back on.
    if (/[?&]notrack=1(&|$)/.test(q)) store(OPTOUT_KEY, '1');
    else if (/[?&]track=1(&|$)/.test(q)) {
      try {
        localStorage.removeItem(OPTOUT_KEY);
        sessionStorage.removeItem(TESTMODE_KEY);
      } catch (e) {}
    }
    if (/[?&]test=(true|1)(&|$)/.test(q)) sessionStore(TESTMODE_KEY, '1');
  })();

  function testMode() { return sessionRead(TESTMODE_KEY) === '1'; }
  function optedOut() { return read(OPTOUT_KEY) === '1' || testMode(); }

  // Silence you can't see is a trap: you run a test, forget the flag is on, then
  // wonder for a week why the funnel is empty. Say so, loudly, in the page and
  // in the console.
  function showSuppressedBadge() {
    if (!optedOut() || document.getElementById('sprouts-notrack-badge')) return;
    var why = testMode()
      ? 'TEST MODE — nothing recorded (this tab only)'
      : 'NOT TRACKED — this device is opted out (?track=1 to undo)';
    console.warn('[sprouts-funnel] ' + why);
    var el = document.createElement('div');
    el.id = 'sprouts-notrack-badge';
    el.textContent = why;
    el.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483647;'
      + 'background:#BC4B51;color:#fff;font:600 11px/1.4 system-ui,sans-serif;'
      + 'letter-spacing:.04em;padding:6px 10px;border-radius:999px;'
      + 'box-shadow:0 4px 14px -4px rgba(0,0,0,.4);pointer-events:none;';
    document.body.appendChild(el);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showSuppressedBadge);
  } else {
    showSuppressedBadge();
  }

  var _sid = null;
  var _seen = null;

  function sessionId() {
    if (_sid) return _sid;
    var existing = read(SID_KEY);
    var touched = parseInt(read(TOUCH_KEY) || '0', 10);
    var stale = !touched || (Date.now() - touched) > SESSION_MAX_IDLE_MS;
    if (existing && !stale) {
      _sid = existing;
    } else {
      _sid = newSessionId();
      store(SID_KEY, _sid);
      // A new session has seen nothing, or the visitor would be silently
      // deduplicated against their previous run through the funnel.
      store(SEEN_KEY, '[]');
      _seen = [];
    }
    store(TOUCH_KEY, String(Date.now()));
    return _sid;
  }

  function seen() {
    if (_seen) return _seen;
    try { _seen = JSON.parse(read(SEEN_KEY)) || []; } catch (e) { _seen = []; }
    return _seen;
  }

  var queue = [];
  var timer = null;

  function flush(sync) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queue.length) return;
    var batch = queue.splice(0, MAX_BATCH);
    var payload = JSON.stringify({
      sessionId: sessionId(),
      version: FUNNEL_VERSION,
      hits: batch,
    });
    var url = API_BASE + '/public/funnel';

    // On the way out of the page a normal fetch gets cancelled; sendBeacon is
    // the only thing the browser guarantees to deliver. It's also what makes the
    // final step before the Stripe redirect land at all.
    if (sync && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
        return;
      } catch (e) { /* fall through to fetch */ }
    }
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  /**
   * Record that this session reached `step`.
   * @param {string} step  a name from FUNNEL_STEPS in the backend's funnel.py
   * @param {object} [dims] optional { area, plan, ageBracket }
   */
  function track(step, dims) {
    if (!step || optedOut()) return;
    var already = seen();
    if (already.indexOf(step) !== -1) return;
    already.push(step);
    store(SEEN_KEY, JSON.stringify(already));
    store(TOUCH_KEY, String(Date.now()));

    var hit = { step: step };
    if (dims) {
      if (dims.area) hit.area = dims.area;
      if (dims.plan) hit.plan = dims.plan;
      if (dims.ageBracket) hit.ageBracket = dims.ageBracket;
    }
    queue.push(hit);

    // Anything at or past the money is sent immediately — those are the numbers
    // that matter most and the ones most likely to be interrupted by a redirect.
    if (step === 'checkout_start' || step === 'trial_start' || queue.length >= MAX_BATCH) {
      flush(true);
    } else if (!timer) {
      timer = setTimeout(function () { flush(false); }, FLUSH_DELAY_MS);
    }
  }

  // pagehide rather than unload: it's the one that fires reliably on mobile
  // Safari, where unload is simply skipped when the tab is backgrounded.
  window.addEventListener('pagehide', function () { flush(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush(true);
  });

  // Establish the session up front, before anything can be tracked.
  //
  // sessionId() clears the seen-list when it mints a new session, and it used to
  // run lazily — the first call came from inside flush(), by which time track()
  // had already recorded several steps into that list. Minting then wiped them,
  // so those steps could be sent a second time: pressing Back and re-answering a
  // question produced a duplicate row. Resolving the session first makes the
  // reset happen once, before there is anything to lose.
  sessionId();

  window.sproutsFunnel = {
    track: track,
    sessionId: sessionId,
    version: FUNNEL_VERSION,
    optedOut: optedOut,
    // Read by checkout/success.html, so a test run doesn't fire a fake purchase
    // conversion at Meta either.
    testMode: testMode,
  };
})();
