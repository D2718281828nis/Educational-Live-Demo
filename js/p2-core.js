// Numerics of section 4 (Position 2): the chains-and-circles example of § 4.8 and the objects – events multigraph.
// Works in the browser (window.P2Core) and in Node (module.exports) for tests/p2_check.js.
// Same arithmetic, order and tie-breaking as tests/make_p2_reference.py.

(function (global) {
  "use strict";

  var KMAX = 8;

  // ------------------------------------------------------------ k-NN lists, ties by (distance, index)
  // Returns nb[i] = the KMAX nearest neighbours of i in order; leak = colour as a third coordinate (eq:noleak violated).
  function knnOrdered(d, leak) {
    var x = d.x, y = d.y, red = d.red, n = x.length, nb = new Array(n);
    var bd = new Float64Array(KMAX), bj = new Int32Array(KMAX);
    for (var i = 0; i < n; i++) {
      var m = 0;
      for (var j = 0; j < n; j++) {
        if (j === i || (leak && red[j] !== red[i])) continue;
        var dx = x[j] - x[i], dy = y[j] - y[i], d2 = dx * dx + dy * dy;
        if (m === KMAX && d2 >= bd[m - 1]) continue;      // equal distance: the lower index (already kept) wins
        var p = m < KMAX ? m++ : m - 1;
        while (p > 0 && bd[p - 1] > d2) { bd[p] = bd[p - 1]; bj[p] = bj[p - 1]; p--; }
        bd[p] = d2; bj[p] = j;
      }
      nb[i] = { j: Array.prototype.slice.call(bj, 0, m), d: Array.prototype.map.call(bd.subarray(0, m), Math.sqrt) };
    }
    return nb;
  }

  // Symmetric k-NN graph (eq:knngraph): i – j if j ∈ N_k(i) or i ∈ N_k(j). Lists are sorted.
  function symAdj(nb, k) {
    var n = nb.length, sets = new Array(n), i, t;
    for (i = 0; i < n; i++) sets[i] = {};
    for (i = 0; i < n; i++) for (t = 0; t < k && t < nb[i].j.length; t++) { var j = nb[i].j[t]; sets[i][j] = 1; sets[j][i] = 1; }
    return sets.map(function (s) { return Object.keys(s).map(Number).sort(function (a, b) { return a - b; }); });
  }

  function components(adj) {
    var n = adj.length, lab = new Int32Array(n).fill(-1), c = 0, stack = [];
    for (var s = 0; s < n; s++) {
      if (lab[s] >= 0) continue;
      lab[s] = c; stack.push(s);
      while (stack.length) {
        var u = stack.pop(), a = adj[u];
        for (var t = 0; t < a.length; t++) if (lab[a[t]] < 0) { lab[a[t]] = c; stack.push(a[t]); }
      }
      c++;
    }
    var size = new Array(c).fill(0), i;
    for (i = 0; i < n; i++) size[lab[i]]++;
    var score = new Array(n);
    for (i = 0; i < n; i++) score[i] = size[lab[i]];
    return { count: c, label: lab, size: size, score: score };
  }

  // Edge homophily h(A) and the share of a red node's edges that lead to red, h1(A) (eq:homophily).
  function homophily(adj, red) {
    var same = 0, tot = 0, rr = 0, rAll = 0;
    for (var i = 0; i < adj.length; i++) for (var t = 0; t < adj[i].length; t++) {
      var j = adj[i][t]; tot++; if (red[i] === red[j]) same++;
      if (red[i]) { rAll++; rr += red[j]; }
    }
    return { h: tot ? same / tot : NaN, h1: rAll ? rr / rAll : NaN, edges: tot / 2 };
  }

  // s^(K) = Â^K s0, Â = D̃^-1/2 (A + I) D̃^-1/2 (eq:smooth): self first, then sorted neighbours.
  function smooth(adj, s0, K) {
    var n = adj.length, deg = adj.map(function (a) { return a.length + 1; }), s = s0.slice();
    for (var it = 0; it < K; it++) {
      var nxt = new Array(n);
      for (var i = 0; i < n; i++) {
        var acc = s[i] / deg[i], a = adj[i];
        for (var t = 0; t < a.length; t++) acc += s[a[t]] / Math.sqrt(deg[i] * deg[a[t]]);
        nxt[i] = acc;
      }
      s = nxt;
    }
    return s;
  }

  // Expected F1 of the red class when the n_red highest scores are flagged and ties are broken at random (eq:cctask, eq:ccf1).
  // With n_flag = n_red, P = R = TP/n_red, so the expectation over ties is exact. Also returns the flag probability per point.
  function expectedF1(red, score) {
    var n = score.length, nRed = 0, i;
    for (i = 0; i < n; i++) nRed += red[i];
    var order = new Array(n);
    for (i = 0; i < n; i++) order[i] = i;
    order.sort(function (a, b) { return score[b] - score[a] || a - b; });
    var flag = new Float64Array(n), tp = 0, taken = 0, s = 0;
    while (taken < nRed) {
      var e = s;
      while (e < n && score[order[e]] === score[order[s]]) e++;
      var blk = e - s, reds = 0, need = Math.min(blk, nRed - taken);
      for (var t = s; t < e; t++) { reds += red[order[t]]; flag[order[t]] = need / blk; }
      tp += reds * need / blk; taken += need; s = e;
    }
    return { f1: tp / nRed, flag: flag, nRed: nRed };
  }

  function kthDistance(nb, k) { return nb.map(function (r) { return r.d[Math.min(k, r.d.length) - 1]; }); }
  function kthDistanceLeak(d, nbLeak, k) {
    return nbLeak.map(function (r, i) { var j = r.j[Math.min(k, r.j.length) - 1], dx = d.x[j] - d.x[i], dy = d.y[j] - d.y[i]; return Math.sqrt(dx * dx + dy * dy); });
  }

  // One run of the graph builder and both scores, with the graph and with the empty graph (M4: Δ_G = M(f(X, A)) − M(f(X, ∅))).
  function analyse(d, cache, cfg) {
    var leak = !!cfg.leak, nb = leak ? cache.leak : cache.plain, k = cfg.k, K = cfg.K == null ? 3 : cfg.K;
    var adj = symAdj(nb, k), comp = components(adj), hom = homophily(adj, d.red);
    var s0 = leak ? kthDistanceLeak(d, nb, k) : kthDistance(nb, k);
    var empty = new Array(d.red.length).fill(1);
    var fComp = expectedF1(d.red, comp.score), fEmpty = expectedF1(d.red, empty), fLocal = expectedF1(d.red, s0);
    var fSmooth = expectedF1(d.red, smooth(adj, s0, K));
    return {
      k: k, K: K, leak: leak, adj: adj, comp: comp, h: hom.h, h1: hom.h1, edges: hom.edges, local: s0,
      f1: { component: fComp.f1, empty: fEmpty.f1, local: fLocal.f1, smooth: fSmooth.f1 },
      flag: { component: fComp.flag, smooth: fSmooth.flag, local: fLocal.flag, empty: fEmpty.flag },
      nRed: fComp.nRed, p: fComp.nRed / d.red.length
    };
  }

  function prepare(d) { return { plain: knnOrdered(d, false), leak: knnOrdered(d, true) }; }

  // Step δ (median nearest-neighbour distance) and gap g (closest pair of points in different components of the k = 2 graph):
  // the two constants of the chain model eq:chains, measured on the data as in the R6 notebook.
  function chainConstants(d, cache) {
    var n = d.x.length, first = cache.plain.map(function (r) { return r.d[0]; }).sort(function (a, b) { return a - b; });
    var delta = n % 2 ? first[(n - 1) / 2] : (first[n / 2 - 1] + first[n / 2]) / 2;
    var lab = components(symAdj(cache.plain, 2)).label, g2 = Infinity;
    for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) {
      if (lab[i] === lab[j]) continue;
      var dx = d.x[j] - d.x[i], dy = d.y[j] - d.y[i], q = dx * dx + dy * dy;
      if (q < g2) g2 = q;
    }
    return { delta: delta, gap: Math.sqrt(g2) };
  }

  // Largest k allowed by eq:kcond for a step δ and a gap g: k·δ < g (open chains) or ⌈k/2⌉·δ < g (closed circles).
  function kAllowed(closed, delta, gap) {
    var out = [];
    for (var k = 2; k <= KMAX; k++) if ((closed ? Math.ceil(k / 2) : k) * delta < gap) out.push(k);
    return out;
  }

  // ------------------------------------------------------------ objects – events multigraph (eq:eventgraph), illustration
  // Objects (patients, studies) are nodes; an event joins an object to an event vertex and carries time τ and weight ω.
  // The vertex-code dictionary keeps the index part (code → vertex id, incident edge keys) apart from the information part.
  var OBJECTS = [
    { code: "P-01", kind: "patient" }, { code: "P-02", kind: "patient" }, { code: "P-03", kind: "patient" },
    { code: "P-04", kind: "patient" }, { code: "S-ECG", kind: "study" }, { code: "S-ECHO", kind: "study" }
  ];
  var EVENTS = [
    { code: "E-11", kind: "visit" }, { code: "E-12", kind: "visit" }, { code: "E-13", kind: "visit" },
    { code: "E-14", kind: "visit" }, { code: "E-15", kind: "visit" }
  ];
  // (object, event, τ = date, ω = token of the conclusion); repeated (object, event) pairs make it a multigraph.
  var LINKS = [
    [0, 0, "2024-03-02", "sinus"], [4, 0, "2024-03-02", "sinus"],
    [0, 1, "2024-05-14", "af"], [4, 1, "2024-05-14", "af"], [5, 1, "2024-05-15", "lv-dilat"],
    [1, 1, "2024-05-14", "af"],
    [1, 2, "2024-06-01", "af"], [4, 2, "2024-06-01", "af"], [1, 2, "2024-06-20", "af"],
    [2, 3, "2024-07-09", "sinus"], [4, 3, "2024-07-09", "sinus"],
    [3, 4, "2024-08-11", "lv-dilat"], [5, 4, "2024-08-11", "lv-dilat"], [2, 4, "2024-08-12", "sinus"]
  ];

  function eventGraph() {
    var nodes = OBJECTS.map(function (o, i) { return { id: i, code: o.code, kind: o.kind, side: "obj" }; })
      .concat(EVENTS.map(function (e, i) { return { id: OBJECTS.length + i, code: e.code, kind: e.kind, side: "ev" }; }));
    var edges = LINKS.map(function (l, t) { return { id: t, u: l[0], v: OBJECTS.length + l[1], tau: l[2], omega: l[3], key: l[2] }; });
    var adj = nodes.map(function () { return []; });
    edges.forEach(function (e) { adj[e.u].push(e.id); adj[e.v].push(e.id); });
    return { nodes: nodes, edges: edges, adj: adj };
  }

  // Receptive field of a K-layer message-passing network at node s: nodes within K hops and the edges used (eq:receptive).
  function receptive(g, s, K) {
    var dist = g.nodes.map(function () { return Infinity; }), used = {}, frontier = [s];
    dist[s] = 0;
    for (var h = 1; h <= K; h++) {
      var next = [];
      frontier.forEach(function (u) {
        g.adj[u].forEach(function (eid) {
          var e = g.edges[eid], w = e.u === u ? e.v : e.u;
          used[eid] = 1;
          if (dist[w] === Infinity) { dist[w] = h; next.push(w); }
        });
      });
      frontier = next;
    }
    return { dist: dist, edges: Object.keys(used).map(Number).sort(function (a, b) { return a - b; }) };
  }

  var api = {
    KMAX: KMAX, prepare: prepare, analyse: analyse, symAdj: symAdj, components: components, homophily: homophily,
    smooth: smooth, expectedF1: expectedF1, kthDistance: kthDistance, kAllowed: kAllowed, chainConstants: chainConstants,
    eventGraph: eventGraph, receptive: receptive
  };
  global.P2Core = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
