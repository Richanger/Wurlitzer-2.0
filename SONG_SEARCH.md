## Track Search via songs.json and Fuzzy Matching

This document explains how the track-title search is implemented so another developer or AI can reproduce it in a similar project. The feature loads a prebuilt `songs.json`, performs a lightweight fuzzy search for a given track title, and shows the corresponding Platz number without navigating slides.

### Overview

- Input: A user enters a song title into a simple text field and clicks “Suchen” (or presses Enter).
- Data: The app has a `songs.json` file containing AI/OCR-extracted track titles, mapped to an album index and an optional disc number.
- Output: The app displays the Platz number (or an approximation if disc is ambiguous) next to the input. It does not change the current slide.

### songs.json schema

The code is tolerant of slightly different field names, but the canonical schema is:

```json
[
  {
    "n": "track title",     // or "title": "..."; the code normalizes to n
    "albumIndex": 12,        // zero-based index of the album in window.albums
    "disc": 1                // 1 or 2; null if unknown
  }
]
```

- At minimum, each entry must include a title (`n` or `title`) and `albumIndex`.
- `disc` may be `1`, `2`, or `null` if the extractor could not determine the disc.

### Integration points in the page

- UI (added under the existing Platz jump):

```html
<div class="jump" aria-label="Suche nach Songtitel">
  <input id="song" type="text" placeholder="Songtitel…" />
  <button id="find-song">Suchen</button>
  <span id="song-platz" aria-live="polite"></span>
  <!-- The span shows: "Platz X" or "≈ Platz X" or "Kein Treffer" -->
  <!-- No slide navigation is performed. -->
  <!-- Uses existing styling class .jump for a simple, consistent layout. -->
  
</div>
```

- Data load and search logic are implemented in the same script block that builds the Swiper and slots.

### Data loading and normalization

```js
let SONGS = [];
fetch('songs.json')
  .then(r => r.json())
  .then(d => {
    // Normalize items so downstream logic is simple and consistent
    SONGS = Array.isArray(d) ? d.map(x => ({
      n: String(x?.n ?? x?.title ?? '').trim(),
      albumIndex: Number(x?.albumIndex ?? -1),
      disc: (x?.disc == null ? null : Number(x.disc))
    })) : [];
  })
  .catch(() => { SONGS = []; });
```

- Titles are coerced to strings, trimmed, and stored under `n`.
- `albumIndex` is coerced to a number (or `-1` if missing).
- `disc` is normalized to `1`, `2`, or `null`.

### Text normalization for fuzzy matching

```js
function norm(s){
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')   // strip accents/diacritics
    .replace(/[^a-z0-9 ]/g, ' ')       // remove punctuation/symbols
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim();
}
```

This reduces the impact of case, accents (e.g., “ä” vs “a”), punctuation, and spacing differences between what the user types and what OCR produced.

### Fuzzy scoring strategy

The implementation is a lightweight composite score that balances simplicity with decent recall:

```js
function fuzzyScore(query, candidate){
  const q = norm(query);
  const c = norm(candidate);
  if (!q || !c) return 0;
  if (q === c) return 3;                  // exact match gets a strong score

  let score = 0;
  if (c.includes(q) || q.includes(c)) score += 1;  // substring match

  const tq = new Set(q.split(' '));
  const tc = new Set(c.split(' '));
  let inter = 0; tq.forEach(t => { if (tc.has(t)) inter++; });
  const union = new Set([...tq, ...tc]).size || 1;
  score += inter / union;                 // token Jaccard overlap (0..1)

  if (c.startsWith(q)) score += 0.25;     // small prefix bonus
  return score;
}
```

- Exact matches win decisively.
- Substring matches and token overlap favor strong partial matches.
- A small prefix bonus helps queries that begin with the track name.
- This is intentionally simple: no external libs, predictable, and fast.

Selecting the best match uses a minimum-score threshold to avoid spurious hits:

```js
function findBestSong(query){
  let best = null; let bestScore = 0;
  for (const s of SONGS){
    const sc = fuzzyScore(query, s?.n || '');
    if (sc > bestScore){ bestScore = sc; best = s; }
  }
  return bestScore > 0.15 ? best : null; // simple cut-off to reject noise
}
```

The `0.15` threshold is conservative but can be tuned for your dataset.

### Mapping a matched song to a Platz number

The page already computes the mapping from album index to Platz slots via `computeMaps(albums)`, producing:

- `albumStartSlot[i]`: the first Platz slot for album `i`.
- Each album spans one or two consecutive slots, based on `albums[i].discs` (1 or 2).

The Platz computation for a found song is:

```js
function computePlatzForSong(song){
  const i = Number(song?.albumIndex ?? -1);
  if (!(i >= 0) || !albums[i]) return { slot: null, approx: false };

  const start = albumStartSlot[i] || 0;
  const discsCount = Math.min(2, Math.max(1, Number(albums[i]?.discs || 1)));
  const d = song?.disc;

  if (d === 1) return { slot: start, approx: false };

  if (d === 2){
    if (discsCount >= 2) return { slot: Math.min(start + 1, MAX_SLOTS), approx: false };
    return { slot: start, approx: true }; // song says disc 2, album only 1 → best-effort
  }

  // Disc unknown (null)
  if (discsCount === 1) return { slot: start, approx: false };
  return { slot: start, approx: true };   // 2 discs but unknown disc → approximate to first
}
```

- If the song specifies `disc` and the album has that disc, we return a precise Platz.
- If `disc` is `null` and the album has two discs, we display an approximate Platz `≈ Platz start`.
- If `albumIndex` is invalid or album missing, we return `slot: null` and show “Unbekannt”.

### Wiring the UI controls

```js
function showSongPlatz(){
  const inp = document.getElementById('song');
  const out = document.getElementById('song-platz');
  const q = inp.value;
  if (!q){ out.textContent = ''; return; }

  const s = findBestSong(q);
  if (!s){ out.textContent = 'Kein Treffer'; return; }

  const res = computePlatzForSong(s);
  if (!res.slot){ out.textContent = 'Unbekannt'; return; }

  out.textContent = (res.approx ? '≈ Platz ' : 'Platz ') + res.slot;
}

document.getElementById('find-song').addEventListener('click', showSongPlatz);
document.getElementById('song').addEventListener('keydown', e => {
  if (e.key === 'Enter') showSongPlatz();
});
```

- The function only updates text; it does not call `swiper.slideTo(...)`.
- `aria-live="polite"` on the result span gives accessible feedback.

### Replication checklist for another project

1. Produce a `songs.json` as per the schema (fields: `n` or `title`, `albumIndex`, `disc`).
2. Ensure your page has an `albums` array defining each album’s `front`, `back`, and `discs` (1 or 2), and that you compute:
   - `albumStartSlot` using a function equivalent to `computeMaps(albums)`.
3. Add to your HTML UI:
   - An input `#song`, a button `#find-song`, and a result span `#song-platz`.
4. Load `songs.json` and normalize entries to `{ n, albumIndex, disc }`.
5. Implement `norm`, `fuzzyScore`, `findBestSong` with a reasonable threshold.
6. Implement `computePlatzForSong` using `albumStartSlot` and `albums[i].discs`.
7. Bind the click/Enter events to compute and display the Platz text. Do not change slides.

### Edge cases and behavior notes

- Multiple albums may contain identical track titles; this simple implementation returns the single best-scoring match. If ambiguity is frequent, show a small list of top-3 matches for manual pick.
- If the browser opens the HTML file directly from disk, `fetch('songs.json')` can be blocked by CORS/file URL policies. Serve via a local web server for reliability.
- The fuzzy threshold (`0.15`) can be tuned for your dataset. If you get false negatives, reduce it; if you get false positives, increase it.
- If your albums can have more than two discs, extend both the slot mapping and Platz computation accordingly.

### Possible enhancements

- Replace the custom scorer with a library (e.g., Fuse.js) for better ranking and tokenization.
- Implement diacritic-insensitive but language-aware comparison if you need high fidelity for German-specific edge cases.
- Add a small dropdown/autocomplete that displays the top-N matches with their Platz numbers.
- Cache `songs.json` and debounce input to avoid redundant work on rapid typing.

---

This approach keeps runtime dependencies minimal and fast, leverages a precomputed `songs.json`, and provides a pragmatic Platz estimate even with partial (disc-null) metadata.


