// Numerical core of section 3: one sensor, five nodes, 1-D → structural analysis → n-D.
// The system is a 5-node graph; each node has its own rhythm (characteristic frequency). The sensor at E records
// the sum of all rhythms — the additive input of EVT-educational-demo, section 1: periodic + stochastic + fractal.
// The event is a Hurst-coloured burst that swells the rhythm of the source node and reaches the other nodes along
// the graph (first arrival, delay τ and gain w per edge). Analysis: 1-D EVT → structural analysis of the background
// (spectral peaks = nodes, wavelet envelopes = n-D series, lagged envelope correlation = edges) → the n-D path of
// Graph-EVT-agent (detect, rank_sources), ported line by line from the guide's core.js.
// Works in the browser (window.OneDimCore) and in Node (module.exports) for tests.

(function (global) {
  "use strict";

  var TAU = 2 * Math.PI;
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // ------------------------------------------------------------ random numbers (mulberry32 + FNV seed)
  function hashSeed() {
    var h = 2166136261 >>> 0;
    for (var a = 0; a < arguments.length; a++) {
      var s = String(arguments[a]);
      for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      h ^= 0x9e3779b9; h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function makeRng() {
    var a = hashSeed.apply(null, arguments), spare = null;
    function uniform() {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function normal() {
      if (spare !== null) { var s = spare; spare = null; return s; }
      var u = 0;
      while (u === 0) u = uniform();
      var r = Math.sqrt(-2 * Math.log(u)), ang = TAU * uniform();
      spare = r * Math.sin(ang);
      return r * Math.cos(ang);
    }
    return { uniform: uniform, normal: normal };
  }

  // ------------------------------------------------------------ statistics
  function mean(x) { var s = 0; for (var i = 0; i < x.length; i++) s += x[i]; return s / x.length; }
  function std(x) { var m = mean(x), s = 0; for (var i = 0; i < x.length; i++) s += (x[i] - m) * (x[i] - m); return Math.sqrt(s / x.length); }
  function quantile(x, q) {
    var s = Float64Array.from(x).sort(), pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.min(lo + 1, s.length - 1);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }
  function linearFit(xs, ys) {
    var mx = mean(xs), my = mean(ys), sxy = 0, sxx = 0;
    for (var i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); }
    return { slope: sxy / sxx, intercept: my - sxy / sxx * mx };
  }
  // Wilson interval for k successes of n (statement 2.18.8).
  function wilson(k, n, z) {
    z = z || 1.96;
    if (!n) return [0, 1];
    var p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }

  // ------------------------------------------------------------ signal: additive input (EVT-educational-demo, section 1)
  /** Unit-variance 1/f-style noise: amplitude f^-(H - 1/2), so PSD ∝ f^-(2H - 1). */
  function coloredNoise(n, hurst, rng) {
    var m = Math.floor(n / 2) + 1, re = new Float64Array(m), im = new Float64Array(m);
    for (var k = 0; k < m; k++) {
      var amp = k === 0 ? 0 : Math.pow(k / n, -(hurst - 0.5));
      re[k] = rng.normal() * amp; im[k] = rng.normal() * amp;
    }
    var out = new Float64Array(n), nyq = n % 2 === 0 ? n / 2 : -1;
    for (var t = 0; t < n; t++) {
      var s = re[0];
      for (k = 1; k < m; k++) {
        var ang = TAU * k * t / n;
        if (k === nyq) s += re[k] * Math.cos(ang);
        else s += 2 * (re[k] * Math.cos(ang) - im[k] * Math.sin(ang));
      }
      out[t] = s / n;
    }
    var mu = mean(out), sd = std(out) || 1;
    for (t = 0; t < n; t++) out[t] = (out[t] - mu) / sd;
    return out;
  }
  function envelope(duration, kind) {
    var out = new Float64Array(duration);
    for (var i = 0; i < duration; i++) {
      var x = duration > 1 ? i / (duration - 1) : 1;
      out[i] = kind === "sin2" ? Math.pow(Math.sin(Math.PI * x), 2) : Math.expm1(5 * x) / Math.expm1(5);
    }
    return out;
  }


  // ------------------------------------------------------------ the system: 5 nodes, rhythms, edges
  var NODES = ["A", "B", "C", "D", "E"];
  var OUT = 4;
  // Characteristic frequency of each node, cycles per sample (object dictionary).
  var FREQS = [0.05, 0.15, 0.25, 0.35, 0.45];
  var AMPS = [1.0, 0.8, 0.9, 0.7, 0.6];
  var PHASES = [0.0, 0.9, 1.7, 2.6, 3.4];
  // Edge: [i, j, delay τ in samples, gain w]. Undirected.
  var EDGES = [
    [0, 1, 10, 0.80],
    [0, 2, 30, 0.75],
    [1, 2, 25, 0.65],
    [1, 4, 40, 0.85],
    [2, 3, 15, 0.80],
    [3, 4, 20, 0.80]
  ];

  /** First arrival from s at every node (Dijkstra on τ): delay, gain = Πw along that path, the path itself. */
  function arrivals(s, edges) {
    var n = NODES.length, d = new Array(n).fill(Infinity), gain = new Array(n).fill(0), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
    d[s] = 0; gain[s] = 1;
    for (var it = 0; it < n; it++) {
      var u = -1;
      for (var v = 0; v < n; v++) if (!done[v] && (u < 0 || d[v] < d[u])) u = v;
      if (u < 0 || d[u] === Infinity) break;
      done[u] = true;
      edges.forEach(function (e) {
        var w = e[0] === u ? e[1] : e[1] === u ? e[0] : -1;
        if (w < 0 || done[w]) return;
        if (d[u] + e[2] < d[w]) { d[w] = d[u] + e[2]; gain[w] = gain[u] * e[3]; prev[w] = u; }
      });
    }
    return NODES.map(function (_, j) {
      var path = [];
      for (var v2 = j; v2 >= 0; v2 = prev[v2]) path.unshift(v2);
      return { node: j, delay: d[j], gain: gain[j], path: d[j] === Infinity ? [] : path };
    });
  }

  var DEFAULTS = {
    n: 1500, seed: 42, sigma: 0.3, hurst: 0.75, magnitude: 5, onset: 1000, duration: 100, envelope: "sin2",
    source: 1, background: 900, microRate: 1 / 20, microAmp: 0.25
  };

  function gaussSmooth(x, sd) {
    if (sd <= 0) return Float64Array.from(x);
    var r = Math.ceil(3 * sd), k = [], ks = 0;
    for (var i = -r; i <= r; i++) { var v = Math.exp(-i * i / (2 * sd * sd)); k.push(v); ks += v; }
    var out = new Float64Array(x.length);
    for (var t = 0; t < x.length; t++) {
      var s = 0, ws = 0;
      for (var j = -r; j <= r; j++) { var u = t + j; if (u < 0 || u >= x.length) continue; s += k[j + r] * x[u]; ws += k[j + r]; }
      out[t] = s / ws;
    }
    return out;
  }

  /**
   * x(t) = Σ_j A_j (1 + m_j(t)) sin(2π f_j t + φ_j) + σ·ε_t + Σ_j G_j · b(t − t* − d_j) · sin(2π f_j t + φ_j).
   * m_j: small spontaneous bursts (Poisson in time, random node) that travel through the same graph as the event —
   * the background "teaches" the structure that the extreme event then uses. b = M·g·η^H is the event burst,
   * smoothed so that a node's amplitude cannot change faster than a few of its own cycles.
   */
  function simulate(o) {
    var n = o.n, p = NODES.length, rng = makeRng(o.seed, "additive"), mrng = makeRng(o.seed, "micro");
    var edges = o.edges || EDGES, all = NODES.map(function (_, s0) { return arrivals(s0, edges); });
    var stochastic = new Float64Array(n);
    for (var t = 0; t < n; t++) stochastic[t] = o.sigma * rng.normal();
    var m = NODES.map(function () { return new Float64Array(n); }), micro = [], W = 5;
    for (t = 0; t < n; t++) {
      if (mrng.uniform() >= o.microRate) continue;
      var src = Math.floor(mrng.uniform() * p), amp = -o.microAmp * Math.log(1 - mrng.uniform()); // exponential sizes
      micro.push({ t: t, node: src, amp: amp });
      all[src].forEach(function (a) {
        if (a.delay === Infinity) return;
        for (var u = -3 * W; u <= 3 * W; u++) {
          var tt = t + a.delay + u;
          if (tt >= 0 && tt < n) m[a.node][tt] += amp * a.gain * Math.exp(-u * u / (2 * W * W));
        }
      });
    }
    var D = o.duration, eta = gaussSmooth(coloredNoise(D, o.hurst, makeRng(o.seed, "burst")), o.smooth == null ? 6 : o.smooth), g = envelope(D, o.envelope);
    var esd = std(eta) || 1, burst = new Float64Array(D);
    for (var i2 = 0; i2 < D; i2++) burst[i2] = o.magnitude * g[i2] * eta[i2] / esd;
    var arr = all[o.source], j, freqs = o.freqs || FREQS;
    var rhythm = [], event = [], periodic = new Float64Array(n), fractal = new Float64Array(n), values = new Float64Array(n);
    for (j = 0; j < p; j++) {
      var rj = new Float64Array(n), ej = new Float64Array(n), aj = arr[j];
      for (t = 0; t < n; t++) {
        var c = Math.sin(TAU * freqs[j] * t + PHASES[j]);
        rj[t] = (o.hidden === j ? 0 : AMPS[j]) * (1 + m[j][t]) * c;
        var k = t - o.onset - aj.delay;
        if (aj.delay !== Infinity && k >= 0 && k < D) ej[t] = aj.gain * burst[k] * c;
        periodic[t] += rj[t]; fractal[t] += ej[t];
      }
      rhythm.push(rj); event.push(ej);
    }
    for (t = 0; t < n; t++) values[t] = periodic[t] + stochastic[t] + fractal[t];
    return { n: n, values: values, periodic: periodic, stochastic: stochastic, fractal: fractal, rhythm: rhythm, event: event,
      micro: micro, modulation: m, burst: burst, eta: eta, arrivals: arr, onset: o.onset, duration: D, source: o.source };
  }
  // ------------------------------------------------------------ DFA-1
  function dfa(x, scales) {
    var n = x.length, mu = mean(x), prof = new Float64Array(n), c = 0;
    for (var t = 0; t < n; t++) { c += x[t] - mu; prof[t] = c; }
    var pts = [];
    scales.forEach(function (s) {
      var cnt = Math.floor(n / s); if (cnt < 1) return;
      var xm = (s - 1) / 2, sxx = 0, acc = 0;
      for (var i = 0; i < s; i++) sxx += (i - xm) * (i - xm);
      for (var b = 0; b < cnt; b++) {
        var ym = 0, sxy = 0;
        for (i = 0; i < s; i++) ym += prof[b * s + i];
        ym /= s;
        for (i = 0; i < s; i++) sxy += (i - xm) * (prof[b * s + i] - ym);
        var sl = sxy / sxx;
        for (i = 0; i < s; i++) { var r = prof[b * s + i] - (ym + sl * (i - xm)); acc += r * r; }
      }
      pts.push({ s: s, F: Math.sqrt(acc / (cnt * s)) });
    });
    var fit = linearFit(pts.map(function (p) { return Math.log10(p.s); }), pts.map(function (p) { return Math.log10(p.F); }));
    return { points: pts, alpha: fit.slope, intercept: fit.intercept };
  }

  // ------------------------------------------------------------ H0: harmonic background model
  function solve(A, b) { // Gaussian elimination, small dense systems
    var n = b.length, M = A.map(function (r) { return r.slice(); }), y = b.slice();
    for (var c = 0; c < n; c++) {
      var p = c;
      for (var k = c + 1; k < n; k++) if (Math.abs(M[k][c]) > Math.abs(M[p][c])) p = k;
      var tmp = M[c]; M[c] = M[p]; M[p] = tmp; var ty = y[c]; y[c] = y[p]; y[p] = ty;
      for (k = c + 1; k < n; k++) {
        var f = M[k][c] / M[c][c];
        for (var m = c; m < n; m++) M[k][m] -= f * M[c][m];
        y[k] -= f * y[c];
      }
    }
    var x = new Array(n).fill(0);
    for (c = n - 1; c >= 0; c--) { var s = y[c]; for (k = c + 1; k < n; k++) s -= M[c][k] * x[k]; x[c] = s / M[c][c]; }
    return x;
  }
  function harmonicFit(x, Tb, periods) {
    var cols = 1 + 2 * periods.length;
    function row(t) {
      var r = [1];
      periods.forEach(function (P) { r.push(Math.sin(TAU * t / P), Math.cos(TAU * t / P)); });
      return r;
    }
    var G = [], b = new Array(cols).fill(0);
    for (var i = 0; i < cols; i++) G.push(new Array(cols).fill(0));
    for (var t = 0; t < Tb; t++) {
      var r = row(t);
      for (i = 0; i < cols; i++) { b[i] += r[i] * x[t]; for (var j = 0; j < cols; j++) G[i][j] += r[i] * r[j]; }
    }
    for (i = 0; i < cols; i++) G[i][i] += 1e-9;
    var beta = solve(G, b);
    var fit = new Float64Array(x.length);
    for (t = 0; t < x.length; t++) { var rr = row(t), s = 0; for (i = 0; i < cols; i++) s += rr[i] * beta[i]; fit[t] = s; }
    return { beta: beta, fit: fit };
  }
  /** Robust z by the background: |r − m| / max(1.4826·MAD, ε). */
  function robustZ(r, Tb) {
    var bg = Array.prototype.slice.call(r, 0, Tb), m = quantile(bg, 0.5);
    var mad = quantile(bg.map(function (v) { return Math.abs(v - m); }), 0.5), sc = Math.max(1.4826 * mad, 1e-9);
    var z = new Float64Array(r.length);
    for (var t = 0; t < r.length; t++) z[t] = Math.abs(r[t] - m) / sc;
    return { z: z, median: m, scale: sc };
  }

  // ------------------------------------------------------------ H1: POT / GPD
  function gpdNll(shape, logScale, ex) {
    var sc = Math.exp(logScale), s = ex.length * logScale;
    for (var i = 0; i < ex.length; i++) {
      if (Math.abs(shape) < 1e-9) { s += ex[i] / sc; continue; }
      var t = 1 + shape * ex[i] / sc;
      if (t <= 0) return Infinity;
      s += (1 + 1 / shape) * Math.log(t);
    }
    return s;
  }
  function nelderMead(f, start, step, iters) {
    step = step || 0.3; iters = iters || 400;
    var dim = start.length, S = [start.slice()];
    for (var i = 0; i < dim; i++) { var v = start.slice(); v[i] += step; S.push(v); }
    var F = S.map(f);
    for (var it = 0; it < iters; it++) {
      var ord = F.map(function (_, k) { return k; }).sort(function (a, b) { return F[a] - F[b]; });
      S = ord.map(function (k) { return S[k]; }); F = ord.map(function (k) { return F[k]; });
      if (Math.abs(F[dim] - F[0]) < 1e-10) break;
      var cen = new Array(dim).fill(0);
      for (i = 0; i < dim; i++) for (var d = 0; d < dim; d++) cen[d] += S[i][d] / dim;
      var tow = function (c) { return cen.map(function (cv, d2) { return cv + c * (S[dim][d2] - cv); }); };
      var R = tow(-1), fr = f(R);
      if (fr < F[0]) { var E = tow(-2), fe = f(E); if (fe < fr) { S[dim] = E; F[dim] = fe; } else { S[dim] = R; F[dim] = fr; } }
      else if (fr < F[dim - 1]) { S[dim] = R; F[dim] = fr; }
      else {
        var Cc = tow(0.5), fc = f(Cc);
        if (fc < F[dim]) { S[dim] = Cc; F[dim] = fc; }
        else for (i = 1; i <= dim; i++) { S[i] = S[i].map(function (vv, d3) { return S[0][d3] + 0.5 * (vv - S[0][d3]); }); F[i] = f(S[i]); }
      }
    }
    return S[F.indexOf(Math.min.apply(null, F))];
  }
  function gpdFit(ex) {
    var m = mean(ex), v = Math.pow(std(ex), 2) || m * m;
    var s0 = clamp(0.5 * (1 - m * m / v), -0.45, 0.9), sc0 = Math.max(1e-6, 0.5 * m * (m * m / v + 1));
    var r = nelderMead(function (p) { return p[0] <= -1 || p[0] > 5 ? Infinity : gpdNll(p[0], p[1], ex); }, [s0, Math.log(sc0)]);
    return { shape: r[0], scale: Math.exp(r[1]) };
  }
  function gpdPdf(y, shape, scale) {
    if (y < 0) return 0;
    if (Math.abs(shape) < 1e-9) return Math.exp(-y / scale) / scale;
    var t = 1 + shape * y / scale;
    return t <= 0 ? 0 : Math.pow(t, -1 / shape - 1) / scale;
  }
  /** M1: mean run length to the end of the first run of r successes with probability π. */
  /** Two-sided Gaussian tail α(k) = P(|Z| > k) (Abramowitz–Stegun 7.1.26 for erfc). */
  function gaussTail2(k) {
    var x = k / Math.SQRT2, t = 1 / (1 + 0.3275911 * x);
    var erfc = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
    return erfc;
  }
  function arl(pi, r) { var s = 0; for (var j = 1; j <= r; j++) s += Math.pow(pi, -j); return s; }

  function potDetect(z, Tb, q, gamma, r) {
    var bg = Array.prototype.slice.call(z, 0, Tb), u = quantile(bg, q);
    var ex = bg.filter(function (v) { return v > u; }).map(function (v) { return v - u; });
    var fit = gpdFit(ex), xi = fit.shape, sg = fit.scale, ratio = (1 - gamma) / (1 - q);
    var thr = Math.abs(xi) < 1e-9 ? u - sg * Math.log(ratio) : u + sg / xi * (Math.pow(ratio, -xi) - 1);
    var alarm = firstRun(z, thr, r, Tb);
    var bgRuns = countRuns(z, thr, r, 0, Tb);
    return { u: u, excess: ex, shape: xi, scale: sg, threshold: thr, alarm: alarm, onset: alarm < 0 ? -1 : alarm - r + 1,
      arl0: arl(1 - gamma, r), backgroundAlarms: bgRuns, q: q, gamma: gamma, r: r };
  }
  /** End τ_r of the first run of r consecutive exceedances at or after `from`; −1 if none. */
  function firstRun(z, thr, r, from) {
    var run = 0;
    for (var t = from; t < z.length; t++) { run = z[t] > thr ? run + 1 : 0; if (run >= r) return t; }
    return -1;
  }
  function countRuns(z, thr, r, from, to) { // declustered: one alarm per run
    var run = 0, n = 0;
    for (var t = from; t < to; t++) { if (z[t] > thr) { run++; if (run === r) n++; } else run = 0; }
    return n;
  }

  // ------------------------------------------------------------ ordinary baseline: 3σ rule on the raw series
  /** Ordinary k-sigma rule: alarm at the end of the first run of r samples with |x − x̄| > k·s (mean and sd of the background). */
  function threeSigma(x, Tb, k, r) {
    k = k || 3; r = r || 1;
    var bg = Array.prototype.slice.call(x, 0, Tb), m = mean(bg), s = std(bg), z = new Float64Array(x.length);
    for (var t = 0; t < x.length; t++) z[t] = Math.abs(x[t] - m) / s;
    return { mean: m, sd: s, k: k, r: r, alarm: firstRun(z, k, r, Tb), backgroundAlarms: countRuns(z, k, r, 0, Tb), z: z };
  }


  // ------------------------------------------------------------ structural analysis, nodes: spectral peaks of the background
  function periodogram(x, Tb, f0, f1, df) {
    var mu = 0; for (var t = 0; t < Tb; t++) mu += x[t]; mu /= Tb;
    var freqs = [], power = [];
    for (var f = f0; f <= f1 + 1e-12; f += df) {
      var sc = 0, cc = 0;
      for (t = 0; t < Tb; t++) { var a = TAU * f * t; sc += (x[t] - mu) * Math.sin(a); cc += (x[t] - mu) * Math.cos(a); }
      freqs.push(f); power.push((sc * sc + cc * cc) / Tb);
    }
    return { freqs: freqs, power: power };
  }
  /** Local maxima above `ratio` × median power; each is matched to the nearest dictionary frequency within `tol`. */
  function spectralNodes(pg, ratio, tol, dict) {
    dict = dict || FREQS;
    var med = quantile(pg.power, 0.5), peaks = [];
    for (var i = 1; i < pg.power.length - 1; i++) {
      if (pg.power[i] > pg.power[i - 1] && pg.power[i] >= pg.power[i + 1] && pg.power[i] > ratio * med) peaks.push({ f: pg.freqs[i], power: pg.power[i] });
    }
    // Side lobes of a modulated rhythm are local maxima too: within ±tol of the strongest peak only that peak is kept.
    peaks.sort(function (a, b) { return b.power - a.power; });
    var kept = [];
    peaks.forEach(function (pk) { if (!kept.some(function (q) { return Math.abs(q.f - pk.f) <= tol; })) kept.push(pk); });
    kept.forEach(function (pk) {
      var best = -1;
      dict.forEach(function (f, j) { if (Math.abs(f - pk.f) <= tol && (best < 0 || Math.abs(f - pk.f) < Math.abs(dict[best] - pk.f))) best = j; });
      pk.node = best;
    });
    kept.sort(function (a, b) { return a.f - b.f; });
    return { peaks: kept, median: med, threshold: ratio * med };
  }
  /**
   * Morlet envelope at frequency f: 2|W|/Σg, so a unit sine has envelope 1. Gaussian width σ_t samples.
   * Only samples with the full kernel inside the series are computed; the edges hold the nearest valid value.
   */
  function morletEnvelope(x, f, sdT) {
    var n = x.length, r = Math.ceil(4 * sdT), L = 2 * r + 1, kr = new Float64Array(L), ki = new Float64Array(L), gs = 0;
    for (var k = 0; k < L; k++) { var u = k - r, g = Math.exp(-u * u / (2 * sdT * sdT)); kr[k] = g * Math.cos(TAU * f * u); ki[k] = g * Math.sin(TAU * f * u); gs += g; }
    var out = new Float64Array(n);
    for (var t = r; t < n - r; t++) {
      var re = 0, im = 0;
      for (k = 0; k < L; k++) { re += x[t + k - r] * kr[k]; im += x[t + k - r] * ki[k]; }
      out[t] = 2 * Math.hypot(re, im) / gs;
    }
    for (t = 0; t < r; t++) out[t] = out[r];
    for (t = n - r; t < n; t++) out[t] = out[n - r - 1];
    return out;
  }

  // ------------------------------------------------------------ structural analysis, edges and the identifiability gate
  /** Structural graph (H2): physical adjacency of the identified nodes, from the object dictionary. */
  function structuralGraph(ids, edges) {
    var p = ids.length, adjacency = new Float64Array(p * p), list = [];
    for (var i = 0; i < p; i++) adjacency[i * p + i] = 1;
    edges.forEach(function (e) {
      var a = ids.indexOf(e[0]), b = ids.indexOf(e[1]);
      if (a < 0 || b < 0) return;
      adjacency[a * p + b] = adjacency[b * p + a] = 1;
      list.push({ i: e[0], j: e[1] });
    });
    return { adjacency: adjacency, edges: list, p: p, method: "structural" };
  }
  /** Shortest-path metric d(u, v) of the dictionary graph (delays τ). */
  function metric(edges) {
    return NODES.map(function (_, s0) { return arrivals(s0, edges).map(function (a) { return a.delay; }); });
  }
  /**
   * Definition 2.18.2: O doubly resolves V if for every u ≠ v there are o₁, o₂ ∈ O with
   * d(u, o₁) − d(u, o₂) ≠ d(v, o₁) − d(v, o₂). Returns the unresolved pairs (empty = identifiable, Theorem 2.18.1).
   */
  function doublyResolving(O, d) {
    var bad = [];
    for (var u = 0; u < NODES.length; u++) for (var v = u + 1; v < NODES.length; v++) {
      var ok = false;
      for (var a = 0; a < O.length && !ok; a++) for (var b = 0; b < O.length && !ok; b++) {
        if ((d[u][O[a]] - d[u][O[b]]) !== (d[v][O[a]] - d[v][O[b]])) ok = true;
      }
      if (!ok) bad.push([u, v]);
    }
    return bad;
  }
  /** Compare two edge lists ({i, j} with node ids): Jaccard, common, only in the first, only in the second. */
  function compareEdges(est, truth) {
    var key = function (e) { return Math.min(e.i, e.j) + "-" + Math.max(e.i, e.j); };
    var T = {}, E = {};
    truth.forEach(function (e) { T[key(e)] = true; });
    est.forEach(function (e) { E[key(e)] = true; });
    var common = Object.keys(E).filter(function (k) { return T[k]; }), extra = Object.keys(E).filter(function (k) { return !T[k]; }),
      missing = Object.keys(T).filter(function (k) { return !E[k]; });
    var union = common.length + extra.length + missing.length;
    return { common: common, extra: extra, missing: missing, jaccard: union ? common.length / union : 1 };
  }

  // ------------------------------------------------------------ n-D path of Graph-EVT-agent (ported from the guide's core.js)
  /** graph_evt_agent.evt.detect: robust z → top-k indicator → POT/GPD alarm → first persistent exceedance. */
  function detectND(chans, c) {
    var p = chans.length, n = chans[0].length, B = c.baseline, loc = new Float64Array(p), scale = new Float64Array(p);
    for (var j = 0; j < p; j++) {
      var base = Array.prototype.slice.call(chans[j], 0, B), med = quantile(base, 0.5);
      loc[j] = med; scale[j] = Math.max(1.4826 * quantile(base.map(function (x) { return Math.abs(x - med); }), 0.5), 1e-9);
    }
    var z = chans.map(function () { return new Float64Array(n); }), indicator = new Float64Array(n), k = Math.min(c.topK, p), row = new Float64Array(p);
    for (var t = 0; t < n; t++) {
      for (j = 0; j < p; j++) { row[j] = Math.abs(chans[j][t] - loc[j]) / scale[j]; z[j][t] = row[j]; }
      var sorted = Float64Array.from(row).sort(), s = 0;
      for (var i = p - k; i < p; i++) s += sorted[i];
      indicator[t] = s / k;
    }
    var baseInd = Array.prototype.slice.call(indicator, 0, B), u = quantile(baseInd, c.tailQuantile);
    var excess = baseInd.filter(function (x) { return x > u; }).map(function (x) { return x - u; }), threshold, gpd = null;
    if (excess.length >= 5) {
      gpd = gpdFit(excess);
      var cond = (c.alarmProbability - c.tailQuantile) / (1 - c.tailQuantile);
      threshold = u + (Math.abs(gpd.shape) < 1e-9 ? -gpd.scale * Math.log(1 - cond) : gpd.scale * (Math.pow(1 - cond, -gpd.shape) - 1) / gpd.shape);
    } else threshold = quantile(baseInd, c.alarmProbability);
    // c.from / c.to restrict the search (the chain searches near the 1-D alarm); default: everything after the background
    var found = null, lo = Math.max(B, c.from == null ? B : c.from), hi = Math.min(n - c.persistence, c.to == null ? n : c.to);
    for (var st = lo; st <= hi && found === null; st++) {
      var ok = true;
      for (i = 0; i < c.persistence && ok; i++) ok = indicator[st + i] > threshold;
      if (ok) found = st;
    }
    return { detected: found !== null, timeIndex: found, threshold: threshold, u: u, excess: excess, gpd: gpd, indicator: indicator,
      location: loc, scale: scale, z: z, backgroundAlarms: countRuns(indicator, threshold, c.persistence, 0, B), config: c, from: lo, to: hi };
  }
  function arResiduals(x, order) {
    var rows = x.length - order, cols = order + 1, G = [], b = new Array(cols).fill(0);
    for (var i = 0; i < cols; i++) G.push(new Array(cols).fill(0));
    var row = function (r) { var v = [1]; for (var l = 0; l < order; l++) v.push(x[order + r - l - 1]); return v; };
    for (var r = 0; r < rows; r++) { var v = row(r); for (i = 0; i < cols; i++) { b[i] += v[i] * x[order + r]; for (var j = 0; j < cols; j++) G[i][j] += v[i] * v[j]; } }
    for (i = 0; i < cols; i++) G[i][i] += 1e-10;
    var beta = solve(G, b), res = new Float64Array(rows);
    for (r = 0; r < rows; r++) { var w = row(r), f = 0; for (i = 0; i < cols; i++) f += w[i] * beta[i]; res[r] = x[order + r] - f; }
    return res;
  }
  /** build_baseline_graph, method "ar": |corr| of per-channel AR(order) innovations on the background ≥ threshold. */
  function innovationGraph(chans, from, to, order, threshold) {
    var p = chans.length, res = chans.map(function (x) { return arResiduals(Array.prototype.slice.call(x, from, to), order); });
    var dep = new Float64Array(p * p), adjacency = new Float64Array(p * p);
    for (var a = 0; a < p; a++) {
      dep[a * p + a] = 1; adjacency[a * p + a] = 1;
      for (var b = a + 1; b < p; b++) {
        var x = res[a], y = res[b], mx = mean(x), my = mean(y), sxy = 0, sxx = 0, syy = 0;
        for (var t = 0; t < x.length; t++) { sxy += (x[t] - mx) * (y[t] - my); sxx += (x[t] - mx) * (x[t] - mx); syy += (y[t] - my) * (y[t] - my); }
        dep[a * p + b] = dep[b * p + a] = Math.abs(sxy / Math.sqrt(sxx * syy || 1));
        if (dep[a * p + b] >= threshold) adjacency[a * p + b] = adjacency[b * p + a] = 1;
      }
    }
    return { adjacency: adjacency, dependence: dep, p: p, method: "ar_innovation_correlation" };
  }
  // ------------------------------------------------------------ functional graph from the n-D background: methods with parameters
  function pearsonLag(a, b, lag, from, to) { // corr(a(t), b(t + lag)) over t with both inside [from, to)
    var lo = Math.max(from, from - lag), hi = Math.min(to, to - lag), n = hi - lo;
    if (n < 20) return 0;
    var ma = 0, mb = 0;
    for (var t = lo; t < hi; t++) { ma += a[t]; mb += b[t + lag]; }
    ma /= n; mb /= n;
    var sab = 0, saa = 0, sbb = 0;
    for (t = lo; t < hi; t++) { var da = a[t] - ma, db = b[t + lag] - mb; sab += da * db; saa += da * da; sbb += db * db; }
    return sab / Math.sqrt(saa * sbb || 1);
  }
  function invert(M) { // Gauss–Jordan, small dense
    var n = M.length, A = M.map(function (r, i) { return r.concat(M.map(function (_, j) { return i === j ? 1 : 0; })); });
    for (var c = 0; c < n; c++) {
      var p = c; for (var k = c + 1; k < n; k++) if (Math.abs(A[k][c]) > Math.abs(A[p][c])) p = k;
      var tmp = A[c]; A[c] = A[p]; A[p] = tmp;
      var d = A[c][c] || 1e-12; for (k = 0; k < 2 * n; k++) A[c][k] /= d;
      for (var r = 0; r < n; r++) if (r !== c) { var f = A[r][c]; for (k = 0; k < 2 * n; k++) A[r][k] -= f * A[c][k]; }
    }
    return A.map(function (r) { return r.slice(n); });
  }
  /** Ridge least squares RSS of y on the given lagged columns (small dense system). */
  function lagRSS(y, cols, ridge) {
    var k = cols.length + 1, n = y.length, G = [], b = new Array(k).fill(0), i, j, t;
    for (i = 0; i < k; i++) G.push(new Array(k).fill(0));
    var val = function (c, t2) { return c < 0 ? 1 : cols[c][t2]; };
    for (t = 0; t < n; t++) for (i = 0; i < k; i++) { var vi = val(i - 1, t); b[i] += vi * y[t]; for (j = i; j < k; j++) G[i][j] += vi * val(j - 1, t); }
    for (i = 0; i < k; i++) { for (j = 0; j < i; j++) G[i][j] = G[j][i]; if (i) G[i][i] += ridge; }
    var beta = solve(G, b), rss = 0;
    for (t = 0; t < n; t++) { var f = 0; for (i = 0; i < k; i++) f += beta[i] * val(i - 1, t); rss += (y[t] - f) * (y[t] - f); }
    return rss;
  }
  /**
   * Conditional Granger strength: for target m, ln(RSS without channel i / RSS with all channels), lags lagStep…maxLag of
   * every channel (own past included). A two-step path i → j → m is explained by j's past, so only direct links stay strong.
   * Port of graph_evt_agent.graph._granger_strength: channels are standardised first (ridge acts on a common scale) and
   * strengths are clipped at 0 (tests/port_check.js compares with the Python output).
   */
  function grangerMatrix(X, maxLag, lagStep, ridge) {
    X = X.map(function (x) { var m = mean(x), s = std(x) || 1e-12; return Array.prototype.map.call(x, function (v) { return (v - m) / Math.max(s, 1e-12); }); });
    var p = X.length, n = X[0].length, lags = [];
    for (var l = lagStep; l <= maxLag; l += lagStep) lags.push(l);
    var T0 = maxLag, cols = [];
    for (var c = 0; c < p; c++) cols.push(lags.map(function (lg) { return X[c].slice(T0 - lg, n - lg); }));
    var D = [];
    for (var i = 0; i < p; i++) D.push(new Array(p).fill(0));
    for (var m = 0; m < p; m++) {
      var y = X[m].slice(T0), all = [];
      for (c = 0; c < p; c++) all = all.concat(cols[c]);
      var full = lagRSS(y, all, ridge);
      for (i = 0; i < p; i++) {
        if (i === m) continue;
        var red = [];
        for (c = 0; c < p; c++) if (c !== i) red = red.concat(cols[c]);
        D[i][m] = Math.max(0, Math.log(lagRSS(y, red, ridge) / Math.max(full, 1e-300)));
      }
    }
    for (i = 0; i < p; i++) for (m = i + 1; m < p; m++) D[i][m] = D[m][i] = Math.max(D[i][m], D[m][i]);
    return D;
  }

  /**
   * Dependence D between channels on the background, by method:
   *  "ar"      |corr| of AR(order) innovations (build_baseline_graph, method "ar");
   *  "corr"    |corr| of the envelopes at lag 0;
   *  "partial" |partial corr| from the inverse correlation matrix (removes paths through other channels);
   *  "xcorr"   max over |lag| ≤ maxLag of corr(x_i(t), x_j(t + lag)): the background bursts reach neighbours after τ;
   *  "pwxcorr" the same on AR(order) innovations (prewhitening, Box–Jenkins): sharper peaks, fewer indirect pairs;
   *  "granger" conditional Granger strength (lagged regression on all channels, drop one): direct links only.
   * Edges: D ≥ threshold, or the k strongest per node (rule "topk"); optional surrogate test (circular shifts, 95 %);
   * optional pruning of an edge explained by a two-step path with matching lag (xcorr only).
   */
  function functionalGraph(chans, from, to, opt) {
    var p = chans.length, D = [], lag = [], i, j;
    for (i = 0; i < p; i++) { D.push(new Array(p).fill(0)); lag.push(new Array(p).fill(0)); }
    var method = opt.method || "ar", L = opt.maxLag || 40;
    var dep = function (a, b) {
      if (method === "xcorr" || method === "pwxcorr") { var best = 0, at = 0; for (var l = -L; l <= L; l++) { var c = pearsonLag(a, b, l, 0, a.length); if (c > best) { best = c; at = l; } } return { d: best, lag: at }; }
      return { d: Math.abs(pearsonLag(a, b, 0, 0, a.length)), lag: 0 };
    };
    var X = chans.map(function (x) { return Array.prototype.slice.call(x, from, to); });
    // "ar" and "pwxcorr" work on AR(order) innovations: prewhitening sharpens the lagged correlation peaks
    if (method === "ar" || method === "pwxcorr") X = X.map(function (x) { return Array.prototype.slice.call(arResiduals(x, opt.order || 2)); });
    if (method === "granger") {
      var G = grangerMatrix(X, L, opt.lagStep || 5, opt.ridge == null ? 1e-3 : opt.ridge);
      for (i = 0; i < p; i++) for (j = 0; j < p; j++) D[i][j] = G[i][j];
    } else if (method === "partial") {
      var R = X.map(function (a) { return X.map(function (b) { return pearsonLag(a, b, 0, 0, a.length); }); }), P = invert(R);
      for (i = 0; i < p; i++) for (j = 0; j < p; j++) if (i !== j) D[i][j] = Math.abs(-P[i][j] / Math.sqrt(P[i][i] * P[j][j]));
    } else {
      for (i = 0; i < p; i++) for (j = i + 1; j < p; j++) { var r = dep(X[i], X[j]); D[i][j] = D[j][i] = r.d; lag[i][j] = r.lag; lag[j][i] = -r.lag; }
    }
    var thr = null;
    if (opt.surrogates && method !== "partial" && method !== "granger") {
      var rng = makeRng(opt.seed || 0, "surr"), S = 39; thr = [];
      for (i = 0; i < p; i++) thr.push(new Array(p).fill(0));
      for (i = 0; i < p; i++) for (j = i + 1; j < p; j++) {
        var sv = [], n = X[j].length;
        for (var s = 0; s < S; s++) {
          var k = Math.floor(n * (0.1 + 0.8 * rng.uniform())), sh = X[j].slice(k).concat(X[j].slice(0, k));
          sv.push(dep(X[i], sh).d);
        }
        thr[i][j] = thr[j][i] = quantile(sv, 0.95);
      }
    }
    var keep = [];
    for (i = 0; i < p; i++) { keep.push(new Array(p).fill(false)); }
    if (opt.rule === "topk") {
      for (i = 0; i < p; i++) {
        var order = D[i].map(function (v, jj) { return jj; }).filter(function (jj) { return jj !== i; }).sort(function (a, b) { return D[i][b] - D[i][a]; });
        order.slice(0, opt.k || 2).forEach(function (jj) { keep[i][jj] = keep[jj][i] = true; });
      }
    } else for (i = 0; i < p; i++) for (j = 0; j < p; j++) if (i !== j && D[i][j] >= (opt.threshold == null ? 0.35 : opt.threshold)) keep[i][j] = true;
    if (thr) for (i = 0; i < p; i++) for (j = 0; j < p; j++) if (i !== j && D[i][j] <= thr[i][j]) keep[i][j] = false;
    var pruned = [];
    if (opt.prune && (method === "xcorr" || method === "pwxcorr")) {
      var sig = keep.map(function (r) { return r.slice(); }), tol = opt.lagTol || 6;
      for (i = 0; i < p; i++) for (j = i + 1; j < p; j++) {
        if (!sig[i][j]) continue;
        for (var m = 0; m < p; m++) {
          if (m === i || m === j || !sig[i][m] || !sig[m][j]) continue;
          if (D[i][m] > D[i][j] && D[m][j] > D[i][j] && Math.abs(Math.abs(lag[i][m]) + Math.abs(lag[m][j]) - Math.abs(lag[i][j])) <= tol) {
            keep[i][j] = keep[j][i] = false; pruned.push([i, j, m]); break;
          }
        }
      }
    }
    var adjacency = new Float64Array(p * p), dependence = new Float64Array(p * p);
    for (i = 0; i < p; i++) for (j = 0; j < p; j++) { dependence[i * p + j] = i === j ? 1 : D[i][j]; adjacency[i * p + j] = i === j || keep[i][j] ? 1 : 0; }
    return { adjacency: adjacency, dependence: dependence, lag: lag, threshold: thr, pruned: pruned, p: p, method: method };
  }

  /** Statement 2.18.3: ŝ = arg min_v ‖P(a − d_v)‖² over the channels with an onset; t̂* = mean(a − d_ŝ). */
  function arrivalFit(onsets, ids, d) {
    var obs = [];
    onsets.forEach(function (a, k) { if (a != null) obs.push({ a: a, node: ids[k] }); });
    if (obs.length < 2) return null;
    var rss = NODES.map(function (_, v) {
      var r = obs.map(function (o) { return o.a - d[v][o.node]; }), m = mean(r), s = 0;
      r.forEach(function (x) { s += (x - m) * (x - m); });
      return { rss: s, t: m };
    });
    var best = 0;
    rss.forEach(function (x, v) { if (x.rss < rss[best].rss) best = v; });
    return { rss: rss, source: best, tStar: Math.round(rss[best].t), observed: obs.length };
  }
  function softmax(v) {
    var mx = Math.max.apply(null, v), e = v.map(function (x) { return Math.exp(x - mx); }), s = e.reduce(function (a, b) { return a + b; }, 0);
    return e.map(function (x) { return x / s; });
  }
  /** rank_sources: early, strong responses in the window after the alarm, plus neighbour support. */
  function rankSources(det, eventTime, adjacency, window) {
    var p = det.z.length, n = det.z[0].length, stop = Math.min(n, eventTime + window), feats = [], peak = [];
    for (var j = 0; j < p; j++) {
      var pk = 0, energy = 0, zs = [];
      for (var t = eventTime; t < stop; t++) { var zz = det.z[j][t]; zs.push(zz); pk = Math.max(pk, zz); energy += zz * zz; }
      var cutoff = Math.max(3, 0.5 * pk), lat = 0;
      for (var i = 0; i < zs.length; i++) if (zs[i] >= cutoff) { lat = i; break; }
      peak.push(pk); feats.push({ peak: pk, energy: energy / zs.length, latency: lat, degree: 0, neighbor: 0 });
    }
    for (j = 0; j < p; j++) {
      var deg = 0, nb = 0;
      for (var k = 0; k < p; k++) { deg += adjacency[j * p + k]; nb += adjacency[j * p + k] * peak[k]; }
      feats[j].degree = deg - 1; feats[j].neighbor = nb / Math.max(deg, 1);
    }
    var raw = feats.map(function (f) { return f.peak + Math.sqrt(f.energy) + 0.15 * f.neighbor - 0.5 * f.latency; });
    var prob = softmax(raw), order = prob.map(function (_, i2) { return i2; }).sort(function (a, b) { return prob[b] - prob[a]; });
    return { features: feats, raw: raw, probabilities: prob, order: order, source: order[0] };
  }
  /** Per-channel onset: start of the first run of r exceedances of the channel's own POT/GPD threshold after the background. */
  function channelOnsets(det, q, gamma, r) {
    var B = det.config.baseline;
    return det.z.map(function (z) { var e = potDetect(z, B, q, gamma, r); return e.alarm < 0 ? null : e.alarm - r + 1; });
  }
  /** Ordinary baseline on the n-D series: per-channel 3σ, the first channel to cross is called the source. */
  function firstToCross(chans, B, k, r) {
    var best = null;
    chans.forEach(function (x, j) { var tc = threeSigma(x, B, k, r).alarm; if (tc >= 0 && (!best || tc < best.t)) best = { t: tc, node: j }; });
    return best;
  }
  /** H0/H7 stationarity check on 4 background blocks: ptp of block means < σ and variance ratio < 4. */
  function stationarity(x, Tb) {
    var bg = Array.prototype.slice.call(x, 0, Tb), sd = std(bg), size = Math.floor(Tb / 4), mus = [], vars = [];
    for (var b = 0; b < 4; b++) { var blk = bg.slice(b * size, (b + 1) * size); mus.push(mean(blk)); vars.push(Math.pow(std(blk), 2)); }
    var ptp = Math.max.apply(null, mus) - Math.min.apply(null, mus), ratio = Math.max.apply(null, vars) / Math.min.apply(null, vars);
    return { ptp: ptp, sd: sd, ratio: ratio, stationary: ptp < sd && ratio < 4 };
  }
  function hashSeries(x) {
    var h = 2166136261 >>> 0;
    for (var t = 0; t < x.length; t++) { var s = x[t].toFixed(6); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } }
    return ("00000000" + h.toString(16)).slice(-8);
  }


  /** Functional graph from the identification record: same system and rhythms, no event, excitation exAmp / exRate. */
  function learnGraph(o, nodes, sp) {
    var g = sp.graph, q = {}; for (var k in o) q[k] = o[k];
    q.magnitude = 0; q.n = g.archive; q.microAmp = g.exAmp; q.microRate = g.exRate; q.seed = o.seed + "-archive"; q.onset = 0;
    var arch = simulate(q), margin = Math.ceil(4 * sp.sdT);
    var env = nodes.map(function (pk) { return morletEnvelope(arch.values, pk.f, sp.sdT); });
    var fg = functionalGraph(env, margin, g.archive - margin, { method: g.method, rule: g.rule, k: g.k, threshold: g.threshold, maxLag: g.maxLag,
      lagStep: g.lagStep, order: g.order, prune: g.prune, surrogates: g.surrogates, seed: o.seed });
    fg.archive = { env: env, values: arch.values, margin: margin };
    return fg;
  }

  // ------------------------------------------------------------ the whole chain on one series
  // rN: the n-D run length in samples — one correlation time of the envelope (2σ_t), because envelope samples are
  // not independent and a run of 3 adjacent samples is no protection (M1, clusters of exceedances).
  // before / after: the n-D search window around the 1-D alarm.
  // graph: the functional graph is learned from a separate identification record of the same system (length, excitation)
  var GRAPH = { method: "granger", rule: "topk", k: 2, threshold: 0.05, maxLag: 48, lagStep: 8, order: 2, prune: false, surrogates: false,
    archive: 2400, exAmp: 0.5, exRate: 0.1 };
  var SPEC = { graph: GRAPH, sigmaK: 3, sigmaR: 1, q: 0.95, gamma: 0.999, r: 3, rN: 16, before: 100, after: 50, topK: 1, window: 40, ratio: 30, tol: 0.012, sdT: 8, arOrder: 2, edgeThreshold: 0.35 };

  function pipeline(o, spec) {
    var sp = {}; for (var k in SPEC) sp[k] = SPEC[k]; for (k in (spec || {})) sp[k] = spec[k];
    var Tb = o.background, s = simulate(o), edges = o.edges || EDGES, d = metric(edges);
    // 1-D stage (H0, H1): the series of E alone
    var pg = periodogram(s.values, Tb, 0.01, 0.49, 0.0005), sn = spectralNodes(pg, sp.ratio, sp.tol, o.freqs || FREQS);
    var bm = harmonicFit(s.values, Tb, sn.peaks.map(function (pk) { return 1 / pk.f; })), resid = new Float64Array(s.n);
    for (var t = 0; t < s.n; t++) resid[t] = s.values[t] - bm.fit[t];
    var rz = robustZ(resid, Tb), ev1 = potDetect(rz.z, Tb, sp.q, sp.gamma, sp.r);
    // structural analysis: nodes = identified spectral peaks, n-D = Morlet envelopes, edges = structural graph
    var nodes = sn.peaks.filter(function (pk) { return pk.node >= 0; }).sort(function (a, b) { return a.node - b.node; });
    var ids = nodes.map(function (pk) { return pk.node; });
    var env = nodes.map(function (pk) { return morletEnvelope(s.values, pk.f, sp.sdT); });
    var margin = Math.ceil(4 * sp.sdT), sg = structuralGraph(ids, edges);
    var gate1 = doublyResolving([OUT], d), gateN = doublyResolving(ids, d);
    // n-D Graph-EVT-agent: detect → build_baseline_graph → rank_source
    // the n-D stage runs only after a 1-D alarm, and searches near it
    var gated = ev1.alarm >= 0;
    var det = detectND(env, { baseline: Tb, tailQuantile: sp.q, alarmProbability: sp.gamma, topK: sp.topK, persistence: sp.rN,
      from: gated ? ev1.alarm - sp.before : s.n, to: gated ? ev1.alarm + sp.after : -1 });
    var fg = learnGraph(o, nodes, sp), fgEdges = [];
    for (var i = 0; i < ids.length; i++) for (var j = i + 1; j < ids.length; j++) if (fg.adjacency[i * ids.length + j]) fgEdges.push({ i: ids[i], j: ids[j] });
    var empty = new Float64Array(ids.length * ids.length); for (i = 0; i < ids.length; i++) empty[i * ids.length + i] = 1;
    var rank = null, rankF = null, rankE = null, onsets = null, fit = null;
    if (det.detected) {
      rank = rankSources(det, det.timeIndex, sg.adjacency, sp.window);
      rankF = rankSources(det, det.timeIndex, fg.adjacency, sp.window);
      rankE = rankSources(det, det.timeIndex, empty, sp.window);
      onsets = channelOnsets(det, sp.q, sp.gamma, sp.rN);
      fit = arrivalFit(onsets, ids, d);
    }
    var base1 = threeSigma(s.values, Tb, sp.sigmaK, sp.sigmaR), baseN = firstToCross(env, Tb, sp.sigmaK, sp.sigmaR);
    return { sig: s, spec: sp, d: d, pg: pg, sn: sn, bm: bm, resid: resid, rz: rz, ev1: ev1, ids: ids, nodes: nodes, env: env, margin: margin,
      sg: sg, fg: fg, fgEdges: fgEdges, fgCmp: compareEdges(fgEdges, sg.edges), gate1: gate1, gateN: gateN,
      det: det, rank: rank, rankF: rankF, rankE: rankE, onsets: onsets, fit: fit, base1: base1, baseN: baseN,
      station: stationarity(s.values, Tb), gated: gated, source: rank ? ids[rank.source] : null, tHat: det.detected ? det.timeIndex : null,
      stop: !gated ? "no_evt_detected" : !det.detected ? "no_nd_alarm_near_1d_alarm" : null };
  }

  // ------------------------------------------------------------ step 12: Monte Carlo and the spec grid (also run by tests/experiments.js)
  /** The 80 Monte Carlo jobs of the page: seeds 1001–1020 × sources 0–3. */
  function mcJobs() { var jobs = []; for (var sd = 1; sd <= 20; sd++) for (var s = 0; s < 4; s++) jobs.push({ seed: 1000 + sd, source: s }); return jobs; }
  function mcNew() { return { st: [], fu: [], em: [], fit: [], cross: [], raw: [], free: { chain: 0, s3: 0, cross: 0, n: 0 } }; }
  /** One job into the accumulator: top-1 hit and |t̂ − t*| per method; for source 0 also the same seed without the event. */
  function mcAdd(o, spec, job, acc) {
    var q = {}; for (var k in o) q[k] = o[k];
    q.seed = job.seed; q.source = job.source;
    var x = pipeline(q, spec), src = q.source, on = q.onset, dt = x.tHat != null ? Math.abs(x.tHat - on) : NaN;
    var hit = function (rk) { return rk && x.ids[rk.source] === src ? 1 : 0; };
    acc.st.push({ top: hit(x.rank), dt: dt });
    acc.fu.push({ top: hit(x.rankF), dt: dt });
    acc.em.push({ top: hit(x.rankE), dt: dt });
    acc.fit.push({ top: x.fit && x.fit.source === src ? 1 : 0, dt: x.fit ? Math.abs(x.fit.tStar - on) : NaN });
    acc.cross.push({ top: x.baseN && x.ids[x.baseN.node] === src ? 1 : 0, dt: x.baseN ? Math.abs(x.baseN.t - on) : NaN });
    acc.raw.push({ top: 0, dt: x.base1.alarm >= 0 ? Math.abs(x.base1.alarm - on) : NaN });
    if (src === 0) {
      q.magnitude = 0;
      var f = pipeline(q, spec);
      acc.free.n++; if (f.det.detected) acc.free.chain++; if (f.base1.alarm >= 0) acc.free.s3++; if (f.baseN) acc.free.cross++;
    }
    return acc;
  }
  /** The 8-spec grid q ∈ {0.9, 0.95} × γ ∈ {0.99, 0.999} × r ∈ {1, 3} of the 1-D stage; spec is copied for each cell. */
  function specGrid(o, spec) {
    var rows = [];
    [0.9, 0.95].forEach(function (q) { [0.99, 0.999].forEach(function (g) { [1, 3].forEach(function (r) {
      var sp = {}; for (var k in spec) sp[k] = spec[k]; sp.q = q; sp.gamma = g; sp.r = r;
      var x = pipeline(o, sp);
      rows.push({ q: q, gamma: g, r: r, x: x, right: !!(x.rank && x.source === o.source) });
    }); }); });
    return rows;
  }

  var api = {
    TAU: TAU, NODES: NODES, OUT: OUT, FREQS: FREQS, AMPS: AMPS, EDGES: EDGES, DEFAULTS: DEFAULTS, SPEC: SPEC, GRAPH: GRAPH, learnGraph: learnGraph,
    makeRng: makeRng, hashSeed: hashSeed, mean: mean, std: std, quantile: quantile, wilson: wilson,
    coloredNoise: coloredNoise, envelope: envelope, arrivals: arrivals, simulate: simulate, dfa: dfa,
    periodogram: periodogram, spectralNodes: spectralNodes, morletEnvelope: morletEnvelope, harmonicFit: harmonicFit,
    structuralGraph: structuralGraph, metric: metric, doublyResolving: doublyResolving, compareEdges: compareEdges,
    innovationGraph: innovationGraph, functionalGraph: functionalGraph, arrivalFit: arrivalFit, robustZ: robustZ, gpdPdf: gpdPdf, potDetect: potDetect, arl: arl,
    threeSigma: threeSigma, gaussTail2: gaussTail2, firstRun: firstRun, countRuns: countRuns, detectND: detectND, rankSources: rankSources, channelOnsets: channelOnsets, firstToCross: firstToCross,
    pipeline: pipeline, stationarity: stationarity, hashSeries: hashSeries, mcJobs: mcJobs, mcNew: mcNew, mcAdd: mcAdd, specGrid: specGrid
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.OneDimCore = api;
})(typeof window !== "undefined" ? window : this);
