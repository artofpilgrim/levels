# Levels

A browser-based texture alpha studio. Drop an image, dial in a black-and-white channel mix, Brightness/Contrast, a Levels curve, and a perspective or rectangular crop — then copy or download the result as a PNG. Useful for generating alpha masks, height/roughness maps, and stylised monochrome plates from photo references.

**Live:** https://artofpilgrim.github.io/levels/

## Features

- **Channel mixer** with six color sliders (reds, yellows, greens, cyans, blues, magentas) and presets (Default, High contrast, Dark sky, Infrared, Red filter, Stark grunge).
- **Brightness / Contrast** as a linear (legacy-Photoshop) pre-stage applied before Levels.
- **Levels** panel with histogram, input shadow/midtone/highlight handles, and output black/white handles. Keyboard-navigable (Tab to focus a handle, arrow keys to nudge, Shift+arrow for big steps).
- **Rectangular crop** with free or locked aspect ratios (1:1, 4:5, 5:4, 16:9, 9:16, 3:2, 2:3). Shift while dragging = 1:1.
- **Perspective crop** — drag 4 corners of a quad to deskew a region into a rectangle. Bilinear sampling. Composes with rectangular crop; Reset preserves the pre-perspective crop.
- **Color mode** — bypass the B&W conversion entirely and apply Levels / B/C per-channel.
- **Invert**.
- Real-time preview. Hold `Space` to compare against the original (before processing, after any crop/perspective).
- One-click copy to clipboard or PNG download. Drag-and-drop, paste from clipboard, or open from disk.
- Inputs over 4096px on the long edge are downscaled with a toast notice.

## Shortcuts

| Key | Action |
| --- | --- |
| `Space` (hold) | Compare against original |
| `I` | Toggle invert |
| `Ctrl` / `⌘` + `C` | Copy result to clipboard |
| `Ctrl` / `⌘` + `S` | Download PNG |
| `Enter` / `Esc` | Apply / cancel inside crop or perspective mode |
| Arrow keys on a slider or levels handle | Nudge (Shift for 10× step) |
| Double-click a slider | Reset that slider to default |

## File layout

No build step. React 18 + ReactDOM are loaded from a CDN; everything else is plain ES5/ES2017 JavaScript split into three ordered `<script>` tags.

| File | Role |
| --- | --- |
| `index.html` | Shell — links CSS and the three JS files. |
| `styles.css` | All styles. |
| `image.js` | `clamp`, B&W gray lookup, Levels/B/C LUT, `processImage`, homography + bilinear `warpPerspective`, defaults, presets. No React. |
| `components.js` | `Icon`, `Slider`, `NumberInput`, `BWMixer`, `BCPanel`, `LevelsPanel`. Uses React. |
| `app.js` | The `App` component + DOM boot. |

The three JS files communicate via a `window.Levels` namespace. `image.js` populates math + data first, `components.js` reads from it and adds the panels, `app.js` reads everything and renders.

## Running locally

Open `index.html` in any modern browser — `file://` works for sibling `<script src="...">` files. For touch-pointer and clipboard testing, serve over HTTP (`python -m http.server` from the repo root).
