(function () {
  const Levels = window.Levels = window.Levels || {};

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* B&W gray lookup ─────────────────────────────────────────── */

  function bwGrayLookup(r, g, b, w) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sub = max - min;
    if (sub === 0) return max;

    let weight;
    if (r === max) {
      if (b <= g) {
        const t = (g - min) / sub;
        weight = w.r + (w.y - w.r) * t;
      } else {
        const t = (b - min) / sub;
        weight = w.r + (w.m - w.r) * t;
      }
    } else if (g === max) {
      if (r >= b) {
        const t = (max - r) / sub;
        weight = w.y + (w.g - w.y) * t;
      } else {
        const t = (b - min) / sub;
        weight = w.g + (w.c - w.g) * t;
      }
    } else {
      if (g >= r) {
        const t = (max - g) / sub;
        weight = w.c + (w.b - w.c) * t;
      } else {
        const t = (r - min) / sub;
        weight = w.b + (w.m - w.b) * t;
      }
    }
    return max - sub * (1 - weight);
  }

  /* Levels + B/C LUT ────────────────────────────────────────── */

  function buildLevelsLUT(black, white, gamma, oBlack, oWhite, invert, brightness, contrast) {
    const lut = new Uint8ClampedArray(256);
    const denom = Math.max(1, white - black);
    const invGamma = 1 / Math.max(0.01, gamma);
    const cFactor = 1 + (contrast || 0) / 100;
    const bOffset = brightness || 0;
    for (let i = 0; i < 256; i++) {
      let pre = (i - 128) * cFactor + 128 + bOffset;
      pre = Math.max(0, Math.min(255, pre));
      let v = (pre - black) / denom;
      v = Math.max(0, Math.min(1, v));
      v = Math.pow(v, invGamma);
      v = oBlack + v * (oWhite - oBlack);
      if (invert) v = 255 - v;
      lut[i] = Math.round(v);
    }
    return lut;
  }

  function processImage(srcImageData, settings) {
    const { width, height, data: src } = srcImageData;
    const out = new ImageData(width, height);
    const dst = out.data;

    const lut = buildLevelsLUT(
      settings.levels.inBlack,
      settings.levels.inWhite,
      settings.levels.gamma,
      settings.levels.outBlack,
      settings.levels.outWhite,
      settings.invert,
      settings.bc.brightness,
      settings.bc.contrast
    );

    if (settings.colorMode) {
      for (let i = 0; i < src.length; i += 4) {
        dst[i]     = lut[src[i]];
        dst[i + 1] = lut[src[i + 1]];
        dst[i + 2] = lut[src[i + 2]];
        dst[i + 3] = src[i + 3];
      }
      return out;
    }

    const w = {
      r: settings.bw.r / 100,
      y: settings.bw.y / 100,
      g: settings.bw.g / 100,
      c: settings.bw.c / 100,
      b: settings.bw.b / 100,
      m: settings.bw.m / 100,
    };
    for (let i = 0; i < src.length; i += 4) {
      let gray;
      if (settings.bwOn) {
        gray = bwGrayLookup(src[i], src[i + 1], src[i + 2], w);
      } else {
        gray = 0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2];
      }
      const v = lut[Math.max(0, Math.min(255, Math.round(gray)))];
      dst[i] = v;
      dst[i + 1] = v;
      dst[i + 2] = v;
      dst[i + 3] = src[i + 3];
    }
    return out;
  }

  /* Perspective warp ────────────────────────────────────────── */

  function solveLinear(A, b) {
    const n = A.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let i = 0; i < n; i++) {
      let maxR = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(M[k][i]) > Math.abs(M[maxR][i])) maxR = k;
      }
      const tmp = M[i]; M[i] = M[maxR]; M[maxR] = tmp;
      const piv = M[i][i];
      if (Math.abs(piv) < 1e-12) return null;
      for (let k = i + 1; k < n; k++) {
        const f = M[k][i] / piv;
        for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j];
      }
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = M[i][n];
      for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  }

  function computeHomography(srcPts, dstPts) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const xs = srcPts[i].x, ys = srcPts[i].y;
      const xd = dstPts[i].x, yd = dstPts[i].y;
      A.push([xs, ys, 1, 0, 0, 0, -xs * xd, -ys * xd]);
      b.push(xd);
      A.push([0, 0, 0, xs, ys, 1, -xs * yd, -ys * yd]);
      b.push(yd);
    }
    const h = solveLinear(A, b);
    if (!h) return null;
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  // Whangbo aspect-ratio recovery for a perspective-projected rectangle.
  // Assumes square pixels, zero skew, principal point at image center.
  // Returns width/height of the world rectangle, or null if non-recoverable
  // (parallel edges / no perspective / degenerate).
  function recoverAspectRatio(quad, imgW, imgH) {
    if (!imgW || !imgH) return null;
    const u0 = imgW / 2, v0 = imgH / 2;
    const m1 = { x: quad[0].x - u0, y: quad[0].y - v0, z: 1 };
    const m2 = { x: quad[1].x - u0, y: quad[1].y - v0, z: 1 };
    const m3 = { x: quad[2].x - u0, y: quad[2].y - v0, z: 1 };
    const m4 = { x: quad[3].x - u0, y: quad[3].y - v0, z: 1 };
    const cross = (a, b) => ({
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    });
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const c14 = cross(m1, m4);
    const den2 = dot(cross(m2, m4), m3);
    const den3 = dot(cross(m3, m4), m2);
    if (Math.abs(den2) < 1e-9 || Math.abs(den3) < 1e-9) return null;
    const k2 = dot(c14, m3) / den2;
    const k3 = dot(c14, m2) / den3;
    const n2 = { x: k2 * m2.x - m1.x, y: k2 * m2.y - m1.y, z: k2 * m2.z - m1.z };
    const n3 = { x: k3 * m3.x - m1.x, y: k3 * m3.y - m1.y, z: k3 * m3.z - m1.z };
    const denomF = n2.z * n3.z;
    if (Math.abs(denomF) < 1e-9) return null;
    const f2 = -(n2.x * n3.x + n2.y * n3.y) / denomF;
    if (f2 <= 0 || !isFinite(f2)) return null;
    const ar2 =
      (n2.x * n2.x + n2.y * n2.y + n2.z * n2.z * f2) /
      (n3.x * n3.x + n3.y * n3.y + n3.z * n3.z * f2);
    if (ar2 <= 0 || !isFinite(ar2)) return null;
    return Math.sqrt(ar2);
  }

  function quadOutSize(quad, imgW, imgH) {
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const topW = d(quad[0], quad[1]);
    const bottomW = d(quad[3], quad[2]);
    const leftH = d(quad[0], quad[3]);
    const rightH = d(quad[1], quad[2]);
    const maxW = Math.max(topW, bottomW);
    const maxH = Math.max(leftH, rightH);
    const ar = recoverAspectRatio(quad, imgW, imgH);
    let w, h;
    if (ar && ar > 0 && isFinite(ar)) {
      // Use the larger of the two derived sizes so detail isn't lost
      // on whichever pair of edges is the constraining one.
      if (maxW / Math.max(maxH, 1e-9) > ar) {
        w = maxW;
        h = maxW / ar;
      } else {
        h = maxH;
        w = maxH * ar;
      }
    } else {
      w = maxW;
      h = maxH;
    }
    return {
      w: Math.max(8, Math.round(w)),
      h: Math.max(8, Math.round(h)),
    };
  }

  function isQuadConvex(quad) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = quad[i];
      const b = quad[(i + 1) % 4];
      const c = quad[(i + 2) % 4];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) < 1e-9) continue;
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  }

  function quadArea(quad) {
    let s = 0;
    for (let i = 0; i < 4; i++) {
      const a = quad[i];
      const b = quad[(i + 1) % 4];
      s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s) / 2;
  }

  function quadMinEdge(quad) {
    let min = Infinity;
    for (let i = 0; i < 4; i++) {
      const a = quad[i], b = quad[(i + 1) % 4];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < min) min = d;
    }
    return min;
  }

  function warpPerspective(srcImageData, srcQuad, outW, outH) {
    const dstQuad = [
      { x: 0, y: 0 },
      { x: outW, y: 0 },
      { x: outW, y: outH },
      { x: 0, y: outH },
    ];
    const H = computeHomography(dstQuad, srcQuad);
    if (!H) return null;
    const srcW = srcImageData.width, srcH = srcImageData.height;
    const srcData = srcImageData.data;
    const out = new ImageData(outW, outH);
    const dstData = out.data;
    for (let y = 0; y < outH; y++) {
      const yh1 = H[1] * y + H[2];
      const yh4 = H[4] * y + H[5];
      const yh7 = H[7] * y + H[8];
      for (let x = 0; x < outW; x++) {
        const w = H[6] * x + yh7;
        const sx = (H[0] * x + yh1) / w;
        const sy = (H[3] * x + yh4) / w;
        const di = (y * outW + x) * 4;
        if (sx >= 0 && sy >= 0 && sx <= srcW - 1 && sy <= srcH - 1) {
          const x0 = sx | 0, y0 = sy | 0;
          const x1 = x0 + 1 < srcW ? x0 + 1 : x0;
          const y1 = y0 + 1 < srcH ? y0 + 1 : y0;
          const fx = sx - x0, fy = sy - y0;
          const i00 = (y0 * srcW + x0) * 4;
          const i10 = (y0 * srcW + x1) * 4;
          const i01 = (y1 * srcW + x0) * 4;
          const i11 = (y1 * srcW + x1) * 4;
          const w00 = (1 - fx) * (1 - fy);
          const w10 = fx * (1 - fy);
          const w01 = (1 - fx) * fy;
          const w11 = fx * fy;
          dstData[di]     = srcData[i00]     * w00 + srcData[i10]     * w10 + srcData[i01]     * w01 + srcData[i11]     * w11;
          dstData[di + 1] = srcData[i00 + 1] * w00 + srcData[i10 + 1] * w10 + srcData[i01 + 1] * w01 + srcData[i11 + 1] * w11;
          dstData[di + 2] = srcData[i00 + 2] * w00 + srcData[i10 + 2] * w10 + srcData[i01 + 2] * w01 + srcData[i11 + 2] * w11;
          dstData[di + 3] = srcData[i00 + 3] * w00 + srcData[i10 + 3] * w10 + srcData[i01 + 3] * w01 + srcData[i11 + 3] * w11;
        } else {
          dstData[di + 3] = 0;
        }
      }
    }
    return out;
  }

  /* Defaults & presets ──────────────────────────────────────── */

  const DEFAULT_BW = { r: 40, y: 60, g: 40, c: 60, b: 20, m: 80 };
  const DEFAULT_BC = { brightness: 0, contrast: 0 };
  const DEFAULT_LEVELS = { inBlack: 0, inWhite: 255, gamma: 1.0, outBlack: 0, outWhite: 255 };
  const DEFAULT_SETTINGS = {
    bw: Object.assign({}, DEFAULT_BW),
    bc: Object.assign({}, DEFAULT_BC),
    levels: Object.assign({}, DEFAULT_LEVELS),
    bwOn: true,
    invert: false,
    colorMode: false,
  };

  const BW_PRESETS = {
    "Default":        { r: 40,  y: 60,  g: 40,  c: 60,  b: 20,  m: 80  },
    "High contrast":  { r: 80,  y: 80,  g: 80,  c: 20,  b: 20,  m: 80  },
    "Dark sky":       { r: 40,  y: 60,  g: 40,  c: 60,  b: -50, m: 80  },
    "Infrared":       { r: -50, y: 250, g: 200, c: 60,  b: 0,   m: 50  },
    "Red filter":     { r: 120, y: 110, g: 40,  c: 20,  b: 20,  m: 90  },
    "Stark grunge":   { r: 70,  y: 30,  g: 30,  c: 70,  b: 100, m: 30  },
  };

  Object.assign(Levels, {
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
  });
})();
