// Section 4 (Position 2): the objects – events multigraph with a traced decision, and the value of the edges Δ_G on the
// chains-and-circles example of § 4.8. Numbers come from js/p2-core.js; this file only draws them.

(function () {
  "use strict";

  var C = window.P2Core;
  var root = document.documentElement;
  var SVGNS = "http://www.w3.org/2000/svg";
  if (!C || !document.getElementById("p2")) return;

  function $(id) { return document.getElementById(id); }
  function ru() { return root.getAttribute("data-lang") === "ru"; }
  function L(en, r) { return ru() ? r : en; }
  function fmt(v, d) {
    if (v == null || !isFinite(v)) return "–";
    var s = Number(v).toFixed(d == null ? 3 : d);
    return ru() ? s.replace(".", ",").replace("-", "−") : s.replace("-", "−");
  }
  function sgn(v, d) { return (v > 0 ? "+" : "") + fmt(v, d); }
  function el(name, attrs, parent) {
    var node = document.createElementNS(SVGNS, name);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }
  function css(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
  function press(sel, val) {
    document.querySelectorAll(sel + " [data-v]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === String(val))); });
  }

  // ============================================================ 4.1 objects – events multigraph
  var G = C.eventGraph();
  var INFO = {
    "P-01": ["patient · age 60–69 · M", "пациент · 60–69 лет · М"], "P-02": ["patient · age 50–59 · F", "пациент · 50–59 лет · Ж"],
    "P-03": ["patient · age 70–79 · F", "пациент · 70–79 лет · Ж"], "P-04": ["patient · age 40–49 · M", "пациент · 40–49 лет · М"],
    "S-ECG": ["study · 12-lead ECG", "исследование · ЭКГ в 12 отведениях"], "S-ECHO": ["study · echocardiography", "исследование · эхокардиография"]
  };
  var eg = { sel: 1, K: 2 };
  var POS = G.nodes.map(function (n) {
    var objs = G.nodes.filter(function (m) { return m.side === n.side; }), i = objs.indexOf(n);
    return n.side === "obj" ? [70, 30 + i * (240 / (objs.length - 1))] : [290, 40 + i * (220 / (objs.length - 1))];
  });

  function renderEG() {
    var svg = $("p2-eg"), rf = C.receptive(G, eg.sel, eg.K), on = {};
    rf.edges.forEach(function (e) { on[e] = 1; });
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    // parallel edges of one (u, v) pair are bent apart
    var seen = {};
    G.edges.forEach(function (e) {
      var key = e.u + "-" + e.v, m = seen[key] = (seen[key] || 0) + 1;
      var a = POS[e.u], b = POS[e.v], cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2 + (m - 1) * 40;
      var path = el("path", { d: "M" + a[0] + "," + a[1] + " Q" + cx + "," + cy + " " + b[0] + "," + b[1], class: "p2-e" + (on[e.id] ? " on" : "") }, svg);
      el("title", {}, path).textContent = G.nodes[e.u].code + " – " + G.nodes[e.v].code + " · τ = " + e.tau + " · ω = " + e.omega;
      if (on[e.id]) {            // label at the curve's midpoint B(½) = ¼a + ½c + ¼b
        var t = el("text", { x: 0.25 * a[0] + 0.5 * cx + 0.25 * b[0], y: 0.25 * a[1] + 0.5 * cy + 0.25 * b[1] - 3, class: "p2-e-label" }, svg);
        t.textContent = e.tau.slice(5);
      }
    });
    G.nodes.forEach(function (n, i) {
      var g = el("g", { class: "p2-n " + n.side + (rf.dist[i] === Infinity ? " off" : ""), tabindex: 0, role: "button", "aria-label": n.code }, svg);
      if (n.side === "obj") el("circle", { cx: POS[i][0], cy: POS[i][1], r: 15 }, g);
      else el("rect", { x: POS[i][0] - 15, y: POS[i][1] - 12, width: 30, height: 24, rx: 5 }, g);
      el("text", { x: POS[i][0] + (n.side === "obj" ? -36 : 40), y: POS[i][1] }, g).textContent = n.code;
      if (rf.dist[i] !== Infinity && i !== eg.sel) el("text", { x: POS[i][0], y: POS[i][1], class: "p2-hop", style: "fill:#fff" }, g).textContent = rf.dist[i];
      if (i === eg.sel) el(n.side === "obj" ? "circle" : "rect", n.side === "obj" ? { cx: POS[i][0], cy: POS[i][1], r: 20, class: "p2-sel" } : { x: POS[i][0] - 20, y: POS[i][1] - 17, width: 40, height: 34, rx: 7, class: "p2-sel" }, svg);
      var pick = function () { eg.sel = i; renderEG(); };
      g.addEventListener("click", pick);
      g.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } });
    });
    $("p2-eg-legend").innerHTML = '<span class="key"><span class="swatch dot" style="background:var(--series-1)"></span>' + L("object", "объект") + "</span>" +
      '<span class="key"><span class="swatch dot" style="background:var(--series-7);border-radius:2px"></span>' + L("event", "событие") + "</span>" +
      '<span class="key">' + L("number in a vertex = hops from the chosen vertex", "число в вершине — шагов от выбранной") + "</span>";

    var inTrace = G.nodes.filter(function (n, i) { return rf.dist[i] !== Infinity; });
    var keys = function (i) { return G.adj[i].map(function (eid) { return G.edges[eid].tau.slice(5); }).join(", "); };
    $("p2-index").innerHTML = "<thead><tr><th>" + L("code", "код") + "</th><th>" + L("vertex", "вершина") + "</th><th>" + L("edge keys τ", "ключи рёбер τ") + "</th></tr></thead><tbody>" +
      G.nodes.map(function (n, i) { return '<tr class="' + (rf.dist[i] === Infinity ? "p2-dim" : "") + '"><td class="mono">' + n.code + '</td><td class="mono">v' + i + "</td><td>" + keys(i) + "</td></tr>"; }).join("") + "</tbody>";
    $("p2-info").innerHTML = "<thead><tr><th>" + L("code", "код") + "</th><th>" + L("attributes", "атрибуты") + "</th></tr></thead><tbody>" +
      inTrace.map(function (n) {
        var a = INFO[n.code] ? INFO[n.code][ru() ? 1 : 0] : L("visit · conclusions ", "визит · заключения ") + G.adj[n.id].map(function (eid) { return G.edges[eid].omega; }).filter(function (v, k, arr) { return arr.indexOf(v) === k; }).join(", ");
        return '<tr><td class="mono">' + n.code + "</td><td>" + a + "</td></tr>";
      }).join("") + "</tbody>";

    var objs = inTrace.filter(function (n) { return n.side === "obj"; }).map(function (n) { return n.code; });
    var evs = inTrace.filter(function (n) { return n.side === "ev"; }).map(function (n) { return n.code; });
    var s = G.nodes[eg.sel];
    $("p2-trace").innerHTML = L("<b>Trace of the decision for " + s.code + "</b> with K = " + eg.K + ": " + objs.length + " objects (" + objs.join(", ") + "), " +
      evs.length + " events (" + (evs.join(", ") || "–") + ") and " + rf.edges.length + " of " + G.edges.length + " edges. Nothing outside this part of the graph can change ŷ; " +
      "the information part was read for " + inTrace.length + " of " + G.nodes.length + " vertices.",
      "<b>Трасса решения для " + s.code + "</b> при K = " + eg.K + ": объектов " + objs.length + " (" + objs.join(", ") + "), событий " +
      evs.length + " (" + (evs.join(", ") || "–") + ") и рёбер " + rf.edges.length + " из " + G.edges.length + ". Ничто вне этой части графа не может изменить ŷ; " +
      "информационная часть прочитана для " + inTrace.length + " из " + G.nodes.length + " вершин.");
    $("p2-record").textContent = JSON.stringify({
      vertex: s.code, model: "GNN, " + eg.K + (eg.K === 1 ? " layer" : " layers"), decision: "ŷ = f_θ(X, A)[" + s.code + "]",
      trace: { objects: objs, events: evs, edges: rf.edges.map(function (eid) { var e = G.edges[eid]; return [G.nodes[e.u].code, G.nodes[e.v].code, e.tau, e.omega]; }) },
      information_part_read: inTrace.map(function (n) { return n.code; }),
      edge_check: "Δ_G = M(f(X, A)) − M(f(X, ∅)), measured separately (§ 4.7)"
    }, null, 1);
    press("#p2-K", eg.K);
  }
  document.querySelectorAll("#p2-K [data-v]").forEach(function (b) { b.addEventListener("click", function () { eg.K = Number(b.getAttribute("data-v")); renderEG(); }); });

  // ============================================================ 4.2 the value of the edges on chains and circles
  var st = { ds: "chains", k: 2, f: "component", leak: false, pick: -1 };
  var DATA = null, CACHE = {}, A = null, CURVE = null;

  function prep(name) {
    if (!CACHE[name]) { var c = C.prepare(DATA[name]); c.consts = C.chainConstants(DATA[name], c); CACHE[name] = c; }
    return CACHE[name];
  }
  // M(f(X, ∅)): with no edges every component is a single point; smoothing with Â = I leaves the local score unchanged.
  function withEmpty(a) { return st.f === "component" ? a.f1.empty : a.f1.local; }
  function withGraph(a) { return st.f === "component" ? a.f1.component : a.f1.smooth; }

  function compute() {
    var d = DATA[st.ds], c = prep(st.ds);
    A = C.analyse(d, c, { k: st.k, K: 3, leak: st.leak });
    CURVE = [];
    for (var k = 1; k <= C.KMAX; k++) { var a = k === st.k ? A : C.analyse(d, c, { k: k, K: 3, leak: st.leak }); CURVE.push({ k: k, g: withGraph(a), e: withEmpty(a) }); }
  }

  // ------------------------------------------------------------ canvas
  var canvas = $("p2-canvas"), view = null;
  function drawCanvas() {
    var d = DATA[st.ds], n = d.x.length, box = canvas.parentNode, w = box.clientWidth, h = Math.round(w * 0.78);
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, i;
    for (i = 0; i < n; i++) { x0 = Math.min(x0, d.x[i]); x1 = Math.max(x1, d.x[i]); y0 = Math.min(y0, d.y[i]); y1 = Math.max(y1, d.y[i]); }
    var pad = 10, sc = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad) / (y1 - y0));
    var ox = (w - sc * (x1 - x0)) / 2, oy = (h - sc * (y1 - y0)) / 2;
    view = { sx: function (v) { return ox + (v - x0) * sc; }, sy: function (v) { return oy + (v - y0) * sc; }, sc: sc };   // pixel y grows downwards, as in the notebook
    var red = css("--series-2"), green = css("--series-3"), axis = css("--axis"), bad = css("--bad"), ink = css("--ink");
    var comp = A.comp.label, pc = st.pick >= 0 ? comp[st.pick] : -1;
    // edges: same colour — grey, across colours — red (they break homophily)
    ctx.lineWidth = 1;
    [false, true].forEach(function (cross) {
      ctx.beginPath();
      for (var a = 0; a < n; a++) for (var t = 0; t < A.adj[a].length; t++) {
        var b = A.adj[a][t]; if (b < a || (d.red[a] !== d.red[b]) !== cross) continue;
        ctx.moveTo(view.sx(d.x[a]), view.sy(d.y[a])); ctx.lineTo(view.sx(d.x[b]), view.sy(d.y[b]));
      }
      ctx.strokeStyle = cross ? bad : axis; ctx.globalAlpha = cross ? 0.8 : 0.9; ctx.stroke();
    });
    ctx.globalAlpha = 1;
    if (pc >= 0) {
      ctx.beginPath();
      for (var a2 = 0; a2 < n; a2++) if (comp[a2] === pc) for (var t2 = 0; t2 < A.adj[a2].length; t2++) {
        var b2 = A.adj[a2][t2]; if (b2 < a2) continue;
        ctx.moveTo(view.sx(d.x[a2]), view.sy(d.y[a2])); ctx.lineTo(view.sx(d.x[b2]), view.sy(d.y[b2]));
      }
      ctx.strokeStyle = ink; ctx.lineWidth = 2.2; ctx.stroke(); ctx.lineWidth = 1;
    }
    var flag = A.flag[st.f === "component" ? "component" : "smooth"], r = Math.max(1.6, Math.min(2.6, sc * 4));
    for (i = 0; i < n; i++) {
      ctx.beginPath(); ctx.arc(view.sx(d.x[i]), view.sy(d.y[i]), r, 0, 2 * Math.PI);
      ctx.fillStyle = d.red[i] ? red : green; ctx.fill();
      if (flag[i] > 0) { ctx.globalAlpha = flag[i]; ctx.lineWidth = 1.1; ctx.strokeStyle = ink; ctx.beginPath(); ctx.arc(view.sx(d.x[i]), view.sy(d.y[i]), r + 1.8, 0, 2 * Math.PI); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    if (st.pick >= 0) { ctx.beginPath(); ctx.arc(view.sx(d.x[st.pick]), view.sy(d.y[st.pick]), r + 5, 0, 2 * Math.PI); ctx.lineWidth = 2; ctx.strokeStyle = ink; ctx.stroke(); }
  }
  canvas.addEventListener("click", function (ev) {
    if (!view) return;
    var rect = canvas.getBoundingClientRect(), mx = ev.clientX - rect.left, my = ev.clientY - rect.top, d = DATA[st.ds], best = -1, bd = 14 * 14;
    for (var i = 0; i < d.x.length; i++) { var dx = view.sx(d.x[i]) - mx, dy = view.sy(d.y[i]) - my, q = dx * dx + dy * dy; if (q < bd) { bd = q; best = i; } }
    st.pick = best; drawCanvas(); renderPick();
  });

  function renderPick() {
    var box = $("p2-pick");
    if (st.pick < 0) { box.innerHTML = L("Click a point to trace its score.", "Щёлкните точку, чтобы проследить её оценку."); return; }
    var d = DATA[st.ds], i = st.pick, size = A.comp.score[i], colour = d.red[i] ? L("red", "красная") : L("green", "зелёная");
    var fl = A.flag[st.f === "component" ? "component" : "smooth"][i], fe = A.flag[st.f === "component" ? "empty" : "local"][i];
    var flagTxt = function (p) { return p >= 1 ? L("flagged", "отмечена") : p <= 0 ? L("not flagged", "не отмечена") : L("flagged with probability ", "отмечена с вероятностью ") + fmt(p, 2) + L(" (tie)", " (совпадение оценок)"); };
    box.innerHTML = st.f === "component"
      ? L("<b>Point " + i + "</b> (" + colour + "): its component 𝒦(i) has <b>" + size + "</b> points, so the score with the graph is " + size + " → " + flagTxt(fl) +
          ". With the empty graph every component is one point, all scores tie at 1 → " + flagTxt(fe) + ". The decision is traced to the " + size + " highlighted points and their edges.",
          "<b>Точка " + i + "</b> (" + colour + "): её компонента 𝒦(i) содержит <b>" + size + "</b> точек, оценка с графом — " + size + " → " + flagTxt(fl) +
          ". С пустым графом каждая компонента — одна точка, все оценки равны 1 → " + flagTxt(fe) + ". Решение прослеживается до выделенных " + size + " точек и их рёбер.")
      : L("<b>Point " + i + "</b> (" + colour + "): local score d<sub>k</sub> = " + fmt(A.local[i], 1) + " px; smoothing averages it over at most 3 hops → " + flagTxt(fl) +
          ". Without edges (Â = I) the score stays d<sub>k</sub> → " + flagTxt(fe) + ". A chain of 38 points needs ≈ 19 hops to tell its length, so 3 hops cannot see it (statement 4, (4.21)).",
          "<b>Точка " + i + "</b> (" + colour + "): локальная оценка d<sub>k</sub> = " + fmt(A.local[i], 1) + " пикс.; сглаживание усредняет её не дальше 3 шагов → " + flagTxt(fl) +
          ". Без рёбер (Â = I) оценка остаётся d<sub>k</sub> → " + flagTxt(fe) + ". Чтобы увидеть длину цепочки из 38 точек, нужно ≈ 19 шагов; за 3 шага её не видно (свойство 4, (4.21)).");
  }

  // ------------------------------------------------------------ facts, rule, verdict, curve
  function fact(v, k, cls) { return '<div class="fact' + (cls && cls.box ? " " + cls.box : "") + '"><div class="v' + (cls && cls.v ? " " + cls.v : "") + '">' + v + '</div><div class="k">' + k + "</div></div>"; }
  function renderFacts() {
    var mg = withGraph(A), me = withEmpty(A), dg = mg - me, sig = Math.abs(dg) >= 0.05;
    $("p2-facts").innerHTML =
      fact(fmt(mg), L("F<sub>1</sub> with the graph, M(f(X, A))", "F<sub>1</sub> с графом, M(f(X, A))")) +
      fact(fmt(me), L("F<sub>1</sub> with the empty graph, M(f(X, ∅))", "F<sub>1</sub> с пустым графом, M(f(X, ∅))")) +
      fact(sgn(dg), L("Δ<sub>G</sub>, the value of the edges", "Δ<sub>G</sub>, ценность рёбер"), { v: st.leak ? "bad" : sig && dg > 0 ? "good" : "", box: "hi" }) +
      fact(fmt(A.h1, 2), L("h<sub>1</sub>(A): share of a red point’s edges that lead to red", "h<sub>1</sub>(A): доля рёбер красной точки, ведущих к красным")) +
      fact(String(A.comp.count), L("components of the graph", "компонент графа")) +
      fact(fmt(2 * A.p / (1 + A.p)), L("“flag everything” level 2p/(1 + p); random ≈ p = ", "уровень «всё красное» 2p/(1 + p); случайный ≈ p = ") + fmt(A.p));
  }
  function renderRule() {
    var c = prep(st.ds).consts, isChain = st.ds === "chains" || st.ds === "circles", closed = st.ds === "circles";
    var allowed = C.kAllowed(closed, c.delta, c.gap), ratio = c.gap / c.delta, base = 2 * A.p / (1 + A.p);
    var items = [];
    var a = A.h1 >= 0.95;
    items.push([a ? "ok" : "no", L("(a) homophilous edges: h<sub>1</sub> = " + fmt(A.h1, 2) + (a ? " ≈ 1" : " — red points also link to green"),
      "(a) гомофильные рёбра: h<sub>1</sub> = " + fmt(A.h1, 2) + (a ? " ≈ 1" : " — красные связаны и с зелёными"))]);
    var b = A.f1.local <= base;
    items.push([b ? "ok" : "no", L("(b) the class is not visible locally: the local score d<sub>k</sub> gives F<sub>1</sub> = " + fmt(A.f1.local) + (b ? " ≤ " : " > ") + fmt(base) + " (flag-everything level)",
      "(b) класс не виден локально: локальная оценка d<sub>k</sub> даёт F<sub>1</sub> = " + fmt(A.f1.local) + (b ? " ≤ " : " > ") + fmt(base) + " (уровень «всё красное»)")]);
    if (isChain) {
      var okk = allowed.indexOf(st.k) >= 0;
      items.push([okk ? "ok" : "no", L("(4.18) components = chains: δ = " + fmt(c.delta, 1) + ", g = " + fmt(c.gap, 1) + " px, g/δ = " + fmt(ratio, 2) + " allows k ∈ {" + allowed.join(", ") + "} for " + (closed ? "closed circles" : "open chains") + "; k = " + st.k + (okk ? "" : " is outside"),
        "(4.18) компоненты = цепочки: δ = " + fmt(c.delta, 1) + ", g = " + fmt(c.gap, 1) + " пикс., g/δ = " + fmt(ratio, 2) + " допускает k ∈ {" + allowed.join(", ") + "} для " + (closed ? "замкнутых окружностей" : "открытых цепочек") + "; k = " + st.k + (okk ? "" : " — вне диапазона"))]);
    } else {
      items.push(["na", L("(4.18) the chain model does not apply to these data: g/δ = " + fmt(ratio, 2), "(4.18) модель цепочек к этим данным не относится: g/δ = " + fmt(ratio, 2))]);
    }
    items.push([st.leak ? "no" : "ok", st.leak ? L("(4.23) leakage: the builder used the colour, so (a) holds trivially and the result is worthless", "(4.23) утечка: построитель использовал цвет, (a) выполнено тривиально, результат обесценен")
      : L("(4.23) no leakage: edges are a function of the coordinates only", "(4.23) утечки нет: рёбра — функция только координат")]);
    $("p2-rule").innerHTML = items.map(function (it) { return '<li class="' + it[0] + '"><span class="od-mark">' + (it[0] === "ok" ? "✓" : it[0] === "no" ? "✗" : "–") + "</span><span>" + it[1] + "</span></li>"; }).join("");

    var dg = withGraph(A) - withEmpty(A), v = $("p2-verdict");
    if (st.leak) v.innerHTML = L("<b>Δ<sub>G</sub> = " + sgn(dg) + ", but it does not count.</b> The edges were built with the colour, the very thing to be found. Any rule check passes trivially; this is the leak that (4.23) and the grouping rule of M3 forbid.",
      "<b>Δ<sub>G</sub> = " + sgn(dg) + ", но это не считается.</b> Рёбра построены по цвету — по тому, что нужно найти. Любая проверка правила проходит тривиально; именно эту утечку запрещают (4.23) и правило группировки М3.");
    else if (dg >= 0.05) v.innerHTML = L("<b>The edges carry the decision here: Δ<sub>G</sub> = " + sgn(dg) + ".</b> The same score without edges is no better than chance. This is the case Position 2 must be able to recognise — and it is recognised only by the separate comparison with the empty graph.",
      "<b>Здесь рёбра несут решение: Δ<sub>G</sub> = " + sgn(dg) + ".</b> Та же оценка без рёбер не лучше случайной. Именно такой случай Положение 2 должно уметь распознать — и распознаётся он только отдельным сравнением с пустым графом.");
    else if (dg <= -0.05) v.innerHTML = L("<b>The edges hurt: Δ<sub>G</sub> = " + sgn(dg) + ".</b> The local score alone does better; the graph mixes it with the wrong neighbours.",
      "<b>Рёбра вредят: Δ<sub>G</sub> = " + sgn(dg) + ".</b> Одна локальная оценка работает лучше; граф смешивает её с чужими соседями.");
    else v.innerHTML = L("<b>The edges add nothing: Δ<sub>G</sub> = " + sgn(dg) + " ≈ 0.</b> " + (st.f === "smooth" ? "Smoothing reaches only 3 hops, while the class is set by the whole chain." : "At least one condition of the rule fails, so the builder gives a graph that does not separate the classes.") + " A model with this graph may still look good — the gain would come from the features, not the edges.",
      "<b>Рёбра ничего не добавляют: Δ<sub>G</sub> = " + sgn(dg) + " ≈ 0.</b> " + (st.f === "smooth" ? "Сглаживание достаёт только на 3 шага, а класс задаёт вся цепочка." : "Нарушено хотя бы одно условие правила, и построитель даёт граф, который не разделяет классы.") + " Модель с таким графом может выглядеть хорошо — но выигрыш даёт признак, а не рёбра.");

    $("p2-config").textContent = JSON.stringify({
      builder: "knn", measure: "euclidean", k: st.k, symmetric: true, features: st.leak ? ["X", "Y", "colour"] : ["X", "Y"],
      score: st.f === "component" ? "component_size" : "smooth(d_k, K=3)", empty_graph_control: true,
      note: L("defaults (k = 2, coordinates only) reproduce the R6 notebook: F1 = 1.000 on chains and circles (Fig. 19)",
        "значения по умолчанию (k = 2, только координаты) воспроизводят ноутбук R6: F1 = 1,000 на цепочках и окружностях (рис. 19)")
    }, null, 1);
  }

  function renderCurve() {
    var box = $("p2-curve"), w = Math.max(260, box.clientWidth || 320), h = 170, m = { l: 34, r: 10, t: 8, b: 26 };
    box.innerHTML = "";
    var svg = el("svg", { viewBox: "0 0 " + w + " " + h, width: w, height: h, role: "img", "aria-label": "F1 against k" }, box);
    var X = function (k) { return m.l + (k - 1) * (w - m.l - m.r) / (C.KMAX - 1); }, Y = function (v) { return m.t + (1 - v) * (h - m.t - m.b); };
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      el("line", { x1: m.l, x2: w - m.r, y1: Y(v), y2: Y(v), style: "stroke:var(--grid)" }, svg);
      el("text", { x: m.l - 6, y: Y(v) + 4, "text-anchor": "end", class: "od-axis-title" }, svg).textContent = fmt(v, 2);
    });
    for (var k = 1; k <= C.KMAX; k++) el("text", { x: X(k), y: h - 8, "text-anchor": "middle", class: "od-axis-title" }, svg).textContent = k;
    var base = 2 * A.p / (1 + A.p);
    el("line", { x1: m.l, x2: w - m.r, y1: Y(base), y2: Y(base), style: "stroke:var(--muted);stroke-dasharray:3 4" }, svg);
    el("rect", { x: X(st.k) - 9, y: m.t, width: 18, height: h - m.t - m.b, style: "fill:var(--od-band)" }, svg);
    [["e", "var(--ink-2)", "4 3"], ["g", "var(--series-1)", ""]].forEach(function (s) {
      el("polyline", { points: CURVE.map(function (c) { return X(c.k) + "," + Y(c[s[0]]); }).join(" "), class: "od-line", style: "stroke:" + s[1] + ";stroke-width:2" + (s[2] ? ";stroke-dasharray:" + s[2] : "") }, svg);
      CURVE.forEach(function (c) { el("circle", { cx: X(c.k), cy: Y(c[s[0]]), r: c.k === st.k ? 4 : 2.5, style: "fill:" + s[1] }, svg); });
    });
    $("p2-curve-legend").innerHTML =
      '<span class="key"><span class="swatch" style="background:var(--series-1)"></span>' + L("with the graph", "с графом") + "</span>" +
      '<span class="key"><span class="swatch" style="background:var(--ink-2)"></span>' + L("empty graph", "пустой граф") + "</span>" +
      '<span class="key"><span class="swatch" style="background:var(--muted)"></span>' + L("flag-everything level", "уровень «всё красное»") + "</span>";
  }

  function renderLegend() {
    $("p2-legend").innerHTML =
      '<span class="key"><span class="swatch dot" style="background:var(--series-2)"></span>' + L("red class", "красный класс") + "</span>" +
      '<span class="key"><span class="swatch dot" style="background:var(--series-3)"></span>' + L("green class", "зелёный класс") + "</span>" +
      '<span class="key"><span class="swatch dot" style="background:transparent;border:1.5px solid var(--ink)"></span>' + L("flagged", "отмечена") + "</span>" +
      '<span class="key"><span class="swatch" style="background:var(--bad)"></span>' + L("edge across colours", "ребро между цветами") + "</span>";
  }

  function sync() { press("#p2-ds", st.ds); press("#p2-k", st.k); press("#p2-f", st.f); $("p2-leak").checked = st.leak; }
  function refresh() {
    sync();
    if (!DATA) return;
    compute(); drawCanvas(); renderPick(); renderFacts(); renderRule(); renderCurve(); renderLegend();
  }
  [["#p2-ds", "ds", String], ["#p2-k", "k", Number], ["#p2-f", "f", String]].forEach(function (c) {
    document.querySelectorAll(c[0] + " [data-v]").forEach(function (b) {
      b.addEventListener("click", function () { st[c[1]] = c[2](b.getAttribute("data-v")); if (c[1] === "ds") st.pick = -1; refresh(); });
    });
  });
  $("p2-leak").addEventListener("change", function () { st.leak = this.checked; refresh(); });

  document.addEventListener("eld:lang", function () { renderEG(); if (DATA) { renderPick(); renderFacts(); renderRule(); renderCurve(); renderLegend(); } });
  // theme changes: canvas colours are read from CSS variables
  new MutationObserver(function () { if (DATA) drawCanvas(); }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  if (window.matchMedia) { var mq = matchMedia("(prefers-color-scheme: dark)"); if (mq.addEventListener) mq.addEventListener("change", function () { if (DATA) drawCanvas(); }); }
  var rw = null, lastW = 0;
  window.addEventListener("resize", function () {
    clearTimeout(rw);
    rw = setTimeout(function () { var w = canvas.parentNode.clientWidth; if (!DATA || Math.abs(w - lastW) < 4) return; lastW = w; drawCanvas(); renderCurve(); }, 120);
  });

  renderEG();
  sync();
  $("p2-pick").textContent = L("Loading the data…", "Загрузка данных…");
  fetch("data/p2_datasets.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
    DATA = j.datasets; refresh(); lastW = canvas.parentNode.clientWidth;
  }).catch(function () {
    $("p2-pick").textContent = L("Could not load data/p2_datasets.json. Open the page over http (python3 -m http.server).", "Не удалось загрузить data/p2_datasets.json. Откройте страницу через http (python3 -m http.server).");
  });
})();
