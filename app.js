(function () {
  const Levels = window.Levels;
  const { useState, useEffect, useRef, useCallback, useMemo } = React;
  const h = React.createElement;
  const {
    clamp,
    processImage,
    warpPerspective,
    quadOutSize,
    isQuadConvex,
    quadArea,
    DEFAULT_BW,
    DEFAULT_BC,
    DEFAULT_LEVELS,
    DEFAULT_SETTINGS,
    BW_PRESETS,
    Icon,
    BWMixer,
    BCPanel,
    LevelsPanel,
  } = Levels;

  function App() {
    const [image, setImage] = useState(null);
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [preset, setPreset] = useState("Default");
    const [drag, setDrag] = useState(false);
    const [showOriginal, setShowOriginal] = useState(false);
    const [toast, setToast] = useState(null);
    const [cropMode, setCropMode] = useState(false);
    const [crop, setCrop] = useState(null);
    const [draftCrop, setDraftCrop] = useState(null);
    const [cropAspect, setCropAspect] = useState("free");
    const [perspectiveMode, setPerspectiveMode] = useState(false);
    const [draftQuad, setDraftQuad] = useState(null);
    const [perspectiveResult, setPerspectiveResult] = useState(null);
    const [processing, setProcessing] = useState(false);
    const fileInputRef = useRef(null);
    const canvasRef = useRef(null);
    const toastTimerRef = useRef(null);

    function showToast(msg, kind) {
      setToast({ msg, kind });
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(null), 1800);
    }

    const loadFile = useCallback((file) => {
      if (!file || !file.type.startsWith("image/")) {
        showToast("Please drop an image file", "error");
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const MAX = 4096;
        const origW = img.naturalWidth, origH = img.naturalHeight;
        let w = origW, hh = origH;
        const downscaled = Math.max(w, hh) > MAX;
        if (downscaled) {
          const s = MAX / Math.max(w, hh);
          w = Math.round(w * s); hh = Math.round(hh * s);
        }
        const c = document.createElement("canvas");
        c.width = w; c.height = hh;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, hh);
        const data = ctx.getImageData(0, 0, w, hh);
        setImage({ name: file.name || "image", width: w, height: hh, srcImageData: data });
        setCrop(null); setDraftCrop(null); setCropMode(false);
        setPerspectiveResult(null); setDraftQuad(null); setPerspectiveMode(false);
        URL.revokeObjectURL(url);
        if (downscaled) {
          showToast("Downscaled " + origW + "×" + origH + " → " + w + "×" + hh + " (max " + MAX + "px)");
        }
      };
      img.onerror = () => { showToast("Could not load that image", "error"); URL.revokeObjectURL(url); };
      img.src = url;
    }, []);

    useEffect(() => {
      const onDragOver = (e) => { e.preventDefault(); setDrag(true); };
      const onDragLeave = (e) => { if (e.target === document.body || e.relatedTarget === null) setDrag(false); };
      const onDrop = (e) => {
        e.preventDefault();
        setDrag(false);
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) loadFile(file);
      };
      const onPaste = (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const it of items) {
          if (it.type && it.type.startsWith("image/")) {
            loadFile(it.getAsFile());
            break;
          }
        }
      };
      window.addEventListener("dragover", onDragOver);
      window.addEventListener("dragleave", onDragLeave);
      window.addEventListener("drop", onDrop);
      window.addEventListener("paste", onPaste);
      return () => {
        window.removeEventListener("dragover", onDragOver);
        window.removeEventListener("dragleave", onDragLeave);
        window.removeEventListener("drop", onDrop);
        window.removeEventListener("paste", onPaste);
      };
    }, [loadFile]);

    useEffect(() => {
      const onKey = (e) => {
        const target = e.target;
        const isField = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
        if (isField) return;
        if (cropMode) {
          if (e.key === "Enter") { e.preventDefault(); applyCrop(); return; }
          if (e.key === "Escape") { e.preventDefault(); cancelCrop(); return; }
        }
        if (perspectiveMode) {
          if (e.key === "Enter") { e.preventDefault(); applyPerspective(); return; }
          if (e.key === "Escape") { e.preventDefault(); cancelPerspective(); return; }
        }
        if (e.code === "Space") { e.preventDefault(); setShowOriginal(true); }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c" && image && !window.getSelection().toString()) {
          e.preventDefault();
          copyToClipboard();
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && image) {
          e.preventDefault();
          downloadImage();
        }
        if (e.key === "i" && image && !cropMode && !perspectiveMode) setSettings((s) => Object.assign({}, s, { invert: !s.invert }));
      };
      const onUp = (e) => { if (e.code === "Space") setShowOriginal(false); };
      window.addEventListener("keydown", onKey);
      window.addEventListener("keyup", onUp);
      return () => {
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("keyup", onUp);
      };
    }, [image, settings, cropMode, draftCrop, perspectiveMode, draftQuad, crop, perspectiveResult]);

    const workingSrc = useMemo(() => {
      if (!image) return null;
      const base = perspectiveResult || image.srcImageData;
      if (cropMode || !crop) return base;
      const { x, y, w, h } = crop;
      if (w <= 0 || h <= 0) return base;
      if (x + w > base.width || y + h > base.height) return base;
      const out = new ImageData(w, h);
      for (let row = 0; row < h; row++) {
        const srcStart = ((y + row) * base.width + x) * 4;
        out.data.set(base.data.subarray(srcStart, srcStart + w * 4), row * w * 4);
      }
      return out;
    }, [image, crop, cropMode, perspectiveResult]);

    const processedData = useMemo(() => {
      if (!workingSrc) return null;
      return processImage(workingSrc, settings);
    }, [workingSrc, settings]);

    const histogram = useMemo(() => {
      if (!processedData) return null;
      const hh = new Array(256).fill(0);
      const d = processedData.data;
      if (settings.colorMode) {
        for (let i = 0; i < d.length; i += 4) {
          const v = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) | 0;
          hh[v < 0 ? 0 : v > 255 ? 255 : v]++;
        }
      } else {
        for (let i = 0; i < d.length; i += 4) hh[d[i]]++;
      }
      return hh;
    }, [processedData, settings.colorMode]);

    useEffect(() => {
      if (!workingSrc) return;
      const c = canvasRef.current;
      if (!c) return;
      c.width = workingSrc.width;
      c.height = workingSrc.height;
      const ctx = c.getContext("2d");
      if (showOriginal) {
        ctx.putImageData(workingSrc, 0, 0);
      } else if (processedData) {
        ctx.putImageData(processedData, 0, 0);
      }
    }, [workingSrc, processedData, showOriginal]);

    function getExportBlob() {
      return new Promise((resolve) => {
        if (!processedData) { resolve(null); return; }
        const c = document.createElement("canvas");
        c.width = processedData.width;
        c.height = processedData.height;
        c.getContext("2d").putImageData(processedData, 0, 0);
        c.toBlob((blob) => resolve(blob), "image/png");
      });
    }
    async function downloadImage() {
      if (!image) return;
      const blob = await getExportBlob();
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      const base = (image.name || "image").replace(/\.[^.]+$/, "");
      a.href = url;
      a.download = base + "_alpha.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      showToast("Downloaded " + a.download);
    }
    async function copyToClipboard() {
      if (!image) return;
      try {
        const blob = await getExportBlob();
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        showToast("Copied to clipboard");
      } catch (err) {
        showToast("Clipboard not available — try Download instead", "error");
      }
    }

    function enterPerspectiveMode() {
      if (!image || !workingSrc) return;
      const w = workingSrc.width, h = workingSrc.height;
      const ix = w * 0.12, iy = h * 0.12;
      const seed = [
        { x: ix,     y: iy     },
        { x: w - ix, y: iy     },
        { x: w - ix, y: h - iy },
        { x: ix,     y: h - iy },
      ];
      setDraftQuad(seed);
      setPerspectiveMode(true);
      setCropMode(false);
    }
    function cancelPerspective() {
      setPerspectiveMode(false);
      setDraftQuad(null);
    }
    function applyPerspective() {
      if (!draftQuad || !workingSrc) return;
      if (!isQuadConvex(draftQuad)) {
        showToast("Quad must be convex (no crossed edges)", "error");
        return;
      }
      const minArea = Math.max(64, workingSrc.width * workingSrc.height * 0.005);
      if (quadArea(draftQuad) < minArea) {
        showToast("Quad is too small / collapsed", "error");
        return;
      }
      const sz = quadOutSize(draftQuad);
      const base = workingSrc;
      setProcessing(true);
      setTimeout(() => {
        const warped = warpPerspective(base, draftQuad, sz.w, sz.h);
        setProcessing(false);
        if (!warped) {
          showToast("Could not warp — quad is degenerate", "error");
          return;
        }
        setPerspectiveResult(warped);
        setCrop(null);
        setPerspectiveMode(false);
        setDraftQuad(null);
        showToast("Perspective applied (" + sz.w + "×" + sz.h + ")");
      }, 30);
    }
    function clearPerspective() {
      setPerspectiveResult(null);
      setDraftQuad(null);
      setPerspectiveMode(false);
    }

    function beginQuadDrag(idx, e) {
      if (!canvasRef.current || !workingSrc) return;
      e.preventDefault();
      e.stopPropagation();
      const rectEl = canvasRef.current.getBoundingClientRect();
      const srcW = workingSrc.width, srcH = workingSrc.height;
      const sx = srcW / rectEl.width, sy = srcH / rectEl.height;
      const move = (ev) => {
        const cx = clamp((ev.clientX - rectEl.left) * sx, 0, srcW);
        const cy = clamp((ev.clientY - rectEl.top) * sy, 0, srcH);
        setDraftQuad((q) => {
          if (!q) return q;
          const next = q.slice();
          next[idx] = { x: cx, y: cy };
          return next;
        });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    }

    function enterCropMode() {
      setDraftCrop(crop);
      setCropMode(true);
      setPerspectiveMode(false);
    }
    function cancelCrop() {
      setCropMode(false);
      setDraftCrop(null);
    }
    function applyCrop() {
      if (draftCrop && draftCrop.w >= 2 && draftCrop.h >= 2) {
        setCrop(draftCrop);
      }
      setCropMode(false);
      setDraftCrop(null);
    }
    function clearCrop() {
      setCrop(null);
      setDraftCrop(null);
      setCropMode(false);
    }

    function beginCropDrag(e) {
      if (!cropMode || !canvasRef.current || !workingSrc) return;
      e.preventDefault();
      const rectEl = canvasRef.current.getBoundingClientRect();
      const srcW = workingSrc.width, srcH = workingSrc.height;
      const sx = srcW / rectEl.width, sy = srcH / rectEl.height;
      const startX = clamp((e.clientX - rectEl.left) * sx, 0, srcW);
      const startY = clamp((e.clientY - rectEl.top) * sy, 0, srcH);
      const update = (ev) => {
        let cx = clamp((ev.clientX - rectEl.left) * sx, 0, srcW);
        let cy = clamp((ev.clientY - rectEl.top) * sy, 0, srcH);
        let dx = cx - startX, dy = cy - startY;
        let aspect = cropAspect;
        if (ev.shiftKey) aspect = "1:1";
        const locked = aspect !== "free";
        if (locked) {
          const [aw, ah] = aspect.split(":").map(Number);
          const ratio = aw / ah;
          const adx = Math.abs(dx), ady = Math.abs(dy);
          if (adx === 0 && ady === 0) { dx = 0; dy = 0; }
          else if (adx / Math.max(ady, 0.0001) > ratio) {
            dy = (dy >= 0 ? 1 : -1) * adx / ratio;
          } else {
            dx = (dx >= 0 ? 1 : -1) * ady * ratio;
          }
          const maxAbsDx = dx >= 0 ? srcW - startX : startX;
          const maxAbsDy = dy >= 0 ? srcH - startY : startY;
          const adx2 = Math.abs(dx), ady2 = Math.abs(dy);
          if (adx2 > maxAbsDx || ady2 > maxAbsDy) {
            const scale = Math.min(
              adx2 > 0 ? maxAbsDx / adx2 : 1,
              ady2 > 0 ? maxAbsDy / ady2 : 1
            );
            dx *= scale;
            dy *= scale;
          }
        }
        let x = Math.min(startX, startX + dx);
        let y = Math.min(startY, startY + dy);
        let w = Math.abs(dx);
        let hh = Math.abs(dy);
        if (!locked) {
          if (x < 0) { w += x; x = 0; }
          if (y < 0) { hh += y; y = 0; }
          if (x + w > srcW) w = srcW - x;
          if (y + hh > srcH) hh = srcH - y;
        }
        setDraftCrop({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(hh) });
      };
      update(e);
      const up = () => {
        window.removeEventListener("pointermove", update);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", update);
      window.addEventListener("pointerup", up);
    }

    function resetAll() {
      setSettings(DEFAULT_SETTINGS);
      setPreset("Default");
    }
    function resetBW() {
      setSettings((s) => Object.assign({}, s, { bw: Object.assign({}, DEFAULT_BW) }));
      setPreset("Default");
    }
    function resetLevels() {
      setSettings((s) => Object.assign({}, s, { levels: Object.assign({}, DEFAULT_LEVELS) }));
    }
    function resetBC() {
      setSettings((s) => Object.assign({}, s, { bc: Object.assign({}, DEFAULT_BC) }));
    }
    function applyPreset(name) {
      setPreset(name);
      setSettings((s) => Object.assign({}, s, { bw: Object.assign({}, BW_PRESETS[name]) }));
    }

    const hasImage = !!image;

    return h("div", { className: "app" },
      h("header", null,
        h("div", { className: "brand" },
          h("div", { className: "brand-mark" }),
          h("span", null, "Levels"),
          h("span", { className: "brand-sub" }, "— texture alpha studio")
        ),
        h("div", { className: "header-actions" },
          h("input", {
            ref: fileInputRef,
            className: "file-input",
            type: "file",
            accept: "image/*",
            onChange: (e) => e.target.files && e.target.files[0] && loadFile(e.target.files[0]),
          }),
          h("button", { className: "btn", onClick: () => fileInputRef.current.click() },
            Icon.upload, " Open image"
          ),
          h("button", { className: "btn", onClick: resetAll, disabled: !hasImage },
            Icon.reset, " Reset"
          ),
          h("button", { className: "btn", onClick: copyToClipboard, disabled: !hasImage },
            Icon.copy, " Copy ", h("span", { className: "kbd" }, "⌘C")
          ),
          h("button", { className: "btn primary", onClick: downloadImage, disabled: !hasImage },
            Icon.download, " Download ", h("span", { className: "kbd" }, "⌘S")
          )
        )
      ),

      h("div", { className: "stage" },
        hasImage && h("div", { className: "canvas-wrap" },
          h("canvas", { ref: canvasRef, className: (workingSrc && workingSrc.width < 1000) ? "" : "fit-smooth" }),
          cropMode && h("div", {
            className: "crop-overlay",
            onPointerDown: beginCropDrag,
          },
            draftCrop && draftCrop.w > 0 && draftCrop.h > 0
              ? h("div", {
                  className: "crop-rect",
                  style: {
                    left: (draftCrop.x / workingSrc.width) * 100 + "%",
                    top: (draftCrop.y / workingSrc.height) * 100 + "%",
                    width: (draftCrop.w / workingSrc.width) * 100 + "%",
                    height: (draftCrop.h / workingSrc.height) * 100 + "%",
                  },
                })
              : h("div", { className: "crop-rect empty", style: { left: 0, top: 0, width: "100%", height: "100%" } },
                  h("span", { className: "crop-empty-msg" }, "Drag to define a crop")
                )
          ),
          perspectiveMode && draftQuad && workingSrc && h("div", { className: "perspective-overlay" },
            h("svg", {
              className: "perspective-svg",
              viewBox: "0 0 " + workingSrc.width + " " + workingSrc.height,
              preserveAspectRatio: "none",
            },
              h("polygon", {
                points: draftQuad.map((p) => p.x + "," + p.y).join(" "),
                fill: "oklch(0.78 0.13 65 / 0.08)",
                stroke: "oklch(0.96 0.004 80)",
                strokeWidth: 1,
                vectorEffect: "non-scaling-stroke",
              })
            ),
            draftQuad.map((p, i) =>
              h("div", {
                key: i,
                className: "quad-handle",
                style: {
                  left: (p.x / workingSrc.width) * 100 + "%",
                  top: (p.y / workingSrc.height) * 100 + "%",
                },
                onPointerDown: (e) => beginQuadDrag(i, e),
                title: ["Top-left", "Top-right", "Bottom-right", "Bottom-left"][i],
              })
            )
          ),
          processing && h("div", { className: "stage-processing" },
            h("div", { className: "stage-processing-inner" }, "Warping…")
          )
        ),
        hasImage && h("div", { className: "stage-overlay" },
          h("span", { className: "chip" }, image.name),
          h("span", { className: "chip" }, (workingSrc ? workingSrc.width : image.width) + " × " + (workingSrc ? workingSrc.height : image.height)),
          perspectiveResult && !perspectiveMode && h("span", { className: "chip", style: { color: "var(--accent)" } }, "warped"),
          crop && !cropMode && h("span", { className: "chip", style: { color: "var(--accent)" } }, "cropped"),
          settings.colorMode && h("span", { className: "chip", style: { color: "var(--accent)" } }, "color"),
          settings.invert && h("span", { className: "chip", style: { color: "var(--accent)" } }, "inverted")
        ),
        hasImage && !cropMode && !perspectiveMode && h("div", { className: "stage-controls" },
          h("button", {
            className: "toggle-btn" + (showOriginal ? " held" : ""),
            onMouseDown: () => setShowOriginal(true),
            onMouseUp: () => setShowOriginal(false),
            onMouseLeave: () => setShowOriginal(false),
            title: "Hold to compare with original",
          }, Icon.eye, " ", showOriginal ? "Original" : "Hold to compare"),
          h("button", {
            className: "toggle-btn",
            onClick: enterCropMode,
            title: "Crop image",
          }, Icon.crop, " Crop"),
          h("button", {
            className: "toggle-btn",
            onClick: enterPerspectiveMode,
            title: "Perspective crop — drag 4 corners",
          }, Icon.perspective, " Perspective"),
          crop && h("button", {
            className: "toggle-btn",
            onClick: clearCrop,
            title: "Reset crop to full frame",
          }, Icon.reset, " Reset crop"),
          perspectiveResult && h("button", {
            className: "toggle-btn",
            onClick: clearPerspective,
            title: "Reset perspective",
          }, Icon.reset, " Reset persp."),
          h("button", {
            className: "toggle-btn" + (settings.colorMode ? " on" : ""),
            onClick: () => setSettings((s) => Object.assign({}, s, { colorMode: !s.colorMode })),
            title: "Keep RGB color (skip B&W conversion)",
          }, Icon.color, " Color"),
          h("button", {
            className: "toggle-btn" + (settings.invert ? " on" : ""),
            onClick: () => setSettings((s) => Object.assign({}, s, { invert: !s.invert })),
            title: "Invert (I)",
          }, Icon.invert, " Invert")
        ),
        hasImage && perspectiveMode && h("div", { className: "stage-controls" },
          h("span", { style: { color: "var(--fg-2)", fontSize: 12, padding: "0 6px" } },
            "Drag corners to align with target rectangle"
          ),
          h("button", {
            className: "toggle-btn",
            onClick: cancelPerspective,
            title: "Cancel (Esc)",
          }, Icon.close, " Cancel"),
          h("button", {
            className: "toggle-btn on",
            onClick: applyPerspective,
            title: "Apply (Enter)",
          }, Icon.check, " Apply")
        ),
        hasImage && cropMode && h("div", { className: "stage-controls" },
          h("select", {
            className: "aspect-select",
            value: cropAspect,
            onChange: (e) => setCropAspect(e.target.value),
            title: "Aspect ratio (Shift while dragging = 1:1)",
          },
            h("option", { value: "free" }, "Free"),
            h("option", { value: "1:1" }, "1:1"),
            h("option", { value: "4:5" }, "4:5"),
            h("option", { value: "5:4" }, "5:4"),
            h("option", { value: "16:9" }, "16:9"),
            h("option", { value: "9:16" }, "9:16"),
            h("option", { value: "3:2" }, "3:2"),
            h("option", { value: "2:3" }, "2:3")
          ),
          h("button", {
            className: "toggle-btn",
            onClick: cancelCrop,
            title: "Cancel (Esc)",
          }, Icon.close, " Cancel"),
          h("button", {
            className: "toggle-btn on",
            onClick: applyCrop,
            title: "Apply (Enter)",
          }, Icon.check, " Apply")
        ),
        !hasImage && h("div", { className: "empty" + (drag ? " drag" : "") },
          h("div", { className: "glyph" }, Icon.image),
          h("h2", null, "Drop an image to start"),
          h("p", null, "Or paste from clipboard, or open a file."),
          h("div", { className: "actions" },
            h("button", { className: "btn primary", onClick: () => fileInputRef.current.click() },
              Icon.upload, " Choose image"
            )
          ),
          h("span", { className: "hint" }, "Photos, screenshots, scans, any RGB image — JPEG · PNG · WebP")
        )
      ),

      h("aside", null,
        h(BWMixer, {
          bw: settings.bw,
          bwOn: settings.bwOn,
          colorMode: settings.colorMode,
          onChange: (bw) => { setSettings((s) => Object.assign({}, s, { bw })); setPreset(""); },
          onToggle: (v) => setSettings((s) => Object.assign({}, s, { bwOn: v })),
          onReset: resetBW,
          preset,
          onPreset: applyPreset,
        }),
        h(BCPanel, {
          bc: settings.bc,
          onChange: (bc) => setSettings((s) => Object.assign({}, s, { bc })),
          onReset: resetBC,
        }),
        h(LevelsPanel, {
          levels: settings.levels,
          onChange: (levels) => setSettings((s) => Object.assign({}, s, { levels })),
          onReset: resetLevels,
          histogram,
        }),
        h("section", { className: "panel", style: { borderBottom: 0, marginTop: "auto" } },
          h("div", { className: "panel-body", style: { paddingTop: 14 } },
            h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              h("span", { style: { color: "var(--fg-3)", fontSize: 11.5 } }, "Shortcuts")
            ),
            h("div", { className: "mono", style: { fontSize: 11, color: "var(--fg-3)", lineHeight: 1.7 } },
              h("div", null, h("span", { style: { color: "var(--fg-2)" } }, "Space"), "   hold to compare original"),
              h("div", null, h("span", { style: { color: "var(--fg-2)" } }, "I"), "      toggle invert"),
              h("div", null,
                h("span", { style: { color: "var(--fg-2)" } }, "⌘ C"), "   copy result · ",
                h("span", { style: { color: "var(--fg-2)" } }, "⌘ S"), " download"
              ),
              h("div", null, h("span", { style: { color: "var(--fg-2)" } }, "2×click"), " slider → reset to default")
            )
          )
        )
      ),

      toast && h("div", { className: "toast show" + (toast.kind === "error" ? " error" : "") }, toast.msg)
    );
  }

  ReactDOM.createRoot(document.getElementById("root")).render(h(App));
})();
