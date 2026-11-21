// ============================================================================
// GitaSaarthi - Google Gemini engine. The API key lives on the server with the
// account; this file never sees it. Requests go to POST /api/gemini/generate.
// ============================================================================

class GeminiService {
  constructor() {
    this.speedKey = "gitasaarthi_speech_speed";
    this.state = { hasKey: false, keyHint: null, enabled: false, model: "gemini-3-flash-preview" };
    let speed = 1.0;
    try { const v = parseFloat(localStorage.getItem(this.speedKey)); if (v >= 0.7 && v <= 1.3) speed = v; } catch (e) {}
    this.config = { speechSpeed: speed };
    // Circuit breaker: after FAIL_LIMIT failures in a row Gemini is left alone for COOLDOWN_MS, so replies do not
    // wait on a request that is going to fail. Tests replace this.now.
    this.now = () => Date.now();
    this.FAIL_LIMIT = 2;
    this.COOLDOWN_MS = 5 * 60 * 1000;
    this._fails = 0;
    this._coolUntil = 0;
    this._episode = false;
    this._noticeShown = false;
    this._lastFailure = null;
  }

  _cooling() {
    if (!this._coolUntil) return false;
    if (this.now() < this._coolUntil) return true;
    // Cooldown over: one failure is enough to close the door again, and a new episode may show its note.
    this._coolUntil = 0;
    this._fails = this.FAIL_LIMIT - 1;
    this._episode = false;
    return false;
  }

  isAvailable() {
    return this.hasValidKey() && !this._cooling();
  }

  consumeFallbackNotice() {
    this._cooling();
    if (!this._episode || this._noticeShown) return false;
    this._noticeShown = true;
    return true;
  }

  get lastFailure() {
    return this._lastFailure;
  }

  _noteSuccess() {
    this._fails = 0;
    this._coolUntil = 0;
    this._episode = false;
    this._noticeShown = false;
  }

  _noteFailure(e) {
    // Signed out is not Gemini being down; the cooldown error is our own.
    if (e && (e.status === 401 || e.code === "gemini_cooling_down")) return;
    this._lastFailure = { at: this.now(), status: e && typeof e.status === "number" ? e.status : null, message: String((e && e.message) || e) };
    if (!this._episode) { this._episode = true; this._noticeShown = false; }
    this._fails += 1;
    if (this._fails >= this.FAIL_LIMIT) this._coolUntil = this.now() + this.COOLDOWN_MS;
  }

  _coolingError() {
    const e = new Error("Gemini is resting for a few minutes after failing.");
    e.code = "gemini_cooling_down";
    e.status = 503;
    return e;
  }

  // Sends the request; if Google answers 400 to our thinking setting, sends it again without it and remembers that
  // for this model so the next reply does not pay for a failed try.
  async _send(modelName, payload) {
    this.noThinkingConfig = this.noThinkingConfig || {};
    const wantsThinking = !!payload.generationConfig.thinkingConfig && !this.noThinkingConfig[modelName];
    const send = (withThinking) => {
      const generationConfig = { ...payload.generationConfig };
      if (!withThinking) delete generationConfig.thinkingConfig;
      return this._api("POST", "/api/gemini/generate", { model: modelName, ...payload, generationConfig });
    };
    try {
      return await send(wantsThinking);
    } catch (e) {
      if (!(wantsThinking && e && e.status === 400)) throw e;
      this.noThinkingConfig[modelName] = true;
      return await send(false);
    }
  }

  _history(conversationHistory, userMessage) {
    const contents = [];
    for (const turn of conversationHistory.slice(-6)) {
      contents.push({
        role: turn.sender === "user" ? "user" : "model",
        parts: [{ text: typeof turn.content === "string" ? turn.content : JSON.stringify(turn.content) }]
      });
    }
    contents.push({ role: "user", parts: [{ text: userMessage }] });
    return contents;
  }

  // Short conversational answer (plain text, at most about three sentences).
  async generateAnswer(userMessage, history = []) {
    if (!this.hasValidKey()) throw new Error("Gemini is not switched on.");
    if (this._cooling()) throw this._coolingError();
    const modelName = this.state.model || "gemini-3-flash-preview";
    const payload = {
      systemInstruction: { parts: [{ text: "You are Krishna speaking gently with a person using GitaSaarthi, a private Bhagavad Gita and CBT companion. Answer in at most 3 short sentences in plain warm English. If the question is about the Bhagavad Gita, answer accurately and only cite a verse if you are certain of the reference. If it is unrelated to wellbeing or the Gita, answer briefly and kindly, then invite them to share what is on their mind. Never give medical advice. Never pretend to be a human." }] },
      contents: this._history(history, userMessage),
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 400,
        ...(/flash/i.test(modelName) ? { thinkingConfig: { thinkingBudget: 0 } } : {})
      }
    };
    try {
      const data = await this._send(modelName, payload);
      const text = String(data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
      if (!text) throw new Error("Gemini returned an empty response.");
      this._noteSuccess();
      return text;
    } catch (e) {
      this._noteFailure(e);
      throw e;
    }
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try { localStorage.setItem(this.speedKey, String(this.config.speechSpeed)); } catch (e) {}
  }

  _api(method, path, body) {
    const A = window.GSAccount;
    if (A && A.api) return A.api(method, path, body);
    return fetch(path, {
      method, credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then((r) => r.json().catch(() => ({})).then((d) => {
      if (!r.ok) { const e = new Error(d.error || ("HTTP " + r.status)); e.status = r.status; throw e; }
      return d;
    }));
  }

  // Cached copy of GET /api/me/gemini. Settings calls this after any change.
  async refresh() {
    try {
      if (window.GSAccount && window.GSAccount.ready) await window.GSAccount.ready;
      const d = await this._api("GET", "/api/me/gemini");
      this.state = { hasKey: !!d.hasKey, keyHint: d.keyHint || null, enabled: !!d.enabled, model: d.model || "gemini-3-flash-preview" };
    } catch (e) {
      console.warn("Could not read the Gemini settings", e);
    }
    return this.state;
  }

  setState(d) {
    if (!d) return;
    this.state = { hasKey: !!d.hasKey, keyHint: d.keyHint || null, enabled: !!d.enabled, model: d.model || "gemini-3-flash-preview" };
  }

  hasValidKey() {
    return Boolean(this.state.enabled && this.state.hasKey);
  }

  buildSystemPrompt(phase = 1) {
    return `You are Lord Krishna counseling Arjuna (the user) on the battlefield of mortal life in the sacred web application "GitaSaarthi".
Your voice is deeply compassionate, dignified, warm, and spiritually illuminating. You speak with tender affection ("My dear friend", "O seeker", "Noble soul").
You strictly embody the 2-step pedagogical counseling framework of the Bhagavad Gita:

PHASE RULE:
${phase === 1 ? `
CURRENT PHASE: PHASE 1 - ACTIVE INQUIRY & COMPASSIONATE LISTENING
Your goal in this turn is:
1. Warmly acknowledge the user's emotional pain without judgment or premature preaching.
2. Ask two dynamic, penetrating questions:
   - What specifically is the challenge, conflict, or situation you are facing?
   - Why do you feel this weight, or what is the deepest fear / perceived cause behind it?
3. Provide 4 to 5 contextual "Quick-Pills" (short 3-6 word phrases) representing common underlying causes or fears for them to click.

FORMAT YOUR RESPONSE IN VALID JSON ONLY with this exact structure:
{
  "phase": 1,
  "acknowledgment": "Warm compassionate words acknowledging their pain...",
  "question1": "What specifically is the situation or pressure you are facing right now?",
  "question2": "Why do you feel this weight, or what is the deepest fear behind it?",
  "quickPills": [
    "Fear of disappointing others",
    "Feeling overwhelmed by expectations",
    "Struggling with self-doubt",
    "Broken trust or relationship hurt",
    "Loss of direction"
  ]
}
` : `
CURRENT PHASE: PHASE 2 - PHILOSOPHICAL DIAGNOSIS & MODERN CBT SOLUTION
The user has now shared their specific challenge and root cause.
Your goal in this turn is:
1. Empathetically synthesize their specific problem and root cause.
2. Diagnose the core psychological root according to Bhagavad Gita wisdom (e.g., Phala-Sakti / outcome attachment, Moha / emotional delusion, Krodha / thwarted desire, Svadharma / comparison with others, Vishada / soul despondency, Ahamkara / ego identification).
3. Cite an authentic Bhagavad Gita Shloka relevant to their struggle, with:
   - Chapter & Verse (e.g., "Bhagavad Gita 2.47")
   - Original Sanskrit Devanagari
   - English Transliteration
   - English Translation
   - Contemplative commentary explaining how Krishna's words directly heal this struggle.
4. Provide an actionable Modern CBT & Mindfulness practice with 3-4 concrete steps (e.g., Locus of Control sorting, Decatastrophizing, Thought Defusion, Compassionate Re-parenting).
5. Conclude with a caring check-in: "Does this bring stillness to your heart, my dear friend? Tell me how your mind feels now."

FORMAT YOUR RESPONSE IN VALID JSON ONLY with this exact structure:
{
  "phase": 2,
  "synthesis": "Compassionate synthesis of their situation...",
  "vedicDiagnosis": {
    "term": "Sanskrit Term (e.g., Phala-Sakti / Result Attachment)",
    "meaning": "Clear psychological explanation..."
  },
  "shloka": {
    "reference": "Bhagavad Gita X.YY",
    "sanskrit": "Devanagari text...",
    "transliteration": "IAST transliteration...",
    "translation": "English translation...",
    "insight": "How this applies to their life..."
  },
  "cbtPractice": {
    "title": "Name of Practice (e.g., The Circle of Control)",
    "steps": [
      "Step 1: ...",
      "Step 2: ...",
      "Step 3: ...",
      "Step 4: ..."
    ]
  },
  "closingCheckin": "Does this bring stillness to your heart? Tell me how you feel now."
}
`}
Return ONLY the raw JSON string, without markdown formatting or code fences.`;
  }

  async generateCounsel(userMessage, conversationHistory = [], phase = 1) {
    if (!this.hasValidKey()) {
      throw new Error("Gemini is not switched on.");
    }
    if (this._cooling()) throw this._coolingError();
    try {
      const parsed = await this._counsel(userMessage, conversationHistory, phase);
      this._noteSuccess();
      return parsed;
    } catch (e) {
      this._noteFailure(e);
      throw e;
    }
  }

  async _counsel(userMessage, conversationHistory, phase) {
    const modelName = this.state.model || "gemini-3-flash-preview";

    // The prompt goes in systemInstruction; history is the earlier turns only
    // (the caller passes history without the current message, so it is sent once).
    const contents = this._history(conversationHistory, userMessage);

    const payload = {
      systemInstruction: { parts: [{ text: this.buildSystemPrompt(phase) }] },
      contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        // Flash models spend output tokens on thinking, which slows the reply (about 4 s instead of 2.4 s) and can
        // cut the JSON short. Pro models require thinking, so they are left alone.
        ...(/flash/i.test(modelName) ? { thinkingConfig: { thinkingBudget: 0 } } : {})
      }
    };

    const data = await this._send(modelName, payload);
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new Error("Gemini returned an empty response.");
    }

    // Clean JSON text in case of markdown formatting
    let cleanJson = candidateText.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```/, "").replace(/```$/, "").trim();
    }

    const parsed = JSON.parse(cleanJson);
    // Reject replies missing what the cards need, so the caller falls back visibly.
    const ok = phase === 1
      ? parsed && parsed.acknowledgment && parsed.question1 && parsed.question2
      : parsed && parsed.synthesis && parsed.shloka && parsed.shloka.translation && parsed.cbtPractice && Array.isArray(parsed.cbtPractice.steps);
    if (!ok) throw new Error("Gemini reply was missing required fields.");
    if (phase === 1 && !Array.isArray(parsed.quickPills)) parsed.quickPills = [];
    return parsed;
  }
}

// Global instance
window.geminiService = new GeminiService();
