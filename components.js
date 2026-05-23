(function () {
  const Levels = window.Levels = window.Levels || {};
  const { useState, useEffect, useRef, useMemo } = React;
  const h = React.createElement;
  const { clamp, DEFAULT_BW, BW_PRESETS } = Levels;

  /* Inline SVG icons ───────────────────────────────────────── */

  const Icon = {
    upload: h("svg", { className: "icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" },
      h("path", { d: "M12 16V4M6 10l6-6 6 6M4 20h16" })
    ),
    download: h("svg", { className: "icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" },
      h("path", { d: "M12 4v12M6 10l6 6 6-6M4 20h16" })
    ),
    copy: h("svg", { className: "icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" },
      h("rect", { x: "9", y: "9", width: "11", height: "11", rx: "2" }),
      h("path", { d: "M5 15V6a2 2 0 0 1 2-2h9" })
    ),
    reset: h("svg", { className: "icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" },
      h("path", { d: "M3 12a9 9 0 1 0 3-6.7" }),
      h("path", { d: "M3 4v5h5" })
    ),
    eye: h("svg", { className: "icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" },
      h("path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" }),
      h("circle", { cx: "12", cy: "12", r: "3" })
    ),
    invert: h("svg", { className: "icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" },
      h("circle", { cx: "12", cy: "12", r: "9" }),
      h("path", { d: "M12 3v18", fill: "currentColor" }),
      h("path", { d: "M12 3a9 9 0 0 1 0 18Z", fill: "currentColor", stroke: "none" })
    ),
    image: h("svg", { viewBox: "0 0 24 24", width: "22", height: "22", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" },
      h("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }),
      h("circle", { cx: "9", cy: "9", r: "1.5" }),
      h("path", { d: "m3 17 5-5 4 4 3-3 6 6" })
    ),
    crop: h("svg", { className: "icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" },
      h("path", { d: "M6 2v14a2 2 0 0 0 2 2h14" }),
      h("path", { d: "M2 6h14a2 2 0 0 1 2 2v14" })
    ),
    perspective: h("svg", { className: "icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" },
      h("path", { d: "M5 4 L19 7 L19 17 L5 20 Z" })
    ),
    color: h("svg", { className: "icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.7", strokeLinecap: "round", strokeLinejoin: "round" },
      h("circle", { cx: "12", cy: "12", r: "9" }),
      h("circle", { cx: "9", cy: "10", r: "1.4", fill: "currentColor", stroke: "none" }),
      h("circle", { cx: "15", cy: "10", r: "1.4", fill: "currentColor", stroke: "none" }),
      h("circle", { cx: "12", cy: "15", r: "1.4", fill: "currentColor", stroke: "none" })
    ),
    check: h("svg", { className: "icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round" },
      h("path", { d: "M4 12l5 5L20 6" })
    ),
    close: h("svg", { className: "icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round" },
      h("path", { d: "M6 6l12 12M6 18L18 6" })
    ),
  };

  /* Slider ──────────────────────────────────────────────────── */

  function Slider(props) {
    const { value, onChange, min = 0, max = 100, step = 1, gradientFrom, gradientTo, signed = false, defaultValue } = props;
    const trackRef = useRef(null);
    const updateFromEvent = (e) => {
      const r = trackRef.current.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      let t = clamp(x / r.width, 0, 1);
      let v = min + t * (max - min);
      v = Math.round(v / step) * step;
      onChange(v);
    };
    const onPointerDown = (e) => {
      e.preventDefault();
      updateFromEvent(e);
      const move = (ev) => updateFromEvent(ev);
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };
    const onDouble = () => { if (defaultValue !== undefined) onChange(defaultValue); };
    const onKeyDown = (e) => {
      let next = value;
      const big = e.shiftKey ? 10 : 1;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = value - step * big;
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = value + step * big;
      else if (e.key === "Home") next = min;
      else if (e.key === "End") next = max;
      else return;
      e.preventDefault();
      next = clamp(next, min, max);
      next = Math.round(next / step) * step;
      onChange(next);
    };
    const pct = ((value - min) / (max - min)) * 100;
    return h("div", {
      className: "slider-track",
      ref: trackRef,
      tabIndex: 0,
      role: "slider",
      "aria-valuemin": min,
      "aria-valuemax": max,
      "aria-valuenow": value,
      onPointerDown,
      onDoubleClick: onDouble,
      onKeyDown,
      style: { "--rail-from": gradientFrom, "--rail-to": gradientTo },
    },
      h("div", { className: "rail" + (signed ? " signed" : "") }),
      h("div", { className: "thumb", style: { left: clamp(pct, 0, 100) + "%" } })
    );
  }

  /* NumberInput (with optional stepper chevrons) ──────────── */

  function NumberInput(props) {
    const { value, onChange, min, max, step = 1, stepper = false } = props;
    const [local, setLocal] = useState(String(value));
    useEffect(() => { setLocal(String(value)); }, [value]);
    const commit = () => {
      let v = parseFloat(local);
      if (Number.isFinite(v)) {
        if (min !== undefined) v = Math.max(min, v);
        if (max !== undefined) v = Math.min(max, v);
        onChange(v);
      } else {
        setLocal(String(value));
      }
    };
    const stepBy = (dir) => {
      const decimals = (String(step).split(".")[1] || "").length;
      let base = parseFloat(local);
      if (!Number.isFinite(base)) base = value;
      let v = base + dir * step;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      if (decimals > 0) v = parseFloat(v.toFixed(decimals));
      onChange(v);
    };
    const inputEl = h("input", {
      type: "number",
      value: local,
      step,
      onChange: (e) => setLocal(e.target.value),
      onBlur: commit,
      onKeyDown: (e) => { if (e.key === "Enter") e.currentTarget.blur(); },
    });
    if (!stepper) return inputEl;
    const chev = (dir) => h("svg", { viewBox: "0 0 10 10", width: 10, height: 10, "aria-hidden": "true" },
      h("path", {
        d: dir < 0 ? "M6 2 L3 5 L6 8" : "M4 2 L7 5 L4 8",
        fill: "none", stroke: "currentColor", strokeWidth: 1.5,
        strokeLinecap: "round", strokeLinejoin: "round",
      })
    );
    const atMin = min !== undefined && value <= min;
    const atMax = max !== undefined && value >= max;
    return h("div", { className: "stepper" },
      h("button", {
        type: "button", className: "step-btn", tabIndex: -1,
        disabled: atMin, "aria-label": "Decrease",
        onClick: () => stepBy(-1),
      }, chev(-1)),
      inputEl,
      h("button", {
        type: "button", className: "step-btn", tabIndex: -1,
        disabled: atMax, "aria-label": "Increase",
        onClick: () => stepBy(1),
      }, chev(1))
    );
  }

  /* B&W mixer panel ─────────────────────────────────────────── */

  const BW_ROWS = [
    { key: "r", label: "Reds",     sw: "#e2483b", from: "oklch(0.30 0.13 25)",  to: "oklch(0.70 0.21 25)"  },
    { key: "y", label: "Yellows",  sw: "#e6c83b", from: "oklch(0.40 0.10 100)", to: "oklch(0.92 0.18 100)" },
    { key: "g", label: "Greens",   sw: "#46c451", from: "oklch(0.30 0.10 145)", to: "oklch(0.78 0.22 145)" },
    { key: "c", label: "Cyans",    sw: "#34c5d6", from: "oklch(0.30 0.06 215)", to: "oklch(0.85 0.13 215)" },
    { key: "b", label: "Blues",    sw: "#3b6de2", from: "oklch(0.20 0.10 265)", to: "oklch(0.55 0.22 265)" },
    { key: "m", label: "Magentas", sw: "#d646b8", from: "oklch(0.30 0.13 330)", to: "oklch(0.70 0.25 330)" },
  ];

  function BWMixer(props) {
    const { bw, bwOn, onChange, onToggle, onReset, preset, onPreset, colorMode } = props;
    const active = bwOn && !colorMode;
    return h("section", { className: "panel" },
      h("div", { className: "panel-head" },
        h("span", { className: "title" },
          "Channel mixer",
          colorMode && h("span", { style: { color: "var(--fg-3)", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginLeft: 6 } }, "— off in color mode")
        ),
        h("span", { style: { display: "flex", gap: 8, alignItems: "center", opacity: colorMode ? 0.4 : 1, pointerEvents: colorMode ? "none" : "auto" } },
          h("label", { className: "switch" },
            h("input", { type: "checkbox", checked: bwOn, onChange: (e) => onToggle(e.target.checked) }),
            h("span", { className: "track" })
          ),
          h("button", { className: "reset-link", onClick: onReset }, "Reset")
        )
      ),
      h("div", { className: "panel-body", style: { opacity: active ? 1 : 0.5, pointerEvents: active ? "auto" : "none" } },
        h("div", { className: "presets" },
          Object.keys(BW_PRESETS).map((name) =>
            h("button", {
              key: name,
              className: "preset" + (preset === name ? " active" : ""),
              onClick: () => onPreset(name),
            }, name)
          )
        ),
        BW_ROWS.map((row) =>
          h("div", { className: "row", key: row.key },
            h("span", { className: "label" },
              h("span", { className: "swatch", style: { background: row.sw } }),
              row.label
            ),
            h(Slider, {
              value: bw[row.key],
              onChange: (v) => onChange(Object.assign({}, bw, { [row.key]: v })),
              min: -200, max: 300, step: 1, signed: true,
              gradientFrom: row.from, gradientTo: row.to,
              defaultValue: DEFAULT_BW[row.key],
            }),
            h(NumberInput, {
              value: bw[row.key],
              min: -200, max: 300,
              stepper: true,
              onChange: (v) => onChange(Object.assign({}, bw, { [row.key]: v })),
            })
          )
        )
      )
    );
  }

  /* Brightness / Contrast panel ─────────────────────────────── */

  function BCPanel(props) {
    const { bc, onChange, onReset } = props;
    const row = (key, label, from, to) =>
      h("div", { className: "row", key },
        h("span", { className: "label" }, label),
        h(Slider, {
          value: bc[key],
          onChange: (v) => onChange(Object.assign({}, bc, { [key]: v })),
          min: -100, max: 100, step: 1, signed: true,
          gradientFrom: from, gradientTo: to,
          defaultValue: 0,
        }),
        h(NumberInput, {
          value: bc[key], min: -100, max: 100, stepper: true,
          onChange: (v) => onChange(Object.assign({}, bc, { [key]: v })),
        })
      );
    return h("section", { className: "panel" },
      h("div", { className: "panel-head" },
        h("span", { className: "title" }, "Brightness / Contrast"),
        h("button", { className: "reset-link", onClick: onReset }, "Reset")
      ),
      h("div", { className: "panel-body" },
        row("brightness", "Brightness", "oklch(0.20 0.006 80)", "oklch(0.92 0.004 80)"),
        row("contrast",   "Contrast",   "oklch(0.50 0.006 80)", "oklch(0.78 0.13 65)")
      )
    );
  }

  /* Levels panel ────────────────────────────────────────────── */

  function LevelsPanel(props) {
    const { levels, onChange, onReset, histogram } = props;
    const histCanvasRef = useRef(null);
    const inputRailRef = useRef(null);
    const outputRailRef = useRef(null);

    useEffect(() => {
      const c = histCanvasRef.current;
      if (!c || !histogram) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
      const ctx = c.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const max = Math.max.apply(null, histogram);
      if (max === 0) return;
      const bin = rect.width / 256;
      ctx.fillStyle = "oklch(0.55 0.006 80)";
      for (let i = 0; i < 256; i++) {
        const hh = Math.pow(histogram[i] / max, 0.5) * rect.height;
        ctx.fillRect(i * bin, rect.height - hh, bin + 0.5, hh);
      }
      ctx.fillStyle = "oklch(0.16 0.006 80 / 0.55)";
      ctx.fillRect(0, 0, (levels.inBlack / 255) * rect.width, rect.height);
      ctx.fillRect((levels.inWhite / 255) * rect.width, 0, rect.width, rect.height);
    }, [histogram, levels.inBlack, levels.inWhite]);

    const dragHandle = (railRef, setter, min, max) => (e) => {
      e.preventDefault();
      const rail = railRef.current;
      const update = (ev) => {
        const r = rail.getBoundingClientRect();
        const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
        let v = clamp(Math.round((x / r.width) * 255), min, max);
        setter(v);
      };
      update(e);
      const move = (ev) => update(ev);
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };

    const gammaPos = useMemo(() => {
      const t = (Math.log(levels.gamma) - Math.log(0.01)) / (Math.log(9.99) - Math.log(0.01));
      const f = 1 - t;
      return levels.inBlack + (levels.inWhite - levels.inBlack) * f;
    }, [levels.gamma, levels.inBlack, levels.inWhite]);

    const setBlack = (v) => {
      const nb = Math.min(v, levels.inWhite - 1);
      onChange(Object.assign({}, levels, { inBlack: nb }));
    };
    const setWhite = (v) => {
      const nw = Math.max(v, levels.inBlack + 1);
      onChange(Object.assign({}, levels, { inWhite: nw }));
    };
    const setGammaFromPos = (pos) => {
      const span = Math.max(1, levels.inWhite - levels.inBlack);
      let f = (pos - levels.inBlack) / span;
      f = clamp(f, 0.001, 0.999);
      const t = 1 - f;
      const logG = Math.log(0.01) + t * (Math.log(9.99) - Math.log(0.01));
      const g = Math.exp(logG);
      onChange(Object.assign({}, levels, { gamma: Math.round(g * 100) / 100 }));
    };
    const setOutBlack = (v) => onChange(Object.assign({}, levels, { outBlack: Math.min(v, levels.outWhite - 1) }));
    const setOutWhite = (v) => onChange(Object.assign({}, levels, { outWhite: Math.max(v, levels.outBlack + 1) }));

    const arrowKey = (current, lo, hi, apply) => (e) => {
      const big = e.shiftKey ? 10 : 1;
      let next = current;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = current - big;
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = current + big;
      else if (e.key === "Home") next = lo;
      else if (e.key === "End") next = hi;
      else return;
      e.preventDefault();
      apply(clamp(next, lo, hi));
    };
    const gammaArrowKey = (e) => {
      const big = e.shiftKey ? 0.10 : 0.01;
      let next = levels.gamma;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = levels.gamma - big;
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = levels.gamma + big;
      else if (e.key === "Home") next = 0.01;
      else if (e.key === "End") next = 9.99;
      else return;
      e.preventDefault();
      next = clamp(next, 0.01, 9.99);
      onChange(Object.assign({}, levels, { gamma: Math.round(next * 100) / 100 }));
    };

    return h("section", { className: "panel" },
      h("div", { className: "panel-head" },
        h("span", { className: "title" }, "Levels"),
        h("button", { className: "reset-link", onClick: onReset }, "Reset")
      ),
      h("div", { className: "panel-body" },
        h("div", { className: "sublabel" }, "Input"),
        h("div", { className: "levels-graph" },
          h("canvas", { ref: histCanvasRef })
        ),
        h("div", {
          className: "levels-axis",
          ref: inputRailRef,
          onPointerDown: (e) => {
            const r = inputRailRef.current.getBoundingClientRect();
            const x = e.clientX - r.left;
            const positions = [
              { key: "shadow", pos: (levels.inBlack / 255) * r.width },
              { key: "mid",    pos: (gammaPos / 255) * r.width },
              { key: "high",   pos: (levels.inWhite / 255) * r.width },
            ];
            positions.sort((a, b) => Math.abs(a.pos - x) - Math.abs(b.pos - x));
            const choice = positions[0].key;
            if (choice === "shadow")      dragHandle(inputRailRef, setBlack, 0, 254)(e);
            else if (choice === "high")   dragHandle(inputRailRef, setWhite, 1, 255)(e);
            else                          dragHandle(inputRailRef, setGammaFromPos, 0, 255)(e);
          }
        },
          h("div", {
            className: "handle shadow",
            style: { left: ((levels.inBlack / 255) * 100) + "%" },
            tabIndex: 0, role: "slider",
            "aria-label": "Input black point",
            "aria-valuemin": 0, "aria-valuemax": 254, "aria-valuenow": levels.inBlack,
            onKeyDown: arrowKey(levels.inBlack, 0, 254, setBlack),
          }),
          h("div", {
            className: "handle midtone",
            style: { left: ((gammaPos / 255) * 100) + "%" },
            tabIndex: 0, role: "slider",
            "aria-label": "Gamma (midtone)",
            "aria-valuemin": 0.01, "aria-valuemax": 9.99, "aria-valuenow": levels.gamma,
            onKeyDown: gammaArrowKey,
          }),
          h("div", {
            className: "handle highlight",
            style: { left: ((levels.inWhite / 255) * 100) + "%" },
            tabIndex: 0, role: "slider",
            "aria-label": "Input white point",
            "aria-valuemin": 1, "aria-valuemax": 255, "aria-valuenow": levels.inWhite,
            onKeyDown: arrowKey(levels.inWhite, 1, 255, setWhite),
          })
        ),

        h("div", { className: "levels-values" },
          h("div", { className: "v" },
            h("span", { className: "lab" }, "Black"),
            h(NumberInput, { value: levels.inBlack, min: 0, max: 254, stepper: true, onChange: (v) => setBlack(v) })
          ),
          h("div", { className: "v" },
            h("span", { className: "lab" }, "Gamma"),
            h(NumberInput, { value: levels.gamma, min: 0.01, max: 9.99, step: 0.01, stepper: true,
              onChange: (v) => onChange(Object.assign({}, levels, { gamma: v })) })
          ),
          h("div", { className: "v" },
            h("span", { className: "lab" }, "White"),
            h(NumberInput, { value: levels.inWhite, min: 1, max: 255, stepper: true, onChange: (v) => setWhite(v) })
          )
        ),

        h("div", { className: "sublabel", style: { marginTop: 10 } }, "Output"),
        h("div", {
          className: "levels-output",
          ref: outputRailRef,
          onPointerDown: (e) => {
            const r = outputRailRef.current.getBoundingClientRect();
            const x = e.clientX - r.left;
            const sd = Math.abs((levels.outBlack / 255) * r.width - x);
            const hd = Math.abs((levels.outWhite / 255) * r.width - x);
            if (sd < hd) {
              dragHandle(outputRailRef,
                (v) => onChange(Object.assign({}, levels, { outBlack: Math.min(v, levels.outWhite - 1) })),
                0, 254)(e);
            } else {
              dragHandle(outputRailRef,
                (v) => onChange(Object.assign({}, levels, { outWhite: Math.max(v, levels.outBlack + 1) })),
                1, 255)(e);
            }
          }
        },
          h("div", {
            className: "handle out-shadow",
            style: { left: ((levels.outBlack / 255) * 100) + "%" },
            tabIndex: 0, role: "slider",
            "aria-label": "Output black point",
            "aria-valuemin": 0, "aria-valuemax": 254, "aria-valuenow": levels.outBlack,
            onKeyDown: arrowKey(levels.outBlack, 0, 254, setOutBlack),
          }),
          h("div", {
            className: "handle out-highlight",
            style: { left: ((levels.outWhite / 255) * 100) + "%" },
            tabIndex: 0, role: "slider",
            "aria-label": "Output white point",
            "aria-valuemin": 1, "aria-valuemax": 255, "aria-valuenow": levels.outWhite,
            onKeyDown: arrowKey(levels.outWhite, 1, 255, setOutWhite),
          })
        ),
        h("div", { className: "levels-values", style: { gridTemplateColumns: "1fr 1fr" } },
          h("div", { className: "v" },
            h("span", { className: "lab" }, "Out black"),
            h(NumberInput, { value: levels.outBlack, min: 0, max: 254, stepper: true,
              onChange: (v) => onChange(Object.assign({}, levels, { outBlack: Math.min(v, levels.outWhite - 1) })) })
          ),
          h("div", { className: "v" },
            h("span", { className: "lab" }, "Out white"),
            h(NumberInput, { value: levels.outWhite, min: 1, max: 255, stepper: true,
              onChange: (v) => onChange(Object.assign({}, levels, { outWhite: Math.max(v, levels.outBlack + 1) })) })
          )
        )
      )
    );
  }

  Object.assign(Levels, {
    Icon,
    BWMixer,
    BCPanel,
    LevelsPanel,
  });
})();
