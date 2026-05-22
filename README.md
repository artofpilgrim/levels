# Levels

A browser-based texture alpha studio. Drop an image, dial in a black-and-white channel mix and a Levels curve, and copy or download the result as a grayscale PNG — useful for generating alpha masks, height/roughness maps, and stylized monochrome plates from photo references.

**Live:** https://artofpilgrim.github.io/levels/

## Features

- Channel mixer with six color sliders (reds, yellows, greens, cyans, blues, magentas) and a preset library (Default, High contrast, Dark sky, Infrared, Red filter, Stark grunge).
- Levels panel with histogram, input shadow/midtone/highlight handles, and output black/white handles.
- Real-time preview. Hold `Space` to compare against the original.
- One-click copy to clipboard or PNG download.
- Drag-and-drop, paste from clipboard, or open from disk.

## Shortcuts

| Key | Action |
| --- | --- |
| `Space` (hold) | Compare against original |
| `I` | Toggle invert |
| `Ctrl` / `⌘` + `C` | Copy result to clipboard |
| `Ctrl` / `⌘` + `S` | Download PNG |
| Double-click a slider | Reset that slider to default |

## Running locally

Single HTML file with React 18 loaded from a CDN — no build step. Open `index.html` in any modern browser.
