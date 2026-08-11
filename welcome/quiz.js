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
    outcome: null,           // 'calm' — the one thing that would help most
    tool: null,              // 'goals' — the one part of the app they'd reach for
    time: null,              // 2 | 5 | 10
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
    'outcomes',
    'tools',
    'method',
    'time',
    'memory',
    'focus',
    'loading',
    'gate',
    'results',
    'paywall',
    'handoff',
  ];

  // Per-step progress bar fill. Eight question screens (ages → focus) at 12.5%
  // each; the interstitials hold whatever fill the question before them set.
  const STEP_META = {
    welcome:  { hideBar: true },
    ages:     { pct: 12.5 },
    agefocus: { pct: 12.5 },
    insight1: { pct: 12.5 },
    areas:    { pct: 25 },
    mood:     { pct: 37.5 },
    outcomes: { pct: 50 },
    tools:    { pct: 62.5 },
    method:   { pct: 62.5 },
    time:     { pct: 75 },
    memory:   { pct: 87.5 },
    focus:    { pct: 100 },
    loading:  { pct: 100 },
    gate:     { pct: 100 },
    results:  { pct: 100 },
    paywall:  { pct: 100 },
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

  // ── Outcomes ("what would help you the most") ─────────────
  // `pill` is the short form used on the results screen; the long form lives in
  // the markup for the question itself.
  const OUTCOMES = {
    understand: { emoji: '🧠', pill: 'Understanding my kid', color: '#8A6BAE' },
    calm:       { emoji: '🌊', pill: 'Less chaos',           color: '#7A8AA7' },
    connection: { emoji: '💛', pill: 'A stronger connection', color: '#BC4B51' },
    overwhelm:  { emoji: '🧺', pill: 'Less overwhelm',       color: '#5B8E7D' },
    patience:   { emoji: '🌤', pill: 'Keeping my cool',      color: '#F4A259' },
    confidence: { emoji: '🌱', pill: 'More confidence',      color: '#C98A6B' },
  };

  // ── Feature cards on the results screen ───────────────────
  // `tools` names the picks from the tools step this card answers, so whatever
  // they said they'd reach for floats to the top of the list and gets badged.
  // The 'goals' pick has no card — it's the starter-habits section right above.
  const FEATURES = [
    {
      id: 'kits', tools: ['steps', 'scripts'],
      tint: '#DCEBE5', stroke: '#5B8E7D',
      icon: '<path d="M7 14 c-2 -3 1 -7 4 -6 c0 -3 5 -4 7 -1 c3 -1 6 2 5 5 c2 1 2 5 -1 5 H8 c-2 0 -3 -2 -1 -3"/><path d="M14 22 l-2 5"/><path d="M19 22 l-3 6"/><path d="M23 22 l-1 4"/>',
      title: 'Situation kits',
      desc: 'A calm sequence to follow and the exact words to say — for the meltdown, the grocery run, the bedtime standoff. Pull one up right in the moment.',
      tag: 'For the tough moments',
    },
    {
      id: 'guides', tools: ['guides'],
      tint: '#E3E8F0', stroke: '#7A8AA7',
      icon: '<path d="M6 7 c4 -1 8 -1 10 2 c2 -3 6 -3 10 -2 v17 c-4 -1 -8 -1 -10 2 c-2 -3 -6 -3 -10 -2 z"/><path d="M16 9 V26"/>',
      title: 'Guides',
      desc: 'Short, plain-English reads on whatever is hard this week — why it happens, what actually helps, and what to skip. Five minutes, not a parenting book.',
      tag: 'When you want the why',
    },
    {
      id: 'challenges', tools: ['challenges'],
      tint: '#F1E2D5', stroke: '#C98A6B',
      icon: '<path d="M16 4 l3.2 6.8 7.3.8 -5.5 5 1.6 7.2 -6.6 -3.9 -6.6 3.9 1.6 -7.2 -5.5 -5 7.3 -.8 z"/>',
      title: 'Challenges',
      desc: 'Time-boxed group goals — one tiny action a day, alongside other parents doing the same thing. Finish one and press a bloom into your keepsake garden.',
      tag: 'Better, together',
    },
    {
      id: 'journal', tools: ['journal'],
      tint: '#E8DEF0', stroke: '#8A6BAE',
      icon: '<rect x="7" y="4" width="18" height="24" rx="3"/><path d="M12 4 V28"/><path d="M16 11 h5"/><path d="M16 16 h5"/><path d="M16 21 h3"/>',
      title: 'Journal',
      desc: 'One sentence a day, from a prompt — the memory-keeping you never find time for, made small. For the moments you do not want to lose. Toggleable, never pushy.',
      tag: 'Keep the small stuff',
    },
  ];

  // ── DOM helpers ───────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ── Funnel tracking ───────────────────────────────────────
  // Which quiz screens count as a funnel step, and what they're called in the
  // backend's FUNNEL_STEPS. Screens absent from this map (the interstitials,
  // the loading spinner) aren't decision points and would only pad the report.
  const FUNNEL_STEP = {
    ages:     'q_ages',
    areas:    'q_areas',
    mood:     'q_mood',
    outcomes: 'q_outcomes',
    tools:    'q_tools',
    time:     'q_time',
    memory:   'q_memory',
    focus:    'q_focus',
    gate:     'gate_view',
    results:  'results_view',
    paywall:  'paywall_view',
  };

  // The answers we segment drop-off by. Read at send time so each step carries
  // whatever was known by then — area is null until they've picked one.
  function _funnelDims() {
    return {
      area: state.focusArea || state.areas[0] || null,
      plan: state.plan || null,
      ageBracket: state.ageFocus || state.ageBrackets[0] || null,
    };
  }
  function trackFunnel(step) {
    if (window.sproutsFunnel && step) sproutsFunnel.track(step, _funnelDims());
  }

  function go(stepName) {
    const idx = STEPS.indexOf(stepName);
    if (idx < 0) return;
    state.step = idx;
    saveState();

    // Reaching a screen is the signal, so this covers every route into it —
    // forward, Back, and the skips (a single age stage bypasses agefocus).
    trackFunnel(FUNNEL_STEP[stepName]);

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
  }

  function updateBack() {
    const idx = state.step;
    const showBack = idx > 0 && !NO_BACK.includes(STEPS[idx]);
    $('.quiz-back-row').style.visibility = showBack ? 'visible' : 'hidden';
  }

  // ── Welcome ───────────────────────────────────────────────
  document.querySelector('[data-action="begin"]').addEventListener('click', () => {
    trackFunnel('quiz_start');
    go('ages');
  });

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
      setTimeout(() => go('outcomes'), 280);
    });
  });

  // ── Outcome (single pick) ─────────────────────────────────
  $$('[data-step="outcomes"] .q-choice').forEach(el => {
    el.addEventListener('click', () => {
      state.outcome = el.dataset.value;
      $$('[data-step="outcomes"] .q-choice').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      saveState();
      setTimeout(() => go('tools'), 280);
    });
  });

  // ── Tool (single pick) ────────────────────────────────────
  $$('[data-step="tools"] .q-choice').forEach(el => {
    el.addEventListener('click', () => {
      state.tool = el.dataset.value;
      $$('[data-step="tools"] .q-choice').forEach(c => c.classList.remove('selected'));
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
        trackFunnel('plan_built');
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

    // What they said would help most — shown back to them so the answer visibly
    // lands somewhere. Whole block hides if they somehow arrived without a pick.
    const outWrap = $('[data-step="results"] .outcome-pills');
    const outBlock = $('[data-step="results"] .outcome-block');
    const outcome = OUTCOMES[state.outcome];
    outWrap.innerHTML = '';
    outBlock.style.display = outcome ? '' : 'none';
    if (outcome) {
      const pill = document.createElement('span');
      pill.className = 'kid-pill';
      pill.innerHTML = `<span class="av" style="background:${outcome.color};">${outcome.emoji}</span>${outcome.pill}`;
      outWrap.appendChild(pill);
    }

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

    // Feature cards — everything ships to everyone, so nothing is hidden here.
    // The tool answer only reorders: what they said they'd reach for goes first
    // and carries a badge, so the list opens on the part they already want.
    const featWrap = $('[data-step="results"] .feat-list');
    // The journal card also answers the memory question, which is asked later
    // and more directly — a yes there counts the same as picking journaling.
    const wantsJournal = state.tool === 'journal'
      || state.memory === 'yes' || state.memory === 'maybe';
    const wanted = (f) => f.id === 'journal'
      ? wantsJournal
      : f.tools.includes(state.tool);
    featWrap.innerHTML = '';
    FEATURES.slice()
      .sort((a, b) => (wanted(b) ? 1 : 0) - (wanted(a) ? 1 : 0))
      .forEach(f => {
        const row = document.createElement('div');
        row.className = 'feat-row';
        row.innerHTML = `
          <span class="feat-ic" style="background:${f.tint};">
            <svg width="21" height="21" viewBox="0 0 32 32" fill="none" stroke="${f.stroke}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${f.icon}</svg>
          </span>
          <div>
            <div class="feat-t">${f.title}</div>
            <div class="feat-d">${f.desc}</div>
            <span class="feat-tag${wanted(f) ? ' picked' : ''}">${wanted(f) ? 'You asked for this' : f.tag}</span>
          </div>
        `;
        featWrap.appendChild(row);
      });

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

  // Park the area pick server-side, against whatever identity we know here.
  //
  // The handoff token already carries focusArea, but that only reaches the app
  // if the deep link resolves — which it doesn't survive a store install, a
  // denied clipboard paste, or the user finishing the quiz on a laptop. This is
  // the durable copy: the app claims it over an authenticated request whenever
  // it gets there. Fire-and-forget — never block or fail the funnel over it.
  //
  // Called here rather than at the focus step because that's the first point
  // where we know an email, which is what the record is keyed on.
  function _parkFocusArea(email, idToken) {
    if (!email || !state.focusArea) return;
    fetch(`${API_BASE}/public/onboarding/focus-area`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, focusArea: state.focusArea, idToken: idToken || null }),
    }).catch(() => { /* the token path may still deliver it */ });
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
      // idToken lets the backend record the uid too, which claims exactly even
      // when the app signs in with a different address (Apple private relay).
      _parkFocusArea(state.email, idToken);
      trackFunnel('signup');
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
    // No Firebase session on this path yet, so the record is claimable by email
    // only until the app signs in and backfills the uid.
    _parkFocusArea(val, null);
    trackFunnel('signup');
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

  // ── Meta click identifiers ────────────────────────────────
  // Both plans start with a trial, so the first real charge lands a week from
  // now — reported to Meta server-side from a Stripe webhook, by which time
  // this browser is long gone. The identifiers Meta needs to attribute that
  // charge only exist here, so they're captured at checkout and carried through
  // Stripe subscription metadata. See utils/meta_capi.py in the backend.
  function _cookie(name) {
    const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return m ? m.pop() : null;
  }
  function _metaClickIds() {
    // _fbp is written by the pixel on first visit. _fbc only exists if the
    // visitor arrived on a link carrying fbclid — and the pixel may not have
    // written it yet, so rebuild it from the URL in Meta's documented format.
    let fbc = _cookie('_fbc');
    if (!fbc) {
      const fbclid = new URLSearchParams(location.search).get('fbclid');
      if (fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
    }
    return { fbp: _cookie('_fbp'), fbc };
  }

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
          ..._metaClickIds(),
          // Parked on the Stripe subscription so the day-7 charge can be
          // recorded against the same funnel session that started here.
          funnelSession: window.sproutsFunnel ? sproutsFunnel.sessionId() : null,
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
      // Sent with sendBeacon, so it survives the navigation that follows.
      trackFunnel('checkout_start');
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

  // ── Keep the static markup in step with `state` ───────────
  // Answers survive in localStorage across page loads, but the `.selected`
  // classes live in the markup and don't — so without this a reload (or the
  // Retake button, which wipes state) leaves a step looking untouched while the
  // array behind it still holds the old picks, and the next tap ADDS to them.
  // That's how someone who picked one area reached the focus step with two.
  function syncSelections() {
    const multi = [
      ['ages',  '.q-choice', 'bracket', () => state.ageBrackets],
      ['areas', '.q-area',   'area',    () => state.areas],
    ];
    multi.forEach(([step, sel, key, get]) => {
      const picked = get();
      $$(`[data-step="${step}"] ${sel}`).forEach(el => {
        el.classList.toggle('selected', picked.includes(el.dataset[key]));
      });
    });

    const single = [
      ['mood',     () => state.mood],
      ['outcomes', () => state.outcome],
      ['tools',    () => state.tool],
      ['time',     () => (state.time == null ? null : String(state.time))],
      ['memory',   () => state.memory],
    ];
    single.forEach(([step, get]) => {
      const val = get();
      $$(`[data-step="${step}"] .q-choice`).forEach(el => {
        el.classList.toggle('selected', el.dataset.value === val);
      });
    });

    updateAgesContinue();
    updateAreasContinue();
  }

  // ── Back button ───────────────────────────────────────────
  $('[data-action="back"]').addEventListener('click', back);

  // ── Restart ───────────────────────────────────────────────
  $$('[data-action="restart"]').forEach(el => {
    el.addEventListener('click', () => {
      state = { ...defaultState };
      saveState();
      syncSelections();
      go('welcome');
    });
  });

  // ── Init ──────────────────────────────────────────────────
  // Start fresh on load (so refresh doesn't drop someone mid-quiz with stale state)
  // But we DO keep their answers — just send them back to welcome unless they're partway
  // For now: always start at welcome on fresh load
  state.step = 0;
  saveState();
  syncSelections();
  go('welcome');
})();
