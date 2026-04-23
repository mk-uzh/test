(function () {
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
      return loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'anonymous');
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
