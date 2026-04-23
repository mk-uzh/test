(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function passwordErrors(p) {
    if (!p || p.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(p)) return 'Password must include one uppercase letter.';
    if (!/\d/.test(p)) return 'Password must include one number.';
    if (!/[^A-Za-z0-9]/.test(p)) return 'Password must include one special character.';
    return null;
  }

  function showErr(el, msg) {
    if (el) {
      el.textContent = msg || '';
      el.hidden = !msg;
    }
  }

  // --- login ---
  if ($('btn-login')) {
    $('btn-login').addEventListener('click', function () {
      var email = ($('login-email') && $('login-email').value) || '';
      var pass = ($('login-password') && $('login-password').value) || '';
      showErr($('login-err'), '');
      if (!emailRe.test(email.trim())) {
        showErr($('login-err'), 'Please enter a valid email address.');
        return;
      }
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password: pass }),
      })
        .then(function (r) {
          if (r.ok) {
            var next = new URLSearchParams(location.search).get('next') || '/index.html';
            location.replace(next);
            return;
          }
          return r.json().then(function (j) {
            var d = j && j.detail;
            if (typeof d === 'string') {
              showErr($('login-err'), d);
              return;
            }
            showErr($('login-err'), 'The email or password is incorrect.');
          });
        })
        .catch(function () {
          showErr($('login-err'), 'The email or password is incorrect.');
        });
    });
  }

  // --- register (modal) ---
  var pendingRegister = null;

  function doRegister(termsOk) {
    if (!termsOk) return;
    if (!pendingRegister) return;
    var body = {
      email: pendingRegister.email,
      password: pendingRegister.password,
      terms_accepted: true,
    };
    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
      .then(function (r) {
        if (r.ok) return r.json();
        return r.json().then(function (j) { return Promise.reject(j); });
      })
      .then(function () {
        showErr($('reg-err'), '');
        if ($('ai-modal')) $('ai-modal').hidden = true;
        pendingRegister = null;
        switchAuth('login');
        if ($('login-email')) $('login-email').value = body.email;
        showErr($('login-err'), 'Registration complete. You can sign in now.');
      })
      .catch(function (e) {
        var d = e && e.detail;
        if (Array.isArray(d) && d[0] && d[0].msg) d = d[0].msg;
        if (Array.isArray(d) && d[0] && d[0].type) d = d.map(function (x) { return x.msg; }).join(' ');
        showErr($('reg-err'), (typeof d === 'string' ? d : null) || 'Registration failed.');
        if ($('ai-modal')) $('ai-modal').hidden = true;
        pendingRegister = null;
      });
  }

  if ($('btn-register')) {
    $('btn-register').addEventListener('click', function () {
      var email = ($('reg-email') && $('reg-email').value) || '';
      var p1 = ($('reg-password') && $('reg-password').value) || '';
      var p2 = ($('reg-password2') && $('reg-password2').value) || '';
      showErr($('reg-err'), '');

      if (!emailRe.test(email.trim())) {
        showErr($('reg-err'), 'Please enter a valid email address.');
        return;
      }
      var pe = passwordErrors(p1);
      if (pe) {
        showErr($('reg-err'), pe);
        return;
      }
      if (p1 !== p2) {
        showErr($('reg-err'), 'Passwords do not match.');
        return;
      }
      pendingRegister = { email: email.trim().toLowerCase(), password: p1 };
      if ($('ai-modal')) $('ai-modal').hidden = false;
    });
  }

  if ($('ai-agree')) {
    $('ai-agree').addEventListener('click', function () {
      doRegister(true);
    });
  }
  if ($('ai-close')) {
    $('ai-close').addEventListener('click', function () {
      if ($('ai-modal')) $('ai-modal').hidden = true;
      pendingRegister = null;
    });
  }
  if ($('ai-backdrop')) {
    $('ai-backdrop').addEventListener('click', function () {
      if ($('ai-modal')) $('ai-modal').hidden = true;
      pendingRegister = null;
    });
  }

  // --- forgot ---
  if ($('btn-forgot')) {
    $('btn-forgot').addEventListener('click', function () {
      location.href = '/forgot.html';
    });
  }

  // tabs
  function switchAuth(view) {
    var login = $('panel-login');
    var reg = $('panel-register');
    var tL = $('tab-login');
    var tR = $('tab-register');
    if (view === 'login') {
      if (login) login.hidden = false;
      if (reg) reg.hidden = true;
      if (tL) tL.classList.add('active');
      if (tR) tR.classList.remove('active');
    } else {
      if (login) login.hidden = true;
      if (reg) reg.hidden = false;
      if (tL) tL.classList.remove('active');
      if (tR) tR.classList.add('active');
    }
  }
  if ($('tab-login')) {
    $('tab-login').addEventListener('click', function () { switchAuth('login'); });
  }
  if ($('tab-register')) {
    $('tab-register').addEventListener('click', function () { switchAuth('register'); });
  }
})();
