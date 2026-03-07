Theme.init();

const content = document.getElementById('content');
let currentTab = 'today';
let quizState = null;

// Tab switching
document.querySelectorAll('.tab[data-tab]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentTab = tab.dataset.tab;
    renderTab();
  });
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function debounce(fn, ms = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function renderMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre class="tv-md-pre"><code class="tv-md-code-block">${code.trim()}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, '<code class="tv-md-inline-code">$1</code>');
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '<em>$1</em>');
  html = html.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '<em>$1</em>');
  html = html.replace(/^### (.+)$/gm, '<h4 class="tv-md-h">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="tv-md-h">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h3 class="tv-md-h">$1</h3>');
  html = html.replace(/^[\-\*] (.+)$/gm, '<li class="tv-md-li">$1</li>');
  html = html.replace(/((?:<li class="tv-md-li">.*<\/li>\n?)+)/g, '<ul class="tv-md-ul">$1</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="tv-md-li-ol">$1</li>');
  html = html.replace(/((?:<li class="tv-md-li-ol">.*<\/li>\n?)+)/g, '<ol class="tv-md-ol">$1</ol>');
  html = html.replace(/\n\n+/g, '</p><p class="tv-md-p">');
  html = html.replace(/\n/g, '<br>');
  if (!html.startsWith('<')) html = `<p class="tv-md-p">${html}</p>`;
  return html;
}

function timeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function splitSynonyms(synonyms) {
  if (!synonyms || !synonyms.length) return [];
  const result = [];
  for (const s of synonyms) {
    for (const part of s.split(',')) {
      const w = part.trim();
      if (w && !result.includes(w)) result.push(w);
      if (result.length >= 8) return result;
    }
  }
  return result;
}

function renderCard(t) {
  const splitSyns = splitSynonyms(t.synonyms);
  const syns = splitSyns.length
    ? `<div class="card-synonyms">
         <div class="card-synonyms-label">Synonyms</div>
         <div class="card-synonyms-list">${splitSyns.map(s => `<span class="card-tag">${escapeHtml(s)}</span>`).join('')}</div>
       </div>`
    : '';
  const def = t.definition
    ? `<div class="card-definition">${escapeHtml(t.definition)}</div>`
    : '';
  const pron = t.pronunciation
    ? `<div class="card-pronunciation">/${escapeHtml(t.pronunciation)}/</div>`
    : '';

  const level = t.srsLevel || 0;
  const levelLabel = SRS.getLevelLabel(level);
  const levelColor = SRS.getLevelColor(level);
  const isArchived = t.archived;
  const rtl = isRTL(t.targetLang || 'fa');

  return `
    <div class="card ${isArchived ? 'card-archived' : ''}" data-id="${t.id}">
      <div class="card-top-row">
        <span class="card-srs-badge" style="color:${levelColor};border-color:${levelColor}33;background:${levelColor}15">${levelLabel}</span>
        <div class="card-actions">
          <button class="card-archive" data-id="${t.id}" title="${isArchived ? 'Restore to review' : 'Remove from review'}">
            ${isArchived
              ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>'
              : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>'}
          </button>
          <button class="card-delete" data-id="${t.id}" title="Delete permanently">&times;</button>
        </div>
      </div>
      <div class="card-original">${escapeHtml(t.originalText)}</div>
      ${pron}
      <div class="card-translation${rtl ? ' card-translation-rtl' : ''}">${escapeHtml(t.translatedText)}</div>
      ${def}
      ${syns}
      <div class="card-meta">
        <span>${timeAgo(t.timestamp)}</span>
      </div>
    </div>
  `;
}

async function renderTab() {
  try {
    switch (currentTab) {
      case 'today': return await renderToday();
      case 'history': return await renderHistory();
      case 'aichats': return await renderAIChats();
      case 'quiz': return await renderQuizStart();
      case 'flashcards': return await renderFlashcardsStart();
    }
  } catch (e) {
    console.error('Render error:', e);
    content.innerHTML = `<div class="empty"><div class="empty-icon">!</div>Something went wrong.<br><span style="font-size:12px;opacity:0.6">${escapeHtml(e.message)}</span></div>`;
  }
}

// ---- TODAY ----
async function renderToday() {
  const translations = await Storage.getTranslationsToday();
  if (translations.length === 0) {
    content.innerHTML = `<div class="empty"><div class="empty-icon">📝</div>No translations today yet.<br>Select text on any page and right-click to translate!</div>`;
    return;
  }
  content.innerHTML = `<p class="tab-subtitle">${translations.length} translation${translations.length > 1 ? 's' : ''} today</p>`
    + translations.map(renderCard).join('');
  attachDeleteHandlers();
}

// ---- HISTORY ----
async function renderHistory() {
  const groups = await Storage.getTranslationsGroupedByDate();
  const dates = Object.keys(groups);

  if (dates.length === 0) {
    content.innerHTML = `<div class="empty"><div class="empty-icon">📚</div>No translation history yet.</div>`;
    return;
  }

  let html = `<input type="text" class="search-input" placeholder="Search translations..." id="historySearch">`;

  for (const date of dates) {
    html += `<div class="date-group" data-date="${date}">`;
    html += `<div class="date-header">${date} (${groups[date].length})</div>`;
    html += `<div class="date-cards">${groups[date].map(renderCard).join('')}</div>`;
    html += `</div>`;
  }

  content.innerHTML = html;
  attachDeleteHandlers();

  const searchInput = document.getElementById('historySearch');
  searchInput.addEventListener('input', debounce(() => {
    const query = searchInput.value.toLowerCase();
    content.querySelectorAll('.card').forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(query) ? '' : 'none';
    });
    content.querySelectorAll('.date-group').forEach(group => {
      const visible = group.querySelectorAll('.card:not([style*="display: none"])');
      group.style.display = visible.length === 0 ? 'none' : '';
    });
  }));
}

// ---- PROFILE SWITCHER ----
async function appendProfileSwitcher() {
  const profiles = await Storage.getProfiles();
  if (profiles.length < 2) return; // No switcher needed for single profile

  const active = await Storage.getActiveProfile();
  const options = profiles.map(p =>
    `<option value="${p.id}" ${p.id === active?.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
  ).join('');

  const switcher = document.createElement('div');
  switcher.className = 'profile-switcher';
  switcher.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
    <select class="profile-switcher-select">${options}</select>
  `;

  // Insert at top of content
  content.insertBefore(switcher, content.firstChild);

  switcher.querySelector('select').addEventListener('change', async (e) => {
    await Storage.setActiveProfile(e.target.value);
    // Also update flat keys for backward compat
    const profiles = await Storage.getProfiles();
    const profile = profiles.find(p => p.id === e.target.value);
    if (profile) {
      await chrome.storage.sync.set({
        apiKey: profile.apiKey,
        provider: profile.provider,
        model: profile.model,
        baseUrl: profile.baseUrl || ''
      });
    }
  });
}

// ---- AI CHATS ----
function truncateUrl(url, maxLen = 40) {
  try {
    const u = new URL(url);
    let display = u.hostname + u.pathname;
    if (display.length > maxLen) display = display.slice(0, maxLen) + '...';
    return display;
  } catch {
    return url && url.length > maxLen ? url.slice(0, maxLen) + '...' : (url || '');
  }
}

function renderAIChatCard(chat) {
  const userMessages = chat.messages ? chat.messages.filter(m => m.role === 'user') : [];
  const assistantMessages = chat.messages ? chat.messages.filter(m => m.role === 'assistant') : [];
  const hasFollowUps = userMessages.length > 1;
  const followUpCount = userMessages.length - 1;

  // Build conversation HTML (hidden by default)
  let convoHtml = '';
  if (chat.messages && chat.messages.length > 2) {
    // Skip first user+assistant (the initial Q&A), show follow-ups
    const followUps = chat.messages.slice(2);
    convoHtml = followUps.map(m => {
      const cls = m.role === 'user' ? 'ai-convo-user' : 'ai-convo-assistant';
      const label = m.role === 'user' ? 'You' : 'AI';
      const rendered = m.role === 'assistant' ? renderMarkdown(m.content) : escapeHtml(m.content);
      const mdClass = m.role === 'assistant' ? ' tv-md' : '';
      return `<div class="ai-convo-msg ${cls}${mdClass}"><span class="ai-convo-label">${label}</span>${rendered}</div>`;
    }).join('');
  }

  return `
    <div class="ai-chat-card" data-id="${chat.id}">
      <div class="ai-chat-header">
        <div class="ai-chat-selected">${escapeHtml(chat.selectedText)}</div>
        <button class="card-delete ai-chat-delete" data-id="${chat.id}" title="Delete">&times;</button>
      </div>
      <div class="ai-chat-url">${escapeHtml(truncateUrl(chat.url))}</div>
      <div class="ai-chat-response tv-md">${renderMarkdown(chat.aiResponse)}</div>
      ${hasFollowUps ? `
        <button class="ai-chat-expand" data-id="${chat.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          ${followUpCount} follow-up${followUpCount > 1 ? 's' : ''}
        </button>
        <div class="ai-chat-conversation" id="aiConvo-${chat.id}" hidden>
          ${convoHtml}
        </div>
      ` : ''}
      <div class="ai-chat-meta">${timeAgo(chat.timestamp)}</div>
    </div>
  `;
}

async function renderAIChats() {
  const groups = await Storage.getAIChatsGroupedByDate();
  const dates = Object.keys(groups);

  if (dates.length === 0) {
    content.innerHTML = `<div class="empty"><div class="empty-icon">AI</div>No AI conversations yet.<br>Select text and right-click "Ask AI" to start!</div>`;
    await appendProfileSwitcher();
    return;
  }

  let html = `<input type="text" class="search-input" placeholder="Search AI conversations..." id="aiSearch">`;

  for (const date of dates) {
    html += `<div class="date-group" data-date="${date}">`;
    html += `<div class="date-header">${date} (${groups[date].length})</div>`;
    html += `<div class="date-cards">${groups[date].map(renderAIChatCard).join('')}</div>`;
    html += `</div>`;
  }

  content.innerHTML = html;
  await appendProfileSwitcher();

  // Attach expand handlers
  content.querySelectorAll('.ai-chat-expand').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const convo = document.getElementById(`aiConvo-${id}`);
      const isHidden = convo.hidden;
      convo.hidden = !isHidden;
      btn.classList.toggle('expanded', isHidden);
    });
  });

  // Attach delete handlers
  content.querySelectorAll('.ai-chat-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await Storage.deleteAIChat(btn.dataset.id);
      renderAIChats();
    });
  });

  // Search
  const aiSearchInput = document.getElementById('aiSearch');
  aiSearchInput.addEventListener('input', debounce(() => {
    const query = aiSearchInput.value.toLowerCase();
    content.querySelectorAll('.ai-chat-card').forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(query) ? '' : 'none';
    });
    content.querySelectorAll('.date-group').forEach(group => {
      const visible = group.querySelectorAll('.ai-chat-card:not([style*="display: none"])');
      group.style.display = visible.length === 0 ? 'none' : '';
    });
  }));
}

// ---- QUIZ ----
async function renderQuizStart() {
  const all = await Storage.getAllTranslations();
  const active = all.filter(t => !t.archived);
  const today = await Storage.getTranslationsToday();
  const todayActive = today.filter(t => !t.archived);
  const dueCount = active.filter(t => SRS.isDue(t)).length;
  const targetLang = await Storage.getTargetLang();
  const langLabel = getLangName(targetLang);

  if (active.length < 4) {
    content.innerHTML = `<div class="empty"><div class="empty-icon">🧠</div>Need at least 4 translations to start a quiz.<br>You have ${active.length} so far.</div>`;
    return;
  }

  content.innerHTML = `
    <div class="quiz-start">
      <h3>Quiz Mode</h3>
      <p>Test your vocabulary knowledge!</p>
      ${dueCount > 0 ? `<p class="quiz-due-notice">${dueCount} word${dueCount > 1 ? 's' : ''} due for review</p>` : '<p class="quiz-all-caught-up">All caught up! No words due right now.</p>'}
      <div class="direction-toggle">
        <button class="active" id="dirNormal">English → ${escapeHtml(langLabel)}</button>
        <button id="dirReverse">${escapeHtml(langLabel)} → English</button>
      </div>
      ${todayActive.length >= 4 ? `<button class="quiz-btn" id="quizToday">Today's Words (${todayActive.length})</button>` : ''}
      ${dueCount >= 4 ? `<button class="quiz-btn" id="quizDue">Due for Review (${dueCount})</button>` : ''}
      <button class="quiz-btn" id="quizAll">All Words (${active.length})</button>
    </div>
  `;

  let reverse = false;

  document.getElementById('dirNormal').addEventListener('click', () => {
    reverse = false;
    document.getElementById('dirNormal').classList.add('active');
    document.getElementById('dirReverse').classList.remove('active');
  });

  document.getElementById('dirReverse').addEventListener('click', () => {
    reverse = true;
    document.getElementById('dirReverse').classList.add('active');
    document.getElementById('dirNormal').classList.remove('active');
  });

  if (todayActive.length >= 4) {
    document.getElementById('quizToday').addEventListener('click', () => startQuiz(todayActive, reverse));
  }
  if (dueCount >= 4) {
    document.getElementById('quizDue').addEventListener('click', () => {
      const dueWords = active.filter(t => SRS.isDue(t));
      startQuiz(dueWords, reverse);
    });
  }
  document.getElementById('quizAll').addEventListener('click', () => startQuiz(active, reverse));
}

function startQuiz(translations, reverse = false) {
  const questions = reverse
    ? Quiz.generateReverse(translations)
    : Quiz.generate(translations);

  quizState = {
    questions,
    current: 0,
    score: 0,
    answered: false
  };

  renderQuizQuestion();
}

function renderQuizQuestion() {
  const { questions, current, score } = quizState;

  if (current >= questions.length) {
    renderQuizScore();
    return;
  }

  const q = questions[current];
  const targetLangCode = q.targetLang || 'fa';
  const rtl = isRTL(targetLangCode);
  const questionClass = q.isReverse && rtl ? ' quiz-question-rtl' : '';
  const optionClass = !q.isReverse && rtl ? ' quiz-btn-rtl' : '';

  content.innerHTML = `
    <div class="quiz-progress">Question ${current + 1} of ${questions.length} | Score: ${score}</div>
    <div class="quiz-question${questionClass}">${escapeHtml(q.question)}</div>
    ${!q.isReverse && q.pronunciation ? `<div class="quiz-pronunciation">/${escapeHtml(q.pronunciation)}/</div>` : ''}
    <div style="padding:0 8px">
      ${q.options.map((opt, i) => {
        return `<button class="quiz-btn${optionClass}" data-index="${i}">${escapeHtml(opt)}</button>`;
      }).join('')}
    </div>
    <div class="quiz-feedback" id="quizFeedback"></div>
  `;

  quizState.answered = false;

  content.querySelectorAll('.quiz-btn').forEach(btn => {
    btn.addEventListener('click', () => handleQuizAnswer(btn));
  });
}

async function handleQuizAnswer(btn) {
  if (quizState.answered) return;
  quizState.answered = true;

  const q = quizState.questions[quizState.current];
  const selected = btn.textContent;
  const isCorrect = selected === q.correctAnswer;

  if (isCorrect) quizState.score++;

  // Highlight buttons
  content.querySelectorAll('.quiz-btn').forEach(b => {
    b.classList.add('disabled');
    if (b.textContent === q.correctAnswer) b.classList.add('correct');
    if (b === btn && !isCorrect) b.classList.add('wrong');
  });

  // Update SRS stats
  const all = await Storage.getAllTranslations();
  const word = all.find(t => t.id === q.id);
  const updates = isCorrect ? SRS.onCorrect(word || {}) : SRS.onWrong(word || {});
  await Storage.updateTranslation(q.id, updates);

  // Show feedback with SRS info
  const feedback = document.getElementById('quizFeedback');
  const defText = q.definition ? `<br>${escapeHtml(q.definition)}` : '';
  const newLevel = updates.srsLevel;
  const levelLabel = SRS.getLevelLabel(newLevel);
  const srsInfo = isCorrect
    ? `<span class="quiz-srs-info quiz-srs-up">Level: ${levelLabel}</span>`
    : `<span class="quiz-srs-info quiz-srs-down">Reset to: ${levelLabel}</span>`;

  feedback.innerHTML = `${isCorrect ? '✓ Correct!' : '✗ Wrong!'} ${srsInfo}${defText}
    <button class="quiz-next" id="quizNext">${quizState.current + 1 < quizState.questions.length ? 'Next' : 'Finish'}</button>`;

  document.getElementById('quizNext').addEventListener('click', () => {
    quizState.current++;
    renderQuizQuestion();
  });
}

function renderQuizScore() {
  const { questions, score } = quizState;
  const pct = Math.round((score / questions.length) * 100);

  content.innerHTML = `
    <div class="quiz-score">
      <h3>Quiz Complete!</h3>
      <div class="score-num">${score}/${questions.length}</div>
      <p>${pct}% correct</p>
      <button class="quiz-next" id="quizRetry" style="margin-top:20px">Try Again</button>
    </div>
  `;

  document.getElementById('quizRetry').addEventListener('click', renderQuizStart);
}

// ---- FLASHCARDS ----
let flashcardState = null;

async function renderFlashcardsStart() {
  const all = await Storage.getAllTranslations();
  const active = all.filter(t => !t.archived);

  if (active.length === 0) {
    content.innerHTML = `<div class="empty"><div class="empty-icon">🃏</div>No translations to review yet.</div>`;
    return;
  }

  const cards = Quiz.generateFlashcards(active);
  const dueCards = cards.filter(c => c.isDue);

  flashcardState = { cards, current: 0, flipped: false, reviewed: 0, correct: 0 };
  renderFlashcard();
}

function renderFlashcard() {
  const { cards, current, flipped, reviewed, correct } = flashcardState;

  if (cards.length === 0) {
    content.innerHTML = `<div class="empty">No cards to review right now.</div>`;
    return;
  }

  const card = cards[current];
  const syns = card.synonyms && card.synonyms.length
    ? `<div class="flashcard-syns">${card.synonyms.map(s => `<span class="card-tag">${escapeHtml(s)}</span>`).join('')}</div>`
    : '';

  const levelLabel = SRS.getLevelLabel(card.srsLevel);
  const levelColor = SRS.getLevelColor(card.srsLevel);
  const cardRtl = isRTL(card.targetLang || 'fa');

  content.innerHTML = `
    <div class="flashcard-container">
      <div class="flashcard-status">
        <span class="fc-srs-badge" style="color:${levelColor};border-color:${levelColor}33;background:${levelColor}15">${levelLabel}</span>
        ${card.isDue ? '<span class="fc-due-badge">Due</span>' : ''}
      </div>
      <div class="flashcard ${flipped ? 'flipped' : ''}" id="flashcard">
        <div class="flashcard-inner">
          <div class="flashcard-front">
            <div class="flashcard-word">${escapeHtml(card.front)}</div>
            ${card.pronunciation ? `<div class="flashcard-pron">/${escapeHtml(card.pronunciation)}/</div>` : ''}
            <div class="flashcard-hint">Click to flip</div>
          </div>
          <div class="flashcard-back">
            <div class="flashcard-answer${cardRtl ? ' flashcard-answer-rtl' : ''}">${escapeHtml(card.back)}</div>
            ${card.definition ? `<div class="flashcard-def">${escapeHtml(card.definition)}</div>` : ''}
            ${syns}
          </div>
        </div>
      </div>
      <div class="flashcard-counter">Card ${current + 1} of ${cards.length}</div>
      <div class="flashcard-actions">
        <button class="btn-learning" id="fcWrong">Didn't Know</button>
        <button class="btn-know" id="fcCorrect">Got It</button>
      </div>
      <div class="flashcard-nav" style="margin-top:12px">
        <button id="fcPrev" ${current === 0 ? 'disabled' : ''}>← Prev</button>
        <button id="fcSkip">Skip</button>
        <button id="fcNext" ${current === cards.length - 1 ? 'disabled' : ''}>Next →</button>
      </div>
    </div>
  `;

  document.getElementById('flashcard').addEventListener('click', () => {
    flashcardState.flipped = !flashcardState.flipped;
    document.getElementById('flashcard').classList.toggle('flipped');
  });

  document.getElementById('fcPrev').addEventListener('click', () => {
    if (flashcardState.current > 0) {
      flashcardState.current--;
      flashcardState.flipped = false;
      renderFlashcard();
    }
  });

  document.getElementById('fcNext').addEventListener('click', () => {
    if (flashcardState.current < flashcardState.cards.length - 1) {
      flashcardState.current++;
      flashcardState.flipped = false;
      renderFlashcard();
    }
  });

  document.getElementById('fcSkip').addEventListener('click', () => {
    advanceFlashcard();
  });

  document.getElementById('fcCorrect').addEventListener('click', async () => {
    const all = await Storage.getAllTranslations();
    const word = all.find(t => t.id === card.id);
    await Storage.updateTranslation(card.id, SRS.onCorrect(word || {}));
    flashcardState.reviewed++;
    flashcardState.correct++;
    advanceFlashcard();
  });

  document.getElementById('fcWrong').addEventListener('click', async () => {
    const all = await Storage.getAllTranslations();
    const word = all.find(t => t.id === card.id);
    await Storage.updateTranslation(card.id, SRS.onWrong(word || {}));
    flashcardState.reviewed++;
    advanceFlashcard();
  });
}

function advanceFlashcard() {
  if (flashcardState.current < flashcardState.cards.length - 1) {
    flashcardState.current++;
    flashcardState.flipped = false;
    renderFlashcard();
  } else {
    const { reviewed, correct } = flashcardState;
    const pct = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0;
    content.innerHTML = `
      <div class="quiz-score">
        <h3>Review Complete!</h3>
        <div class="score-num">${correct}/${reviewed}</div>
        <p>${reviewed > 0 ? `${pct}% recalled correctly` : 'No cards reviewed'}</p>
        <p class="quiz-summary-hint">Words you got right will appear less often.<br>Words you missed will be shown again soon.</p>
        <button class="quiz-next" id="fcRestart" style="margin-top:20px">Review Again</button>
      </div>
    `;
    document.getElementById('fcRestart').addEventListener('click', renderFlashcardsStart);
  }
}

// ---- DELETE & ARCHIVE ----
function attachDeleteHandlers() {
  content.querySelectorAll('.card-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      await Storage.deleteTranslation(id);
      renderTab();
    });
  });
  content.querySelectorAll('.card-archive').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const card = btn.closest('.card');
      const isArchived = card && card.classList.contains('card-archived');
      if (isArchived) {
        await Storage.unarchiveTranslation(id);
      } else {
        await Storage.archiveTranslation(id);
      }
      renderTab();
    });
  });
}

// Settings button
document.getElementById('openSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Initial render
renderTab();
