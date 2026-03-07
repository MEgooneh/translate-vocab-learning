// Spaced Repetition System based on SM-2 / Leitner principles
// Intervals in hours: increasing gaps after consecutive correct answers
// Based on Ebbinghaus forgetting curve research
const SRS = {
  // Level → hours until next review
  // Level 0: new/failed → immediately due
  // Level 1: 1 correct → 4 hours
  // Level 2: 2 correct → 1 day
  // Level 3: 3 correct → 3 days
  // Level 4: 4 correct → 7 days
  // Level 5: 5 correct → 14 days
  // Level 6: 6 correct → 30 days
  // Level 7+: mastered → 60 days
  intervals: [0, 4, 24, 72, 168, 336, 720, 1440],

  getInterval(level) {
    const idx = Math.min(level, this.intervals.length - 1);
    return this.intervals[idx] * 60 * 60 * 1000; // convert hours to ms
  },

  isDue(translation) {
    const level = translation.srsLevel || 0;
    const lastReviewed = translation.lastReviewed || 0;
    if (!lastReviewed || level === 0) return true;
    const interval = this.getInterval(level);
    return Date.now() >= lastReviewed + interval;
  },

  // Higher urgency = should be reviewed sooner
  getUrgency(translation) {
    const level = translation.srsLevel || 0;
    const lastReviewed = translation.lastReviewed || 0;
    if (!lastReviewed || level === 0) return 1000; // max urgency for new words
    const interval = this.getInterval(level);
    const elapsed = Date.now() - lastReviewed;
    const overdue = elapsed / interval; // >1 means overdue
    return overdue;
  },

  onCorrect(translation) {
    const level = (translation.srsLevel || 0) + 1;
    return {
      srsLevel: level,
      lastReviewed: Date.now(),
      reviewCount: (translation.reviewCount || 0) + 1,
      correctCount: (translation.correctCount || 0) + 1
    };
  },

  onWrong(translation) {
    return {
      srsLevel: 0, // reset to beginning
      lastReviewed: Date.now(),
      reviewCount: (translation.reviewCount || 0) + 1,
      wrongCount: (translation.wrongCount || 0) + 1
    };
  },

  isMastered(translation) {
    return (translation.srsLevel || 0) >= 7;
  },

  getLevelLabel(level) {
    if (!level || level === 0) return 'New';
    if (level === 1) return 'Learning';
    if (level === 2) return 'Familiar';
    if (level <= 4) return 'Reviewing';
    if (level <= 6) return 'Known';
    return 'Mastered';
  },

  getLevelColor(level) {
    if (!level || level === 0) return '#f85149';
    if (level === 1) return '#d29922';
    if (level === 2) return '#d29922';
    if (level <= 4) return '#58a6ff';
    if (level <= 6) return '#3fb950';
    return '#3fb950';
  }
};

const Quiz = {
  generate(translations, count = 10) {
    if (translations.length < 4) return null;

    // Prioritize words that are due for review using SRS
    const due = translations.filter(t => !t.archived && SRS.isDue(t));
    const pool = due.length >= 4 ? due : translations.filter(t => !t.archived);

    // Sort by urgency (most urgent first)
    pool.sort((a, b) => SRS.getUrgency(b) - SRS.getUrgency(a));

    const questions = pool.slice(0, Math.min(count, pool.length));
    // Shuffle the selected questions for variety
    questions.sort(() => Math.random() - 0.5);

    const allActive = translations.filter(t => !t.archived);

    return questions.map(t => {
      const wrongOptions = allActive
        .filter(o => o.id !== t.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map(o => o.translatedText);

      const options = [...wrongOptions, t.translatedText]
        .sort(() => Math.random() - 0.5);

      return {
        id: t.id,
        question: t.originalText,
        correctAnswer: t.translatedText,
        options,
        definition: t.definition,
        pronunciation: t.pronunciation,
        synonyms: t.synonyms,
        srsLevel: t.srsLevel || 0,
        targetLang: t.targetLang || 'fa'
      };
    });
  },

  generateReverse(translations, count = 10) {
    if (translations.length < 4) return null;

    const due = translations.filter(t => !t.archived && SRS.isDue(t));
    const pool = due.length >= 4 ? due : translations.filter(t => !t.archived);
    pool.sort((a, b) => SRS.getUrgency(b) - SRS.getUrgency(a));

    const questions = pool.slice(0, Math.min(count, pool.length));
    questions.sort(() => Math.random() - 0.5);

    const allActive = translations.filter(t => !t.archived);

    return questions.map(t => {
      const wrongOptions = allActive
        .filter(o => o.id !== t.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map(o => o.originalText);

      const options = [...wrongOptions, t.originalText]
        .sort(() => Math.random() - 0.5);

      return {
        id: t.id,
        question: t.translatedText,
        correctAnswer: t.originalText,
        options,
        definition: t.definition,
        pronunciation: t.pronunciation,
        synonyms: t.synonyms,
        isReverse: true,
        srsLevel: t.srsLevel || 0,
        targetLang: t.targetLang || 'fa'
      };
    });
  },

  generateFlashcards(translations) {
    // Only include non-archived words
    const active = translations.filter(t => !t.archived);

    // Prioritize due words, then sort by urgency
    const due = active.filter(t => SRS.isDue(t));
    const notDue = active.filter(t => !SRS.isDue(t));

    // Due words sorted by urgency (most urgent first)
    due.sort((a, b) => SRS.getUrgency(b) - SRS.getUrgency(a));
    // Not-due words shuffled (just in case user wants to see them)
    notDue.sort(() => Math.random() - 0.5);

    // Show due words first, then others
    const ordered = [...due, ...notDue];

    return ordered.map(t => ({
      id: t.id,
      front: t.originalText,
      back: t.translatedText,
      pronunciation: t.pronunciation,
      definition: t.definition,
      synonyms: t.synonyms,
      srsLevel: t.srsLevel || 0,
      isDue: SRS.isDue(t),
      targetLang: t.targetLang || 'fa'
    }));
  }
};
