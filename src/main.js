import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';
import { Observer } from 'gsap/Observer';
import { initParticles } from './particles.js';
import { initOrbit } from './orbit.js';

gsap.registerPlugin(ScrollTrigger, CustomEase, Observer);

// Bespoke gravity curve for the planet-landing dive: alive from the first
// frame (a built-in power ease feels dead at the start), drifting forward,
// then accelerating hard into the atmosphere — free-fall, not a tween.
CustomEase.create('landing-dive', 'M0,0 C0.3,0.02 0.5,0.08 0.68,0.28 0.85,0.5 0.94,0.8 1,1');
// Its mirror for the return trip: launched hard out of the atmosphere,
// then a long deceleration as the craft settles back into orbit distance.
CustomEase.create('orbit-return', 'M0,0 C0.06,0.2 0.15,0.5 0.32,0.72 0.5,0.92 0.7,0.98 1,1');

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
  // Capped at 18px: transition-time blur above ~20px gets expensive to
  // rasterize, especially in Safari, and past this level the extra blur is
  // visually indistinguishable mid-crossfade anyway.
  const maxBlur = 18;

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
        // Tear the takeover scene down as soon as the user retreats below
        // the blackout (overlay only starts fading in at progress ~0.775,
        // so at <0.7 the scene is guaranteed invisible — resetting here
        // can't be seen). The threshold MUST sit above where the zoom
        // starts (0.5): it used to be 0.45, which left a dead zone where
        // you could scroll up far enough to see the hero again, come back
        // down, and dive into a takeover still in its lit end state (sun +
        // orbit + menu) instead of black + loader — reading as a
        // completely different zoom animation. Resetting also frees the
        // particle field's WebGL loop instead of taxing every frame.
        if (takeover && self.progress < 0.7) resetTakeover(takeover);
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
    // Slightly before the timeline's very end so the scrub reliably crosses
    // it. Guarded on the REAL scroll progress: the smoothed playhead also
    // crosses this position while sweeping backward after a fast jump to
    // the top, and by then onUpdate may have already reset takeoverStarted
    // — without the guard, that reverse crossing ghost-started the whole
    // loader sequence invisibly at the top of the page.
    tl.call(() => {
      if (tl.scrollTrigger.progress > 0.9) startTakeover(takeover);
    }, [], zoomStart + zoomDuration - 0.02);
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
  // Reduced from 3 loops to 2 (each cycle still paced at 5/3s, kept in
  // sync with --loop in takeover.css) — less time on-screen before
  // settling. Every cycle ends with everything at scale 0, so settling
  // right on a cycle boundary lets the static ball grow back in
  // (takeover-ball-in) without a visible jump.
  const loopDuration = 5 / 3;
  const loopCount = 2;
  const runDuration = loopDuration * loopCount;
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
  // The MENU reveal is a rare, high-emotion beat (the site's nav being
  // born) — it gets delight budget: rising out of a soft blur rather than
  // a flat opacity pop. Blur kept small (6px) for cheap rasterization.
  if (menuCue) {
    seq.fromTo(
      menuCue,
      { opacity: 0, y: 16, filter: 'blur(6px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.9, ease: 'power2.out' },
      'burst+=1.1'
    );
  }
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
let planetOpenTl = null;

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
  document.querySelectorAll('[data-planet-page]').forEach((page) => createReturnPull(page));
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Interruptibility: never lock the user inside the ~2s landing. If
    // it's still playing, jump it to its end (finishOpen runs, state
    // becomes consistent) and exit from there in the same keypress.
    if (planetTransitionRunning && planetOpenTl) planetOpenTl.progress(1);
    closePlanetPage();
  });

  // Section reveals inside each page. IntersectionObserver rather than
  // ScrollTrigger because these pages scroll in their own overlay, not the
  // document — IO takes that custom root directly.
  document.querySelectorAll('[data-planet-page]').forEach((page) => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Held back while the landing cinematic is mid-flight: unhiding the
        // page delivers fresh intersection records asynchronously, which
        // would mark the first section visible behind the blackout and burn
        // its content cascade unseen. The landing timeline reveals the
        // first section itself at touchdown; later sections re-observe
        // normally once the flag clears.
        if (page.dataset.landing === 'true') return;
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
      },
      { root: page, threshold: 0.35 }
    );
    page.querySelectorAll('.planet-section').forEach((section) => observer.observe(section));
  });
}

// The dive's shared math: the two scales compound (planet visual size =
// rect.width * btnScale * sceneScale), solved so the planet's own surface
// clears the farthest viewport corner with margin. Used by the landing
// (zoom in) and, inverted, by the return trip (zoom out).
function landingGeometry(btn) {
  const rect = btn.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const cover =
    Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy)) * 2;
  const sceneScale = 3.2;
  const btnScale = (cover * 1.15) / (rect.width * sceneScale);
  return { cx, cy, sceneScale, btnScale };
}

// The galaxy chrome that fades for a dive (everything except the stars,
// which stay up to streak past the camera, and the planet being flown at).
function galaxyChrome(takeover, exceptBtn) {
  return [
    takeover.querySelector('[data-takeover-loader]'),
    takeover.querySelector('.takeover__sunglow'),
    takeover.querySelector('.orbit-path-svg'),
    takeover.querySelector('[data-takeover-menu-cue]'),
    ...[...takeover.querySelectorAll('.orbit-planet')].filter((p) => p !== exceptBtn),
  ].filter(Boolean);
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

  // Deliberately NOT the particle field: the stars stay up during the dive
  // so the takeover-wide zoom streaks them outward past the camera — the
  // warp is most of the "flying at the planet" feel.
  const fadeTargets = galaxyChrome(takeover, btn);

  const finishOpen = () => {
    // The page is fully opaque now — quietly restore the galaxy behind it
    // so the return trip needs no rebuild...
    veil.hidden = true;
    veil.classList.remove(`planet-page--${name}`);
    gsap.set(veil, { clearProps: 'opacity' });
    gsap.set(takeover, { clearProps: 'transform,transformOrigin' });
    gsap.set(btn, { clearProps: 'transform' });
    const label = btn.querySelector('.orbit-planet__label');
    if (label) gsap.set(label, { clearProps: 'opacity' });
    gsap.set(fadeTargets, { opacity: 1 });
    // Slide/blur land at identity values; clear them so the page element
    // carries no leftover transform/filter while being read (a transformed
    // scroll container would also re-anchor its fixed back button).
    gsap.set(page, { clearProps: 'transform,filter' });
    // ...except the particle field: stop paying for its WebGL loop while
    // reading (recreated at full spread on the way back).
    if (particleField) {
      particleField.destroy();
      particleField = null;
    }
    activePlanetPage = { page, takeover, name };
    planetTransitionRunning = false;
    planetOpenTl = null;
    delete page.dataset.landing; // safety net; normally cleared at touchdown
    // Scroll-driven FX need real layout — the page is visible now.
    planetFxCtx = createPlanetScrollFX(page);
    page.focus({ preventScroll: true });
  };

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    planetOpenTl = gsap.to(page, { opacity: 1, duration: 0.4, ease: 'power1.out', onComplete: finishOpen });
    return;
  }

  // Landing geometry: the camera dives INTO the planet — the whole galaxy
  // scene scales up around the planet's exact screen position while the
  // planet itself rushes toward the lens until its own gradient fills the
  // frame (it IS the covering surface; no clip-path fill).
  const { cx, cy, sceneScale, btnScale } = landingGeometry(btn);

  const blackout = veil.querySelector('[data-veil-blackout]');
  const glow = veil.querySelector('[data-veil-glow]');
  gsap.set([blackout, glow].filter(Boolean), { opacity: 0 });

  // Strip stale section reveals so the content cascade plays AFTER
  // touchdown — otherwise IntersectionObserver marks the first section
  // visible the instant the page unhides (while still at opacity 0) and
  // the stagger burns off unseen behind the blackout. The landing flag
  // keeps the observer's async records from re-adding it (see
  // initPlanetPages).
  page.querySelectorAll('.planet-section.is-visible').forEach((s) => s.classList.remove('is-visible'));
  page.dataset.landing = 'true';

  veil.classList.add(`planet-page--${name}`);
  veil.hidden = false;
  gsap.set(veil, { opacity: 0, clearProps: 'clipPath' });

  const label = btn.querySelector('.orbit-planet__label');

  // The landing, in three beats:
  //   1. Dive (0–1.15s): the camera flies at the planet — the whole scene
  //      zooms around the planet's position on the 'landing-dive' gravity
  //      ease, stars streaking outward past the lens, until the planet's
  //      own surface fills the frame. A flash of the destination's sky
  //      palette (the veil) reads as hitting the atmosphere.
  //   2. Entry burn (~1.2–2.15s): the atmosphere deepens to near-black and
  //      holds ~1s of darkness; late in the burn the surface glow seeps up
  //      from the bottom edge, hinting where the page will come from.
  //   3. Touchdown (2.15–3.1s): the page slides up out of that glow,
  //      sharpening from a soft blur as it settles; its content then
  //      condenses into focus (the depth-of-field arrival in planets.css)
  //      right after it lands.
  const tl = gsap.timeline({
    defaults: { duration: 1.15, ease: 'landing-dive' },
    onComplete: finishOpen,
  });
  planetOpenTl = tl;
  if (label) tl.set(label, { opacity: 0 }, 0); // hover label must not scale up with the planet
  tl.to(fadeTargets, { opacity: 0, duration: 0.5, ease: 'power1.out' }, 0);
  tl.to(takeover, { scale: sceneScale, transformOrigin: `${cx}px ${cy}px` }, 0);
  tl.to(btn, { scale: btnScale }, 0);
  tl.to(veil, { opacity: 1, duration: 0.35, ease: 'power1.inOut' }, 0.85);
  if (blackout) tl.to(blackout, { opacity: 1, duration: 0.4, ease: 'power1.inOut' }, 1.2);
  if (glow) tl.to(glow, { opacity: 0.45, duration: 0.55, ease: 'power1.inOut' }, 1.7);
  // Slide + blur-in from the bottom. Opacity resolves fast (the black
  // behind makes a slow fade read as murk); position and focus carry the
  // motion. Strong ease-out, no bounce — "smoothly slides".
  tl.fromTo(
    page,
    { yPercent: 9, filter: 'blur(14px)' },
    { yPercent: 0, filter: 'blur(0px)', duration: 0.95, ease: 'power3.out' },
    2.15
  );
  tl.to(page, { opacity: 1, duration: 0.35, ease: 'power1.out' }, 2.15);
  // Touchdown settled — release the observer gate and let the first
  // section's content bloom, once the page's own slide-in blur is down to
  // ~0.5px so the depth reveal plays on an already-sharp stage.
  tl.call(() => {
    delete page.dataset.landing;
    const first = page.querySelector('.planet-section');
    if (first) first.classList.add('is-visible');
  }, [], 2.65);
}

function closePlanetPage() {
  if (!activePlanetPage || planetTransitionRunning) return;
  const { page, takeover, name } = activePlanetPage;
  planetTransitionRunning = true;

  // Scroll FX first: their ScrollTriggers reference this page's scroller
  // and must not survive into the hidden state.
  if (planetFxCtx) {
    planetFxCtx.revert();
    planetFxCtx = null;
  }

  // Re-arm the star field before anything is revealed — the stars are up
  // during the whole zoom-out, streaking back inward as the camera
  // retreats. Skipped under reduced motion, which never had particles.
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!particleField && !reduceMotion) {
    prewarmParticles(takeover);
    if (particleField) particleField.setSpread(10);
  }

  const btn = takeover.querySelector(`[data-planet-target="${name}"]`);
  const veil = document.querySelector('[data-planet-veil]');
  const label = btn ? btn.querySelector('.orbit-planet__label') : null;
  const chrome = galaxyChrome(takeover, btn);

  const cleanup = () => {
    page.hidden = true;
    gsap.set(page, { clearProps: 'transform,opacity,filter' });
    gsap.set(takeover, { clearProps: 'transform,transformOrigin' });
    if (btn) gsap.set(btn, { clearProps: 'transform' });
    if (label) gsap.set(label, { clearProps: 'opacity' });
    // Hard-set, not clearProps: the sun ball and menu cue are opacity:0 in
    // CSS by default and were only ever made visible by one-time inline
    // GSAP tweens during ignition (startTakeover) — clearing "opacity"
    // here would strip that inline value and drop them back to their
    // hidden CSS resting state instead of "lit", vanishing the sun and cue.
    gsap.set(chrome, { opacity: 1 });
    if (veil) {
      veil.hidden = true;
      veil.classList.remove(`planet-page--${name}`);
      gsap.set(veil, { clearProps: 'opacity' });
    }
    // Resume only now — the zoom-out's origin must stay glued to the
    // planet's (paused) position for the whole retreat.
    if (orbitSystem) orbitSystem.resume();
    activePlanetPage = null;
    planetTransitionRunning = false;
    setPlanetsEnabled(takeover, true);
  };

  if (reduceMotion) {
    if (orbitSystem) orbitSystem.resume();
    gsap.to(page, { opacity: 0, duration: 0.45, ease: 'power1.inOut', onComplete: cleanup });
    return;
  }

  // The landing dive, reversed: park the camera back INSIDE the planet
  // (scene + planet pre-scaled around the planet's current position,
  // atmosphere veil up, chrome hidden), then — as the page lifts away —
  // launch back out on the mirror ease: the planet shrinks from
  // frame-filling back to its dot in orbit, stars rushing inward, sun and
  // menu fading back up. Exit is still shorter than the entry.
  if (btn) {
    const { cx, cy, sceneScale, btnScale } = landingGeometry(btn);
    gsap.set(takeover, { scale: sceneScale, transformOrigin: `${cx}px ${cy}px` });
    gsap.set(btn, { scale: btnScale });
  }
  if (label) gsap.set(label, { opacity: 0 });
  gsap.set(chrome, { opacity: 0 });
  if (veil) {
    veil.classList.add(`planet-page--${name}`);
    veil.hidden = false;
    gsap.set(veil, { opacity: 1, clearProps: 'clipPath' });
    gsap.set(
      [veil.querySelector('[data-veil-blackout]'), veil.querySelector('[data-veil-glow]')].filter(Boolean),
      { opacity: 0 }
    );
  }

  const tl = gsap.timeline({ onComplete: cleanup });
  // 1. The page lifts away (mirror of the touchdown slide).
  tl.to(page, { yPercent: 10, opacity: 0, filter: 'blur(12px)', duration: 0.55, ease: 'power2.in' }, 0);
  // 2. The atmosphere flash clears...
  if (veil) tl.to(veil, { opacity: 0, duration: 0.4, ease: 'power1.inOut' }, 0.45);
  // 3. ...and the camera launches back out to orbit distance.
  tl.to(takeover, { scale: 1, duration: 1.2, ease: 'orbit-return' }, 0.5);
  if (btn) tl.to(btn, { scale: 1, duration: 1.2, ease: 'orbit-return' }, 0.5);
  // 4. Galaxy chrome fades back up as the orbit view returns.
  tl.to(chrome, { opacity: 1, duration: 0.6, ease: 'power1.out' }, 1.1);
}

// ——— Pull-to-return (all planet pages) ————————————————————————————————
// At the top of a page, continuing to scroll up rubber-bands the whole
// page downward (rising resistance, Apple-style — no hard wall) while the
// return cue's line stretches as the gesture's gauge. Pull far enough and
// it releases into the lift-off; let go early and it springs back.

const RETURN_PULL_THRESHOLD = 380; // accumulated wheel/touch px

function createReturnPull(page) {
  const cueLine = page.querySelector('[data-return-cue] i');
  const yTo = gsap.quickTo(page, 'y', { duration: 0.3, ease: 'power2.out' });
  const lineTo = cueLine ? gsap.quickTo(cueLine, 'scaleY', { duration: 0.3, ease: 'power2.out' }) : null;
  let pull = 0;

  const relax = () => {
    if (!pull) return;
    pull = 0;
    yTo(0);
    if (lineTo) lineTo(1);
  };

  Observer.create({
    target: page,
    type: 'wheel,touch',
    onChangeY(self) {
      if (!activePlanetPage || activePlanetPage.page !== page || planetTransitionRunning) return;
      if (page.scrollTop <= 1 && self.deltaY < 0) {
        pull += -self.deltaY;
        // Rubber band: displacement approaches ~110px asymptotically —
        // the further you pull, the less it gives.
        yTo(110 * (1 - 1 / (1 + pull / 260)));
        if (lineTo) lineTo(1 + Math.min(pull / 180, 1.6));
        if (pull >= RETURN_PULL_THRESHOLD) {
          pull = 0;
          if (lineTo) lineTo(1);
          closePlanetPage();
        }
      } else {
        relax();
      }
    },
    onStop: relax,
  });
}

// ——— Scroll-driven page FX ————————————————————————————————————————————
// Created when a page finishes landing, reverted on lift-off. Everything
// scrubs against the page's own scroller (these overlays scroll
// themselves, not the window). All pages get the return-cue fade;
// Projects gets the full descent choreography.

let planetFxCtx = null;

function createPlanetScrollFX(page) {
  const sections = gsap.utils.toArray(page.querySelectorAll('.planet-section'));
  if (!sections.length) return null;

  return gsap.context(() => {
    // Return cue bows out as soon as the descent starts, comes back at top.
    const cue = page.querySelector('[data-return-cue]');
    if (cue) {
      gsap.to(cue, {
        autoAlpha: 0,
        ease: 'none',
        scrollTrigger: { scroller: page, trigger: sections[0], start: 'top top', end: '+=220', scrub: true },
      });
    }

    if (page.dataset.planetPage !== 'projects') return;

    const descentTrack = page.querySelector('[data-descent-track]');
    if (!descentTrack) return;

    // The descent, as one scrubbed timeline (1 unit per stage): the three
    // full-viewport layers blur-DISSOLVE into each other — the same
    // defocus/refocus language as the hero's portrait crossfades — instead
    // of a panel physically sliding over. Within each boundary the
    // outgoing stage defocuses and fades while the incoming one sharpens
    // into focus; the incoming backdrop settles from a slightly deeper
    // frame, and the stage's items cascade up right after focus lands.
    const maxBlur = 16;
    const fade = 0.5; // crossfade width in stage units

    gsap.set(sections.slice(1), { autoAlpha: 0 });

    const tl = gsap.timeline({
      defaults: { ease: 'power1.inOut' },
      scrollTrigger: {
        scroller: page,
        trigger: descentTrack,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.6,
      },
    });

    sections.forEach((section, i) => {
      const bg = section.querySelector('[data-section-bg]');
      const items = section.querySelectorAll('[data-fx-item]');
      if (i > 0) {
        const p = i - fade / 2; // boundary crossfade start
        const prev = sections[i - 1];
        tl.fromTo(prev, { filter: 'blur(0px)' }, { filter: `blur(${maxBlur}px)`, duration: fade }, p);
        tl.to(prev, { autoAlpha: 0, duration: fade }, p);
        tl.fromTo(section, { filter: `blur(${maxBlur}px)` }, { filter: 'blur(0px)', duration: fade }, p);
        tl.to(section, { autoAlpha: 1, duration: fade }, p);
        if (bg) tl.fromTo(bg, { scale: 1.1 }, { scale: 1, duration: fade * 1.6, ease: 'power1.out' }, p);
        if (items.length) {
          tl.fromTo(
            items,
            { autoAlpha: 0, y: 60 },
            { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.06, ease: 'power1.out' },
            p + fade * 0.55
          );
        }
      }
    });
    // Pad the timeline to exactly 3 stage-units so each stage owns an
    // equal share of the track's scroll distance.
    tl.set({}, {}, sections.length);

    // Descent gauge: the marker rides the track with total progress; the
    // stage label swaps as each atmospheric layer is reached.
    const marker = page.querySelector('[data-gauge-marker]');
    const stage = page.querySelector('[data-gauge-stage]');
    const gaugeTrack = page.querySelector('.planet-page__gauge-track');
    if (marker && stage && gaugeTrack) {
      const stages = ['Stratosphere', 'Clouds', 'Land'];
      let current = 0;
      ScrollTrigger.create({
        scroller: page,
        trigger: descentTrack,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate(self) {
          gsap.set(marker, { y: self.progress * (gaugeTrack.clientHeight - marker.offsetHeight) });
          const idx = self.progress < 0.4 ? 0 : self.progress < 0.9 ? 1 : 2;
          if (idx !== current) {
            current = idx;
            stage.textContent = stages[idx];
            gsap.fromTo(stage, { autoAlpha: 0.2 }, { autoAlpha: 1, duration: 0.45, ease: 'power1.out' });
          }
        },
      });
    }
  }, page);
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
