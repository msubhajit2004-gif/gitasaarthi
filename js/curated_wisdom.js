// ============================================================================
// GitaSaarthi - Curated Wisdom Knowledge Base (100% Offline & Private)
// 20+ Mental Health Archetypes + 31 Daily Shlokas with 2-Step Dialogue Framework
// ============================================================================

const WISDOM_ARCHETYPES = [
  {
    id: "burnout",
    title: "Burnt Out & Overworked",
    icon: "⏳",
    keywords: ["burnout", "burnt out", "overworked", "exhausted", "tired", "too much work", "drained", "overwhelmed", "deadline", "hustle", "work pressure", "grind"],
    phase1: {
      acknowledgment: "Pranama, noble soul. I see the heavy fatigue in your limbs and the quiet exhaustion in your spirit. When the chariot of life is driven without rest, even the mightiest warrior falters.",
      question1: "What specific responsibilities or expectations are overwhelming your schedule today?",
      question2: "Why do you feel unable to lay down this burden, even for a single breath?",
      quickPills: [
        "Unrealistic deadlines & infinite to-do lists",
        "Fear that stopping means falling behind",
        "Difficulty saying 'no' to others",
        "Tying my entire self-worth to productivity",
        "Physical and emotional depletion"
      ]
    },
    phase2: {
      synthesis: "You carry this exhaustion because your soul is striving to control every outcome, treating every task as an urgent decree of survival.",
      vedicDiagnosis: {
        term: "Phala-Sakti (फल-सक्ति / Result Attachment) & Nishkama Deficit",
        meaning: "When every labor is tied to anxious craving for future validation, the mind is starved of vitality. You become an anxious prisoner of outcomes rather than a graceful master of action."
      },
      shloka: {
        reference: "Bhagavad Gita 2.47",
        sanskrit: "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।\nमा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि॥",
        transliteration: "karmaṇy evādhikāras te mā phaleṣu kadācana |\nmā karma-phala-hetur bhūr mā te saṅgo 'stv akarmaṇi ||",
        translation: "You have a sacred right to perform your prescribed duty, but never to the fruits of action. Never let the fruits be your motive, nor let your attachment lead to inaction.",
        insight: "Lord Krishna counsels Arjuna that labor itself becomes a sanctuary when uncoupled from obsessive calculation of outcomes. Rest is not neglect; it is the sacred maintenance of the sacred instrument."
      },
      cbtPractice: {
        title: "The Circle of Control (CBT Action Partitioning)",
        steps: [
          "Step 1 (Cognitive Audit): Write down the 5 heaviest tasks burning your mind right now.",
          "Step 2 (Locus Partition): Draw a line down a page. On the left, list what is 100% in your hands right now (your effort, your breath). On the right, list what belongs to the cosmos (others' opinions, future outcomes, timelines).",
          "Step 3 (Sacred Surrender): Consciously cross out the right column and say: 'My duty is only to this present breath and effort; the fruit belongs to the cosmos.'",
          "Step 4 (Micro-Rest): Step away from all screens for 5 unbroken minutes. Drink water slowly with full awareness."
        ]
      },
      closingCheckin: "Does this shift some weight from your shoulders, my dear friend? Tell me how your breath feels right now."
    }
  },
  {
    id: "anxiety",
    title: "Anxious & Racing Mind",
    icon: "🌪️",
    keywords: ["anxious", "anxiety", "racing mind", "panic", "overthinking", "nervous", "fearful", "restless", "heart racing", "chest tight", "future", "what if", "scared"],
    phase1: {
      acknowledgment: "Pranama. I hear the restless gale howling through your mind. Like a ship caught in a fierce tempest on the ocean, the mind when swept by agitated senses loses all anchor.",
      question1: "What impending 'what if' scenario is your mind projecting with such urgency?",
      question2: "Why does your intellect feel that catastrophe is imminent if you cannot control this tomorrow?",
      quickPills: [
        "Imagining worst-case scenarios about the future",
        "Racing thoughts I cannot turn off",
        "Tightness in my chest and shallow breathing",
        "Terror of the unknown and unpredictable",
        "Feeling that disaster is around the corner"
      ]
    },
    phase2: {
      synthesis: "Your mind has wandered from the eternal present sanctuary into an imagined battlefield of tomorrow, fighting shadows that do not yet exist.",
      vedicDiagnosis: {
        term: "Chanchalatva (चञ्चलत्व / Mental Turbulence) & Maya Projection",
        meaning: "Arjuna himself confessed to Krishna: 'The mind is as difficult to bridle as the rushing wind.' Fear is the mind's illusory projection (*Maya*) of painful futures that have no present reality."
      },
      shloka: {
        reference: "Bhagavad Gita 6.26 & 6.19",
        sanskrit: "यतो यतो निश्चरति मनश्चञ्चलमस्थिरम्।\nततस्ततो नियम्यैतदात्मन्येव वशं नयेत्॥",
        transliteration: "yato yato niścarati manaś cañcalam asthiram |\ntatas tato niyamyaitad ātmany eva vaśaṁ nayet ||",
        translation: "From whatever direction the restless, unsteady mind wanders away, one must repeatedly draw it back and gently bring it under the control of the Self.",
        insight: "Krishna does not scold the mind for wandering; he urges compassionate, patient retrieval (*Abhyasa*). Like steadying a lamp in a windless place, serenity is rebuilt one single reclaimed breath at a time."
      },
      cbtPractice: {
        title: "CBT Decatastrophizing & The Lamp Anchor",
        steps: [
          "Step 1 (Name the Projection): Say aloud: 'My mind is spinning a story about tomorrow, but right now in this exact moment, I am safe.'",
          "Step 2 (The 3 Reality Questions): Ask yourself: (A) What is the absolute worst that could happen? (B) What is the most realistic outcome? (C) If the worst did occur, what internal strength or support would carry me through?",
          "Step 3 (Somatic Re-Anchoring): Place one hand on your heart and one on your abdomen. Feel the steady rhythm of life that has sustained you through every trial until this day.",
          "Step 4 (Slow Exhale): Exhale for twice the duration of your inhale to signal your autonomic nervous system to release the alarm."
        ]
      },
      closingCheckin: "Does this bring a moment of stillness to your heart? Tell me what you notice in your body right now."
    }
  },
  {
    id: "fear_of_failure",
    title: "Terrified of Failure & Exam Stress",
    icon: "🎯",
    keywords: ["failure", "exam", "test", "fail", "grades", "competition", "interview", "performance", "not good enough", "terrified of failure", "results", "disappointment"],
    phase1: {
      acknowledgment: "Pranama. The arena of trial stands before you, and fear casts a long shadow across your courage. Remember, even the greatest archer Arjuna trembled and dropped his bow on the threshold of Kurukshetra.",
      question1: "What test, interview, or evaluation is causing this terror of falling short?",
      question2: "Why do you equate the score or verdict of this test with your fundamental worth as a human being?",
      quickPills: [
        "Upcoming exams or critical career interviews",
        "Fear of disappointing my parents or family",
        "Comparison with peers who seem ahead",
        "Dread that a single failure will ruin my future",
        "Paralysis that prevents me from even studying"
      ]
    },
    phase2: {
      synthesis: "You have attached your identity, dignity, and future happiness to a singular temporal milestone, mistaking an event for your soul's entire destiny.",
      vedicDiagnosis: {
        term: "Adhyasa (अध्यास / Superimposition of Worth) & Phala-Bhiti",
        meaning: "Superimposing your immortal, radiant worth onto an external scorecard creates existential terror. An exam tests only prepared data, never the boundless divine spark within you."
      },
      shloka: {
        reference: "Bhagavad Gita 2.38 & 2.48",
        sanskrit: "योगस्थः कुरु कर्माणि सङ्गं त्यक्त्वा धनञ्जय।\nसिद्ध्यसिद्ध्योः समो भूत्वा समत्वं योग उच्यते॥",
        transliteration: "yoga-sthaḥ kuru karmāṇi saṅgaṁ tyaktvā dhanañjaya |\nsiddhy-asiddhyoḥ samo bhūtvā samatvaṁ yoga ucyate ||",
        translation: "Perform your prescribed duty poise-established in Yoga, abandoning attachment, O Dhananjaya. Remain completely equanimous in success and failure; for equanimity alone is called Yoga.",
        insight: "True mastery (*Yoga*) is unwavering composure regardless of victory or defeat. When you surrender the desperate obsession with winning, the energy wasted on panic returns to fuel your focus."
      },
      cbtPractice: {
        title: "CBT Cognitive Reframing: Event vs. Identity",
        steps: [
          "Step 1 (Cognitive Disentanglement): Write: 'Failure is an event in time, not a character flaw. A test evaluates current preparation, not my intrinsic worth.'",
          "Step 2 (The 5-Year Horizon): Ask: 'Five years from today, will this one exam define my capacity to love, create, and be kind?' It will be a small pebble in the river of your journey.",
          "Step 3 (Chunking the Duty): Break your preparation into a tiny, non-intimidating 25-minute block. Commit only to this single block with full heart, dedicating the effort to learning rather than outcome.",
          "Step 4 (Affirmation): Recite: 'I am the conscious warrior, not the scorecard.'"
        ]
      },
      closingCheckin: "Does this release the grip of judgment on your mind? Share what feels lighter now."
    }
  },
  {
    id: "heartbreak",
    title: "Heartbreak & Loneliness",
    icon: "💔",
    keywords: ["heartbreak", "breakup", "lonely", "loneliness", "abandoned", "rejection", "rejected", "dumped", "ex", "unloved", "broken heart", "cheated"],
    phase1: {
      acknowledgment: "Pranama. The heart bleeds with a sorrow that words can scarcely encompass when a sacred bond dissolves. In the courtyard of mortal life, attachment to transient vessels brings deep ache.",
      question1: "Whose presence or affection do you mourn the loss of today?",
      question2: "Why does their departure make you feel that you are hollow, unworthy, or forever alone?",
      quickPills: [
        "A painful breakup or shattered relationship",
        "Feeling discarded and replaced by someone I loved",
        "Deep ache of coming home to silence and emptiness",
        "Believing I will never find genuine love again",
        "Obsessively replaying past memories and regrets"
      ]
    },
    phase2: {
      synthesis: "You gave the keys to your happiness into another mortal vessel's hands, and when that vessel broke or moved away, you mistook the loss of the reflection for the loss of the sun.",
      vedicDiagnosis: {
        term: "Raga-Dvesha (राग-द्वेष / Attachment & Clinging) & Anitya",
        meaning: "All worldly unions (*Samyoga*) must eventually culminate in parting (*Viyoga*). Suffering arises not from having loved, but from demanding permanence from an impermanent world (*Anitya*)."
      },
      shloka: {
        reference: "Bhagavad Gita 2.14",
        sanskrit: "मात्रास्पर्शास्तु कौन्तेय शीतोष्णसुखदुःखदाः।\nआगमापायिनोऽनित्यास्तांस्तितिक्षस्व भारत॥",
        transliteration: "mātrā-sparśās tu kaunteya śītoṣṇa-sukha-duḥkha-dāḥ |\nāgamāpāyino 'nityās tāṁs titikṣasva bhārata ||",
        translation: "The contact of the senses with their objects gives rise to cold and heat, pleasure and pain. They are fleeting and impermanent, appearing and disappearing; endure them bravely, O descendant of Bharata.",
        insight: "Pain is a natural wave of mortal sensation, but grief becomes suffering only when we resist its passing. Krishna also reminds us in 10.20: 'I am seated in the heart of all beings.' You are never truly abandoned; the supreme beloved resides within."
      },
      cbtPractice: {
        title: "CBT Re-Parenting & Self-Compassion Re-Anchoring",
        steps: [
          "Step 1 (Radical Emotional Acceptance): Permit yourself to cry without self-shaming. Grief is love with nowhere to go; let the tears wash the eyes of the soul.",
          "Step 2 (Challenging Black-and-White Thoughts): Identify thoughts like 'I'll always be lonely' and rewrite them as: 'I am deeply hurting today, but feelings change like the seasons. Love is a quality of my own heart, not just one person.'",
          "Step 3 (Reclaim Your Inner Sanctum): Make a warm cup of tea, wrap yourself in warmth, and speak to your wounded heart as you would to a precious child: 'I am here with you. I will not abandon you.'",
          "Step 4 (Reach Out): Connect with one friend, family member, or community sanctuary to bridge the isolation."
        ]
      },
      closingCheckin: "Does this bring even a small ray of warmth to your wounded heart? Tell me how you feel."
    }
  },
  {
    id: "depression",
    title: "Hopelessness & Depression",
    icon: "🌑",
    keywords: ["depression", "hopeless", "depressed", "empty", "no point", "worthless", "numb", "darkness", "heavy", "cannot get out of bed", "crying", "unmotivated"],
    phase1: {
      acknowledgment: "Pranama. In this profound darkness, please know that you are deeply seen, cherished, and held by divine grace. In the very first chapter of the Gita, the valiant Arjuna fell weeping into his chariot seat, his spirit consumed by heavy despondency (*Vishada*).",
      question1: "What has drained the vitality and meaning from your days?",
      question2: "Why does the inner voice whisper that things will never improve?",
      quickPills: [
        "A heavy blanket of numbness and emptiness",
        "Loss of interest in everything that used to bring joy",
        "Feeling like a burden to everyone around me",
        "Struggling to find any reason or energy to get through the day",
        "A quiet despair that no one truly understands"
      ]
    },
    phase2: {
      synthesis: "Depression is not weakness of character; it is your soul's chariot collapsing under accumulated, unexpressed grief and exhaustion (*Arjuna Vishada*).",
      vedicDiagnosis: {
        term: "Tamasika Vishada (तामसिक विषाद / Soul Despondency)",
        meaning: "When *Tamas* (inertia, fog, obscurity) overpowers the intellect, it veils the soul's natural effulgence (*Sat-Chit-Ananda*) and paints reality as an eternal grey dungeon."
      },
      shloka: {
        reference: "Bhagavad Gita 2.3 & 6.5",
        sanskrit: "क्लैब्यं मा स्म गमः पार्थ नैतत्त्वय्युपपद्यते।\nक्षुद्रं हृदयदौर्बल्यं त्यक्त्वोत्तिष्ठ परन्तप॥\n\nउद्धरेदात्मनात्मानं नात्मानमवसादयेत्।\nआत्मैव ह्यात्मनो बन्धुरात्मैव रिपुरात्मनः॥",
        transliteration: "klaibyaṁ mā sma gamaḥ pārtha naitat tvayy upapadyate |\nkṣudraṁ hṛdaya-daurbalyaṁ tyaktvottiṣṭha parantapa ||\n\nuddhared ātmanātmānaṁ nātmānam avasādayet |\nātmaiva hy ātmano bandhur ātmaiva ripur ātmanaḥ ||",
        translation: "Yield not to unmanliness, O Partha! It does not befit you. Cast off this petty faint-heartedness and arise, O conqueror of foes!\n\nElevate yourself through the power of your mind; do not degrade yourself. For the mind alone is your greatest ally, and the mind alone can be your greatest enemy.",
        insight: "Krishna does not condemn Arjuna for collapsing; he stands over him with fierce, unconditional love and reminds him of the lion sleeping within. You are not the darkness; you are the awareness observing the darkness."
      },
      cbtPractice: {
        title: "CBT Behavioral Activation & The Micro-Flame",
        steps: [
          "Step 1 (The Micro-Action Rule): When despair says 'do nothing', refuse to negotiate for a massive achievement. Choose one microscopic victory: drinking one glass of water, making the bed, or opening a window to let in sunlight.",
          "Step 2 (Cognitive Externalization): Label the voice of hopelessness: 'That is the depression talking, not my true soul. It is a passing biological cloud, not the sky.'",
          "Step 3 (Somatic Sunlight): Step into the natural light for 10 minutes. Feel the warmth on your face as the cosmic blessing of Surya.",
          "Step 4 (Safety Harbor): If the pain is unbearable, reach out immediately to a trusted companion or our Safe Harbor helplines. Asking for help is an act of supreme courage."
        ]
      },
      closingCheckin: "Take a deep, gentle breath with me right now. Can you feel the quiet spark still alive within you?"
    }
  },
  {
    id: "guilt",
    title: "Guilt & Past Regrets",
    icon: "⚖️",
    keywords: ["guilt", "regret", "mistake", "shame", "remorse", "past", "forgive", "forgiveness", "bad person", "ruined", "sorry", "cannot forgive myself"],
    phase1: {
      acknowledgment: "Pranama. The shackles of yesterday are heavy when we drag them into the dawn of today. Regret proves that your moral conscience is alive, but constant self-flagellation only tortures the divine spark within you.",
      question1: "What past action, decision, or lapse in judgment continues to haunt your conscience?",
      question2: "Why do you believe that you are forever condemned by that single chapter of your journey?",
      quickPills: [
        "Hurting someone I loved through my thoughtless words or actions",
        "A terrible decision that caused irreversible consequences",
        "Wasted years, opportunities, or potential",
        "Believing I am fundamentally broken or irredeemable",
        "Inability to forgive myself even though others have"
      ]
    },
    phase2: {
      synthesis: "You are judging who you were yesterday with the wisdom you gained from the mistake today. You cannot demand current awakening from past ignorance.",
      vedicDiagnosis: {
        term: "Pashchattapa vs. Atma-Droha (Repentance vs. Self-Hatred)",
        meaning: "Genuine remorse (*Pashchattapa*) leads to redemption and positive action (*Praschitta*). But guilt that turns into self-hatred (*Atma-Droha*) is egoism disguised as humility."
      },
      shloka: {
        reference: "Bhagavad Gita 9.30-31 & 18.66",
        sanskrit: "अपि चेत्सुदुराचारो भजते मामनन्यभाक्।\nसाधुरेव स मन्तव्यः सम्यग्व्यवसितो हि सः॥\nक्षिप्रं भवति धर्मात्मा शश्वच्छान्तिं निगच्छति।\n\nसर्वधर्मान्परित्यज्य मामेकं शरणं व्रज।\nअहं त्वां सर्वपापेभ्यो मोक्षयिष्यामि मा शुचः॥",
        transliteration: "api cet su-durācāro bhajate mām ananya-bhāk |\nsādhur eva sa mantavyaḥ samyag vyavasito hi saḥ ||\nkṣipraṁ bhavati dharmātmā śaśvac-chāntiṁ nigacchati |\n\nsarva-dharmān parityajya mām ekaṁ śaraṇaṁ vraja |\nahaṁ tvāṁ sarva-pāpebhyo mokṣayiṣyāmi mā śucaḥ ||",
        translation: "Even if the most vile transgressor turns to Me with undivided devotion, they must be considered righteous, for they have rightly resolved. Swiftly they become virtuous and attain everlasting peace.\n\nAbandon all varieties of worldly burdens and surrender unto Me alone. I shall liberate you from all past sins; do not grieve!",
        insight: "Krishna extends supreme compassion without asterisks. The moment your awareness turns toward righteousness, the past is dissolved. The sun does not remember the darkness of the night."
      },
      cbtPractice: {
        title: "CBT Restorative Amends & The Forgiveness Decree",
        steps: [
          "Step 1 (Amends vs. Punishment): Ask: 'Can I make direct or indirect amends for this past deed?' If yes, take a constructive step (a sincere apology, an act of charity). If no, punishing yourself helps no one.",
          "Step 2 (The Younger Self Compassion Exercise): Visualize the person you were when you made that mistake. See their confusion, fear, or unhealed pain. Say: 'You were operating with the tools you had then. I release you into the light.'",
          "Step 3 (Living Penance / Karma-Shuddhi): Channel that sorrow into active kindness today. Let the wound become the wellspring of your empathy for other flawed humans.",
          "Step 4 (Affirmation): 'I am not my past mistakes; I am the awareness that grows beyond them.'"
        ]
      },
      closingCheckin: "Can you permit yourself to set down that stone today? Tell me how your heart responds."
    }
  },
  {
    id: "anger",
    title: "Hurt & Burning Anger",
    icon: "⚡",
    keywords: ["anger", "angry", "furious", "rage", "betrayed", "unfair", "hate", "resentment", "bitter", "revenge", "irritated", "pissed off"],
    phase1: {
      acknowledgment: "Pranama. Fire burns within your veins, and the sting of injustice is acute. Anger is like holding a hot coal with the intent of throwing it at another; it is your own palm that burns first.",
      question1: "What boundary was violated, or what perceived injustice has provoked this burning rage?",
      question2: "Why do you feel that holding on to this fury gives you protection or vindication?",
      quickPills: [
        "Betrayal or disrespect from someone I trusted",
        "Being treated unfairly at work or in my family",
        "People crossing my boundaries repeatedly",
        "Obsessive fantasies of confrontation or revenge",
        "Explosive outbursts that I later feel ashamed of"
      ]
    },
    phase2: {
      synthesis: "Your wrath is the grief of thwarted expectations. When the world refuses to bend to our script, the ego erupts in indignation to defend its hurt core.",
      vedicDiagnosis: {
        term: "Krodha & Sammoha (क्रोध & सम्मोह / The Chain of Delusion)",
        meaning: "Krishna maps the neuroscience of rage with surgical precision: Attachment breeds desire (*Kama*); thwarted desire breeds anger (*Krodha*); anger breeds delusion (*Sammoha*); delusion destroys memory and intellect (*Buddhi-nasha*)."
      },
      shloka: {
        reference: "Bhagavad Gita 2.62-63",
        sanskrit: "ध्यायतो विषयान्पुंसः सङ्गस्तेषूपजायते।\nसङ्गात्सञ्जायते कामः कामात्क्रोधोऽभिजायते॥\nक्रोधाद्भवति सम्मोहः सम्मोहात्स्मृतिविभ्रमः।\nस्मृतिभ्रंशाद्बुद्धिनाशो बुद्धिनाशात्प्रणश्यति॥",
        transliteration: "dhyāyato viṣayān puṁsaḥ saṅgas teṣūpajāyate |\nsaṅgāt sañjāyate kāmaḥ kāmāt krodho 'bhijāyate ||\nkrodhād bhavati sammohaḥ sammohāt smṛti-vibhramaḥ |\nsmṛti-bhraṁśād buddhi-nāśo buddhi-nāśāt praṇaśyati ||",
        translation: "Brooding on sensory objects causes attachment; from attachment springs craving; from thwarted craving surges wrath. From wrath arises utter delusion; from delusion comes loss of memory; from loss of memory, the intellect is ruined; and with the ruin of intellect, a person is lost.",
        insight: "Krishna warns that anger does not hurt your enemy half as much as it ruins your own clarity (*Buddhi*). The highest victory is not conquering another, but reigning supreme over your own inner kingdom."
      },
      cbtPractice: {
        title: "CBT Emotional De-Escalation & Assertive Boundary",
        steps: [
          "Step 1 (The 90-Second Neurochemical Pause): Recognize that anger is a physical adrenaline surge that peaks and subsides in 90 seconds if not refueled by angry narratives. Step away physically.",
          "Step 2 (The Underlying Primary Emotion): Ask: 'Underneath this fire, what is the tender wound? Is it sadness, hurt, embarrassment, or fear?' Name that soft emotion.",
          "Step 3 (Clear Boundary without Poison): Transform toxic wrath into cool, firm boundary setting. Instead of exploding, state clearly: 'I will not accept being spoken to or treated this way.'",
          "Step 4 (Exhale the Ash): Inhale deeply, clench your fists tightly, and then exhale with a powerful sigh while opening your hands wide, releasing the coal."
        ]
      },
      closingCheckin: "Has the boiling water in your mind cooled enough to see the bottom of the lake? How does your chest feel?"
    }
  },
  {
    id: "purpose",
    title: "Lost My Purpose & Aimless",
    icon: "🧭",
    keywords: ["purpose", "aimless", "lost", "meaning", "empty life", "what am i doing", "career direction", "existential", "midlife", "directionless", "why am i here"],
    phase1: {
      acknowledgment: "Pranama. To stand at the crossroads without a compass is a disorienting trial. Yet, feeling lost is often the first sacred awakening that your old superficial scripts have outlived their truth.",
      question1: "In what domain of life—career, vocation, or spirit—do you feel most adrift?",
      question2: "Why do you feel that your unique gifts and path are insufficient compared to societal standards?",
      quickPills: [
        "Trapped in a career that feels utterly devoid of meaning",
        "Constantly comparing my progress to others on social media",
        "Paralyzed by too many choices and fear of choosing wrong",
        "Feeling that I have no special talent or calling",
        "Waking up feeling numb to routine tasks"
      ]
    },
    phase2: {
      synthesis: "You feel lost because you have been wearing another person's armor and attempting to fight their battle, abandoning your authentic internal resonance.",
      vedicDiagnosis: {
        term: "Svadharma Abandonment (स्वधर्म त्याग)",
        meaning: "Trying to perform an unnatural role out of social prestige produces perpetual friction and spiritual starvation. Your duty must flow from your innate psychological constitution (*Svabhava*)."
      },
      shloka: {
        reference: "Bhagavad Gita 3.35 & 18.47",
        sanskrit: "श्रेयान्स्वधर्मो विगुणः परधर्मात्स्वनुष्ठितात्।\nस्वधर्मे निधनं श्रेयः परधर्मो भयावहः॥",
        transliteration: "śreyān sva-dharmo viguṇaḥ para-dharmāt sv-anuṣṭhitāt |\nsva-dharme nidhanaṁ śreyaḥ para-dharmo bhayāvahaḥ ||",
        translation: "Far better is one's own authentic duty (*Svadharma*), even if imperfectly performed, than the duty of another well-executed. To perish in one's own natural path is blessed; but to tread another's path is fraught with fear.",
        insight: "Krishna frees us from imitation. You do not need to be world-famous or follow the herd. When you dedicate your authentic inclinations to serving life, even the humblest task becomes supreme worship."
      },
      cbtPractice: {
        title: "Values Clarification & The Ikigai-Dharma Matrix",
        steps: [
          "Step 1 (Values Extraction): Write down the 3 times in your life you felt most alive, engaged, and useful. What core values were present (e.g., creativity, kindness, teaching, building)?",
          "Step 2 (The Social Shedding): Cross off all career goals born purely of seeking praise or avoiding peer criticism.",
          "Step 3 (Micro-Dharma Today): Ask: 'What is the one small deed today that aligns with my true values?' Do it with total presence, whether cooking a wholesome meal, helping a friend, or writing one paragraph.",
          "Step 4 (Affirmation): 'I do not have to be everything; I only have to be genuinely myself.'"
        ]
      },
      closingCheckin: "Does the burden of proving yourself ease when you hear this? Tell me what stirs within."
    }
  },
  {
    id: "imposter",
    title: "Imposter Syndrome & Self-Doubt",
    icon: "🎭",
    keywords: ["imposter", "fraud", "not smart enough", "inadequate", "self-doubt", "fake", "luck", "don't belong", "unqualified", "worthless"],
    phase1: {
      acknowledgment: "Pranama. The phantom whispers that you are an imposter, waiting to be unmasked. Yet often it is the most conscientious and sincere minds that suffer this self-doubt, while the arrogant never question themselves.",
      question1: "In what role or room do you feel like a fraud who doesn't belong?",
      question2: "Why do you credit your achievements to mere luck, while attributing every setback to your personal inadequacy?",
      quickPills: [
        "Feeling out of place among highly accomplished colleagues",
        "Terrified that people will discover I'm not that talented",
        "Dismissing praise and believing I was just lucky",
        "Overworking compulsively to prevent exposure",
        "Hesitating to speak up or share my ideas"
      ]
    },
    phase2: {
      synthesis: "Your ego is playing a double game: demanding flawless perfection from you, and then condemning you when you are merely a growing, learning human.",
      vedicDiagnosis: {
        term: "Ahamkara Delusion (अहङ्कार भ्रम / Ego Identification)",
        meaning: "Both vanity ('I am superior') and imposter syndrome ('I am a fake') stem from the same root: *Ahamkara* (the ego insisting that personal credit or shame belongs solely to itself, rather than nature's divine machinery)."
      },
      shloka: {
        reference: "Bhagavad Gita 3.27 & 18.14",
        sanskrit: "प्रकृतेः क्रियमाणानि गुणैः कर्माणि सर्वशः।\nअहङ्कारविमूढात्मा कर्ताहमिति मन्यते॥",
        transliteration: "prakṛteḥ kriyamāṇāni guṇaiḥ karmāṇi sarvaśaḥ |\nahaṅkāra-vimūḍhātmā kartāham iti manyate ||",
        translation: "All actions are universally performed by the modes of material Nature (*Gunas*). But the one whose intellect is bewildered by ego thinks: 'I am the sole doer.'",
        insight: "When you realize you are an instrument (*Nimitta-Matram*) through which life acts, both the terror of fraudulence and the arrogance of pride dissolve. You don't need to 'own' perfection; you just need to participate with sincerity."
      },
      cbtPractice: {
        title: "CBT Evidence Court: Fact vs. Fraud",
        steps: [
          "Step 1 (The Courtroom Ledger): Draw two columns. Column A: Objective verifiable facts (degrees, projects finished, problems solved). Column B: Emotional accusations ('I just got lucky').",
          "Step 2 (The Friend Test): Would you tell a dear friend who achieved what you have achieved that they are an imposter? Offer yourself that exact objective decency.",
          "Step 3 (Reframe to Learner): Replace 'I must know everything' with 'I am here to learn, contribute, and grow.'",
          "Step 4 (Affirmation): 'I belong in this room, not because I am flawless, but because I am here to serve.'"
        ]
      },
      closingCheckin: "Does recognizing yourself as a growing instrument relieve that tension? Tell me what you feel."
    }
  },
  {
    id: "grief",
    title: "Grief & Loss of Loved One",
    icon: "🕯️",
    keywords: ["grief", "loss", "death", "died", "passed away", "mourning", "miss them", "lost my mother", "lost my father", "funeral", "bereavement"],
    phase1: {
      acknowledgment: "Pranama, precious soul. The physical absence of one you loved dearly leaves an echoing hollow in the soul. Let all words be quiet before the holiness of your sorrow.",
      question1: "Whose beloved presence have you had to surrender to the unseen realm?",
      question2: "What words or embraces remained unspoken when they departed?",
      quickPills: [
        "The recent loss of a parent, partner, or sibling",
        "Wrestling with things left unsaid before they left",
        "Disbelief that the world continues when they are gone",
        "Guilt that I am continuing to live while they cannot",
        "Intense waves of sadness triggered by everyday items"
      ]
    },
    phase2: {
      synthesis: "Your heart breaks because the bond was real and deep. But spiritual wisdom teaches that physical departure is only the changing of a garment, never the extinction of consciousness.",
      vedicDiagnosis: {
        term: "Shoka & Nityatva (शोक & आत्म-नित्यता / The Immortal Soul)",
        meaning: "Arjuna wept on the battlefield for the venerable elders he loved. Krishna began his divine song not with judgment, but by unveiling the eternal nature of the *Atman* that fire cannot burn and death cannot touch."
      },
      shloka: {
        reference: "Bhagavad Gita 2.20 & 2.22",
        sanskrit: "न जायते म्रियते वा कदाचिन्\nनायं भूत्वा भविता वा न भूयः।\nअजो नित्यः शाश्वतोऽयं पुराणो\nन हन्यते हन्यमाने शरीरे॥\n\nवासांसि जीर्णानि यथा विहाय\nनवानि गृह्णाति नरोऽपराणि।\nतथा शरीराणि विहाय जीर्णा\nन्यन्यानि संयाति नवानि देही॥",
        transliteration: "na jāyate mriyate vā kadācin\nnāyaṁ bhūtvā bhavitā vā na bhūyaḥ |\najo nityaḥ śāśvato 'yaṁ purāṇo\nna hanyate hanyamāne śarīre ||\n\nvāsāṁsi jīrṇāni yathā vihāya\nnavāni gṛhṇāti naro 'parāṇi |\ntathā śarīrāṇi vihāya jīrṇāny\nanyāni saṁyāti navāni dehī ||",
        translation: "The soul is never born, nor does it ever die; nor having once existed does it cease to be. Unborn, eternal, ever-existing, and primeval, it is not slain when the body is slain.\n\nJust as a person casts off worn-out garments and puts on new ones, likewise the embodied soul casts off worn-out bodies and enters new ones.",
        insight: "Love is not a biological transaction; it is an eternal spiritual chord. The love you shared with them does not rot in the soil; it remains forever living within your consciousness and in their continuing journey."
      },
      cbtPractice: {
        title: "Continuing Bonds & The Living Memorial",
        steps: [
          "Step 1 (Honor the Waves): Do not fight grief; it comes in unpredictable waves. When a wave hits, sit down, breathe, and let it wash over you without resisting.",
          "Step 2 (The Unspoken Letter): Write a letter to them expressing everything in your heart—the thanks, the sorrow, the love. Read it aloud into the quiet air; consciousness hears.",
          "Step 3 (Living Their Light): Carry forward one virtue, value, or kindness that they embodied. Make your life the living memorial to their presence.",
          "Step 4 (Affirmation): 'You are not gone; you have simply stepped into the light behind the curtain.'"
        ]
      },
      closingCheckin: "Take this moment in gentle reverence. How is your heart breathing right now?"
    }
  },
  {
    id: "jealousy",
    title: "Jealousy, Envy & Comparison",
    icon: "🌱",
    keywords: ["jealous", "envy", "jealousy", "comparing", "comparison", "they have it all", "unfair success", "envious", "everyone is doing better", "social media"],
    phase1: {
      acknowledgment: "Pranama. Envy is a silent poison that steals our joy while keeping our eyes glued to another's garden. It is natural to feel this pang when surrounded by relentless displays of others' triumphs.",
      question1: "Whose success, lifestyle, or milestone is triggering this sting of comparison?",
      question2: "Why do you believe their abundance implies a deficiency in your own destiny?",
      quickPills: [
        "Seeing peers get promoted, married, or praised",
        "Social media feeds making my daily life look pathetic",
        "Bitterness that others had advantages I was denied",
        "Feeling that life is an unfair zero-sum contest",
        "Ashamed of feeling secret delight when someone slips"
      ]
    },
    phase2: {
      synthesis: "You are looking at another's highlight reel and forgetting that every soul has its own unique debts (*Prarabdha Karma*) and trials that remain unseen beneath the surface.",
      vedicDiagnosis: {
        term: "Matsarya (मात्सर्य / Envy) & Asuya (Fault-finding)",
        meaning: "Matsarya is an illusion of scarcity. It assumes that there is only one crown in the universe, and if someone else wears it, you are left empty. In truth, the cosmos is infinite."
      },
      shloka: {
        reference: "Bhagavad Gita 4.22 & 12.13",
        sanskrit: "यदृच्छालाभसन्तुष्टो द्वन्द्वातीतो विमत्सरः।\nसमः सिद्धावसिद्धौ च कृत्वापि न निबध्यते॥",
        transliteration: "yadṛcchā-lābha-santuṣṭo dvandvātīto vimatsaraḥ |\nsamaḥ siddhāv asiddhau ca kṛtvāpi na nibadhyate ||",
        translation: "Content with whatever comes unasked, free from the dualities of life, devoid of all envy, and poised equally in success and failure—such a person, though acting, is never bound.",
        insight: "Krishna describes the enlightened being as *Vimatsara*—utterly free from envy. When you delight in another's joy (*Mudita*), you instantly double your own happiness without paying any price."
      },
      cbtPractice: {
        title: "CBT Mudita Cultivation & The Scarcity Antidote",
        steps: [
          "Step 1 (Bless the Trigger): When envy strikes, mentally whisper: 'May they be safe, happy, and continue to prosper.' This breaks the neurochemical loop of hostility.",
          "Step 2 (The Unseen Ledger): Remind yourself: 'I see their stage performance, not their private tears, hospital visits, or inner demons.' Everyone carries a cross.",
          "Step 3 (Digital Fast): Turn off social media notifications for 48 hours. Redirect your gaze to your own sacred garden.",
          "Step 4 (Audit Your Blessings): List 3 specific advantages, talents, or freedoms you enjoy that someone in the world is desperately praying for."
        ]
      },
      closingCheckin: "Does releasing the race bring a breath of freshness to your mind? Tell me what you feel."
    }
  },
  {
    id: "overthinking",
    title: "Decision Paralysis & Overthinking",
    icon: "🌀",
    keywords: ["overthinking", "indecisive", "decision", "paralysis", "cannot choose", "procrastinating", "confused", "stuck", "two minds", "what if i regret"],
    phase1: {
      acknowledgment: "Pranama. The mind is spinning in circles, weighing infinite paths until the will itself becomes frozen in quicksand. Overthinking is the illusion that you can predict all consequences before taking a single step.",
      question1: "What fork in the road is paralyzing your ability to choose?",
      question2: "Why are you demanding a 100% guarantee of safety before taking a single step forward?",
      quickPills: [
        "Career choice between safety and passion",
        "Paralyzed by fear of making the wrong commitment",
        "Analysis paralysis on minor everyday tasks",
        "Endless researching without ever starting",
        "Terror that a wrong move will permanently derail my life"
      ]
    },
    phase2: {
      synthesis: "Indecision is often the ego's disguised attempt to avoid accountability for an imperfect outcome. But stagnation is itself the most dangerous decision.",
      vedicDiagnosis: {
        term: "Bahushakha Buddhi (बहुशाखा बुद्धि / Fragmented Intellect)",
        meaning: "Krishna states that the intellect of the undecided is endless and branch-laden (*Bahu-shakha*), scattering vital energy into a thousand hypothetical rabbit holes."
      },
      shloka: {
        reference: "Bhagavad Gita 2.41",
        sanskrit: "व्यवसायात्मिका बुद्धिरेकेह कुरुनन्दन।\nबहुशाखा ह्यनन्ताश्च बुद्धयोऽव्यवसायिनाम्॥",
        transliteration: "vyavasāyātmikā buddhir ekeha kuru-nandana |\nbahu-śākhā hy anantāś ca buddhayo 'vyavasāyinām ||",
        translation: "The resolute intellect, O son of Kuru, is single-pointed and unified; but the intellects of the irresolute are endless-branched and scattered in every direction.",
        insight: "Clarity does not precede action; clarity is forged *through* action. When you make a decision in good faith and offer it to the divine, the path reveals itself as you walk."
      },
      cbtPractice: {
        title: "CBT 70% Confidence Rule & Micro-Experimentation",
        steps: [
          "Step 1 (The 70% Heuristic): Acknowledge that you will never have 100% certainty. If you have 70% data and clarity, act.",
          "Step 2 (Treat Choices as Experiments): Reframe decisions not as 'permanent life sentences', but as 'scientific hypotheses'. If option A doesn't yield fruit, you can pivot with new intelligence.",
          "Step 3 (The 5-Minute Commitment): Pick the option with the most authentic pull and take the first concrete action in under 5 minutes.",
          "Step 4 (Affirmation): 'Any decision with wholehearted effort is better than perfection in paralysis.'"
        ]
      },
      closingCheckin: "Does narrowing your focus to just the next step bring relief? Tell me how your mind feels."
    }
  },
  {
    id: "loneliness",
    title: "Deep Loneliness & Isolation",
    icon: "🌌",
    keywords: ["lonely", "alone", "isolated", "isolation", "nobody cares", "no friends", "unseen", "solitude", "outcast", "invisible"],
    phase1: {
      acknowledgment: "Pranama. In the midst of crowded cities and connected screens, feeling invisible and untouched by genuine companionship is a quiet, sharp agony.",
      question1: "Where does this feeling of deep isolation hit you most acutely?",
      question2: "Why do you feel that no one truly sees or appreciates the real person you are inside?",
      quickPills: [
        "Surrounded by acquaintances but having zero true confidants",
        "Evenings and weekends spent in cold silence",
        "Feeling fundamentally misunderstood by peers and family",
        "Hesitation to reach out because I feel like a bother",
        "A chronic sense of being an outsider everywhere"
      ]
    },
    phase2: {
      synthesis: "Loneliness is the desperate hunger of the separated soul for communion. When we look outward for mirrors, we often find distorted reflections; but your primary anchor is within.",
      vedicDiagnosis: {
        term: "Vivikta-Desha vs. Ekakitva (Sacred Solitude vs. Bitter Isolation)",
        meaning: "When solitude is empty of self-love, it feels like an icy prison. But when illuminated by spiritual presence (*Antaryamin*), solitude becomes the most sacred sanctuary of self-discovery."
      },
      shloka: {
        reference: "Bhagavad Gita 9.18 & 13.16",
        sanskrit: "गतिर्भर्ता प्रभुः साक्षी निवासः शरणं सुहृत्।\nप्रभवः प्रलयः स्थानं निधानं बीजमव्ययम्॥",
        transliteration: "gatir bhartā prabhuḥ sākṣī nivāsaḥ śaraṇaṁ suhṛt |\nprabhavaḥ pralayaḥ sthānaṁ nidhānaṁ bījam avyayam ||",
        translation: "I am the Goal, the Sustainer, the Lord, the Witness, the Abode, the Refuge, and the Supreme Friend (*Suhrid*); I am the Source, the Dissolution, the Foundation, the Storehouse, and the Imperishable Seed.",
        insight: "Lord Krishna reveals Himself not as a distant monarch, but as *Suhrid*—the eternal, unconditional intimate friend who has accompanied you through every lifetime, never leaving your side for a fraction of a second."
      },
      cbtPractice: {
        title: "CBT Reconnection Behavioral Plan & Inner Sanctuary",
        steps: [
          "Step 1 (Transform Isolation into Solitude): Light a small lamp or candle. Sit in quiet friendship with yourself. Speak to the inner Divine: 'You are with me; I am never truly alone.'",
          "Step 2 (The One Low-Stakes Connection): Send a simple 1-line text to an old acquaintance or check in on an elderly neighbor: 'Thinking of you, hope your day is peaceful.' Giving connection immediately dissolves isolation.",
          "Step 3 (Community of Purpose): Identify one local group, volunteer initiative, or spiritual gathering where shared values naturally foster friendships.",
          "Step 4 (Affirmation): 'I am connected to the vast tapestry of life. My presence matters here.'"
        ]
      },
      closingCheckin: "Does sensing this quiet inner companion soothe the coldness? Tell me how you feel."
    }
  },
  {
    id: "perfectionism",
    title: "Perfectionism & Need for Control",
    icon: "📐",
    keywords: ["perfectionist", "perfectionism", "control", "cannot make mistakes", "flawless", "obsessive", "rigid", "must be perfect", "fear of making mistake"],
    phase1: {
      acknowledgment: "Pranama. The tyranny of the flawless standard is an exhausting master. You demand absolute perfection from yourself in an imperfect world, turning every task into an ordeal.",
      question1: "What project or facet of your life are you obsessively attempting to polish to perfection?",
      question2: "What catastrophic failure do you believe will unfold if a small flaw is detected?",
      quickPills: [
        "Inability to submit work until it has been rewritten 10 times",
        "Anger when plans deviate from my exact vision",
        "Judging others harshly for minor oversights",
        "Extreme anxiety over the possibility of making a mistake",
        "Exhausting myself to maintain a flawless facade"
      ]
    },
    phase2: {
      synthesis: "Perfectionism is not the pursuit of excellence; it is the frantic pursuit of immunity from criticism. You are trying to become invulnerable so no one can hurt you.",
      vedicDiagnosis: {
        term: "Adhimatratva (अतिमात्रता / Rigid Fixation) & Ishvara-Virodha",
        meaning: "Demanding that nature obey your rigid specifications ignores that nature (*Prakriti*) is inherently dynamic and organic. True beauty includes the asymmetry of life."
      },
      shloka: {
        reference: "Bhagavad Gita 18.48 & 2.50",
        sanskrit: "सहजं कर्म कौन्तेय सदोषमपि न त्यजेत्।\nसर्वारम्भा हि दोषेण धूमेनाग्निरिवावृताः॥",
        transliteration: "saha-jaṁ karma kaunteya sa-doṣam api na tyajet |\nsarvārambhā hi doṣeṇa dhūmenāgnir ivāvṛtāḥ ||",
        translation: "One should not abandon the duty born of one's nature, O son of Kunti, even if it is accompanied by flaw; for all undertakings are covered by some imperfection, just as fire is covered by smoke.",
        insight: "What liberating words from Lord Krishna! Even fire, the purest element, produces smoke. Imperfection is baked into material existence. Sincerity of heart, not sterile perfection, is what reaches the heavens."
      },
      cbtPractice: {
        title: "CBT Exposure to Imperfection & The 85% Standard",
        steps: [
          "Step 1 (The Smoke-and-Fire Paradigm): Say to yourself: 'Like smoke in fire, a minor flaw is natural. My effort was sincere, and that is complete.'",
          "Step 2 (The 85% Rule): Intentionally complete a task to an 85% standard of excellence and press submit or release it. Notice that the world does not end.",
          "Step 3 (Reframing Mistakes as Data): When an error occurs, write: 'An error is merely data pointing the way to growth, not a moral trial.'",
          "Step 4 (Affirmation): 'I choose wholehearted presence over paralyzed perfection.'"
        ]
      },
      closingCheckin: "Can you feel the relief of dropping that impossible standard? Tell me what softens within."
    }
  },
  {
    id: "financial",
    title: "Financial Anxiety & Insecurity",
    icon: "🪙",
    keywords: ["money", "financial", "debt", "broke", "poverty", "bills", "cost of living", "job loss", "financial panic", "afford"],
    phase1: {
      acknowledgment: "Pranama. The struggle for livelihood and material security weighs heavily on the human heart. When numbers on a ledger threaten your shelter and bread, fear grips the root chakra.",
      question1: "What financial hurdle or debt is causing this knot in your stomach?",
      question2: "Why do you feel that this economic storm has stripped away all your future security?",
      quickPills: [
        "Crushing debts or loans coming due",
        "Fear of sudden job loss or unemployment",
        "Living paycheck to paycheck without any emergency cushion",
        "Comparing my financial status to wealthy peers",
        "Panic that I will not be able to provide for my loved ones"
      ]
    },
    phase2: {
      synthesis: "Your anxiety is understandable, but terror paralyzes the intellect. You must separate practical financial prudence from existential panic.",
      vedicDiagnosis: {
        term: "Artha-Bhiti (अर्थ-भीति / Material Dread) & Yoga-Kshema Lack",
        meaning: "When you believe you are the sole fragile provider navigating a hostile universe, every financial fluctuation feels like a death sentence. But you are sustained by a greater universal rhythm."
      },
      shloka: {
        reference: "Bhagavad Gita 9.22",
        sanskrit: "अनन्याश्चिन्तयन्तो मां ये जनाः पर्युपासते।\nतेषां नित्याभियुक्तानां योगक्षेमं वहाम्यहम्॥",
        transliteration: "ananyāś cintayanto māṁ ye janāḥ paryupāsate |\nteṣāṁ nityābhiyuktānāṁ yoga-kṣemaṁ vahāmy aham ||",
        translation: "For those who are constantly absorbed in Me and meditate on My cosmic reality with undivided heart, to them I personally carry what they lack (*Yoga*) and preserve what they possess (*Kshema*).",
        insight: "Krishna guarantees *Yoga-Kshema*—the provision and preservation of life's true essentials. Even when circumstances shift, your inner dignity, resourcefulness, and divine protection remain intact."
      },
      cbtPractice: {
        title: "CBT Financial Fact-Separation & Pragmatic Action",
        steps: [
          "Step 1 (The Panic vs. Fact Audit): Write down the exact numbers on paper. Often the vague monster in the head is 10 times more terrifying than the actual balance sheet.",
          "Step 2 (The 1-Step Budget): Identify one unnecessary leak you can plug, or one practical phone call you can make today to negotiate terms or seek assistance.",
          "Step 3 (Surrendering Existential Dread): Affirm: 'Money is an exchange tool, not the author of my soul. I have survived every lean season before this, and I have the wisdom to rebuild.'",
          "Step 4 (Action Over Panic): Channel the nervous energy into updating your resume, learning a marketable skill, or offering value to someone."
        ]
      },
      closingCheckin: "Does grounding in facts rather than fears bring calm to your mind? Tell me what you notice."
    }
  },
  {
    id: "health",
    title: "Health Anxiety & Physical Distress",
    icon: "🌿",
    keywords: ["health", "sick", "illness", "hypochondria", "symptoms", "body", "pain", "medical", "disease", "fear of dying", "hospital"],
    phase1: {
      acknowledgment: "Pranama. The fragility of this mortal vessel can strike terror when symptoms arise and the intellect spins tales of grim prognosis. Caring for the body is holy duty, but terror only worsens the body's strain.",
      question1: "What bodily sensation or medical uncertainty is stirring this panic?",
      question2: "Why is your mind immediately leaping to catastrophic conclusions rather than patient care?",
      quickPills: [
        "Obsessively googling bodily symptoms and diagnosing rare illnesses",
        "Living with chronic physical pain or fatigue",
        "Waiting for medical test results in terror",
        "Hyper-focusing on heart rate, breathing, or minor aches",
        "Fear of losing my physical independence or dying young"
      ]
    },
    phase2: {
      synthesis: "Your mind has fused with the physical clay. You are treating the vehicle's temporary squeak as the destruction of the eternal driver inside.",
      vedicDiagnosis: {
        term: "Deha-Atma Buddhi (देहात्म बुद्धि / Conflating Soul with Body)",
        meaning: "The body is the chariot (*Sharira*); you are the conscious sovereign riding within (*Dehi*). While the body passes through seasons of sickness and health, the observer remains untouched and pure."
      },
      shloka: {
        reference: "Bhagavad Gita 2.13 & 2.25",
        sanskrit: "देहिनोऽस्मिन्यथा देहे कौमारं यौवनं जरा।\nतथा देहान्तरप्राप्तिर्धीरस्तत्र न मुह्यति॥\n\nअव्यक्तोऽयमचिन्त्योऽयमविकार्योऽयमुच्यते।\nतस्मादेवं विदित्dividedन् नानुशोचितुमर्हसि॥",
        transliteration: "dehino 'smin yathā dehe kaumāraṁ yauvanaṁ jarā |\ntathā dehāntara-prāptir dhīras tatra na muhyati ||",
        translation: "Just as the embodied soul passes continuously in this body from childhood to youth and into old age, similarly it passes into another body at death. The steady, wise person is not bewildered by such changes.",
        insight: "Wisdom does not ignore physical medicine—we must consult physicians and take medicine diligently. But wisdom removes the poisonous overlay of dread. Your true reality is radiant, unborn awareness."
      },
      cbtPractice: {
        title: "CBT Somatic De-Escalation & Medical Boundary",
        steps: [
          "Step 1 (Stop the Digital Poison): Declare an immediate, strict ban on searching symptoms on the internet. It only triggers catastrophic adrenaline.",
          "Step 2 (The Scientific Follow-through): If a symptom persists, schedule an appointment with a real doctor. Once scheduled, tell the mind: 'The appointment is made; further worry is unproductive.'",
          "Step 3 (Body Loving-Kindness): Send gratitude to your heart, lungs, and liver that have worked tirelessly for millions of beats without asking for applause.",
          "Step 4 (Affirmation): 'I am the eternal dweller within this vessel, caring for it with love and calm.'"
        ]
      },
      closingCheckin: "Feel the calm breath flowing through your lungs right now. What does your body tell you?"
    }
  },
  {
    id: "workplace",
    title: "Workplace Conflict & Unfair Criticism",
    icon: "💼",
    keywords: ["boss", "coworker", "toxic workplace", "criticism", "office politics", "unfairly treated", "micromanaged", "disrespected at work"],
    phase1: {
      acknowledgment: "Pranama. To give your honest labor and receive hostility, malice, or unjust criticism in return is a bitter test of character.",
      question1: "What toxic interaction or unreasonable manager/peer has disturbed your peace?",
      question2: "Why do you allow their poisoned opinion to dictate your inner sense of competence and dignity?",
      quickPills: [
        "A toxic boss who takes credit for my work and belittles me",
        "Spiteful office gossip and petty politics",
        "Harsh, public criticism that felt humiliating",
        "Being passed over for a well-deserved promotion",
        "Dreading Monday morning and every interaction at work"
      ]
    },
    phase2: {
      synthesis: "You have permitted the confusion or malice of another person to disturb your inner temple. Their criticism says everything about their own inner disorder, and very little about you.",
      vedicDiagnosis: {
        term: "Titiksha & Lokasangraha (तितिक्षा & लोकसङ्ग्रह)",
        meaning: "*Titiksha* is noble forbearance—the ability to endure worldly unpleasantness without losing your center. You do not let their mud soil your white lotus."
      },
      shloka: {
        reference: "Bhagavad Gita 12.15",
        sanskrit: "यस्मान्नोद्विजते लोको लोकान्नोद्विजते च यः।\nहर्षामर्षभयोद्वेगैर्मुक्तो यः स च मे प्रियः॥",
        transliteration: "yasmān nodvijate loko lokān nodvijate ca yaḥ |\nharṣāmarṣa-bhayodvegair mukto yaḥ sa ca me priyaḥ ||",
        translation: "He by whom the world is not agitated and who cannot be agitated by the world, who is freed from excessive joy, envy, fear, and anxiety—he is dearly cherished by Me.",
        insight: "To be unshakeable amidst worldly turbulence is the pinnacle of spiritual strength. Maintain professional excellence, document your work diligently, but keep your emotional sovereignty locked safely within."
      },
      cbtPractice: {
        title: "CBT Professional Detachment & The Glass Shield",
        steps: [
          "Step 1 (The Glass Shield Visualization): Picture an invisible shield of diamond between you and their harsh words. The words bounce off the glass; they cannot enter your soul.",
          "Step 2 (Separate Data from Venom): Strip away the emotional insults. Is there a grain of useful work data? If yes, keep the data; discard the venom.",
          "Step 3 (Document & Protect): Keep clear records of facts and deliverables without emotional language.",
          "Step 4 (Affirmation): 'Their behavior is their karma; my poise and self-respect are mine.'"
        ]
      },
      closingCheckin: "Does raising that shield restore your quiet power? Tell me how you feel."
    }
  },
  {
    id: "world_chaos",
    title: "World Turmoil & Existential Dread",
    icon: "🌍",
    keywords: ["world", "news", "wars", "climate", "hopeless world", "doomscrolling", "humanity is doomed", "evil", "suffering everywhere"],
    phase1: {
      acknowledgment: "Pranama. The world news brings reports of conflict, suffering, and calamity that can paralyze the sensitive, empathetic heart. Caring for humanity is noble, but doomscrolling only generates useless helplessness.",
      question1: "What global event or tragedy is overwhelming your heart today?",
      question2: "Why do you feel that your individual peace is selfish when the world is in turmoil?",
      quickPills: [
        "Addiction to doomscrolling terrifying news headlines",
        "Deep grief over war, violence, and innocent suffering",
        "Eco-anxiety and dread about climate collapse",
        "Feeling totally powerless to make a meaningful difference",
        "Cynicism and disgust with human cruelty"
      ]
    },
    phase2: {
      synthesis: "You cannot extinguish a burning forest by throwing yourself into the fire. The world does not need your paralysis; it needs your sanity, compassion, and grounded light.",
      vedicDiagnosis: {
        term: "Kala-Chakra & Dharma-Yuddha (काल-चक्र & धर्म-पालन)",
        meaning: "The cosmic wheel of time (*Kala-Chakra*) turns through cycles of light (*Satya*) and darkness (*Kali*). Evil and ignorance have arisen before, but order (*Rta*) is restored through individuals who hold the line of Dharma."
      },
      shloka: {
        reference: "Bhagavad Gita 4.7-8",
        sanskrit: "यदा यदा हि धर्मस्य ग्लानिर्भवति भारत।\nअभ्युत्थानमधर्मस्य तदात्मानं सृजाम्यहम्॥\nपरित्राणाय साधूनां विनाशाय च दुष्कृताम्।\nधर्मसंस्थापनार्थाय सम्भवामि युगे युगे॥",
        transliteration: "yadā yadā hi dharmasya glānir bhavati bhārata |\nabhyutthānam adharmasya tadātmānaṁ sṛjāmy aham ||\nparitrāṇāya sādhūnāṁ vināśāya ca duṣkṛtām |\ndharma-saṁsthāpanārthāya sambhavāmi yuge yuge ||",
        translation: "Whenever there is a decline of righteousness, O Bharata, and a rampant rise of unrighteousness, at that time I manifest Myself upon the earth.\nFor the protection of the good, for the destruction of the wicked, and for the firm establishment of Dharma, I appear age after age.",
        insight: "Krishna assures us that the ultimate balance of cosmic justice is sustained by divine will. Your responsibility is not to single-handedly rescue the entire globe, but to illuminate your immediate circle with truth and compassion."
      },
      cbtPractice: {
        title: "CBT Media Diet & The Micro-Sanctuary",
        steps: [
          "Step 1 (Media Fast): Cut news consumption to 10 minutes maximum per day, from curated factual sources only. Cease all doomscrolling.",
          "Step 2 (Localizing Action): Channel global grief into one local act of mercy: feeding a hungry animal, planting a seed, or helping a struggling family in your town.",
          "Step 3 (Being a Pillar of Sanity): Remember: every calm, unhurried, kind human being acts as a counterweight to collective madness.",
          "Step 4 (Affirmation): 'I cannot fix the whole world today, but I will not add to its darkness.'"
        ]
      },
      closingCheckin: "Does narrowing your scope to your immediate circle bring peace? How does your breath feel?"
    }
  },
  {
    id: "spiritual",
    title: "Spiritual Disconnection & Emptiness",
    icon: "🪷",
    keywords: ["spiritual", "god", "meaningless", "disillusioned", "faith", "atheist", "doubt", "empty soul", "dry heart", "prayer feels dead"],
    phase1: {
      acknowledgment: "Pranama. The spiritual well has run dry, rituals feel mechanical, and a quiet ache whispers: 'Is any of this real?' Know that spiritual doubt is not a sin; it is the burning threshold of deeper inquiry.",
      question1: "What ritual, belief, or concept of the divine no longer brings you solace?",
      question2: "Why do you feel that divine grace has turned away from your heart?",
      quickPills: [
        "Prayers feeling empty, like speaking to a blank wall",
        "Cynicism that spirituality is just wishful thinking",
        "Feeling abandoned by God during past crises",
        "Hunger for authentic experience rather than dry dogma",
        "Exhaustion with self-help and spiritual materialism"
      ]
    },
    phase2: {
      synthesis: "Your heart has outgrown secondhand concepts of divinity. Krishna does not ask for blind obedience; the Gita is a dialogue of fierce questioning, direct realization, and profound friendship.",
      vedicDiagnosis: {
        term: "Jijnyasa (जिज्ञासा / Sacred Philosophical Hunger)",
        meaning: "In chapter 7, Krishna ranks the seeker of direct wisdom (*Jijnyasu*) as immensely dear. Do not settle for borrowed faith; cultivate direct, inner awareness."
      },
      shloka: {
        reference: "Bhagavad Gita 7.16 & 10.8",
        sanskrit: "चतुर्विधा भजन्ते मां जनाः सुकृतिनोऽर्जुन।\nआर्तो जिज्ञासुरर्थार्थी ज्ञानी च भरतर्षभ॥\n\nअहं सर्वस्य प्रभवो मत्तः सर्वं प्रवर्तते।\nइति मत्वा भजन्ते मां बुधा भावसमन्विताः॥",
        transliteration: "catur-vidhā bhajante māṁ janāḥ sukṛtino 'rjuna |\nārto jijñāsur arthārthī jñānī ca bharatarṣabha ||",
        translation: "Four kinds of virtuous souls worship Me, O Arjuna: the distressed (*Arta*), the seeker of truth (*Jijnyasu*), the seeker of worldly goals (*Artharthi*), and the wise one who knows the Reality (*Jnani*).",
        insight: "Whether you approach in distress, in skeptical inquiry, or in devotion, Krishna welcomes you completely. You do not need ornate rituals; the pure, sincere longing of your heart is the highest offering."
      },
      cbtPractice: {
        title: "Direct Contemplation: Awareness as the Divine",
        steps: [
          "Step 1 (Drop Dogma): Put away all complex scriptures and rigid doctrines for a day.",
          "Step 2 (The Witness Exercise): Close your eyes. Ask: 'Who is listening to these thoughts? Who is aware of this breath?' Notice that peaceful, silent space of pure awareness.",
          "Step 3 (Nature's Darshan): Sit under a tree or watch the starry sky. Sense the intelligence that turns the galaxies and beats your heart without effort.",
          "Step 4 (Affirmation): 'I do not have to believe; I only have to open my heart to the mystery of being.'"
        ]
      },
      closingCheckin: "Does direct simplicity bring stillness to your soul? Tell me what you feel."
    }
  },
  {
    id: "social_anxiety",
    title: "Social Anxiety & Fear of Judgment",
    icon: "👥",
    keywords: ["social anxiety", "awkward", "fear of people", "judgment", "shy", "embarrassed", "parties", "crowd", "people talking about me"],
    phase1: {
      acknowledgment: "Pranama. Walking into a room where eyes linger can feel like standing in an open field targeted by arrows. Fear of human judgment is one of the heaviest masks the soul wears.",
      question1: "What social situation or gathering is paralyzing you with self-consciousness?",
      question2: "Why do you assume that everyone is watching and judging your every word and gesture?",
      quickPills: [
        "Terror of public speaking or speaking up in meetings",
        "Freezing at parties or large social gatherings",
        "Obsessively analyzing every word I said after an interaction",
        "Dread of being seen as awkward, boring, or weird",
        "Cancelling plans at the last minute due to panic"
      ]
    },
    phase2: {
      synthesis: "Social anxiety is the Spotlight Effect in action: you are hyper-focused on yourself, assuming others are judging you with the same harshness you inflict upon yourself.",
      vedicDiagnosis: {
        term: "Lajjā & Bhaya (लज्जा & भय / Social Insecurity)",
        meaning: "When you believe your security depends on the fickle approval of other fallible mortals, your peace is held hostage. Equanimity (*Samatvam*) anchors you in your own divine dignity."
      },
      shloka: {
        reference: "Bhagavad Gita 12.18-19",
        sanskrit: "समः शत्रौ च मित्रे च तथा मानापमानयोः।\nशीतोष्णसुखदुःखेषु समः सङ्गविवर्जितः॥\nतुल्यनिन्दास्तुतिर्मौनी सन्तुष्टो येन केनचित्।\nअनिकेतः स्थिरमतिर्भक्तिमान्मे प्रियो नरः॥",
        transliteration: "samaḥ śatrau ca mitre ca tathā mānāpamānayoḥ |\nśītoṣṇa-sukha-duḥkheṣu samaḥ saṅga-vivarjitaḥ ||\ntulya-nindā-stutir maunī santuṣṭo yena kenacit |\naniketaḥ sthira-matir bhaktimān me priyo naraḥ ||",
        translation: "He who is equal to friend and foe, poised in honor and dishonor, serene in heat and cold, pleasure and pain, free from all attachment; holding praise and blame as equal, silent, content with anything—such a steady-minded person is beloved to Me.",
        insight: "Praise and blame are merely sounds vibrating in the air; neither can add or subtract a single atom from your soul's glory. When you enter a room to give kindness rather than seek approval, all anxiety melts away."
      },
      cbtPractice: {
        title: "CBT External Focus & The Generosity Stance",
        steps: [
          "Step 1 (Shift the Spotlight): Instead of thinking 'How do I look? What do they think of me?', turn the spotlight 180 degrees outward: 'Who in this room looks uncomfortable? How can I make them feel welcome?'",
          "Step 2 (The Flawless Myth): Give yourself permission to say something clumsy. Imperfection makes you approachable, not an outcast.",
          "Step 3 (Post-Event De-Briefing Ban): Forbid yourself from replaying conversations after an event. Say: 'It is done, it was human, and I release it.'",
          "Step 4 (Affirmation): 'I do not need to perform; my sincere presence is enough.'"
        ]
      },
      closingCheckin: "Does shifting from performance to generosity lighten your mind? Tell me how you feel."
    }
  }
];

// ============================================================================
// 31 Daily Shlokas of Serenity (Curated for Calendar Days 1 to 31)
// ============================================================================

const DAILY_SHLOKAS = [
  {
    day: 1,
    chapterVerse: "Chapter 2, Verse 47",
    sanskrit: "कर्मण्येवाधिकारस्ते मा फलेषु कदाचन।\nमा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि॥",
    transliteration: "karmaṇy evādhikāras te mā phaleṣu kadācana |\nmā karma-phala-hetur bhūr mā te saṅgo 'stv akarmaṇi ||",
    translation: "You have a right to perform your prescribed duty, but never to the fruits of action. Never consider yourself the cause of the results of your activities, and never be attached to not doing your duty.",
    meditation: "Today, give your whole heart to the action before you without calculating tomorrow's reward. The effort is yours; the fruit is the universe's sacred gift."
  },
  {
    day: 2,
    chapterVerse: "Chapter 2, Verse 14",
    sanskrit: "मात्रास्पर्शास्तु कौन्तेय शीतोष्णसुखदुःखदाः।\nआगमापायिनोऽनित्यास्तांस्तितिक्षस्व भारत॥",
    transliteration: "mātrā-sparśās tu kaunteya śītoṣṇa-sukha-duḥkha-dāḥ |\nāgamāpāyino 'nityās tāṁs titikṣasva bhārata ||",
    translation: "The contact of the senses with external objects gives rise to cold and heat, pleasure and pain. They are fleeting and impermanent; endure them with calm fortitude, O Bharata.",
    meditation: "Notice today that feelings and moods come and go like clouds across the vast blue sky. You are the unchanging sky, not the fleeting storm."
  },
  {
    day: 3,
    chapterVerse: "Chapter 6, Verse 5",
    sanskrit: "उद्धरेदात्मनात्मानं नात्मानमवसादयेत्।\nआत्मैव ह्यात्मनो बन्धुरात्मैव रिपुरात्मनः॥",
    transliteration: "uddhared ātmanātmānaṁ nātmānam avasādayet |\nātmaiva hy ātmano bandhur ātmaiva ripur ātmanaḥ ||",
    translation: "One must elevate oneself by one's own mind, and not degrade oneself. For the mind alone is the supreme friend of the conditioned soul, and the mind alone is its enemy.",
    meditation: "Speak to your own mind today with the gentleness you would offer a tired child. Choose thoughts that lift your spirit rather than chain you to regret."
  },
  {
    day: 4,
    chapterVerse: "Chapter 2, Verse 20",
    sanskrit: "न जायते म्रियते वा कदाचिन्\nनायं भूत्वा भविता वा न भूयः।\nअजो नित्यः शाश्वतोऽयं पुराणो\nन हन्यते हन्यमाने शरीरे॥",
    transliteration: "na jāyate mriyate vā kadācin\nnāyaṁ bhūtvā bhavitā vā na bhūyaḥ |\najo nityaḥ śāśvato 'yaṁ purāṇo\nna hanyate hanyamāne śarīre ||",
    translation: "The soul is never born, nor does it ever die. Unborn, eternal, ever-existing, and primeval, it is not slain when the body is slain.",
    meditation: "Rest in the timeless depth of your true being. Whatever threatens your peace today is temporal; your true consciousness is indestructible."
  },
  {
    day: 5,
    chapterVerse: "Chapter 2, Verse 48",
    sanskrit: "योगस्थः कुरु कर्माणि सङ्गं त्यक्त्वा धनञ्जय।\nसिद्ध्यसिद्ध्योः समो भूत्वा समत्वं योग उच्यते॥",
    transliteration: "yoga-sthaḥ kuru karmāṇi saṅgaṁ tyaktvā dhanañjaya |\nsiddhy-asiddhyoḥ samo bhūtvā samatvaṁ yoga ucyate ||",
    translation: "Perform your duty poised in Yoga, abandoning all attachment, O Dhananjaya. Be equal in success and failure; for equanimity is called Yoga.",
    meditation: "True greatness is not winning every battle, but remaining unshakeable and serene whether you win or lose."
  },
  {
    day: 6,
    chapterVerse: "Chapter 6, Verse 19",
    sanskrit: "यथा दीपो निवातस्थो नेङ्गते सोपमा स्मृता।\nयोगिनो यतचित्तस्य युञ्जतो योगमात्मनः॥",
    transliteration: "yathā dīpo nivāta-stho neṅgate sopamā smṛtā |\nyogino yata-cittasya yuñjato yogam ātmanaḥ ||",
    translation: "As a lamp in a windless place does not waver, so is the metaphor used for a yogi whose mind is controlled, practicing meditation on the Self.",
    meditation: "Close your eyes for three quiet minutes today. Envision a golden flame burning steady and silent in the inner chamber of your heart."
  },
  {
    day: 7,
    chapterVerse: "Chapter 9, Verse 22",
    sanskrit: "अनन्याश्चिन्तयन्तो मां ये जनाः पर्युपासते।\nतेषां नित्याभियुक्तानां योगक्षेमं वहाम्यहम्॥",
    transliteration: "ananyāś cintayanto māṁ ye janāḥ paryupāsate |\nteṣāṁ nityābhiyuktānāṁ yoga-kṣemaṁ vahāmy aham ||",
    translation: "For those who always worship Me with exclusive devotion, meditating on My transcendental form, to them I carry what they lack, and preserve what they have.",
    meditation: "Surrender your frantic anxiety over survival. The universe carries what you lack when your intentions are pure and steadfast."
  },
  {
    day: 8,
    chapterVerse: "Chapter 3, Verse 35",
    sanskrit: "श्रेयान्स्वधर्मो विगुणः परधर्मात्स्वनुष्ठितात्।\nस्वधर्मे निधनं श्रेयः परधर्मो भयावहः॥",
    transliteration: "śreyān sva-dharmo viguṇaḥ para-dharmāt sv-anuṣṭhitāt |\nsva-dharme nidhanaṁ śreyaḥ para-dharmo bhayāvahaḥ ||",
    translation: "It is far better to discharge one's own prescribed duties, though imperfectly, than another's duties perfectly. To die in one's own duty is blessed; to follow another's is dangerous.",
    meditation: "Cease copying the lives, aesthetics, and career arcs of others. Step into your authentic, natural calling with total humility."
  },
  {
    day: 9,
    chapterVerse: "Chapter 12, Verse 15",
    sanskrit: "यस्मान्नोद्विजते लोको लोकान्नोद्विजते च यः।\nहर्षामर्षभयोद्वेगैर्मुक्तो यः स च मे प्रियः॥",
    transliteration: "yasmān nodvijate loko lokān nodvijate ca yaḥ |\nharṣāmarṣa-bhayodvegair mukto yaḥ sa ca me priyaḥ ||",
    translation: "He by whom nobody is agitated and who is not agitated by anyone, who is freed from joy, envy, fear, and anxiety—he is dearly cherished by Me.",
    meditation: "Be a sanctuary of calm today. Let others find rest in your presence because you refuse to amplify anger or react to provocation."
  },
  {
    day: 10,
    chapterVerse: "Chapter 18, Verse 66",
    sanskrit: "सर्वधर्मान्परित्यज्य मामेकं शरणं व्रज।\nअहं त्वां सर्वपापेभ्यो मोक्षयिष्यामि मा शुचः॥",
    transliteration: "sarva-dharmān parityajya mām ekaṁ śaraṇaṁ vraja |\nahaṁ tvāṁ sarva-pāpebhyo mokṣayiṣyāmi mā śucaḥ ||",
    translation: "Abandon all varieties of worldly dogmas and surrender unto Me alone. I shall deliver you from all past sins and sorrow; do not despair!",
    meditation: "Drop the heavy luggage of past mistakes. Take refuge in cosmic grace and begin afresh with an unburdened, pure heart."
  },
  {
    day: 11,
    chapterVerse: "Chapter 4, Verse 38",
    sanskrit: "न हि ज्ञानेन सदृशं पवित्रमिह विद्यते।\nतत्स्वयं योगसंसिद्धः कालेनात्मनि विन्दति॥",
    transliteration: "na hi jñānena sadṛśaṁ pavitram iha vidyate |\ntat svayaṁ yoga-saṁsiddhaḥ kālenātmani vindati ||",
    translation: "In this world, there is nothing so sublime and pure as transcendental knowledge. One who has become accomplished in Yoga finds that wisdom within in due course.",
    meditation: "Trust the slow, sacred timeline of your growth. Real understanding cannot be rushed; it ripens naturally through sincere daily practice."
  },
  {
    day: 12,
    chapterVerse: "Chapter 6, Verse 26",
    sanskrit: "यतो यतो निश्चरति मनश्चञ्चलमस्थिरम्।\nततस्ततो नियम्यैतदात्मन्येव वशं नयेत्॥",
    transliteration: "yato yato niścarati manaś cañcalam asthiram |\ntatas tato niyamyaitad ātmany eva vaśaṁ nayet ||",
    translation: "From wherever the restless and unsteady mind wanders away, one must repeatedly draw it back and gently anchor it in the Self.",
    meditation: "Do not get angry when your mind wanders off into worries. Gently, like bringing a lost kitten home, guide your attention back to your breath."
  },
  {
    day: 13,
    chapterVerse: "Chapter 2, Verse 56",
    sanskrit: "दुःखेष्वनुद्विग्नमनाः सुखेषु विगतस्पृहः।\nवीतरागभयक्रोधः स्थितधीर्मुनिरुच्यते॥",
    transliteration: "duḥkheṣv anudvigna-manāḥ sukheṣu vigata-spṛhaḥ |\nvīta-rāga-bhaya-krodhaḥ sthita-dhīr munir ucyate ||",
    translation: "One whose mind is unperturbed by misery, who does not crave after pleasure, and who is free from attachment, fear, and anger—such a sage is of steady wisdom.",
    meditation: "When adversity visits today, meet it not with complaint, but with dignity. When pleasure comes, enjoy it without clinging to its permanence."
  },
  {
    day: 14,
    chapterVerse: "Chapter 2, Verse 62",
    sanskrit: "ध्यायतो विषयान्पुंसः सङ्गस्तेषूपजायते।\nसङ्गात्सञ्जायते कामः कामात्क्रोधोऽभिजायते॥",
    transliteration: "dhyāyato viṣayān puṁsaḥ saṅgas teṣūpajāyate |\nsaṅgāt sañjāyate kāmaḥ kāmāt krodho 'bhijāyate ||",
    translation: "While contemplating sensory desires, attachment arises; from attachment, craving develops; and from thwarted craving, anger flares up.",
    meditation: "Watch what you feed your mind today. Every seed of obsession or grievance will eventually bear fruit in anxiety or wrath; choose peaceful thoughts."
  },
  {
    day: 15,
    chapterVerse: "Chapter 5, Verse 10",
    sanskrit: "ब्रह्मण्याधाय कर्माणि सङ्गं त्यक्त्वा करोति यः।\nलिप्यते न स पापेन पद्मपत्रमिवाम्भसा॥",
    transliteration: "brahmaṇy ādhāya karmāṇi saṅgaṁ tyaktvā karoti yaḥ |\nlipyate na sa pāpena padma-patram ivāmbhasā ||",
    translation: "One who performs duties without attachment, dedicating all actions to the Supreme, remains untouched by sorrow, just as a lotus leaf is untouched by water.",
    meditation: "Be like the sacred lotus. Rooted in the muddy waters of daily chores, yet blossoming immaculate and untouched above the pond."
  },
  {
    day: 16,
    chapterVerse: "Chapter 10, Verse 20",
    sanskrit: "अहमात्मा गुडाकेश सर्वभूताशयस्थितः।\nअहमादिश्च मध्यं च भूतानामन्त एव च॥",
    transliteration: "aham ātmā guḍākeśa sarva-bhūtāśaya-sthitaḥ |\naham ādiś ca madhyaṁ ca bhūtānām anta eva ca ||",
    translation: "I am the Soul, O Guḍākeśa, seated in the hearts of all living beings. I am the beginning, the middle, and the end of all existence.",
    meditation: "Look at the person who annoys or challenges you today and remember: the exact same divine breath sustains their heart as sustains yours."
  },
  {
    day: 17,
    chapterVerse: "Chapter 18, Verse 48",
    sanskrit: "सहजं कर्म कौन्तेय सदोषमपि न त्यजेत्।\nसर्वारम्भा हि दोषेण धूमेनाग्निरिवावृताः॥",
    transliteration: "saha-jaṁ karma kaunteya sa-doṣam api na tyajet |\nsarvārambhā hi doṣeṇa dhūmenāgnir ivāvṛtāḥ ||",
    translation: "One should not abandon the work born of one's nature, even if accompanied by flaws; for all undertakings are covered by some defect, just as fire is covered by smoke.",
    meditation: "Forgive yourself for not being flawless. Put forth your honest effort, accept the smoke, and let the warmth of your sincerity shine."
  },
  {
    day: 18,
    chapterVerse: "Chapter 2, Verse 70",
    sanskrit: "आपूर्यमाणमचलप्रतिष्ठं\nसमुद्रमापः प्रविशन्ति यद्वत्।\nतद्वत्कामा यं प्रविशन्ति सर्वे\nस शान्तिमाप्नोति न कामकामी॥",
    transliteration: "āpūryamāṇam acala-pratiṣṭhaṁ\nsamudram āpaḥ praviśanti yadvat |\ntadvat kāmā yaṁ praviśanti sarve\nsa śāntim āpnoti na kāma-kāmī ||",
    translation: "Just as the ocean remains undisturbed while rivers flow into it, so the person who remains unmoved by the incoming flow of desires attains peace; not the seeker after desires.",
    meditation: "Be the vast ocean. Let the turbulent rivers of opinions, noise, and distractions enter your awareness without disturbing the silent abyss beneath."
  },
  {
    day: 19,
    chapterVerse: "Chapter 6, Verse 16-17",
    sanskrit: "नात्यश्नतस्तु योगोऽस्ति न चैकान्तमनश्नतः।\nन चातिस्वप्नशीलस्य जाग्रतो नैव चार्जुन॥\nयुक्ताहारविहारस्य युक्तचेष्टस्य कर्मसु।\nयुक्तस्वप्नावबोधस्य योगो भवति दुःखहा॥",
    transliteration: "nāty-aśnatas tu yogo 'sti na caikāntam anaśnataḥ |\nna cāti-svapna-śīlasya jāgrato naiva cārjuna ||\nyuktāhāra-vihārasya yukta-ceṣṭasya karmasu |\nyukta-svapnāvabodhasya yogo bhavati duḥkha-hā ||",
    translation: "Yoga is not for one who eats too much or fasts too much, nor for one who sleeps too much or stays awake too much. For one who is moderate in food, recreation, effort, sleep, and waking, Yoga becomes the destroyer of all sorrow.",
    meditation: "Choose moderation today. Balance work with rest, speech with silence, and activity with nourishing stillness."
  },
  {
    day: 20,
    chapterVerse: "Chapter 13, Verse 8-12",
    sanskrit: "अमानित्वमदम्भित्वमहिंसा क्षान्तिरार्जवम्।\nआचार्योपासनं शौचं स्थैर्यमात्मविनिग्रहः॥",
    transliteration: "amānitvam adambhitvam ahiṁsā kṣāntir ārjavam |\nācāryopāsanaṁ śaucaṁ sthairyam ātma-vinigrahaḥ ||",
    translation: "Humility, unpretentiousness, non-violence, forgiveness, simplicity, service of the wise, purity, steadfastness, and self-restraint—these are declared to be true wisdom.",
    meditation: "Practice simplicity today. You do not need to impress anyone; pure kindness and straightforward honesty carry irresistible divine beauty."
  },
  {
    day: 21,
    chapterVerse: "Chapter 9, Verse 26",
    sanskrit: "पत्रं पुष्पं फलं तोयं यो मे भक्त्या प्रयच्छति।\nतदहं भक्त्युपहृतमश्नामि प्रयतात्मनः॥",
    transliteration: "patraṁ puṣpaṁ phalaṁ toyaṁ yo me bhaktyā prayacchati |\ntad ahaṁ bhakty-upahṛtam aśnāmi prayatātmanaḥ ||",
    translation: "Whoever offers Me with love and devotion a leaf, a flower, a fruit, or even water—that I accept with great joy from the pure-hearted soul.",
    meditation: "It is the love behind the offering, not the grandeur of the gift, that matters. Offer a smile, a kind word, or a silent blessing to someone today."
  },
  {
    day: 22,
    chapterVerse: "Chapter 12, Verse 13",
    sanskrit: "अद्वेष्टा सर्वभूतानां मैत्रः करुण एव च।\nनिर्ममो निरहङ्कारः समदुःखसुखः क्षमी॥",
    transliteration: "adveṣṭā sarva-bhūtānāṁ maitraḥ karuṇa eva ca |\nnirmamo nirahaṅkāraḥ sama-duḥkha-sukhaḥ kṣamī ||",
    translation: "One who is not envious of any living being, who is a friendly well-wisher to all, compassionate, free from possessiveness and false ego, equal in sorrow and joy, and forgiving—such a soul is dear to Me.",
    meditation: "Release resentment today. When you forgive another, you break the chains that bound your own soul to their mistake."
  },
  {
    day: 23,
    chapterVerse: "Chapter 6, Verse 35",
    sanskrit: "असंशयं महाबाहो मनो दुर्निग्रहं चलम्।\nअभ्यासेन तु कौन्तेय वैराग्येण च गृह्यते॥",
    transliteration: "asaṁśayaṁ mahā-bāho mano durnigrahaṁ calam |\nabhyāsena tu kaunteya vairāgyeṇa ca gṛhyate ||",
    translation: "Without doubt, O mighty-armed one, the mind is restless and difficult to curb. But by practice (*Abhyasa*) and detachment (*Vairagya*), it can be conquered.",
    meditation: "Be patient with your restless mind. Every time you consciously breathe and let go of worry, you are strengthening your spiritual muscle."
  },
  {
    day: 24,
    chapterVerse: "Chapter 18, Verse 78",
    sanskrit: "यत्र योगेश्वरः कृष्णो यत्र पार्थो धनुर्धरः।\nतत्र श्रीर्विजयो भूतिर्ध्रुवा नीतिर्मतिर्मम॥",
    transliteration: "yatra yogeśvaraḥ kṛṣṇo yatra pārtho dhanur-dharaḥ |\ntatra śrīr vijayo bhūtir dhruvā nītir matir mama ||",
    translation: "Wherever there is Krishna, the Lord of Yoga, and wherever there is Arjuna, the wielder of the bow, there will surely be fortune, victory, extraordinary prosperity, and morality.",
    meditation: "When human courage aligns with divine wisdom, victory is assured. Pick up your bow of perseverance and trust the cosmic guidance."
  },
  {
    day: 25,
    chapterVerse: "Chapter 2, Verse 71",
    sanskrit: "विहाय कामान्यः सर्वान्पुमांश्चरति निःस्पृहः।\nनिर्ममो निरहङ्कारः स शान्तिमधिगच्छति॥",
    transliteration: "vihāya kāmān yaḥ sarvān pumāṁś carati niḥspṛhaḥ |\nnirmamo nirahaṅkāraḥ sa śāntim adhigacchati ||",
    translation: "A person who has given up all desires for sense gratification, who lives free from desires, who has given up all sense of proprietorship and is devoid of false ego—he alone attains real peace.",
    meditation: "True wealth is not owning everything, but needing very little to be completely joyful inside."
  },
  {
    day: 26,
    chapterVerse: "Chapter 4, Verse 7",
    sanskrit: "यदा यदा हि धर्मस्य ग्लानिर्भवति भारत।\nअभ्युत्थानमधर्मस्य तदात्मानं सृजाम्यहम्॥",
    transliteration: "yadā yadā hi dharmasya glānir bhavati bhārata |\nabhyutthānam adharmasya tadātmānaṁ sṛjāmy aham ||",
    translation: "Whenever there is a decline of righteousness, O descendant of Bharata, and a predominant rise of unrighteousness, at that time I manifest Myself.",
    meditation: "Light always returns to dispel darkness. Even in challenging times, keep your small lantern of goodness burning bright."
  },
  {
    day: 27,
    chapterVerse: "Chapter 11, Verse 33",
    sanskrit: "तस्मात्त्वमुत्तिष्ठ यशो लभस्व\nजित्वा शत्रून्भुङ्क्ष्व राज्यं समृद्धम्।\nमयैवैते निहताः पूर्वमेव\nनिमित्तमात्रं भव सव्यसाचिन्॥",
    transliteration: "tasmāt tvam uttiṣṭha yaśo labhasva\njitvā śatrūn bhuṅkṣva rājyaṁ samṛddham |\nmayaivaite nihatāḥ pūrvam eva\nnimitta-mātraṁ bhava savya-sācin ||",
    translation: "Therefore arise and win glory! Conquer your foes and enjoy a flourishing kingdom. These obstacles have already been dissolved by My will; be merely an instrument, O Savyasācin!",
    meditation: "You do not have to carry the whole burden alone. See yourself as a humble, willing flute through which the divine song plays."
  },
  {
    day: 28,
    chapterVerse: "Chapter 14, Verse 22-25",
    sanskrit: "प्रकाशं च प्रवृत्तिं च मोहमेव च पाण्डव।\nन द्वेष्टि सम्प्रवृत्तानि न निवृत्तानि काङ्क्षति॥",
    transliteration: "prakāśaṁ ca pravṛttiṁ ca moham eva ca pāṇḍava |\nna dveṣṭi sampravṛttāni na nivṛttāni kāṅkṣati ||",
    translation: "One who does not hate illumination, attachment, or delusion when they are present, nor longs for them when they disappear; who sits like a neutral witness—such a one has transcended the material modes.",
    meditation: "Observe your mental moods today without judging them. Just watch: 'Here is restlessness. Here is calmness.' Be the witness, not the storm."
  },
  {
    day: 29,
    chapterVerse: "Chapter 15, Verse 7",
    sanskrit: "ममैवांशो जीवलोके जीवभूतः सनातनः।\nमनःषष्ठानीन्द्रियाणि प्रकृतिस्थानि कर्षति॥",
    transliteration: "mamaivāṁśo jīva-loke jīva-bhūtaḥ sanātanaḥ |\nmanaḥ-ṣaṣṭhānīndriyāṇi prakṛti-sthāni karṣati ||",
    translation: "The living entities in this conditioned world are My eternal fragmental parts. Due to conditioned life, they are struggling very hard with the six senses, of which the mind is the foremost.",
    meditation: "You are an eternal part of the Divine. No mistake, failure, or sadness can ever sever your intrinsic belonging to the cosmic heart."
  },
  {
    day: 30,
    chapterVerse: "Chapter 17, Verse 15",
    sanskrit: "अनुद्वेगकरं वाक्यं सत्यं प्रियहितं च यत्।\nस्वाध्यायाभ्यसनं चैव वाङ्मयं तप उच्यते॥",
    transliteration: "anudvega-karaṁ vākyaṁ satyaṁ priya-hitaṁ ca yat |\nsvādhyāyābhyasanaṁ caiva vāṅmayaṁ tapa ucyate ||",
    translation: "Words that cause no distress, that are truthful, pleasing, and beneficial, combined with regular study of sacred literature—this is declared to be the austerity of speech.",
    meditation: "Speak with sweetness and truth today. Let every word you utter be a healing balm rather than a cutting blade."
  },
  {
    day: 31,
    chapterVerse: "Chapter 18, Verse 73",
    sanskrit: "नष्टो मोहः स्मृतिर्लब्धा त्वत्प्रसादान्मयाच्युत।\nस्थितोऽस्मि गतसन्देहः करिष्ये वचनं तव॥",
    transliteration: "naṣṭo mohaḥ smṛtir labdhā tvat-prasādān mayācyuta |\nsthito 'smi gata-sandehaḥ kariṣye vacanaṁ tava ||",
    translation: "Arjuna said: My delusion is destroyed! I have regained my memory through Your grace, O Infallible One. I am now firm, free from doubt, and ready to act according to Your word.",
    meditation: "Declare your inner clarity today: 'My doubts are resolved, my spirit is awake. I step forward into my life with courage, peace, and purpose.'"
  }
];

// ============================================================================
// Intelligent Archetype Matcher & Fallback Resolver
// ============================================================================

function findWisdomArchetype(userInput) {
  if (!userInput || typeof userInput !== "string") {
    return WISDOM_ARCHETYPES[0];
  }

  const query = userInput.toLowerCase();

  // 1. Direct Keyword Matching with Scoring
  let bestMatch = null;
  let highestScore = 0;

  for (const archetype of WISDOM_ARCHETYPES) {
    let score = 0;
    for (const kw of archetype.keywords) {
      if (query.includes(kw)) {
        score += kw.length; // weight longer specific phrases higher
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = archetype;
    }
  }

  if (bestMatch && highestScore > 0) {
    return bestMatch;
  }

  // 2. Fallback Archetype for General Distress / Unmatched Queries
  return {
    id: "general_peace",
    title: "Seeking Peace & Inner Stillness",
    icon: "🪷",
    keywords: ["help", "peace", "advice", "talk", "listen"],
    phase1: {
      acknowledgment: "Pranama, noble soul. I listen with an open heart. Whatever whirlpool stirs your consciousness, remember that you are never alone on this battlefield of life.",
      question1: "What specific challenge or question weighs upon your mind at this very moment?",
      question2: "Why do you feel this tension, and what would bring genuine relief to your heart?",
      quickPills: [
        "Feeling overwhelmed by competing demands",
        "Seeking clarity on a difficult decision",
        "Longing for quietness in a noisy world",
        "Wrestling with self-doubt and fear of the future",
        "Just needing a compassionate space to breathe"
      ]
    },
    phase2: {
      synthesis: "You stand seeking an anchor amidst life's rapid currents. The secret of the Gita is that serenity is not the absence of storms, but peace in the very center of the storm.",
      vedicDiagnosis: {
        term: "Sthitaprajna Sadhana (स्थितप्रज्ञ साधना / Cultivating the Steady Intellect)",
        meaning: "When the outer world is in flux, anchoring your mind in the eternal witness (*Sakshi*) keeps you serene and unassailable."
      },
      shloka: {
        reference: "Bhagavad Gita 2.55",
        sanskrit: "प्रजहाति यदा कामान्सर्वान्पार्थ मनोगतान्।\nआत्मन्येवात्मना तुष्टः स्थितप्रज्ञस्तदोच्यते॥",
        transliteration: "prajahāti yadā kāmān sarvān pārtha mano-gatān |\nātmany evātmanā tuṣṭaḥ sthita-prajñas tadocyate ||",
        translation: "When a person completely renounces all selfish cravings of the mind, and becomes satisfied in the Self alone by the Self, then they are said to be of steady wisdom.",
        insight: "Your contentment does not depend on the outer world performing to your liking. The greatest reservoir of joy and peace is already beating inside your own heart."
      },
      cbtPractice: {
        title: "CBT Witness Stance & The 3-Breath Sanctuary",
        steps: [
          "Step 1 (The Witness Pivot): Step back and observe your thoughts without arguing with them. Say: 'I notice thoughts of tension, but I am the observer, not the tension.'",
          "Step 2 (The 3 Deep Cleansing Breaths): Inhale slowly through the nose (4 seconds), hold gently (4 seconds), and exhale completely through the mouth with a soft sigh.",
          "Step 3 (Releasing Ownership of Outcomes): Whisper: 'I do what I can with sincerity; the rest I release to the cosmic order.'",
          "Step 4 (Affirmation): 'I am grounded, I am protected, and I am at peace.'"
        ]
      },
      closingCheckin: "Does this space of stillness bring comfort to your mind? Tell me how you feel now."
    }
  };
}

// Export for module or global browser usage
if (typeof module !== "undefined" && module.exports) {
  module.exports = { WISDOM_ARCHETYPES, DAILY_SHLOKAS, findWisdomArchetype };
}
