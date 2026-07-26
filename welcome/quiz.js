// Skill Sprouts — Quiz funnel logic

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js';
import QRCode from 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/+esm';

const _firebaseApp = initializeApp({
  apiKey: 'AIzaSyCFOxde6Gf-YB_ccxc7s4Q5yQ0OqQH1PAw',
  authDomain: 'valued-watch-461301-e1.firebaseapp.com',
  projectId: 'valued-watch-461301-e1',
  storageBucket: 'valued-watch-461301-e1.firebasestorage.app',
  messagingSenderId: '386194120047',
  appId: '1:386194120047:web:222c5a6ea632ae1abd5c9a',
});
const _auth = getAuth(_firebaseApp);

// Production API base URL — update when Cloud Run URL changes
const API_BASE = 'https://fastapi-hello-world-service-386194120047.us-central1.run.app';

(function() {
  const STORAGE_KEY = 'sprouts_quiz_state';

  // ── State ─────────────────────────────────────────────────
  const defaultState = {
    step: 0,
    ageBrackets: [],         // ['toddler', 'baby'] — stages in the house
    ageFocus: null,          // single bracket id — the stage to build around first
    areas: [],               // ['tantrums', 'eating']
    mood: null,              // 'reactive' | 'tired' | 'curious' | 'lost' | 'mix'
    time: null,              // 2 | 5 | 10
    coParent: null,          // 'solo' | 'partner' | 'shared' | 'extended'
    memory: null,            // 'yes' | 'maybe' | 'no'
    focusArea: null,         // single area id — the "start this week" pick
    email: '',
    authMethod: null,        // 'google' | 'email'
    handoffToken: null,      // short-lived UUID for app sign-in
    plan: null,              // 'annual' | 'monthly' | 'free'
    trial: false,
  };
  let state = loadState();
  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...defaultState, ...JSON.parse(saved) };
    } catch (e) {}
    return { ...defaultState };
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ── Step order ────────────────────────────────────────────
  const STEPS = [
    'welcome',
    'ages',
    'agefocus',
    'insight1',
    'areas',
    'mood',
    'method',
    'time',
    'coparent',
    'memory',
    'focus',
    'loading',
    'gate',
    'results',
    'paywall',
    'handoff',
  ];
  const TOTAL_Q = 7; // count of question screens (ages → focus)

  // Per-step progress meta: bar fill % + label (interstitials hold the fill)
  const STEP_META = {
    welcome:  { hideBar: true },
    ages:     { pct: 14,   label: 'Step 1 of 7' },
    agefocus: { pct: 14,   label: 'One to start' },
    insight1: { pct: 14,   label: 'A quick note' },
    areas:    { pct: 29,   label: 'Step 2 of 7' },
    mood:     { pct: 43,   label: 'Step 3 of 7' },
    method:   { pct: 43,   label: 'How it works' },
    time:     { pct: 57,   label: 'Step 4 of 7' },
    coparent: { pct: 71,   label: 'Step 5 of 7' },
    memory:   { pct: 86,   label: 'Step 6 of 7' },
    focus:    { pct: 100,  label: 'Step 7 of 7' },
    loading:  { pct: 100,  label: 'Building your plan' },
    gate:     { pct: 100,  label: 'Save your plan' },
    results:  { pct: 100,  label: 'Your plan' },
    paywall:  { pct: 100,  label: 'Start free' },
    handoff:  { hideBar: true },
  };
  const NO_BACK = ['welcome', 'loading', 'gate', 'results', 'paywall', 'handoff'];

  // ── Area metadata (mirror of data.js) ─────────────────────
  const AREAS = {
    tantrums: { name: 'Tantrums & Big Emotions', short: 'Big Emotions', tagline: 'Co-regulate, name the feeling, ride the wave.', color: '#BC4B51', tint: '#FBE6E1', habits: ['Name the feeling out loud', 'Drop to their eye level', 'Take 3 breaths before responding'] },
    eating: { name: 'Picky Eating', short: 'Picky Eating', tagline: 'Offer, don’t pressure. Curiosity over clean plates.', color: '#F4A259', tint: '#FCEBD3', habits: ['Put one new food on the plate', 'Eat the new food yourself', 'Skip the clean-plate ask'] },
    potty: { name: 'Potty Training', short: 'Potty', tagline: 'Follow their lead. Celebrate effort, not outcome.', color: '#5B8E7D', tint: '#DCEBE5', habits: ['Offer a sit before transitions', 'Celebrate the try', 'Keep accidents low-drama'] },
    sleep: { name: 'Sleep & Bedtime', short: 'Sleep', tagline: 'Same order, same rhythm, soft landings.', color: '#7A8AA7', tint: '#E3E8F0', habits: ['Dim the lights 45 min before bed', 'Three-step bedtime ritual', 'One quiet question at tuck-in'] },
    independence: { name: 'Independence & Chores', short: 'Independence', tagline: 'Let them do it slow. That’s the win.', color: '#8A6BAE', tint: '#E8DEF0', habits: ['Let them dress themselves', 'One chore, age-appropriate', 'Ask "what’s your plan?"'] },
    school: { name: 'School Readiness', short: 'School', tagline: 'Curiosity, not flashcards.', color: '#C98A6B', tint: '#F1E2D5', habits: ['Read together for 15 min', 'Ask an open question at pickup', 'Wonder out loud'] },
  };

  const KID_COLORS = ['#F4A259', '#5B8E7D', '#BC4B51', '#8A6BAE'];
  const KID_NAMES = ['Maya', 'Theo', 'Iris', 'River'];

  // ── Age-stage brackets ────────────────────────────────────
  const AGE_BRACKETS = {
    onway:     { name: 'Baby on the way', short: 'Baby on the way', sub: 'Expecting', emoji: '🤰', color: '#8A6BAE' },
    baby:      { name: 'Baby', short: 'Baby', sub: '0–1 years', emoji: '🍼', color: '#F4A259' },
    toddler:   { name: 'Toddler', short: 'Toddler', sub: '2–4 years', emoji: '🧸', color: '#5B8E7D' },
    preschool: { name: 'Preschooler', short: 'Preschooler', sub: '5–6 years', emoji: '🎒', color: '#C98A6B' },
  };
  const BRACKET_ORDER = ['onway', 'baby', 'toddler', 'preschool'];

  // ── DOM helpers ───────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function go(stepName) {
    const idx = STEPS.indexOf(stepName);
    if (idx < 0) return;
    state.step = idx;
    saveState();

    $$('.quiz-screen').forEach(s => s.classList.remove('active'));
    const target = document.querySelector(`[data-step="${stepName}"]`);
    if (target) target.classList.add('active');

    updateProgress();
    updateBack();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Side effects per screen
    if (stepName === 'agefocus') renderAgeFocus();
    if (stepName === 'focus') renderFocus();
    if (stepName === 'loading') runLoading();
    if (stepName === 'results') renderResults();
    if (stepName === 'paywall') renderPaywall();
    if (stepName === 'handoff') renderHandoff();
  }

  function back() {
    const idx = state.step;
    if (idx <= 0) return;
    go(STEPS[idx - 1]);
  }

  function updateProgress() {
    const meta = STEP_META[STEPS[state.step]] || {};
    const wrap = $('.quiz-progress-wrap');
    if (!wrap) return;
    if (meta.hideBar) { wrap.style.visibility = 'hidden'; return; }
    wrap.style.visibility = 'visible';
    $('.quiz-progress-bar > div').style.width = meta.pct + '%';
    $('.quiz-progress-label').textContent = meta.label;
  }

  function updateBack() {
    const idx = state.step;
    const showBack = idx > 0 && !NO_BACK.includes(STEPS[idx]);
    $('.quiz-back-row').style.visibility = showBack ? 'visible' : 'hidden';
  }

  // ── Welcome ───────────────────────────────────────────────
  document.querySelector('[data-action="begin"]').addEventListener('click', () => go('ages'));

  // ── Ages (stage brackets, multi-select) ───────────────────
  $$('[data-step="ages"] .q-choice').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.bracket;
      const has = state.ageBrackets.includes(id);
      if (has) state.ageBrackets = state.ageBrackets.filter(b => b !== id);
      else state.ageBrackets = [...state.ageBrackets, id];
      el.classList.toggle('selected', !has);
      // keep focus valid
      if (state.ageFocus && !state.ageBrackets.includes(state.ageFocus)) state.ageFocus = null;
      saveState();
      updateAgesContinue();
    });
  });
  function updateAgesContinue() {
    const n = state.ageBrackets.length;
    $('[data-step="ages"] .q-continue').disabled = n === 0;
    $('[data-step="ages"] .q-continue-label').textContent =
      n === 0 ? 'Pick at least one' : 'Continue';
  }
  $('[data-step="ages"] .q-continue').addEventListener('click', () => {
    if (state.ageBrackets.length > 1) {
      go('agefocus');
    } else {
      state.ageFocus = state.ageBrackets[0] || null;
      saveState();
      go('insight1');
    }
  });

  // ── Age focus (pick one stage to start — only if >1 picked) ─
  function renderAgeFocus() {
    const wrap = $('[data-step="agefocus"] .q-choices');
    wrap.innerHTML = '';
    const picks = BRACKET_ORDER.filter(b => state.ageBrackets.includes(b));
    picks.forEach(id => {
      const b = AGE_BRACKETS[id];
      const sel = state.ageFocus === id ? 'selected' : '';
      const btn = document.createElement('button');
      btn.className = `q-choice ${sel}`;
      btn.dataset.value = id;
      btn.innerHTML = `
        <span class="swatch">${b.emoji}</span>
        <span>
          <span class="label">${b.name}</span>
          <span class="label-sub">${b.sub}</span>
        </span>
        <span class="check"></span>
      `;
      btn.addEventListener('click', () => {
        state.ageFocus = id;
        $$('[data-step="agefocus"] .q-choice').forEach(c => c.classList.remove('selected'));
        btn.classList.add('selected');
        saveState();
        setTimeout(() => go('insight1'), 300);
      });
      wrap.appendChild(btn);
    });
  }

  // ── Areas multi-select ────────────────────────────────────
  $$('[data-step="areas"] .q-area').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.area;
      const has = state.areas.includes(id);
      if (has) state.areas = state.areas.filter(a => a !== id);
      else state.areas = [...state.areas, id];
      el.classList.toggle('selected', !has);
      saveState();
      updateAreasContinue();
    });
  });
  function updateAreasContinue() {
    const n = state.areas.length;
    $('[data-step="areas"] .q-continue').disabled = n === 0;
    $('[data-step="areas"] .q-continue-label').textContent =
      n === 0 ? 'Pick at least one' : (n === 1 ? 'Continue with 1' : `Continue with ${n}`);
  }
  $('[data-step="areas"] .q-continue').addEventListener('click', () => go('mood'));

  // ── Mood ──────────────────────────────────────────────────
  $$('[data-step="mood"] .q-choice').forEach(el => {
    el.addEventListener('click', () => {
      state.mood = el.dataset.value;
      $$('[data-step="mood"] .q-choice').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      saveState();
      setTimeout(() => go('method'), 280);
    });
  });

  // ── Time ──────────────────────────────────────────────────
  $$('[data-step="time"] .q-choice').forEach(el => {
    el.addEventListener('click', () => {
      state.time = Number(el.dataset.value);
      $$('[data-step="time"] .q-choice').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      saveState();
      setTimeout(() => go('coparent'), 280);
    });
  });

  // ── Co-parent ────────────────────────────────────────────
  $$('[data-step="coparent"] .q-choice').forEach(el => {
    el.addEventListener('click', () => {
      state.coParent = el.dataset.value;
      $$('[data-step="coparent"] .q-choice').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      saveState();
      setTimeout(() => go('memory'), 280);
    });
  });

  // ── Memory ───────────────────────────────────────────────
  $$('[data-step="memory"] .q-choice').forEach(el => {
    el.addEventListener('click', () => {
      state.memory = el.dataset.value;
      $$('[data-step="memory"] .q-choice').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      saveState();
      setTimeout(() => go('focus'), 280);
    });
  });

  // ── Focus pick (single area from chosen multi) ────────────
  function renderFocus() {
    const wrap = $('[data-step="focus"] .q-choices');
    wrap.innerHTML = '';
    const picks = state.areas.length ? state.areas : Object.keys(AREAS);
    picks.forEach(id => {
      const a = AREAS[id];
      const sel = state.focusArea === id ? 'selected' : '';
      const btn = document.createElement('button');
      btn.className = `q-choice ${sel}`;
      btn.dataset.value = id;
      btn.innerHTML = `
        <span class="swatch" style="background:${a.tint}; color:${a.color};">
          <span style="width:14px;height:14px;border-radius:50%;background:${a.color}"></span>
        </span>
        <span>
          <span class="label">${a.name}</span>
          <span class="label-sub">${a.tagline}</span>
        </span>
        <span class="check"></span>
      `;
      btn.addEventListener('click', () => {
        state.focusArea = id;
        $$('[data-step="focus"] .q-choice').forEach(c => c.classList.remove('selected'));
        btn.classList.add('selected');
        saveState();
        setTimeout(() => go('loading'), 300);
      });
      wrap.appendChild(btn);
    });
  }

  // ── Loading ───────────────────────────────────────────────
  function runLoading() {
    const ticker = $('[data-step="loading"] .ticker');
    const messages = [
      'Reading what you told us…',
      'Choosing habits for ' + (state.focusArea ? AREAS[state.focusArea].short.toLowerCase() : 'your area') + '…',
      'Calibrating for ' + (state.time === 2 ? 'just two minutes' : state.time === 5 ? 'five-minute windows' : 'ten-minute reps') + '…',
      'Pairing with your ' + (state.ageFocus ? AGE_BRACKETS[state.ageFocus].short.toLowerCase() : 'little one') + '…',
      'Tying it all to a sprout…',
    ];
    let i = 0;
    ticker.textContent = messages[0];
    const interval = setInterval(() => {
      i++;
      if (i >= messages.length) {
        clearInterval(interval);
        setTimeout(() => go('gate'), 500);
        return;
      }
      ticker.style.opacity = 0;
      setTimeout(() => {
        ticker.textContent = messages[i];
        ticker.style.opacity = 1;
      }, 220);
    }, 800);
  }

  // ── Results ───────────────────────────────────────────────
  function renderResults() {
    const focus = state.focusArea || (state.areas[0] || 'tantrums');
    const area = AREAS[focus];

    // Hero
    $('[data-step="results"] .results-name').innerHTML =
      `Your plan,<br><em>ready to plant.</em>`;
    $('[data-step="results"] .results-meta').textContent =
      `${state.ageFocus ? AGE_BRACKETS[state.ageFocus].short : 'Your little one'} · ${state.areas.length} area${state.areas.length === 1 ? '' : 's'} · ${state.time} min/day`;

    // Summary
    const minutesText = state.time + ' min';
    $('[data-step="results"] .summary-card').innerHTML = `
      <div class="stat">
        <div class="k">Starting with</div>
        <div class="v"><em>${area.short}</em></div>
        <div class="vs">${state.areas.length > 1 ? `+ ${state.areas.length - 1} more area${state.areas.length === 2 ? '' : 's'} unlocked` : 'Master one, add more later'}</div>
      </div>
      <div class="stat">
        <div class="k">Daily commitment</div>
        <div class="v">${minutesText}<em>/day</em></div>
        <div class="vs">${state.time === 2 ? 'About as long as a breath' : state.time === 5 ? 'A coffee’s worth' : 'Real time, real change'}</div>
      </div>
      <div class="stat">
        <div class="k">Starter habits</div>
        <div class="v">3<em> habits</em></div>
        <div class="vs">Beginner level, ${area.short.toLowerCase()}</div>
      </div>
    `;

    // Stage summary
    const kidsWrap = $('[data-step="results"] .kid-pills');
    kidsWrap.innerHTML = '';
    const picks = BRACKET_ORDER.filter(b => state.ageBrackets.includes(b));
    picks.forEach(id => {
      const b = AGE_BRACKETS[id];
      const isFocus = state.ageFocus === id;
      const pill = document.createElement('span');
      pill.className = 'kid-pill';
      pill.innerHTML = `
        <span class="av" style="background:${b.color};">${b.emoji}</span>
        ${b.name}${isFocus && picks.length > 1 ? ' <em style="font-style:normal;color:var(--terracotta);font-weight:600;">· first</em>' : ''}
      `;
      kidsWrap.appendChild(pill);
    });

    // Starter habits
    const habitsWrap = $('[data-step="results"] .starter-habits');
    habitsWrap.innerHTML = '';
    area.habits.forEach(name => {
      const row = document.createElement('div');
      row.className = 'starter-habit';
      row.innerHTML = `
        <span class="ring" style="border-color:${area.color}"></span>
        <div style="flex:1;">
          <div class="title">${name}</div>
          <div class="meta">
            <span class="dot" style="background:${area.color}"></span>
            ${area.short} · Beginner · ~2 min
          </div>
        </div>
      `;
      habitsWrap.appendChild(row);
    });

    // Memory module — show if interested
    const memWrap = $('[data-step="results"] .memory-block');
    if (state.memory === 'yes' || state.memory === 'maybe') {
      memWrap.style.display = '';
    } else {
      memWrap.style.display = 'none';
    }

    // Personalized headline above CTA
    const ctaHead = $('[data-step="results"] .cta-card h3');
    const moodMap = {
      reactive: 'You’re ready to <em>do better.</em><br>Let’s start small.',
      tired: 'You showed up here.<br>That’s already <em>the work.</em>',
      curious: 'You’re curious.<br>Your <em>sprout is too.</em>',
      lost: 'You’re not <em>lost.</em><br>You’re just deep in it.',
      mix: 'All of it.<br>That’s <em>parenting.</em>',
    };
    ctaHead.innerHTML = moodMap[state.mood] || 'Plant your<br><em>first sprout.</em>';
  }

  // ── Interstitial advance buttons ──────────────────────────
  $$('.q-advance').forEach(el => el.addEventListener('click', () => go(el.dataset.next)));

  // ── Account gate (save progress → seamless handoff) ───────
  async function _fetchHandoffToken(idToken) {
    const res = await fetch(`${API_BASE}/auth/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) throw new Error(`Handoff request failed: ${res.status}`);
    const { handoffToken } = await res.json();
    return handoffToken;
  }

  const _googleBtn = $('[data-action="gate-google"]');
  const _googleBtnHtml = _googleBtn.innerHTML;

  _googleBtn.addEventListener('click', async () => {
    _googleBtn.disabled = true;
    _googleBtn.textContent = 'Signing in…';
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(_auth, provider);
      const idToken = await result.user.getIdToken();
      const handoffToken = await _fetchHandoffToken(idToken);
      state.email = result.user.email || '';
      state.authMethod = 'google';
      state.handoffToken = handoffToken;
      saveState();
      go('results');
    } catch (e) {
      _googleBtn.disabled = false;
      _googleBtn.innerHTML = _googleBtnHtml;
      const errEl = $('[data-gate-error]');
      if (errEl) { errEl.textContent = 'Sign-in failed. Please try again.'; errEl.style.display = ''; }
    }
  });

  $('[data-action="gate-continue"]').addEventListener('click', async () => {
    const input = $('[data-action="gate-email-input"]');
    const val = input.value.trim();
    if (!val || !/.+@.+\..+/.test(val)) { input.classList.add('err'); input.focus(); return; }
    input.classList.remove('err');
    const btn = $('[data-action="gate-continue"]');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await sendSignInLinkToEmail(_auth, val, {
        url: 'https://skillsprouts.co/auth',
        handleCodeInApp: true,
      });
      localStorage.setItem('sprouts_email_for_signin', val);
      const gate = $('[data-step="gate"] .gate');
      gate.innerHTML = `
        <span class="q-tape" style="background:#5B8E7D;">Check your inbox</span>
        <h1>Magic link<br>on its way.</h1>
        <p class="lede">We sent a sign-in link to <strong>${val}</strong>. Tap it on your phone — you'll land in the app already signed in.</p>
      `;
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Try again';
      const errEl = $('[data-gate-error]');
      if (errEl) { errEl.textContent = 'Could not send link. Check the email and try again.'; errEl.style.display = ''; }
    }
  });

  $('[data-action="gate-email-input"]').addEventListener('input', (e) => e.target.classList.remove('err'));
  $('[data-action="gate-email-input"]').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-action="gate-continue"]').click(); });

  // ── Results → paywall ─────────────────────────────────────
  $('[data-action="to-paywall"]').addEventListener('click', () => go('paywall'));

  // ── Paywall ───────────────────────────────────────────────
  function updatePwSub() {
    const sub = $('[data-pw-sub]'); if (!sub) return;
    sub.textContent = state.plan === 'monthly'
      ? '7 days free, then $9.99/mo. Cancel anytime in Settings.'
      : '7 days free, then $49.99/yr. Cancel anytime in Settings.';
  }
  function renderPaywall() {
    if (state.plan !== 'monthly') state.plan = 'annual';
    $$('[data-step="paywall"] .pw-plan').forEach(p => p.classList.toggle('selected', p.dataset.plan === state.plan));
    updatePwSub();
  }
  $$('[data-step="paywall"] .pw-plan').forEach(el => {
    el.addEventListener('click', () => {
      state.plan = el.dataset.plan; saveState();
      $$('[data-step="paywall"] .pw-plan').forEach(p => p.classList.remove('selected'));
      el.classList.add('selected');
      updatePwSub();
    });
  });
  $('[data-action="start-trial"]').addEventListener('click', async () => {
    const btn = $('[data-action="start-trial"]');
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = 'Loading…';
    try {
      const user = _auth.currentUser;
      if (!user) { go('gate'); return; }
      const idToken = await user.getIdToken();
      const res = await fetch(`${API_BASE}/payments/stripe/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, plan: state.plan || 'annual' }),
      });
      if (!res.ok) throw new Error(`Checkout error: ${res.status}`);
      const { checkoutUrl } = await res.json();
      window.location.href = checkoutUrl;
    } catch (e) {
      btn.disabled = false;
      btn.textContent = origText;
    }
  });
  $('[data-action="skip-trial"]').addEventListener('click', () => { state.plan = 'free'; state.trial = false; saveState(); go('handoff'); });

  // ── Handoff ───────────────────────────────────────────────
  async function renderQR() {
    const el = $('[data-qr]'); if (!el) return;
    const url = state.handoffToken
      ? `https://skillsprouts.co/auth?t=${state.handoffToken}`
      : 'https://skillsprouts.co/app';
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 116, margin: 1, color: { dark: '#2A1F17', light: '#FFFFFF' } });
      el.innerHTML = `<img src="${dataUrl}" width="116" height="116" alt="QR code to open the app">`;
    } catch (_) {
      el.innerHTML = '';
    }
  }
  function renderHandoff() {
    const se = $('[data-signed-email]'); if (se) se.textContent = state.email || 'your account';
    const pl = $('[data-handoff-plan]');
    if (pl) pl.textContent = state.trial ? (state.plan === 'monthly' ? 'Free trial active · Monthly' : 'Free trial active · Annual') : 'Free plan active';
    const deepLink = $('[class*="handoff-deep"]');
    if (deepLink && state.handoffToken) {
      deepLink.href = `https://skillsprouts.co/auth?t=${state.handoffToken}`;
    }
    renderQR();
  }

  // ── Back button ───────────────────────────────────────────
  $('[data-action="back"]').addEventListener('click', back);

  // ── Restart ───────────────────────────────────────────────
  $$('[data-action="restart"]').forEach(el => {
    el.addEventListener('click', () => {
      state = { ...defaultState };
      saveState();
      go('welcome');
    });
  });

  // ── Init ──────────────────────────────────────────────────
  // Start fresh on load (so refresh doesn't drop someone mid-quiz with stale state)
  // But we DO keep their answers — just send them back to welcome unless they're partway
  // For now: always start at welcome on fresh load
  state.step = 0;
  saveState();
  go('welcome');
})();
