import { GLOSSARY } from '../glossary';
import { escapeHtml } from '../utils/format';

/**
 * Click-to-open glossary popover for [data-term] elements anywhere in the page.
 * Delegated, so it works for content rendered after boot.
 */
export function initGlossary(): void {
  const pop = document.createElement('div');
  pop.className = 'glossary-pop';
  pop.setAttribute('role', 'dialog');
  document.body.appendChild(pop);

  const close = () => pop.classList.remove('open');

  const open = (target: Element) => {
    const term = target.getAttribute('data-term') ?? '';
    const entry = GLOSSARY[term];
    if (!entry) return;
    pop.innerHTML = `<h4>${escapeHtml(entry.title)}</h4><p>${escapeHtml(entry.body)}</p>`;
    pop.classList.add('open');

    // Position near the trigger, flipped to stay on screen.
    const r = target.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    let left = r.left;
    let top = r.bottom + 8;
    if (left + pr.width > window.innerWidth - 12) left = window.innerWidth - pr.width - 12;
    if (top + pr.height > window.innerHeight - 12) top = r.top - pr.height - 8;
    pop.style.left = `${Math.max(12, left)}px`;
    pop.style.top = `${Math.max(12, top)}px`;
  };

  document.addEventListener('click', (e) => {
    const target = (e.target as Element).closest('[data-term]');
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      open(target);
      return;
    }
    if (!(e.target as Element).closest('.glossary-pop')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    const target = document.activeElement;
    if ((e.key === 'Enter' || e.key === ' ') && target?.matches('[data-term]')) {
      e.preventDefault();
      open(target);
    }
  });

  window.addEventListener('scroll', close, { passive: true });
  window.addEventListener('resize', close);
}
