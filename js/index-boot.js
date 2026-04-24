(function () {
  function showWeatherUnavailableBlocker() {
    if (document.getElementById('wx-dead-overlay')) return;
    var root = document.createElement('div');
    root.id = 'wx-dead-overlay';
    root.className = 'wx-dead';
    root.setAttribute('role', 'alertdialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'wx-dead-title');
    root.innerHTML =
      '<div class="wx-dead__panel">' +
      '<h1 id="wx-dead-title" class="wx-dead__title">⚠ Live weather data unavailable</h1>' +
      '<p class="wx-dead__text">We cannot currently retrieve weather conditions for your location. Displaying a risk score without current data could be misleading and potentially dangerous.</p>' +
      '<p class="wx-dead__text">Please check conditions directly:</p>' +
      '<ul class="wx-dead__list">' +
      '<li>MeteoSwiss: <a href="https://www.meteoswiss.admin.ch/" target="_blank" rel="noopener noreferrer">meteoswiss.admin.ch</a></li>' +
      '<li>SLF Avalanche Bulletin: <a href="https://www.slf.ch/" target="_blank" rel="noopener noreferrer">slf.ch</a></li>' +
      '</ul>' +
      '<button type="button" id="wx-dead-close" class="wx-dead__btn">Close app</button>' +
      '</div>';
    document.body.appendChild(root);
    var btn = document.getElementById('wx-dead-close');
    if (btn) {
      btn.addEventListener('click', function () {
        fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
          .catch(function () { /* no-op */ })
          .finally(function () {
            try {
              window.open('', '_self');
              window.close();
            } catch (e) { /* no-op */ }
            location.replace('/auth.html');
          });
      });
      try { btn.focus(); } catch (e) { /* no-op */ }
    }
  }

  function checkLiveWeatherHealth() {
    return fetch('/api/weather/live-health', { credentials: 'include' })
      .then(function (r) {
        if (!r.ok) return { ok: false };
        return r.json().catch(function () { return { ok: false }; });
      })
      .then(function (j) { return !!(j && j.ok); })
      .catch(function () { return false; });
  }

  function loadScript(src, crossOrigin) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      if (crossOrigin) s.crossOrigin = crossOrigin;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('load ' + src)); };
      document.body.appendChild(s);
    });
  }

  function bindLogout() {
    var b = document.getElementById('btn-logout');
    if (!b) return;
    b.addEventListener('click', function () {
      fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(function () {
        location.href = '/auth.html';
      });
    });
  }

  fetch('/api/auth/me', { credentials: 'include' })
    .then(function (r) {
      if (r.status === 401) {
        location.replace('/auth.html?next=' + encodeURIComponent(location.pathname + location.search || '/index.html'));
        return Promise.reject();
      }
      if (!r.ok) return Promise.reject();
      return checkLiveWeatherHealth().then(function (weatherOk) {
        if (!weatherOk) {
          showWeatherUnavailableBlocker();
          return Promise.reject();
        }
        return loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'anonymous');
      });
    })
    .then(function () {
      if (!window.L) return;
      return loadScript('js/app.js', null);
    })
    .then(function () {
      bindLogout();
    })
    .catch(function () { /* redirect or error */ });
})();
