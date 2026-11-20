(() => {
  const metadata = {
    en: {
      title: 'CatchDog — Projects',
      description: 'Selected CatchDog projects: Turi Gestión insurance producer platform, MIArgentina, Yanina Trainer, SmileAccess and Tech & Society.'
    },
    es: {
      title: 'CatchDog — Proyectos',
      description: 'Proyectos de CatchDog: Turi Gestión para productores de seguros, MIArgentina, Yanina Trainer, SmileAccess y Tech & Society.'
    }
  };

  function setLanguage(value) {
    const lang = value === 'es' ? 'es' : 'en';
    document.querySelectorAll('[data-en][data-es]').forEach(element => {
      // Both language variants are trusted, static markup from projects.html.
      element.innerHTML = element.dataset[lang];
    });
    ['alt', 'aria-label'].forEach(attribute => {
      document.querySelectorAll(`[data-en-${attribute}][data-es-${attribute}]`).forEach(element => {
        element.setAttribute(attribute, element.getAttribute(`data-${lang}-${attribute}`));
      });
    });
    document.documentElement.lang = lang;
    document.title = metadata[lang].title;
    document.querySelector('meta[name="description"]').content = metadata[lang].description;
    try { localStorage.setItem('catchdogLang', lang); } catch (_) {}
    if (typeof window.catchdogNavSetLanguage === 'function') window.catchdogNavSetLanguage(lang);
  }

  window.setLanguage = setLanguage;
  let storedLang = 'en';
  try { storedLang = localStorage.getItem('catchdogLang') || 'en'; } catch (_) {}
  setLanguage(storedLang);
})();
