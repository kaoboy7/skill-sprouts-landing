/**
 * Web fallback for https://skillsprouts.co/courseDetails[/:id]
 * — Android: intent URL opens the app if installed, else Play Store
 * — iOS: short delay then App Store (placeholder ID until real listing)
 * — Desktop: stay on page with store links
 */
(function () {
  'use strict';

  var PLAY_STORE =
    'https://play.google.com/store/apps/details?id=com.skillsprouts.myapp';
  var APP_STORE = 'https://apps.apple.com/app/id123456789';
  var PACKAGE = 'com.skillsprouts.myapp';
  var HOME = '/';

  function normalizedPath() {
    var p = window.location.pathname || '';
    if (p.length > 1 && p.lastIndexOf('/') === p.length - 1) {
      p = p.slice(0, -1);
    }
    return p || '/';
  }

  function isCourseDetailsPath() {
    return /^\/courseDetails(?:\/[^/]+)?$/.test(normalizedPath());
  }

  function detectPlatform() {
    var ua = navigator.userAgent || navigator.vendor || '';
    if (/android/i.test(ua)) return 'android';
    if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios';
    return 'other';
  }

  function androidIntentUrl() {
    var host = window.location.host;
    var path = window.location.pathname || '/';
    if (!path.startsWith('/')) path = '/' + path;
    return (
      'intent://' +
      host +
      path +
      '#Intent;scheme=https;package=' +
      PACKAGE +
      ';S.browser_fallback_url=' +
      encodeURIComponent(PLAY_STORE) +
      ';end'
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function courseShell(title, bodyInner) {
    return (
      '<!DOCTYPE html><html lang="en"><head>' +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<meta name="theme-color" content="#3f51b5">' +
      '<title>' +
      escapeHtml(title) +
      '</title>' +
      '<style>' +
      '*,*::before,*::after{box-sizing:border-box}' +
      'body{margin:0;min-height:100vh;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;' +
      'background:linear-gradient(120deg,#eef2ff 0%,#f9fafb 100%);color:#1f2937;display:flex;align-items:center;justify-content:center;padding:1.25rem}' +
      '.card{background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(15,23,42,.08);max-width:28rem;width:100%;padding:1.75rem 1.5rem;text-align:center}' +
      '.logo{font-weight:700;font-size:1.125rem;color:#111827;margin-bottom:1rem}' +
      'h1{font-size:1.375rem;margin:0 0 .5rem;font-weight:700}' +
      'p{font-size:.9375rem;line-height:1.5;color:#4b5563;margin:0 0 1rem}' +
      '.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.65rem 1.25rem;' +
      'border-radius:8px;font-weight:600;font-size:.9375rem;text-decoration:none;margin:.25rem}' +
      '.btn-primary{background:#3f51b5;color:#fff}' +
      '.btn-primary:hover{background:#303f9f}' +
      '.btn-outline{border:1px solid #e5e7eb;color:#374151;background:#f9fafb}' +
      '.stores{display:flex;flex-direction:column;gap:.75rem;align-items:center;margin-top:1rem}' +
      '@media(min-width:480px){.stores{flex-direction:row;justify-content:center;flex-wrap:wrap}}' +
      '.hint{font-size:.8125rem;color:#6b7280;margin-top:1rem}' +
      '</style></head><body>' +
      '<div class="card">' +
      bodyInner +
      '</div></body></html>'
    );
  }

  function renderCoursePage() {
    var fullUrl = window.location.href;
    var platform = detectPlatform();
    var openAppHref = escapeHtml(fullUrl);

    var body =
      '<div class="logo">Skill Sprouts</div>' +
      '<h1>Open in Skill Sprouts</h1>' +
      '<p>This link opens in the app when you have it installed. ' +
      'If you don’t, use the store links below.</p>' +
      '<a class="btn btn-primary" href="' +
      openAppHref +
      '">Try opening in the app</a>' +
      '<div class="stores">' +
      '<a class="btn btn-outline" href="' +
      escapeHtml(APP_STORE) +
      '" target="_blank" rel="noopener noreferrer">App Store</a>' +
      '<a class="btn btn-outline" href="' +
      escapeHtml(PLAY_STORE) +
      '" target="_blank" rel="noopener noreferrer">Google Play</a>' +
      '</div>' +
      '<p class="hint" id="deeplink-status"></p>';

    document.open();
    document.write(courseShell('Skill Sprouts — Open link', body));
    document.close();

    var statusEl = document.getElementById('deeplink-status');

    if (platform === 'android') {
      if (statusEl) statusEl.textContent = 'Opening the app or store…';
      window.location.href = androidIntentUrl();
      window.setTimeout(function () {
        window.location.replace(PLAY_STORE);
      }, 2800);
      return;
    }

    if (platform === 'ios') {
      if (statusEl) {
        statusEl.textContent = 'Taking you to the App Store…';
      }
      window.setTimeout(function () {
        window.location.replace(APP_STORE);
      }, 1600);
      return;
    }

    if (statusEl) {
      statusEl.textContent = 'Download the app to open this course on your phone.';
    }
  }

  function renderNotFoundPage() {
    var body =
      '<div class="logo">Skill Sprouts</div>' +
      '<h1>Page not found</h1>' +
      '<p>This page doesn’t exist or has moved.</p>' +
      '<a class="btn btn-primary" href="' +
      escapeHtml(HOME) +
      '">Back to home</a>';
    document.open();
    document.write(courseShell('Page not found — Skill Sprouts', body));
    document.close();
  }

  if (isCourseDetailsPath()) {
    renderCoursePage();
  } else {
    renderNotFoundPage();
  }
})();
