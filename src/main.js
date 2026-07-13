import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

initHero();
initReveals();

function initHero() {
  const hero = document.querySelector('[data-hero]');
  if (!hero) return;

  const frames = gsap.utils.toArray(hero.querySelectorAll('[data-hero-frame]'));
  const images = gsap.utils.toArray(hero.querySelectorAll('[data-hero-image]'));
  const beats = gsap.utils.toArray(hero.querySelectorAll('[data-hero-beat]'));
  const loader = hero.querySelector('[data-hero-loader]');
  const scrollCue = hero.querySelector('[data-hero-scroll-cue]');

  Promise.all(images.map(preloadImage))
    .catch(() => {
      /* proceed with whichever images loaded; missing ones stay transparent */
    })
    .then(() => {
      if (loader) {
        gsap.to(loader, {
          opacity: 0,
          duration: 0.5,
          ease: 'power1.out',
          onComplete: () => loader.remove(),
        });
      }
      buildScrollSequence({ hero, frames, images, beats, scrollCue });
    });
}

function preloadImage(img) {
  return new Promise((resolve, reject) => {
    if (img.complete && img.naturalWidth) {
      resolve();
      return;
    }
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener('error', () => reject(new Error(`Failed to load ${img.src}`)), {
      once: true,
    });
  });
}

function buildScrollSequence({ hero, frames, images, beats, scrollCue }) {
  gsap.set(frames[0], { autoAlpha: 1 });
  gsap.set(frames.slice(1), { autoAlpha: 0 });
  gsap.set(beats[0], { autoAlpha: 1 });
  gsap.set(beats.slice(1), { autoAlpha: 0 });

  let cueHidden = false;
  const hideScrollCue = () => {
    if (cueHidden || !scrollCue) return;
    cueHidden = true;
    gsap.to(scrollCue, { opacity: 0, duration: 0.4, ease: 'power1.out' });
  };

  // GSAP tweens are driven by JS (inline styles via rAF), not CSS
  // transitions/animations, so the prefers-reduced-motion block in base.css
  // has no effect on them. Check it explicitly and skip the decorative
  // scale/parallax drift (keeping only the crossfade, which is the actual
  // content transition, not decoration).
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The photo panel is a full-height (desktop) / 45vh (mobile) clipped
  // rectangle, so there's more room for a Ken Burns drift than the earlier
  // small contained square allowed, without it looking like it's escaping.
  ScrollTrigger.matchMedia({
    '(min-width: 701px)': () => setupTimeline({ scaleAmount: 1.08, travel: 22 }),
    '(max-width: 700px)': () => setupTimeline({ scaleAmount: 1.04, travel: 10 }),
  });

  function setupTimeline({ scaleAmount, travel }) {
    const segment = 1 / frames.length;
    const overlap = segment * 0.35;

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: '+=250%',
        scrub: 0.8,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          if (self.progress > 0.02) hideScrollCue();
        },
      },
    });

    frames.forEach((frame, i) => {
      const segmentStart = i * segment;

      // Subtle continuous parallax/scale while this frame is on screen.
      if (!prefersReducedMotion) {
        tl.fromTo(
          images[i],
          { scale: 1, y: 0 },
          { scale: scaleAmount, y: -travel, ease: 'none', duration: segment },
          segmentStart
        );
      }

      if (i > 0) {
        const crossfadeStart = segmentStart - overlap;
        tl.to(frames[i - 1], { autoAlpha: 0, duration: overlap * 2, ease: 'power1.inOut' }, crossfadeStart);
        tl.to(frame, { autoAlpha: 1, duration: overlap * 2, ease: 'power1.inOut' }, crossfadeStart);
        tl.to(beats[i - 1], { autoAlpha: 0, duration: overlap * 1.4, ease: 'power1.inOut' }, crossfadeStart);
        tl.to(beats[i], { autoAlpha: 1, duration: overlap * 1.4, ease: 'power1.inOut' }, segmentStart);
      }
    });

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }
}

function initReveals() {
  const targets = gsap.utils.toArray('[data-reveal]');
  if (!targets.length) return;

  targets.forEach((el) => {
    ScrollTrigger.create({
      trigger: el,
      start: 'top 85%',
      onEnter: () => el.classList.add('is-visible'),
      once: true,
    });
  });
}
