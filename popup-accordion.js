(function () {
  try {
    window.close = function () {};
    globalThis.close = function () {};
  } catch (_) {}
  const STORAGE_KEY = 'imt_popup_accordion_open';

  function initAccordion() {
    if (document.getElementById('imt-accordion-toggle')) return;

    const mount = document.getElementById('mount');
    if (!mount) return;

    // 默认折叠（极简）
    const savedState = localStorage.getItem(STORAGE_KEY);
    const isOpen = savedState === 'true';

    document.body.classList.toggle('accordion-open', isOpen);
    document.body.classList.toggle('accordion-closed', !isOpen);

    const toggle = document.createElement('div');
    toggle.id = 'imt-accordion-toggle';
    toggle.className = 'imt-accordion-header';
    toggle.setAttribute('role', 'button');
    toggle.setAttribute('tabindex', '0');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.innerHTML = `
      <div class="imt-accordion-header-left">
        <svg class="imt-accordion-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        <span class="imt-accordion-title">网页翻译设置</span>
      </div>
      <svg class="imt-accordion-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;

    function onToggle(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const currentlyOpen = document.body.classList.contains('accordion-open');
      const nextOpen = !currentlyOpen;
      document.body.classList.toggle('accordion-open', nextOpen);
      document.body.classList.toggle('accordion-closed', !nextOpen);
      toggle.setAttribute('aria-expanded', String(nextOpen));
      localStorage.setItem(STORAGE_KEY, String(nextOpen));
    }

    toggle.addEventListener('click', onToggle);
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        onToggle(e);
      }
    });

    mount.parentNode.insertBefore(toggle, mount);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAccordion);
  } else {
    initAccordion();
  }
})();
