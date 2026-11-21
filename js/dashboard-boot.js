window.GSAccount.ready.then(function (me) { window.GSSite.dashboard(me); }).catch(function () { var g = document.getElementById("greeting"); if (g) g.textContent = "We could not load your practice. Check your connection, then refresh the page."; });
// A merge or a late load changed what is saved: draw the page again from it.
window.addEventListener("gs:hydrated", function () { location.reload(); });
