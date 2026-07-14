import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initParticles } from './particles.js';

gsap.registerPlugin(ScrollTrigger);

initHero();
initReveals();
initParticlesBg();

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

  gsap.set(images, { filter: 'blur(0px)' });

  const segment = 1 / frames.length;
  const overlap = segment * 0.35;
  const maxBlur = 22;

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

    if (i > 0) {
      const crossfadeStart = segmentStart - overlap;
      const crossfadeDuration = overlap * 2;

      // Blur dissolve instead of a zoom/pan drift: the outgoing photo
      // defocuses as it fades out, the incoming one sharpens into focus.
      tl.fromTo(
        images[i - 1],
        { filter: 'blur(0px)' },
        { filter: `blur(${maxBlur}px)`, ease: 'power1.inOut', duration: crossfadeDuration },
        crossfadeStart
      );
      tl.fromTo(
        images[i],
        { filter: `blur(${maxBlur}px)` },
        { filter: 'blur(0px)', ease: 'power1.inOut', duration: crossfadeDuration },
        crossfadeStart
      );

      tl.to(frames[i - 1], { autoAlpha: 0, duration: crossfadeDuration, ease: 'power1.inOut' }, crossfadeStart);
      tl.to(frame, { autoAlpha: 1, duration: crossfadeDuration, ease: 'power1.inOut' }, crossfadeStart);
      tl.to(beats[i - 1], { autoAlpha: 0, duration: overlap * 1.4, ease: 'power1.inOut' }, crossfadeStart);
      tl.to(beats[i], { autoAlpha: 1, duration: overlap * 1.4, ease: 'power1.inOut' }, segmentStart);
    }
  });
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

function initParticlesBg() {
  const container = document.querySelector('[data-particles-bg]');
  if (!container) return;

  // A continuously animating full-page WebGL canvas is exactly the kind of
  // motion prefers-reduced-motion asks sites to skip — same reasoning as
  // the hero's Ken Burns drift, so it doesn't mount at all in that case.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  initParticles(container);
}
