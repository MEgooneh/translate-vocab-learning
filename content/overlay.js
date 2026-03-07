(() => {
  // Inject Vazir font
  const fontStyle = document.createElement('style');
  fontStyle.textContent = `
    @font-face {
      font-family: 'Vazirmatn';
      src: url('${chrome.runtime.getURL('fonts/Vazirmatn-Regular.woff2')}') format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Vazirmatn';
      src: url('${chrome.runtime.getURL('fonts/Vazirmatn-Medium.woff2')}') format('woff2');
      font-weight: 500;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Vazirmatn';
      src: url('${chrome.runtime.getURL('fonts/Vazirmatn-SemiBold.woff2')}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Vazirmatn';
      src: url('${chrome.runtime.getURL('fonts/Vazirmatn-Bold.woff2')}') format('woff2');
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
  `;
  document.head.appendChild(fontStyle);

  let isDark = true; // default dark
  chrome.storage.sync.get('theme', ({ theme }) => {
    isDark = (theme || 'dark') === 'dark';
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.theme) {
      isDark = (changes.theme.newValue || 'dark') === 'dark';
      // Update existing elements
      const overlay = document.getElementById('tv-overlay');
      if (overlay) overlay.classList.toggle('tv-dark', isDark);
      if (selectionToolbar) selectionToolbar.classList.toggle('tv-dark', isDark);
    }
  });

  const RTL_LANGS = new Set(['fa', 'ar', 'he', 'ur']);
  function isRTLLang(code) { return RTL_LANGS.has(code); }

  let lastSelectionRect = null;
  let currentTranslationData = null;
  let chatHistory = [];
  let currentAIChatId = null;

  // Detect if text is likely English/Latin
  function isLikelyEnglish(text) {
    const latin = text.replace(/[\s\d\p{P}\p{S}]/gu, '');
    if (!latin.length) return false;
    const latinChars = (latin.match(/[a-zA-Z\u00C0-\u024F]/g) || []).length;
    return latinChars / latin.length > 0.7;
  }

  // Floating selection toolbar
  let selectionToolbar = null;

  function removeSelectionToolbar() {
    if (selectionToolbar) {
      selectionToolbar.remove();
      selectionToolbar = null;
    }
  }

  function showSelectionToolbar(rect, selectedText) {
    removeSelectionToolbar();

    const toolbar = document.createElement('div');
    toolbar.id = 'tv-sel-toolbar';
    if (isDark) toolbar.classList.add('tv-dark');

    const abovePos = rect.top + window.scrollY - 40;
    const belowPos = rect.bottom + window.scrollY + 8;
    const top = abovePos >= window.scrollY ? abovePos : belowPos;
    const left = Math.max(8, Math.min(
      rect.left + window.scrollX + (rect.width / 2) - 80,
      window.innerWidth - 170
    ));
    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${left}px`;

    toolbar.innerHTML = `
      <button class="tv-sel-btn tv-sel-translate" id="tvSelTranslate">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>
        Translate
      </button>
      <div class="tv-sel-divider"></div>
      <button class="tv-sel-btn tv-sel-askai" id="tvSelAskAI">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Ask AI
      </button>
    `;

    document.body.appendChild(toolbar);
    selectionToolbar = toolbar;

    toolbar.querySelector('#tvSelTranslate').addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeSelectionToolbar();
      triggerTranslate(selectedText);
    });

    toolbar.querySelector('#tvSelAskAI').addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeSelectionToolbar();
      showAskAI(selectedText, window.location.href);
    });
  }

  async function triggerTranslate(text) {
    if (text.length > 500) {
      showError('Text is too long (max 500 characters). Select a shorter phrase.');
      return;
    }
    showLoading(text);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TRANSLATE',
        text: text
      });
      if (response.error) {
        showError(response.error);
      } else {
        showOverlay(response.data);
      }
    } catch (e) {
      showError(e.message);
    }
  }

  // Track selection position so we have it when context menu fires
  document.addEventListener('mouseup', (e) => {
    // Ignore clicks inside our own UI
    if (e.target.closest('#tv-overlay') || e.target.closest('#tv-sel-toolbar')) return;

    setTimeout(() => {
      const sel = window.getSelection();
      if (sel.rangeCount > 0 && sel.toString().trim()) {
        lastSelectionRect = sel.getRangeAt(0).getBoundingClientRect();
        const selectedText = sel.toString().trim();
        if (selectedText.length >= 1 && selectedText.length <= 500 && isLikelyEnglish(selectedText)) {
          showSelectionToolbar(lastSelectionRect, selectedText);
        }
      } else {
        removeSelectionToolbar();
      }
    }, 10);
  });

  document.addEventListener('mousedown', (e) => {
    if (selectionToolbar && !selectionToolbar.contains(e.target)) {
      removeSelectionToolbar();
    }
  });

  document.addEventListener('keydown', (e) => {
    removeSelectionToolbar();
    if (e.key === 'Escape') removeOverlay();
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    // Code blocks: ```lang\ncode\n```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre class="tv-md-pre"><code class="tv-md-code-block">${code.trim()}</code></pre>`;
    });

    // Inline code: `code`
    html = html.replace(/`([^`\n]+)`/g, '<code class="tv-md-inline-code">$1</code>');

    // Bold + italic: ***text*** or ___text___
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

    // Bold: **text** or __text__
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_
    html = html.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '<em>$1</em>');
    html = html.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '<em>$1</em>');

    // Headers: # ## ### (at line start)
    html = html.replace(/^### (.+)$/gm, '<h4 class="tv-md-h">$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 class="tv-md-h">$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h3 class="tv-md-h">$1</h3>');

    // Unordered lists: - item or * item
    html = html.replace(/^[\-\*] (.+)$/gm, '<li class="tv-md-li">$1</li>');
    html = html.replace(/((?:<li class="tv-md-li">.*<\/li>\n?)+)/g, '<ul class="tv-md-ul">$1</ul>');

    // Ordered lists: 1. item
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="tv-md-li-ol">$1</li>');
    html = html.replace(/((?:<li class="tv-md-li-ol">.*<\/li>\n?)+)/g, '<ol class="tv-md-ol">$1</ol>');

    // Line breaks: double newline = paragraph break, single = <br>
    html = html.replace(/\n\n+/g, '</p><p class="tv-md-p">');
    html = html.replace(/\n/g, '<br>');

    // Wrap in paragraph if not already block-level
    if (!html.startsWith('<')) {
      html = `<p class="tv-md-p">${html}</p>`;
    }

    return html;
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

  function getOverlayPosition() {
    const sel = window.getSelection();
    let rect = lastSelectionRect;
    if (sel.rangeCount > 0 && sel.toString().trim()) {
      rect = sel.getRangeAt(0).getBoundingClientRect();
    }
    if (rect) {
      let top = rect.bottom + window.scrollY + 8;
      let left = Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - 350));
      // If overlay would go below visible area, show it above the selection
      const viewBottom = window.scrollY + window.innerHeight;
      if (top + 300 > viewBottom && rect.top + window.scrollY > 320) {
        top = rect.top + window.scrollY - 310;
      }
      return { top, left };
    }
    return { top: 100, left: 100 };
  }

  function removeOverlay() {
    const existing = document.getElementById('tv-overlay');
    if (existing) existing.remove();
    removeSelectionToolbar();
    if (_outsideClickHandler) {
      document.removeEventListener('click', _outsideClickHandler);
      _outsideClickHandler = null;
    }
    currentTranslationData = null;
    chatHistory = [];
    currentAIChatId = null;
  }

  function createOverlayShell() {
    removeSelectionToolbar();
    removeOverlay();
    const overlay = document.createElement('div');
    overlay.id = 'tv-overlay';
    if (isDark) overlay.classList.add('tv-dark');
    const pos = getOverlayPosition();
    overlay.style.top = `${pos.top}px`;
    overlay.style.left = `${pos.left}px`;
    document.body.appendChild(overlay);
    return overlay;
  }

  let _outsideClickHandler = null;

  function attachCloseHandlers(overlay) {
    const closeBtn = overlay.querySelector('.tv-close');
    if (closeBtn) closeBtn.addEventListener('click', removeOverlay);

    // Remove any previous outside-click handler
    if (_outsideClickHandler) {
      document.removeEventListener('click', _outsideClickHandler);
    }

    setTimeout(() => {
      _outsideClickHandler = function(e) {
        if (!overlay.contains(e.target) && !e.target.closest('#tv-sel-toolbar')) {
          removeOverlay();
          document.removeEventListener('click', _outsideClickHandler);
          _outsideClickHandler = null;
        }
      };
      document.addEventListener('click', _outsideClickHandler);
    }, 200);
  }

  function showLoading(text) {
    const overlay = createOverlayShell();
    overlay.innerHTML = `
      <div class="tv-header">
        <span class="tv-source">Translating...</span>
        <span class="tv-close">&times;</span>
      </div>
      <div class="tv-loading-body">
        <div class="tv-original">${escapeHtml(text)}</div>
        <div class="tv-spinner">
          <div class="tv-spinner-ring"></div>
        </div>
      </div>
    `;
    attachCloseHandlers(overlay);
  }

  function showOverlay(data) {
    const overlay = document.getElementById('tv-overlay') || createOverlayShell();
    currentTranslationData = data;
    const rtl = isRTLLang(data.targetLang);
    chatHistory = [
      { role: 'user', content: `I translated "${data.originalText}" to "${data.translatedText}". Definition: ${data.definition || 'N/A'}. Synonyms: ${(data.synonyms || []).join(', ') || 'N/A'}.` },
      { role: 'assistant', content: `Translation context loaded for "${data.originalText}".` }
    ];

    const splitSyns = splitSynonyms(data.synonyms);
    const synonymsHtml = splitSyns.length
      ? `<div class="tv-synonyms">
           <div class="tv-synonyms-label">Synonyms</div>
           <div class="tv-synonyms-list">${splitSyns.map(s =>
             `<span class="tv-syn-chip">${escapeHtml(s)}</span>`
           ).join('')}</div>
         </div>`
      : '';

    const definitionHtml = data.definition
      ? `<div class="tv-definition">${escapeHtml(data.definition)}</div>`
      : '';

    const pronunciationHtml = data.pronunciation
      ? `<div class="tv-pronunciation">/${escapeHtml(data.pronunciation)}/</div>`
      : '';

    overlay.innerHTML = `
      <div class="tv-header">
        <span class="tv-source">${data.source === 'google' ? 'Google Translate' : 'AI'}</span>
        <span class="tv-close">&times;</span>
      </div>
      <div class="tv-original">${escapeHtml(data.originalText)}</div>
      ${pronunciationHtml}
      <div class="tv-translation${rtl ? ' tv-translation-rtl' : ''}">${escapeHtml(data.translatedText)}</div>
      ${definitionHtml}
      ${synonymsHtml}
      <div class="tv-chat-toggle" id="tvChatToggle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Ask Grok</div>
      <div class="tv-chat" id="tvChat" hidden>
        <div class="tv-chat-messages" id="tvChatMessages"></div>
        <div class="tv-chat-input-row">
          <input type="text" class="tv-chat-input" id="tvChatInput" placeholder="Ask about this word...">
          <button class="tv-chat-send" id="tvChatSend"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>
        </div>
      </div>
    `;

    attachCloseHandlers(overlay);

    const chatToggle = overlay.querySelector('#tvChatToggle');
    const chatPanel = overlay.querySelector('#tvChat');
    const chatInput = overlay.querySelector('#tvChatInput');
    const chatSend = overlay.querySelector('#tvChatSend');

    chatToggle.addEventListener('click', () => {
      chatToggle.hidden = true;
      chatPanel.hidden = false;
      chatInput.focus();
    });

    chatSend.addEventListener('click', () => sendChatMessage(overlay));
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage(overlay);
      }
    });
  }

  async function sendChatMessage(overlay, inputSel = '#tvChatInput', msgSel = '#tvChatMessages', sendSel = '#tvChatSend') {
    const input = overlay.querySelector(inputSel);
    const messagesEl = overlay.querySelector(msgSel);
    const sendBtn = overlay.querySelector(sendSel);
    const userText = input.value.trim();
    if (!userText) return;

    // Show user message
    messagesEl.innerHTML += `<div class="tv-chat-msg tv-chat-user">${escapeHtml(userText)}</div>`;
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    // Show typing indicator
    messagesEl.innerHTML += `<div class="tv-chat-msg tv-chat-assistant tv-chat-typing"><div class="tv-typing-dots"><span class="tv-typing-dot"></span><span class="tv-typing-dot"></span><span class="tv-typing-dot"></span></div></div>`;
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Add to history
    chatHistory.push({ role: 'user', content: userText });

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHAT',
        messages: chatHistory
      });

      // Remove typing indicator
      const typingEl = messagesEl.querySelector('.tv-chat-typing');
      if (typingEl) typingEl.remove();

      if (response.error) {
        messagesEl.innerHTML += `<div class="tv-chat-msg tv-chat-error">${escapeHtml(response.error)}</div>`;
      } else {
        chatHistory.push({ role: 'assistant', content: response.reply });
        messagesEl.innerHTML += `<div class="tv-chat-msg tv-chat-assistant tv-md">${renderMarkdown(response.reply)}</div>`;
        // Update saved AI chat with new messages
        if (currentAIChatId) {
          chrome.runtime.sendMessage({
            type: 'UPDATE_AI_CHAT',
            id: currentAIChatId,
            messages: chatHistory
          });
        }
      }
    } catch (e) {
      const typingEl = messagesEl.querySelector('.tv-chat-typing');
      if (typingEl) typingEl.remove();
      messagesEl.innerHTML += `<div class="tv-chat-msg tv-chat-error">${escapeHtml(e.message)}</div>`;
    }

    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function getSurroundingContext(maxChars = 500) {
    const sel = window.getSelection();
    if (!sel.rangeCount || !sel.toString().trim()) return '';
    const range = sel.getRangeAt(0);
    // Walk up to find a meaningful container
    let container = range.commonAncestorContainer;
    if (container.nodeType === Node.TEXT_NODE) container = container.parentElement;
    // Go up a couple levels to get broader context
    for (let i = 0; i < 3 && container.parentElement && container.parentElement !== document.body; i++) {
      container = container.parentElement;
    }
    const text = (container.textContent || '').trim();
    if (text.length <= maxChars) return text;
    // Center the selection within the context window
    const selectedText = sel.toString().trim();
    const idx = text.indexOf(selectedText);
    if (idx === -1) return text.slice(0, maxChars);
    const half = Math.floor((maxChars - selectedText.length) / 2);
    const start = Math.max(0, idx - half);
    const end = Math.min(text.length, idx + selectedText.length + half);
    return text.slice(start, end);
  }

  async function showAskAI(selectedText, pageUrl) {
    const overlay = createOverlayShell();
    overlay.innerHTML = `
      <div class="tv-header">
        <span class="tv-source tv-source-ai"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 0 1 4 4v1a3 3 0 0 1 3 3v1a2 2 0 0 1-2 2h-1l1 5h-3l-1-5h-2l-1 5H7l1-5H7a2 2 0 0 1-2-2v-1a3 3 0 0 1 3-3V6a4 4 0 0 1 4-4z"/></svg>Grok</span>
        <span class="tv-close">&times;</span>
      </div>
      <div class="tv-ai-query">${escapeHtml(selectedText)}</div>
      <div class="tv-ai-response" id="tvAiResponse">
        <div class="tv-typing-dots"><span class="tv-typing-dot"></span><span class="tv-typing-dot"></span><span class="tv-typing-dot"></span></div>
      </div>
      <div class="tv-chat" id="tvAiChat" hidden>
        <div class="tv-chat-messages" id="tvAiChatMessages"></div>
        <div class="tv-chat-input-row">
          <input type="text" class="tv-chat-input" id="tvAiChatInput" placeholder="Ask a follow-up...">
          <button class="tv-chat-send" id="tvAiChatSend"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>
        </div>
      </div>
    `;
    attachCloseHandlers(overlay);

    const context = getSurroundingContext();

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ASK_AI',
        text: selectedText,
        context: context,
        url: pageUrl
      });

      const responseEl = overlay.querySelector('#tvAiResponse');
      if (!responseEl) return;

      if (response.error) {
        responseEl.innerHTML = `<span class="tv-ai-error-text">${escapeHtml(response.error)}</span>`;
        return;
      }

      responseEl.innerHTML = renderMarkdown(response.reply);
      responseEl.classList.add('tv-ai-response-ready');
      responseEl.classList.add('tv-md');

      // Initialize chat for follow-up
      chatHistory = [
        { role: 'user', content: `I selected "${selectedText}" on ${pageUrl}. Context: "${context}". Explain it briefly.` },
        { role: 'assistant', content: response.reply }
      ];

      // Save the AI conversation
      const savedChat = await chrome.runtime.sendMessage({
        type: 'SAVE_AI_CHAT',
        data: {
          selectedText,
          url: pageUrl,
          aiResponse: response.reply,
          messages: chatHistory,
          timestamp: Date.now()
        }
      });
      currentAIChatId = savedChat.id;

      // Show follow-up chat
      const chatPanel = overlay.querySelector('#tvAiChat');
      chatPanel.hidden = false;

      const chatInput = overlay.querySelector('#tvAiChatInput');
      const chatSend = overlay.querySelector('#tvAiChatSend');

      chatSend.addEventListener('click', () => sendChatMessage(overlay, '#tvAiChatInput', '#tvAiChatMessages', '#tvAiChatSend'));
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendChatMessage(overlay, '#tvAiChatInput', '#tvAiChatMessages', '#tvAiChatSend');
        }
      });
    } catch (e) {
      const responseEl = overlay.querySelector('#tvAiResponse');
      if (responseEl) {
        responseEl.innerHTML = `<span class="tv-ai-error-text">${escapeHtml(e.message)}</span>`;
      }
    }
  }

  function showError(message) {
    const overlay = document.getElementById('tv-overlay') || createOverlayShell();

    overlay.innerHTML = `
      <div class="tv-header">
        <span class="tv-source tv-error-badge">Error</span>
        <span class="tv-close">&times;</span>
      </div>
      <div class="tv-error-msg">${escapeHtml(message)}</div>
    `;
    attachCloseHandlers(overlay);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SHOW_LOADING') {
      showLoading(message.text);
    } else if (message.type === 'SHOW_TRANSLATION') {
      showOverlay(message.data);
    } else if (message.type === 'SHOW_ERROR') {
      showError(message.message);
    } else if (message.type === 'ASK_AI_INIT') {
      showAskAI(message.text, message.url);
    }
  });
})();
