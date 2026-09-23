(() => {
  const previous = document.querySelector('body > nav');
  const nav = document.createElement('nav');
  nav.className = 'cd-nav';
  nav.innerHTML = `
    <a class="cd-brand" href="/" aria-label="CatchDog — inicio / home">
      <img src="/logo_nav.png" alt="" width="34" height="34">
      <span class="cd-brand-name">Catch<span>Dog</span></span>
    </a>
    <div class="cd-links" id="cd-nav-links">
      <a href="/#hiw" data-key="how">How it works</a>
      <a href="/startups.html" data-key="startups">For Startups</a>
      <a href="/educacion.html" data-key="education">Education</a>
      <a href="/#about" data-key="about">About</a>
      <a href="/#contact" data-key="contact">Contact</a>
      <a href="/#blog" data-key="blog">Blog</a>
      <a href="/#contact" class="cd-mobile-cta" data-key="cta">Get started</a>
    </div>
    <div class="cd-actions">
      <div class="cd-lang" role="group" aria-label="Idioma / Language">
        <button type="button" data-lang="en">EN</button>
        <button type="button" data-lang="es">ES</button>
      </div>
      <a href="/#contact" class="cd-cta" data-key="cta">Get started</a>
      <button type="button" class="cd-menu-button" aria-controls="cd-nav-links" aria-expanded="false">Menu</button>
    </div>`;

  if (previous) previous.replaceWith(nav);
  else document.body.insertBefore(nav, document.body.firstChild);

  const path = window.location.pathname.toLowerCase();
  const isPost = /^\/post(?:\.html)?$/.test(path) || path.startsWith('/posts/');
  const active = path === '/educacion.html' ? 'education'
    : path === '/startups.html' ? 'startups'
    : isPost ? 'blog' : null;
  if (active) nav.querySelector(`[data-key="${active}"]`).setAttribute('aria-current', 'page');

  const words = {
    en: { how:'How it works', startups:'For Startups', education:'Education', about:'About', contact:'Contact', blog:'Blog', cta:'Get started', menu:'Menu', navigation:'Main navigation' },
    es: { how:'Cómo funciona', startups:'Para Startups', education:'Educación', about:'Acerca de', contact:'Contacto', blog:'Blog', cta:'Empezar', menu:'Menú', navigation:'Navegación principal' }
  };
  let currentLang = 'en';
  function setNavLanguage(lang) {
    currentLang = lang === 'es' ? 'es' : 'en';
    const labels = words[currentLang];
    nav.lang = currentLang;
    nav.setAttribute('aria-label', labels.navigation);
    nav.querySelectorAll('[data-key]').forEach(link => { link.textContent = labels[link.dataset.key]; });
    nav.querySelectorAll('.cd-lang button').forEach(button => {
      const selected = button.dataset.lang === currentLang;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    nav.querySelector('.cd-menu-button').textContent = labels.menu;
  }
  window.catchdogNavSetLanguage = setNavLanguage;

  let storedLang = 'en';
  try { storedLang = localStorage.getItem('catchdogLang') || 'en'; } catch (_) {}
  const pageHasLanguage = path === '/' || path === '/index.html' || path === '/educacion.html';
  setNavLanguage(pageHasLanguage ? document.documentElement.lang : storedLang);

  nav.querySelectorAll('.cd-lang button').forEach(button => button.addEventListener('click', () => {
    const lang = button.dataset.lang;
    if (lang === currentLang) return;
    try { localStorage.setItem('catchdogLang', lang); } catch (_) {}
    if (isPost) {
      const translation = document.getElementById('post-translation');
      if (translation?.href && translation.getAttribute('lang') === lang) {
        window.location.assign(translation.href);
        return;
      }
    }
    if (typeof window.setLanguage === 'function') window.setLanguage(lang);
    setNavLanguage(lang);
  }));

  const menuButton = nav.querySelector('.cd-menu-button');
  const links = nav.querySelector('.cd-links');
  function closeMenu() {
    links.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
  }
  menuButton.addEventListener('click', () => {
    const open = links.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(open));
  });
  links.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
})();
