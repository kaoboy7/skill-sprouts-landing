// Skill Sprouts — Quiz funnel logic

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, sendSignInLinkToEmail } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js';

const _firebaseApp = initializeApp({
  apiKey: 'AIzaSyCFOxde6Gf-YB_ccxc7s4Q5yQ0OqQH1PAw',
  authDomain: 'auth2.skillsprouts.co',
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
    subscribed: false,       // already had a live subscription — checkout was refused
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
    tantrums: { name: 'Tantrums & Big Emotions', short: 'Big Emotions', label: 'behavior_and_boundaries', tagline: 'Co-regulate, name the feeling, ride the wave.', color: '#BC4B51', tint: '#FBE6E1', habits: ['Name the feeling out loud', 'Drop to their eye level', 'Take 3 breaths before responding'] },
    eating: { name: 'Picky Eating', short: 'Picky Eating', label: 'feeding_mealtime_habits', tagline: 'Offer, don’t pressure. Curiosity over clean plates.', color: '#F4A259', tint: '#FCEBD3', habits: ['Put one new food on the plate', 'Eat the new food yourself', 'Skip the clean-plate ask'] },
    potty: { name: 'Potty Training', short: 'Potty', label: 'potty_training', tagline: 'Follow their lead. Celebrate effort, not outcome.', color: '#5B8E7D', tint: '#DCEBE5', habits: ['Offer a sit before transitions', 'Celebrate the try', 'Keep accidents low-drama'] },
    sleep: { name: 'Sleep & Bedtime', short: 'Sleep', label: 'sleep_and_bedtime', tagline: 'Same order, same rhythm, soft landings.', color: '#7A8AA7', tint: '#E3E8F0', habits: ['Dim the lights 45 min before bed', 'Three-step bedtime ritual', 'One quiet question at tuck-in'] },
    independence: { name: 'Independence & Chores', short: 'Independence', label: 'independence_life_skills', tagline: 'Let them do it slow. That’s the win.', color: '#8A6BAE', tint: '#E8DEF0', habits: ['Let them dress themselves', 'One chore, age-appropriate', 'Ask "what’s your plan?"'] },
    school: { name: 'School Readiness', short: 'School', label: 'early_learning_cognitive', tagline: 'Curiosity, not flashcards.', color: '#C98A6B', tint: '#F1E2D5', habits: ['Read together for 15 min', 'Ask an open question at pickup', 'Wonder out loud'] },
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

    // Starter habits — render the marketing copy instantly as a fallback, then
    // swap in the REAL starter goals the app will seed (same /starter-goals
    // source the app uses), so what's previewed here is what lands on Home.
    const habitsWrap = $('[data-step="results"] .starter-habits');
    function renderHabits(titles) {
      habitsWrap.innerHTML = '';
      titles.forEach(name => {
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
    }
    renderHabits(area.habits);
    if (area.label) {
      fetch(`${API_BASE}/public/checklist/starter-goals?area_label=${encodeURIComponent(area.label)}&limit=2`)
        .then(r => r.ok ? r.json() : null)
        .then(goals => {
          if (Array.isArray(goals) && goals.length) {
            const titles = goals.map(g => g.title);
            renderHabits(titles);
            const countEl = $('[data-step="results"] .summary-card .stat:last-child .v');
            if (countEl) countEl.innerHTML = `${titles.length}<em> habits</em>`;
          }
        })
        .catch(() => { /* keep fallback copy */ });
    }

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
      // Carry the picked focus area so the app seeds the same starter habits.
      body: JSON.stringify({ idToken, focusArea: state.focusArea || null }),
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

  // Sends the Firebase email sign-in link, carrying the focus area so /auth can
  // forward it to the app's handoff and the same starter habits get seeded.
  async function _sendMagicLink(email) {
    // Carry the email in the continue URL so /auth can complete sign-in with
    // zero prompt even when the link opens on a different device/browser than
    // where it was requested (localStorage won't have it there).
    const params = new URLSearchParams({ email });
    if (state.focusArea) params.set('focus', state.focusArea);
    await sendSignInLinkToEmail(_auth, email, {
      url: 'https://skillsprouts.co/auth?' + params.toString(),
      handleCodeInApp: true,
    });
    localStorage.setItem('sprouts_email_for_signin', email);
  }

  // Email is captured here but the magic link is NOT sent yet — the user goes
  // straight to their plan, same as the Google path. The link is sent later,
  // either by the checkout success page (paid) or on skip-trial (free).
  $('[data-action="gate-continue"]').addEventListener('click', () => {
    const input = $('[data-action="gate-email-input"]');
    const val = input.value.trim();
    if (!val || !/.+@.+\..+/.test(val)) { input.classList.add('err'); input.focus(); return; }
    input.classList.remove('err');
    const errEl = $('[data-gate-error]');
    if (errEl) errEl.style.display = 'none';
    state.email = val;
    state.authMethod = 'email';
    saveState();
    go('results');
  });

  $('[data-action="gate-email-input"]').addEventListener('input', (e) => e.target.classList.remove('err'));
  $('[data-action="gate-email-input"]').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-action="gate-continue"]').click(); });

  // ── Results → paywall ─────────────────────────────────────
  $('[data-action="to-paywall"]').addEventListener('click', () => go('paywall'));

  // ── Paywall ───────────────────────────────────────────────
  // Both plans currently get the same trial; kept per-plan so the timeline copy
  // and the charge can't drift if that changes. Must stay in sync with
  // TRIAL_DAYS in the backend's stripe_payments.py, which is what actually sets
  // Stripe's trial_period_days.
  const TRIAL_DAYS = { annual: 7, monthly: 7 };
  // Midpoint beat in the paywall timeline. Purely a reassurance step — we send
  // NO trial-ending reminder email, so nothing here may imply one (see the
  // comment on that step in index.html).
  const TRIAL_WARN_DAY = { annual: 5, monthly: 5 };

  function updatePwCopy() {
    const plan = state.plan === 'monthly' ? 'monthly' : 'annual';
    const days = TRIAL_DAYS[plan];
    const price = plan === 'monthly' ? '$9.99/mo' : '$49.99/yr';

    const sub = $('[data-pw-sub]');
    if (sub) sub.textContent = `${days} days free, then ${price}. Cancel anytime in Settings.`;

    const eyebrow = $('[data-pw-eyebrow]');
    if (eyebrow) eyebrow.textContent = `Your ${days}-day free trial`;

    const warn = $('[data-pw-tl-warn]');
    if (warn) warn.textContent = `Day ${TRIAL_WARN_DAY[plan]} — still entirely your call`;

    // Names the trial's last day, so it can't drift if the plans stop sharing
    // one trial length.
    const warnD = $('[data-pw-tl-warn-d]');
    if (warnD) warnD.textContent = `Cancel any time in Settings before day ${days} and you won't be charged. No forms, nothing to chase.`;

    const end = $('[data-pw-tl-end]');
    if (end) end.textContent = `Day ${days} — trial ends`;
  }
  function renderPaywall() {
    if (state.plan !== 'monthly') state.plan = 'annual';
    $$('[data-step="paywall"] .pw-plan').forEach(p => p.classList.toggle('selected', p.dataset.plan === state.plan));
    updatePwCopy();
  }
  $$('[data-step="paywall"] .pw-plan').forEach(el => {
    el.addEventListener('click', () => {
      state.plan = el.dataset.plan; saveState();
      $$('[data-step="paywall"] .pw-plan').forEach(p => p.classList.remove('selected'));
      el.classList.add('selected');
      updatePwCopy();
    });
  });
  // One subscription per account. The backend is the authoritative guard
  // (create-checkout answers 409); these are the two places that turn its answer
  // into something a human can act on instead of a dead button.
  const ALREADY_MSG = {
    already_subscribed: 'This account already has an active Skill Sprouts Plus subscription, so there’s nothing to buy twice. You can manage or cancel it any time.',
    managed_by_apple: 'Your subscription was purchased through the App Store, so it’s managed there — open Settings › Subscriptions on your iPhone to change or cancel it.',
    managed_by_google: 'Your subscription was purchased through Google Play, so it’s managed there — open Play Store › Subscriptions to change or cancel it.',
  };

  // Swaps the plans + CTA for the already-subscribed block. portalUrl is only
  // ever present for a signed-in user (the backend won't hand a billing portal
  // to an unverified email); everyone else goes to /billing, which signs them
  // in before showing them anything.
  function showAlreadySubscribed(code, portalUrl) {
    state.subscribed = true;
    saveState();

    // Direct-child selectors on .paywall so the block's own .pw-title and
    // .pw-skip, which are nested inside it, survive.
    ['.paywall > [data-pw-eyebrow]', '.paywall > .pw-title', '.paywall > .pw-includes',
     '.paywall > .pw-plans', '.paywall > .pw-timeline', '.paywall > .pw-cta',
     '.paywall > .pw-sub', '.paywall > .pw-manage', '.paywall > .pw-skip'].forEach(sel => {
      const el = $(sel);
      if (el) el.style.display = 'none';
    });

    const msg = $('[data-pw-already-msg]');
    if (msg) msg.textContent = ALREADY_MSG[code] || ALREADY_MSG.already_subscribed;

    const manage = $('[data-pw-already-manage]');
    if (manage) manage.href = portalUrl || '/billing/';
    if (code !== 'already_subscribed') {
      // IAP subscriptions can't be managed from here at all — hide the whole
      // line, or its "Need to change your plan?" lead-in dangles with no link.
      const wrap = $('[data-pw-already-manage-wrap]');
      if (wrap) wrap.style.display = 'none';
    }

    const block = $('[data-pw-already]');
    if (block) block.style.display = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Same destination as skip-trial: into the app. They already have access, so
  // all that's left is signing them in on their phone.
  //
  // The link goes out even when state.handoffToken is set. That token only signs
  // you in on THIS device, and the handoff screen's whole premise is continuing
  // on a phone — so a Google user who skipped the send landed on a page reading
  // "we emailed you a sign-in link" with no email on the way.
  $('[data-action="already-continue"]').addEventListener('click', async () => {
    const btn = $('[data-action="already-continue"]');
    if (!state.email) { go('handoff'); return; }
    btn.disabled = true;
    const origHtml = btn.innerHTML;
    btn.textContent = 'Sending your sign-in link…';
    try {
      await _sendMagicLink(state.email);
      go('handoff');
      btn.disabled = false;
      btn.innerHTML = origHtml;
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Could not send the link — tap to try again';
    }
  });

  $('[data-action="start-trial"]').addEventListener('click', async () => {
    const btn = $('[data-action="start-trial"]');
    btn.disabled = true;
    const origText = btn.textContent;
    btn.textContent = 'Loading…';
    try {
      const user = _auth.currentUser;
      // Email-only users have no Firebase session yet — checkout runs off their
      // email and the success page emails them the magic link to sign in.
      if (!user && !state.email) { go('gate'); return; }
      const idToken = user ? await user.getIdToken() : null;

      // Cheap pre-flight for the common case: a returning subscriber replaying
      // the quiz. Saves a pointless round trip to Stripe. Never fatal — any
      // failure falls through to create-checkout, which is the real guard.
      if (idToken && await _hasActiveSubscription(idToken)) {
        showAlreadySubscribed('already_subscribed', null);
        return;
      }

      const res = await fetch(`${API_BASE}/payments/stripe/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken,
          email: idToken ? null : state.email,
          plan: state.plan || 'annual',
        }),
      });
      if (res.status === 409) {
        const detail = await res.json().then(d => d.detail).catch(() => null);
        // FastAPI passes our dict through as-is; a plain-string detail would be
        // some other 409 we didn't shape.
        const code = (detail && detail.code) || detail || 'already_subscribed';
        showAlreadySubscribed(code, detail && detail.portalUrl);
        return;
      }
      if (!res.ok) throw new Error(`Checkout error: ${res.status}`);
      const { checkoutUrl } = await res.json();
      window.location.href = checkoutUrl;
    } catch (e) {
      btn.disabled = false;
      btn.textContent = origText;
    }
  });

  async function _hasActiveSubscription(idToken) {
    try {
      const res = await fetch(`${API_BASE}/users/me/subscription`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) return false;
      const { status } = await res.json();
      return status === 'active';
    } catch (e) {
      return false;
    }
  }
  // Free plan: no checkout, so the magic link is what gets them into the app.
  $('[data-action="skip-trial"]').addEventListener('click', async () => {
    const btn = $('[data-action="skip-trial"]');
    state.plan = 'free';
    state.trial = false;
    saveState();
    if (!state.email) { go('gate'); return; }
    btn.disabled = true;
    btn.textContent = 'Sending your sign-in link…';
    try {
      await _sendMagicLink(state.email);
      go('handoff');
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Could not send the link — tap to try again';
    }
  });

  // ── Handoff ───────────────────────────────────────────────
  function _openInApp(handoffToken) {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid) {
      const fallback = encodeURIComponent('https://play.google.com/store/apps/details?id=com.skillsprouts.myapp');
      window.location.href = `intent://auth?t=${encodeURIComponent(handoffToken)}#Intent;scheme=skillspouts;package=com.skillsprouts.myapp;S.browser_fallback_url=${fallback};end;`;
    } else if (isIOS) {
      const appUrl = `skillspouts://auth?t=${handoffToken}`;
      window.location.href = appUrl;
      const storeUrl = 'https://apps.apple.com/us/app/skill-sprouts/id6754038900';
      const t = setTimeout(() => { window.location.href = storeUrl; }, 1500);
      window.addEventListener('blur', () => clearTimeout(t), { once: true });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') clearTimeout(t);
      }, { once: true });
    }
  }

  // Apple mobile devices: iPad on iOS 13+ masquerades as Mac, so also treat a
  // touch-capable "MacIntel" as iPad. Used to steer users to install first.
  const IS_APPLE_MOBILE = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function renderHandoff() {
    $$('[data-signed-email]').forEach(el => { el.textContent = state.email || 'your email'; });
    const pl = $('[data-handoff-plan]');
    if (pl) {
      if (state.subscribed) pl.textContent = 'Subscription active';
      else pl.textContent = state.trial ? (state.plan === 'monthly' ? 'Free trial active · Monthly' : 'Free trial active · Annual') : 'Free plan active';
    }

    // On iOS, email users must install the app BEFORE tapping the link, so swap
    // the default store card for the numbered "download first, then open link"
    // steps. Google users have a same-device handoff token and don't need this.
    const isEmailFlow = !state.handoffToken;
    const showSteps = IS_APPLE_MOBILE && isEmailFlow;
    const steps = $('[data-handoff-steps]');
    const card = $('[data-handoff-card]');
    const lede = $('[data-handoff-lede]');
    if (steps) steps.style.display = showSteps ? '' : 'none';
    if (card) card.style.display = showSteps ? 'none' : '';
    if (lede && showSteps) {
      lede.innerHTML = 'Two quick steps and you’re in — <strong>install the app first</strong>, then open the sign-in link we emailed you.';
    }

    // Nothing to resend to if we never captured an email (shouldn't happen on
    // the paths that reach this screen, but the button would be a dead end).
    const resend = $('[data-action="resend-link"]');
    if (resend) {
      resend.style.display = state.email ? '' : 'none';
      // Clear a leftover "Sent"/"Could not send" from an earlier visit, but
      // don't stomp on an in-flight cooldown.
      if (!resend.disabled) resend.textContent = RESEND_LABEL;
    }

    const btn = $('.handoff-deep');
    if (btn) {
      // Only Google sign-ins have a handoff token; email users open the app from
      // the magic link instead, so there's nothing to deep-link with here.
      if (state.handoffToken) {
        btn.style.display = '';
        // Custom scheme — works from within a browser, unlike Universal Links
        btn.href = `skillspouts://auth?t=${state.handoffToken}`;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          _openInApp(state.handoffToken);
        }, { once: true });
      } else {
        btn.style.display = 'none';
      }
    }
  }

  // Firebase sign-in emails get delayed or spam-filtered often enough that a
  // dead end here means a paid user who can't reach the app at all.
  const RESEND_LABEL = 'Resend the sign-in link';
  $('[data-action="resend-link"]').addEventListener('click', async () => {
    const btn = $('[data-action="resend-link"]');
    if (!state.email) return;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await _sendMagicLink(state.email);
      btn.textContent = 'Sent — check your inbox again';
      // Re-arm rather than latching: a link can be lost twice. The delay is
      // long enough that impatient tapping doesn't hammer Firebase (which
      // rate-limits, and would start failing for real).
      setTimeout(() => { btn.disabled = false; btn.textContent = RESEND_LABEL; }, 30000);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Could not send — tap to try again';
    }
  });

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
