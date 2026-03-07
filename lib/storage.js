const Storage = {
  async saveTranslation(entry) {
    const { translations = [] } = await chrome.storage.local.get('translations');
    entry.id = crypto.randomUUID();
    entry.reviewCount = 0;
    entry.lastReviewed = null;
    entry.correctCount = 0;
    entry.wrongCount = 0;
    entry.srsLevel = 0;
    entry.archived = false;
    translations.unshift(entry);
    await chrome.storage.local.set({ translations });
    return entry;
  },

  async archiveTranslation(id) {
    await this.updateTranslation(id, { archived: true });
  },

  async unarchiveTranslation(id) {
    await this.updateTranslation(id, { archived: false });
  },

  async getActiveTranslations() {
    const all = await this.getAllTranslations();
    return all.filter(t => !t.archived);
  },

  async getAllTranslations() {
    const { translations = [] } = await chrome.storage.local.get('translations');
    return translations;
  },

  async getTranslationsToday() {
    const translations = await this.getAllTranslations();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return translations.filter(t => t.timestamp >= todayStart.getTime());
  },

  _friendlyDate(timestamp) {
    const d = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
    const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (dateOnly.getTime() === today.getTime()) return 'Today';
    if (dateOnly.getTime() === yesterday.getTime()) return 'Yesterday';
    if (dateOnly >= weekAgo) {
      return d.toLocaleDateString('en-US', { weekday: 'long' });
    }
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  },

  async getTranslationsGroupedByDate() {
    const translations = await this.getAllTranslations();
    const groups = {};
    for (const t of translations) {
      const label = this._friendlyDate(t.timestamp);
      if (!groups[label]) groups[label] = [];
      groups[label].push(t);
    }
    return groups;
  },

  async updateTranslation(id, updates) {
    const { translations = [] } = await chrome.storage.local.get('translations');
    const index = translations.findIndex(t => t.id === id);
    if (index !== -1) {
      Object.assign(translations[index], updates);
      await chrome.storage.local.set({ translations });
    }
  },

  async deleteTranslation(id) {
    const { translations = [] } = await chrome.storage.local.get('translations');
    const filtered = translations.filter(t => t.id !== id);
    await chrome.storage.local.set({ translations: filtered });
  },

  async clearAll() {
    await chrome.storage.local.set({ translations: [] });
  },

  async getTargetLang() {
    const { targetLang } = await chrome.storage.sync.get('targetLang');
    return targetLang || 'fa';
  },

  async setTargetLang(lang) {
    await chrome.storage.sync.set({ targetLang: lang });
  },

  async getApiKey() {
    const { apiKey } = await chrome.storage.sync.get('apiKey');
    return apiKey || '';
  },

  async setApiKey(key) {
    await chrome.storage.sync.set({ apiKey: key });
  },

  // AI Config Profiles
  async getProfiles() {
    const { aiProfiles = [] } = await chrome.storage.sync.get('aiProfiles');
    return aiProfiles;
  },

  async getActiveProfileId() {
    const { activeProfileId } = await chrome.storage.sync.get('activeProfileId');
    return activeProfileId || null;
  },

  async getActiveProfile() {
    const profiles = await this.getProfiles();
    const activeId = await this.getActiveProfileId();
    if (activeId) {
      const found = profiles.find(p => p.id === activeId);
      if (found) return found;
    }
    return profiles[0] || null;
  },

  async saveProfile(profile) {
    const profiles = await this.getProfiles();
    if (!profile.id) {
      profile.id = crypto.randomUUID();
      if (!profile.name) {
        profile.name = `Profile (${profiles.length + 1})`;
      }
      profiles.push(profile);
    } else {
      const idx = profiles.findIndex(p => p.id === profile.id);
      if (idx !== -1) profiles[idx] = profile;
      else profiles.push(profile);
    }
    await chrome.storage.sync.set({ aiProfiles: profiles });
    return profile;
  },

  async deleteProfile(id) {
    let profiles = await this.getProfiles();
    profiles = profiles.filter(p => p.id !== id);
    const activeId = await this.getActiveProfileId();
    const updates = { aiProfiles: profiles };
    if (activeId === id) {
      updates.activeProfileId = profiles.length ? profiles[0].id : null;
    }
    await chrome.storage.sync.set(updates);
  },

  async setActiveProfile(id) {
    await chrome.storage.sync.set({ activeProfileId: id });
  },

  async migrateToProfiles() {
    const profiles = await this.getProfiles();
    if (profiles.length > 0) return; // already migrated

    const data = await chrome.storage.sync.get(['apiKey', 'provider', 'model', 'baseUrl']);
    if (!data.apiKey) return; // nothing to migrate

    const profile = {
      id: crypto.randomUUID(),
      name: 'Profile (1)',
      provider: data.provider || 'openrouter',
      apiKey: data.apiKey || '',
      model: data.model || 'x-ai/grok-4.1-fast',
      baseUrl: data.baseUrl || ''
    };
    await chrome.storage.sync.set({
      aiProfiles: [profile],
      activeProfileId: profile.id
    });
  },

  // AI Conversations
  async saveAIChat(entry) {
    const { aiChats = [] } = await chrome.storage.local.get('aiChats');
    entry.id = crypto.randomUUID();
    aiChats.unshift(entry);
    await chrome.storage.local.set({ aiChats });
    return entry;
  },

  async getAllAIChats() {
    const { aiChats = [] } = await chrome.storage.local.get('aiChats');
    return aiChats;
  },

  async updateAIChat(id, updates) {
    const { aiChats = [] } = await chrome.storage.local.get('aiChats');
    const index = aiChats.findIndex(c => c.id === id);
    if (index !== -1) {
      Object.assign(aiChats[index], updates);
      await chrome.storage.local.set({ aiChats });
    }
  },

  async deleteAIChat(id) {
    const { aiChats = [] } = await chrome.storage.local.get('aiChats');
    const filtered = aiChats.filter(c => c.id !== id);
    await chrome.storage.local.set({ aiChats: filtered });
  },

  async getAIChatsGroupedByDate() {
    const chats = await this.getAllAIChats();
    const groups = {};
    for (const c of chats) {
      const label = this._friendlyDate(c.timestamp);
      if (!groups[label]) groups[label] = [];
      groups[label].push(c);
    }
    return groups;
  }
};
