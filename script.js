(() => {
  const root = document.documentElement;
  const toggle = document.querySelector('.language-toggle');
  const translatable = [...document.querySelectorAll('[data-en][data-ru]')];
  const editableContent = [...document.querySelectorAll('[data-content-key]')];

  const setLanguage = (lang) => {
    const next = lang === 'ru' ? 'ru' : 'en';
    root.lang = next;

    translatable.forEach((el) => {
      el.textContent = el.dataset[next];
    });

    editableContent.forEach((el) => {
      const key = el.dataset.contentKey;
      const value = window.JML_CONTENT?.[key]?.[next];
      if (typeof value === 'string') el.textContent = value;
    });

    if (toggle) {
      toggle.querySelectorAll('[data-lang]').forEach((el) => {
        el.classList.toggle('active', el.dataset.lang === next);
      });
      toggle.setAttribute(
        'aria-label',
        next === 'en' ? 'Switch language to Russian' : 'Переключить язык на английский'
      );
    }

    try { localStorage.setItem('jml-language', next); } catch (_) {}
  };

  let saved = 'en';
  try { saved = localStorage.getItem('jml-language') || 'en'; } catch (_) {}
  setLanguage(saved);

  if (toggle) {
    toggle.addEventListener('click', () => {
      setLanguage(root.lang === 'en' ? 'ru' : 'en');
    });
  }

  const revealItems = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    revealItems.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });

  revealItems.forEach((el) => observer.observe(el));
})();
