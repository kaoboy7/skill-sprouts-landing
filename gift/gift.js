/**
 * Gift pages: https://skillsprouts.co/guides/{token} and /book-summaries/{token}
 *
 * A parent shares a guide or book summary from the app; the person they send
 * it to reads it here, with no app and no account. The token is a 3-day
 * credential minted by POST /gifts in the app's API, and the content comes
 * from GET /public/gifts/{token}.
 *
 * There is no file at either path — GitHub Pages serves 404.html, which loads
 * this script. It runs in <head> so it can mark the page as a gift before the
 * 404 markup paints, then renders into #gift once the DOM is ready. On any
 * other path it does nothing at all.
 *
 * Every piece of content goes in through textContent, never innerHTML.
 */
(function () {
  'use strict';

  // Keep in step with GIFT_PATH in deeplink-fallback.js, which has to stand
  // aside on these paths or it overwrites the page with its own 404.
  var GIFT_PATH = /^\/(guides|book-summaries)\/([A-Za-z0-9_-]+)\/?$/;

  var match = GIFT_PATH.exec(window.location.pathname || '');
  if (!match) return;

  // Same value as funnel.js and welcome/quiz.js.
  var API_BASE = 'https://fastapi-hello-world-service-386194120047.us-central1.run.app';
  var APP_STORE = 'https://apps.apple.com/us/app/skill-sprouts/id6754038900';
  var PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.skillsprouts.myapp';

  var kind = match[1] === 'guides' ? 'guide' : 'book';
  var token = match[2];
  var noun = kind === 'guide' ? 'guide' : 'book summary';

  document.documentElement.classList.add('is-gift');

  // A 3-day credential has no business in a search index.
  var robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, nofollow';
  document.head.appendChild(robots);
  document.title = 'A free ' + noun + ' for you · Skill Sprouts';

  // ── helpers ────────────────────────────────────────────────────────────

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function add(parent) {
    for (var i = 1; i < arguments.length; i++) {
      if (arguments[i]) parent.appendChild(arguments[i]);
    }
    return parent;
  }

  function platform() {
    var ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'android';
    if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
    return 'other';
  }

  function storeUrl() {
    return platform() === 'android' ? PLAY_STORE : APP_STORE;
  }

  function untilDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  }

  function badges() {
    var row = el('div', 'gift-badges');
    var apple = el('a');
    apple.href = APP_STORE;
    apple.target = '_blank';
    apple.rel = 'noopener noreferrer';
    var appleImg = el('img');
    appleImg.src = '/badge_apple_store.svg';
    appleImg.alt = 'Download on the App Store';
    apple.appendChild(appleImg);

    var play = el('a');
    play.href = PLAY_STORE;
    play.target = '_blank';
    play.rel = 'noopener noreferrer';
    var playImg = el('img');
    playImg.src = '/badge_google_play.svg';
    playImg.alt = 'Get it on Google Play';
    play.appendChild(playImg);

    // Lead with the store this visitor can actually use.
    if (platform() === 'android') add(row, play, apple);
    else add(row, apple, play);
    return row;
  }

  // ── the parts of the page ──────────────────────────────────────────────

  function giftNote(expiresAt) {
    var until = untilDate(expiresAt);
    var note = el('div', 'gift-note');
    add(note,
      el('span', 'gift-note-icon', '🎁'),
      add(el('div'),
        el('div', 'gift-note-title', 'You received a free ' + noun + '.'),
        el('div', 'gift-note-body',
          'Someone thought this would help. It’s yours to read' +
          (until ? ' until ' + until : ' for the next few days') +
          ' — no app and no account needed.')
      )
    );
    return note;
  }

  function readMins(n) {
    return n ? n + ' min read' : null;
  }

  function guideList(list) {
    if (!list || !list.items || !list.items.length) return null;
    if (list.type === 'dodont') {
      var table = el('div', 'gift-dodont');
      add(table, el('div', 'gift-dodont-head gift-do', 'Try'),
        el('div', 'gift-dodont-head gift-dont', 'Instead of'));
      list.items.forEach(function (it) {
        add(table, el('div', 'gift-dodont-cell gift-do', it.do || ''),
          el('div', 'gift-dodont-cell gift-dont', it.dont || ''));
      });
      return table;
    }
    var ordered = list.type === 'ol';
    var wrap = el(ordered ? 'ol' : 'ul', 'gift-list' + (ordered ? ' is-ordered' : ''));
    list.items.forEach(function (it) {
      var li = el('li');
      if (it.title) add(li, el('strong', null, it.title));
      if (it.body) add(li, el('p', null, it.body));
      wrap.appendChild(li);
    });
    return wrap;
  }

  function renderGuide(root, g) {
    document.title = g.title + ' · A free guide from Skill Sprouts';
    var meta = ['Guide', readMins(g.read_mins), g.age_range].filter(Boolean).join(' · ');
    add(root,
      el('div', 'gift-eyebrow', meta),
      el('h1', 'gift-title', g.title),
      g.deck ? el('p', 'gift-deck', g.deck) : null,
      g.hook ? el('p', 'gift-hook', g.hook) : null
    );

    if (g.tldr && g.tldr.steps && g.tldr.steps.length) {
      var tldr = el('aside', 'gift-tldr');
      add(tldr, el('div', 'gift-tldr-label', g.tldr.label || 'The short version'));
      var ol = el('ol');
      g.tldr.steps.forEach(function (s) { ol.appendChild(el('li', null, s)); });
      add(root, add(tldr, ol));
    }

    (g.sections || []).forEach(function (s) {
      var sec = el('section', 'gift-section' + (s.tone === 'note' ? ' is-note' : ''));
      if (s.heading) add(sec, el('h2', null, s.heading));
      (s.body || []).forEach(function (p) { sec.appendChild(el('p', null, p)); });
      if (s.quote) add(sec, el('blockquote', 'gift-quote', s.quote));
      add(sec, guideList(s.list));
      root.appendChild(sec);
    });
  }

  function renderBook(root, b) {
    document.title = b.title + ' · A free book summary from Skill Sprouts';
    var byline = 'by ' + b.author + (b.year ? ' (' + b.year + ')' : '');
    add(root,
      el('div', 'gift-eyebrow', ['Book summary', readMins(b.read_mins)].filter(Boolean).join(' · ')),
      el('h1', 'gift-title', b.title),
      b.subtitle ? el('p', 'gift-subtitle', b.subtitle) : null,
      el('p', 'gift-byline', byline),
      b.claim ? el('p', 'gift-deck', b.claim) : null
    );
    if (b.why_now) {
      add(root, add(el('aside', 'gift-tldr'),
        el('div', 'gift-tldr-label', 'Why read it now'),
        el('p', null, b.why_now)));
    }

    (b.ideas || []).forEach(function (idea, i) {
      var sec = el('section', 'gift-section gift-idea');
      add(sec,
        el('div', 'gift-idea-num', 'Idea ' + (i + 1)),
        el('h2', null, idea.heading)
      );
      (idea.body || []).forEach(function (p) { sec.appendChild(el('p', null, p)); });
      if (idea.takeaway) add(sec, el('blockquote', 'gift-quote', idea.takeaway));
      if (idea.action) {
        add(sec, add(el('div', 'gift-try'),
          el('div', 'gift-try-label', 'Try this'),
          el('p', null, idea.action)));
      }
      root.appendChild(sec);
    });
    add(root, el('p', 'gift-disclaimer',
      'An original summary by Skill Sprouts of ideas from ' + b.title + ' by ' +
      b.author + '. Not affiliated with or endorsed by the author or publisher.'));
  }

  function appCta(heading) {
    var card = el('div', 'gift-cta');
    add(card,
      el('h2', null, heading),
      el('p', null,
        'Skill Sprouts is short guides on the hard parts of parenting, the best parenting books ' +
        'in about twelve minutes each, and plans that turn what you read into ' +
        'something your child practices — one 3–5 minute step a day.'),
      el('p', 'gift-cta-free', 'Try everything free for 7 days. No card needed.'),
      badges()
    );
    return card;
  }

  function renderProblem(root, title, body) {
    add(root,
      el('div', 'gift-problem-icon', '🎁'),
      el('h1', 'gift-title gift-problem-title', title),
      el('p', 'gift-deck', body),
      appCta('Want to keep reading?')
    );
  }

  // ── boot ───────────────────────────────────────────────────────────────

  function render() {
    var main = el('main', 'gift');
    main.id = 'gift';
    var col = el('div', 'gift-col');
    main.appendChild(col);
    col.appendChild(el('p', 'gift-loading', 'Opening your gift…'));

    var nav = document.querySelector('.nav-cta');
    if (nav) {
      nav.textContent = 'Get the app';
      nav.href = storeUrl();
      nav.target = '_blank';
      nav.rel = 'noopener noreferrer';
    }
    var anchor = document.querySelector('.nav');
    if (anchor && anchor.nextSibling) anchor.parentNode.insertBefore(main, anchor.nextSibling);
    else document.body.appendChild(main);

    fetch(API_BASE + '/public/gifts/' + encodeURIComponent(token))
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { status: res.status, body: body };
        });
      })
      .then(function (r) {
        col.textContent = '';
        if (r.status === 410) {
          renderProblem(col, 'This gift has expired.',
            'Gift links last three days. Ask whoever sent it for a fresh one, or ' +
            'get the app and read it there.');
          return;
        }
        if (r.status !== 200) {
          renderProblem(col, 'We couldn’t find this gift.',
            'The link may be incomplete — check it was copied in full — or the ' +
            noun + ' may no longer be available.');
          return;
        }
        var data = r.body;
        col.appendChild(giftNote(data.expires_at));
        var article = el('article', 'gift-article');
        if (data.kind === 'guide' && data.guide) renderGuide(article, data.guide);
        else if (data.book) renderBook(article, data.book);
        col.appendChild(article);
        col.appendChild(appCta(
          kind === 'guide' ? 'There’s more where this came from.' : 'That’s one book. There’s a whole shelf.'));
      })
      .catch(function () {
        col.textContent = '';
        renderProblem(col, 'We couldn’t open this gift.',
          'Something went wrong on the way. Check your connection and refresh the page.');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
