// ============================================================================
// GitaSaarthi understanding layer (offline, deterministic, no network).
//  - rank(): which feeling a message is about (TF-IDF over the curated library
//    plus a hand-written synonym map, Hinglish included).
//  - intent(): what kind of message it is (greeting, question, off-topic ...).
// Pure functions. Browser: window.Understand. Node: module.exports.
// ============================================================================
(function (root) {
  "use strict";

  const MIN_SCORE = 0.12;

  // ---- Text --------------------------------------------------------------
  const STOP = new Set(("a an the i me my am is are was were be been to of in on at for and or but so it its " +
    "this that with about from by as just very really too much so feel feeling felt like im ive do does did have has had " +
    "can what whats who how why when where which will would should could you your we our they them he she his her " +
    "than then there here some any all get got going go also still always keep bit lot more " +
    "time times while today tell day days thing things make want need know please yes yeah okay ok").split(" "));
  const NEG = new Set(["not", "never", "no", "dont", "cant", "cannot", "isnt", "arent", "wasnt", "aint", "without", "nahi", "nahin", "mat"]);

  function normalize(text) {
    return String(text || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function stem(w) {
    if (w.length <= 3) return w;
    if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
    for (const suf of ["ness", "ful", "ing", "ed", "ly", "es", "s"]) {
      if (w.length - suf.length < 3 || !w.endsWith(suf)) continue;
      if (suf === "s" && /(ss|us|is|ous)$/.test(w)) continue;
      w = w.slice(0, -suf.length);
      break;
    }
    if (/([b-df-hj-np-tv-z])\1$/.test(w) && !/(ll|ss|ff)$/.test(w)) w = w.slice(0, -1);
    return w.length > 3 ? w.replace(/e$/, "") : w;
  }
  // Content tokens (stemmed, stop words and bare digits removed).
  function tokens(text) {
    return normalize(text).split(" ").filter(w => w && !STOP.has(w) && !/^\d+$/.test(w)).map(stem);
  }
  const stemmedPhrase = (p) => normalize(p).split(" ").map(stem).join(" ");

  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  // ---- Synonyms ----------------------------------------------------------
  // trigger (word or phrase, matched on stems) -> archetype ids, best first.
  // The first id gets the most weight. Everything here is wording, not scripture.
  const SYNONYMS = {
    // family and conflict
    "fight": ["anger", "heartbreak"], "fought": ["anger", "heartbreak"], "argument": ["anger", "heartbreak"],
    "argued": ["anger", "heartbreak"], "quarrel": ["anger", "heartbreak"], "yelled": ["anger", "workplace"],
    "shouted": ["anger", "heartbreak"], "scolded": ["anger", "heartbreak", "guilt"], "ignored": ["loneliness", "heartbreak", "anger"],
    "ignoring me": ["loneliness", "heartbreak", "anger"], "taunt": ["anger", "heartbreak"],
    "insulted": ["anger", "heartbreak"], "hurt me": ["heartbreak", "anger"], "mad at": ["anger"],
    "annoyed": ["anger"], "frustrated": ["anger", "burnout"], "frustration": ["anger", "burnout"],
    // loss
    "passed away": ["grief"], "pass away": ["grief"], "no more": ["grief"], "late father": ["grief"], "late mother": ["grief"],
    "lost my": ["grief"], "funeral": ["grief"], "miss them": ["grief"], "dukh": ["grief", "depression"],
    "dukhi": ["grief", "depression"], "maut": ["grief"], "guzar gaya": ["grief"], "guzar gayi": ["grief"], "nidhan": ["grief"],
    // sleep and racing mind
    "cant sleep": ["overthinking", "anxiety"], "cannot sleep": ["overthinking", "anxiety"], "insomnia": ["overthinking", "anxiety"],
    "sleepless": ["overthinking", "anxiety"], "awake at night": ["overthinking", "anxiety"], "awake all night": ["overthinking", "anxiety"],
    "wide awake": ["overthinking", "anxiety"], "tossing and turning": ["overthinking", "anxiety"], "neend nahi": ["overthinking", "anxiety"],
    "thinking": ["overthinking"], "thoughts": ["overthinking", "anxiety"], "ruminate": ["overthinking"],
    "mind wont stop": ["overthinking", "anxiety"], "cant stop thinking": ["overthinking", "anxiety"],
    "sochta": ["overthinking"], "soch": ["overthinking"],
    // numb / empty
    "numb": ["depression"], "empty": ["depression", "spiritual", "purpose"], "hollow": ["depression", "spiritual"],
    "feel nothing": ["depression"], "feeling nothing": ["depression"], "feel empty": ["depression"], "dont feel anything": ["depression"],
    "nothing matters": ["depression", "purpose"], "no energy": ["depression", "burnout"], "no motivation": ["depression", "burnout"],
    "udaas": ["depression", "grief"], "udas": ["depression", "grief"], "nirash": ["depression"], "nirasha": ["depression"],
    "mann nahi lagta": ["depression"], "sad": ["depression", "grief"], "sadness": ["depression", "grief"], "low": ["depression"],
    // money
    "salary": ["financial"], "rent": ["financial"], "loan": ["financial"], "emi": ["financial"], "debt": ["financial"],
    "bills": ["financial"], "paycheck": ["financial"], "savings": ["financial"], "expenses": ["financial"], "income": ["financial"],
    "cant afford": ["financial"], "paisa": ["financial"], "paise": ["financial"], "udhar": ["financial"], "karz": ["financial"],
    "karza": ["financial"], "kamai": ["financial"], "jobless": ["financial", "purpose"], "unemployed": ["financial", "purpose"],
    "laid off": ["financial", "workplace"], "fired": ["financial", "workplace"],
    // exams and results
    "marks": ["fear_of_failure"], "result": ["fear_of_failure"], "interview": ["fear_of_failure", "anxiety"], "exams": ["fear_of_failure"],
    "exam": ["fear_of_failure"], "viva": ["fear_of_failure"], "boards": ["fear_of_failure"], "jee": ["fear_of_failure"],
    "neet": ["fear_of_failure"], "upsc": ["fear_of_failure"], "placement": ["fear_of_failure", "anxiety"], "rank": ["fear_of_failure"],
    "failed": ["fear_of_failure"], "failing": ["fear_of_failure"], "deadline": ["burnout", "fear_of_failure"], "assignment": ["burnout", "fear_of_failure"],
    "studies": ["fear_of_failure", "burnout"], "study": ["fear_of_failure", "burnout"], "stressed": ["anxiety", "burnout"], "stress": ["anxiety", "burnout"],
    // work
    "manager": ["workplace"], "colleague": ["workplace"], "office": ["workplace", "burnout"], "promotion": ["workplace", "jealousy"],
    "overtime": ["burnout"], "workload": ["burnout"], "thak gaya": ["burnout"], "thak gayi": ["burnout"], "thak": ["burnout"],
    "thaka": ["burnout"], "bojh": ["burnout", "depression"], "bhaari": ["burnout", "depression"],
    // fear and worry (including Hinglish)
    "tension": ["anxiety"], "pareshan": ["anxiety"], "pareshaan": ["anxiety"], "parishan": ["anxiety"], "pareshani": ["anxiety"],
    "chinta": ["anxiety"], "ghabrahat": ["anxiety"], "ghabra": ["anxiety"], "darr": ["anxiety", "fear_of_failure"],
    "dar lagta": ["anxiety", "fear_of_failure"], "dar": ["anxiety"], "worried": ["anxiety"], "worry": ["anxiety"], "afraid": ["anxiety"],
    "panicking": ["anxiety"], "uneasy": ["anxiety"], "on edge": ["anxiety"], "bechain": ["anxiety"], "bechaini": ["anxiety"],
    // lonely
    "akela": ["loneliness"], "akeli": ["loneliness"], "akelapan": ["loneliness"], "tanha": ["loneliness"], "tanhai": ["loneliness"],
    "no one": ["loneliness"], "nobody": ["loneliness"], "by myself": ["loneliness"], "left out": ["loneliness", "social_anxiety"],
    "no one understands": ["loneliness"], "isolated": ["loneliness"],
    // love
    "pyaar": ["heartbreak"], "pyar": ["heartbreak"], "dil toot": ["heartbreak"], "dil tut": ["heartbreak"], "dil toota": ["heartbreak"],
    "girlfriend": ["heartbreak"], "boyfriend": ["heartbreak"], "relationship": ["heartbreak"], "split up": ["heartbreak"],
    "left me": ["heartbreak", "loneliness"], "break up": ["heartbreak"], "dhokha": ["heartbreak", "anger"], "cheat": ["heartbreak", "anger"],
    // anger
    "ghussa": ["anger"], "gussa": ["anger"], "krodh": ["anger"], "ghusse": ["anger"], "irritable": ["anger"], "snap": ["anger"],
    // guilt and shame
    "guilty": ["guilt"], "sorry": ["guilt"], "apologise": ["guilt"], "apologize": ["guilt"], "wrong thing": ["guilt"], "what i said": ["guilt"],
    "what i did": ["guilt"], "hurt someone": ["guilt"], "galti": ["guilt"], "maafi": ["guilt"], "maaf": ["guilt"], "sharam": ["guilt", "social_anxiety"],
    "ashamed": ["guilt", "social_anxiety"], "regret": ["guilt"], "regrets": ["guilt"],
    // comparison
    "comparing": ["jealousy", "imposter"], "compare": ["jealousy", "imposter"], "everyone else": ["jealousy", "imposter"],
    "instagram": ["jealousy"], "jalan": ["jealousy"], "jalna": ["jealousy"], "behind": ["jealousy", "fear_of_failure"], "better than me": ["jealousy", "imposter"],
    // self-doubt
    "not enough": ["imposter", "perfectionism"], "dont deserve": ["imposter", "depression"], "deserve": ["imposter"], "cheating my way": ["imposter"],
    "found out": ["imposter"], "self doubt": ["imposter"], "doubt myself": ["imposter"],
    // decisions
    "cant decide": ["overthinking"], "cannot decide": ["overthinking"], "dilemma": ["overthinking", "purpose"], "choose": ["overthinking"], "confused": ["overthinking", "purpose"],
    // purpose
    "direction": ["purpose"], "future": ["purpose", "anxiety"], "career": ["purpose", "workplace"], "pointless": ["purpose", "depression"], "meaning": ["purpose"],
    // body
    "headache": ["health", "anxiety"], "doctor": ["health"], "diagnosis": ["health"], "cancer": ["health"], "bimar": ["health"], "bimari": ["health"],
    "dard": ["health"], "chest pain": ["health", "anxiety"],
    // world and faith
    "news": ["world_chaos"], "war": ["world_chaos"], "climate": ["world_chaos"], "bhagwan": ["spiritual"], "ishwar": ["spiritual"], "god": ["spiritual"],
    "pray": ["spiritual"], "prayer": ["spiritual"], "faith": ["spiritual"],
    // people
    "awkward": ["social_anxiety"], "people judge": ["social_anxiety"], "judge me": ["social_anxiety"], "party": ["social_anxiety"], "talk to people": ["social_anxiety"],
    "perfect": ["perfectionism"], "perfectly": ["perfectionism"], "control": ["perfectionism", "anxiety"], "flaws": ["perfectionism", "imposter"],
  };
  // Family words only mean something next to a loss or a quarrel; they are not feelings alone.
  const FAMILY = "(mom|mother|mum|maa|dad|father|papa|grandfather|grandmother|grandpa|grandma|dadi|dada|nani|nana|brother|sister|friend|husband|wife|uncle|aunt|dog|cat|pet|parents)";
  const PATTERNS = [
    { re: new RegExp("\\bmiss(ing)? (my |our )?" + FAMILY + "\\b"), ids: ["grief", "loneliness"], w: 0.7 },
    { re: /\bmiss (him|her|them)\b/, ids: ["grief", "heartbreak"], w: 0.5 },
    { re: new RegExp("\\b" + FAMILY + "\\b.*\\b(died|dead|passed|death|no more|expired)\\b|\\b(died|death|lost)\\b.*\\b" + FAMILY + "\\b"), ids: ["grief"], w: 0.7 },
    { re: new RegExp("\\b(fight|fought|argu|quarrel|shout|yell|scold|snapp)\\w*\\b.*\\b" + FAMILY + "\\b|\\b" + FAMILY + "\\b.*\\b(fight|fought|argu|quarrel|shout|yell|scold|ignor)\\w*"), ids: ["anger", "heartbreak"], w: 0.5 },
    { re: /\b(feel|feeling|feels|is|am|im) (nothing|empty|numb|hollow|dead inside)\b/, ids: ["depression"], w: 0.6 },
    { re: /\bnothing (feels|seems) (real|right|worth)\b|\bdont (feel|care about) anything\b|\bcant (feel|cry)\b/, ids: ["depression"], w: 0.5 },
    { re: /\b(not enough|short|tight) (money|salary|income)\b|\b(money|salary|income|pay) (is |was )?(not|never) (enough|sufficient)\b|\bpaisa nahi\b|\bpaise nahi\b/, ids: ["financial"], w: 0.6 },
    { re: /\bcant sleep\b|\bcannot sleep\b|\bcouldnt sleep\b|\bnot able to sleep\b|\bsleep nahi\b|\bneend nahi\b|\bawake (at|all) night\b/, ids: ["overthinking", "anxiety"], w: 0.45 },
    { re: /\bmain (bahut )?(thak|tang)\b|\bthak gay[ai]\b/, ids: ["burnout"], w: 0.6 },
    { re: /\bfeel(ing)? (so |very )?(guilty|ashamed|bad about)\b|\bi (said|did) something (wrong|stupid|bad)\b/, ids: ["guilt"], w: 0.5 },
    { re: /\bcompar(e|ing) (myself|me)\b|\b(everyone|others|they) (is|are) (doing )?(better|ahead)\b/, ids: ["jealousy", "imposter", "perfectionism"], w: 0.5 },
    { re: /\bfeel(ing)? alone\b|\balone in\b|\bno one (to talk|cares|understands)\b|\bakela feel\b/, ids: ["loneliness"], w: 0.5 },
  ];
  const WEIGHTS = [0.5, 0.32, 0.2];
  const FEELING_WORDS = new Set(["sad", "anxious", "angry", "happy", "depressed", "worried", "scared", "afraid", "lonely", "tired",
    "stressed", "upset", "guilty", "jealous", "nervous", "hopeless", "panic", "anxiety", "depression", "fear", "furious",
    "exhausted", "overwhelmed", "alone", "empty", "numb", "low"]);

  const synKeys = Object.keys(SYNONYMS).map(k => ({ key: k, st: stemmedPhrase(k), ids: SYNONYMS[k] }));

  // ---- Index -------------------------------------------------------------
  function addTerms(counts, text, weight) {
    for (const t of tokens(text)) counts.set(t, (counts.get(t) || 0) + weight);
  }
  function addStrong(set, text) { for (const t of tokens(text)) set.add(t); }
  function buildIndex(archetypes) {
    const docs = archetypes.map(a => {
      const c = new Map();
      addTerms(c, (a.keywords || []).join(" "), 4);
      addTerms(c, a.title, 3);
      if (a.phase1) addTerms(c, [a.phase1.acknowledgment, a.phase1.question1, a.phase1.question2, (a.phase1.quickPills || []).join(" ")].join(" "), 1);
      const p2 = a.phase2 || {};
      addTerms(c, [p2.synthesis, p2.vedicDiagnosis && p2.vedicDiagnosis.meaning].join(" "), 1);
      if (p2.shloka) addTerms(c, [p2.shloka.translation, p2.shloka.insight].join(" "), 1);
      return { id: a.id, counts: c };
    });
    const df = new Map();
    for (const d of docs) for (const t of d.counts.keys()) df.set(t, (df.get(t) || 0) + 1);
    const N = docs.length;
    const idf = new Map();
    for (const [t, n] of df) idf.set(t, Math.log(1 + N / n));
    const vectors = docs.map(d => {
      const v = new Map(); let norm = 0;
      for (const [t, n] of d.counts) { const w = (1 + Math.log(n)) * idf.get(t); v.set(t, w); norm += w * w; }
      return { id: d.id, v, norm: Math.sqrt(norm) || 1 };
    });
    const vocab = new Set(idf.keys());
    for (const s of synKeys) for (const w of s.st.split(" ")) vocab.add(w);
    // terms the library or the synonym map names on purpose; words found only in prose count for less
    const strong = new Set();
    for (const a of archetypes) addStrong(strong, (a.keywords || []).join(" ") + " " + a.title);
    for (const s of synKeys) for (const w of s.st.split(" ")) strong.add(w);
    return { vectors, idf, vocab, strong, ids: archetypes.map(a => a.id) };
  }

  // Replace unknown words that are one or two typos away from a word we know.
  function correct(toks, index) {
    return toks.map(t => {
      if (index.vocab.has(t) || t.length < 5) return t;
      const max = t.length >= 8 ? 2 : 1;
      let best = null, bestD = max + 1;
      for (const w of index.vocab) {
        if (w[0] !== t[0] || w.length < 4) continue;
        const d = editDistance(t, w, max);
        if (d < bestD) { best = w; bestD = d; }
      }
      return best || t;
    });
  }

  // Feeling words right after "not"/"never" are dropped: "I am not sad" is not sadness.
  function dropNegated(words) {
    const out = words.slice();
    for (let i = 0; i < out.length; i++) {
      if (i > 0 && NEG.has(words[i - 1]) && FEELING_WORDS.has(words[i])) out[i] = "";
    }
    return out.filter(Boolean);
  }

  function rank(text, index) {
    const clean = dropNegated(normalize(text).split(" ")).join(" ");
    const qt = correct(tokens(clean), index);
    const q = new Map();
    for (const t of qt) q.set(t, (q.get(t) || 0) + 1);
    let qnorm = 0;
    for (const [t, n] of q) { const w = (1 + Math.log(n)) * (index.idf.get(t) || 0) * (index.strong.has(t) ? 1 : 0.5); q.set(t, w); qnorm += w * w; }
    qnorm = Math.sqrt(qnorm);

    const boost = {};
    const add = (ids, w) => ids.forEach((id, i) => { boost[id] = (boost[id] || 0) + w * (WEIGHTS[i] || 0.1) / WEIGHTS[0]; });
    // synonyms see the text as typed (negations and stop words included), stemmed
    const stemmed = " " + clean.split(" ").map(stem).join(" ") + " ";
    for (const s of synKeys) if (stemmed.includes(" " + s.st + " ")) add(s.ids, WEIGHTS[0]);
    for (const p of PATTERNS) if (p.re.test(clean)) add(p.ids, p.w);

    const hasStrong = qt.some(t => index.strong.has(t)) || Object.keys(boost).length > 0;
    const out = index.vectors.map(d => {
      let dot = 0;
      if (qnorm) for (const [t, w] of q) { const dv = d.v.get(t); if (dv) dot += w * dv; }
      const cos = (qnorm ? dot / (qnorm * d.norm) : 0) * (hasStrong ? 1 : 0.5);
      const score = Math.min(1, cos * 1.6 + Math.min(0.85, boost[d.id] || 0));
      return { id: d.id, score: Math.round(score * 1000) / 1000 };
    });
    return out.sort((a, b) => b.score - a.score);
  }

  // ---- Crisis (also used by dialogue.detectCrisis) ------------------------------
  const CRISIS = [
    /\bsuicid/, /\bkill(ing)? my ?self\b/, /\bend(ing)? (my|this) life\b/, /\bend it all\b/, /\bending it\b/,
    /\btake my (own )?life\b/, /\bself[- ]?harm/, /\bhurt(ing)? my ?self\b/, /\bcut(ting)? my ?self\b/,
    /\b(dont|do not|no longer) want to (live|be alive|exist|be here)\b/, /\bwant to die\b/, /\bwant to be dead\b/,
    /\bbetter off dead\b/, /\bno reason to (live|go on)\b/, /\bnot worth living\b/, /\blife (is|isnt|is not) worth (it|living)\b/,
    // passive ideation
    /\b(what is|whats|what s) the point (of|in) (living|life|going on|being alive|existing|it all|carrying on)\b/,
    /\b(no|zero) point (in|of|to) (living|life|going on|being alive|existing|carrying on)\b/,
    /\bwhy (should|do|would) i (even )?(live|go on|stay alive|keep living|carry on|exist)\b/,
    /\bwhy am i (even )?(alive|here living)\b/,
    /\bwish (i|that i) (was|were|am) (dead|gone|never born)\b/, /\bwish i (could )?(just )?(disappear|vanish|die|not wake up|never wake up)\b/,
    /\b(dont|do not) want to wake up\b/, /\bnothing (left )?to live for\b/, /\bcant go on\b/, /\bcannot go on\b/,
    /\bwant to disappear\b/, /\b(better|happier) off without me\b/, /\beveryone would be better\b/,
    /\bhang myself\b/, /\bjump off\b/, /\boverdose\b/, /\bkill me\b/,
    /\bmar jan[ae]\b/, /\bmarna chah/, /\bjeene ka (mann|man) nahi\b/, /\bjeena nahi chah/, /\bkhud ko khatam\b/, /\bapni jaan\b/,
  ];
  function isCrisis(text) {
    const t = String(text || "").toLowerCase().replace(/[’']/g, "");
    return CRISIS.some(re => re.test(t));
  }

  // ---- Intent ------------------------------------------------------------
  const ASIDE_HINT = /\b(change|update|set|rename)\b.*\bname\b|\b(sign|log) ?(me )?(out|off)\b|\blogout\b|\bdelete (my )?(account|data)\b|\b(change|reset|update) (my )?password\b|\b(export|download) (my )?(data|journal)\b|\b(dark|light|white|night) (mode|theme)\b|\b(volume|mute|unmute)\b/;
  const GREET = /^(hi+|hello+|hey+|heya|hey there|hi there|hello there|namaste|namaskar|pranam|hare krishna|radhe radhe|jai shri krishna|jai shree krishna|sup|yo|good (morning|afternoon|evening|night)|gm)( (krishna|saarthi|sir|ji|there|everyone|friend))?$/;
  const HOWARE = /^(how are you|how are you doing|how r u|how do you do|hows it going|how is it going|whats up|how have you been|kaise ho|kya haal hai|how are you today|and you|how about you|are you ok|are you okay)( (krishna|today|ji|saarthi))?$/;
  const GRATITUDE = /\b(thank you|thanks|thankyou|thx|shukriya|dhanyavad|dhanyawad|dhanyavaad|blessings)\b|^(that|this|it) (helps|helped|was helpful|is helpful)\b|\bhelped me\b|\bi feel better (now )?(thanks|thank)/;
  const AFFIRM = /^(yes|yeah|yep|yup|ya|yea|haan|haa|han|ji|ji haan|sure|right|true|exactly|correct|i do|i did|i think so|a bit|a little|a little bit|somewhat|kind of|sort of|definitely|absolutely|of course|i guess|i guess so|please|mostly|sometimes|very much|yes please|a lot|quite a bit)$/;
  const DENY = /^(no|nope|nah|not really|not at all|nahi|nahin|na|no not really|never|i dont think so|not much|not yet|no thanks|i dont)$/;
  const FILLER = /^(ok|okay|ok then|hm+|hmm+|um+|uh+|umm+|idk|i dont know|dont know|not sure|maybe|perhaps|whatever|fine|alright|i see|oh|oh ok|oh okay|well|so|and|k|kk|cool|nice|lol|haha|continue|go on|tell me more|good|great|hmm ok|hmm okay)$/;
  const VERSE_Q = /\b(what|which) (does|do|did) (that|this|the) (verse|shloka|sloka|line|teaching|passage) (mean|say|teach)\b|\bexplain (that|this|the|it)( verse| shloka| sloka| line)?\b|\bwhat does (that|this|it) mean\b|\btell me more\b|\bmore about (that|this|it)\b|\bwhat do you mean\b|\bmeaning of (that|this|the verse)\b|\bwhy (this|that) verse\b|\bhow (does|do) (that|this|it) (help|apply|relate)\b|\bwhat is the meaning\b|\bcan you (explain|elaborate|clarify)\b|\belaborate\b|\bsay (that|it) (again|simply)\b|\bin simple (words|terms)\b|\bi dont (understand|get) (that|this|it)\b|\bwhat is this verse\b|\bwho said (that|this)\b/;
  const DOUBT = /^(but |and )?(what if|how if|how can|will it|will this|is it|does it) .*\b(fail|work|helps?|enough|again|still|wrong|worse)\b|^(but|and) (what|how|why|if)\b/;
  const GITA_TERMS = "gita|geeta|bhagavad|bhagwad|bhagavadgita|krishna|arjuna|karma|dharma|atman|atma|soul|yoga|bhakti|jnana|gyan|gyaan|moksha|moksh|maya|guna|gunas|sattva|rajas|tamas|kurukshetra|detachment|non attachment|nonattachment|surrender|sharanagati|equanimity|ego|desire|verse|shloka|sloka|chapter|samsara|nishkama|brahman|mahabharata|sanjaya|vyasa|pandava|kaurava";
  const GITA_TERM_RE = new RegExp("\\b(" + GITA_TERMS + ")\\b");
  const GITA_CUE = /^(what|who|why|how|explain|define|describe|tell me|can you|could you|meaning|which|where|when|is|are|was|does|did|do you|give me|teach me|summar)|\b(mean|means|meaning|explain|explanation|about|say|says|teach|teaches)\b/;
  const GITA_REF = /\bchapter\s*\d{1,2}\b|\bbg\s*\d{1,2}[ .:]\d{1,3}\b|\b\d{1,2}\s*[.:]\s*\d{1,3}\b.*\b(verse|shloka|gita)\b|\b(verse|shloka)\b.*\b\d{1,2}\s*[.:]\s*\d{1,3}\b|\bhow many (chapters|verses|shlokas)\b/;
  const PERSONAL = /^(what|how|why) (should|do|can|could|would|am|will|did) (i|we)\b|^(what|why) if i\b|^why (am|do|does|is|are) (i|my|everyone|nobody|no one|people)\b/;
  const FEEL_OPENER = /\b(i feel|i am|im|i have|ive|i keep|i cant|i dont|feeling|i hate|i miss|i fear)\b/;
  const OFFTOPIC = [
    /\b(weather|temperature|forecast|raining|humid)\b/, /\b(joke|riddle|funny|meme|poem|song|lyrics|movie|film|series|netflix|recipe|cook|pizza|biryani)\b/,
    /\b(cricket|football|soccer|ipl|score|match|tennis|hockey|nba|fifa|world cup|kohli|dhoni|olympic)\b/,
    /\b(stock|stocks|share price|bitcoin|crypto|nifty|sensex|gold rate|petrol|dollar rate|exchange rate)\b/,
    /\b(python|javascript|java|html|css|sql|code|coding|program|programming|script|function|bug|algorithm|excel|github)\b/,
    /\b(president|prime minister|election|minister|modi|trump|capital of|population of|who invented|who discovered|how far is|distance to)\b/,
    /\b(translate|calculate|solve|convert|spell|essay|homework|draw|generate)\b/, /\bwrite (me )?(a|an|some|the)\b/,
    /\b(what|whats) (is )?(the )?(time|date|day)( today| now)?\b/, /\b(flight|train|ticket|hotel|restaurant|near me|directions?)\b/,
    /\d+\s*(\+|-|\*|\/|x|×|plus|minus|times|divided by|multiplied by)\s*\d+/, /^(what is|whats) \d/,
    /\b(chatgpt|siri|alexa)\b/,
  ];
  const GENERAL_Q = /^(what|who|when|where|which|how many|how much|how to|can you|could you|write|tell me|give me|show me|define|calculate|solve|translate|is it true|do you know)\b/;
  const GOOD_NEWS = [
    /\bi (got|have got|received|landed|secured|earned) (the |a |an |my )?(job|offer|promotion|promoted|selected|admission|seat|place|scholarship|visa|raise|internship|results?|engaged|married|better|call|in|into|distinction|first)\b/,
    /\bi (passed|cleared|won|aced|topped|qualified|finished|completed|made it|did it)\b/, /\b(got|am|was|been) (selected|promoted|hired|accepted|admitted|engaged)\b/,
    /\bgood news\b/, /\bi am (so |really |very |extremely )?(happy|glad|excited|proud|relieved|grateful|thrilled|good|great|fine|blessed)\b/,
    /\bim (so |really |very |extremely )?(happy|glad|excited|proud|relieved|grateful|thrilled|good|great|fine|blessed)\b/,
    /\bi feel (so |really |very )?(happy|good|great|better|calm|peaceful|lighter|relieved|hopeful|blessed|wonderful)\b/,
    /\bfeeling (so |really |very )?(good|great|happy|better|calm|peaceful|wonderful)\b/, /\b(things|life|everything) (is|are) (going )?(good|well|great|better|fine)\b/,
    /\bmy (exam|exams|interview|results?|day|presentation|surgery|trip|week) (went|was|is|were) (well|good|great|fine|better|amazing)\b/, /\bdoing (well|great|good|better)\b/,
  ];
  const BUT = /\b(but|however|though|except|still|yet|although)\b/;
  const NOT = /\b(not|nt|never|no)\b/;

  // Which kind of message is this? Crisis first, then requests, then conversation, then feelings.
  // index is optional (an Understand index); without it the library's own archetypes are used.
  function intent(text, session, index) {
    const raw = String(text || "").trim();
    const t = normalize(raw);
    const s = session || {};
    if (!t) return { type: "unclear", detail: {} };
    if (isCrisis(raw)) return { type: "crisis", detail: {} };
    if (ASIDE_HINT.test(t)) return { type: "aside", detail: {} };

    const words = t.split(" ").length;
    const rest = t.replace(/^(hi+|hello+|hey+|namaste|good (morning|afternoon|evening))[ ,]+(?=how|whats|kaise|kya)/, "");
    if (s.lastVerse && (VERSE_Q.test(t) || (DOUBT.test(t) && (s.phase || 0) >= 2))) return { type: "verse_question", detail: {} };
    if (GREET.test(t)) return { type: "greeting", detail: { sub: /morning/.test(t) ? "morning" : /afternoon/.test(t) ? "afternoon" : /evening/.test(t) ? "evening" : /night/.test(t) ? "night" : "hello" } };
    if (HOWARE.test(rest)) return { type: "greeting", detail: { sub: "howareyou" } };
    if (GRATITUDE.test(t) && words <= 8 && !BUT.test(t)) return { type: "gratitude", detail: {} };
    if (AFFIRM.test(t)) return { type: "affirm", detail: {} };
    if (DENY.test(t)) return { type: "deny", detail: {} };
    if (FILLER.test(t)) return { type: "filler", detail: {} };

    const ix = index || defaultIndex();
    const top = ix ? rank(raw, ix)[0] : { id: null, score: 0 };
    const feels = top.score >= MIN_SCORE;
    const lower = raw.toLowerCase();

    if (!BUT.test(t) && !NOT.test(t) && words <= 14 && GOOD_NEWS.some(re => re.test(t))) return { type: "good_news", detail: {} };
    const asksAbout = GITA_REF.test(lower) || (GITA_TERM_RE.test(t) && GITA_CUE.test(t));
    if (asksAbout && !PERSONAL.test(t) && !(FEEL_OPENER.test(t) && !/^(what|who|why|how|explain|tell|define)\b/.test(t))) {
      return { type: "gita_question", detail: {} };
    }
    if ((!feels || top.score < 0.3) && OFFTOPIC.some(re => re.test(t) || re.test(lower))) return { type: "offtopic", detail: {} };
    if (!feels && GENERAL_Q.test(t) && !PERSONAL.test(t) && !GITA_TERM_RE.test(t)) {
      return { type: "offtopic", detail: {} };
    }
    if (feels) return { type: "feeling", detail: { id: top.id, score: top.score } };
    return { type: "unclear", detail: {} };
  }

  let cachedIndex = null;
  function defaultIndex() {
    if (cachedIndex) return cachedIndex;
    let lib = null;
    try { if (typeof module !== "undefined" && module.exports) lib = require("./curated_wisdom.js").WISDOM_ARCHETYPES; } catch (e) { /* not available */ }
    if (!lib && typeof root.WISDOM_ARCHETYPES !== "undefined") lib = root.WISDOM_ARCHETYPES;
    if (lib) cachedIndex = buildIndex(lib);
    return cachedIndex;
  }

  const api = { MIN_SCORE, SYNONYMS, buildIndex, rank, intent, isCrisis, normalize, stem, tokens };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Understand = api;
})(typeof window !== "undefined" ? window : globalThis);
