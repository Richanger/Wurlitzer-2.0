
/* Swiper-based Jukebox
   - Virtual + Lazy + Keyboard + A11y + Navigation
   - Tap to flip using Swiper's 'tap' event; swipe to navigate
   - Neighbor peeks via slidesPerView + centeredSlides
   - Jump to slot using discs-based slot map
*/
(() => {
  const MAX_SLOTS = 100;
  // Normalize data source
  const list = Array.isArray(window.albums) ? window.albums : (typeof albums !== "undefined" ? albums : []);
  const platzEl = document.getElementById("platz");
  if (!Array.isArray(list) || list.length === 0) {
    platzEl.textContent = "Keine Alben konfiguriert";
    return;
  }
  window.albums = list;

  // Maps: slot -> album index, album -> start slot
  const slotToAlbum = new Array(MAX_SLOTS+1).fill(-1);
  const albumStartSlot = new Array(albums.length).fill(0);
  let slot = 1;
  for (let i=0;i<albums.length;i++){
    const discs = Math.min(2, Math.max(1, Number(albums[i]?.discs||1)));
    albumStartSlot[i] = slot;
    for (let j=0;j<discs && slot<=MAX_SLOTS;j++) slotToAlbum[slot++] = i;
  }

  function rangeLabel(i){
    const start = albumStartSlot[i] || 0;
    const discs = Math.min(2, Math.max(1, Number(albums[i]?.discs||1)));
    const end = Math.min(MAX_SLOTS, start + discs - 1);
    return (start===end) ? `${start}` : `${start}\u2013${end}`;
  }

  // Build slides as strings for Virtual module
  const slides = albums.map((a, i) => {
    const altFront = `Cover Platz ${rangeLabel(i)}`;
    const altBack  = `Rückseite Platz ${rangeLabel(i)}`;
    const eagerFront = i < 2; // Make first two fronts eager so they show instantly on first load
    const frontAttrs = eagerFront
      ? `src="${a.front}" alt="${altFront}" loading="eager" fetchpriority="high" decoding="async"`
      : `data-src="${a.front}" alt="${altFront}"`;
    const frontClass = eagerFront ? 'front' : 'front swiper-lazy';
    const preloader = eagerFront ? '' : `\n   <div class=\"swiper-lazy-preloader\"></div>`;
    return (
`<div class="flip" data-index="${i}">
   <div class="flip-inner" aria-label="Album umdrehen">
     <div class="face front">
       <img class="${frontClass}" ${frontAttrs} />
     </div>
     <div class="face back">
       <img class="back" data-back="${a.back}" alt="${altBack}" decoding="async" />
     </div>
   </div>${preloader}
 </div>`
    );
  });

  // Initialize Swiper (bundle build exposes global Swiper)
  const swiper = new Swiper('.swiper', {
    // Feel
    speed: 240,
    resistanceRatio: 0.5,
    shortSwipes: true,
    longSwipesRatio: 0.2,
    threshold: 12,
    centeredSlides: true,
    slidesPerView: 1.1,
    spaceBetween: 14,
    // Lazy
    preloadImages: false,
    lazy: { loadPrevNext: true, loadPrevNextAmount: 2, loadOnTransitionStart: true },
    // Virtual: render a buffer so neighbor slides exist in DOM
    virtual: { enabled: true, slides, addSlidesBefore: 2, addSlidesAfter: 2 },
    // A11y + Keyboard
    a11y: true,
    keyboard: { enabled: true },
    // Navigation
    navigation: { nextEl: '#nextBtn', prevEl: '#prevBtn' },
    // Watch progress for scaling
    watchSlidesProgress: true,
  });

  // Helpers
  function activeSlideEl(){
    // With Virtual slides, use selector to get the actual active element
    return swiper.slidesEl?.querySelector('.swiper-slide-active');
  }
  function ensureFrontLoaded(slideEl){
    if (!slideEl) return;
    const img = slideEl.querySelector('img.front');
    if (!img) return;
    // If already eager (src set), nothing to do
    if (img.getAttribute('src')) return;
    if (img.dataset && img.dataset.src) {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
      img.classList.add('swiper-lazy-loaded');
      const pre = slideEl.querySelector('.swiper-lazy-preloader');
      if (pre) pre.remove();
    }
  }
  function ensureNeighborsFrontLoaded(){
    const active = activeSlideEl();
    if (!active) return;
    const prev = active.previousElementSibling;
    const next = active.nextElementSibling;
    const prev2 = prev?.previousElementSibling;
    const next2 = next?.nextElementSibling;
    ensureFrontLoaded(active);
    ensureFrontLoaded(prev);
    ensureFrontLoaded(next);
    ensureFrontLoaded(prev2);
    ensureFrontLoaded(next2);
  }
  function ensureBackLoaded(slideEl){
    if (!slideEl) return;
    const img = slideEl.querySelector('img.back') || slideEl.querySelector('[data-back]');
    if (img && !img.dataset.loaded) {
      const src = img.getAttribute('data-back');
      if (src) { img.src = src; img.dataset.loaded = '1'; }
    }
  }
  function resetFlip(slideEl){
    if (!slideEl) return;
    const inner = slideEl.querySelector('.flip-inner');
    if (inner) inner.classList.remove('is-flipped');
  }
  function resetZoom(slideEl){
    if (!slideEl) return;
    const inner = slideEl.querySelector('.flip-inner');
    if (inner) {
      inner.style.setProperty('--zoom','1');
      inner.style.setProperty('--tx','0px');
      inner.style.setProperty('--ty','0px');
    }
  }
  function setZoom(slideEl, scale){
    if (!slideEl) return;
    const inner = slideEl.querySelector('.flip-inner');
    if (inner) inner.style.setProperty('--zoom', String(scale));
  }
  function setTranslation(slideEl, dx, dy){
    if (!slideEl) return;
    const inner = slideEl.querySelector('.flip-inner');
    if (inner) {
      inner.style.setProperty('--tx', `${dx}px`);
      inner.style.setProperty('--ty', `${dy}px`);
    }
  }
  function updatePlatz(){
    const i = swiper.activeIndex;
    platzEl.textContent = `Platz ${rangeLabel(i)}`;
  }

  // On init, set Platz and preload neighbors' fronts (handled by Swiper lazy)
  swiper.on('afterInit', () => {
    updatePlatz();
    resetFlip(activeSlideEl());
    resetZoom(activeSlideEl());
    // Ensure initial visible slide (and neighbors) load immediately
    if (swiper.lazy && typeof swiper.lazy.load === 'function') {
      swiper.lazy.load();
    }
    ensureNeighborsFrontLoaded();
  });

  // Slide change: reset flip, update Platz
  swiper.on('slideChange', () => {
    resetFlip(activeSlideEl());
    resetZoom(activeSlideEl());
    updatePlatz();
    // Nudge lazy-loader in case transition didn't trigger
    if (swiper.lazy && typeof swiper.lazy.load === 'function') {
      swiper.lazy.load();
    }
    ensureNeighborsFrontLoaded();
  });

  // Load neighbor fronts as soon as user begins to swipe, to feel instant
  swiper.on('sliderMove', () => {
    ensureNeighborsFrontLoaded();
  });

  // Tap to flip (works across touch/desktop). Only if the tap is within the flip of the ACTIVE slide.
  swiper.on('tap', (sw, e) => {
    const sEl = activeSlideEl();
    if (!sEl) return;
    const flip = e?.target?.closest('.flip');
    if (!flip || !sEl.contains(flip)) return;
    const inner = sEl.querySelector('.flip-inner');
    if (!inner) return;
    // Load back image on first flip
    ensureBackLoaded(sEl);
    inner.classList.toggle('is-flipped');
  });

  // Click fallback removed to prevent double toggles on touch (Swiper 'tap' covers desktop & touch)

  // Keyboard: add Space/Enter to flip when not typing in an input
  function isTyping(){
    const el = document.activeElement; if (!el) return false;
    const t = el.tagName; return t==="INPUT"||t==="TEXTAREA"||t==="SELECT"||el.isContentEditable;
  }
  window.addEventListener('keydown', (e) => {
    if (isTyping()) return;
    if (e.key === ' ') { e.preventDefault(); const s = activeSlideEl(); ensureBackLoaded(s); const inner = s?.querySelector('.flip-inner'); inner?.classList.toggle('is-flipped'); }
    else if (e.key === 'Enter') { e.preventDefault(); const s = activeSlideEl(); ensureBackLoaded(s); const inner = s?.querySelector('.flip-inner'); inner?.classList.toggle('is-flipped'); }
    else if (e.key === 'Home') { e.preventDefault(); swiper.slideTo(0, 0); }
    else if (e.key === 'End') { e.preventDefault(); swiper.slideTo(albums.length-1, 0); }
  });

  // Jump to slot
  const jump = document.getElementById('jump');
  const goBtn = document.getElementById('go');
  goBtn.addEventListener('click', () => {
    const n = parseInt(jump.value, 10);
    if (!Number.isFinite(n) || n < 1 || n > MAX_SLOTS) { jump.style.borderColor='red'; setTimeout(()=> jump.style.borderColor='', 900); return; }
    const pos = slotToAlbum[n];
    if (pos >= 0) {
      swiper.slideTo(pos, 0); // instant
      resetFlip(activeSlideEl());
      // Ensure target and its neighbors' fronts are loaded immediately
      ensureNeighborsFrontLoaded();
      jump.value=''; jump.style.borderColor='';
      updatePlatz();
    } else {
      jump.style.borderColor='red'; setTimeout(()=> jump.style.borderColor='', 900);
    }
  });
  jump.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter') { e.preventDefault(); goBtn.click(); }
  });

  // Expose for debugging
  window._swiper = swiper;

  // Simple pinch-to-zoom for touch and double-tap to toggle zoom
  let pinchStartDistance = null;
  let pinchStartScale = 1;
  let currentScale = 1;
  let lastTapTime = 0;
  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let panOffset = { x: 0, y: 0 };

  function getDistance(t1, t2){
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  }

  swiper.el.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      // Prevent swiper from stealing the gesture
      swiper.allowTouchMove = false;
      const [t1, t2] = e.touches;
      pinchStartDistance = getDistance(t1, t2);
      const sEl = activeSlideEl();
      const inner = sEl?.querySelector('.flip-inner');
      pinchStartScale = inner ? Number(getComputedStyle(inner).getPropertyValue('--zoom') || 1) : 1;
      isPanning = false;
    } else if (e.touches.length === 1 && currentScale > 1) {
      // Begin panning when zoomed in
      swiper.allowTouchMove = false;
      const t = e.touches[0];
      isPanning = true;
      panStart = { x: t.clientX, y: t.clientY };
      const sEl = activeSlideEl();
      const inner = sEl?.querySelector('.flip-inner');
      const cs = inner ? getComputedStyle(inner) : null;
      panOffset = {
        x: cs ? parseFloat(cs.getPropertyValue('--tx')) || 0 : 0,
        y: cs ? parseFloat(cs.getPropertyValue('--ty')) || 0 : 0,
      };
    }
  }, { passive: true });

  swiper.el.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStartDistance) {
      const [t1, t2] = e.touches;
      const dist = getDistance(t1, t2);
      const scale = Math.max(1, Math.min(2.5, pinchStartScale * (dist / pinchStartDistance)));
      currentScale = scale;
      setZoom(activeSlideEl(), scale);
    } else if (isPanning && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - panStart.x;
      const dy = t.clientY - panStart.y;
      // Limit panning based on zoom so you can't drag beyond edges too far
      const sEl = activeSlideEl();
      const inner = sEl?.querySelector('.flip-inner');
      const cs = inner ? getComputedStyle(inner) : null;
      const scale = cs ? Math.max(1, Number(cs.getPropertyValue('--zoom')) || 1) : 1;
      const maxShift = (scale - 1) * 0.5 * sEl.clientWidth; // half of overflow width
      const maxShiftY = (scale - 1) * 0.5 * sEl.clientHeight;
      const nx = Math.max(-maxShift, Math.min(maxShift, panOffset.x + dx));
      const ny = Math.max(-maxShiftY, Math.min(maxShiftY, panOffset.y + dy));
      setTranslation(sEl, nx, ny);
    }
  }, { passive: true });

  swiper.el.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      // End of gesture, restore swiper movement if not zoomed in
      swiper.allowTouchMove = currentScale <= 1.01;
      if (currentScale <= 1.01) currentScale = 1;
      if (currentScale === 1) setZoom(activeSlideEl(), 1);
      pinchStartDistance = null;
      isPanning = false;
    }
  });

  // Double-tap to toggle zoom (1x <-> 2x)
  swiper.on('tap', (sw, e) => {
    const now = Date.now();
    if (now - lastTapTime < 280) {
      const sEl = activeSlideEl();
      const inner = sEl?.querySelector('.flip-inner');
      const cur = inner ? Number(getComputedStyle(inner).getPropertyValue('--zoom') || 1) : 1;
      const next = cur > 1 ? 1 : 2;
      setZoom(sEl, next);
      currentScale = next;
      swiper.allowTouchMove = next === 1;
    }
    lastTapTime = now;
  });
})();
