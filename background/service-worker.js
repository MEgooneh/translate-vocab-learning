importScripts('../lib/storage.js', '../lib/languages.js', '../lib/translator.js');

async function updateContextMenu() {
  const targetLang = await Storage.getTargetLang();
  const lang = getLang(targetLang);
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'translate-selection',
      title: `Translate to ${lang.nativeName}`,
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'ask-ai',
      title: 'Ask AI about this',
      contexts: ['selection']
    });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await Storage.migrateToProfiles();
  await updateContextMenu();
});

// Update context menu when target language changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.targetLang) updateContextMenu();
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHAT') {
    Translator.chat(message.messages)
      .then(reply => sendResponse({ reply }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'ASK_AI') {
    Translator.askAI(message.text, message.context, message.url)
      .then(reply => sendResponse({ reply }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'TRANSLATE') {
    Translator.translate(message.text)
      .then(async (result) => {
        result.url = sender.tab?.url || '';
        await Storage.saveTranslation(result);
        sendResponse({ data: result });
      })
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'SAVE_AI_CHAT') {
    Storage.saveAIChat(message.data)
      .then(saved => sendResponse(saved))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (message.type === 'UPDATE_AI_CHAT') {
    Storage.updateAIChat(message.id, { messages: message.messages })
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

// Ensure content script is injected, then send message
async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    // Content script not loaded yet — inject it first
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/overlay.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content/overlay.css']
    });
    await chrome.tabs.sendMessage(tabId, message);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const selectedText = (info.selectionText || '').trim();
  if (!selectedText) return;

  if (info.menuItemId === 'translate-selection') {
    await sendToTab(tab.id, {
      type: 'SHOW_LOADING',
      text: selectedText
    });

    try {
      const result = await Translator.translate(selectedText);
      result.url = tab.url || '';
      await Storage.saveTranslation(result);
      await sendToTab(tab.id, {
        type: 'SHOW_TRANSLATION',
        data: result
      });
    } catch (error) {
      console.error('Translation failed:', error);
      await sendToTab(tab.id, {
        type: 'SHOW_ERROR',
        message: error.message
      });
    }
  }

  if (info.menuItemId === 'ask-ai') {
    // Tell content script to gather context and initiate Ask AI
    await sendToTab(tab.id, {
      type: 'ASK_AI_INIT',
      text: selectedText,
      url: tab.url || ''
    });
  }
});
