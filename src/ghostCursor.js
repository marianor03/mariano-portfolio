/*
 * Vanilla port of the React Bits GhostCursor component (reactbits.dev) —
 * the original is a React component (useRef + useEffect) driving a Three.js
 * scene: a cursor-following trail of noise-based "smoke blob" shapes,
 * bloomed and grain-filtered via EffectComposer. This is that same
 * scene/shader setup with an init/destroy lifecycle instead of a
 * mount/unmount effect, and no reactive prop updates (options are fixed at
 * init, matching how initParticles/initOrbit are configured on this site).
 *
 * Recolored from the original's fixed pale-purple-to-white/blue "magical
 * mist" shine (tint1 -> hardcoded white, tint2 -> hardcoded pale blue) to
 * shine tones DERIVED from whatever base color is passed in: tint1
 * brightens the base toward white (a "hot core" that reads correctly for
 * any hue), tint2 is the pure, unbrightened base. This runs on every
 * planet's Clouds stage now, each with its own accent color — one shader,
 * no per-page tuning needed.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const baseVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float iTime;
  uniform vec3  iResolution;
  uniform vec2  iMouse;
  uniform vec2  iPrevMouse[MAX_TRAIL_LENGTH];
  uniform float iOpacity;
  uniform float iScale;
  uniform vec3  iBaseColor;
  uniform float iBrightness;
  uniform float iEdgeIntensity;
  varying vec2  vUv;

  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453123); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f *= f * (3. - 2. * f);
    return mix(mix(hash(i + vec2(0.,0.)), hash(i + vec2(1.,0.)), f.x),
               mix(hash(i + vec2(0.,1.)), hash(i + vec2(1.,1.)), f.x), f.y);
  }
  float fbm(vec2 p){
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for(int i=0;i<5;i++){
      v += a * noise(p);
      p = m * p * 2.0;
      a *= 0.5;
    }
    return v;
  }
  /* Inner highlight: the base color brightened toward white — a "hot
     core" that reads as glowing regardless of the base hue. */
  vec3 tint1(vec3 base){ return mix(base, vec3(1.0), 0.3); }
  /* Secondary/cycling tone: the pure, unbrightened base — so the color
     cycle shimmers between "glowing" and "true accent" instead of
     introducing an unrelated second hue. */
  vec3 tint2(vec3 base){ return base; }

  vec4 blob(vec2 p, vec2 mousePos, float intensity, float activity) {
    vec2 q = vec2(fbm(p * iScale + iTime * 0.1), fbm(p * iScale + vec2(5.2,1.3) + iTime * 0.1));
    vec2 r = vec2(fbm(p * iScale + q * 1.5 + iTime * 0.15), fbm(p * iScale + q * 1.5 + vec2(8.3,2.8) + iTime * 0.15));

    float smoke = fbm(p * iScale + r * 0.8);
    float radius = 0.5 + 0.3 * (1.0 / iScale);
    float distFactor = 1.0 - smoothstep(0.0, radius * activity, length(p - mousePos));
    float alpha = pow(smoke, 2.5) * distFactor;

    vec3 c1 = tint1(iBaseColor);
    vec3 c2 = tint2(iBaseColor);
    vec3 color = mix(c1, c2, sin(iTime * 0.5) * 0.5 + 0.5);

    return vec4(color * alpha * intensity, alpha * intensity);
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy / iResolution.xy * 2.0 - 1.0) * vec2(iResolution.x / iResolution.y, 1.0);
    vec2 mouse = (iMouse * 2.0 - 1.0) * vec2(iResolution.x / iResolution.y, 1.0);

    vec3 colorAcc = vec3(0.0);
    float alphaAcc = 0.0;

    vec4 b = blob(uv, mouse, 1.0, iOpacity);
    colorAcc += b.rgb;
    alphaAcc += b.a;

    for (int i = 0; i < MAX_TRAIL_LENGTH; i++) {
      vec2 pm = (iPrevMouse[i] * 2.0 - 1.0) * vec2(iResolution.x / iResolution.y, 1.0);
      float t = 1.0 - float(i) / float(MAX_TRAIL_LENGTH);
      t = pow(t, 2.0);
      if (t > 0.01) {
        vec4 bt = blob(uv, pm, t * 0.8, iOpacity);
        colorAcc += bt.rgb;
        alphaAcc += bt.a;
      }
    }

    colorAcc *= iBrightness;

    vec2 uv01 = gl_FragCoord.xy / iResolution.xy;
    float edgeDist = min(min(uv01.x, 1.0 - uv01.x), min(uv01.y, 1.0 - uv01.y));
    float distFromEdge = clamp(edgeDist * 2.0, 0.0, 1.0);
    float k = clamp(iEdgeIntensity, 0.0, 1.0);
    float edgeMask = mix(1.0 - k, 1.0, distFromEdge);

    float outAlpha = clamp(alphaAcc * iOpacity * edgeMask, 0.0, 1.0);
    gl_FragColor = vec4(colorAcc, outAlpha);
  }
`;

function makeFilmGrainShader(grainIntensity) {
  return {
    uniforms: {
      tDiffuse: { value: null },
      iTime: { value: 0 },
      intensity: { value: grainIntensity },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float iTime;
      uniform float intensity;
      varying vec2 vUv;

      float hash1(float n){ return fract(sin(n)*43758.5453); }

      void main(){
        vec4 color = texture2D(tDiffuse, vUv);
        float n = hash1(vUv.x*1000.0 + vUv.y*2000.0 + iTime) * 2.0 - 1.0;
        color.rgb += n * intensity * color.rgb;
        gl_FragColor = color;
      }
    `,
  };
}

function makeUnpremultiplyPass() {
  return new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        // Guarding the divide with max(c.a, 1e-5) instead of a real
        // threshold meant near-transparent pixels (most of this canvas,
        // most of the time — the trail is a small effect over an
        // otherwise-empty full-viewport layer) divided by almost zero,
        // amplifying any residual RGB noise there by up to 100000x before
        // the clamp pinned it to solid white. Harmless where mediump
        // float precision hides the error, but exactly the kind of thing
        // that blows up differently on other GPUs/precision — output flat
        // transparent black below a real threshold instead of dividing at
        // all, which is what caused the bright, unreadable-content bug on
        // mobile Safari (this canvas sits over every page's Clouds stage).
        if (c.a < 0.02) {
          gl_FragColor = vec4(0.0);
          return;
        }
        vec3 straight = c.rgb / c.a;
        gl_FragColor = vec4(clamp(straight, 0.0, 1.0), c.a);
      }
    `,
  });
}

function calculateScale(el) {
  // clientWidth/Height (layout box), not getBoundingClientRect (rendered
  // box) — this site's sections are actively scale()/filter()'d by the
  // scroll-crossfade timeline, which would otherwise make this fluctuate
  // with scroll position instead of reflecting the element's real size.
  const base = 600;
  const current = Math.min(Math.max(1, el.clientWidth), Math.max(1, el.clientHeight));
  return Math.max(0.5, Math.min(2.0, current / base));
}

export function initGhostCursor(
  host,
  {
    // Lower than the original's default of 50: MAX_TRAIL_LENGTH compiles
    // into an unrolled fragment-shader loop, each iteration running a
    // 5-octave fbm() — at 50 that's genuinely heavy per-pixel work every
    // frame. 28 keeps a full-looking trail at meaningfully lower GPU cost.
    trailLength = 28,
    inertia = 0.5,
    grainIntensity = 0.05,
    bloomStrength = 0.15,
    bloomRadius = 1.0,
    bloomThreshold = 0.025,
    brightness = 1,
    color = '#d13b2a',
    mixBlendMode = 'screen',
    edgeIntensity = 0,
    maxDevicePixelRatio = 0.5,
    targetPixels,
    fadeDelayMs,
    fadeDurationMs,
  } = {}
) {
  const parent = host.parentElement;
  if (!parent) return { destroy() {} };

  let active = true;

  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const pixelBudget = targetPixels ?? (isTouch ? 0.9e6 : 1.3e6);
  const fadeDelay = fadeDelayMs ?? (isTouch ? 500 : 1000);
  const fadeDuration = fadeDurationMs ?? (isTouch ? 1000 : 1500);

  // Only force a positioning context if the parent's EFFECTIVE (computed)
  // position is static — checking parent.style.position (inline only, as
  // the original React component did) misses ancestors positioned via a
  // stylesheet rule, like this site's `.planet-section { position: sticky }`,
  // and would otherwise clobber that sticky positioning with an inline
  // `relative`, breaking the section's whole scroll-stacking behavior.
  const prevParentInlinePos = parent.style.position;
  const parentWasStatic = getComputedStyle(parent).position === 'static';
  if (parentWasStatic) {
    parent.style.position = 'relative';
  }

  const renderer = new THREE.WebGLRenderer({
    antialias: !isTouch,
    alpha: true,
    depth: false,
    stencil: false,
    powerPreference: isTouch ? 'low-power' : 'high-performance',
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.pointerEvents = 'none';
  if (mixBlendMode) renderer.domElement.style.mixBlendMode = String(mixBlendMode);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geom = new THREE.PlaneGeometry(2, 2);

  const maxTrail = Math.max(1, Math.floor(trailLength));
  const trailBuf = Array.from({ length: maxTrail }, () => new THREE.Vector2(0.5, 0.5));
  let head = 0;

  const baseColor = new THREE.Color(color);

  const material = new THREE.ShaderMaterial({
    defines: { MAX_TRAIL_LENGTH: maxTrail },
    uniforms: {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector3(1, 1, 1) },
      iMouse: { value: new THREE.Vector2(0.5, 0.5) },
      iPrevMouse: { value: trailBuf.map((v) => v.clone()) },
      iOpacity: { value: 1.0 },
      iScale: { value: 1.0 },
      iBaseColor: { value: new THREE.Vector3(baseColor.r, baseColor.g, baseColor.b) },
      iBrightness: { value: brightness },
      iEdgeIntensity: { value: edgeIntensity },
    },
    vertexShader: baseVertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geom, material);
  scene.add(mesh);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), bloomStrength, bloomRadius, bloomThreshold);
  composer.addPass(bloomPass);

  const filmPass = new ShaderPass(makeFilmGrainShader(grainIntensity));
  composer.addPass(filmPass);

  composer.addPass(makeUnpremultiplyPass());

  let hasValidSize = false;

  const resize = () => {
    if (!active) return;
    const cssW = Math.floor(host.clientWidth);
    const cssH = Math.floor(host.clientHeight);
    if (cssW <= 0 || cssH <= 0) {
      hasValidSize = false;
      return;
    }

    const currentDPR = Math.min(window.devicePixelRatio || 1, maxDevicePixelRatio);
    const need = cssW * cssH * currentDPR * currentDPR;
    const scale = need <= pixelBudget ? 1 : Math.max(0.5, Math.min(1, Math.sqrt(pixelBudget / Math.max(1, need))));
    const pixelRatio = currentDPR * scale;

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(cssW, cssH, false);
    // EffectComposer caches its own _pixelRatio once, at construction time
    // (read from renderer.getPixelRatio() before this function ever set it
    // to anything but the default) — composer.setSize() alone reuses that
    // STALE ratio, sizing every pass's internal render targets off it
    // instead of the `pixelRatio` computed here. That mismatch is what
    // desynced iResolution (this material's own uniform, correct) from the
    // composer's actual render target size (wrong, off by the stale/real
    // ratio), which is what threw the whole mouse-tracking off by a clean,
    // consistent scale factor. setPixelRatio() re-syncs it (and re-triggers
    // setSize using the just-updated dimensions), so call size first, then
    // pixel ratio.
    composer.setSize(cssW, cssH);
    composer.setPixelRatio(pixelRatio);

    const wpx = Math.max(1, Math.floor(cssW * pixelRatio));
    const hpx = Math.max(1, Math.floor(cssH * pixelRatio));
    material.uniforms.iResolution.value.set(wpx, hpx, 1);
    material.uniforms.iScale.value = calculateScale(host);
    // bloomPass.setSize() is no longer called directly — composer.setSize()
    // /setPixelRatio() already resize every pass (bloomPass included) via
    // its own internal loop, using the now-correct, in-sync pixel ratio.

    hasValidSize = true;
  };

  resize();
  const resizeObserver = new ResizeObserver(() => {
    if (active) resize();
  });
  resizeObserver.observe(parent);
  resizeObserver.observe(host);

  const currentMouse = new THREE.Vector2(0.5, 0.5);
  const velocity = new THREE.Vector2(0, 0);
  let fadeOpacity = 1.0;
  let lastMoveTime = performance.now();
  let pointerActive = false;
  let running = false;
  let rafId = null;

  const start = performance.now();
  const animate = () => {
    if (!active) return;

    if (!hasValidSize) {
      rafId = requestAnimationFrame(animate);
      return;
    }

    const now = performance.now();
    const t = (now - start) / 1000;

    if (pointerActive) {
      velocity.set(currentMouse.x - material.uniforms.iMouse.value.x, currentMouse.y - material.uniforms.iMouse.value.y);
      material.uniforms.iMouse.value.copy(currentMouse);
      fadeOpacity = 1.0;
    } else {
      velocity.multiplyScalar(inertia);
      if (velocity.lengthSq() > 1e-6) {
        material.uniforms.iMouse.value.add(velocity);
      }
      const dt = now - lastMoveTime;
      if (dt > fadeDelay) {
        const k = Math.min(1, (dt - fadeDelay) / fadeDuration);
        fadeOpacity = Math.max(0, 1 - k);
      }
    }

    const N = trailBuf.length;
    head = (head + 1) % N;
    trailBuf[head].copy(material.uniforms.iMouse.value);
    const arr = material.uniforms.iPrevMouse.value;
    for (let i = 0; i < N; i++) {
      arr[i].copy(trailBuf[(head - i + N) % N]);
    }

    material.uniforms.iOpacity.value = fadeOpacity;
    material.uniforms.iTime.value = t;
    filmPass.uniforms.iTime.value = t;

    composer.render();

    if (!pointerActive && fadeOpacity <= 0.001) {
      running = false;
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(animate);
  };

  const ensureLoop = () => {
    if (!running) {
      running = true;
      rafId = requestAnimationFrame(animate);
    }
  };

  // Listens on window and bounds-checks manually, rather than attaching to
  // `parent` and relying on the DOM to hit-test/bubble correctly. This site
  // stacks every planet-section as an overlapping full-viewport box, and
  // each one gets its own stacking context the moment the scroll-crossfade
  // puts a `transform` on it — so a LATER section's real interactive
  // content (e.g. Contact Land's contact-link anchors, which legitimately
  // need pointer-events: auto) can out-rank an EARLIER section's listener
  // target the instant its fade-in starts, well before it's visually
  // dominant or the gauge even says so. Window-level tracking sidesteps
  // hit-testing/stacking-context entirely: it fires for every pointer
  // move regardless of what's "on top" at that pixel.
  const onPointerMove = (e) => {
    const rect = parent.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) {
      if (pointerActive) {
        pointerActive = false;
        lastMoveTime = performance.now();
      }
      return;
    }
    const x = THREE.MathUtils.clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const y = THREE.MathUtils.clamp(1 - (e.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    currentMouse.set(x, y);
    pointerActive = true;
    lastMoveTime = performance.now();
    ensureLoop();
  };
  const onDocumentLeave = () => {
    pointerActive = false;
    lastMoveTime = performance.now();
  };

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('mouseleave', onDocumentLeave, { passive: true });

  ensureLoop();

  return {
    destroy() {
      active = false;
      hasValidSize = false;

      if (rafId !== null) cancelAnimationFrame(rafId);
      running = false;
      rafId = null;

      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('mouseleave', onDocumentLeave);
      resizeObserver.disconnect();

      scene.clear();
      geom.dispose();
      material.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();

      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      if (parentWasStatic) {
        parent.style.position = prevParentInlinePos;
      }
    },
  };
}
