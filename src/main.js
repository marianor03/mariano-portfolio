import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initParticles } from './particles.js';
import { initOrbit } from './orbit.js';

gsap.registerPlugin(ScrollTrigger);

initHero();
initReveals();
initScrollCueActivity();
initPlanetPages();

function initHero() {
  const hero = document.querySelector('[data-hero]');
  if (!hero) return;

  const frames = gsap.utils.toArray(hero.querySelectorAll('[data-hero-frame]'));
  const images = gsap.utils.toArray(hero.querySelectorAll('[data-hero-image]'));
  const beats = gsap.utils.toArray(hero.querySelectorAll('[data-hero-beat]'));
  const loader = hero.querySelector('[data-hero-loader]');
  const scrollCue = hero.querySelector('[data-hero-scroll-cue]');
  const takeover = document.querySelector('[data-takeover]');

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
      buildScrollSequence({ hero, frames, images, beats, scrollCue, takeover });
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

function buildScrollSequence({ hero, frames, images, beats, scrollCue, takeover }) {
  gsap.set(frames[0], { autoAlpha: 1 });
  gsap.set(frames.slice(1), { autoAlpha: 0 });
  gsap.set(beats[0], { autoAlpha: 1 });
  gsap.set(beats.slice(1), { autoAlpha: 0 });

  // Fades out while the user is scrolling, back in once idle — ready
  // immediately since the hero (and this hint) is visible from page load.
  const heroCue = scrollCue ? createIdleCue(scrollCue) : null;
  if (heroCue) heroCue.setReady(true);

  gsap.set(images, { filter: 'blur(0px)' });

  const segment = 1 / frames.length;
  const overlap = segment * 0.35;
  const maxBlur = 22;

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: '+=600%',
      scrub: 0.8,
      pin: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        // Scrolling back up past the zoom (progress well below where it
        // starts at 1/2 = 0.5) means the user has left the takeover scene.
        // Tear it down rather than leaving its particle field's WebGL
        // render loop running forever in the background — left alive, it
        // permanently taxes every frame afterward, including a second pass
        // back down through this same zoom.
        if (takeover && self.progress < 0.45) resetTakeover(takeover);
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

  // Outro: after the third portrait settles (last crossfade ends ~0.83, the
  // zoom starts at 1.0 — the gap in between is a beat of stillness), the
  // whole page dives into the gap between the nameplate's two words. The
  // words fly off-screen leaving only the near-black canvas, the takeover
  // overlay fades in over it, and startTakeover() runs the loader sequence
  // once the blackout completes.
  if (takeover) {
    // The dive is a scale around the point in the gap between the two words
    // plus a translate that carries that same point to the viewport center,
    // so the camera ends up looking straight at the spot between name and
    // last name rather than zooming toward the bottom-left corner.
    const zoomShift = { x: 0, y: 0 };
    const setZoomOrigin = () => {
      const outline = hero.querySelector('.hero__nameplate-outline');
      const fill = hero.querySelector('.hero__nameplate-fill');
      if (!outline || !fill) return;
      const heroRect = hero.getBoundingClientRect();
      const outlineRect = outline.getBoundingClientRect();
      const fillRect = fill.getBoundingClientRect();
      const originX =
        (Math.min(outlineRect.left, fillRect.left) + Math.max(outlineRect.right, fillRect.right)) / 2 -
        heroRect.left;
      const originY = (outlineRect.bottom + fillRect.top) / 2 - heroRect.top;
      gsap.set(hero, { transformOrigin: `${originX}px ${originY}px` });
      zoomShift.x = window.innerWidth / 2 - originX;
      zoomShift.y = window.innerHeight / 2 - originY;
    };
    setZoomOrigin();
    ScrollTrigger.addEventListener('refreshInit', setZoomOrigin);

    const zoomStart = 1;
    // Doubled from 0.5s so the scale/pan interpolates across twice the
    // scroll distance (end below is extended to match) — same motion,
    // twice as many rendered frames sampled per unit of scroll, so it
    // reads smoother instead of snapping to scale 10 quickly.
    const zoomDuration = 1;
    tl.to(
      hero,
      {
        scale: 10,
        x: () => zoomShift.x,
        y: () => zoomShift.y,
        ease: 'power2.in',
        duration: zoomDuration,
      },
      zoomStart
    );
    // Raster-cost relief: the photo panel (masked, blur-filter image
    // layers) is by far the most expensive content to re-rasterize while
    // the hero scales up. The dive aims at the lettering, not the photo —
    // so fade it (and the scrim) out over the first third of the zoom,
    // leaving only the lightweight text to carry the big scales.
    const photoPanel = hero.querySelector('.hero__photo-panel');
    const scrim = hero.querySelector('.hero__scrim');
    tl.to(
      [photoPanel, scrim].filter(Boolean),
      { autoAlpha: 0, duration: zoomDuration * 0.3, ease: 'power1.out' },
      zoomStart
    );
    // Plain opacity, not autoAlpha: autoAlpha also flips a visibility
    // toggle, which would undo the CSS's deliberate pre-warmed paint state
    // (see takeover.css) and reintroduce a cold first-paint stall right as
    // this fades in. Reaches full opacity at 90% of the zoom (not 100%) so
    // the very largest — most expensive — scales render behind an already
    // opaque overlay.
    tl.to(
      takeover,
      { opacity: 1, ease: 'power1.inOut', duration: zoomDuration * 0.35 },
      zoomStart + zoomDuration * 0.55
    );
    // Once the overlay is opaque, stop rendering the giant scaled hero
    // entirely (scrub-reversible: scrolling back re-runs this set in
    // reverse and restores it).
    tl.set(hero, { autoAlpha: 0 }, zoomStart + zoomDuration * 0.92);
    // Slightly before the timeline's very end so the scrub reliably crosses it.
    tl.call(() => startTakeover(takeover), [], zoomStart + zoomDuration - 0.02);
  }
}

let takeoverStarted = false;
let takeoverSeq = null;
let particleField = null;

function startTakeover(takeover) {
  if (takeoverStarted) return;
  takeoverStarted = true;

  const loader = takeover.querySelector('[data-takeover-loader]');
  const menuCue = takeover.querySelector('[data-takeover-menu-cue]');
  const particlesContainer = takeover.querySelector('[data-takeover-particles]');
  const orbit = takeover.querySelector('[data-takeover-orbit]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Everything for this run lives on one timeline so resetTakeover() can
  // stop all of it atomically with a single kill() — including the burst,
  // which used to fire as untracked standalone tweens that would keep
  // running (and, worse, leave the particle field's render loop alive)
  // even after the user scrolled back out of the scene.
  const seq = gsap.timeline();
  takeoverSeq = seq;
  // Plain opacity — see the comment on the outer takeover fade above; same
  // reasoning applies to the loader's own .blobs SVG-filter layer.
  seq.to(loader, { opacity: 1, duration: 0.7, ease: 'power1.inOut' });

  if (reduceMotion) {
    // GSAP tweens and the loader's CSS run aren't covered by the global
    // reduced-motion CSS block, so branch explicitly: skip the loop run and
    // the particle burst, land straight on the ignited sun with the planets
    // parked in place (paused orbit) + the menu cue.
    seq.call(() => {
      takeover.classList.add('is-settled', 'is-sun');
      startOrbit(takeover, { paused: true });
      setPlanetsEnabled(takeover, true);
    });
    if (orbit) seq.to(orbit, { opacity: 1, duration: 0.6, ease: 'power1.out' }, '+=0.3');
    if (menuCue) seq.to(menuCue, { opacity: 1, duration: 0.6, ease: 'power1.out' }, '<');
    return;
  }

  seq.call(() => takeover.classList.add('is-running'));
  // Build the WebGL context and compile shaders now, during the idle loop,
  // rather than at the exact instant of the burst below — that construction
  // is a genuine synchronous stall, and it's far less noticeable while the
  // blobs are already looping than during the settle-and-burst beat.
  seq.call(() => prewarmParticles(takeover), [], '+=0.1');
  // The loader is shown for exactly 5s total, and must complete exactly 3
  // full loops in that window — so each cycle runs at 5/3s (kept in sync
  // with --loop in takeover.css). Every cycle ends with everything at scale
  // 0, so settling right at the 5s boundary lets the static ball grow back
  // in (takeover-ball-in) without a visible jump.
  const runDuration = 5;
  seq.call(() => takeover.classList.add('is-settled'), [], `+=${runDuration}`);

  // Burst the particles out of the ball just as it finishes growing in.
  // The ball STAYS this time — instead of fading out it ignites: .is-sun
  // fades in the orange gradient surface + glow (space scene; the ball is
  // now the sun) while the planets' orbit starts and fades in around it.
  // Everything hangs off the 'burst' label (positions relative to the
  // burst's START, not the 1.8s burst tween's end). Added straight onto
  // seq (not spawned as independent tweens) so killing seq also kills
  // these.
  const burst = { value: 0 };
  seq.addLabel('burst', '+=0.55');
  seq.call(() => {
    if (!particleField) prewarmParticles(takeover);
  }, [], 'burst');
  seq.to(particlesContainer, { opacity: 1, duration: 0.5, ease: 'power1.out' }, 'burst');
  seq.to(
    burst,
    {
      value: 10,
      duration: 1.8,
      ease: 'expo.out',
      onUpdate: () => particleField && particleField.setSpread(burst.value),
    },
    'burst'
  );
  seq.call(() => {
    takeover.classList.add('is-sun');
    setPlanetsEnabled(takeover, true);
  }, [], 'burst+=0.15');
  seq.call(() => startOrbit(takeover), [], 'burst+=0.3');
  if (orbit) seq.to(orbit, { opacity: 1, duration: 1.4, ease: 'power1.inOut' }, 'burst+=0.6');
  if (menuCue) seq.to(menuCue, { opacity: 1, duration: 0.6, ease: 'power1.out' }, 'burst+=1.1');
}

// Shared by every "scroll hint" on the site (currently just the hero's
// "Scroll" cue): fades in while the user is idle, and fades out the moment
// they scroll. One global listener drives every registered cue.
// 'wheel'/'touchmove' catch attempted scrolling even at the very bottom of
// the page (where 'scroll' itself won't fire since scrollY can't change
// further), so trying to scroll past the end still hides a cue.
const idleCues = [];
const CUE_IDLE_DELAY = 220;

function initScrollCueActivity() {
  const onActivity = () => idleCues.forEach((cue) => cue.onActivity());
  window.addEventListener('wheel', onActivity, { passive: true });
  window.addEventListener('touchmove', onActivity, { passive: true });
  window.addEventListener('scroll', onActivity, { passive: true });
}

// Each cue tracks its own ready/visible state so one can be mid-fade
// independently of any other registered cue's state.
function createIdleCue(el) {
  let ready = false;
  let visible = false;
  let idleTimer = null;

  const showIfReady = () => {
    if (!ready || visible) return;
    visible = true;
    gsap.to(el, { autoAlpha: 1, duration: 0.5, ease: 'power1.out' });
  };
  const hide = () => {
    if (!visible) return;
    visible = false;
    gsap.to(el, { autoAlpha: 0, duration: 0.25, ease: 'power1.out' });
  };

  const controller = {
    onActivity() {
      hide();
      clearTimeout(idleTimer);
      idleTimer = setTimeout(showIfReady, CUE_IDLE_DELAY);
    },
    setReady(value) {
      ready = value;
      if (value) {
        showIfReady();
      } else {
        visible = false;
        clearTimeout(idleTimer);
        gsap.set(el, { autoAlpha: 0 });
      }
    },
  };
  idleCues.push(controller);
  return controller;
}

function prewarmParticles(takeover) {
  const container = takeover.querySelector('[data-takeover-particles]');
  if (!container || particleField) return;
  // particleCount raised 125% from the OGL default of 120 (120 * 2.25 = 270).
  particleField = initParticles(container, { particleSpread: 10, particleCount: 270 });
  // Collapsed to a point — real hiding is the container's own opacity (see
  // startTakeover's burst step / particles.css); this just keeps the field
  // ready to burst outward rather than already fully spread.
  particleField.setSpread(0);
}

let orbitSystem = null;
let orbitHoverPaused = false;

function startOrbit(takeover, options) {
  const container = takeover.querySelector('[data-takeover-orbit]');
  if (!container || orbitSystem) return;
  orbitSystem = initOrbit(container, options);
}

function pauseOrbitForHover() {
  if (!orbitSystem || orbitHoverPaused) return;
  orbitHoverPaused = true;
  orbitSystem.pause();
}

function resumeOrbitFromHover() {
  if (!orbitHoverPaused) return;
  orbitHoverPaused = false;
  // A planet page opening/open owns the pause once it's underway — don't
  // resume out from under it just because the pointer also left the button.
  if (activePlanetPage || planetTransitionRunning) return;
  if (orbitSystem) orbitSystem.resume();
}

function resetTakeover(takeover) {
  if (!takeoverStarted) return;
  takeoverStarted = false;

  if (takeoverSeq) {
    takeoverSeq.kill();
    takeoverSeq = null;
  }

  takeover.classList.remove('is-running', 'is-settled', 'is-sun');
  setPlanetsEnabled(takeover, false);
  gsap.set(takeover.querySelector('[data-takeover-loader]'), { opacity: 0 });
  gsap.set(takeover.querySelector('[data-takeover-menu-cue]'), { opacity: 0 });
  const particlesContainer = takeover.querySelector('[data-takeover-particles]');
  if (particlesContainer) gsap.set(particlesContainer, { opacity: 0 });
  const orbit = takeover.querySelector('[data-takeover-orbit]');
  if (orbit) gsap.set(orbit, { opacity: 0 });

  // The real fix: without this, the WebGL render loop just keeps running
  // in the background forever, permanently taxing every frame afterward —
  // that leftover cost is what made a second pass through the zoom stutter.
  if (particleField) {
    particleField.destroy();
    particleField = null;
  }
  // Same reasoning for the orbit's endless driver tween.
  if (orbitSystem) {
    orbitSystem.destroy();
    orbitSystem = null;
  }
}

// ——— Planet pages (the menu's destinations) ———————————————————————————
// Each orbiting planet is a button that lands on a full-screen scrollable
// page (Stratosphere → Clouds → Land). The landing animation: the galaxy
// fades back while the clicked planet grows, its atmosphere (the veil, in
// the destination page's palette) floods the screen out from the planet's
// position, and the page fades in over it.

let activePlanetPage = null;
let planetTransitionRunning = false;

function setPlanetsEnabled(takeover, enabled) {
  takeover.querySelectorAll('[data-planet-target]').forEach((btn) => {
    btn.disabled = !enabled;
  });
}

function initPlanetPages() {
  const takeover = document.querySelector('[data-takeover]');
  if (!takeover) return;

  takeover.querySelectorAll('[data-planet-target]').forEach((btn) => {
    btn.addEventListener('click', () => openPlanetPage(takeover, btn));
    // Freeze the whole orbit while aiming at one planet — easier to read
    // its label and line up a click. pointer/focus pair covers mouse and
    // keyboard alike; disabled buttons (pre-ignition, or a page already
    // open) don't dispatch these, so no extra guard needed there.
    btn.addEventListener('pointerenter', pauseOrbitForHover);
    btn.addEventListener('pointerleave', resumeOrbitFromHover);
    btn.addEventListener('focus', pauseOrbitForHover);
    btn.addEventListener('blur', resumeOrbitFromHover);
  });
  document.querySelectorAll('[data-planet-back]').forEach((btn) => {
    btn.addEventListener('click', () => closePlanetPage());
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePlanetPage();
  });

  // Section reveals inside each page. IntersectionObserver rather than
  // ScrollTrigger because these pages scroll in their own overlay, not the
  // document — IO takes that custom root directly.
  document.querySelectorAll('[data-planet-page]').forEach((page) => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
      },
      { root: page, threshold: 0.35 }
    );
    page.querySelectorAll('.planet-section').forEach((section) => observer.observe(section));
  });
}

function openPlanetPage(takeover, btn) {
  if (activePlanetPage || planetTransitionRunning) return;
  if (!takeover.classList.contains('is-sun')) return;

  const name = btn.dataset.planetTarget;
  const page = document.querySelector(`[data-planet-page="${name}"]`);
  const veil = document.querySelector('[data-planet-veil]');
  if (!page || !veil) return;

  planetTransitionRunning = true;
  if (orbitSystem) orbitSystem.pause();
  setPlanetsEnabled(takeover, false);

  page.hidden = false;
  page.scrollTop = 0;
  gsap.set(page, { opacity: 0 });

  const fadeTargets = [
    takeover.querySelector('[data-takeover-loader]'),
    takeover.querySelector('.takeover__sunglow'),
    takeover.querySelector('[data-takeover-particles]'),
    takeover.querySelector('.orbit-path-svg'),
    takeover.querySelector('[data-takeover-menu-cue]'),
    ...[...takeover.querySelectorAll('.orbit-planet')].filter((p) => p !== btn),
  ].filter(Boolean);

  const finishOpen = () => {
    // The page is fully opaque now — quietly restore the galaxy behind it
    // so the return trip needs no rebuild...
    veil.hidden = true;
    veil.classList.remove(`planet-page--${name}`);
    gsap.set(veil, { clearProps: 'clipPath' });
    gsap.set(btn, { clearProps: 'transform' });
    gsap.set(fadeTargets, { opacity: 1 });
    // ...except the particle field: stop paying for its WebGL loop while
    // reading (recreated at full spread on the way back).
    if (particleField) {
      particleField.destroy();
      particleField = null;
    }
    activePlanetPage = { page, takeover, name };
    planetTransitionRunning = false;
    page.focus({ preventScroll: true });
  };

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gsap.to(page, { opacity: 1, duration: 0.4, ease: 'power1.out', onComplete: finishOpen });
    return;
  }

  // Landing geometry: the veil's circle grows from the planet's on-screen
  // center until it covers the farthest viewport corner.
  const rect = btn.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const cover =
    Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy)) * 1.05;

  veil.classList.add(`planet-page--${name}`);
  veil.hidden = false;

  const tl = gsap.timeline({ onComplete: finishOpen });
  tl.to(fadeTargets, { opacity: 0, duration: 0.45, ease: 'power1.out' }, 0);
  // Approach: the planet swells as the "camera" closes in...
  tl.to(btn, { scale: 5, duration: 1.05, ease: 'power2.in' }, 0);
  // ...its atmosphere floods out from it...
  tl.fromTo(
    veil,
    { clipPath: `circle(0px at ${cx}px ${cy}px)` },
    { clipPath: `circle(${cover}px at ${cx}px ${cy}px)`, duration: 0.95, ease: 'power2.in' },
    0.1
  );
  // ...and the page surfaces out of that atmosphere with a real zoom:
  // it arrives oversized and settles to rest, reading as the final push
  // down through the stratosphere onto the page.
  tl.fromTo(
    page,
    { opacity: 0, scale: 1.3 },
    { opacity: 1, scale: 1, duration: 1.15, ease: 'power2.out' },
    0.95
  );
}

function closePlanetPage() {
  if (!activePlanetPage || planetTransitionRunning) return;
  const { page, takeover } = activePlanetPage;
  planetTransitionRunning = true;

  // Re-arm the galaxy behind the page before revealing it: fresh particle
  // field already at full spread (the burst happened long ago) and the
  // orbit resumed from where it paused. Skipped under reduced motion,
  // which never had a particle field to begin with.
  if (!particleField && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    prewarmParticles(takeover);
    if (particleField) particleField.setSpread(10);
  }
  if (orbitSystem) orbitSystem.resume();

  gsap.to(page, {
    opacity: 0,
    duration: 0.55,
    ease: 'power1.inOut',
    onComplete: () => {
      page.hidden = true;
      gsap.set(page, { clearProps: 'transform,opacity' });
      activePlanetPage = null;
      planetTransitionRunning = false;
      setPlanetsEnabled(takeover, true);
    },
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
