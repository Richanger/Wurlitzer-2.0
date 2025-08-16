Jukebox – Swiper build
----------------------
- Swiper Virtual + Lazy, neighbor peeks, tap-to-flip inside slide, jump to Platz.
- PWA offline with service worker; Swiper CDN assets are pre-cached.

Usage
1) Put your cover images into ./bilder and ensure data.js exports:
   window.albums = [{ front: 'bilder/1-front.webp', back: 'bilder/1-back.webp', discs: 1 }, ...]
2) Serve locally (service worker requires http/https):
   python -m http.server 5500
   then open http://localhost:5500
3) Deploy on GitHub Pages. After first load, do a hard reload once so the SW updates.

Notes
- Tap anywhere on the active cover to flip. Swipe left/right to navigate.
- Jump-to-Platz lands on the front; the previous/next slides show only front.
- If you change files later, bump CACHE in service-worker.js (currently 'jukebox-swiper-cache-v1').