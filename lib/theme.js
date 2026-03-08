const Theme = {
  async get() {
    const { theme } = await chrome.storage.sync.get('theme');
    return theme || 'dark'; // default dark
  },

  async set(theme) {
    await chrome.storage.sync.set({ theme });
  },

  apply(theme, target = document.documentElement) {
    target.setAttribute('data-theme', theme);
    if (document.body) document.body.setAttribute('data-theme', theme);
  },

  async init(target = document.documentElement) {
    const theme = await this.get();
    this.apply(theme, target);
    return theme;
  }
};
