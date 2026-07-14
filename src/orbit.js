import gsap from 'gsap';

/*
 * Vanilla port of Dominik Koch's OrbitImages component
 * (https://x.com/dominikkoch — original: React + motion/react).
 *
 * What survived the port unchanged: the ellipse path generator, the
 * 1400x1400 design space scaled to the container (the original's
 * `responsive` mode via ResizeObserver), items placed with CSS Motion
 * Path (offset-path), and evenly-spaced items whose offset-distance
 * wraps modulo 100 (`fill` behavior). The motion/react
 * useMotionValue/useTransform pair is replaced by a single GSAP proxy
 * tween driving every item's offset-distance per frame — the exact
 * computation OrbitItem's useTransform performed.
 *
 * The markup (scaling container, rotation wrapper, path svg, items) is
 * static in index.html; this only wires geometry and motion onto it.
 */

function generateEllipsePath(cx, cy, rx, ry) {
  return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`;
}

export function initOrbit(
  container,
  { baseWidth = 1400, radiusX = 620, radiusY = 170, duration = 36, paused = false } = {}
) {
  const scaling = container.querySelector('[data-orbit-scaling]');
  const svgPath = container.querySelector('[data-orbit-path]');
  const items = Array.from(container.querySelectorAll('.orbit-item'));
  if (!scaling || !items.length) return null;

  const center = baseWidth / 2;
  const path = generateEllipsePath(center, center, radiusX, radiusY);
  if (svgPath) svgPath.setAttribute('d', path);

  items.forEach((item) => {
    item.style.offsetPath = `path("${path}")`;
    item.style.offsetRotate = '0deg';
    item.style.offsetAnchor = 'center center';
  });

  const setScale = () => {
    const scale = container.clientWidth / baseWidth;
    scaling.style.transform = `translate(-50%, -50%) scale(${scale})`;
  };
  setScale();
  const observer = new ResizeObserver(setScale);
  observer.observe(container);

  // One shared driver; each item rides it offset by its even spacing.
  // The double-modulo mirrors the original's ((p + offset) % 100 + 100) % 100
  // so the wrap stays correct even if a path is driven in reverse.
  const bases = items.map((_, i) => (i / items.length) * 100);
  const state = { p: 0 };
  const render = () => {
    items.forEach((item, i) => {
      item.style.offsetDistance = `${(((bases[i] + state.p) % 100) + 100) % 100}%`;
    });
  };
  render();

  let driver = null;
  if (!paused) {
    driver = gsap.to(state, { p: 100, duration, ease: 'none', repeat: -1, onUpdate: render });
  }

  return {
    destroy() {
      if (driver) driver.kill();
      observer.disconnect();
    },
  };
}
