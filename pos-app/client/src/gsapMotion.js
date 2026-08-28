import gsap from 'gsap';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function animatePageIn(selector = '.golvia-page') {
  const el = document.querySelector(selector);
  if (!el) return;
  if (prefersReducedMotion()) { gsap.set(el, { opacity: 1, y: 0 }); return; }
  gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out', clearProps: 'transform' });
}

export function flashElement(el) {
  if (!el) return;
  if (prefersReducedMotion()) return;
  // Colors below are literal (GSAP tweens need concrete values) — keep in sync with theme.css's --golvia-accent-tint (#e3f6f2) and --golvia-surface (#ffffff).
  gsap.fromTo(el, { backgroundColor: '#e3f6f2' }, { backgroundColor: '#ffffff', duration: 0.25, ease: 'power1.out' });
}

export function successPulse(el, onComplete) {
  if (!el) { onComplete?.(); return; }
  if (prefersReducedMotion()) { onComplete?.(); return; }
  gsap.timeline({ onComplete })
    .to(el, { scale: 1.06, duration: 0.1, ease: 'power1.out' })
    .to(el, { scale: 1, duration: 0.14, ease: 'power1.in' });
}
