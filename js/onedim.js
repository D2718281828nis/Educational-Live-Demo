// Section 3: one observed series (node E of a 5-node graph) → 1-D EVT → structural analysis → n-D Graph-EVT-agent.
// Numbers come from js/onedim-core.js; this file only draws them.

(function () {
  "use strict";

  var C = window.OneDimCore;
  var root = document.documentElement;
  var SVGNS = "http://www.w3.org/2000/svg";
  if (!C || !document.getElementById("s3")) return;

  function $(id) { return document.getElementById(id); }
  function ru() { return root.getAttribute("data-lang") === "ru"; }
  function L(en, r) { return ru() ? r : en; }
  function fmt(v, d) {
    if (v == null || !isFinite(v)) return "–";
    var s = Number(v).toFixed(d == null ? 2 : d);
    return ru() ? s.replace(".", ",").replace("-", "−") : s.replace("-", "−");
  }
  function pct(v) { return fmt(100 * v, v > 0 && v < 0.1 ? 1 : 0) + " %"; }
  function el(name, attrs, parent) {
    var node = document.createElementNS(SVGNS, name);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  // Categorical identity of the candidate nodes; E is the sensor (neutral).
  var NODE_COLOR = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-7)", "var(--ink-2)"];
  var NAMES = C.NODES;
  var POS = [[52, 124], [172, 50], [172, 196], [292, 196], [316, 78]];

  // ------------------------------------------------------------ small SVG plot with crosshair tooltip
  var groups = {};
  function Plot(id, opts) {
    this.box = $(id);
    this.opts = opts || {};
    this.box.classList.add("od-plot");
    this.svg = el("svg", { role: "img" }, this.box);
    this.tip = document.createElement("div");
    this.tip.className = "tooltip"; this.tip.hidden = true;
    this.box.appendChild(this.tip);
    if (this.opts.group) (groups[this.opts.group] = groups[this.opts.group] || []).push(this);
    var self = this;
    this.svg.addEventListener("pointermove", function (ev) { self.hover(ev); });
    this.svg.addEventListener("pointerleave", function () { self.leave(true); });
  }
  function niceTicks(a, b, count) {
    var span = b - a; if (!(span > 0)) return [a];
    var step = Math.pow(10, Math.floor(Math.log10(span / count))), err = span / count / step;
    step *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    var out = [];
    for (var v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(Math.abs(v) < 1e-12 ? 0 : v);
    return out;
  }
  Plot.prototype.update = function (cfg) {
    this.cfg = cfg;
    var svg = this.svg; while (svg.firstChild) svg.removeChild(svg.firstChild);
    var W = Math.max(150, this.box.clientWidth || 600), H = this.opts.height || 160;
    var M = { l: this.opts.left || 44, r: 12, t: 12, b: cfg.hideX ? 8 : 30 };
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    var lx = cfg.logX ? Math.log10 : function (v) { return v; }, ly = cfg.logY ? Math.log10 : function (v) { return v; };
    var x0 = lx(cfg.x0), x1 = lx(cfg.x1), y0 = cfg.y0, y1 = cfg.y1;
    if (y0 != null && y1 != null && cfg.logY) { y0 = ly(y0); y1 = ly(y1); }
    if (y0 == null || y1 == null) {
      var lo = Infinity, hi = -Infinity;
      (cfg.series || []).forEach(function (s) {
        for (var i = 0; i < s.y.length; i++) {
          var xv = s.x ? s.x[i] : (s.x0 || 0) + i;
          if (xv < cfg.x0 || xv > cfg.x1) continue;
          var v = s.y[i]; if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
        }
      });
      (cfg.hlines || []).forEach(function (h) { lo = Math.min(lo, h.y); hi = Math.max(hi, h.y); });
      (cfg.points || []).concat(cfg.stems || []).forEach(function (p) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); });
      (cfg.rects || []).forEach(function (r) { lo = Math.min(lo, 0); hi = Math.max(hi, r.y); });
      if (cfg.logY) { lo = ly(lo); hi = ly(hi); }
      var pad = (hi - lo) * 0.06 || 1;
      y0 = y0 == null ? (cfg.zeroFloor ? Math.min(0, lo) : lo - pad) : ly(y0);
      y1 = y1 == null ? hi + pad : ly(y1);
    }
    var IW = W - M.l - M.r, IH = H - M.t - M.b;
    var sx = function (v) { return M.l + (lx(v) - x0) / (x1 - x0) * IW; };
    var sy = function (v) { return M.t + (1 - (ly(v) - y0) / (y1 - y0)) * IH; };
    this.geo = { W: W, H: H, M: M, IW: IW, IH: IH, sx: sx, sy: sy, x0: x0, x1: x1, lx: lx };

    var grid = el("g", { class: "od-grid" }, svg), axis = el("g", { class: "od-axis" }, svg);
    niceTicks(y0, y1, cfg.yTicks || 3).forEach(function (v) {
      var yy = M.t + (1 - (v - y0) / (y1 - y0)) * IH;
      el("line", { x1: M.l, x2: W - M.r, y1: yy, y2: yy }, grid);
      el("text", { x: M.l - 6, y: yy + 4, "text-anchor": "end" }, axis).textContent = cfg.logY ? fmtLog(v) : fmtTick(v);
    });
    if (!cfg.hideX) {
      niceTicks(x0, x1, Math.max(3, Math.floor(IW / 90))).forEach(function (v) {
        var xx = M.l + (v - x0) / (x1 - x0) * IW;
        el("text", { x: xx, y: H - M.b + 16, "text-anchor": "middle" }, axis).textContent = cfg.logX ? fmtLog(v) : fmtTick(v);
      });
      if (cfg.xLabel) el("text", { class: "od-axis-title", x: W - M.r, y: H - 2, "text-anchor": "end" }, svg).textContent = cfg.xLabel;
    }
    var clip = "odclip" + Math.random().toString(36).slice(2, 8);
    var defs = el("defs", {}, svg), cp = el("clipPath", { id: clip }, defs);
    el("rect", { x: M.l, y: M.t - 2, width: IW, height: IH + 4 }, cp);
    var plot = el("g", { "clip-path": "url(#" + clip + ")" }, svg);

    (cfg.bands || []).forEach(function (b) {
      el("rect", { x: sx(b.x0), y: M.t, width: Math.max(1, sx(b.x1) - sx(b.x0)), height: IH, style: "fill:" + (b.fill || "var(--od-band)") }, plot);
    });
    (cfg.rects || []).forEach(function (r) {
      el("rect", { x: sx(r.x0) + 1, y: sy(r.y), width: Math.max(1, sx(r.x1) - sx(r.x0) - 2), height: Math.max(0, sy(y0) - sy(r.y)),
        rx: 2, style: "fill:" + (r.color || "var(--axis)") }, plot);
    });
    (cfg.hlines || []).forEach(function (h) {
      el("line", { x1: M.l, x2: W - M.r, y1: sy(h.y), y2: sy(h.y), class: "od-rule", style: "stroke:" + (h.color || "var(--ink-2)") + (h.dash ? ";stroke-dasharray:" + h.dash : "") }, plot);
      if (h.label) el("text", { x: h.left ? M.l + 4 : W - M.r - 4, y: sy(h.y) - 4, "text-anchor": h.left ? "start" : "end", class: "od-rule-label" }, svg).textContent = h.label;
    });
    (cfg.series || []).forEach(function (s) {
      var pts = [];
      for (var i = 0; i < s.y.length; i++) {
        var xv = s.x ? s.x[i] : (s.x0 || 0) + i, v = s.y[i];
        if (!isFinite(v) || xv < cfg.x0 - 1 || xv > cfg.x1 + 1) continue;
        pts.push(sx(xv).toFixed(1) + "," + sy(v).toFixed(1));
      }
      el("polyline", { points: pts.join(" "), class: "od-line",
        style: "stroke:" + s.color + ";stroke-width:" + (s.width || 1.5) + (s.dash ? ";stroke-dasharray:" + s.dash : "") + ";stroke-opacity:" + (s.opacity == null ? 1 : s.opacity) }, plot);
    });
    (cfg.stems || []).forEach(function (p) {
      el("line", { x1: sx(p.x), x2: sx(p.x), y1: sy(Math.max(y0, 0)), y2: sy(p.y), style: "stroke:" + p.color + ";stroke-width:2;stroke-linecap:round" }, plot);
      el("circle", { cx: sx(p.x), cy: sy(p.y), r: 4.5, style: "fill:" + p.color + ";stroke:var(--surface);stroke-width:2" }, plot);
    });
    (cfg.points || []).forEach(function (p) {
      el("circle", { cx: sx(p.x), cy: sy(p.y), r: p.r || 3, style: "fill:" + p.color + ";stroke:var(--surface);stroke-width:1.5" }, plot);
    });
    var labelsAt = [];
    (cfg.vlines || []).forEach(function (v) {
      var xx = sx(v.x);
      if (xx < M.l - 1 || xx > W - M.r + 1) return;
      el("line", { x1: xx, x2: xx, y1: M.t, y2: H - M.b, class: "od-rule", style: "stroke:" + (v.color || "var(--ink)") + (v.dash ? ";stroke-dasharray:" + v.dash : "") }, svg);
      if (v.label) {
        var row = 0; while (labelsAt.some(function (q) { return q.row === row && Math.abs(q.x - xx) < 58; })) row++;
        labelsAt.push({ x: xx, row: row });
        var anchor = xx > W - 60 ? "end" : "start";
        el("text", { x: xx + (anchor === "end" ? -3 : 3), y: M.t + 10 + 12 * row, "text-anchor": anchor, class: "od-rule-label" }, svg).textContent = v.label;
      }
    });
    (cfg.labels || []).forEach(function (t) {
      el("text", { x: sx(t.x) + (t.dx || 0), y: sy(t.y) + (t.dy || 0), class: "od-direct", "text-anchor": t.anchor || "middle" }, svg).textContent = t.text;
    });
    this.cross = el("line", { y1: M.t, y2: H - M.b, class: "od-cross", visibility: "hidden" }, svg);
  };
  function fmtTick(v) { var a = Math.abs(v), d = a >= 100 || a === 0 || Number.isInteger(v) ? 0 : a >= 10 ? 0 : a >= 1 ? 1 : 2; return fmt(v, d); }
  function fmtLog(v) {
    var p = Math.pow(10, v);
    if (p >= 1 && p < 1e4) return fmt(p, 0);
    if (p >= 0.01 && p < 1) return fmt(p, p >= 0.1 ? 1 : 2);
    return "10" + String(Math.round(v)).split("").map(function (c) { return c === "-" ? "⁻" : "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(c)]; }).join("");
  }
  Plot.prototype.dataX = function (ev) {
    var g = this.geo, box = this.svg.getBoundingClientRect();
    var px = (ev.clientX - box.left) / box.width * g.W;
    var v = g.x0 + (px - g.M.l) / g.IW * (g.x1 - g.x0);
    return this.cfg.logX ? Math.pow(10, v) : v;
  };
  Plot.prototype.hover = function (ev) {
    if (!this.cfg || !this.cfg.tip) return;
    var x = this.cfg.snap ? this.cfg.snap(this.dataX(ev)) : Math.round(this.dataX(ev));
    if (x == null || x < this.cfg.x0 || x > this.cfg.x1) { this.leave(true); return; }
    var peers = this.opts.group ? groups[this.opts.group] : [this];
    var self = this;
    peers.forEach(function (p) { p.showAt(x, p === self); });
  };
  Plot.prototype.showAt = function (x, withTip) {
    if (!this.cfg || !this.geo) return;
    var g = this.geo, xx = g.sx(x);
    this.cross.setAttribute("x1", xx); this.cross.setAttribute("x2", xx); this.cross.setAttribute("visibility", "visible");
    if (!withTip) { this.tip.hidden = true; return; }
    var t = this.cfg.tip(x); if (!t) { this.tip.hidden = true; return; }
    var html = '<div class="t">' + t.title + "</div>";
    t.rows.forEach(function (r) {
      html += '<div class="row"><span>' + (r.color ? '<span class="swatch" style="background:' + r.color + '"></span>' : "") + r.label +
        '</span><span class="mono">' + r.value + "</span></div>";
    });
    this.tip.innerHTML = html; this.tip.hidden = false;
    var bw = this.box.clientWidth, px = xx / g.W * bw, left = px + 12;
    if (left + this.tip.offsetWidth > bw) left = px - this.tip.offsetWidth - 12;
    this.tip.style.left = Math.max(0, left) + "px"; this.tip.style.top = "4px";
  };
  Plot.prototype.leave = function (all) {
    var peers = all && this.opts.group ? groups[this.opts.group] : [this];
    peers.forEach(function (p) { if (p.cross) p.cross.setAttribute("visibility", "hidden"); p.tip.hidden = true; });
  };
  Plot.prototype.redraw = function () { if (this.cfg) this.update(this.cfg); };

  // ------------------------------------------------------------ state
  var D0 = C.DEFAULTS;
  function defaults() {
    var o = {}; for (var k in D0) o[k] = D0[k];
    o.hidden = -1;
    o.freqs = C.FREQS.slice();
    return o;
  }
  function defaultSpec() { var g = {}; for (var k in C.GRAPH) g[k] = C.GRAPH[k]; return { q: 0.95, gamma: 0.999, r: 3, sigmaK: 3, sigmaR: 1, graph: g }; }
  function copySpec() { var sp = {}; for (var k in state.spec) sp[k] = state.spec[k]; sp.graph = {}; for (k in state.spec.graph) sp.graph[k] = state.spec.graph[k]; return sp; }
  var state = { o: defaults(), spec: defaultSpec(), anim: 0, xwin: "full" };
  var R = null;     // current result
  var mc = null;    // last Monte Carlo summary

  function nodeList(ids) { return ids.map(function (i) { return NAMES[i]; }).join(", "); }
  function settingsKey() { var o = state.o; return JSON.stringify([o.onset, o.duration, o.hurst, o.magnitude, o.envelope, o.hidden, o.freqs, state.spec]); }

  function compute() {
    var r = C.pipeline(state.o, state.spec);
    var q = {}; for (var k in state.o) q[k] = state.o[k]; q.magnitude = 0;
    var f = C.pipeline(q, state.spec);
    r.free = { chain: f.det.detected ? f.tHat : -1, sigma3: f.base1.alarm, cross: f.baseN ? f.baseN.t : -1, evt1: f.ev1.alarm };
    r.eventStart = state.o.onset;
    r.eventEnd = state.o.onset + Math.max.apply(null, r.sig.arrivals.map(function (a) { return isFinite(a.delay) ? a.delay : 0; })) + state.o.duration;
    R = r;
  }

  // ------------------------------------------------------------ graph drawing
  // opt: edges [{i, j, label, off}], pick (click selects the source), faded[node], sub(node) → text under the node
  function drawGraph(svg, opt) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var src = state.o.source;
    (opt.edges || []).forEach(function (e) {
      var a = POS[e.i], b = POS[e.j], g = el("g", {}, svg);
      el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "od-edge-line" + (e.off ? " off" : "") + (e.extra ? " extra" : "") }, g);
      if (e.label) {
        var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        var nx = -dy / len, ny = dx / len; if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
        el("text", { x: mx + nx * 11, y: my + ny * 11, class: "od-edge-label" + (e.off ? " off" : ""), "text-anchor": "middle" }, g).textContent = e.label;
      }
    });
    var layer = el("g", {}, svg);
    NAMES.forEach(function (name, i) {
      var p = POS[i], g = el("g", { class: "od-node" + (opt.pick && i < 4 ? " clickable" : "") + (opt.faded && opt.faded[i] ? " faded" : "") }, svg);
      if (i === src) el("circle", { cx: p[0], cy: p[1], r: 22, class: "od-src-ring" }, g);
      el("circle", { cx: p[0], cy: p[1], r: 16, style: "fill:" + NODE_COLOR[i] + ";stroke:var(--surface);stroke-width:2" }, g);
      el("text", { x: p[0], y: p[1], class: "od-node-label" }, g).textContent = name;
      var sub = opt.sub ? opt.sub(i) : "";
      if (sub) el("text", { x: p[0] - (i === 4 ? 14 : 0), y: p[1] + (i === 1 ? -29 : 35), class: "od-node-sub" }, g).textContent = sub;
      if (opt.pick && i < 4) {
        g.setAttribute("tabindex", 0); g.setAttribute("role", "button");
        g.setAttribute("aria-label", L("Make ", "Сделать ") + name + L(" the source", " источником"));
        var pick = function () { setSource(i); };
        g.addEventListener("click", pick);
        g.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } });
      }
    });
    return layer;
  }
  function trueEdges(withLabels) {
    return C.EDGES.map(function (e) { return { i: e[0], j: e[1], label: withLabels ? "τ" + e[2] + " · w" + fmt(e[3], 2) : "" }; });
  }

  // ------------------------------------------------------------ step 1: graph + front animation
  var animLayer = null;
  function renderStep1() {
    var src = state.o.source;
    animLayer = drawGraph($("od-graph"), {
      pick: true, edges: trueEdges(true),
      sub: function (i) { return (i === 4 ? L("sensor · ", "датчик · ") : i === src ? "s* · " : "") + "f " + fmt(state.o.freqs[i], 2); }
    });
    var arr = R.sig.arrivals, maxT = Math.max.apply(null, arr.map(function (a) { return isFinite(a.delay) ? a.delay : 0; })) + state.o.duration;
    var slider = $("od-anim"); slider.max = maxT;
    if (state.anim > maxT) state.anim = maxT;
    slider.value = state.anim;
    var head = ru() ? ["Узел", "f", "Путь", "Στ", "Πw", "Приход"] : ["Node", "f", "Path", "Στ", "Πw", "Arrives"];
    var html = "<thead><tr><th>" + head[0] + '</th><th class="num">' + head[1] + "</th><th>" + head[2] + '</th><th class="num">' + head[3] + '</th><th class="num">' + head[4] + '</th><th class="num">' + head[5] + "</th></tr></thead><tbody>";
    arr.slice().sort(function (a, b) { return a.delay - b.delay; }).forEach(function (a) {
      html += '<tr><td><span class="swatch dot" style="background:' + NODE_COLOR[a.node] + '"></span><b>' + NAMES[a.node] + "</b>" + (a.node === src ? " s*" : "") +
        '</td><td class="num">' + fmt(state.o.freqs[a.node], 2) + '</td><td class="mono">' + a.path.map(function (i) { return NAMES[i]; }).join("→") + '</td><td class="num">' + a.delay +
        '</td><td class="num">' + fmt(a.gain, 2) + '</td><td class="num">' + (state.o.onset + a.delay) + "</td></tr>";
    });
    $("od-paths").innerHTML = html + "</tbody>";
    renderAnim();
  }
  function renderAnim() {
    if (!animLayer) return;
    while (animLayer.firstChild) animLayer.removeChild(animLayer.firstChild);
    var e = state.anim, D = state.o.duration, arr = R.sig.arrivals, reached = 0, active = 0;
    arr.forEach(function (a) {
      if (!isFinite(a.delay)) return;
      if (e >= a.delay) reached++;
      if (e >= a.delay && e < a.delay + D) {
        active++;
        el("circle", { cx: POS[a.node][0], cy: POS[a.node][1], r: 22, class: "od-lit", "stroke-opacity": (0.3 + 0.7 * a.gain).toFixed(2) }, animLayer);
      }
      if (a.path.length < 2) return;
      var parent = a.path[a.path.length - 2], dp = arr[parent].delay;
      if (e >= dp && e < a.delay) {
        var f = (e - dp) / (a.delay - dp), p0 = POS[parent], p1 = POS[a.node];
        el("circle", { cx: p0[0] + f * (p1[0] - p0[0]), cy: p0[1] + f * (p1[1] - p0[1]), r: 6, class: "od-pulse" }, animLayer);
      }
    });
    $("od-anim-readout").innerHTML = "<b>t − t* = " + e + "</b> · " +
      L("nodes reached: <b>" + reached + "</b> of 5 · burst active in " + active, "событие дошло до <b>" + reached + "</b> из 5 узлов · всплеск идёт в " + active);
  }
  var raf = null, last = 0, accum = 0;
  function frame(now) {
    if (!last) last = now;
    accum += (now - last) / 1000 * 40; last = now;
    if (accum >= 1) { var st = Math.floor(accum); accum -= st; state.anim = Math.min(Number($("od-anim").max), state.anim + st); $("od-anim").value = state.anim; renderAnim(); }
    if (state.anim >= Number($("od-anim").max)) { stopAnim(); return; }
    raf = requestAnimationFrame(frame);
  }
  function playLabel(on) {
    $("od-play").innerHTML = on ? '<span lang="en">❚❚ Pause</span><span lang="ru">❚❚ Пауза</span>' : '<span lang="en">▶ Play</span><span lang="ru">▶ Пуск</span>';
  }
  function stopAnim() { if (raf) cancelAnimationFrame(raf); raf = null; playLabel(false); }
  $("od-play").addEventListener("click", function () {
    if (raf) { stopAnim(); return; }
    if (state.anim >= Number($("od-anim").max)) state.anim = 0;
    last = 0; accum = 0; playLabel(true); raf = requestAnimationFrame(frame);
  });
  $("od-anim").addEventListener("input", function () { stopAnim(); state.anim = Number(this.value); renderAnim(); });

  // ------------------------------------------------------------ plots
  var P = {
    burst: new Plot("od-burst", { height: 170 }),
    dfa: new Plot("od-dfa", { height: 170 }),
    per: new Plot("od-x-per", { height: 70, group: "x" }),
    noise: new Plot("od-x-noise", { height: 70, group: "x" }),
    frac: new Plot("od-x-frac", { height: 140, group: "x" }),
    sum: new Plot("od-x-sum", { height: 320, group: "x" }),
    z: new Plot("od-z", { height: 200 }),
    gpd: new Plot("od-gpd", { height: 200 }),
    pgram: new Plot("od-pgram", { height: 210 }),
    ind: new Plot("od-ind", { height: 210 }),
    cmp: new Plot("od-cmp-chart", { height: 190 }),
    arlSim: new Plot("od-arl-sim", { height: 200 }),
    arlCurve: new Plot("od-arl-curve", { height: 200, left: 52 })
  };
  var lanes = [], laneKey = "", nodeLanes = [];
  (function () {
    var box = $("od-node-lanes");
    NAMES.forEach(function (nm, j) {
      var lab = document.createElement("div"); lab.className = "panel-label"; lab.id = "od-nl-l" + j; box.appendChild(lab);
      var div = document.createElement("div"); div.id = "od-nl" + j; box.appendChild(div);
      nodeLanes.push(new Plot("od-nl" + j, { height: j === 4 ? 92 : 62, group: "nodes", left: 40 }));
    });
  })();

  // frequency sliders of step 1 (the object dictionary follows them)
  function buildFreqs() {
    var box = $("od-freqs");
    box.innerHTML = NAMES.map(function (nm, j) {
      return '<label><span><span class="swatch dot" style="background:' + NODE_COLOR[j] + '"></span><b>' + nm + '</b> f = <b id="od-fv' + j + '"></b></span>' +
        '<input type="range" id="od-f' + j + '" min="0.02" max="0.48" step="0.01" value="' + state.o.freqs[j] + '" aria-label="f ' + nm + '"></label>';
    }).join("");
    NAMES.forEach(function (_, j) {
      $("od-f" + j).addEventListener("input", function () {
        state.o.freqs[j] = Number(this.value); $("od-fv" + j).textContent = fmt(state.o.freqs[j], 2); schedule();
      });
    });
  }
  buildFreqs();

  function renderNodeLanes() {
    var s = R.sig, x0 = state.o.onset - 60, x1 = Math.min(s.n - 1, R.eventEnd + 60), src = state.o.source;
    var own = s.rhythm.map(function (rj, j) { var y = new Float64Array(s.n); for (var t = 0; t < s.n; t++) y[t] = rj[t] + s.event[j][t]; return y; });
    NAMES.forEach(function (nm, j) {
      var a = s.arrivals[j];
      $("od-nl-l" + j).innerHTML = '<span class="swatch dot" style="background:' + NODE_COLOR[j] + '"></span> <b>' + nm + "</b>" + (j === src ? " s*" : "") + (j === 4 ? L(" (sensor)", " (датчик)") : "") +
        " · f = " + fmt(state.o.freqs[j], 2) + L(" · period ", " · период ") + fmt(1 / state.o.freqs[j], 1) + L(" samples · event arrives ", " отсч. · событие приходит ") + (state.o.onset + a.delay);
      nodeLanes[j].update({
        x0: x0, x1: x1, y0: -7, y1: 7, yTicks: 2, hideX: j !== 4, xLabel: L("sample t", "отсчёт t"),
        series: [{ y: own[j], color: NODE_COLOR[j], width: 1 }],
        vlines: [{ x: state.o.onset + a.delay, color: "var(--ink)", dash: "3 3" }],
        tip: function (x) { return { title: "t = " + x, rows: NAMES.map(function (n2, k) { return { label: n2, value: fmt(own[k][x]), color: NODE_COLOR[k] }; }) }; }
      });
    });
  }

  // ARL₀ of the kσ boundary on a stable Gaussian process (M1)
  function renderARL() {
    var k = state.spec.sigmaK, r = state.spec.sigmaR, N = 3000, rng = C.makeRng(state.o.seed, "arl-demo"), x = new Float64Array(N);
    for (var t = 0; t < N; t++) x[t] = rng.normal();
    var alpha = C.gaussTail2(k), arl0 = C.arl(alpha, r), pts = [], alarms = [], run = 0;
    for (t = 0; t < N; t++) {
      if (Math.abs(x[t]) > k) { pts.push({ x: t, y: x[t], color: "var(--ink)", r: 2.5 }); run++; if (run === r) alarms.push(t); } else run = 0;
    }
    P.arlSim.update({
      x0: 0, x1: N - 1, y0: -4.5, y1: 4.5, xLabel: L("observation", "наблюдение"),
      series: [{ y: x, color: "var(--muted)", width: 0.7 }], points: pts,
      hlines: [{ y: k, label: "+" + fmt(k, 1) + "σ", color: "var(--ink)", dash: "6 3" }, { y: -k, label: "−" + fmt(k, 1) + "σ", color: "var(--ink)", dash: "6 3" }],
      vlines: alarms.map(function (a) { return { x: a, color: "var(--bad)" }; }),
      tip: function (i) { return { title: L("observation ", "наблюдение ") + i, rows: [{ label: "x", value: fmt(x[i]) }] }; }
    });
    var ks = [], curves = [1, 2, 3].map(function () { return []; });
    for (var kk = 1.5; kk <= 4.5001; kk += 0.05) { ks.push(+kk.toFixed(2)); [1, 2, 3].forEach(function (rr, i) { curves[i].push(C.arl(C.gaussTail2(kk), rr)); }); }
    var tones = ["var(--ink)", "var(--ink-2)", "var(--muted)"];
    $("od-arl-legend").innerHTML = [1, 2, 3].map(function (rr, i) { return '<span class="key"><span class="swatch" style="background:' + tones[i] + '"></span>r = ' + rr + "</span>"; }).join("");
    P.arlCurve.update({
      x0: 1.5, x1: 4.5, y0: 1, y1: 1e12, logY: true, xLabel: "k",
      series: curves.map(function (cv, i) { return { x: ks, y: cv, color: tones[i], width: 1.75, dash: i ? (i === 1 ? "6 3" : "2 3") : null }; }),
      points: [{ x: k, y: arl0, color: "var(--bad)", r: 5 }, { x: 3, y: C.arl(C.gaussTail2(3), 1), color: "var(--ink)", r: 4 }],
      labels: [{ x: 3, y: C.arl(C.gaussTail2(3), 1), text: "370", dy: 16, dx: 14 }],
      vlines: [{ x: k, color: "var(--muted)", dash: "3 3" }],
      snap: function (v) { return Math.round(v * 20) / 20; },
      tip: function (v) { return { title: "k = " + fmt(v, 2) + ", α = " + fmt(C.gaussTail2(v), 5), rows: [1, 2, 3].map(function (rr, i) { return { label: "r = " + rr, value: arlText(C.arl(C.gaussTail2(v), rr)), color: tones[i] }; }) }; }
    });
    var Tb = state.o.background;
    facts("od-arl-facts", [
      [fmt(alpha, 4), L("α = P(|Z| > " + fmt(k, 1) + ") for a Gaussian process", "α = P(|Z| > " + fmt(k, 1) + ") для гауссовского процесса")],
      [arlText(arl0), L("ARL<sub>0</sub> = μ<sub>r</sub>(α), r = " + r + ": mean number of observations to a false alarm", "ARL<sub>0</sub> = μ<sub>r</sub>(α), r = " + r + ": среднее число наблюдений до ложной тревоги")],
      [fmt(N / arl0, N / arl0 < 10 ? 1 : 0) + " / " + alarms.length, L("false alarms in 3000 observations: expected / observed", "ложных тревог на 3000 наблюдений: ожидается / наблюдается")],
      [fmt(Tb / arl0, Tb / arl0 < 10 ? 1 : 0) + " / " + R.base1.backgroundAlarms, L("on the real background of E (900 samples, not Gaussian): expected / observed", "на реальном фоне E (900 отсчётов, не гауссовский): ожидается / наблюдается")]
    ]);
  }

  function eventBand() { return [{ x0: R.eventStart, x1: R.eventEnd }]; }

  function renderStep2() {
    var o = state.o, src = o.source, D = o.duration, g = C.envelope(D, o.envelope), env = [], nenv = [];
    for (var i = 0; i < D; i++) { env.push(o.magnitude * g[i]); nenv.push(-o.magnitude * g[i]); }
    var yMax = 3 * Number($("od-magnitude").max); // fixed by the slider range, so changing M changes the picture
    P.burst.update({
      y0: -yMax, y1: yMax,
      x0: o.onset - 5, x1: o.onset + D + 5, xLabel: L("sample t at the source ", "отсчёт t в источнике ") + NAMES[src],
      series: [
        { y: env, x0: o.onset, color: "var(--muted)", dash: "4 3", width: 1 },
        { y: nenv, x0: o.onset, color: "var(--muted)", dash: "4 3", width: 1 },
        { y: R.sig.burst, x0: o.onset, color: NODE_COLOR[src], width: 1.75 }
      ],
      vlines: [{ x: o.onset, label: "t* = " + o.onset, dash: "4 3" }, { x: o.onset + D, label: "t* + D", dash: "4 3", color: "var(--muted)" }],
      tip: function (x) {
        var k = x - o.onset; if (k < 0 || k >= D) return null;
        return { title: "t = " + x, rows: [{ label: "b(t)", value: fmt(R.sig.burst[k]), color: NODE_COLOR[src] }, { label: "±M·g", value: fmt(env[k]) }] };
      }
    });
    var long = C.coloredNoise(2048, o.hurst, C.makeRng(o.seed, "hurst-demo")), d = C.dfa(long, [8, 16, 32, 64, 128, 256]);
    var xs = d.points.map(function (p) { return p.s; });
    P.dfa.update({
      x0: 6, x1: 340, y0: 0.3, y1: 300, logX: true, logY: true, xLabel: L("scale s", "масштаб s"),
      series: [
        { x: xs, y: d.points.map(function (p) { return Math.pow(10, d.intercept + d.alpha * Math.log10(p.s)); }), color: NODE_COLOR[src], width: 2 },
        { x: xs, y: d.points.map(function (p) { return d.points[0].F * Math.pow(p.s / d.points[0].s, o.hurst); }), color: "var(--ink)", width: 1.25, dash: "5 4" }
      ],
      points: d.points.map(function (p) { return { x: p.s, y: p.F, color: NODE_COLOR[src], r: 4.5 }; }),
      snap: function (x) { var best = xs[0]; xs.forEach(function (v) { if (Math.abs(Math.log(v / x)) < Math.abs(Math.log(best / x))) best = v; }); return best; },
      tip: function (x) { var p = d.points[xs.indexOf(x)]; return { title: "s = " + x, rows: [{ label: "F(s)", value: fmt(p.F, 3), color: NODE_COLOR[src] }] }; }
    });
    $("od-dfa-readout").innerHTML = L("DFA α = <b>" + fmt(d.alpha) + "</b> for H = " + fmt(o.hurst) + " (dashed: slope H)",
      "DFA α = <b>" + fmt(d.alpha) + "</b> при H = " + fmt(o.hurst) + " (пунктир — наклон H)");
  }

  function renderStep3() {
    var s = R.sig, n = s.n, Tb = state.o.background, zoom = state.xwin === "zoom";
    var x0 = zoom ? state.o.onset - 30 : 0, x1 = zoom ? Math.min(n - 1, R.eventEnd + 30) : n - 1; // one window for all four panels
    var tip = function (x) {
      if (x < 0 || x >= n) return null;
      return { title: "t = " + x, rows: [
        { label: L("periodic", "периодика"), value: fmt(s.periodic[x]) },
        { label: L("stochastic", "стохастика"), value: fmt(s.stochastic[x]) },
        { label: L("fractal", "фрактал"), value: fmt(s.fractal[x]) },
        { label: "x(t)", value: fmt(s.values[x]) }] };
    };
    var vb = [{ x: Tb, label: "T_b", color: "var(--muted)", dash: "3 3" }, { x: state.o.onset, label: "t*", dash: "4 3" }];
    var w = zoom ? 1.1 : 0.8;
    P.per.update({ x0: x0, x1: x1, hideX: true, series: [{ y: s.periodic, color: "var(--ink-2)", width: w }], bands: eventBand(), vlines: vb, tip: tip });
    P.noise.update({ x0: x0, x1: x1, hideX: true, series: [{ y: s.stochastic, color: "var(--muted)", width: w }], bands: eventBand(), vlines: vb, tip: tip });
    $("od-x-legend").innerHTML = NAMES.map(function (nm, j) {
      return '<span class="key"><span class="swatch" style="background:' + NODE_COLOR[j] + '"></span>' + nm + " · t* + " + s.arrivals[j].delay + "</span>";
    }).join("");
    P.frac.update({
      x0: x0, x1: x1, hideX: true,
      series: s.event.map(function (e, j) { return { y: e, color: NODE_COLOR[j], width: w, opacity: 0.9 }; }),
      vlines: zoom ? s.arrivals.map(function (a) { return { x: state.o.onset + a.delay, label: NAMES[a.node], color: NODE_COLOR[a.node], dash: "2 3" }; }) : vb,
      tip: function (x) { return { title: "t = " + x, rows: s.event.map(function (e, j) { return { label: NAMES[j], value: fmt(e[x]), color: NODE_COLOR[j] }; }) }; }
    });
    P.sum.update({ x0: x0, x1: x1, xLabel: L("sample t at E", "отсчёт t в E"), series: [{ y: s.values, color: "var(--ink)", width: w }], bands: eventBand(), vlines: vb, tip: tip });
  }

  function arlText(v) {
    if (!isFinite(v)) return "∞";
    if (v < 1e4) return fmt(v, 0);
    var e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e);
    return fmt(m, 1) + "·10" + String(e).split("").map(function (c) { return "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(c)]; }).join("");
  }

  function renderStep4() {
    var st = R.station, ev = R.ev1, z = R.rz.z, n = R.sig.n, Tb = state.o.background;
    var items = [
      ["inspect_input", L("one channel (p = 1), n = " + n + ", constant step, no gaps", "один канал (p = 1), n = " + n + ", постоянный шаг, пропусков нет"), "ok"],
      ["check_stationarity", L("4 background blocks: ptp of means " + fmt(st.ptp) + (st.ptp < st.sd ? " < " : " ≥ ") + "σ = " + fmt(st.sd) + ", variance ratio " + fmt(st.ratio) +
        (st.ratio < 4 ? " < 4" : " ≥ 4") + " → " + (st.stationary ? "stationary" : "not stationary"),
        "4 блока фона: размах средних " + fmt(st.ptp) + (st.ptp < st.sd ? " < " : " ≥ ") + "σ = " + fmt(st.sd) + ", отношение дисперсий " + fmt(st.ratio) +
        (st.ratio < 4 ? " < 4" : " ≥ 4") + " → " + (st.stationary ? "стационарен" : "нестационарен")), st.stationary ? "ok" : "warn"],
      ["detect_evt", ev.alarm >= 0 ? L("1-D alarm τ_r = " + ev.alarm + ": an extreme event happened", "одномерная тревога τ_r = " + ev.alarm + ": экстремальное событие произошло")
        : L("no alarm → stop: <code>no_evt_detected</code>", "тревоги нет → остановка: <code>no_evt_detected</code>"), ev.alarm >= 0 ? "ok" : "warn"],
      ["rank_source", L("p = 1: O = {E} leaves all " + R.gate1.length + " node pairs unresolved (Theorem 2.18.1) → <code>single_channel_cannot_localize</code> → structural analysis (steps 5–7) → n-D route (steps 8–9)",
        "p = 1: при O = {E} не разрешены все " + R.gate1.length + " пар узлов (теорема 2.18.1) → <code>single_channel_cannot_localize</code> → структурный анализ (шаги 5–7) → n-D-маршрут (шаги 8–9)"), "next"]
    ];
    $("od-route").innerHTML = items.map(function (it) {
      return '<li class="' + it[2] + '"><span class="od-mark">' + (it[2] === "ok" ? "✓" : it[2] === "warn" ? "!" : "→") + "</span><span><code>" + it[0] + "</code> " + it[1] + "</span></li>";
    }).join("");
    var pts = [];
    for (var t = Tb; t < n; t++) if (z[t] > ev.threshold) pts.push({ x: t, y: z[t], color: "var(--ink)", r: 2.5 });
    var vl = [{ x: Tb, label: "T_b", color: "var(--muted)", dash: "3 3" }];
    if (ev.alarm >= 0) vl.push({ x: ev.alarm, label: "τ_r = " + ev.alarm });
    P.z.update({
      x0: 0, x1: n - 1, y0: 0, xLabel: L("sample t at E", "отсчёт t в E"),
      series: [{ y: z, color: "var(--ink-2)", width: 0.9 }], bands: eventBand(), points: pts, vlines: vl,
      hlines: [{ y: ev.u, label: "u = " + fmt(ev.u), color: "var(--muted)", dash: "4 3", left: true }, { y: ev.threshold, label: "q_EVT = " + fmt(ev.threshold), color: "var(--ink)", dash: "6 3" }],
      tip: function (x) { return { title: "t = " + x, rows: [{ label: "z(t)", value: fmt(z[x]) }] }; }
    });
    var ex = ev.excess, top = C.quantile(ex, 0.99) * 1.2 || 1, bins = 14, w = top / bins, hist = [];
    for (var b = 0; b < bins; b++) hist.push(0);
    ex.forEach(function (v) { var i = Math.floor(v / w); if (i < bins) hist[i]++; });
    var xs = [], pdf = [];
    for (var i2 = 0; i2 <= 60; i2++) { var xv = top * i2 / 60; xs.push(xv); pdf.push(C.gpdPdf(xv, ev.shape, ev.scale)); }
    P.gpd.update({
      x0: 0, x1: top, y0: 0, xLabel: L("excess z − u", "превышение z − u"),
      rects: hist.map(function (c, i) { return { x0: i * w, x1: (i + 1) * w, y: c / (ex.length * w), color: "var(--axis)" }; }),
      series: [{ x: xs, y: pdf, color: "var(--ink)", width: 2 }],
      snap: function (x) { return Math.min(bins - 1, Math.max(0, Math.floor(x / w))) * w + w / 2; },
      tip: function (x) { var i = Math.floor(x / w); return { title: fmt(i * w) + "…" + fmt((i + 1) * w), rows: [{ label: L("count", "число"), value: hist[i] }, { label: L("GPD density", "плотность ОРП"), value: fmt(C.gpdPdf(x, ev.shape, ev.scale), 3) }] }; }
    });
    facts("od-when-facts", [
      [fmt(ev.threshold), L("q<sub>EVT</sub> from the GPD: ξ = " + fmt(ev.shape) + ", σ = " + fmt(ev.scale) + ", " + ex.length + " excesses", "q<sub>EVT</sub> по ОРП: ξ = " + fmt(ev.shape) + ", σ = " + fmt(ev.scale) + ", превышений: " + ex.length)],
      [arlText(ev.arl0), L("ARL<sub>0</sub> = μ<sub>r</sub>(1 − γ) for independent samples (M1)", "ARL<sub>0</sub> = μ<sub>r</sub>(1 − γ) для независимых отсчётов (М1)")],
      [String(ev.backgroundAlarms), L("alarms on the known-normal background", "тревог на заведомо нормальном фоне")],
      [ev.alarm >= 0 ? ev.alarm + " <small>(t* + " + (ev.alarm - state.o.onset) + ")</small>" : "–", L("1-D alarm τ<sub>r</sub>: there is an event, but no “where” yet", "одномерная тревога τ<sub>r</sub>: событие есть, но «где» пока нет")]
    ]);
  }
  function facts(id, list) {
    $(id).innerHTML = list.map(function (f) { return '<div class="fact"><div class="v">' + f[0] + '</div><div class="k">' + f[1] + "</div></div>"; }).join("");
  }

  function renderStep6() {
    var pg = R.pg, sn = R.sn;
    P.pgram.update({
      x0: pg.freqs[0], x1: pg.freqs[pg.freqs.length - 1], logY: true, xLabel: L("frequency f, cycles per sample", "частота f, циклов на отсчёт"),
      series: [{ x: pg.freqs, y: pg.power.map(function (v) { return Math.max(v, 1e-6); }), color: "var(--ink-2)", width: 1 }],
      hlines: [{ y: sn.threshold, label: L("30 × median", "30 × медиана"), color: "var(--muted)", dash: "4 3", left: true }],
      points: sn.peaks.map(function (pk) { return { x: pk.f, y: pk.power, color: pk.node >= 0 ? NODE_COLOR[pk.node] : "var(--muted)", r: 5 }; }),
      labels: sn.peaks.map(function (pk) { return { x: pk.f, y: pk.power, text: pk.node >= 0 ? NAMES[pk.node] : "?", dy: -9 }; }),
      snap: function (x) { var i = Math.round((x - pg.freqs[0]) / 0.0005); return pg.freqs[Math.max(0, Math.min(pg.freqs.length - 1, i))]; },
      tip: function (x) { var i = Math.round((x - pg.freqs[0]) / 0.0005); return { title: "f = " + fmt(x, 4), rows: [{ label: L("power", "мощность"), value: fmt(pg.power[i], 2) }] }; }
    });
    var head = ru() ? ["Пик f", "мощность / медиана", "узел", "f по словарю"] : ["Peak f", "power / median", "node", "dictionary f"];
    $("od-peaks").innerHTML = "<thead><tr><th>" + head.join("</th><th>") + "</th></tr></thead><tbody>" + sn.peaks.map(function (pk) {
      return '<tr><td class="mono">' + fmt(pk.f, 4) + '</td><td class="num">' + fmt(pk.power / sn.median, 0) + "</td><td>" +
        (pk.node >= 0 ? '<span class="swatch dot" style="background:' + NODE_COLOR[pk.node] + '"></span><b>' + NAMES[pk.node] + "</b>" : "?") +
        '</td><td class="mono">' + (pk.node >= 0 ? fmt(state.o.freqs[pk.node], 2) : "–") + "</td></tr>";
    }).join("") + "</tbody><tfoot><tr><td colspan=\"4\">" + L("Nodes found: ", "Найдено узлов: ") + "<b>" + R.ids.length + "</b> (" + nodeList(R.ids) + ")" +
      (state.o.hidden >= 0 ? L(" · rhythm of " + NAMES[state.o.hidden] + " hidden", " · ритм " + NAMES[state.o.hidden] + " скрыт") : "") + "</td></tr></tfoot>";
  }

  function renderStep7() {
    var box = $("od-lanes"), key = R.ids.join(",");
    if (key !== laneKey) {
      box.innerHTML = ""; lanes = []; groups.lanes = [];
      R.ids.forEach(function (id, k) {
        var lab = document.createElement("div"); lab.className = "panel-label"; lab.id = "od-lane-l" + k; box.appendChild(lab);
        var div = document.createElement("div"); div.id = "od-lane" + k; box.appendChild(div);
        lanes.push(new Plot("od-lane" + k, { height: k === R.ids.length - 1 ? 100 : 72, group: "lanes", left: 44 }));
      });
      laneKey = key;
    }
    var x0 = 760, x1 = R.sig.n - 1;
    R.ids.forEach(function (id, k) {
      var a = R.sig.arrivals[id];
      $("od-lane-l" + k).innerHTML = '<span class="swatch dot" style="background:' + NODE_COLOR[id] + '"></span> <b>' + NAMES[id] + "</b> · f = " + fmt(state.o.freqs[id], 2) +
        " · " + L("true arrival ", "истинный приход ") + (state.o.onset + a.delay);
      lanes[k].update({
        x0: x0, x1: x1, hideX: k !== R.ids.length - 1, xLabel: L("sample t", "отсчёт t"), yTicks: 2,
        series: [{ y: R.env[k], color: NODE_COLOR[id], width: 1.4 }], bands: eventBand(),
        vlines: [{ x: state.o.onset + a.delay, color: "var(--ink)", dash: "3 3" }, { x: state.o.background, color: "var(--muted)", dash: "3 3" }],
        tip: function (x) {
          return { title: "t = " + x, rows: R.ids.map(function (j, kk) { return { label: NAMES[j] + " |W|", value: fmt(R.env[kk][x]), color: NODE_COLOR[j] }; }) };
        }
      });
    });
  }

  function edgeKey(e) { return Math.min(e.i, e.j) + "-" + Math.max(e.i, e.j); }
  function renderStep8() {
    var faded = NAMES.map(function (_, i) { return R.ids.indexOf(i) < 0; });
    var sub = function (i) { return faded[i] ? L("not found", "не найден") : ""; };
    drawGraph($("od-sgraph"), { edges: R.sg.edges.map(function (e) { return { i: e.i, j: e.j }; }), faded: faded, sub: sub });
    var p = R.ids.length, dep = R.fg.dependence, structKey = {}, estKey = {};
    R.sg.edges.forEach(function (e) { structKey[edgeKey(e)] = true; });
    var fe = R.fgEdges.map(function (e) {
      estKey[edgeKey(e)] = true;
      var a = R.ids.indexOf(e.i), b = R.ids.indexOf(e.j);
      return { i: e.i, j: e.j, label: fmt(dep[a * p + b], 2), extra: !structKey[edgeKey(e)] };
    });
    R.sg.edges.forEach(function (e) { if (!estKey[edgeKey(e)]) fe.push({ i: e.i, j: e.j, off: true }); });
    drawGraph($("od-fgraph"), { edges: fe, faded: faded, sub: sub });
    var c = R.fgCmp, g = state.spec.graph;
    var prec = R.fgEdges.length ? c.common.length / R.fgEdges.length : 0, rec = R.sg.edges.length ? c.common.length / R.sg.edges.length : 0;
    $("od-graph-readout").innerHTML = L("Method <b>" + g.method + "</b> on a record of " + g.archive + " samples: <b>" + R.fgEdges.length + "</b> edges, " + c.common.length +
      " also in the structure, " + c.extra.length + " extra, " + c.missing.length + " missed · precision " + fmt(prec) + ", recall " + fmt(rec) + ", Jaccard J = <b>" + fmt(c.jaccard) + "</b>" +
      " (a random graph with 6 of 10 edges: J ≈ 0.43)",
      "Метод <b>" + g.method + "</b> на записи из " + g.archive + " отсчётов: <b>" + R.fgEdges.length + "</b> рёбер, из них в структуре " + c.common.length +
      ", лишних " + c.extra.length + ", пропущено " + c.missing.length + " · точность " + fmt(prec) + ", полнота " + fmt(rec) + ", Жаккар J = <b>" + fmt(c.jaccard) + "</b>" +
      " (случайный граф с 6 рёбрами из 10: J ≈ 0,43)");
    var html = "<thead><tr><th></th>" + R.ids.map(function (i) { return '<th class="num">' + NAMES[i] + "</th>"; }).join("") + "</tr></thead><tbody>";
    R.ids.forEach(function (i, a) {
      html += "<tr><td><b>" + NAMES[i] + "</b></td>" + R.ids.map(function (j, b) {
        var on = a !== b && R.fg.adjacency[a * p + b];
        return '<td class="num' + (on ? " od-on" : "") + '">' + (a === b ? "–" : fmt(dep[a * p + b], g.method === "granger" ? 3 : 2)) + "</td>";
      }).join("") + "</tr>";
    });
    $("od-dep").innerHTML = html + "</tbody>";
  }
  // every method on the same identification record, current rule and parameters (deferred: granger takes a few ms per run)
  function renderMethods() {
    var head = ru() ? ["Метод", "рёбер", "J", "точность", "полнота"] : ["Method", "edges", "J", "precision", "recall"];
    var rows = ["ar", "corr", "partial", "xcorr", "pwxcorr", "granger"].map(function (m) {
      var sp = copySpec(); sp.graph.method = m;
      var fg = C.learnGraph(state.o, R.nodes, (function () { var x = {}; for (var k in R.spec) x[k] = R.spec[k]; x.graph = sp.graph; return x; })());
      var est = [], p = R.ids.length;
      for (var i = 0; i < p; i++) for (var j = i + 1; j < p; j++) if (fg.adjacency[i * p + j]) est.push({ i: R.ids[i], j: R.ids[j] });
      var c = C.compareEdges(est, R.sg.edges);
      return "<tr" + (m === state.spec.graph.method ? ' class="od-cur"' : "") + "><td><b>" + m + '</b></td><td class="num">' + est.length + '</td><td class="num">' + fmt(c.jaccard) +
        '</td><td class="num">' + fmt(est.length ? c.common.length / est.length : 0) + '</td><td class="num">' + fmt(R.sg.edges.length ? c.common.length / R.sg.edges.length : 0) + "</td></tr>";
    });
    $("od-gcmp").innerHTML = "<thead><tr>" + head.map(function (h, i) { return "<th" + (i ? ' class="num"' : "") + ">" + h + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.join("") + "</tbody>";
  }

  function renderStep9() {
    var det = R.det, n = R.sig.n, vl = [{ x: state.o.onset, label: "t*", dash: "4 3" }];
    if (R.ev1.alarm >= 0) vl.push({ x: R.ev1.alarm, label: L("1-D alarm", "тревога 1-D"), color: "var(--muted)" });
    if (det.detected) vl.push({ x: det.timeIndex, label: "t̂ = " + det.timeIndex });
    var bands = eventBand();
    if (R.gated) bands = [{ x0: det.from, x1: det.to, fill: "var(--od-future)" }].concat(bands);
    var topIdx = new Array(n);
    for (var t = 0; t < n; t++) { var best = 0; for (var k = 1; k < R.ids.length; k++) if (det.z[k][t] > det.z[best][t]) best = k; topIdx[t] = best; }
    P.ind.update({
      x0: 760, x1: n - 1, y0: 0, xLabel: L("sample t", "отсчёт t"),
      series: [{ y: det.indicator, color: "var(--ink-2)", width: 1.2 }], bands: bands, vlines: vl,
      hlines: [{ y: det.u, label: "u = " + fmt(det.u), color: "var(--muted)", dash: "4 3", left: true }, { y: det.threshold, label: "q_EVT = " + fmt(det.threshold), color: "var(--ink)", dash: "6 3" }],
      tip: function (x) { return { title: "t = " + x, rows: [{ label: "I(t)", value: fmt(det.indicator[x]) }, { label: L("top channel", "верхний канал"), value: NAMES[R.ids[topIdx[x]]], color: NODE_COLOR[R.ids[topIdx[x]]] }] }; }
    });
    facts("od-nd-facts", [
      [fmt(det.threshold), L("n-D q<sub>EVT</sub> on the indicator I<sub>t</sub> (top-1 robust z)", "n-D q<sub>EVT</sub> по индикатору I<sub>t</sub> (наибольшая робастная z)")],
      [String(R.spec.rN), L("run length in samples = 2σ<sub>t</sub>, one envelope correlation time", "длина серии в отсчётах = 2σ<sub>t</sub>, одно время корреляции огибающей")],
      [R.gated ? "[" + det.from + "; " + det.to + "]" : "–", L("search window around the 1-D alarm (shaded)", "окно поиска вокруг одномерной тревоги (тень)")],
      [det.detected ? det.timeIndex + " <small>(t* + " + (det.timeIndex - state.o.onset) + ")</small>" : "–",
        det.detected ? L("t̂: start of the first run — the answer “when”", "t̂: начало первой серии — ответ «когда»") : L("no n-D alarm: stop " + (R.stop ? "<code>" + R.stop + "</code>" : ""), "n-D-тревоги нет: остановка " + (R.stop ? "<code>" + R.stop + "</code>" : ""))]
    ]);
  }

  function bars(boxId, rows) {
    $(boxId).innerHTML = rows.map(function (r) {
      return '<div class="od-bar-row"><span class="od-bar-name">' + r.name + '</span><span class="od-bar-track"><span class="od-bar" style="width:' +
        Math.max(0.5, 100 * r.frac).toFixed(1) + "%;background:" + r.color + '"></span></span><span class="od-bar-val mono">' + r.value + "</span></div>";
    }).join("");
  }

  function renderStep10() {
    var src = state.o.source, box = $("od-answer");
    if (!R.rank) {
      box.className = "od-answer bad";
      box.innerHTML = L("No answer: ", "Ответа нет: ") + "<code>" + (R.stop || "no_evt_detected") + "</code>";
      bars("od-bars", []); bars("od-fit", []); $("od-feats").innerHTML = ""; return;
    }
    var rk = R.rank, s = R.ids[rk.source], ok = s === src, fit = R.fit, agree = fit && fit.source === s;
    box.className = "od-answer " + (ok ? "good" : "bad");
    box.innerHTML =
      '<div><span class="od-a-k">' + L("When", "Когда") + '</span><span class="od-a-v">t̂ = ' + R.tHat + "</span><span class=\"od-a-n\">t* = " + state.o.onset + ", " + L("error ", "ошибка ") + (R.tHat - state.o.onset >= 0 ? "+" : "") + (R.tHat - state.o.onset) + "</span></div>" +
      '<div><span class="od-a-k">' + L("Where", "Где") + '</span><span class="od-a-v"><span class="swatch dot" style="background:' + NODE_COLOR[s] + '"></span>ŝ = ' + NAMES[s] + "</span><span class=\"od-a-n\">P = " + pct(rk.probabilities[rk.source]) + " · " +
      (ok ? L("correct", "верно") : L("wrong, true ", "неверно, истинный ") + NAMES[src]) + "</span></div>" +
      '<div><span class="od-a-k">' + L("St. 2.18.3", "Утв. 2.18.3") + '</span><span class="od-a-v">' + (fit ? "ŝ = " + NAMES[fit.source] + ", t̂* = " + fit.tStar : "–") + '</span><span class="od-a-n">' +
      (fit ? (agree ? L("agrees with rank_source (M5)", "совпадает с rank_source (М5)") : L("disagrees with rank_source — both are kept (M5)", "не совпадает с rank_source — обе оценки сохраняются (М5)")) : L("fewer than 2 onsets", "меньше 2 начал")) + "</span></div>";
    bars("od-bars", R.ids.map(function (id, k) {
      return { name: "<b>" + NAMES[id] + "</b>" + (id === src ? " <small>s*</small>" : ""), frac: rk.probabilities[k], color: NODE_COLOR[id], value: pct(rk.probabilities[k]) };
    }));
    if (fit) {
      var mx = Math.max.apply(null, fit.rss.map(function (x) { return x.rss; })) || 1;
      bars("od-fit", fit.rss.map(function (x, v) {
        return { name: "<b>" + NAMES[v] + "</b>" + (v === src ? " <small>s*</small>" : "") + (v === fit.source ? " ←" : ""), frac: x.rss / mx, color: NODE_COLOR[v], value: fmt(x.rss, 0) };
      }));
    } else bars("od-fit", []);
    var head = ru() ? ["Узел", "начало a", "пик", "энергия", "латентность", "степень", "соседи", "оценка", "P"] : ["Node", "onset a", "peak", "energy", "latency", "degree", "neighbour", "score", "P"];
    $("od-feats").innerHTML = "<thead><tr>" + head.map(function (h, i) { return "<th" + (i ? ' class="num"' : "") + ">" + h + "</th>"; }).join("") + "</tr></thead><tbody>" +
      R.ids.map(function (id, k) {
        var f = rk.features[k];
        return '<tr><td><span class="swatch dot" style="background:' + NODE_COLOR[id] + '"></span><b>' + NAMES[id] + '</b></td><td class="num">' + (R.onsets[k] == null ? "–" : R.onsets[k]) +
          '</td><td class="num">' + fmt(f.peak, 1) + '</td><td class="num">' + fmt(f.energy, 1) + '</td><td class="num">' + f.latency + '</td><td class="num">' + f.degree +
          '</td><td class="num">' + fmt(f.neighbor, 1) + '</td><td class="num">' + fmt(rk.raw[k], 1) + '</td><td class="num">' + pct(rk.probabilities[k]) + "</td></tr>";
      }).join("") + "</tbody>";
  }

  function renderStep11() {
    var o = state.o, b = R.base1, x = R.sig.values, vl = [{ x: o.onset, label: "t*", dash: "4 3" }];
    var kl = fmt(b.k, 1) + "σ" + (b.r > 1 ? ", r = " + b.r : "");
    if (b.alarm >= 0) vl.push({ x: b.alarm, label: kl + ": " + b.alarm, color: "var(--muted)" });
    if (R.tHat != null) vl.push({ x: R.tHat, label: "t̂ = " + R.tHat });
    P.cmp.update({
      x0: 760, x1: o.n - 1, xLabel: L("sample t at E", "отсчёт t в E"),
      series: [{ y: x, color: "var(--ink-2)", width: 0.8 }], bands: eventBand(), vlines: vl,
      hlines: [{ y: b.mean + b.k * b.sd, label: "x̄ + " + fmt(b.k, 1) + "s", color: "var(--muted)", dash: "4 3" }, { y: b.mean - b.k * b.sd, label: "x̄ − " + fmt(b.k, 1) + "s", color: "var(--muted)", dash: "4 3" }],
      tip: function (t) { return { title: "t = " + t, rows: [{ label: "x(t)", value: fmt(x[t]) }, { label: "|x − x̄|/s", value: fmt(b.z[t]) }] }; }
    });
    var bn = R.baseN, src = o.source, yes = function (t) { return t >= 0 ? L("yes, at ", "да, в ") + t : L("no", "нет"); };
    var rows = [
      [L("When: alarm / estimate", "Когда: тревога / оценка"), b.alarm >= 0 ? String(b.alarm) : "–", bn ? String(bn.t) : "–", R.tHat != null ? "t̂ = " + R.tHat : "–"],
      [L("Error vs t*", "Ошибка относительно t*"), b.alarm >= 0 ? "+" + (b.alarm - o.onset) : "–", bn ? "+" + (bn.t - o.onset) : "–", R.tHat != null ? (R.tHat - o.onset >= 0 ? "+" : "") + (R.tHat - o.onset) : "–"],
      [L("Where", "Где"), "E " + L("(the sensor)", "(датчик)"), bn ? NAMES[R.ids[bn.node]] + (R.ids[bn.node] === src ? " ✓" : " ✗") : "–", R.rank ? NAMES[R.source] + (R.source === src ? " ✓" : " ✗") : "–"],
      [L("Same seed without the event: alarm?", "Та же затравка без события: тревога?"), yes(R.free.sigma3), yes(R.free.cross), yes(R.free.chain)]
    ];
    var head = ru() ? ["", kl + " по сырому ряду", kl + " по каналам (первый)", "Конвейер"] : ["", kl + " on the raw series", kl + " per channel (first)", "Harness chain"];
    $("od-cmp").innerHTML = "<thead><tr><th>" + head.join("</th><th>") + "</th></tr></thead><tbody>" +
      rows.map(function (r) { return "<tr><td>" + r[0] + '</td><td class="mono">' + esc(r[1]) + '</td><td class="mono">' + esc(r[2]) + '</td><td class="mono">' + esc(r[3]) + "</td></tr>"; }).join("") + "</tbody>";
  }

  // ------------------------------------------------------------ step 12: Monte Carlo and the spec grid
  function renderGrid() {
    var rows = [], ok = 0, n = 0;
    [0.9, 0.95].forEach(function (q) { [0.99, 0.999].forEach(function (g) { [1, 3].forEach(function (r) {
      var sp = copySpec(); sp.q = q; sp.gamma = g; sp.r = r;
      var x = C.pipeline(state.o, sp), good = x.rank && x.source === state.o.source;
      n++; if (good) ok++;
      rows.push([fmt(q), fmt(g, 3).replace(/0+$/, ""), r, x.ev1.alarm >= 0 ? x.ev1.alarm : "–", x.tHat != null ? x.tHat : "–", x.rank ? NAMES[x.source] : "–",
        x.rank ? pct(x.rank.probabilities[x.rank.source]) : "–", good ? "✓" : "✗"]);
    }); }); });
    var head = ru() ? ["q", "γ", "r", "тревога 1-D", "t̂", "ŝ", "P(ŝ)", "верно"] : ["q", "γ", "r", "1-D alarm", "t̂", "ŝ", "P(ŝ)", "right"];
    $("od-grid").innerHTML = "<thead><tr>" + head.map(function (h, i) { return "<th" + (i > 2 ? ' class="num"' : "") + ">" + h + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return "<td" + (i > 2 ? ' class="num"' : "") + ">" + c + "</td>"; }).join("") + "</tr>"; }).join("") +
      '</tbody><tfoot><tr><td colspan="8"><b>ℛ(' + L("source right", "источник верен") + ") = " + ok + "/" + n + "</b></td></tr></tfoot>";
  }

  var mcToken = 0;
  function runMC() {
    var token = ++mcToken, jobs = [], o = state.o, spec = copySpec();
    for (var sd = 1; sd <= 20; sd++) for (var s = 0; s < 4; s++) jobs.push({ seed: 1000 + sd, source: s });
    var acc = { st: [], fu: [], em: [], fit: [], cross: [], raw: [], free: { chain: 0, s3: 0, cross: 0, n: 0 } }, i = 0, key = settingsKey();
    $("od-mc-run").disabled = true;
    function step() {
      if (token !== mcToken) return;
      var stop = Math.min(jobs.length, i + 4);
      for (; i < stop; i++) {
        var q = {}; for (var k in o) q[k] = o[k];
        q.seed = jobs[i].seed; q.source = jobs[i].source;
        var x = C.pipeline(q, spec), src = q.source, on = q.onset, dt = x.tHat != null ? Math.abs(x.tHat - on) : NaN;
        var hit = function (rk) { return rk && x.ids[rk.source] === src ? 1 : 0; };
        acc.st.push({ top: hit(x.rank), dt: dt });
        acc.fu.push({ top: hit(x.rankF), dt: dt });
        acc.em.push({ top: hit(x.rankE), dt: dt });
        acc.fit.push({ top: x.fit && x.fit.source === src ? 1 : 0, dt: x.fit ? Math.abs(x.fit.tStar - on) : NaN });
        acc.cross.push({ top: x.baseN && x.ids[x.baseN.node] === src ? 1 : 0, dt: x.baseN ? Math.abs(x.baseN.t - on) : NaN });
        acc.raw.push({ top: 0, dt: x.base1.alarm >= 0 ? Math.abs(x.base1.alarm - on) : NaN });
        if (src === 0) {
          q.magnitude = 0;
          var f = C.pipeline(q, spec);
          acc.free.n++; if (f.det.detected) acc.free.chain++; if (f.base1.alarm >= 0) acc.free.s3++; if (f.baseN) acc.free.cross++;
        }
      }
      $("od-mc-bar").style.width = (100 * i / jobs.length).toFixed(0) + "%";
      $("od-mc-status").textContent = i + " / " + jobs.length;
      if (i < jobs.length) { setTimeout(step, 0); return; }
      mc = { acc: acc, n: jobs.length, key: key };
      $("od-mc-run").disabled = false;
      renderMC();
    }
    step();
  }
  function renderMC() {
    var box = $("od-mc");
    if (!mc) { box.innerHTML = '<tbody><tr><td class="lang-note">' + L("Press the button: 20 seeds × 4 sources with the current settings (a few seconds).", "Нажмите кнопку: 20 затравок × 4 источника при текущих настройках (несколько секунд).") + "</td></tr></tbody>"; return; }
    var a = mc.acc, n = mc.n, F = a.free;
    function top(list) { return list.reduce(function (s, v) { return s + v.top; }, 0); }
    function row(name, list, free) {
      var k = top(list), ci = C.wilson(k, n), dts = list.map(function (v) { return v.dt; }).filter(isFinite);
      return "<tr><td>" + name + '</td><td class="num">' + k + "/" + n + '</td><td class="num">[' + fmt(ci[0]) + "; " + fmt(ci[1]) + ']</td><td class="num">' +
        (dts.length ? fmt(C.quantile(dts, 0.5), 0) : "–") + '</td><td class="num">' + free + "</td></tr>";
    }
    var head = ru() ? ["Метод", "Top-1", "Уилсон 95 %", "медиана |t̂ − t*|", "рядов без события с тревогой"] : ["Method", "Top-1", "Wilson 95 %", "median |t̂ − t*|", "event-free series with alarm"];
    var fc = F.chain + "/" + F.n;
    var html = "<thead><tr>" + head.map(function (h, i) { return "<th" + (i ? ' class="num"' : "") + ">" + h + "</th>"; }).join("") + "</tr></thead><tbody>" +
      row(L("Chain, rank_source + structural graph", "Конвейер, rank_source + структурный граф"), a.st, fc) +
      row(L("Chain, rank_source + functional graph", "Конвейер, rank_source + функциональный граф") + " (" + state.spec.graph.method + ")", a.fu, fc) +
      row(L("Chain, rank_source + empty graph", "Конвейер, rank_source + пустой граф"), a.em, fc) +
      row(L("Chain, arrival fit (St. 2.18.3)", "Конвейер, подгонка приходов (утв. 2.18.3)"), a.fit, fc) +
      row(L("kσ per channel, first to cross", "kσ по каналам, первый пересёкший") + " (k = " + fmt(state.spec.sigmaK, 1) + ", r = " + state.spec.sigmaR + ")", a.cross, F.cross + "/" + F.n) +
      row(L("kσ on the raw series (where = E)", "kσ по сырому ряду (где = E)") + " (k = " + fmt(state.spec.sigmaK, 1) + ", r = " + state.spec.sigmaR + ")", a.raw, F.s3 + "/" + F.n) + "</tbody>";
    var dG = (top(a.st) - top(a.em)) / n;
    html += '<tfoot><tr><td colspan="5"><b>Δ<sub>G</sub> = ' + fmt(top(a.st) / n) + " − " + fmt(top(a.em) / n) + " = " + fmt(dG) + "</b> · " +
      (Math.abs(dG) < 0.05 ? L("the graph adds nothing to “where” here: peak and latency decide (as in the dissertation)", "граф здесь ничего не добавляет к «где»: решают пик и латентность (как в диссертации)") : "") +
      " · " + L("seeds 1001–1020", "затравки 1001–1020") +
      (mc.key !== settingsKey() ? ' · <span class="od-stale">' + L("settings changed since the run — press again", "настройки изменились после запуска — запустите снова") + "</span>" : "") + "</td></tr></tfoot>";
    box.innerHTML = html;
  }
  $("od-mc-run").addEventListener("click", runMC);

  // ------------------------------------------------------------ step 13: report with number check (M6) and manifest (H10)
  function renderStep13() {
    var o = state.o, facts = {}, txt;
    function put(v, d) { var s = fmt(v, d); facts[s] = true; return s; }
    if (!R.rank) {
      txt = L("The chain stopped (" + (R.stop || "no_evt_detected") + "): no answer to “where”.", "Конвейер остановился (" + (R.stop || "no_evt_detected") + "): ответа на «где» нет.");
    } else {
      var rk = R.rank;
      txt = L("The 1-D EVT alarm at E fired at sample " + put(R.ev1.alarm, 0) + ". The structural analysis found " + put(R.ids.length, 0) + " nodes. The n-D Graph-EVT-agent puts the onset at sample " +
        put(R.tHat, 0) + " and names node " + NAMES[R.source] + " as the source with probability " + put(100 * rk.probabilities[rk.source], 1) + " %. The arrival fit names node " +
        (R.fit ? NAMES[R.fit.source] : "–") + ".",
        "Одномерная тревога EVT в E — на отсчёте " + put(R.ev1.alarm, 0) + ". Структурный анализ нашёл узлов: " + put(R.ids.length, 0) + ". n-D Graph-EVT-agent относит начало к отсчёту " +
        put(R.tHat, 0) + " и называет источником узел " + NAMES[R.source] + " с вероятностью " + put(100 * rk.probabilities[rk.source], 1) + " %. Подгонка приходов называет узел " +
        (R.fit ? NAMES[R.fit.source] : "–") + ".");
    }
    // dimension labels (1-D, n-D) and letters are not result values
    var found = (txt.replace(/\b\d-D\b/g, " ").match(/−?\d+(?:[.,]\d+)?/g) || []);
    var matched = found.filter(function (s) { return facts[s]; }).length;
    $("od-report").innerHTML = esc(txt) + '<div class="od-check ' + (matched === found.length ? "good" : "bad") + '">' +
      L("Number check (M6): ", "Сверка чисел (М6): ") + matched + "/" + found.length + L(" numbers of the text match the result object", " чисел текста совпали с объектом результата") + "</div>";
    var manifest = {
      generator: "node rhythms + stochastic + Hurst burst along first-arrival paths (onedim-core.js)",
      params: { n: o.n, seed: o.seed, sigma: o.sigma, hurst: o.hurst, magnitude: o.magnitude, onset: o.onset, duration: o.duration, envelope: o.envelope,
        source: NAMES[o.source], background: [0, o.background], micro_rate: +o.microRate.toFixed(4), micro_amp: o.microAmp, hidden_rhythm: o.hidden >= 0 ? NAMES[o.hidden] : null },
      dictionary: { freqs: o.freqs, edges: C.EDGES.map(function (e) { return NAMES[e[0]] + "-" + NAMES[e[1]] + " tau=" + e[2] + " w=" + e[3]; }) },
      spec: R.spec,
      series_fnv1a: C.hashSeries(R.sig.values),
      structural: { nodes: R.ids.map(function (i) { return NAMES[i]; }), peaks: R.sn.peaks.map(function (pk) { return +pk.f.toFixed(4); }),
        functional_edges: R.fgEdges.map(function (e) { return NAMES[e.i] + "-" + NAMES[e.j]; }), gate_unresolved_1d: R.gate1.length, gate_unresolved_nd: R.gateN.length },
      result: { alarm_1d: R.ev1.alarm, t_hat: R.tHat, source_hat: R.rank ? NAMES[R.source] : null,
        p_source: R.rank ? R.rank.probabilities.map(function (p) { return +p.toFixed(4); }) : null,
        arrival_fit: R.fit ? { source: NAMES[R.fit.source], t_star: R.fit.tStar } : null, sigma3_alarm: R.base1.alarm, stop: R.stop }
    };
    $("od-manifest").textContent = JSON.stringify(manifest, null, 2);
  }

  // ------------------------------------------------------------ coverage table
  var COVER = [
    ["M1", ["ARL₀, run rule, clusters of exceedances", "ARL₀, правило серии, кластеры превышений"], "4, 8, 10", 1],
    ["M2", ["identifiability: one channel is not enough", "идентифицируемость: одного канала мало"], "4, 5, 9", 1],
    ["M3", ["inflation without grouping", "завышение без группировки"], "—", 0, ["no model is trained here: nothing to split", "здесь нет обучения: нечего разбивать"]],
    ["M4", ["value of the graph Δ_G", "ценность графа Δ_G"], "7, 11", 1],
    ["M5", ["estimates kept side by side", "оценки сохраняются рядом"], "9", 1],
    ["M6", ["numerical fidelity of the text", "числовая верность текста"], "12", 1],
    ["M7", ["episode labelling", "разметка эпизодов"], "—", 0, ["one event per series", "одно событие на ряд"]],
    ["M8", ["graph perturbations", "возмущения графа"], "7", 1, ["methods, parameters and record length change the estimated graph", "методы, параметры и длина записи меняют оценённый граф"]],
    ["M9", ["robustness to the specification", "устойчивость к спецификации"], "11", 1],
    ["H0", ["input, rhythms, wavelet envelopes, DFA", "вход, ритмы, вейвлет-огибающие, DFA"], "2, 4, 5, 6", 1],
    ["H1", ["when: POT/GPD, 1-D and n-D", "когда: POT/GPD, 1-D и n-D"], "4, 8", 1],
    ["H2", ["graph hypotheses: structural, functional (6 methods)", "гипотезы графа: структурная, функциональная (6 методов)"], "5, 7", 1],
    ["H3", ["where: rank_source, arrival fit", "где: rank_source, подгонка приходов"], "9", 1],
    ["H4", ["verification", "верификация"], "11", 1],
    ["H5", ["integration of layers", "интеграция слоёв"], "—", 0, ["one modality", "одна модальность"]],
    ["H6", ["positive control", "положительный контроль"], "1, 11", 1],
    ["H7", ["orchestrator: route 1-D → structural → n-D", "оркестратор: маршрут 1-D → структура → n-D"], "4", 1],
    ["H8", ["episode labelling", "разметка эпизодов"], "—", 0, ["one event per series", "одно событие на ряд"]],
    ["H9", ["reviewer text", "текст рецензента"], "12", 1, ["template text, no LLM", "шаблонный текст, без LLM"]],
    ["H10", ["reproducibility, manifest", "воспроизводимость, manifest"], "12", 1]
  ];
  function renderCoverage() {
    var head = ru() ? ["", "Что", "Шаг", "Примечание"] : ["", "What", "Step", "Note"];
    $("od-coverage").innerHTML = "<thead><tr><th>" + head.join("</th><th>") + "</th></tr></thead><tbody>" + COVER.map(function (c) {
      return '<tr><td class="mono">' + c[0] + "</td><td>" + c[1][ru() ? 1 : 0] + "</td><td>" + (c[3] ? c[2] : '<span class="muted">' + c[2] + "</span>") + "</td><td>" + (c[4] ? c[4][ru() ? 1 : 0] : "") + "</td></tr>";
    }).join("") + "</tbody>";
  }

  // ------------------------------------------------------------ controls
  var GSLIDERS = { threshold: 2, maxLag: 0, archive: 0, exAmp: 2, exRate: 2 };
  var GSEGS = [["od-gm", "method", String], ["od-grule", "rule", String], ["od-gk", "k", Number], ["od-gstep", "lagStep", Number], ["od-gorder", "order", Number]];
  Object.keys(GSLIDERS).forEach(function (k) {
    $("od-g-" + k).addEventListener("input", function () { state.spec.graph[k] = Number(this.value); $("od-gv-" + k).textContent = fmt(state.spec.graph[k], GSLIDERS[k]); schedule(); });
  });
  GSEGS.forEach(function (g) {
    document.querySelectorAll("#" + g[0] + " [data-v]").forEach(function (b) { b.addEventListener("click", function () { state.spec.graph[g[1]] = g[2](b.getAttribute("data-v")); refresh(); }); });
  });
  $("od-gprune").addEventListener("change", function () { state.spec.graph.prune = this.checked; refresh(); });
  $("od-gsurr").addEventListener("change", function () { state.spec.graph.surrogates = this.checked; refresh(); });
  document.querySelectorAll("#od-xwin [data-v]").forEach(function (b) { b.addEventListener("click", function () { state.xwin = b.getAttribute("data-v"); syncControls(); renderStep3(); }); });
  var SLIDERS = ["onset", "duration", "hurst", "magnitude"];
  function sliderText(k, v) { return k === "hurst" ? fmt(v) : k === "magnitude" ? fmt(v, 1) : String(v); }
  function syncControls() {
    var o = state.o;
    SLIDERS.forEach(function (k) { $("od-" + k).value = o[k]; $("od-v-" + k).textContent = sliderText(k, o[k]); });
    $("od-v-seed").textContent = String(o.seed);
    o.freqs.forEach(function (f, j) { var inp = $("od-f" + j); if (inp) { inp.value = f; $("od-fv" + j).textContent = fmt(f, 2); } });
    var press = function (sel, attr, val) {
      document.querySelectorAll(sel).forEach(function (b) { b.setAttribute("aria-pressed", String(String(b.getAttribute(attr)) === String(val))); });
    };
    press("#od-source [data-src]", "data-src", o.source);
    press("#od-envelope [data-env]", "data-env", o.envelope);
    press("#od-hidden [data-v]", "data-v", o.hidden);
    press("#od-xwin [data-v]", "data-v", state.xwin);
    var g = state.spec.graph;
    Object.keys(GSLIDERS).forEach(function (k) { $("od-g-" + k).value = g[k]; $("od-gv-" + k).textContent = fmt(g[k], GSLIDERS[k]); });
    GSEGS.forEach(function (s2) { press("#" + s2[0] + " [data-v]", "data-v", g[s2[1]]); });
    $("od-gprune").checked = !!g.prune; $("od-gsurr").checked = !!g.surrogates;
    [["od-q", "q"], ["od-gamma", "gamma"], ["od-r", "r"], ["od-sk", "sigmaK"], ["od-sr", "sigmaR"]].forEach(function (p) {
      document.querySelectorAll("#" + p[0] + " [data-v]").forEach(function (b) { b.setAttribute("aria-pressed", String(Number(b.getAttribute("data-v")) === state.spec[p[1]])); });
    });
  }
  function setSource(i) { state.o.source = i; state.anim = 0; stopAnim(); refresh(); }

  SLIDERS.forEach(function (k) {
    $("od-" + k).addEventListener("input", function () { state.o[k] = Number(this.value); $("od-v-" + k).textContent = sliderText(k, state.o[k]); schedule(); });
  });
  document.querySelectorAll("#od-source [data-src]").forEach(function (b) { b.addEventListener("click", function () { setSource(Number(b.getAttribute("data-src"))); }); });
  document.querySelectorAll("#od-envelope [data-env]").forEach(function (b) { b.addEventListener("click", function () { state.o.envelope = b.getAttribute("data-env"); refresh(); }); });
  document.querySelectorAll("#od-hidden [data-v]").forEach(function (b) { b.addEventListener("click", function () { state.o.hidden = Number(b.getAttribute("data-v")); refresh(); }); });
  [["od-q", "q"], ["od-gamma", "gamma"], ["od-r", "r"], ["od-sk", "sigmaK"], ["od-sr", "sigmaR"]].forEach(function (p) {
    document.querySelectorAll("#" + p[0] + " [data-v]").forEach(function (b) { b.addEventListener("click", function () { state.spec[p[1]] = Number(b.getAttribute("data-v")); refresh(); }); });
  });
  $("od-reseed").addEventListener("click", function () { state.o.seed += 1; refresh(); });
  $("od-reset").addEventListener("click", function () { state.o = defaults(); state.spec = defaultSpec(); state.anim = 0; buildFreqs(); refresh(); });

  var timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(refresh, 60); }
  function refresh() { syncControls(); compute(); renderAll(); }
  function renderAll() {
    renderStep1(); renderStep2(); renderStep3(); renderStep4(); renderStep6(); renderStep7(); renderStep8(); renderStep9();
    renderStep10(); renderStep11(); renderARL(); renderNodeLanes(); renderMC(); renderStep13(); renderCoverage();
    clearTimeout(renderAll.grid);
    renderAll.grid = setTimeout(function () { renderMethods(); renderGrid(); }, 40);
  }

  // Language switch (site.js dispatches eld:lang) and resize redraw the same result.
  document.addEventListener("eld:lang", function () { if (R) { syncControls(); renderAll(); playLabel(!!raf); } });
  var rw = null, lastW = 0;
  window.addEventListener("resize", function () {
    clearTimeout(rw);
    rw = setTimeout(function () {
      var w = $("od-step1").clientWidth; if (Math.abs(w - lastW) < 4) return; lastW = w;
      Object.keys(P).forEach(function (k) { P[k].redraw(); }); lanes.concat(nodeLanes).forEach(function (p) { p.redraw(); });
    }, 120);
  });
  refresh();
  lastW = $("od-step1").clientWidth;
})();
