  // Signs in or creates an account on this server, copies the account's saved items into this
  // browser, then opens the page the visitor was going to (only pages of this site).
  (function () {
    const form = document.getElementById("auth-form");
    const $ = (id) => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    const ALLOWED = ["/index.html", "/dashboard.html", "/admin.html"];
    const next = (() => {
      const n = params.get("next") || "";
      return n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") && ALLOWED.includes(n.split(/[?#]/)[0]) ? n : "/dashboard.html";
    })();
    const KEYS = { practice: "gitasaarthi_practice", moods: "gitasaarthi_moods", journal: "gitasaarthi_journal_entries", last: "gitasaarthi_last" };
    let mode = location.hash === "#create" ? "create" : "signin";
    let busy = false;

    function setMode(nextMode) {
      mode = nextMode;
      const create = mode === "create";
      $("auth-title").textContent = create ? "Create your account" : "Sign in";
      $("auth-submit").textContent = create ? "Create account" : "Sign in";
      $("name-field").hidden = !create;
      $("forgot-row").hidden = create;
      $("privacy-note").hidden = !create;
      $("forgot-note").hidden = true;
      $("form-error").textContent = "";
      $("password").autocomplete = create ? "new-password" : "current-password";
      $("auth-alt").innerHTML = create
        ? 'Already have an account? <a class="link gold" href="#signin" data-mode-link="signin">Sign in</a>'
        : 'New here? <a class="link gold" href="#create" data-mode-link="create">Create an account</a>';
      document.title = (create ? "Create your account" : "Sign in") + " · GitaSaarthi";
    }

    document.addEventListener("click", (e) => {
      const a = e.target.closest("[data-mode-link]");
      if (a) {
        e.preventDefault();
        history.replaceState(null, "", location.pathname + location.search + "#" + a.dataset.modeLink);
        setMode(a.dataset.modeLink);
        $(mode === "create" ? "name" : "email").focus();
        return;
      }
      if (e.target.closest("#forgot-link")) {
        e.preventDefault();
        $("forgot-note").hidden = false;
      }
    });

    async function post(url, body) {
      const r = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, data };
    }

    async function bringItemsHere(me) {
      try {
        const owner = localStorage.getItem("gitasaarthi_account");
        // someone else used this browser: drop their items, Gemini key and unsaved queue
        if (owner !== null && owner !== String(me.id)) {
          Object.keys(KEYS).forEach((k) => localStorage.removeItem(KEYS[k]));
          localStorage.removeItem("gitasaarthi_gemini_config");
          localStorage.removeItem("gitasaarthi_pending");
        }
        let pending = {};
        try { pending = JSON.parse(localStorage.getItem("gitasaarthi_pending") || "{}") || {}; } catch (e) {}
        localStorage.removeItem("gitasaarthi_user");
        localStorage.setItem("gitasaarthi_account", String(me.id));
        const r = await fetch("/api/me/data", { credentials: "same-origin" });
        if (!r.ok) return;   // keep what is in this browser rather than wipe it
        const data = await r.json();
        Object.keys(KEYS).forEach((k) => {
          if (pending[k]) return;   // unsaved here: the next page sends it to the account first
          if (data[k] != null) localStorage.setItem(KEYS[k], JSON.stringify(data[k]));
          else localStorage.removeItem(KEYS[k]);
        });
      } catch (e) {}
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy) return;
      const email = $("email").value.trim(), pw = $("password").value, name = $("name").value.trim();
      $("form-error").textContent = "";
      $("email-hint").textContent = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "" : "Enter an email like name@example.com.";
      $("password-hint").textContent = pw.length >= 8 ? "" : "Use at least 8 characters.";
      $("name-hint").textContent = mode === "create" && !name ? "Tell us what to call you." : "";
      const firstBad = ["name", "email", "password"].find((f) => $(f + "-hint").textContent);
      if (firstBad) { $(firstBad).focus(); return; }

      busy = true;
      const btn = $("auth-submit"), label = btn.textContent;
      btn.disabled = true;
      btn.textContent = mode === "create" ? "Creating your account…" : "Signing in…";
      let succeeded = false;
      try {
        const res = mode === "create"
          ? await post("/api/signup", { name, email, password: pw })
          : await post("/api/login", { email, password: pw });
        if (!res.ok) {
          $("form-error").textContent = res.data.error || "That did not work. Try again.";
          if (res.status === 409) { setMode("signin"); $("email").value = email; $("form-error").textContent = res.data.error; $("password").focus(); }
          return;
        }
        await bringItemsHere(res.data);
        location.href = next;
        succeeded = true;
      } catch (err) {
        $("form-error").textContent = "Could not reach the server. Check that GitaSaarthi is running, then try again.";
      } finally {
        if (!succeeded) {
          busy = false;
          btn.disabled = false;
          btn.textContent = label;
        }
      }
    });

    $("pw-toggle").addEventListener("click", () => {
      const showing = $("password").type === "text";
      $("password").type = showing ? "password" : "text";
      $("pw-toggle").textContent = showing ? "Show" : "Hide";
      $("pw-toggle").setAttribute("aria-pressed", String(!showing));
      $("password").focus();
    });

    setMode(mode);
    // focus the first field once the opening is over (not on phones, so the keyboard does not pop up by itself)
    const focusFirst = () => { if (window.matchMedia("(min-width: 700px)").matches) $(mode === "create" ? "name" : "email").focus(); };
    if (document.documentElement.classList.contains("intro-active")) document.addEventListener("gs:intro-done", focusFirst, { once: true }); else focusFirst();
  })();
  
