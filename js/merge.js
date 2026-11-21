/* GitaSaarthi merge: three-way merge of one saved item (what we last synced, what is here, what the server has).
   Pure functions, no DOM. window.GSMerge in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GSMerge = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function copy(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }
  function eq(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function stamp(e) {
    if (!e) return null;
    if (typeof e.updatedAt === "number") return e.updatedAt;
    if (typeof e.updatedAt === "string" && !isNaN(Date.parse(e.updatedAt))) return Date.parse(e.updatedAt);
    return null;
  }
  function entries(a) { return Array.isArray(a) ? a.filter(function (e) { return isObj(e) && e.id != null; }) : []; }
  function byId(a) { var m = {}; entries(a).forEach(function (e) { m[e.id] = e; }); return m; }
  function later(l, s) { var a = stamp(l), b = stamp(s); return a !== null && b !== null && b > a ? s : l; }

  function journal(base, local, server) {
    var B = byId(base), L = byId(local), S = byId(server), out = [], seen = {};
    entries(server).forEach(function (s) {
      var id = s.id, l = L[id], b = B[id], pick;
      if (seen[id]) return;
      seen[id] = true;
      if (l) {
        if (b) {
          var lc = !eq(l, b), sc = !eq(s, b);
          pick = lc && !sc ? l : !lc ? s : later(l, s);
        } else pick = eq(l, s) ? s : later(l, s);
      } else if (b) pick = eq(s, b) ? null : s;       // deleted here: only an edit elsewhere keeps it
      else pick = s;                                   // new on the other device
      if (pick) out.push(pick);
    });
    var mine = [];
    entries(local).forEach(function (l) {
      if (S[l.id] || seen[l.id]) return;
      seen[l.id] = true;
      var b = B[l.id];
      if (!b || !eq(l, b)) mine.push(l);               // new here, or edited here though deleted elsewhere
    });
    return copy(mine.concat(out));                     // the app puts new entries first
  }

  function practice(local, server) {
    var set = {};
    [local, server].forEach(function (a) { (Array.isArray(a) ? a : []).forEach(function (d) { if (typeof d === "string") set[d] = true; }); });
    return Object.keys(set).sort();
  }
  function moods(base, local, server) {
    var B = isObj(base) ? base : {}, out = {};
    Object.keys(server).forEach(function (k) { out[k] = server[k]; });
    Object.keys(local).forEach(function (k) {
      if (!(k in out) || !eq(local[k], B[k])) out[k] = local[k];
    });
    return copy(out);
  }
  function lastAt(v) { return isObj(v) && typeof v.at === "number" ? v.at : -Infinity; }

  var VALID = { journal: Array.isArray, practice: Array.isArray, moods: isObj, last: isObj };

  function merge3(key, base, local, server) {
    var ok = VALID[key] || function () { return true; };
    if (!ok(local)) local = null;
    if (!ok(server)) server = null;
    if (!ok(base)) base = null;
    if (server == null) return copy(local);
    if (local == null) return copy(server);
    switch (key) {
      case "journal": return journal(base, local, server);
      case "practice": return practice(local, server);
      case "moods": return moods(base, local, server);
      case "last": return copy(lastAt(server) > lastAt(local) ? server : local);
      default: return copy(eq(local, base) ? server : local);
    }
  }
  return { merge3: merge3 };
});
