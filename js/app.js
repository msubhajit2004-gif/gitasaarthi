// ============================================================================
// GitaSaarthi (गीता सारथी) - Main Application Controller
// Orchestrates 2-Step Pedagogical Dialogue, Audio Synth,
// Pranayama Pacer, Daily Shloka, Sacred Journal, Voice I/O, Safe Harbor
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  // Verse marks: the data writes "|" and "||"; print them as the real danda । and double danda ॥
  const dandas = (t) => String(t || "").replace(/\|\|/g, "॥").replace(/\|/g, "।");
  const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  // --------------------------------------------------------------------------
  // 2. Application State & Storage
  // --------------------------------------------------------------------------
  const state = {
    currentPhase: 1, // kept for older code paths; the engine's session is the source of truth
    currentArchetype: null,
    session: window.Dialogue ? window.Dialogue.createSession() : null,
    userLastChallenge: "",
    userLastCause: "",
    history: [],
    isThinking: false,
    activeSpeakingCardId: null,
    recognition: null,
    isRecording: false
  };

  // --------------------------------------------------------------------------
  // 3. Audio Ambience Synthesizer Controls
  // --------------------------------------------------------------------------
  const audioToggleBtn = document.getElementById("audio-toggle-btn");
  const audioBar = document.getElementById("audio-bar");
  const audioVolSlider = document.getElementById("audio-vol-slider");
  const audioVisCanvas = document.getElementById("audio-vis-canvas");

  if (window.audioEngine && audioVisCanvas) {
    window.audioEngine.attachVisualizer(audioVisCanvas);
  }

  // Background music: the browser only allows sound after a first gesture, so
  // ambience starts on your first click, tap or key press, with a soft fade-in.
  // Pausing it yourself is remembered, and it then stays silent until you press play.
  const AMBIENCE_KEY = "gitasaarthi_ambience";
  const readPref = () => { try { return localStorage.getItem(AMBIENCE_KEY); } catch (e) { return null; } };
  const savePref = (v) => { try { localStorage.setItem(AMBIENCE_KEY, v); } catch (e) {} };

  // Anything that wants to show sound state (the intro's button) listens to this event.
  let audioBlocked = false;
  function emitAmbience() {
    window.dispatchEvent(new CustomEvent("gs-ambience", {
      detail: { playing: !!(window.audioEngine && window.audioEngine.isPlaying), muted: readPref() === "off", blocked: audioBlocked }
    }));
  }

  function showAudioState(isPlaying) {
    if (audioToggleBtn) {
      audioToggleBtn.innerHTML = icon(isPlaying ? "volume" : "volume-off");
      const st = document.getElementById("audio-state");
      if (st) st.textContent = isPlaying ? "Sound on" : "Sound off";
      audioToggleBtn.setAttribute("aria-label", isPlaying ? "Mute sound" : "Turn sound on");
      audioBar.classList.toggle("playing", isPlaying);
    }
    if (isPlaying) audioBlocked = false;
    emitAmbience();
  }

  function startAmbience({ fade } = {}) {
    if (!window.audioEngine || window.audioEngine.isPlaying) return;
    window.audioEngine.play();
    if (fade && window.audioEngine.masterGain) {
      const ctx = window.audioEngine.audioCtx, g = window.audioEngine.masterGain.gain, t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(window.audioEngine.volume, t + 3);
    }
    showAudioState(true);
  }

  function markBlocked() {
    audioBlocked = true;
    showAudioState(false);
  }
  if (window.audioEngine) window.audioEngine.onBlocked = markBlocked;

  // Sound on/off for other controls (the intro). Mirrors the header button's saved choice.
  window.gsAmbience = {
    isOn: () => !!(window.audioEngine && window.audioEngine.isPlaying),
    set(on) {
      if (!window.audioEngine) return;
      if (on) { savePref("on"); startAmbience({ fade: true }); }
      else { window.audioEngine.pause(); savePref("off"); showAudioState(false); }
    }
  };

  if (audioToggleBtn) {
    audioToggleBtn.addEventListener("click", () => {
      const isPlaying = window.audioEngine.toggle();
      savePref(isPlaying ? "on" : "off");
      showAudioState(isPlaying);
    });
  }

  if (readPref() !== "off") {
    // Try to start with the intro. If the browser blocks it, wait for the first tap or key press.
    startAmbience({ fade: true });
    setTimeout(() => {
      const eng = window.audioEngine;
      if (eng && eng.isPlaying && eng.audioCtx && eng.audioCtx.state !== "running") {
        eng.pause();
        markBlocked();
      }
    }, 600);

    const firstGesture = (e) => {
      ["pointerdown", "keydown"].forEach((t) => document.removeEventListener(t, firstGesture, true));
      // Sound buttons handle their own first press.
      if (e.target && e.target.closest && e.target.closest("#audio-toggle-btn, [data-sound-control]")) return;
      if (readPref() !== "off") startAmbience({ fade: true });
    };
    ["pointerdown", "keydown"].forEach((t) => document.addEventListener(t, firstGesture, true));
  } else {
    emitAmbience();
  }

  if (audioVolSlider) {
    audioVolSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      window.audioEngine.setVolume(val);
    });
  }

  // --------------------------------------------------------------------------
  // 4. Emotional Compass Chips
  // --------------------------------------------------------------------------
  const compassChips = document.querySelectorAll(".compass-chip");
  compassChips.forEach(chip => {
    chip.addEventListener("click", () => {
      compassChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");

      if (welcomeCard) welcomeCard.style.display = "none";
      runTurn({ archetypeId: chip.dataset.archetype });
    });
  });

  // Starter prompt clicks on welcome screen
  document.querySelectorAll(".starter-prompt-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      // Fill the message box with the starter, then send it like any typed message
      chatTextarea.value = btn.textContent.trim();
      triggerSend();
    });
  });

  // --------------------------------------------------------------------------
  // 5. Chat Interaction Controller
  // --------------------------------------------------------------------------
  const chatViewport = document.getElementById("chat-viewport");
  const chatTextarea = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-btn");
  const micBtn = document.getElementById("mic-btn");
  const welcomeCard = document.getElementById("welcome-hero-card");

  // Auto-resize textarea
  if (chatTextarea) {
    chatTextarea.addEventListener("input", () => {
      chatTextarea.style.height = "auto";
      chatTextarea.style.height = Math.min(chatTextarea.scrollHeight, 120) + "px";
    });

    chatTextarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        triggerSend();
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", triggerSend);
  }

  function triggerSend() {
    const text = chatTextarea.value.trim();
    if (!text || state.isThinking) return;
    chatTextarea.value = "";
    chatTextarea.style.height = "auto";
    handleUserSendMessage(text);
  }

  // ------------------------------------------------------------------------
  // Conversation: every turn goes through the engine in js/dialogue.js, which
  // decides what comes next (crisis help, questions, verse + practice,
  // follow-up, "which is closest?", or a close) and never repeats itself.
  // ------------------------------------------------------------------------
  const wisdomLib = { archetypes: WISDOM_ARCHETYPES, dailyShlokas: DAILY_SHLOKAS };

  async function handleUserSendMessage(userText) {
    if (welcomeCard) welcomeCard.style.display = "none";
    appendUserBubble(userText);
    await runTurn({ text: userText });
  }

  async function runTurn(input) {
    if (state.isThinking || !state.session) return;
    const turn = window.Dialogue.nextTurn(state.session, input, wisdomLib);
    if (turn.payload && turn.payload.archetype) state.currentArchetype = turn.payload.archetype;
    state.currentPhase = state.session.phase;
    markCurrentFeeling(turn);

    showThinkingIndicator();
    const useGemini = window.geminiService && window.geminiService.hasValidKey() && input.text &&
      (turn.kind === "phase1" || turn.kind === "phase2");
    let note = "";
    if (useGemini) {
      try {
        const phase = turn.kind === "phase1" ? 1 : 2;
        const resp = await window.geminiService.generateCounsel(input.text, state.history.slice(0, -1), phase);
        removeThinkingIndicator();
        if (phase === 1) renderKrishnaPhase1FromData(resp);
        else renderKrishnaPhase2FromData(Object.assign({}, resp, { intro: turn.payload.intro }));
        announceTurn(turn);
        return;
      } catch (err) {
        console.warn("Gemini did not answer; using the offline verses.", err);
        note = "Gemini didn't answer, so this reply is from the offline verses.";
      }
    }
    await new Promise(r => setTimeout(r, 550));
    removeThinkingIndicator();
    const p = Object.assign({ note }, turn.payload);
    if (turn.kind === "crisis") renderCrisis();
    else if (turn.kind === "phase1") renderKrishnaPhase1FromData(p);
    else if (turn.kind === "phase2") renderKrishnaPhase2FromData(p);
    else if (turn.kind === "followup") renderFollowup(p);
    else if (turn.kind === "clarify") renderClarify(p);
    else if (turn.kind === "close") renderClose(p);
    else if (turn.kind === "aside") { renderAside(p, turn.action); return; }   // a request, not a feeling: nothing is recorded
    announceTurn(turn);
  }

  // The feeling this conversation is about: mark its button, and remember it for "Pick up where you left off".
  function markCurrentFeeling(turn) {
    const a = turn.payload && turn.payload.archetype;
    if (!a) return;
    document.querySelectorAll(".compass-chip").forEach(c => c.classList.toggle("active", c.dataset.archetype === a.id));
    if (turn.kind === "phase1") {
      try { localStorage.setItem("gitasaarthi_last", JSON.stringify({ id: a.id, at: Date.now() })); } catch (e) {}
    }
  }
  // Tell the page layer (js/plate.js) that a reply has been drawn, so the side page can follow it.
  function announceTurn(turn) {
    const a = turn.payload && turn.payload.archetype;
    document.dispatchEvent(new CustomEvent("gs:turn", { detail: { kind: turn.kind, archetypeId: a ? a.id : null } }));
    // For the admin figures: that a conversation started (and on which feeling), or that Safe Harbor was shown.
    // What the person wrote is never sent.
    if (window.GSAccount) {
      if (turn.kind === "phase1" && a) window.GSAccount.event("conversation", a.id);
      else if (turn.kind === "crisis") window.GSAccount.event("crisis_shown");
    }
  }

  function appendUserBubble(text) {
    const row = document.createElement("div");
    row.className = "message-row user-row";
    row.innerHTML = `<div class="user-bubble">${escapeHtml(text)}</div>`;
    chatViewport.appendChild(row);
    scrollToBottom();

    state.history.push({ sender: "user", content: text, timestamp: new Date() });
  }

  let thoughtLine = null;
  let thoughtTimers = [];

  function showThinkingIndicator() {
    state.isThinking = true;
    const indicator = document.createElement("div");
    indicator.className = "message-row krishna-row";
    indicator.id = "thinking-indicator-row";
    if (window.createThoughtLine) {
      thoughtLine = window.createThoughtLine({
        label: "Krishna is listening…",
        steps: ["Hearing what you shared"],
      });
      indicator.appendChild(thoughtLine.el);
      ["Finding a verse that fits", "Shaping a reply"].forEach((text, i) => {
        thoughtTimers.push(setTimeout(() => { if (thoughtLine) thoughtLine.addStep(text); }, 220 * (i + 1)));
      });
    } else {
      indicator.innerHTML = `<div class="thinking-indicator"><span class="dot-flashing"></span><span>Krishna is listening…</span></div>`;
    }
    chatViewport.appendChild(indicator);
    scrollToBottom();
  }

  function removeThinkingIndicator() {
    state.isThinking = false;
    thoughtTimers.forEach(clearTimeout);
    thoughtTimers = [];
    if (thoughtLine) { thoughtLine.destroy(); thoughtLine = null; }
    const indicator = document.getElementById("thinking-indicator-row");
    if (indicator) indicator.remove();
  }

  function renderKrishnaPhase1FromData(data) {
    const cardId = "card-" + Date.now();
    const row = document.createElement("div");
    row.className = "message-row krishna-row";

    let pillsHtml = "";
    if (data.quickPills && data.quickPills.length > 0) {
      pillsHtml = `
        <div class="quick-pills-label">Choose a reply, or write your own</div>
        <div class="quick-pills-grid">
          ${data.quickPills.map(pill => `<button class="interactive-pill-btn" data-pill="${escapeHtml(pill)}">${escapeHtml(pill)}</button>`).join("")}
        </div>
      `;
    }

    row.innerHTML = `
      <div class="krishna-counsel-card" id="${cardId}">
        <div class="counsel-header">
          <div class="counsel-speaker">
            <span class="speaker-avatar-icon">${icon("flame")}</span>
            <span class="speaker-title">Lord Krishna</span>
          </div>
          <span class="phase-indicator-pill phase1">Phase 1: Active inquiry</span>
        </div>

        ${data.note ? `<div class="engine-note">${escapeHtml(data.note)}</div>` : ""}
        <div class="krishna-ack-text">${escapeHtml(data.acknowledgment)}</div>

        <div class="krishna-inquiry-box">
          <div class="inquiry-q"><span>1.</span> <strong>${escapeHtml(data.question1)}</strong></div>
          <div class="inquiry-q"><span>2.</span> <strong>${escapeHtml(data.question2)}</strong></div>
        </div>

        ${pillsHtml}

        <div class="card-action-toolbar">
          <div class="left-actions">
            <button class="action-pill-btn tts-btn" data-target="${cardId}">Listen</button>
            <button class="action-pill-btn copy-btn" data-target="${cardId}">Copy</button>
          </div>
        </div>
      </div>
    `;

    chatViewport.appendChild(row);
    scrollToRowTop(row);

    // Attach listeners for interactive quick-pills
    row.querySelectorAll(".interactive-pill-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const pillText = btn.dataset.pill;
        handleUserSendMessage(pillText);
      });
    });

    attachCardToolbarListeners(row, cardId, data.acknowledgment + " " + data.question1 + " " + data.question2);
    state.history.push({ sender: "krishna", phase: 1, content: data, timestamp: new Date() });
  }

  function renderKrishnaPhase2FromData(data) {
    const cardId = "card-" + Date.now();
    const row = document.createElement("div");
    row.className = "message-row krishna-row";

    const diag = data.vedicDiagnosis || {};
    const shloka = data.shloka || {};
    const cbt = data.cbtPractice || {};

    let cbtStepsHtml = "";
    if (cbt.steps && cbt.steps.length > 0) {
      // "Step 1 (Name the Projection): Say aloud ..." becomes a numbered step: its name, then what to do
      cbtStepsHtml = '<ol class="cbt-steps">' + cbt.steps.map(step => {
        const m = /^\s*Step\s*\d+\s*\(([^)]+)\)\s*:\s*([\s\S]*)$/i.exec(step);
        return m
          ? `<li class="cbt-step-item"><b class="cbt-step-name">${escapeHtml(m[1])}</b><span class="cbt-step-detail">${escapeHtml(m[2])}</span></li>`
          : `<li class="cbt-step-item"><span class="cbt-step-detail">${escapeHtml(step)}</span></li>`;
      }).join("") + "</ol>";
    }

    row.innerHTML = `
      <div class="krishna-counsel-card" id="${cardId}">
        <div class="counsel-header">
          <div class="counsel-speaker">
            <span class="speaker-avatar-icon">${icon("flame")}</span>
            <span class="speaker-title">Lord Krishna</span>
          </div>
          <span class="phase-indicator-pill phase2">Phase 2: Wisdom and CBT</span>
        </div>

        ${data.note ? `<div class="engine-note">${escapeHtml(data.note)}</div>` : ""}
        ${data.intro ? `<div class="krishna-echo">${escapeHtml(data.intro)}</div>` : ""}
        <div class="krishna-synthesis-text">${escapeHtml(data.synthesis)}</div>

        <div class="vedic-diagnosis-banner">
          <div class="diagnosis-header">Vedic root</div>
          <div class="diagnosis-term">${escapeHtml(diag.term || "Sthitaprajna Sadhana")}</div>
          <div class="diagnosis-meaning">${escapeHtml(diag.meaning || "")}</div>
        </div>

        <div class="shloka-wisdom-box">
          <div class="shloka-ref">${escapeHtml(shloka.reference || "Bhagavad Gita")}</div>
          <div class="shloka-sanskrit">${escapeHtml(shloka.sanskrit || "")}</div>
          <div class="shloka-translit">${escapeHtml(dandas(shloka.transliteration))}</div>
          <div class="shloka-translation">“${escapeHtml(shloka.translation || "")}”</div>
          ${shloka.insight ? `<details class="shloka-more"><summary>Read the commentary</summary><div class="shloka-insight">${escapeHtml(shloka.insight)}</div></details>` : ""}
        </div>

        <div class="cbt-practice-box">
          <div class="cbt-title">Modern CBT practice: ${escapeHtml(cbt.title || "Reframing")}</div>
          ${cbtStepsHtml}
        </div>

        <div class="krishna-closing-checkin">
          “${escapeHtml(data.closingCheckin || "Does this bring stillness to your heart? Tell me how you feel now.")}”
        </div>

        <div class="card-action-toolbar">
          <div class="left-actions">
            <button class="action-pill-btn tts-btn" data-target="${cardId}">Listen</button>
            <button class="action-pill-btn save-journal-btn" data-card-id="${cardId}">Save to journal</button>
            <button class="action-pill-btn copy-btn" data-target="${cardId}">Copy</button>
          </div>
          <div class="right-actions">
            <button class="action-pill-btn calm-reaction-btn" data-reaction="calm">I feel calmer</button>
            <button class="action-pill-btn calm-reaction-btn" data-reaction="ask">Ask more</button>
          </div>
        </div>
      </div>
    `;

    chatViewport.appendChild(row);
    scrollToRowTop(row);

    // Attach Save to Journal
    const saveBtn = row.querySelector(".save-journal-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        saveEntryToJournal({
          date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
          archetypeTitle: state.currentArchetype ? state.currentArchetype.title : "Spiritual Reflection",
          shlokaRef: shloka.reference,
          sanskrit: shloka.sanskrit,
          translation: shloka.translation,
          cbtTitle: cbt.title,
          notes: ""
        });
        saveBtn.textContent = "Saved";
        saveBtn.disabled = true;
      });
    }

    // Reaction buttons
    row.querySelectorAll(".calm-reaction-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.reaction;
        appendUserBubble(type === "calm" ? "I feel calmer" : "Tell me more");
        runTurn({ reaction: type });
      });
    });

    const fullSpeechText = `${data.synthesis}. According to the Bhagavad Gita: ${shloka.translation}. For daily practice: ${cbt.title}. ${data.closingCheckin}`;
    attachCardToolbarListeners(row, cardId, fullSpeechText);

    state.history.push({ sender: "krishna", phase: 2, content: data, timestamp: new Date() });
  }

  // --------------------------------------------------------------------------
  // 6. Voice Input (Speech Recognition) & Output (Text-to-Speech)
  // --------------------------------------------------------------------------
  if (micBtn) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      state.recognition = new SpeechRecognition();
      state.recognition.continuous = false;
      state.recognition.interimResults = false;
      state.recognition.lang = "en-US";

      state.recognition.onstart = () => {
        state.isRecording = true;
        micBtn.classList.add("recording");
      };

      state.recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        chatTextarea.value = transcript;
        chatTextarea.style.height = Math.min(chatTextarea.scrollHeight, 120) + "px";
      };

      state.recognition.onerror = (e) => {
        console.warn("Speech recognition error:", e.error);
        stopMic();
        // Say what happened, in the input line, then put the usual prompt back
        const says = {
          "not-allowed": "The microphone is blocked. Allow it in your browser, or type instead.",
          "service-not-allowed": "The microphone is blocked. Allow it in your browser, or type instead.",
          "audio-capture": "No microphone was found. You can type instead.",
          "no-speech": "I did not hear anything. Tap the microphone and try again.",
          "network": "Voice input needs an internet connection in this browser. You can type instead."
        };
        if (e.error !== "aborted" && chatTextarea) {
          const usual = chatTextarea.dataset.usualPlaceholder || chatTextarea.placeholder;
          chatTextarea.dataset.usualPlaceholder = usual;
          chatTextarea.placeholder = says[e.error] || "Voice input did not work. You can type instead.";
          clearTimeout(state.micNoteTimer);
          state.micNoteTimer = setTimeout(() => { chatTextarea.placeholder = usual; }, 6000);
        }
      };

      state.recognition.onend = () => {
        stopMic();
      };

      micBtn.addEventListener("click", () => {
        if (state.isRecording) {
          state.recognition.stop();
        } else {
          try {
            state.recognition.start();
          } catch (err) {
            console.error("Mic start failed", err);
          }
        }
      });
    } else {
      micBtn.title = "Speech recognition is not supported in this browser";
      micBtn.style.opacity = "0.5";
    }
  }

  function stopMic() {
    state.isRecording = false;
    if (micBtn) micBtn.classList.remove("recording");
  }

  function attachCardToolbarListeners(row, cardId, speechText) {
    // Listen / TTS
    const ttsBtn = row.querySelector(".tts-btn");
    if (ttsBtn && window.speechSynthesis) {
      ttsBtn.addEventListener("click", () => {
        if (state.activeSpeakingCardId === cardId && window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          ttsBtn.textContent = "Listen";
          ttsBtn.classList.remove("speaking");
          state.activeSpeakingCardId = null;
        } else {
          window.speechSynthesis.cancel();
          document.querySelectorAll(".tts-btn").forEach(b => {
            b.textContent = "Listen";
            b.classList.remove("speaking");
          });

          const utterance = new SpeechSynthesisUtterance(speechText);
          const config = window.geminiService ? window.geminiService.config : {};
          utterance.rate = config.speechSpeed || 1.0;
          utterance.pitch = 0.95; // warm deeper cadence

          utterance.onend = () => {
            ttsBtn.textContent = "Listen";
            ttsBtn.classList.remove("speaking");
            state.activeSpeakingCardId = null;
          };

          utterance.onerror = () => {
            ttsBtn.textContent = "Listen";
            ttsBtn.classList.remove("speaking");
            state.activeSpeakingCardId = null;
          };

          window.speechSynthesis.speak(utterance);
          ttsBtn.textContent = "Stop";
          ttsBtn.classList.add("speaking");
          state.activeSpeakingCardId = cardId;
        }
      });
    }

    // Copy text
    const copyBtn = row.querySelector(".copy-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(speechText).then(() => {
          copyBtn.textContent = "Copied";
          setTimeout(() => { copyBtn.textContent = "Copy"; }, 2000);
        });
      });
    }
  }

  // ---- Extra turn types: follow-up, "which is closest?", close, crisis ----
  function krishnaCard(inner, phaseLabel) {
    const cardId = "card-" + Date.now();
    const row = document.createElement("div");
    row.className = "message-row krishna-row";
    row.innerHTML = `
      <div class="krishna-counsel-card" id="${cardId}">
        <div class="counsel-header">
          <div class="counsel-speaker">
            <span class="speaker-avatar-icon">${icon("flame")}</span>
            <span class="speaker-title">Lord Krishna</span>
          </div>
          <span class="phase-indicator-pill">${escapeHtml(phaseLabel)}</span>
        </div>
        ${inner}
      </div>`;
    chatViewport.appendChild(row);
    scrollToRowTop(row);
    return { row, cardId };
  }

  function verseBlock(v) {
    if (!v) return "";
    return `
      <div class="shloka-wisdom-box">
        <div class="shloka-ref">${escapeHtml(v.reference || "")}</div>
        <div class="shloka-sanskrit">${escapeHtml(v.sanskrit || "")}</div>
        <div class="shloka-translit">${escapeHtml(dandas(v.transliteration))}</div>
        <div class="shloka-translation">“${escapeHtml(v.translation || "")}”</div>
        ${v.insight ? `<details class="shloka-more"><summary>Read the commentary</summary><div class="shloka-insight">${escapeHtml(v.insight)}</div></details>` : ""}
      </div>`;
  }

  function reactionToolbar(cardId, withSave) {
    return `
      <div class="card-action-toolbar">
        <div class="left-actions">
          <button class="action-pill-btn tts-btn" data-target="${cardId}">Listen</button>
          ${withSave ? `<button class="action-pill-btn save-journal-btn">Save to journal</button>` : ""}
        </div>
        <div class="right-actions">
          <button class="action-pill-btn calm-reaction-btn" data-reaction="calm">I feel calmer</button>
          <button class="action-pill-btn calm-reaction-btn" data-reaction="ask">Ask more</button>
        </div>
      </div>`;
  }

  function wireReactions(row) {
    row.querySelectorAll(".calm-reaction-btn").forEach(btn => btn.addEventListener("click", () => {
      const type = btn.dataset.reaction;
      appendUserBubble(type === "calm" ? "I feel calmer" : "Tell me more");
      runTurn({ reaction: type });
    }));
  }

  function renderFollowup(d) {
    const cardId = "card-" + Date.now();
    const v = d.verse;
    const inner = `
      ${d.note ? `<div class="engine-note">${escapeHtml(d.note)}</div>` : ""}
      <div class="krishna-echo">${escapeHtml(d.intro)}</div>
      ${verseBlock(v)}
      ${d.step ? `<div class="cbt-practice-box"><div class="cbt-title">One step for now</div><div class="cbt-step-item">${escapeHtml(d.step)}</div></div>` : ""}
      <div class="krishna-closing-checkin">“${escapeHtml(d.closing)}”</div>
      ${reactionToolbar(cardId, Boolean(v))}`;
    const built = krishnaCard(inner, "Follow-up");
    const row = built.row;
    row.querySelector(".krishna-counsel-card").id = cardId;
    wireReactions(row);
    const save = row.querySelector(".save-journal-btn");
    if (save && v) {
      save.addEventListener("click", () => {
        saveEntryToJournal({
          date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
          archetypeTitle: d.archetype ? d.archetype.title : "Spiritual Reflection",
          shlokaRef: v.reference, sanskrit: v.sanskrit, translation: v.translation, cbtTitle: "One step", notes: ""
        });
        save.textContent = "Saved"; save.disabled = true;
      });
    }
    attachCardToolbarListeners(row, cardId, `${d.intro} ${v ? v.translation : ""} ${d.step || ""} ${d.closing}`);
    state.history.push({ sender: "krishna", phase: 3, content: d, timestamp: new Date() });
  }

  function renderClarify(d) {
    const inner = `
      <div class="krishna-ack-text">${escapeHtml(d.prompt)}</div>
      <div class="quick-pills-grid">
        ${d.options.map(o => `<button class="interactive-pill-btn" data-archetype="${escapeHtml(o.id)}">${escapeHtml(o.title)}</button>`).join("")}
      </div>`;
    const { row } = krishnaCard(inner, "Finding the closest");
    row.querySelectorAll(".interactive-pill-btn").forEach(btn => btn.addEventListener("click", () => {
      appendUserBubble(btn.textContent.trim());
      runTurn({ archetypeId: btn.dataset.archetype });
    }));
    state.history.push({ sender: "krishna", phase: 0, content: d, timestamp: new Date() });
  }

  function renderClose(d) {
    const inner = `
      <div class="krishna-ack-text">${escapeHtml(d.message)}</div>
      <div class="card-action-toolbar"><div class="left-actions">
        <button class="action-pill-btn" data-open="nav-pranayama-btn">Breathe for a minute</button>
        <button class="action-pill-btn" data-open="nav-journal-btn">Open journal</button>
      </div></div>`;
    const { row } = krishnaCard(inner, "Closing");
    row.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => {
      const t = document.getElementById(b.dataset.open); if (t) t.click();
    }));
    state.history.push({ sender: "krishna", phase: 0, content: d, timestamp: new Date() });
  }

  function renderAside(d, action) {
    let message = d.message;
    if (action === "say-name") {   // the engine cannot know it; the account page shows it
      const el = document.getElementById("acct-name"), name = el ? el.textContent.trim() : "";
      message = name ? message.replace("{name}", name) : "I do not have a name for you yet. You can set one in Settings, under Account.";
    }
    const link = action === "open-settings" || action === "say-name" ? `<p><button type="button" class="acct-link" data-open="nav-settings-btn">Open Settings</button></p>` : "";
    const { row } = krishnaCard(`<div class="krishna-ack-text">${escapeHtml(message)}</div>${link}`, "Note");
    row.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => {
      const t = document.getElementById(b.dataset.open); if (t) t.click();
    }));
  }

  function renderCrisis() {
    const inner = `
      <div class="crisis-card" role="alert">
        <p class="crisis-lead">I'm really glad you told me. What you are feeling matters, and you deserve help from a person right now.</p>
        <p>Please contact one of these, free and confidential, at any hour:</p>
        <ul class="crisis-lines">
          <li><a href="tel:14416">Tele-MANAS (India): 14416</a></li>
          <li><a href="tel:+919999666555">Vandrevala Foundation (India): +91 9999 666 555</a></li>
          <li><a href="tel:988">USA and Canada: call or text 988</a></li>
          <li><a href="tel:116123">UK: Samaritans 116 123</a></li>
        </ul>
        <p>If you are in immediate danger, call your local emergency number.</p>
        <button class="action-pill-btn crisis-open">Open Safe Harbor</button>
      </div>`;
    const { row } = krishnaCard(inner, "Safe Harbor");
    const open = row.querySelector(".crisis-open");
    if (open) open.addEventListener("click", () => { const b = document.getElementById("nav-safe-harbor-btn"); if (b) b.click(); });
    state.history.push({ sender: "krishna", phase: 0, content: { crisis: true }, timestamp: new Date() });
  }

  // A new Krishna turn opens at its first line, so the reader starts at the top, not mid-reply.
  function scrollToRowTop(row) {
    var gap = 8;
    chatViewport.scrollTop += row.getBoundingClientRect().top - chatViewport.getBoundingClientRect().top - gap;
  }

  function scrollToBottom() {
    chatViewport.scrollTop = chatViewport.scrollHeight;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined || str === false) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --------------------------------------------------------------------------
  // 7. Modals Manager (Pranayama, Shloka, Journal, Safe Harbor, Settings)
  // --------------------------------------------------------------------------
  function setupModal(triggerBtnId, modalId, onClose) {
    const trigger = document.getElementById(triggerBtnId);
    const modal = document.getElementById(modalId);
    if (!trigger || !modal) return;

    // While a window is open the page behind it cannot be reached by keyboard or read by a screen reader.
    const pageBehind = () => document.querySelector(".app-container");
    const closeModal = () => {
      if (!modal.classList.contains("open")) return;
      modal.classList.remove("open");
      const page = pageBehind();
      if (page && !document.querySelector(".modal-backdrop.open")) page.removeAttribute("inert");
      if (onClose) onClose();
      trigger.focus();
    };

    trigger.addEventListener("click", () => {
      modal.classList.add("open");
      const page = pageBehind();
      if (page) page.setAttribute("inert", "");
      const closeBtn = modal.querySelector(".modal-close-btn");
      if (closeBtn) closeBtn.focus();
    });

    const closeBtn = modal.querySelector(".modal-close-btn");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    // Esc closes whichever modal is open; Tab stays inside the open window
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
      if (e.key === "Tab" && modal.classList.contains("open")) {
        const items = [...modal.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
          .filter((el) => !el.disabled && el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  // Closing the breathing modal must stop the pacer (and its bell chimes).
  setupModal("nav-pranayama-btn", "pranayama-modal", () => resetPacer());
  setupModal("nav-daily-shloka-btn", "daily-shloka-modal");
  setupModal("nav-journal-btn", "journal-modal");
  setupModal("nav-safe-harbor-btn", "safe-harbor-modal");
  setupModal("nav-settings-btn", "settings-modal");

  // --------------------------------------------------------------------------
  // 8. Pranayama Breathing Pacer Engine
  // --------------------------------------------------------------------------
  const pacerModes = {
    box: {
      name: "Box Breathing (4-4-4-4)",
      phases: [
        { name: "Inhale", duration: 4, mantra: "So Hum", scale: 1.35, desc: "Breathe in divine energy" },
        { name: "Hold", duration: 4, mantra: "Shantih", scale: 1.35, desc: "Retain calm awareness" },
        { name: "Exhale", duration: 4, mantra: "Om Namah", scale: 0.85, desc: "Release all tension" },
        { name: "Rest", duration: 4, mantra: "Stillness", scale: 0.85, desc: "Rest in the quiet center" }
      ]
    },
    shanti: {
      name: "Shanti Breath (4-7-8)",
      phases: [
        { name: "Inhale", duration: 4, mantra: "So Hum", scale: 1.35, desc: "Gentle nasal inhalation" },
        { name: "Hold", duration: 7, mantra: "Shantih", scale: 1.35, desc: "Savor the deep serenity" },
        { name: "Exhale", duration: 8, mantra: "Om Namah Shivaya", scale: 0.8, desc: "Slow, soothing exhalation" }
      ]
    }
  };

  let activePacerMode = "box";
  let pacerTimer = null;
  let pacerRunning = false;
  let currentPhaseIdx = 0;
  let phaseSecondsRemaining = 4;
  let roundCount = 1;

  const mandalaCircle = document.getElementById("sacred-mandala");
  const mandalaPhase = document.getElementById("mandala-phase");
  const mandalaMantra = document.getElementById("mandala-mantra");
  const mandalaSecs = document.getElementById("mandala-seconds");
  const pacerStartBtn = document.getElementById("pacer-start-btn");
  // The label may sit inside a .specular-button__label span; never replace the whole button content.
  const setPacerLabel = (text) => {
    if (!pacerStartBtn) return;
    const l = pacerStartBtn.querySelector(".specular-button__label");
    (l || pacerStartBtn).textContent = text;
  };
  const pacerDescText = document.getElementById("pacer-instructions");

  document.querySelectorAll(".pacer-tab-btn").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".pacer-tab-btn").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      activePacerMode = tab.dataset.mode;
      resetPacer();
    });
  });

  if (pacerStartBtn) {
    pacerStartBtn.addEventListener("click", () => {
      if (pacerRunning) {
        pausePacer();
      } else {
        startPacer();
      }
    });
  }

  function startPacer() {
    pacerRunning = true;
    setPacerLabel("Pause practice");
    runPacerTick();
  }

  function pausePacer() {
    pacerRunning = false;
    setPacerLabel("Resume practice");
    if (pacerTimer) clearInterval(pacerTimer);
  }

  function resetPacer() {
    pausePacer();
    setPacerLabel("Begin practice");
    currentPhaseIdx = 0;
    const mode = pacerModes[activePacerMode];
    phaseSecondsRemaining = mode.phases[0].duration;
    roundCount = 1;
    // Before you begin the circle is at rest and says so (no countdown, no "Round 1")
    if (mandalaPhase) mandalaPhase.textContent = "Ready";
    if (mandalaMantra) mandalaMantra.textContent = "";
    if (mandalaSecs) mandalaSecs.textContent = "";
    if (pacerDescText) pacerDescText.textContent = "Choose a pattern, then begin when you are ready.";
    if (mandalaCircle) mandalaCircle.style.transform = "scale(0.85)";
  }

  function runPacerTick() {
    if (pacerTimer) clearInterval(pacerTimer);

    const mode = pacerModes[activePacerMode];
    const phase = mode.phases[currentPhaseIdx];
    updatePacerUI(phase);

    pacerTimer = setInterval(() => {
      phaseSecondsRemaining--;
      if (mandalaSecs) mandalaSecs.textContent = phaseSecondsRemaining;

      if (phaseSecondsRemaining <= 0) {
        // Transition to next phase
        currentPhaseIdx++;
        if (currentPhaseIdx >= mode.phases.length) {
          currentPhaseIdx = 0;
          roundCount++;
        }
        const nextPhase = mode.phases[currentPhaseIdx];
        phaseSecondsRemaining = nextPhase.duration;
        updatePacerUI(nextPhase);

        // Gentle bell chime at transition if audio engine exists
        if (window.audioEngine) {
          window.audioEngine.playTempleBell(1.2);
        }
      }
    }, 1000);
  }

  function updatePacerUI(phase) {
    if (mandalaPhase) mandalaPhase.textContent = phase.name;
    if (mandalaMantra) mandalaMantra.textContent = phase.mantra;
    if (mandalaSecs) mandalaSecs.textContent = phaseSecondsRemaining;
    if (pacerDescText) pacerDescText.textContent = `${phase.desc} (Round ${roundCount})`;

    if (mandalaCircle) {
      mandalaCircle.style.transform = `scale(${phase.scale})`;
    }
  }

  // --------------------------------------------------------------------------
  // 9. Daily Shloka of Serenity
  // --------------------------------------------------------------------------
  function loadDailyShloka() {
    const today = new Date();
    const dayOfMonth = today.getDate(); // 1 to 31
    const verseIndex = (dayOfMonth - 1) % DAILY_SHLOKAS.length;
    const shloka = DAILY_SHLOKAS[verseIndex];

    const datePill = document.getElementById("daily-shloka-date");
    const refEl = document.getElementById("daily-shloka-ref");
    const sanskritEl = document.getElementById("daily-shloka-sanskrit");
    const translitEl = document.getElementById("daily-shloka-translit");
    const transEl = document.getElementById("daily-shloka-translation");
    const medEl = document.getElementById("daily-shloka-meditation");

    if (datePill) {
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      datePill.textContent = `Verse for ${monthNames[today.getMonth()]} ${today.getDate()}`;
    }

    // First screen: today's verse is the hero
    const heroS = document.getElementById("hero-sanskrit");
    if (heroS) {
      heroS.textContent = shloka.sanskrit;
      document.getElementById("hero-translit").textContent = dandas(shloka.transliteration);
      document.getElementById("hero-translation").textContent = `“${shloka.translation}”`;
      document.getElementById("hero-ref").textContent = `Today's verse: ${shloka.chapterVerse}`;
    }

    if (refEl) refEl.textContent = shloka.chapterVerse;
    if (sanskritEl) sanskritEl.textContent = shloka.sanskrit;
    if (translitEl) translitEl.textContent = dandas(shloka.transliteration);
    if (transEl) transEl.textContent = `“${shloka.translation}”`;
    if (medEl) medEl.textContent = shloka.meditation;

    // Daily Listen & Save
    const listenDailyBtn = document.getElementById("daily-shloka-listen-btn");
    if (listenDailyBtn) {
      listenDailyBtn.addEventListener("click", () => {
        const textToRead = `${shloka.chapterVerse}. ${shloka.translation}. Contemplation: ${shloka.meditation}`;
        const utterance = new SpeechSynthesisUtterance(textToRead);
        window.speechSynthesis.speak(utterance);
      });
    }

    const saveDailyBtn = document.getElementById("daily-shloka-save-btn");
    if (saveDailyBtn) {
      saveDailyBtn.addEventListener("click", () => {
        saveEntryToJournal({
          date: today.toLocaleDateString(),
          archetypeTitle: "Daily Shloka of Serenity",
          shlokaRef: shloka.chapterVerse,
          sanskrit: shloka.sanskrit,
          translation: shloka.translation,
          cbtTitle: "Contemplative Reflection",
          notes: shloka.meditation
        });
        saveDailyBtn.textContent = "Saved";
        saveDailyBtn.disabled = true;
      });
    }
  }

  loadDailyShloka();

  const heroCta = document.getElementById("hero-cta");
  if (heroCta) heroCta.addEventListener("click", () => document.getElementById("chat-input").focus());

  // --------------------------------------------------------------------------
  // 10. Sacred Wisdom Journal (LocalStorage & Markdown Export)
  // --------------------------------------------------------------------------
  const JOURNAL_STORAGE_KEY = "gitasaarthi_journal_entries";

  function getJournalEntries() {
    try {
      const raw = localStorage.getItem(JOURNAL_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveEntryToJournal(entry) {
    const entries = getJournalEntries();
    entry.id = "journal-" + Date.now();
    entries.unshift(entry);
    localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(entries));
    updateJournalBadge();
    renderJournalList();
  }

  function updateJournalBadge() {
    const entries = getJournalEntries();
    const badge = document.getElementById("journal-badge");
    if (badge) {
      badge.textContent = entries.length;
    }
  }

  function renderJournalList() {
    const listContainer = document.getElementById("journal-entries-container");
    if (!listContainer) return;

    const entries = getJournalEntries();
    if (entries.length === 0) {
      listContainer.innerHTML = `
        <div class="journal-empty-state">
          <p>Your journal is empty.</p>
          <p style="font-size: 0.8rem; margin-top: 6px;">Click <strong>Save to journal</strong> on any of Krishna's counsel cards to preserve wisdom here.</p>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = entries.map(entry => `
      <div class="journal-entry-card" id="entry-${escapeHtml(entry.id)}">
        <div class="journal-entry-meta">
          <span class="journal-entry-shloka-ref">${escapeHtml(entry.shlokaRef || "Bhagavad Gita")}</span>
          <span>${escapeHtml(entry.date)}</span>
        </div>
        <div class="journal-entry-sanskrit">${escapeHtml(entry.sanskrit || "")}</div>
        <div class="journal-entry-translation">“${escapeHtml(entry.translation || "")}”</div>
        <textarea class="journal-user-note-area" placeholder="Add your personal reflection or prayer here..." data-id="${escapeHtml(entry.id)}">${escapeHtml(entry.notes || "")}</textarea>
        <button class="journal-delete-btn" data-id="${escapeHtml(entry.id)}">Remove</button>
      </div>
    `).join("");

    // Attach Note Auto-save
    listContainer.querySelectorAll(".journal-user-note-area").forEach(textarea => {
      textarea.addEventListener("change", (e) => {
        const id = e.target.dataset.id;
        const updatedEntries = getJournalEntries().map(ent => {
          if (ent.id === id) ent.notes = e.target.value;
          return ent;
        });
        localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(updatedEntries));
      });
    });

    // Attach Delete button
    listContainer.querySelectorAll(".journal-delete-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.id;
        const filtered = getJournalEntries().filter(ent => ent.id !== id);
        localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(filtered));
        updateJournalBadge();
        renderJournalList();
      });
    });
  }

  updateJournalBadge();
  renderJournalList();
  // the account's journal arrives after the page loads: draw it again once it has
  if (window.GSAccount && window.GSAccount.ready) window.GSAccount.ready.then(function () { updateJournalBadge(); renderJournalList(); }).catch(function () {});
  // another device's changes were merged in, or a late load finished: show what is saved now
  window.addEventListener("gs:hydrated", function () { updateJournalBadge(); renderJournalList(); });

  // Export Journal to Markdown (.md)
  const exportJournalBtn = document.getElementById("export-journal-btn");
  if (exportJournalBtn) {
    exportJournalBtn.addEventListener("click", () => {
      const entries = getJournalEntries();
      if (entries.length === 0) {
        alert("Your journal is empty. Save a verse first.");
        return;
      }

      let md = `# GitaSaarthi (गीता सारथी) — Sacred Wisdom Journal\n`;
      md += `*Exported on ${new Date().toLocaleDateString()}*\n\n---\n\n`;

      entries.forEach((ent, idx) => {
        md += `## ${idx + 1}. ${ent.archetypeTitle || "Sacred Counsel"} (${ent.date})\n\n`;
        md += `### ${ent.shlokaRef || "Bhagavad Gita"}\n\n`;
        if (ent.sanskrit) md += `\`\`\`sanskrit\n${ent.sanskrit}\n\`\`\`\n\n`;
        if (ent.translation) md += `> "${ent.translation}"\n\n`;
        if (ent.cbtTitle) md += `**Modern Practice:** ${ent.cbtTitle}\n\n`;
        if (ent.notes) md += `**My Reflection:**\n${ent.notes}\n\n`;
        md += `---\n\n`;
      });

      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GitaSaarthi_Journal_${(() => { const d = new Date(), q = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + q(d.getMonth() + 1) + "-" + q(d.getDate()); })()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // --------------------------------------------------------------------------
  // 11. Settings & Engine Configuration
  // --------------------------------------------------------------------------
  const geminiKeyInput = document.getElementById("gemini-api-key-input");
  const geminiToggle = document.getElementById("gemini-enabled-toggle");
  const geminiModelSelect = document.getElementById("gemini-model-select");
  const testKeyBtn = document.getElementById("test-gemini-key-btn");
  const testStatusSpan = document.getElementById("key-test-status");
  const speechSpeedSlider = document.getElementById("speech-speed-slider");
  const speechSpeedVal = document.getElementById("speech-speed-val");
  const clearChatBtn = document.getElementById("clear-chat-btn");
  const engineBadge = document.getElementById("engine-badge");
  const keyEntry = document.getElementById("gemini-key-entry");
  const keySaved = document.getElementById("gemini-key-saved");
  const keySavedText = document.getElementById("gemini-key-saved-text");
  const keySaveBtn = document.getElementById("gemini-key-save");
  const keyReplaceBtn = document.getElementById("gemini-key-replace");
  const keyRemoveBtn = document.getElementById("gemini-key-remove");
  const keyConfirm = document.getElementById("gemini-key-confirm");
  const keyMsg = document.getElementById("gemini-key-msg");
  const GS = window.geminiService;
  const FALLBACK_MODELS = [
    { id: "gemini-3-flash-preview", label: "gemini-3-flash-preview (recommended)" },
    { id: "gemini-3.1-flash-lite", label: "gemini-3.1-flash-lite (fastest)" },
    { id: "gemini-2.5-pro", label: "gemini-2.5-pro" }
  ];
  let replacing = false;

  const oneSentence = (m) => {
    let t = String(m || "").replace(/\s+/g, " ").trim();
    const k = t.search(/[.!?](\s|$)/);
    if (k > 0) t = t.slice(0, k + 1);
    return t.length > 160 ? t.slice(0, 157).trim() + "…" : t;
  };
  const failText = (e, fallback) => oneSentence(e && e.message) || fallback;
  const setErr = (t) => { if (keyMsg) keyMsg.textContent = t || ""; };

  function fillModels(list, current) {
    if (!geminiModelSelect) return;
    const items = (list && list.length ? list : FALLBACK_MODELS).slice();
    if (current && !items.some((m) => m.id === current)) items.push({ id: current, label: current });
    geminiModelSelect.innerHTML = "";
    items.forEach((m) => {
      const o = document.createElement("option");
      o.value = m.id; o.textContent = m.label || m.id;
      geminiModelSelect.appendChild(o);
    });
    geminiModelSelect.value = current || "gemini-3-flash-preview";
  }

  async function loadModels() {
    let list = null;
    if (GS.state.hasKey) {
      try { const d = await GS._api("GET", "/api/gemini/models"); list = d && d.models; } catch (e) {}
    }
    fillModels(list, GS.state.model);
  }

  function renderGemini() {
    const st = GS.state;
    if (geminiToggle) geminiToggle.checked = st.enabled;
    const showSaved = st.hasKey && !replacing;
    if (keyEntry) keyEntry.hidden = showSaved;
    if (keySaved) keySaved.hidden = !showSaved;
    if (keySavedText) keySavedText.textContent = "Key saved (" + (st.keyHint || "…") + "). Stored with your account, never shown again.";
    if (keyConfirm) keyConfirm.hidden = true;
    if (testKeyBtn) testKeyBtn.disabled = !st.hasKey;
    updateEngineBadge();
  }

  function updateEngineBadge() {
    if (!engineBadge || !GS) return;
    engineBadge.textContent = GS.hasValidKey() ? "Gemini AI" : "Curated wisdom, offline and private";
  }

  function loadSettingsUI() {
    if (!GS) return;
    const cfg = GS.config;
    if (speechSpeedSlider) speechSpeedSlider.value = cfg.speechSpeed || 1.0;
    if (speechSpeedVal) speechSpeedVal.textContent = (cfg.speechSpeed || 1.0) + "x";
    fillModels(null, GS.state.model);
    renderGemini();
  }

  async function putGemini(body) {
    const d = await GS._api("PUT", "/api/me/gemini", body);
    GS.setState(d);
    return d;
  }

  // One-time move of an old browser-held key to the account, then drop the local copy.
  function migrateOldKey() {
    let old = null;
    try { old = JSON.parse(localStorage.getItem("gitasaarthi_gemini_config") || "null"); } catch (e) { return Promise.resolve(); }
    if (!old || !old.apiKey) return Promise.resolve();
    const model = !old.model || ["gemini-2.5-flash", "gemini-3.8-flash", "gemini-3.5-flash"].indexOf(old.model) >= 0 ? "gemini-3-flash-preview" : old.model;
    return putGemini({ apiKey: String(old.apiKey).trim(), enabled: !!old.enabled, model })
      .then(() => { try { localStorage.removeItem("gitasaarthi_gemini_config"); } catch (e) {} }, () => {});
  }

  if (GS) {
    const afterReady = () => migrateOldKey().then(() => GS.refresh()).then(() => { renderGemini(); return loadModels(); });
    if (window.GSAccount && window.GSAccount.ready) window.GSAccount.ready.then(afterReady, () => {});
    else afterReady();
  }

  if (geminiToggle) {
    geminiToggle.addEventListener("change", async (e) => {
      const want = e.target.checked;
      setErr("");
      try { await putGemini({ enabled: want }); }
      catch (err) { geminiToggle.checked = !want; setErr(failText(err, "Could not save that. Try again.")); }
      renderGemini();
    });
  }

  if (keySaveBtn) {
    keySaveBtn.addEventListener("click", async () => {
      const key = geminiKeyInput.value.trim();
      if (!key) { setErr("Paste your Gemini API key first."); return; }
      keySaveBtn.disabled = true; setErr("");
      try {
        await putGemini({ apiKey: key });
        geminiKeyInput.value = "";
        replacing = false;
        renderGemini();
        loadModels();
      } catch (err) { setErr(failText(err, "Could not save the key. Try again.")); }
      keySaveBtn.disabled = false;
    });
  }

  if (keyReplaceBtn) {
    keyReplaceBtn.addEventListener("click", () => {
      replacing = true; renderGemini(); geminiKeyInput.focus();
    });
  }
  if (keyRemoveBtn) {
    keyRemoveBtn.addEventListener("click", () => {
      keyConfirm.hidden = false;
      document.getElementById("gemini-key-remove-yes").focus();
    });
  }
  const removeNo = document.getElementById("gemini-key-remove-no");
  if (removeNo) removeNo.addEventListener("click", () => { keyConfirm.hidden = true; keyRemoveBtn.focus(); });
  const removeYes = document.getElementById("gemini-key-remove-yes");
  if (removeYes) {
    removeYes.addEventListener("click", async () => {
      setErr("");
      try {
        await GS._api("DELETE", "/api/me/gemini");
        await GS.refresh();
        replacing = false;
        renderGemini(); loadModels();
        if (testStatusSpan) testStatusSpan.textContent = "";
        geminiKeyInput.focus();
      } catch (err) { setErr(failText(err, "Could not remove the key. Try again.")); }
    });
  }

  if (geminiModelSelect) {
    geminiModelSelect.addEventListener("change", async (e) => {
      setErr("");
      try { await putGemini({ model: e.target.value }); }
      catch (err) { setErr(failText(err, "Could not save the model. Try again.")); fillModels(null, GS.state.model); }
    });
  }

  if (speechSpeedSlider) {
    speechSpeedSlider.addEventListener("input", (e) => {
      const spd = parseFloat(e.target.value);
      if (speechSpeedVal) speechSpeedVal.textContent = spd + "x";
      window.geminiService.saveConfig({ speechSpeed: spd });
    });
  }

  if (testKeyBtn) {
    testKeyBtn.addEventListener("click", async () => {
      testStatusSpan.textContent = "Testing…";
      testStatusSpan.style.color = "var(--text-2)";
      try {
        await GS._api("POST", "/api/gemini/test", {});
        testStatusSpan.textContent = "Connected";
        testStatusSpan.style.color = "var(--positive)";
      } catch (err) {
        testStatusSpan.textContent = failText(err, "Gemini did not answer.");
        testStatusSpan.style.color = "var(--negative)";
      }
    });
  }

  if (clearChatBtn) {
    clearChatBtn.addEventListener("click", () => {
      if (confirm("Reset the current conversation? This will clear the chat history.")) {
        chatViewport.innerHTML = "";
        if (welcomeCard) chatViewport.appendChild(welcomeCard);
        if (welcomeCard) welcomeCard.style.display = "block";
        state.history = [];
        state.currentPhase = 1;
        state.currentArchetype = null;
        if (window.Dialogue) state.session = window.Dialogue.createSession();
        document.getElementById("settings-modal").classList.remove("open");
      }
    });
  }

  loadSettingsUI();
});

/* Settings > Account: name and email, change password, sign out other devices, download data, delete account. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  if (!$("acct-name")) return;
  var A = window.GSAccount;
  var say = function (id, text) { var n = $(id); if (n) n.textContent = text; };
  var errText = function (e, fallback) {
    if (e && e.status === 401) return "Your sign-in has ended. Sign in again, then try once more.";
    return (e && e.message && e.status ? String(e.message).replace(/[.!\s]+$/, "") + ". " : "") + fallback;
  };

  if (A && A.ready) A.ready.then(function (me) {
    say("acct-name", me.name || ""); say("acct-email", me.email || "");
  }, function () {});

  function expander(btnId, panelId, focusId) {
    var b = $(btnId), p = $(panelId);
    b.addEventListener("click", function () {
      var open = b.getAttribute("aria-expanded") !== "true";
      b.setAttribute("aria-expanded", String(open)); p.hidden = !open;
      if (open) $(focusId).focus();
    });
  }
  expander("acct-name-toggle", "acct-name-panel", "acct-name-input");
  expander("acct-pw-toggle", "acct-pw-panel", "acct-pw-current");
  expander("acct-del-toggle", "acct-del-panel", "acct-del-password");

  $("acct-pw-show").addEventListener("click", function () {
    var f = $("acct-pw-new"), show = f.type === "password";
    f.type = show ? "text" : "password";
    this.textContent = show ? "Hide new password" : "Show new password";
    this.setAttribute("aria-pressed", String(show));
  });

  $("acct-pw-save").addEventListener("click", function () {
    var cur = $("acct-pw-current").value, nw = $("acct-pw-new").value;
    if (!cur || !nw) { say("acct-pw-msg", "Enter your current password and a new one, then try again."); return; }
    var btn = this; btn.disabled = true; say("acct-pw-msg", "");
    A.api("POST", "/api/me/password", { current: cur, "new": nw }).then(function () {
      $("acct-pw-current").value = ""; $("acct-pw-new").value = "";
      say("acct-pw-msg", "Password changed.");
    }, function (e) {
      say("acct-pw-msg", errText(e, "Check your current password and try again."));
    }).then(function () { btn.disabled = false; });
  });

  function closeNamePanel() {
    $("acct-name-panel").hidden = true; $("acct-name-toggle").setAttribute("aria-expanded", "false"); $("acct-name-toggle").focus();
  }
  $("acct-name-cancel").addEventListener("click", function () { say("acct-name-msg", ""); closeNamePanel(); });
  $("acct-name-save").addEventListener("click", function () {
    var v = $("acct-name-input").value.trim();
    if (!v) { say("acct-name-msg", "Enter a name, then try again."); return; }
    var btn = this; btn.disabled = true; say("acct-name-msg", "");
    A.api("PATCH", "/api/me", { name: v }).then(function (me) {
      say("acct-name", me.name);
      Array.prototype.forEach.call(document.querySelectorAll("[data-account-name]"), function (n) { n.textContent = me.name; });
      if (A.ready) A.ready.then(function (cached) { if (cached) cached.name = me.name; }, function () {});
      say("acct-name-msg", "Name changed."); closeNamePanel();
    }, function (e) {
      say("acct-name-msg", errText(e, "Try again in a moment."));
    }).then(function () { btn.disabled = false; });
  });

  $("acct-revoke").addEventListener("click", function () {
    say("acct-revoke-msg", "");
    A.api("POST", "/api/me/sessions/revoke", {}).then(function () { say("acct-revoke-msg", "Done"); },
      function (e) { say("acct-revoke-msg", errText(e, "Try again in a moment.")); });
  });

  $("acct-download").addEventListener("click", function () {
    say("acct-download-msg", "");
    A.api("GET", "/api/me/data").then(function (data) {
      var d = new Date(), p = function (n) { return String(n).padStart(2, "0"); };
      var name = "gitasaarthi-data-" + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + ".json";
      var url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      var a = document.createElement("a"); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      say("acct-download-msg", "Saved as " + name);
    }, function (e) { say("acct-download-msg", errText(e, "Try again in a moment.")); });
  });

  $("acct-del-confirm").addEventListener("click", function () {
    var pw = $("acct-del-password").value;
    if (!pw) { say("acct-del-msg", "Enter your password to confirm, then try again."); return; }
    var btn = this; btn.disabled = true; say("acct-del-msg", "");
    A.api("DELETE", "/api/me", { password: pw }).then(function () {
      try { A.clearLocal(); } catch (e) {}
      try { ["gitasaarthi_gemini_config", "gitasaarthi_theme"].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
      location.href = "/login.html";
    }, function (e) {
      btn.disabled = false;
      say("acct-del-msg", errText(e, "Check your password and try again. Nothing was deleted."));
    });
  });
})();
