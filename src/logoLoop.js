/*
 * Vanilla port of the React Bits LogoLoop component (reactbits.dev) —
 * the original drives an infinite marquee via rAF + manual offset tracking
 * (measure content width, clone enough copies, translate3d each frame,
 * wrap the offset with modulo). That approach is what a plain CSS
 * `@keyframes` + `animation: infinite` loop already does natively and
 * perfectly seamlessly, so this port uses that instead: exactly two
 * identical copies side by side, animated from translateX(0) to
 * translateX(-50%) — the browser's own compositor handles the wrap, so
 * there's no per-frame JS, no offset math, and no seam/restart glitch to
 * get wrong. ResizeObserver only recalibrates the animation *duration* so
 * the visual speed (px/s) stays constant regardless of content width.
 */

function buildList(items, hidden) {
  const list = document.createElement('ul');
  list.className = 'logo-loop__list';
  list.setAttribute('role', 'list');
  if (hidden) list.setAttribute('aria-hidden', 'true');

  items.forEach(({ svg, label }) => {
    const li = document.createElement('li');
    li.className = 'logo-loop__item';

    const icon = document.createElement('span');
    icon.className = 'logo-loop__icon';
    icon.innerHTML = svg;
    icon.setAttribute('aria-hidden', 'true');
    li.appendChild(icon);

    if (!hidden) {
      const label_ = document.createElement('span');
      label_.className = 'sr-only';
      label_.textContent = label;
      li.appendChild(label_);
    }

    list.appendChild(li);
  });

  return list;
}

export function initLogoLoop(
  container,
  items,
  { speed = 40, gap = 48, logoHeight = 32, pauseOnHover = true, scaleOnHover = true, ariaLabel = 'Logos' } = {}
) {
  container.classList.add('logo-loop');
  if (scaleOnHover) container.classList.add('logo-loop--scale-hover');
  if (pauseOnHover) container.classList.add('logo-loop--pause-hover');
  container.style.setProperty('--logo-loop-gap', `${gap}px`);
  container.style.setProperty('--logo-loop-height', `${logoHeight}px`);
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', ariaLabel);

  const track = document.createElement('div');
  track.className = 'logo-loop__track';
  container.appendChild(track);

  const listA = buildList(items, false);
  const listB = buildList(items, true);
  track.appendChild(listA);
  track.appendChild(listB);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return {
      destroy() {
        container.innerHTML = '';
      },
    };
  }

  const setDuration = () => {
    const width = listA.getBoundingClientRect().width;
    if (width > 0) {
      track.style.setProperty('--logo-loop-duration', `${width / speed}s`);
    }
  };

  const resizeObserver = new ResizeObserver(setDuration);
  resizeObserver.observe(listA);
  setDuration();

  return {
    destroy() {
      resizeObserver.disconnect();
      container.innerHTML = '';
    },
  };
}
