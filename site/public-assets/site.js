const menuButton = document.querySelector('[data-menu-button]');
const siteNavigation = document.querySelector('[data-site-navigation]');

const setNavigationOpen = (open) => {
  if (!menuButton || !siteNavigation) return;
  menuButton.setAttribute('aria-expanded', String(open));
  siteNavigation.dataset.open = String(open);
  document.body.classList.toggle('navigation-open', open);
};

menuButton?.addEventListener('click', () => {
  setNavigationOpen(menuButton.getAttribute('aria-expanded') !== 'true');
});

siteNavigation?.addEventListener('click', (event) => {
  if (event.target instanceof HTMLAnchorElement) setNavigationOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setNavigationOpen(false);
    menuButton?.focus();
  }
});

document.querySelectorAll('[data-current-year]').forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});
