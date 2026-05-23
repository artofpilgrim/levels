(function () {
  const Levels = window.Levels;
  const { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } = React;
  const h = React.createElement;
  const {
    clamp,
    processImage,
    warpPerspective,
    quadOutSize,
    isQuadConvex,
    quadArea,
    quadMinEdge,
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
    const [selectedQuadCorner, setSelectedQuadCorner] = useState(null);
    const [perspectiveAspect, setPerspectiveAspect] = useState("auto");
    const [perspectiveResult, setPerspectiveResult] = useState(null);
    const [cropBeforePerspective, setCropBeforePerspective] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });
    const [panning, setPanning] = useState(false);
    const [historyVersion, setHistoryVersion] = useState(0);
    const fileInputRef = useRef(null);
    const stageRef = useRef(null);
    const canvasRef = useRef(null);
    const toastTimerRef = useRef(null);
    const sessionRef = useRef(0);
    const historyRef = useRef({ undo: [], redo: [] });
    const historyMergeRef = useRef(null);

    function showToast(msg, kind) {
      setToast({ msg, kind });
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(null), 1800);
    }

    function cloneSettings(src) {
      return {
        bw: Object.assign({}, src.bw),
        bc: Object.assign({}, src.bc),
        levels: Object.assign({}, src.levels),
        bwOn: src.bwOn,
        invert: src.invert,
        colorMode: src.colorMode,
      };
    }
    function cloneCropRect(src) {
      return src ? Object.assign({}, src) : null;
    }
    function makeHistorySnapshot() {
      return {
        settings: cloneSettings(settings),
        preset,
        crop: cloneCropRect(crop),
        perspectiveResult,
        cropBeforePerspective: cloneCropRect(cropBeforePerspective),
      };
    }
    function restoreHistorySnapshot(snap) {
      setSettings(cloneSettings(snap.settings));
      setPreset(snap.preset);
      setCrop(cloneCropRect(snap.crop));
      setDraftCrop(null);
      setCropMode(false);
      setPerspectiveResult(snap.perspectiveResult);
      setCropBeforePerspective(cloneCropRect(snap.cropBeforePerspective));
      setDraftQuad(null);
      setSelectedQuadCorner(null);
      setPerspectiveMode(false);
    }
    function bumpHistory() {
      setHistoryVersion((v) => v + 1);
    }
    function clearHistory() {
      historyRef.current = { undo: [], redo: [] };
      historyMergeRef.current = null;
      bumpHistory();
    }
    function pushHistorySnapshot(snap, mergeKey) {
      if (!image) return;
      const now = Date.now();
      const last = historyMergeRef.current;
      if (mergeKey && last && last.key === mergeKey && now - last.time < 700) {
        last.time = now;
        return;
      }
      historyRef.current.undo.push(snap);
      if (historyRef.current.undo.length > 40) historyRef.current.undo.shift();
      historyRef.current.redo = [];
      historyMergeRef.current = mergeKey ? { key: mergeKey, time: now } : null;
      bumpHistory();
    }
    function recordHistory(mergeKey) {
      pushHistorySnapshot(makeHistorySnapshot(), mergeKey);
    }
    function undoEdit() {
      if (!historyRef.current.undo.length) return;
      const current = makeHistorySnapshot();
      const prev = historyRef.current.undo.pop();
      historyRef.current.redo.push(current);
      historyMergeRef.current = null;
      restoreHistorySnapshot(prev);
      bumpHistory();
    }
    function redoEdit() {
      if (!historyRef.current.redo.length) return;
      const current = makeHistorySnapshot();
      const next = historyRef.current.redo.pop();
      historyRef.current.undo.push(current);
      historyMergeRef.current = null;
      restoreHistorySnapshot(next);
      bumpHistory();
    }

    const loadFile = useCallback((file) => {
      if (!file || !file.type.startsWith("image/")) {
        showToast("Please drop an image file", "error");
        return;
      }
      sessionRef.current++;
      const job = sessionRef.current;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        if (job !== sessionRef.current) { URL.revokeObjectURL(url); return; }
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
        setPerspectiveResult(null); setDraftQuad(null); setSelectedQuadCorner(null); setPerspectiveMode(false);
        setCropBeforePerspective(null);
        setView({ zoom: 1, panX: 0, panY: 0 });
        clearHistory();
        URL.revokeObjectURL(url);
        if (downscaled) {
          showToast("Downscaled " + origW + "×" + origH + " → " + w + "×" + hh + " (max " + MAX + "px)");
        }
      };
      img.onerror = () => {
        if (job !== sessionRef.current) { URL.revokeObjectURL(url); return; }
        showToast("Could not load that image", "error");
        URL.revokeObjectURL(url);
      };
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
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) redoEdit();
          else undoEdit();
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
          e.preventDefault();
          redoEdit();
          return;
        }
        if (cropMode) {
          if (e.key === "Enter") { e.preventDefault(); applyCrop(); return; }
          if (e.key === "Escape") { e.preventDefault(); cancelCrop(); return; }
        }
        if (perspectiveMode) {
          if (nudgeSelectedQuadCorner(e)) { e.preventDefault(); return; }
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
        if (e.key === "i" && image && !cropMode && !perspectiveMode) {
          recordHistory("toggle-invert");
          setSettings((s) => Object.assign({}, s, { invert: !s.invert }));
        }
      };
      const onUp = (e) => { if (e.code === "Space") setShowOriginal(false); };
      window.addEventListener("keydown", onKey);
      window.addEventListener("keyup", onUp);
      return () => {
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("keyup", onUp);
      };
    }, [image, settings, cropMode, draftCrop, perspectiveMode, draftQuad, selectedQuadCorner, crop, perspectiveResult, historyVersion]);

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

    const deferredSettings = useDeferredValue(settings);

    const processedData = useMemo(() => {
      if (!workingSrc) return null;
      return processImage(workingSrc, deferredSettings);
    }, [workingSrc, deferredSettings]);

    const histogram = useMemo(() => {
      if (!processedData) return null;
      const hh = new Array(256).fill(0);
      const d = processedData.data;
      if (deferredSettings.colorMode) {
        for (let i = 0; i < d.length; i += 4) {
          const v = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) | 0;
          hh[v < 0 ? 0 : v > 255 ? 255 : v]++;
        }
      } else {
        for (let i = 0; i < d.length; i += 4) hh[d[i]]++;
      }
      return hh;
    }, [processedData, deferredSettings.colorMode]);

    function parseAspect(value) {
      if (!value || value === "auto") return null;
      const parts = value.split(":").map(Number);
      if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
      return parts[0] / parts[1];
    }

    const perspectiveOutSize = useMemo(() => {
      if (!draftQuad || !workingSrc) return null;
      return quadOutSize(draftQuad, workingSrc.width, workingSrc.height, parseAspect(perspectiveAspect));
    }, [draftQuad, workingSrc, perspectiveAspect]);

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

    // React attaches `onWheel` as passive at the root, so e.preventDefault() is
    // ignored there and the page (or stage) scrolls. Bind directly with passive:false.
    useEffect(() => {
      const el = stageRef.current;
      if (!el || !image) return;
      const onWheel = (e) => {
        e.preventDefault();
        const factor = Math.exp(-e.deltaY * 0.0015);
        const cx = e.clientX, cy = e.clientY;
        setView((v) => {
          const rect = el.getBoundingClientRect();
          const zoom = clamp(v.zoom * factor, 1, 8);
          if (Math.abs(zoom - v.zoom) < 0.001) return v;
          if (zoom === 1) return { zoom: 1, panX: 0, panY: 0 };
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const px = cx - centerX;
          const py = cy - centerY;
          const scale = zoom / v.zoom;
          return {
            zoom,
            panX: px - (px - v.panX) * scale,
            panY: py - (py - v.panY) * scale,
          };
        });
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, [image]);

    function setZoomAt(nextZoom, clientX, clientY) {
      setView((v) => {
        const stage = stageRef.current;
        const rect = stage && stage.getBoundingClientRect();
        const zoom = clamp(typeof nextZoom === "function" ? nextZoom(v.zoom) : nextZoom, 1, 8);
        if (Math.abs(zoom - v.zoom) < 0.001) return v;
        if (!rect || zoom === 1) return { zoom, panX: 0, panY: 0 };
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const px = (clientX == null ? centerX : clientX) - centerX;
        const py = (clientY == null ? centerY : clientY) - centerY;
        const scale = zoom / v.zoom;
        return {
          zoom,
          panX: px - (px - v.panX) * scale,
          panY: py - (py - v.panY) * scale,
        };
      });
    }
    function zoomBy(factor) {
      setZoomAt((z) => z * factor);
    }
    function resetView() {
      setView({ zoom: 1, panX: 0, panY: 0 });
    }
    function beginPan(e) {
      if (!image) return;
      const target = e.target;
      const isControl = target && target.closest && target.closest("button, input, select");
      const wantsPan = e.button === 1 || e.altKey || (e.button === 0 && view.zoom > 1 && !cropMode && !perspectiveMode);
      if (!wantsPan || isControl) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX, startY = e.clientY;
      const startPanX = view.panX, startPanY = view.panY;
      setPanning(true);
      const move = (ev) => {
        setView((v) => Object.assign({}, v, {
          panX: startPanX + ev.clientX - startX,
          panY: startPanY + ev.clientY - startY,
        }));
      };
      const up = () => {
        setPanning(false);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    }

    function getExportBlob() {
      return new Promise((resolve) => {
        if (!workingSrc) { resolve(null); return; }
        const exportData = processImage(workingSrc, settings);
        const c = document.createElement("canvas");
        c.width = exportData.width;
        c.height = exportData.height;
        c.getContext("2d").putImageData(exportData, 0, 0);
        c.toBlob((blob) => resolve(blob), "image/png");
      });
    }
    async function downloadImage() {
      if (!image) return;
      const blob = await getExportBlob();
      if (!blob) { showToast("Could not encode PNG — image may be too large", "error"); return; }
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
        if (!blob) throw new Error("Could not encode PNG");
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
      setSelectedQuadCorner(0);
      setPerspectiveMode(true);
      setCropMode(false);
    }
    function cancelPerspective() {
      setPerspectiveMode(false);
      setDraftQuad(null);
      setSelectedQuadCorner(null);
    }
    function applyPerspective() {
      if (!draftQuad || !workingSrc) return;
      if (!isQuadConvex(draftQuad)) {
        showToast("Quad must be convex (no crossed edges)", "error");
        return;
      }
      if (quadMinEdge(draftQuad) < 8) {
        showToast("Quad edges must be at least 8px", "error");
        return;
      }
      if (quadArea(draftQuad) < 64) {
        showToast("Quad is too small / collapsed", "error");
        return;
      }
      const base = workingSrc;
      const sz = quadOutSize(draftQuad, base.width, base.height, parseAspect(perspectiveAspect));
      const cropAtApply = crop;
      const job = sessionRef.current;
      setProcessing(true);
      setTimeout(() => {
        if (job !== sessionRef.current) { setProcessing(false); return; }
        const warped = warpPerspective(base, draftQuad, sz.w, sz.h);
        if (job !== sessionRef.current) { setProcessing(false); return; }
        setProcessing(false);
        if (!warped) {
          showToast("Could not warp — quad is degenerate", "error");
          return;
        }
        recordHistory();
        setCropBeforePerspective(cropAtApply);
        setPerspectiveResult(warped);
        setCrop(null);
        setPerspectiveMode(false);
        setDraftQuad(null);
        setSelectedQuadCorner(null);
        resetView();
        showToast("Perspective applied (" + sz.w + "×" + sz.h + ")");
      }, 30);
    }
    function clearPerspective() {
      recordHistory();
      setPerspectiveResult(null);
      setCrop(cropBeforePerspective);
      setCropBeforePerspective(null);
      setDraftQuad(null);
      setSelectedQuadCorner(null);
      setPerspectiveMode(false);
      resetView();
    }

    function nudgeSelectedQuadCorner(e) {
      if (!draftQuad || selectedQuadCorner === null || !workingSrc || e.metaKey || e.ctrlKey || e.altKey) return false;
      let dx = 0, dy = 0;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else return false;
      setDraftQuad((q) => {
        if (!q) return q;
        const next = q.slice();
        const p = next[selectedQuadCorner];
        next[selectedQuadCorner] = {
          x: clamp(p.x + dx, 0, workingSrc.width),
          y: clamp(p.y + dy, 0, workingSrc.height),
        };
        return next;
      });
      return true;
    }

    function beginQuadDrag(idx, e) {
      if (!canvasRef.current || !workingSrc) return;
      e.preventDefault();
      e.stopPropagation();
      setSelectedQuadCorner(idx);
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
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
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
        recordHistory();
        setCrop(draftCrop);
        resetView();
      }
      setCropMode(false);
      setDraftCrop(null);
    }
    function clearCrop() {
      recordHistory();
      setCrop(null);
      setDraftCrop(null);
      setCropMode(false);
      resetView();
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
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", update);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    }

    function resetAll() {
      recordHistory();
      setSettings(DEFAULT_SETTINGS);
      setPreset("Default");
    }
    function resetBW() {
      recordHistory();
      setSettings((s) => Object.assign({}, s, { bw: Object.assign({}, DEFAULT_BW) }));
      setPreset("Default");
    }
    function resetLevels() {
      recordHistory();
      setSettings((s) => Object.assign({}, s, { levels: Object.assign({}, DEFAULT_LEVELS) }));
    }
    function resetBC() {
      recordHistory();
      setSettings((s) => Object.assign({}, s, { bc: Object.assign({}, DEFAULT_BC) }));
    }
    function applyPreset(name) {
      recordHistory();
      setPreset(name);
      setSettings((s) => Object.assign({}, s, { bw: Object.assign({}, BW_PRESETS[name]) }));
    }

    const hasImage = !!image;
    const canUndo = historyRef.current.undo.length > 0;
    const canRedo = historyRef.current.redo.length > 0;
    const cornerNames = ["Top-left", "Top-right", "Bottom-right", "Bottom-left"];
    const selectedCornerName = selectedQuadCorner === null ? "No corner" : cornerNames[selectedQuadCorner];
    const perspectiveAspectLabel = perspectiveAspect === "auto" ? "Auto" : perspectiveAspect;
    const perspectiveReady = !!(draftQuad && quadMinEdge(draftQuad) >= 8 && quadArea(draftQuad) >= 64 && isQuadConvex(draftQuad));
    const viewStyle = {
      transform: "translate(" + view.panX + "px, " + view.panY + "px) scale(" + view.zoom + ")",
      "--inv-zoom": 1 / view.zoom,
    };

    function quadGridLines(quad) {
      const mix = (a, b, t) => ({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
      const lines = [];
      [1 / 3, 2 / 3].forEach((t, i) => {
        const top = mix(quad[0], quad[1], t);
        const bottom = mix(quad[3], quad[2], t);
        const left = mix(quad[0], quad[3], t);
        const right = mix(quad[1], quad[2], t);
        lines.push(h("line", {
          key: "v" + i,
          x1: top.x, y1: top.y, x2: bottom.x, y2: bottom.y,
          stroke: "oklch(0.96 0.004 80 / 0.5)",
          strokeWidth: 1,
          vectorEffect: "non-scaling-stroke",
        }));
        lines.push(h("line", {
          key: "h" + i,
          x1: left.x, y1: left.y, x2: right.x, y2: right.y,
          stroke: "oklch(0.96 0.004 80 / 0.5)",
          strokeWidth: 1,
          vectorEffect: "non-scaling-stroke",
        }));
      });
      return lines;
    }

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
            onChange: (e) => {
              const f = e.target.files && e.target.files[0];
              if (f) loadFile(f);
              e.target.value = "";
            },
          }),
          h("button", { className: "btn", onClick: () => fileInputRef.current.click() },
            Icon.upload, " Open image"
          ),
          h("button", { className: "btn", onClick: resetAll, disabled: !hasImage },
            Icon.reset, " Reset"
          ),
          h("button", { className: "btn", onClick: undoEdit, disabled: !canUndo, title: "Undo (Ctrl/⌘ Z)" },
            Icon.undo, " Undo"
          ),
          h("button", { className: "btn", onClick: redoEdit, disabled: !canRedo, title: "Redo (Ctrl/⌘ Shift Z)" },
            Icon.redo, " Redo"
          ),
          h("button", { className: "btn", onClick: copyToClipboard, disabled: !hasImage },
            Icon.copy, " Copy ", h("span", { className: "kbd" }, "⌘C")
          ),
          h("button", { className: "btn primary", onClick: downloadImage, disabled: !hasImage },
            Icon.download, " Download ", h("span", { className: "kbd" }, "⌘S")
          )
        )
      ),

      h("div", {
        ref: stageRef,
        className: "stage" + (panning ? " panning" : "") + (view.zoom > 1 ? " zoomed" : ""),
        onPointerDownCapture: beginPan,
      },
        hasImage && h("div", { className: "canvas-wrap", style: viewStyle },
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
              }),
              h("g", { className: "perspective-grid" }, quadGridLines(draftQuad))
            ),
            draftQuad.map((p, i) =>
              h("div", {
                key: i,
                className: "quad-handle" + (selectedQuadCorner === i ? " active" : ""),
                style: {
                  left: (p.x / workingSrc.width) * 100 + "%",
                  top: (p.y / workingSrc.height) * 100 + "%",
                },
                onPointerDown: (e) => beginQuadDrag(i, e),
                title: cornerNames[i],
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
        hasImage && h("div", { className: "zoom-controls" },
          h("button", {
            className: "zoom-btn",
            onClick: () => zoomBy(0.8),
            disabled: view.zoom <= 1.01,
            title: "Zoom out",
          }, "-"),
          h("button", {
            className: "zoom-readout",
            onClick: resetView,
            disabled: view.zoom === 1 && view.panX === 0 && view.panY === 0,
            title: "Reset zoom and pan",
          }, Math.round(view.zoom * 100) + "%"),
          h("button", {
            className: "zoom-btn",
            onClick: () => zoomBy(1.25),
            disabled: view.zoom >= 7.99,
            title: "Zoom in",
          }, "+")
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
            onClick: () => {
              recordHistory("toggle-color");
              setSettings((s) => Object.assign({}, s, { colorMode: !s.colorMode }));
            },
            title: "Keep RGB color (skip B&W conversion)",
          }, Icon.color, " Color"),
          h("button", {
            className: "toggle-btn" + (settings.invert ? " on" : ""),
            onClick: () => {
              recordHistory("toggle-invert");
              setSettings((s) => Object.assign({}, s, { invert: !s.invert }));
            },
            title: "Invert (I)",
          }, Icon.invert, " Invert")
        ),
        hasImage && perspectiveMode && h("div", { className: "stage-controls" },
          h("span", { style: { color: "var(--fg-2)", fontSize: 12, padding: "0 6px" } },
            perspectiveOutSize
              ? "Output " + perspectiveOutSize.w + " × " + perspectiveOutSize.h + " · " + perspectiveAspectLabel + " · " + selectedCornerName
              : "Drag corners to align with target rectangle"
          ),
          h("select", {
            className: "aspect-select",
            value: perspectiveAspect,
            onChange: (e) => setPerspectiveAspect(e.target.value),
            title: "Perspective output aspect",
          },
            h("option", { value: "auto" }, "Auto"),
            h("option", { value: "1:1" }, "1:1"),
            h("option", { value: "4:3" }, "4:3"),
            h("option", { value: "3:2" }, "3:2"),
            h("option", { value: "16:9" }, "16:9"),
            h("option", { value: "5:4" }, "5:4"),
            h("option", { value: "2:3" }, "2:3"),
            h("option", { value: "9:16" }, "9:16")
          ),
          h("button", {
            className: "toggle-btn",
            onClick: cancelPerspective,
            title: "Cancel (Esc)",
          }, Icon.close, " Cancel"),
          h("button", {
            className: "toggle-btn on",
            onClick: applyPerspective,
            disabled: !perspectiveReady,
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
          onChange: (bw) => {
            recordHistory("bw");
            setSettings((s) => Object.assign({}, s, { bw }));
            setPreset("");
          },
          onToggle: (v) => {
            recordHistory("bw-toggle");
            setSettings((s) => Object.assign({}, s, { bwOn: v }));
          },
          onReset: resetBW,
          preset,
          onPreset: applyPreset,
        }),
        h(BCPanel, {
          bc: settings.bc,
          onChange: (bc) => {
            recordHistory("bc");
            setSettings((s) => Object.assign({}, s, { bc }));
          },
          onReset: resetBC,
        }),
        h(LevelsPanel, {
          levels: settings.levels,
          onChange: (levels) => {
            recordHistory("levels");
            setSettings((s) => Object.assign({}, s, { levels }));
          },
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
              h("div", null,
                h("span", { style: { color: "var(--fg-2)" } }, "⌘ Z"), "   undo · ",
                h("span", { style: { color: "var(--fg-2)" } }, "⇧⌘ Z"), " redo"
              ),
              h("div", null, h("span", { style: { color: "var(--fg-2)" } }, "Wheel"), "  zoom · drag to pan when zoomed"),
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
