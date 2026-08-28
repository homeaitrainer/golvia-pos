import gsap from 'gsap';

export function animatePageIn(selector = '.golvia-page') {
  const el = document.querySelector(selector);
  if (!el) return;
  gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
}

export function flashElement(el) {
  if (!el) return;
  gsap.fromTo(el, { backgroundColor: '#e3f6f2' }, { backgroundColor: '#ffffff', duration: 0.25, ease: 'power1.out' });
}

export function successPulse(el, onComplete) {
  if (!el) { onComplete?.(); return; }
  gsap.timeline({ onComplete })
    .to(el, { scale: 1.06, duration: 0.1, ease: 'power1.out' })
    .to(el, { scale: 1, duration: 0.14, ease: 'power1.in' });
}
