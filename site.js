/* =========================================================
   COFFRE À DOM — interactions globales
   ========================================================= */
(function () {
  'use strict';
  var mq = window.matchMedia('(max-width: 900px)');

  /* ---- Nav shadow on scroll ---- */
  var nav = document.getElementById('nav');
  function onScroll() { if (nav) nav.classList.toggle('scrolled', window.scrollY > 24); }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---- Active nav highlight ---- */
  var current = document.body.getAttribute('data-nav');
  if (current) {
    document.querySelectorAll('.nav__links [data-k]').forEach(function (a) {
      if (a.getAttribute('data-k') === current) a.classList.add('is-active');
    });
  }

  /* ---- Mobile menu ---- */
  var burger = document.getElementById('navBurger');
  var links = document.getElementById('navLinks');
  function setMenu(open) {
    if (!links) return;
    links.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
    if (!open) {
      links.querySelectorAll('.nav__item.open').forEach(function (i) { i.classList.remove('open'); });
    }
  }
  if (burger) burger.addEventListener('click', function () {
    document.body.classList.add('nav-ready'); // active les transitions après 1re interaction (pas de flash au chargement/redimensionnement)
    setMenu(!links.classList.contains('open'));
  });

  /* ---- Dropdowns / mega-menu ----
     Piloté en JS (classe .is-open) pour ne pas dépendre uniquement du :hover CSS.
     Desktop : ouverture au survol (avec délai de fermeture). Mobile : au tap. */
  var closeTimer;
  function closeAll(except) {
    document.querySelectorAll('.nav__item.is-open, .nav__item.open').forEach(function (i) {
      if (i !== except) i.classList.remove('is-open', 'open');
    });
  }
  document.querySelectorAll('.nav__item--mega, .nav__item--drop').forEach(function (item) {
    var toggle = item.querySelector('.nav__toggle');

    // Desktop : survol
    item.addEventListener('mouseenter', function () {
      if (mq.matches) return;
      clearTimeout(closeTimer);
      closeAll(item);
      item.classList.add('is-open');
    });
    item.addEventListener('mouseleave', function () {
      if (mq.matches) return;
      closeTimer = setTimeout(function () { item.classList.remove('is-open'); }, 180);
    });

    // Mobile : premier tap = déplier (accordéon), pas de navigation
    if (toggle) toggle.addEventListener('click', function (e) {
      if (mq.matches && !item.classList.contains('open')) {
        e.preventDefault();
        closeAll(item);
        item.classList.add('open');
      }
    });
  });
  // Ferme les menus desktop si on clique ailleurs / focus sort
  document.addEventListener('click', function (e) {
    if (!mq.matches && !e.target.closest('.nav__item--mega, .nav__item--drop')) closeAll(null);
  });

  // Close menu when clicking a real link
  if (links) links.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      if (!a.classList.contains('nav__toggle') || !mq.matches) setMenu(false);
    });
  });

  // Close on Escape
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

  /* ---- Sélecteur de langue ---- */
  var langSwitch = document.querySelector('[data-lang-switch]');
  if (langSwitch) {
    var langBtn = langSwitch.querySelector('.lang-switch__btn');
    if (langBtn) langBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = langSwitch.classList.toggle('is-open');
      langBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('[data-lang-switch]')) { langSwitch.classList.remove('is-open'); if (langBtn) langBtn.setAttribute('aria-expanded', 'false'); }
    });
  }

  /* ---- Reveal on scroll ---- */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e, i) {
        if (e.isIntersecting) {
          setTimeout(function () { e.target.classList.add('in'); }, (i % 4) * 70);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---- Newsletter Brevo ---- */
  var newsForm = document.getElementById('newsForm');
  if (newsForm) {
    var newsMsg = document.querySelector('[data-news-msg]');
    var setMsg = function (text, ok) {
      if (!newsMsg) return;
      newsMsg.textContent = text;
      newsMsg.className = 'news-msg ' + (ok ? 'is-ok' : 'is-err');
    };
    newsForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = document.getElementById('newsEmail');
      var email = (input.value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setMsg('Entre une adresse e-mail valide.', false); return; }
      var btn = newsForm.querySelector('button');
      btn.disabled = true; setMsg('Inscription en cours…', true);

      // Aperçu local : la fonction Netlify n'existe pas → on simule.
      var isLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
      if (isLocal) {
        setTimeout(function () { setMsg('✅ Merci ! (démo locale — actif une fois déployé sur Netlify)', true); newsForm.reset(); btn.disabled = false; }, 500);
        return;
      }
      fetch('/.netlify/functions/brevo-subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.ok) { setMsg('✅ ' + (d.message || 'Inscription confirmée !'), true); newsForm.reset(); }
        else { setMsg('⚠️ ' + ((d && d.error) || 'Inscription impossible.'), false); }
      }).catch(function () {
        setMsg('⚠️ Erreur réseau. Réessaie plus tard.', false);
      }).finally(function () { btn.disabled = false; });
    });
  }

  /* ---- Bannière cookies ---- */
  (function cookieBanner() {
    var KEY = 'cad_cookie_consent';
    function hasChoice() { try { return !!localStorage.getItem(KEY); } catch (e) { return true; } }
    function setChoice(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
    function show() {
      if (document.querySelector('.cookie-banner')) return;
      var el = document.createElement('div');
      el.className = 'cookie-banner';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Gestion des cookies');
      el.innerHTML =
        '<p>🍪 On utilise des cookies essentiels au fonctionnement du site, et des cookies de mesure/marketing <strong>uniquement avec ton accord</strong>. <a href="/politique-cookies/">En savoir plus</a></p>' +
        '<div class="cookie-banner__btns">' +
          '<button type="button" class="btn btn--ghost btn--sm" data-cc="essential">Refuser</button>' +
          '<button type="button" class="btn btn--gold btn--sm" data-cc="all">Tout accepter</button>' +
        '</div>';
      document.body.appendChild(el);
      requestAnimationFrame(function () { el.classList.add('in'); });
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-cc]');
        if (!b) return;
        setChoice(b.getAttribute('data-cc'));
        el.classList.remove('in');
        setTimeout(function () { el.remove(); }, 300);
      });
    }
    if (!hasChoice()) show();
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-cookie-reopen]')) { e.preventDefault(); show(); }
    });
  })();

  /* ---- Compteur de visites (léger, hors admin/local) ---- */
  (function () {
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    if (/^\/admin/.test(location.pathname)) return;
    try {
      var body = JSON.stringify({ path: location.pathname });
      if (navigator.sendBeacon) navigator.sendBeacon('/.netlify/functions/track', new Blob([body], { type: 'application/json' }));
      else fetch('/.netlify/functions/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
    } catch (e) {}
  })();

})();
