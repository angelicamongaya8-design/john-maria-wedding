# John + Maria

A wedding invitation site for **John Rolly Gumbi** and **Ma. Rhea Gabas** —
2 February 2027, Timmy in the Woods, Antipolo, Rizal.

The page opens as a sealed envelope. Tapping the wax seal lifts the flap,
raises the card, starts the music, and hands you off to the invitation itself.

No framework, no build step, no dependencies. Plain HTML, CSS and one
vanilla-JS file.

---

## Design

| | |
|---|---|
| **Motif** | Black and white only — no third colour anywhere in the palette |
| **Ground** | `#FAFAF8` paper on `#F1F0EC`, so the column reads as a sheet |
| **Ink** | `#111110`, with `#6E6C67` and `#9C9A94` for supporting text |
| **Display** | Cormorant Garamond 300 — matches the contrast of the J·M monogram |
| **Utility** | Jost 200–300, widely tracked, for uppercase labels |
| **Elements** | Lace scallops, pearl strands, calla lily and tulip — all drawn as SVG |

The lace and the pearls are one `<pattern>` and one `<radialGradient>`,
defined once in an off-screen `<svg>` and referenced by every divider on the
page. The flowers are hand-drawn paths. The only raster asset is the couple's
own monogram.

## Layout

```
.
├── index.html              the whole page, one document
├── assets/
│   ├── css/
│   │   ├── reset.css       baseline: safe-area insets, box defaults
│   │   └── style.css       tokens, type scale, envelope, sections
│   ├── js/
│   │   └── main.js         envelope, countdown, music, scroll reveals
│   ├── img/
│   │   └── monogram.png    the J·M monogram, transparent background
│   └── audio/
│       └── score.mp3       background music (see Music below)
└── tools/
    ├── stamp-assets.mjs    cache-busts the asset URLs in index.html
    └── build-artifact.mjs  derives the Claude-artifact build
```

## After editing anything in assets/

```bash
node tools/stamp-assets.mjs
```

GitHub Pages serves assets with a ten-minute cache and browsers hold them
for much longer. Change `style.css` without changing its URL and returning
visitors keep running the old file — the edit appears to have done nothing.
The script rewrites the `?v=` on each asset link to a hash of that file's
contents, so a changed file always gets a new URL and an unchanged one stays
cached. `build-artifact.mjs` runs it for you.

## Running it

It is a static site — no server required for a quick look:

```bash
open index.html
```

Fonts and the audio element behave better over HTTP, so for real testing:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploying to GitHub Pages

1. Push to a repository.
2. **Settings → Pages → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The site appears at `https://<user>.github.io/<repo>/`.

Nothing needs to be built or compiled first.

## What still needs filling in

| Item | Where | Note |
|---|---|---|
| RSVP link | `index.html`, `#rsvp-link` | Replace `href="#rsvp-pending"` with the real form URL. The button stays hidden until the `href` stops starting with `#`, so the page never shows a dead link. |
| Photos | — | No gallery yet. The layout leaves room between the invitation and the countdown. |

## Music

`assets/audio/score.mp3` is a violin instrumental cover of *Love Story*, a
Taylor Swift composition. It is fine on a private invitation page shared with
guests. **If you make this repository public, take the audio out or keep the
repo private** — redistributing a recording of a copyrighted composition is a
different thing from playing it on your own invitation.

To swap the track, drop a new file in at the same path. The player expects
roughly 2–4 MB; anything much larger makes guests on mobile data wait.

The script handles the awkward parts:

- autoplay is never attempted without a tap, so browsers do not block it
- the volume fades in over ~2 seconds rather than starting at full
- the control stays hidden if the file is missing, instead of showing a dead button
- iOS never fires `canplay` before a user gesture, so the control is not gated on it
- music pauses when the tab goes to the background

## Accessibility

- Every control is a real `<button>` with an `aria-label` and a visible focus ring
- `prefers-reduced-motion` collapses the envelope sequence, the drifting specks
  and the scroll reveals
- The invitation is marked `aria-hidden` until the envelope is opened, so screen
  readers are not reading the page through the overlay
- Scroll reveals are armed by script, never by CSS — with JavaScript off, nothing
  is left stuck at `opacity: 0`

## The countdown

Pinned to `2027-02-02T15:00:00+08:00`. It is correct for a guest in any
timezone, and it reads 00 : 00 : 00 : 00 rather than going negative after
the ceremony starts.
