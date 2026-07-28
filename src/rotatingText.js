/*
 * Vanilla port of the React Bits RotatingText component (reactbits.dev) —
 * the original drives per-character enter/exit spring animations via
 * Motion's AnimatePresence (mode="wait": the outgoing text's characters
 * fully exit before the incoming text's characters start entering). This
 * is that same split-into-characters, staggered-transform choreography
 * built on GSAP (already this project's animation engine) instead of
 * Motion, with an init/destroy lifecycle instead of a mount/unmount
 * effect. Trimmed to this site's actual use — character splitting only,
 * auto-rotation only, no imperative ref API (next/previous/jumpTo) since
 * nothing here drives it externally.
 */

import gsap from 'gsap';

function splitIntoCharacters(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

function staggerDelay(index, total, staggerDuration, staggerFrom) {
  if (staggerDuration <= 0) return 0;
  if (staggerFrom === 'last') return (total - 1 - index) * staggerDuration;
  if (staggerFrom === 'center') return Math.abs(Math.floor(total / 2) - index) * staggerDuration;
  if (staggerFrom === 'random') return Math.random() * staggerDuration * total;
  return index * staggerDuration; // 'first'
}

export function initRotatingText(
  container,
  texts,
  {
    rotationInterval = 2200,
    staggerDuration = 0.025,
    staggerFrom = 'first',
    enterDuration = 0.5,
    exitDuration = 0.32,
    auto = true,
  } = {}
) {
  const srOnly = document.createElement('span');
  srOnly.className = 'sr-only';
  container.appendChild(srOnly);

  const visible = document.createElement('span');
  visible.className = 'rotating-text__visible';
  visible.setAttribute('aria-hidden', 'true');
  container.appendChild(visible);

  let currentIndex = 0;
  let intervalId = null;
  let rotating = false;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function buildSpans(text) {
    const frag = document.createDocumentFragment();
    const chars = [];
    const words = text.split(' ');
    words.forEach((word, wordIndex) => {
      const wordSpan = document.createElement('span');
      wordSpan.className = 'rotating-text__word';
      splitIntoCharacters(word).forEach((ch) => {
        const charSpan = document.createElement('span');
        charSpan.className = 'rotating-text__char';
        charSpan.textContent = ch;
        wordSpan.appendChild(charSpan);
        chars.push(charSpan);
      });
      frag.appendChild(wordSpan);
      if (wordIndex !== words.length - 1) {
        const space = document.createElement('span');
        space.className = 'rotating-text__space';
        space.textContent = ' ';
        frag.appendChild(space);
      }
    });
    return { frag, chars };
  }

  function show(index) {
    srOnly.textContent = texts[index];
    const { frag, chars } = buildSpans(texts[index]);
    visible.replaceChildren(frag);

    if (reduceMotion) return;

    gsap.set(chars, { yPercent: 100, opacity: 0 });
    gsap.to(chars, {
      yPercent: 0,
      opacity: 1,
      duration: enterDuration,
      ease: 'back.out(1.5)',
      stagger: (i) => staggerDelay(i, chars.length, staggerDuration, staggerFrom),
    });
  }

  function rotate() {
    if (rotating) return;
    const outgoing = [...visible.querySelectorAll('.rotating-text__char')];
    const nextIndex = (currentIndex + 1) % texts.length;

    if (reduceMotion || !outgoing.length) {
      currentIndex = nextIndex;
      show(currentIndex);
      return;
    }

    rotating = true;
    gsap.to(outgoing, {
      yPercent: -120,
      opacity: 0,
      duration: exitDuration,
      ease: 'power2.in',
      stagger: (i) => staggerDelay(i, outgoing.length, staggerDuration, staggerFrom) * 0.6,
      onComplete: () => {
        currentIndex = nextIndex;
        show(currentIndex);
        rotating = false;
      },
    });
  }

  show(currentIndex);
  if (auto && texts.length > 1 && !reduceMotion) {
    intervalId = setInterval(rotate, rotationInterval);
  }

  return {
    destroy() {
      if (intervalId !== null) clearInterval(intervalId);
      gsap.killTweensOf(container.querySelectorAll('.rotating-text__char'));
      container.innerHTML = '';
    },
  };
}
