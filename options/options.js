const apiKeyInput = document.getElementById('apiKey');
const baseUrlInput = document.getElementById('baseUrl');
const modelSelect = document.getElementById('modelSelect');
const modelInput = document.getElementById('modelInput');
const toggleBtn = document.getElementById('toggleShow');
const saveBtn = document.getElementById('save');
const testBtn = document.getElementById('test');
const statusEl = document.getElementById('status');
const providerBtns = document.querySelectorAll('.provider-btn');
const baseUrlField = document.getElementById('baseUrlField');
const modelSelectWrapper = document.getElementById('modelSelectWrapper');
const modelInputWrapper = document.getElementById('modelInputWrapper');
const refreshBtn = document.getElementById('refreshModels');
const apiKeyHint = document.getElementById('apiKeyHint');
const modelPriceHint = document.getElementById('modelPriceHint');
const profileSelect = document.getElementById('profileSelect');
const addProfileBtn = document.getElementById('addProfile');
const renameProfileBtn = document.getElementById('renameProfile');
const deleteProfileBtn = document.getElementById('deleteProfile');

const themeBtns = document.querySelectorAll('.theme-btn');
const targetLangSelect = document.getElementById('targetLangSelect');

let currentProvider = 'openrouter';
let modelsCache = [];
let currentProfileId = null;

// Initialize
(async () => {
  // Theme
  const currentTheme = await Theme.init();
  themeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === currentTheme);
  });

  // Target language
  const currentLang = await Storage.getTargetLang();
  for (const [code, lang] of Object.entries(LANGUAGES)) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = `${lang.nativeName} — ${lang.name}`;
    if (code === currentLang) opt.selected = true;
    targetLangSelect.appendChild(opt);
  }

  await Storage.migrateToProfiles();
  const profiles = await Storage.getProfiles();
  const activeProfile = await Storage.getActiveProfile();

  // Populate profile dropdown
  populateProfileDropdown(profiles, activeProfile);

  // Load active profile into form
  if (activeProfile) {
    loadProfileIntoForm(activeProfile);
  }
})();

function populateProfileDropdown(profiles, activeProfile) {
  profileSelect.innerHTML = '';
  for (const p of profiles) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name || `Profile (${profiles.indexOf(p) + 1})`;
    profileSelect.appendChild(opt);
  }
  if (activeProfile) {
    profileSelect.value = activeProfile.id;
    currentProfileId = activeProfile.id;
  }
  deleteProfileBtn.disabled = profiles.length <= 1;
}

function loadProfileIntoForm(profile) {
  currentProfileId = profile.id;
  apiKeyInput.value = profile.apiKey || '';
  baseUrlInput.value = profile.baseUrl || '';
  currentProvider = profile.provider || 'openrouter';

  providerBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === currentProvider);
  });

  updateProviderUI();

  if (profile.model && currentProvider !== 'compatible') {
    modelSelect.dataset.pendingModel = profile.model;
  }
  if (profile.model && currentProvider === 'compatible') {
    modelInput.value = profile.model;
  }

  if (profile.apiKey && currentProvider === 'openrouter') {
    fetchModels();
  } else if (currentProvider === 'openai') {
    loadOpenAIModels();
  }
}

// Profile switching
profileSelect.addEventListener('change', async () => {
  const profiles = await Storage.getProfiles();
  const selected = profiles.find(p => p.id === profileSelect.value);
  if (selected) {
    await Storage.setActiveProfile(selected.id);
    loadProfileIntoForm(selected);
  }
});

// Add profile
addProfileBtn.addEventListener('click', async () => {
  const profiles = await Storage.getProfiles();
  const newProfile = {
    name: `Profile (${profiles.length + 1})`,
    provider: 'openrouter',
    apiKey: '',
    model: 'x-ai/grok-4.1-fast',
    baseUrl: ''
  };
  const saved = await Storage.saveProfile(newProfile);
  await Storage.setActiveProfile(saved.id);

  const updated = await Storage.getProfiles();
  populateProfileDropdown(updated, saved);
  loadProfileIntoForm(saved);
  showStatus('New profile created.', 'success');
});

// Rename profile
renameProfileBtn.addEventListener('click', async () => {
  const profiles = await Storage.getProfiles();
  const current = profiles.find(p => p.id === currentProfileId);
  if (!current) return;

  const newName = prompt('Profile name:', current.name);
  if (newName === null || !newName.trim()) return;

  current.name = newName.trim();
  await Storage.saveProfile(current);

  const updated = await Storage.getProfiles();
  populateProfileDropdown(updated, current);
  showStatus('Profile renamed.', 'success');
});

// Delete profile
deleteProfileBtn.addEventListener('click', async () => {
  const profiles = await Storage.getProfiles();
  if (profiles.length <= 1) {
    showStatus('Cannot delete the only profile.', 'error');
    return;
  }

  const current = profiles.find(p => p.id === currentProfileId);
  if (!confirm(`Delete "${current?.name || 'this profile'}"?`)) return;

  await Storage.deleteProfile(currentProfileId);
  const updated = await Storage.getProfiles();
  const active = await Storage.getActiveProfile();
  populateProfileDropdown(updated, active);
  if (active) loadProfileIntoForm(active);
  showStatus('Profile deleted.', 'success');
});

// Theme toggle
themeBtns.forEach(btn => {
  btn.addEventListener('click', async () => {
    themeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const theme = btn.dataset.theme;
    Theme.apply(theme);
    await Theme.set(theme);
  });
});

// Target language change
targetLangSelect.addEventListener('change', async () => {
  await Storage.setTargetLang(targetLangSelect.value);
  showStatus(`Target language set to ${getLangName(targetLangSelect.value)}`, 'success');
});

// Provider toggle
providerBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    providerBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentProvider = btn.dataset.provider;
    updateProviderUI();
    if (currentProvider === 'openrouter' && apiKeyInput.value.trim()) {
      fetchModels();
    }
  });
});

function updateProviderUI() {
  const isCompatible = currentProvider === 'compatible';
  const isOpenRouter = currentProvider === 'openrouter';
  const isOpenAI = currentProvider === 'openai';

  baseUrlField.hidden = !isCompatible;
  modelSelectWrapper.hidden = isCompatible;
  modelInputWrapper.hidden = !isCompatible;

  if (isOpenRouter) {
    apiKeyHint.innerHTML = 'Get a key at <a href="https://openrouter.ai/keys" target="_blank">openrouter.ai/keys</a>';
    apiKeyInput.placeholder = 'sk-or-...';
  } else if (isOpenAI) {
    apiKeyHint.innerHTML = 'Get a key at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>';
    apiKeyInput.placeholder = 'sk-...';
    loadOpenAIModels();
  } else {
    apiKeyHint.textContent = 'Your API key for the compatible endpoint';
    apiKeyInput.placeholder = 'sk-...';
  }
}

function loadOpenAIModels() {
  const openaiModels = [
    { id: 'gpt-4o', name: 'GPT-4o', price: '$2.50 / $10.00' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', price: '$0.15 / $0.60' },
    { id: 'gpt-4.1', name: 'GPT-4.1', price: '$2.00 / $8.00' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', price: '$0.40 / $1.60' },
    { id: 'gpt-4.1-nano', name: 'GPT-4.1 Nano', price: '$0.10 / $0.40' },
    { id: 'o3-mini', name: 'o3-mini', price: '$1.10 / $4.40' },
  ];
  populateModelDropdown(openaiModels);
}

// Fetch models from OpenRouter
async function fetchModels() {
  refreshBtn.classList.add('spinning');
  modelPriceHint.textContent = 'Loading models...';

  try {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (!response.ok) throw new Error('Failed to fetch models');
    const data = await response.json();

    const models = data.data
      .filter(m => m.id && m.pricing)
      .map(m => ({
        id: m.id,
        name: m.name || m.id,
        price: formatPrice(m.pricing),
        promptPrice: parseFloat(m.pricing.prompt || '0'),
        completionPrice: parseFloat(m.pricing.completion || '0'),
      }))
      .sort((a, b) => {
        const priority = [
          'x-ai/grok-4.1-fast', 'x-ai/grok-4.1',
          'anthropic/claude-sonnet-4', 'anthropic/claude-opus-4',
          'openai/gpt-4o', 'openai/gpt-4o-mini',
          'google/gemini-2.5-pro', 'google/gemini-2.5-flash',
          'meta-llama/llama-4-maverick',
          'deepseek/deepseek-chat-v3', 'deepseek/deepseek-r1',
          'mistralai/mistral-large', 'qwen/qwen3-235b-a22b',
        ];
        const aIdx = priority.indexOf(a.id);
        const bIdx = priority.indexOf(b.id);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return a.name.localeCompare(b.name);
      });

    modelsCache = models;
    populateModelDropdown(models);
    modelPriceHint.textContent = `${models.length} models available`;
  } catch (e) {
    modelPriceHint.textContent = 'Failed to load models. Check your connection.';
    console.error('Failed to fetch models:', e);
  }

  refreshBtn.classList.remove('spinning');
}

function formatPrice(pricing) {
  const prompt = parseFloat(pricing.prompt || '0') * 1_000_000;
  const completion = parseFloat(pricing.completion || '0') * 1_000_000;
  if (prompt === 0 && completion === 0) return 'Free';
  return `$${prompt.toFixed(2)} / $${completion.toFixed(2)}`;
}

function populateModelDropdown(models) {
  const pendingModel = modelSelect.dataset.pendingModel || modelSelect.value;
  modelSelect.innerHTML = '';

  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.name}  —  ${m.price}`;
    modelSelect.appendChild(opt);
  }

  if (pendingModel) {
    const exists = models.find(m => m.id === pendingModel);
    if (exists) {
      modelSelect.value = pendingModel;
    }
    delete modelSelect.dataset.pendingModel;
  }

  updatePriceHint();
}

modelSelect.addEventListener('change', updatePriceHint);

function updatePriceHint() {
  const selected = modelsCache.find(m => m.id === modelSelect.value);
  if (selected) {
    modelPriceHint.textContent = `Price per 1M tokens: ${selected.price} (input / output)`;
  }
}

refreshBtn.addEventListener('click', () => {
  if (currentProvider === 'openrouter') fetchModels();
  if (currentProvider === 'openai') loadOpenAIModels();
});

toggleBtn.addEventListener('click', () => {
  apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
});

saveBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();

  const model = currentProvider === 'compatible'
    ? modelInput.value.trim()
    : modelSelect.value;

  // Save profile
  const profiles = await Storage.getProfiles();
  let profile = profiles.find(p => p.id === currentProfileId);

  if (!profile) {
    // Create first profile
    profile = { name: 'Profile (1)' };
  }

  profile.apiKey = key;
  profile.provider = currentProvider;
  profile.model = model;
  profile.baseUrl = baseUrlInput.value.trim();

  const saved = await Storage.saveProfile(profile);
  await Storage.setActiveProfile(saved.id);
  currentProfileId = saved.id;

  // Also keep flat keys for backward compat
  await chrome.storage.sync.set({
    apiKey: key,
    provider: currentProvider,
    model,
    baseUrl: baseUrlInput.value.trim()
  });

  const updated = await Storage.getProfiles();
  populateProfileDropdown(updated, saved);

  showStatus('Settings saved!', 'success');
});

testBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showStatus('Please enter an API key first.', 'error');
    return;
  }

  const model = currentProvider === 'compatible'
    ? modelInput.value.trim()
    : modelSelect.value;

  if (!model) {
    showStatus('Please select or enter a model first.', 'error');
    return;
  }

  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';

  try {
    let url;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    };

    if (currentProvider === 'openrouter') {
      url = 'https://openrouter.ai/api/v1/chat/completions';
    } else if (currentProvider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
    } else {
      const base = baseUrlInput.value.trim().replace(/\/+$/, '');
      if (!base) {
        showStatus('Please enter a Base URL.', 'error');
        testBtn.disabled = false;
        testBtn.textContent = 'Test Connection';
        return;
      }
      url = `${base}/chat/completions`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
        max_tokens: 5
      })
    });
    clearTimeout(timeout);

    if (response.ok) {
      showStatus('Connection successful! Model is working.', 'success');
    } else {
      const data = await response.json().catch(() => ({}));
      showStatus(`API error: ${data.error?.message || response.statusText}`, 'error');
    }
  } catch (e) {
    showStatus(`Connection error: ${e.message}`, 'error');
  }

  testBtn.disabled = false;
  testBtn.textContent = 'Test Connection';
});

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
  statusEl.hidden = false;
  setTimeout(() => { statusEl.hidden = true; }, 4000);
}
