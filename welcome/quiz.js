// Skill Sprouts — Quiz funnel logic

(function() {
  var STORAGE_KEY = 'sprouts_quiz_state';

  // ── State ─────────────────────────────────────────────────
  var defaultState = {
    step: 0,
    kidsCount: null,
    ages: [],
    areas: [],
    mood: null,
    time: null,
    coParent: null,
    memory: null,
    focusArea: null,
    email: '',
  };
  var state = loadState();
  function loadState() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return Object.assign({}, defaultState, JSON.parse(saved));
    } catch (e) {}
    return Object.assign({}, defaultState);
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ── Step order ────────────────────────────────────────────
  var STEPS = [
    'welcome',
    'kids',
    'ages',
    'areas',
    'mood',
    'time',
    'coparent',
    'memory',
    'focus',
    'loading',
    'results',
  ];
  var TOTAL_Q = 8;

  // ── FB tracking ───────────────────────────────────────────
  var STEP_TRACKING = {
    'welcome':      { step_number: 1, question: 'welcome' },
    'kids':         { step_number: 2, question: 'kids_count' },
    'ages':         { step_number: 3, question: 'ages' },
    'areas':        { step_number: 4, question: 'hard_areas' },
    'mood':         { step_number: 5, question: 'mood' },
    'time':         { step_number: 6, question: 'time_budget' },
    'coparent':     { step_number: 7, question: 'coparent' },
    'memory':       { step_number: 8, question: 'memory_keeping' },
    'focus':        { step_number: 9, question: 'focus_area' },
  };

  function trackStep(stepName) {
    var t = STEP_TRACKING[stepName];
    if (!t || typeof fbq === 'undefined') return;
    fbq('trackCustom', 'Survey_Progress', { step_number: t.step_number, question: t.question });
  }

  // ── Area metadata ─────────────────────────────────────────
  var AREAS = {
    tantrums: { name: 'Tantrums & Big Emotions', short: 'Big Emotions', tagline: 'Co-regulate, name the feeling, ride the wave.', color: '#BC4B51', tint: '#FBE6E1', habits: ['Name the feeling out loud', 'Drop to their eye level', 'Take 3 breaths before responding'] },
    eating:   { name: 'Picky Eating', short: 'Picky Eating', tagline: 'Offer, don’t pressure. Curiosity over clean plates.', color: '#F4A259', tint: '#FCEBD3', habits: ['Put one new food on the plate', 'Eat the new food yourself', 'Skip the clean-plate ask'] },
    potty:    { name: 'Potty Training', short: 'Potty', tagline: 'Follow their lead. Celebrate effort, not outcome.', color: '#5B8E7D', tint: '#DCEBE5', habits: ['Offer a sit before transitions', 'Celebrate the try', 'Keep accidents low-drama'] },
    sleep:    { name: 'Sleep & Bedtime', short: 'Sleep', tagline: 'Same order, same rhythm, soft landings.', color: '#7A8AA7', tint: '#E3E8F0', habits: ['Dim the lights 45 min before bed', 'Three-step bedtime ritual', 'One quiet question at tuck-in'] },
    independence: { name: 'Independence & Chores', short: 'Independence', tagline: 'Let them do it slow. That’s the win.', color: '#8A6BAE', tint: '#E8DEF0', habits: ['Let them dress themselves', 'One chore, age-appropriate', 'Ask “what’s your plan?”'] },
    school:   { name: 'School Readiness', short: 'School', tagline: 'Curiosity, not flashcards.', color: '#C98A6B', tint: '#F1E2D5', habits: ['Read together for 15 min', 'Ask an open question at pickup', 'Wonder out loud'] },
  };

  var KID_COLORS = ['#F4A259', '#5B8E7D', '#BC4B51', '#8A6BAE'];
  var KID_NAMES  = ['Kid 1', 'Kid 2', 'Kid 3', 'Kid 4'];

  // ── DOM helpers ───────────────────────────────────────────
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  // ── Navigation ────────────────────────────────────────────
  function go(stepName) {
    var currentStepName = STEPS[state.step];
    var newIdx = STEPS.indexOf(stepName);
    if (newIdx < 0) return;

    // Track forward navigation
    if (newIdx > state.step) {
      trackStep(currentStepName);
    }

    state.step = newIdx;
    saveState();

    $$('.quiz-screen').forEach(function(s) { s.classList.remove('active'); });
    var target = document.querySelector('[data-step="' + stepName + '"]');
    if (target) target.classList.add('active');

    updateProgress();
    updateBack();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (stepName === 'ages')    renderAges();
    if (stepName === 'focus')   renderFocus();
    if (stepName === 'loading') runLoading();
    if (stepName === 'results') renderResults();
  }

  function back() {
    var idx = state.step;
    if (idx <= 0) return;
    go(STEPS[idx - 1]);
  }

  function updateProgress() {
    var stepName = STEPS[state.step];
    var isWelcome  = stepName === 'welcome';
    var isPostQ    = stepName === 'loading' || stepName === 'results';
    var wrap       = $('.quiz-progress-wrap');
    if (!wrap) return;

    if (isWelcome) { wrap.style.visibility = 'hidden'; return; }
    wrap.style.visibility = 'visible';

    if (isPostQ) {
      $('.quiz-progress-bar > div').style.width = '100%';
      $('.quiz-progress-label').textContent = stepName === 'loading' ? 'Building your plan' : 'Your plan';
    } else {
      var qIndex = STEPS.indexOf(stepName) - 1;
      var next   = ((qIndex + 1) / TOTAL_Q) * 100;
      $('.quiz-progress-bar > div').style.width = next + '%';
      $('.quiz-progress-label').textContent = 'Step ' + (qIndex + 1) + ' of ' + TOTAL_Q;
    }
  }

  function updateBack() {
    var idx      = state.step;
    var stepName = STEPS[idx];
    var showBack = idx > 0 && stepName !== 'loading' && stepName !== 'results';
    $('.quiz-back-row').style.visibility = showBack ? 'visible' : 'hidden';
  }

  // ── Welcome ───────────────────────────────────────────────
  $('[data-action="begin"]').addEventListener('click', function() { go('kids'); });

  // ── Kids count ────────────────────────────────────────────
  $$('[data-step="kids"] .q-bigchip').forEach(function(el) {
    el.addEventListener('click', function() {
      var n = Number(el.dataset.n);
      state.kidsCount = n;
      if (state.ages.length > n) state.ages = state.ages.slice(0, n);
      while (state.ages.length < n) state.ages.push(null);
      $$('[data-step="kids"] .q-bigchip').forEach(function(c) { c.classList.remove('selected'); });
      el.classList.add('selected');
      saveState();
      setTimeout(function() { go('ages'); }, 320);
    });
  });

  // ── Ages ──────────────────────────────────────────────────
  function renderAges() {
    var wrap  = $('[data-step="ages"] .q-ages-list');
    wrap.innerHTML = '';
    var count = state.kidsCount || 1;
    for (var i = 0; i < count; i++) {
      (function(idx) {
        var row   = document.createElement('div');
        row.className = 'q-age-row';
        var picked    = state.ages[idx];
        var placeholder = count > 1 ? 'Kid #' + (idx + 1) : 'Your little one';
        var ageLabel    = picked !== null && picked !== undefined
          ? (picked === 12 ? '12+' : picked + (picked === 1 ? ' year' : ' years')) + ' old'
          : '';
        row.innerHTML =
          '<div class="head">' +
            '<div class="who">' + placeholder + (ageLabel ? ' — <em>' + ageLabel + '</em>' : '') + '</div>' +
            (picked !== null && picked !== undefined ? '<span class="picked">Set</span>' : '') +
          '</div>' +
          '<div class="q-age-chips">' +
          [0,1,2,3,4,5,6,7,8,9,10,11,12].map(function(age) {
            return '<button class="q-age-chip' + (picked === age ? ' selected' : '') + '" data-age="' + age + '">' + (age === 12 ? '12+' : age) + '</button>';
          }).join('') +
          '</div>';
        row.querySelectorAll('.q-age-chip').forEach(function(btn) {
          btn.addEventListener('click', function() {
            state.ages[idx] = Number(btn.dataset.age);
            saveState();
            renderAges();
            updateAgesContinue();
          });
        });
        wrap.appendChild(row);
      })(i);
    }
    updateAgesContinue();
  }
  function updateAgesContinue() {
    var ok = state.ages.length === state.kidsCount && state.ages.every(function(a) { return a !== null && a !== undefined; });
    $('[data-step="ages"] .q-continue').disabled = !ok;
  }
  $('[data-step="ages"] .q-continue').addEventListener('click', function() { go('areas'); });

  // ── Areas multi-select ────────────────────────────────────
  $$('[data-step="areas"] .q-area').forEach(function(el) {
    el.addEventListener('click', function() {
      var id  = el.dataset.area;
      var has = state.areas.indexOf(id) !== -1;
      if (has) state.areas = state.areas.filter(function(a) { return a !== id; });
      else state.areas = state.areas.concat([id]);
      el.classList.toggle('selected', !has);
      saveState();
      updateAreasContinue();
    });
  });
  function updateAreasContinue() {
    var n = state.areas.length;
    $('[data-step="areas"] .q-continue').disabled = n === 0;
    $('[data-step="areas"] .q-continue-label').textContent =
      n === 0 ? 'Pick at least one' : (n === 1 ? 'Continue with 1' : 'Continue with ' + n);
  }
  $('[data-step="areas"] .q-continue').addEventListener('click', function() { go('mood'); });

  // ── Mood ──────────────────────────────────────────────────
  $$('[data-step="mood"] .q-choice').forEach(function(el) {
    el.addEventListener('click', function() {
      state.mood = el.dataset.value;
      $$('[data-step="mood"] .q-choice').forEach(function(c) { c.classList.remove('selected'); });
      el.classList.add('selected');
      saveState();
      setTimeout(function() { go('time'); }, 280);
    });
  });

  // ── Time ──────────────────────────────────────────────────
  $$('[data-step="time"] .q-choice').forEach(function(el) {
    el.addEventListener('click', function() {
      state.time = Number(el.dataset.value);
      $$('[data-step="time"] .q-choice').forEach(function(c) { c.classList.remove('selected'); });
      el.classList.add('selected');
      saveState();
      setTimeout(function() { go('coparent'); }, 280);
    });
  });

  // ── Co-parent ─────────────────────────────────────────────
  $$('[data-step="coparent"] .q-choice').forEach(function(el) {
    el.addEventListener('click', function() {
      state.coParent = el.dataset.value;
      $$('[data-step="coparent"] .q-choice').forEach(function(c) { c.classList.remove('selected'); });
      el.classList.add('selected');
      saveState();
      setTimeout(function() { go('memory'); }, 280);
    });
  });

  // ── Memory ────────────────────────────────────────────────
  $$('[data-step="memory"] .q-choice').forEach(function(el) {
    el.addEventListener('click', function() {
      state.memory = el.dataset.value;
      $$('[data-step="memory"] .q-choice').forEach(function(c) { c.classList.remove('selected'); });
      el.classList.add('selected');
      saveState();
      setTimeout(function() { go('focus'); }, 280);
    });
  });

  // ── Focus pick ────────────────────────────────────────────
  function renderFocus() {
    var wrap  = $('[data-step="focus"] .q-choices');
    wrap.innerHTML = '';
    var picks = state.areas.length ? state.areas : Object.keys(AREAS);
    picks.forEach(function(id) {
      var a   = AREAS[id];
      var sel = state.focusArea === id ? 'selected' : '';
      var btn = document.createElement('button');
      btn.className = 'q-choice ' + sel;
      btn.dataset.value = id;
      btn.innerHTML =
        '<span class="swatch" style="background:' + a.tint + '; color:' + a.color + ';">' +
          '<span style="width:14px;height:14px;border-radius:50%;background:' + a.color + '"></span>' +
        '</span>' +
        '<span>' +
          '<span class="label">' + a.name + '</span>' +
          '<span class="label-sub">' + a.tagline + '</span>' +
        '</span>' +
        '<span class="check"></span>';
      btn.addEventListener('click', function() {
        state.focusArea = id;
        $$('[data-step="focus"] .q-choice').forEach(function(c) { c.classList.remove('selected'); });
        btn.classList.add('selected');
        saveState();
        setTimeout(function() { go('loading'); }, 300);
      });
      wrap.appendChild(btn);
    });
  }

  // ── Loading ───────────────────────────────────────────────
  function runLoading() {
    var ticker   = $('[data-step="loading"] .ticker');
    var areaName = state.focusArea ? AREAS[state.focusArea].short.toLowerCase() : 'your area';
    var timeStr  = state.time === 2 ? 'just two minutes' : state.time === 5 ? 'five-minute windows' : 'ten-minute reps';
    var kidWord  = state.kidsCount > 1 ? 's' : '';
    var messages = [
      'Reading what you told us…',
      'Choosing habits for ' + areaName + '…',
      'Calibrating for ' + timeStr + '…',
      'Pairing with your little human' + kidWord + '…',
      'Tying it all to a sprout…',
    ];
    var i = 0;
    ticker.textContent = messages[0];
    var interval = setInterval(function() {
      i++;
      if (i >= messages.length) {
        clearInterval(interval);
        setTimeout(function() { go('results'); }, 500);
        return;
      }
      ticker.style.opacity = 0;
      setTimeout(function() {
        ticker.textContent = messages[i];
        ticker.style.opacity = 1;
      }, 220);
    }, 800);
  }

  // ── Results ───────────────────────────────────────────────
  function renderResults() {
    var focus = state.focusArea || (state.areas[0] || 'tantrums');
    var area  = AREAS[focus];

    // Meta
    $('[data-step="results"] .results-name').innerHTML = 'Your plan,<br><em>ready to plant.</em>';
    $('[data-step="results"] .results-meta').textContent =
      state.kidsCount + ' ' + (state.kidsCount === 1 ? 'kid' : 'kids') +
      ' · ' + state.areas.length + ' area' + (state.areas.length === 1 ? '' : 's') +
      ' · ' + state.time + ' min/day';

    // Summary card
    var minutesText = state.time + ' min';
    $('[data-step="results"] .summary-card').innerHTML =
      '<div class="stat">' +
        '<div class="k">Starting with</div>' +
        '<div class="v"><em>' + area.short + '</em></div>' +
        '<div class="vs">' + (state.areas.length > 1 ? '+ ' + (state.areas.length - 1) + ' more area' + (state.areas.length === 2 ? '' : 's') + ' unlocked' : 'Master one, add more later') + '</div>' +
      '</div>' +
      '<div class="stat">' +
        '<div class="k">Daily commitment</div>' +
        '<div class="v">' + minutesText + '<em>/day</em></div>' +
        '<div class="vs">' + (state.time === 2 ? 'About as long as a breath' : state.time === 5 ? 'A coffee’s worth' : 'Real time, real change') + '</div>' +
      '</div>' +
      '<div class="stat">' +
        '<div class="k">Starter habits</div>' +
        '<div class="v">3<em> habits</em></div>' +
        '<div class="vs">Beginner level, ' + area.short.toLowerCase() + '</div>' +
      '</div>';

    // Kid pills
    var kidsWrap = $('[data-step="results"] .kid-pills');
    kidsWrap.innerHTML = '';
    for (var i = 0; i < state.kidsCount; i++) {
      var age   = state.ages[i];
      var color = KID_COLORS[i % KID_COLORS.length];
      var name  = KID_NAMES[i % KID_NAMES.length];
      var ageLabel = age === 12 ? '12+ years' : (age + ' ' + (age === 1 ? 'year' : 'years'));
      var pill = document.createElement('span');
      pill.className = 'kid-pill';
      pill.innerHTML =
        '<span class="av" style="background:' + color + ';">' + name[0] + '</span>' +
        name + ' · ' + ageLabel;
      kidsWrap.appendChild(pill);
    }

    // Starter habits
    var habitsWrap = $('[data-step="results"] .starter-habits');
    habitsWrap.innerHTML = '';
    area.habits.forEach(function(name) {
      var row = document.createElement('div');
      row.className = 'starter-habit';
      row.innerHTML =
        '<span class="ring" style="border-color:' + area.color + '"></span>' +
        '<div style="flex:1;">' +
          '<div class="title">' + name + '</div>' +
          '<div class="meta"><span class="dot" style="background:' + area.color + '"></span>' + area.short + ' · Beginner · ~2 min</div>' +
        '</div>';
      habitsWrap.appendChild(row);
    });

    // Memory block
    var memWrap = $('[data-step="results"] .memory-block');
    memWrap.style.display = (state.memory === 'yes' || state.memory === 'maybe') ? '' : 'none';

    // Mood-personalized CTA headline
    var ctaHead = $('[data-step="results"] .cta-card h3');
    var moodMap = {
      reactive: 'You’re ready to <em>do better.</em><br>Let’s start small.',
      tired:    'You showed up here.<br>That’s already <em>the work.</em>',
      curious:  'You’re curious.<br>Your <em>sprout is too.</em>',
      lost:     'You’re not <em>lost.</em><br>You’re just deep in it.',
      mix:      'All of it.<br>That’s <em>parenting.</em>',
    };
    ctaHead.innerHTML = moodMap[state.mood] || 'Plant your<br><em>first sprout.</em>';
  }

  // ── Store button FB tracking ──────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    var appBtn = document.getElementById('btn-appstore');
    var gpBtn  = document.getElementById('btn-googleplay');
    if (appBtn) appBtn.addEventListener('click', function() {
      if (typeof fbq !== 'undefined') {
        fbq('track', 'Lead', { content_name: 'AppStore' });
        fbq('track', 'Purchase', { content_name: 'AppStore' });
      }
    });
    if (gpBtn) gpBtn.addEventListener('click', function() {
      if (typeof fbq !== 'undefined') {
        fbq('track', 'Lead', { content_name: 'GooglePlay' });
        fbq('track', 'Purchase', { content_name: 'GooglePlay' });
      }
    });
  });

  // ── Email ─────────────────────────────────────────────────
  $('[data-action="email-plan"]').addEventListener('click', function(e) {
    e.preventDefault();
    var input = $('[data-action="email-input"]');
    var val   = input.value.trim();
    if (!val || !/.+@.+\..+/.test(val)) {
      input.style.borderColor = '#BC4B51'; input.focus(); return;
    }
    state.email = val; saveState();
    input.style.borderColor = '';
    e.target.textContent = '✓ Sent';
    e.target.style.background = '#5B8E7D';
    setTimeout(function() { e.target.textContent = 'Send'; e.target.style.background = ''; }, 2500);
  });

  // ── Back ──────────────────────────────────────────────────
  $('[data-action="back"]').addEventListener('click', back);

  // ── Restart ───────────────────────────────────────────────
  $$('[data-action="restart"]').forEach(function(el) {
    el.addEventListener('click', function() {
      state = Object.assign({}, defaultState);
      saveState();
      go('welcome');
    });
  });

  // ── Init (always start at welcome on load) ────────────────
  state.step = 0;
  saveState();
  go('welcome');
})();
