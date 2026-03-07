const CHAT_SYSTEM_PROMPT = `You are a concise, helpful assistant. Format your responses using Markdown when appropriate:
- Use **bold** for emphasis and key terms
- Use \`code\` for inline code and \`\`\` for code blocks
- Use bullet points or numbered lists for multiple items
- Keep responses brief and well-structured
- Be direct, no filler words`;

const ASK_AI_SYSTEM_PROMPT = `You are a brilliant, concise assistant. The user selected some text on a webpage and wants a brief explanation.
Format your responses using Markdown:
- Use **bold** for key terms
- Use \`code\` for technical terms/code
- Use bullet points if listing multiple things
- Keep it brief: 2-4 sentences typically, more if the topic demands it
- Be direct, no filler words
- If it's a term/concept, define it simply
- If it's code, explain what it does
- If it's a quote, give context
- Use the page URL and surrounding text for context but don't mention them explicitly`;

const Translator = {
  async getEngine() {
    const { engine } = await chrome.storage.sync.get('engine');
    return engine || 'google';
  },

  async _getAIConfig() {
    const profile = await Storage.getActiveProfile();

    let apiKey, provider, model, baseUrl;
    if (profile) {
      apiKey = profile.apiKey || '';
      provider = profile.provider || 'openrouter';
      model = profile.model || 'x-ai/grok-4.1-fast';
      baseUrl = (profile.baseUrl || '').replace(/\/+$/, '');
    } else {
      // Fallback to flat keys for backward compat
      const data = await chrome.storage.sync.get(['apiKey', 'provider', 'model', 'baseUrl']);
      apiKey = data.apiKey || '';
      provider = data.provider || 'openrouter';
      model = data.model || 'x-ai/grok-4.1-fast';
      baseUrl = (data.baseUrl || '').replace(/\/+$/, '');
    }

    if (!apiKey) throw new Error('No API key configured. Please set it in extension options.');

    let url;
    if (provider === 'openrouter') {
      url = 'https://openrouter.ai/api/v1/chat/completions';
    } else if (provider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
    } else {
      if (!baseUrl) throw new Error('No Base URL configured for compatible provider.');
      url = `${baseUrl}/chat/completions`;
    }

    return { apiKey, provider, model, url };
  },

  async _callAI(messages, extraBody = {}) {
    const { apiKey, model, url } = await this._getAIConfig();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages,
          ...extraBody
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Request timed out. Please try again.');
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  },

  async translate(text) {
    const engine = await this.getEngine();
    const targetLang = await Storage.getTargetLang();

    if (engine === 'grok') {
      return await this.aiTranslate(text, targetLang);
    }

    // Google first, AI fallback
    let googleError = null;
    try {
      return await this.googleTranslate(text, 'auto', targetLang);
    } catch (e) {
      googleError = e;
      console.warn('Google Translate failed, trying AI fallback:', e.message);
    }

    try {
      return await this.aiTranslate(text, targetLang);
    } catch (e) {
      const apiKey = await Storage.getApiKey();
      if (!apiKey) {
        throw new Error(`Google Translate failed (${googleError.message}). Set an API key in extension options to enable fallback.`);
      }
      throw new Error(`Google Translate failed (${googleError.message}). AI fallback also failed: ${e.message}`);
    }
  },

  async googleTranslate(text, sourceLang, targetLang) {
    const urls = [
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&dt=ss&dt=rm&dt=md&dt=at&q=${encodeURIComponent(text)}`,
      `https://translate.google.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&dt=ss&dt=rm&dt=md&dt=at&q=${encodeURIComponent(text)}`
    ];

    let lastError;
    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await this._parseGoogleResponse(text, sourceLang, targetLang, await response.json());
      } catch (e) {
        lastError = e;
      }
    }
    throw new Error(`Google Translate: ${lastError.message}`);
  },

  _parseGoogleResponse(text, sourceLang, targetLang, data) {
    const translation = (data[0] || [])
      .filter(s => s && s[0])
      .map(s => s[0])
      .join('');

    const detectedLang = data[2] || sourceLang;

    let pronunciation = '';
    if (data[0]) {
      for (const segment of data[0]) {
        if (segment && segment[3]) {
          pronunciation = segment[3];
          break;
        }
      }
    }

    const synonyms = this.parseGoogleSynonyms(data[1] || data[11] || []);
    const definition = this.parseGoogleDefinitions(data[12] || []);

    return {
      originalText: text,
      translatedText: translation,
      sourceLang: detectedLang,
      targetLang,
      synonyms,
      definition,
      pronunciation,
      source: 'google',
      timestamp: Date.now()
    };
  },

  parseGoogleSynonyms(synData) {
    const synonyms = [];
    if (!Array.isArray(synData)) return synonyms;
    try {
      for (const group of synData) {
        if (!Array.isArray(group) || !group[1]) continue;
        for (const entry of group[1]) {
          if (!Array.isArray(entry)) continue;
          const val = entry[0];
          if (typeof val === 'string') {
            const parts = val.split(',').map(s => s.trim()).filter(Boolean);
            for (const word of parts) {
              if (!synonyms.includes(word)) synonyms.push(word);
              if (synonyms.length >= 8) return synonyms;
            }
          } else if (Array.isArray(val)) {
            for (const item of val) {
              if (typeof item === 'string' && item.trim()) {
                const w = item.trim();
                if (!synonyms.includes(w)) synonyms.push(w);
                if (synonyms.length >= 8) return synonyms;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('Synonym parsing error:', e);
    }
    return synonyms;
  },

  parseGoogleDefinitions(defData) {
    if (!Array.isArray(defData)) return '';
    for (const group of defData) {
      if (Array.isArray(group) && group[1] && Array.isArray(group[1])) {
        for (const entry of group[1]) {
          if (Array.isArray(entry) && entry[0]) {
            return entry[0];
          }
        }
      }
    }
    return '';
  },

  async aiTranslate(text, targetLang) {
    const langInfo = typeof getLang === 'function' ? getLang(targetLang) : { name: targetLang };
    const langName = langInfo.name || targetLang;
    const prompt = `Translate the following text to ${langName}. Also provide:
1. The translation
2. Up to 5 synonyms in the original/source language
3. A brief definition in English (1 sentence)
4. Pronunciation guide (phonetic/IPA)

Text: "${text}"

Respond ONLY with valid JSON in this exact format:
{
  "translation": "...",
  "detectedLang": "en",
  "synonyms": ["word1", "word2"],
  "definition": "brief definition here",
  "pronunciation": "phonetic pronunciation"
}`;

    const content = await this._callAI([
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      { role: 'user', content: prompt }
    ], { response_format: { type: 'json_object' } });

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('AI returned invalid response. Please try again.');
    }

    return {
      originalText: text,
      translatedText: parsed.translation,
      sourceLang: parsed.detectedLang || 'en',
      targetLang,
      synonyms: parsed.synonyms || [],
      definition: parsed.definition || '',
      pronunciation: parsed.pronunciation || '',
      source: 'ai',
      timestamp: Date.now()
    };
  },

  async askAI(text, context, url) {
    const userMsg = `Selected text: "${text}"
Page URL: ${url}
Surrounding context: "${context}"

Briefly explain the selected text.`;

    return await this._callAI([
      { role: 'system', content: ASK_AI_SYSTEM_PROMPT },
      { role: 'user', content: userMsg }
    ]);
  },

  async chat(messages) {
    return await this._callAI([
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      ...messages
    ]);
  }
};
