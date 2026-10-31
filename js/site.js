// Language and theme switches, and the ring-propagation demo of § 7.1.2.
// The demo draws the benchmark's ground truth as constructed: pulse in channel_00 from sample T0,
// duration DUR, delay DELAY and attenuation ATT per ring step. Only the sin² envelope is shown.

(function () {
  "use strict";

  var root = document.documentElement;
  var SVGNS = "http://www.w3.org/2000/svg";
  var TITLES = { en: "Interactive Labs · Graph-EVT", ru: "Интерактивные лаборатории · Graph-EVT" };

  function lang() { return root.getAttribute("data-lang") === "ru" ? "ru" : "en"; }
  function store(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }

  // ------------------------------------------------------------ language
  var listeners = [];
  function setLang(next, save) {
    root.setAttribute("data-lang", next);
    root.setAttribute("lang", next);
    document.title = TITLES[next];
    document.querySelectorAll("[data-set-lang]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-set-lang") === next));
    });
    if (save) {
      store("eld-lang", next);
      try {
        var url = new URL(location.href);
        if (url.searchParams.has("lang")) { url.searchParams.set("lang", next); history.replaceState(null, "", url); }
      } catch (e) {}
    }
    listeners.forEach(function (fn) { fn(); });
  }
  document.querySelectorAll("[data-set-lang]").forEach(function (b) {
    b.addEventListener("click", function () { setLang(b.getAttribute("data-set-lang"), true); });
  });

  // ------------------------------------------------------------ theme
  var themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var current = root.getAttribute("data-theme");
      if (current !== "light" && current !== "dark") {
        current = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      var next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      store("eld-theme", next);
    });
  }

  function el(name, attrs, parent) {
    var node = document.createElementNS(SVGNS, name);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  // ------------------------------------------------------------ thumbnail of the Kuramoto card
  var kura = document.getElementById("kura-dots");
  if (kura) {
    for (var i = 0; i < 12; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 6;
      el("circle", {
        cx: (150 + 40 * Math.cos(a)).toFixed(1), cy: (58 + 40 * Math.sin(a)).toFixed(1), r: i === 0 ? 7 : 5.5,
        style: i === 0 ? "fill:var(--series-2)" : "fill:var(--series-1);fill-opacity:" + (1 - 0.12 * Math.min(i, 12 - i))
      }, kura);
    }
  }

  // ------------------------------------------------------------ benchmark ground truth
  var P = 12, T0 = 932, DUR = 75, DELAY = 5, ATT = 0.65;
  var T_MIN = 900, T_MAX = 1060;
  var ALARMS = [
    { t: T0, label: "t*", anchor: "middle", dx: 0 },
    { t: 949, label: "r = 1", anchor: "end", dx: -3 },
    { t: 959, label: "r = 2", anchor: "start", dx: 3 }
  ];
  var MAX_D = P / 2;

  function ringDist(j) { return Math.min(j, P - j); }
  function arrival(d) { return T0 + DELAY * d; }
  function envelope(d, t) {
    var a = arrival(d);
    if (t < a || t >= a + DUR) return 0;
    var s = Math.sin(Math.PI * (t - a) / DUR);
    return Math.pow(ATT, d) * s * s;
  }
  function chName(j) { return "channel_" + (j < 10 ? "0" : "") + j; }
  function pct(v) {
    var s = (100 * v).toFixed(v < 0.1 ? 1 : 0);
    return (lang() === "ru" ? s.replace(".", ",") : s) + "\u202f%";
  }
  function fmt(v) { return lang() === "ru" ? v.toFixed(2).replace(".", ",") : v.toFixed(2); }
  function seriesStyle(d) {
    return d === 0
      ? { color: "var(--series-2)", opacity: 1 }
      : { color: "var(--series-1)", opacity: (1 - 0.11 * (d - 1)).toFixed(2) };
  }

  var ring = document.getElementById("ring");
  var chart = document.getElementById("env-chart");
  if (!ring || !chart) { setLang(lang(), false); return; }

  var slider = document.getElementById("t-slider");
  var readout = document.getElementById("readout");
  var playBtn = document.getElementById("play");
  var tip = document.getElementById("env-tip");
  var t = Number(slider.value);

  // ---- ring
  var CX = 160, CY = 160, R = 112, NODE_R = 17;
  var nodes = [];
  function pos(j, radius) {
    var a = -Math.PI / 2 + j * 2 * Math.PI / P;
    return [CX + radius * Math.cos(a), CY + radius * Math.sin(a)];
  }
  for (var j = 0; j < P; j++) {
    var p0 = pos(j, R), p1 = pos((j + 1) % P, R);
    el("line", { class: "ring-edge", x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1] }, ring);
  }
  for (j = 0; j < P; j++) {
    var p = pos(j, R), lp = pos(j, R + 31);
    var g = el("g", {}, ring);
    el("circle", { cx: p[0], cy: p[1], r: NODE_R, style: "fill:var(--surface-2)" }, g);
    var fill = el("circle", { cx: p[0], cy: p[1], r: NODE_R, class: "ring-node",
      style: "fill:" + (j === 0 ? "var(--series-2)" : "var(--series-1)") }, g);
    var outline = el("circle", { cx: p[0], cy: p[1], r: NODE_R + 4, fill: "none", style: "stroke:var(--ink);stroke-width:1.5" }, g);
    var label = el("text", { class: "ring-label", x: lp[0], y: lp[1] }, g);
    label.textContent = (j < 10 ? "0" : "") + j;
    var title = el("title", {}, g);
    nodes.push({ fill: fill, outline: outline, title: title, d: ringDist(j) });
  }
  var centerMain = el("text", { class: "ring-center", x: CX, y: CY - 4 }, ring);
  var centerSub = el("text", { class: "ring-center sub", x: CX, y: CY + 14 }, ring);

  // ---- chart
  var W = 640, H = 300, M = { l: 58, r: 22, t: 30, b: 40 };
  var IW = W - M.l - M.r, IH = H - M.t - M.b;
  function sx(v) { return M.l + (v - T_MIN) / (T_MAX - T_MIN) * IW; }
  function sy(v) { return M.t + (1 - v) * IH; }

  var gridG = el("g", { class: "grid" }, chart);
  var axisG = el("g", { class: "axis" }, chart);
  [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
    el("line", { x1: M.l, x2: W - M.r, y1: sy(v), y2: sy(v) }, gridG);
    var tx = el("text", { x: M.l - 8, y: sy(v) + 4, "text-anchor": "end" }, axisG);
    tx.textContent = (v * 100) + "\u202f%";
  });
  for (var x = T_MIN; x <= T_MAX; x += 20) {
    var tl = el("text", { x: sx(x), y: H - M.b + 16, "text-anchor": "middle" }, axisG);
    tl.textContent = x;
  }
  var xTitle = el("text", { class: "axis-title", x: W - M.r, y: H - 6, "text-anchor": "end" }, chart);

  ALARMS.forEach(function (al) {
    el("line", { class: "rule", x1: sx(al.t), x2: sx(al.t), y1: M.t - 4, y2: H - M.b }, chart);
    var rl = el("text", { class: "rule-label", x: sx(al.t) + al.dx, y: M.t - 10, "text-anchor": al.anchor }, chart);
    rl.textContent = al.label;
  });

  for (var d = MAX_D; d >= 0; d--) {
    var pts = [];
    for (var s = T_MIN; s <= T_MAX; s++) pts.push(sx(s).toFixed(1) + "," + sy(envelope(d, s)).toFixed(1));
    var st = seriesStyle(d);
    el("polyline", { class: "line", points: pts.join(" "), style: "stroke:" + st.color, "stroke-opacity": st.opacity }, chart);
  }
  var hoverLine = el("line", { class: "hover-line", y1: M.t, y2: H - M.b, visibility: "hidden" }, chart);
  var cursor = el("line", { class: "cursor", y1: M.t, y2: H - M.b }, chart);
  var hit = el("rect", { x: M.l, y: M.t - 20, width: IW, height: IH + 20, fill: "transparent", style: "cursor:crosshair" }, chart);

  function channelsAt(dist) {
    var out = [];
    for (var k = 0; k < P; k++) if (ringDist(k) === dist) out.push((k < 10 ? "0" : "") + k);
    return out.join(", ");
  }

  function renderLegend() {
    var box = document.getElementById("env-legend");
    var ru = lang() === "ru";
    var html = "";
    for (var dd = 0; dd <= MAX_D; dd++) {
      var st2 = seriesStyle(dd);
      var name = dd === 0 ? (ru ? "d = 0 · источник" : "d = 0 · source") : "d = " + dd;
      html += '<span class="key"><span class="swatch" style="background:' + st2.color + ";opacity:" + st2.opacity + '"></span>' + name + "</span>";
    }
    box.innerHTML = html;
  }

  function renderTable() {
    var ru = lang() === "ru";
    var head = ru
      ? ["Расстояние d", "Каналы", "Приход", "Конец окна", "Пик огибающей"]
      : ["Distance d", "Channels", "Arrival", "Window end", "Envelope peak"];
    var html = "<thead><tr><th>" + head[0] + "</th><th>" + head[1] + '</th><th class="num">' + head[2] +
      '</th><th class="num">' + head[3] + '</th><th class="num">' + head[4] + "</th></tr></thead><tbody>";
    for (var dd = 0; dd <= MAX_D; dd++) {
      html += "<tr><td>" + dd + "</td><td class=\"mono\">" + channelsAt(dd) + '</td><td class="num">' + arrival(dd) +
        '</td><td class="num">' + (arrival(dd) + DUR - 1) + '</td><td class="num">' + pct(Math.pow(ATT, dd)) + "</td></tr>";
    }
    document.getElementById("env-table").innerHTML = html + "</tbody>";
  }

  function render() {
    var ru = lang() === "ru";
    var reached = 0, front = -1, best = 0, bestCh = [];
    nodes.forEach(function (n, k) {
      var v = envelope(n.d, t);
      var on = t >= arrival(n.d) && t < arrival(n.d) + DUR;
      n.fill.setAttribute("fill-opacity", (0.06 + 0.94 * v).toFixed(3));
      n.outline.setAttribute("visibility", on ? "visible" : "hidden");
      n.title.textContent = chName(k) + " · d = " + n.d + " · " + (ru ? "огибающая " : "envelope ") + fmt(v);
      if (t >= arrival(n.d)) { reached++; front = Math.max(front, n.d); }
      if (v > best + 1e-9) { best = v; bestCh = [chName(k)]; } else if (v > 0 && Math.abs(v - best) <= 1e-9) bestCh.push(chName(k));
    });
    var dt = t - T0;
    centerMain.textContent = "t = " + t;
    centerSub.textContent = "t − t* = " + (dt > 0 ? "+" : "") + dt;
    cursor.setAttribute("x1", sx(t)); cursor.setAttribute("x2", sx(t));
    xTitle.textContent = ru ? "отсчёт t" : "sample t";

    var parts = ["<b>t = " + t + "</b>"];
    if (front < 0) {
      parts.push(ru ? "события ещё нет — фон" : "no event yet — background");
    } else {
      parts.push(ru
        ? "импульс дошёл до <b>" + reached + "</b> из " + P + " каналов (d ≤ " + front + ")"
        : "pulse has reached <b>" + reached + "</b> of " + P + " channels (d ≤ " + front + ")");
      if (best > 0) {
        var isSource = bestCh.length === 1 && bestCh[0] === "channel_00";
        parts.push((ru ? "наибольшая огибающая: " : "largest envelope: ") + "<code>" + bestCh.join("</code>, <code>") + "</code>" +
          (isSource ? (ru ? " (источник)" : " (source)") : (ru ? " — уже не источник" : " — no longer the source")));
      }
    }
    readout.innerHTML = parts.join(" · ");
  }

  function setT(v) {
    t = Math.max(T_MIN, Math.min(T_MAX, Math.round(v)));
    slider.value = t;
    render();
  }

  slider.addEventListener("input", function () { stop(); setT(Number(slider.value)); });
  document.querySelectorAll("[data-jump]").forEach(function (b) {
    b.addEventListener("click", function () { stop(); setT(Number(b.getAttribute("data-jump"))); });
  });

  // ---- play
  var raf = null, last = 0, acc = 0, SPEED = 24; // samples per second
  function frame(now) {
    if (!last) last = now;
    acc += (now - last) / 1000 * SPEED; last = now;
    if (acc >= 1) { var steps = Math.floor(acc); acc -= steps; setT(t + steps); }
    if (t >= T_MAX) { stop(); return; }
    raf = requestAnimationFrame(frame);
  }
  function setPlayLabel(playing) {
    playBtn.innerHTML = playing
      ? '<span lang="en">❚❚ Pause</span><span lang="ru">❚❚ Пауза</span>'
      : '<span lang="en">▶ Play</span><span lang="ru">▶ Пуск</span>';
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null; setPlayLabel(false);
  }
  playBtn.addEventListener("click", function () {
    if (raf) { stop(); return; }
    if (t >= T_MAX) setT(T_MIN);
    last = 0; acc = 0; setPlayLabel(true);
    raf = requestAnimationFrame(frame);
  });

  // ---- hover tooltip and click on the chart
  function eventT(ev) {
    var box = chart.getBoundingClientRect();
    var vx = (ev.clientX - box.left) / box.width * W;
    return Math.max(T_MIN, Math.min(T_MAX, Math.round(T_MIN + (vx - M.l) / IW * (T_MAX - T_MIN))));
  }
  hit.addEventListener("pointermove", function (ev) {
    var ht = eventT(ev), ru = lang() === "ru";
    hoverLine.setAttribute("x1", sx(ht)); hoverLine.setAttribute("x2", sx(ht));
    hoverLine.setAttribute("visibility", "visible");
    var html = '<div class="t">t = ' + ht + " (t − t* = " + (ht - T0 > 0 ? "+" : "") + (ht - T0) + ")</div>";
    for (var dd = 0; dd <= MAX_D; dd++) {
      var st3 = seriesStyle(dd);
      html += '<div class="row"><span><span class="swatch" style="background:' + st3.color + ";opacity:" + st3.opacity + '"></span>d = ' + dd +
        (dd === 0 ? (ru ? " · источник" : " · source") : "") + "</span><span class=\"mono\">" + fmt(envelope(dd, ht)) + "</span></div>";
    }
    tip.innerHTML = html;
    tip.hidden = false;
    var box = chart.getBoundingClientRect();
    var px = (sx(ht) / W) * box.width;
    var left = px + 14;
    if (left + tip.offsetWidth > box.width) left = px - tip.offsetWidth - 14;
    tip.style.left = Math.max(0, left) + "px";
    tip.style.top = "8px";
  });
  hit.addEventListener("pointerleave", function () {
    hoverLine.setAttribute("visibility", "hidden");
    tip.hidden = true;
  });
  hit.addEventListener("click", function (ev) { stop(); setT(eventT(ev)); });

  listeners.push(function () { renderLegend(); renderTable(); render(); });
  setLang(lang(), false);
})();
