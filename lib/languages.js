const LANGUAGES = {
  fa: { name: 'Persian (Farsi)', nativeName: 'فارسی', rtl: true, font: 'Vazirmatn' },
  ar: { name: 'Arabic', nativeName: 'العربية', rtl: true, font: 'Vazirmatn' },
  he: { name: 'Hebrew', nativeName: 'עברית', rtl: true },
  ur: { name: 'Urdu', nativeName: 'اردو', rtl: true, font: 'Vazirmatn' },
  tr: { name: 'Turkish', nativeName: 'Türkçe' },
  es: { name: 'Spanish', nativeName: 'Español' },
  fr: { name: 'French', nativeName: 'Français' },
  de: { name: 'German', nativeName: 'Deutsch' },
  it: { name: 'Italian', nativeName: 'Italiano' },
  pt: { name: 'Portuguese', nativeName: 'Português' },
  ru: { name: 'Russian', nativeName: 'Русский' },
  zh: { name: 'Chinese (Simplified)', nativeName: '简体中文' },
  ja: { name: 'Japanese', nativeName: '日本語' },
  ko: { name: 'Korean', nativeName: '한국어' },
  hi: { name: 'Hindi', nativeName: 'हिन्दी' },
  nl: { name: 'Dutch', nativeName: 'Nederlands' },
  pl: { name: 'Polish', nativeName: 'Polski' },
  sv: { name: 'Swedish', nativeName: 'Svenska' },
  uk: { name: 'Ukrainian', nativeName: 'Українська' },
  vi: { name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  th: { name: 'Thai', nativeName: 'ไทย' },
  id: { name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
};

function getLang(code) {
  return LANGUAGES[code] || { name: code, nativeName: code };
}

function isRTL(code) {
  return !!(LANGUAGES[code] && LANGUAGES[code].rtl);
}

function getLangName(code) {
  const lang = LANGUAGES[code];
  return lang ? lang.nativeName : code;
}
