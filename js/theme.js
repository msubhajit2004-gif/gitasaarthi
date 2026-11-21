// Dark / white theme toggle. The saved choice is applied before first paint by a
// tiny inline script in index.html; this file handles the button.
(function () {
  const KEY = "gitasaarthi_theme";
  const root = document.documentElement;
  const btn = document.getElementById("nav-theme-btn");
  const get = () => (root.getAttribute("data-theme") === "light" ? "light" : "dark");

  function label() {
    if (!btn) return;
    const next = get() === "light" ? "dark" : "light";
    btn.setAttribute("aria-label", "Switch to " + next + " mode");
    btn.title = "Switch to " + (next === "light" ? "white" : "dark") + " mode";
  }

  function set(theme, save) {
    root.classList.add("theme-fade");
    root.setAttribute("data-theme", theme);
    if (save) { try { localStorage.setItem(KEY, theme); } catch (e) {} }
    label();
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: theme } }));
    if (window.syncSpecularButtonsTheme) window.syncSpecularButtonsTheme();
    setTimeout(function () { root.classList.remove("theme-fade"); }, 400);
  }

  label();
  if (btn) btn.addEventListener("click", function () { set(get() === "light" ? "dark" : "light", true); });
})();
