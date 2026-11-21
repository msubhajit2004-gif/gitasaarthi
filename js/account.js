/* GitaSaarthi account: who is signed in, and keeping their things in the account.
   The rest of the app reads and writes localStorage as before. This file copies the
   account's saved items into localStorage (sign-in does it first, every page checks
   again) and sends any change to those keys back to the server. Load it before other scripts. */
(function () {
  "use strict";
  // server item -> localStorage key
  var KEYS = {
    practice: "gitasaarthi_practice",
    moods: "gitasaarthi_moods",
    journal: "gitasaarthi_journal_entries",
    last: "gitasaarthi_last"
  };
  var BY_STORAGE = {};
  Object.keys(KEYS).forEach(function (k) { BY_STORAGE[KEYS[k]] = k; });

  function api(method, url, body, opts) {
    var init = { method: method, credentials: "same-origin", headers: {} };
    if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
    if (opts && opts.keepalive) init.keepalive = true;
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) { var e = new Error(data.error || ("HTTP " + r.status)); e.status = r.status; throw e; }
        return data;
      });
    });
  }

  var rawSet = Storage.prototype.setItem;
  var rawRemove = Storage.prototype.removeItem;
  var PENDING_KEY = "gitasaarthi_pending", GEMINI_KEY = "gitasaarthi_gemini_config", OWNER_KEY = "gitasaarthi_account";
  // pending: items changed here but not yet saved to the account. Kept in localStorage so a closed tab,
  // a failed request or a restart cannot lose them. An item leaves it only after its PUT succeeded.
  var pending = loadPending(), timer = null, touched = {}, hydrated = false, inflight = {}, active = [];
  var ver = {}, blocked = {}, retryTimer = null, retryDelay = 2000;

  function loadPending() {
    try {
      var o = JSON.parse(localStorage.getItem(PENDING_KEY) || "{}"), out = {};
      Object.keys(o || {}).forEach(function (k) { if (KEYS[k]) out[k] = o[k]; });
      return out;
    } catch (e) { return {}; }
  }
  function storePending() {
    try {
      if (Object.keys(pending).length) rawSet.call(localStorage, PENDING_KEY, JSON.stringify(pending));
      else rawRemove.call(localStorage, PENDING_KEY);
    } catch (e) {}
  }
  function pendingCount() { return Object.keys(pending).length; }
  function readLocal(storageKey) {
    try { var v = localStorage.getItem(storageKey); return v == null ? null : JSON.parse(v); } catch (e) { return null; }
  }
  function saveFailed(item, e) {
    try { window.dispatchEvent(new CustomEvent("gs:save-failed", { detail: { item: item, status: e && e.status } })); } catch (x) {}
  }
  function saveOk() {
    try { window.dispatchEvent(new CustomEvent("gs:save-ok")); } catch (x) {}
  }
  // A 4xx (other than timeout / rate limit) will fail the same way every time, so it is not retried.
  function retryable(e) { return !e.status || e.status >= 500 || e.status === 408 || e.status === 429; }
  function scheduleRetry() {
    if (retryTimer) return;
    retryTimer = setTimeout(function () { retryTimer = null; flush(false); }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60000);
  }
  function putItem(item, keepalive) {
    var v = ver[item] || 0;
    var value = readLocal(KEYS[item]);
    var p = api("PUT", "/api/me/data/" + item, { value: value == null ? null : value }, { keepalive: !!keepalive }).then(function () {
      retryDelay = 2000;
      delete blocked[item];
      if ((ver[item] || 0) === v) { delete pending[item]; storePending(); }   // changed again meanwhile: stays pending
      if (!pendingCount()) saveOk();
      return true;
    }, function (e) {
      if (e.status === 401) { toSignIn(); return false; }
      saveFailed(item, e);
      if (retryable(e)) scheduleRetry(); else blocked[item] = e.status;
      return false;
    });
    active.push(p);
    var done = function () { var i = active.indexOf(p); if (i >= 0) active.splice(i, 1); };
    p.then(done, done);
    return p;
  }
  // Sends the pending items, one request per item (in order per item). Nothing is sent until the owner of this
  // browser's data is known, so another person's leftovers never reach this account. Resolves true if all saved.
  function flush(keepalive) {
    clearTimeout(timer); timer = null;
    if (!hydrated) return Promise.resolve(pendingCount() === 0);
    return Promise.all(Object.keys(pending).filter(function (item) { return !blocked[item]; }).map(function (item) {
      var p = (inflight[item] || Promise.resolve()).then(function () { return putItem(item, keepalive); });
      inflight[item] = p;
      return p;
    })).then(function (r) { return r.every(Boolean) && pendingCount() === 0; });
  }
  // Everything queued and everything already on its way.
  function drain() {
    return flush(false).then(function () { return Promise.all(active.slice()); }).then(function () { return pendingCount() === 0; });
  }
  function schedule(item) {
    pending[item] = Date.now(); touched[item] = true; ver[item] = (ver[item] || 0) + 1; delete blocked[item];
    storePending();
    clearTimeout(timer); timer = setTimeout(function () { flush(false); }, 400);
  }
  // Page is going away: best-effort single small writes. Anything else stays in the persisted queue for next time.
  function flushOnExit() {
    if (!hydrated) return;
    var items = Object.keys(pending).filter(function (i) { return !blocked[i]; }), total = 0;
    items.forEach(function (i) { try { total += (localStorage.getItem(KEYS[i]) || "").length; } catch (e) {} });
    if (!items.length || total >= 60000) return;
    items.forEach(function (i) { putItem(i, true); });
  }

  // Writes to the account's keys go to the server too (only on pages that load this file).
  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === window.localStorage && BY_STORAGE[k]) schedule(BY_STORAGE[k]);
  };
  Storage.prototype.removeItem = function (k) {
    rawRemove.call(this, k);
    if (this === window.localStorage && BY_STORAGE[k]) schedule(BY_STORAGE[k]);
  };
  window.addEventListener("pagehide", flushOnExit);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flushOnExit(); });
  // Back/forward cache: a restored page may show someone else's data after sign-out.
  window.addEventListener("pageshow", function (e) { if (e.persisted) location.reload(); });

  function toSignIn() {
    location.href = "/login.html?next=" + encodeURIComponent(location.pathname + location.search + location.hash);
  }

  // Copy the account's items into this browser (server wins, except items not yet saved from here).
  function hydrate(data, overwriteAll) {
    if (overwriteAll) { pending = {}; touched = {}; storePending(); }
    Object.keys(KEYS).forEach(function (item) {
      if (pending[item] || (!overwriteAll && touched[item])) return;
      var has = Object.prototype.hasOwnProperty.call(data, item) && data[item] != null;
      if (has) rawSet.call(localStorage, KEYS[item], JSON.stringify(data[item]));
      else if (overwriteAll) rawRemove.call(localStorage, KEYS[item]);
    });
  }
  // Everything that belongs to the account on this browser (plus any leftover old Gemini key).
  function clearAccountKeys() {
    Object.keys(KEYS).forEach(function (item) { rawRemove.call(localStorage, KEYS[item]); });
    try { rawRemove.call(localStorage, GEMINI_KEY); rawRemove.call(localStorage, PENDING_KEY); } catch (e) {}
    pending = {}; touched = {};
  }
  function clearLocal() {
    clearAccountKeys();
    try { rawRemove.call(localStorage, "gitasaarthi_user"); rawRemove.call(localStorage, OWNER_KEY); } catch (e) {}
  }

  // Fetch the account's items; if that fails, keep what is here and try again later (never wipe on failure).
  var dataDelay = 2000, dataTimer = null;
  function loadData(me, first) {
    return api("GET", "/api/me/data").then(function (data) {
      hydrate(data, false);
      if (!first) try { window.dispatchEvent(new CustomEvent("gs:hydrated")); } catch (x) {}
    }, function (e) {
      if (e.status === 401) { toSignIn(); return; }
      if (!dataTimer) dataTimer = setTimeout(function () { dataTimer = null; loadData(me, false); }, dataDelay);
      dataDelay = Math.min(dataDelay * 2, 60000);
    });
  }

  var ready = api("GET", "/api/me").then(function (me) {
    var owner = null;
    try { owner = localStorage.getItem(OWNER_KEY); } catch (e) {}
    // a different person used this browser before: drop their items and unsaved queue
    if (owner !== null && owner !== String(me.id)) clearAccountKeys();
    else if (owner === null) { pending = {}; storePending(); touched = {}; }
    try { rawSet.call(localStorage, OWNER_KEY, String(me.id)); } catch (e) {}
    hydrated = true;
    Array.prototype.forEach.call(document.querySelectorAll("[data-account-name]"), function (n) { n.textContent = me.name; });
    // unsaved items go to the server first, then the server's copy fills in whatever is not unsaved
    return flush(false).then(function () { return loadData(me, true); }).then(function () { return me; });
  }, function (e) {
    if (e.status === 401) toSignIn();
    throw e;
  });

  function hardSignOut() {
    return api("POST", "/api/logout", {}).catch(function () {}).then(function () {
      clearLocal();
      location.href = "/";
    });
  }
  function signOut() {
    return ready.catch(function () {}).then(drain).then(function (ok) {
      var stuck = !ok || pendingCount() > 0;
      if (stuck) {
        var st = null; Object.keys(blocked).forEach(function (k) { st = blocked[k]; });
        saveFailed(null, { status: st });   // keep local data and stay signed in
        return false;
      }   // keep local data and stay signed in
      return api("POST", "/api/logout", {}).catch(function () {}).then(function () {
        clearLocal();
        location.href = "/";
        return true;
      });
    });
  }
  // A plain line of text when changes could not be saved yet.
  window.addEventListener("gs:save-ok", function () {
    var n = document.getElementById("gs-save-warning");
    if (n) n.remove();
  });
  window.addEventListener("gs:save-failed", function (ev) {
    var status = ev && ev.detail && ev.detail.status;
    var n = document.getElementById("gs-save-warning");
    if (!n) {
      n = document.createElement("p"); n.id = "gs-save-warning"; n.setAttribute("role", "status");
      n.className = "saved";
      (document.querySelector("main") || document.body).appendChild(n);
    }
    n.textContent = status === 413
      ? "Some of your changes could not be saved to your account because they are too large. They are kept on this device. "
      : status && status >= 400 && status < 500
        ? "Some of your changes could not be saved to your account (the server refused them). They are kept on this device. "
        : "Your latest changes are not saved to your account yet. We will keep trying. Stay on this page or try again in a moment. ";
    if (!document.getElementById("gs-sign-out-anyway")) {
      var a = document.createElement("a");
      a.id = "gs-sign-out-anyway"; a.href = "/"; a.className = "link";
      a.textContent = "Sign out anyway. Unsaved changes on this device will be lost.";
      a.addEventListener("click", function (e) { e.preventDefault(); hardSignOut(); });
      n.appendChild(a);
    }
  });
  function event(type, topic) {
    var body = { type: type };
    if (topic) body.topic = topic;
    return api("POST", "/api/events", body).catch(function (e) { if (e && e.status === 401) toSignIn(); });
  }

  // Any element with data-sign-out signs out.
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-sign-out]");
    if (!t) return;
    e.preventDefault();
    signOut();
  });

  window.GSAccount = { ready: ready, signOut: signOut, event: event, api: api, hydrate: hydrate, clearLocal: clearLocal, KEYS: KEYS };
})();
