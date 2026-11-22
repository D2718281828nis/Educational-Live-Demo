(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LiteratureCore = api;
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normalize(value) {
    var text = String(value == null ? "" : value).toLocaleLowerCase();
    if (text.normalize) text = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    return text.replace(/\s+/g, " ").trim();
  }

  function sourceCompare(a, b) {
    if (a.year == null && b.year != null) return 1;
    if (a.year != null && b.year == null) return -1;
    if (a.year !== b.year) return (a.year || 0) - (b.year || 0);
    return String(a.title).localeCompare(String(b.title), "en", { sensitivity: "base" });
  }

  function sourceRadius(node) {
    return 3 + 1.65 * Math.sqrt(Math.max(0, node.internal_incoming_count || 0));
  }

  function sourceNodes(data) {
    return data.nodes.filter(function (n) { return n.type === "bibliography_source"; });
  }

  function filterSources(data, filters) {
    var query = normalize(filters.query);
    return sourceNodes(data).filter(function (n) {
      if (query && n.search_text.indexOf(query) < 0) return false;
      if (filters.position !== "all" && n.positions.indexOf(filters.position) < 0) return false;
      if (filters.entryType !== "all" && n.entry_type !== filters.entryType) return false;
      if (filters.abstract === "yes" && !n.has_abstract) return false;
      if (filters.abstract === "no" && n.has_abstract) return false;
      if (filters.yearMin !== "" && (n.year == null || n.year < +filters.yearMin)) return false;
      if (filters.yearMax !== "" && (n.year == null || n.year > +filters.yearMax)) return false;
      return true;
    });
  }

  function hierarchy(data, visibleIds) {
    var children = { PROBLEM: [], P1: [], P2: [], P3: [] };
    var parents = {};
    data.edges.forEach(function (e) {
      if (e.type === "cites" || (visibleIds && !visibleIds.has(e.source))) return;
      if (visibleIds && e.type === "thematically_supports" && !visibleIds.has(e.target)) return;
      if (!children[e.source]) children[e.source] = [];
      children[e.source].push(e.target);
      parents[e.target] = e.source;
    });
    ["P1", "P2", "P3"].forEach(function (id) {
      children[id].sort(function (a, b) {
        return sourceCompare(data.nodeMap.get(a), data.nodeMap.get(b));
      });
    });
    return { children: children, parents: parents };
  }

  function leafCounts(tree, id, memo) {
    if (memo[id] != null) return memo[id];
    var children = tree.children[id] || [];
    memo[id] = children.length ? children.reduce(function (sum, child) {
      return sum + leafCounts(tree, child, memo);
    }, 0) : 1;
    return memo[id];
  }

  function assignSectors(tree) {
    var sectors = { PROBLEM: [0, Math.PI * 2] };
    var memo = {};
    function visit(id) {
      var sector = sectors[id], children = tree.children[id] || [];
      var total = leafCounts(tree, id, memo), angle = sector[0];
      children.forEach(function (child) {
        var width = (sector[1] - sector[0]) * leafCounts(tree, child, memo) / total;
        sectors[child] = [angle, angle + width];
        angle += width;
        visit(child);
      });
    }
    visit("PROBLEM");
    return sectors;
  }

  function hierarchicalLayout(data, visibleIds) {
    var tree = hierarchy(data, visibleIds), positions = { PROBLEM: { x: 0, y: -90, depth: 0 } };
    var branchX = { P1: -390, P2: 0, P3: 390 };
    ["P1", "P2", "P3"].forEach(function (id) {
      positions[id] = { x: branchX[id], y: 20, depth: 1 };
      var previousYear = null, row = 0, column = 0;
      tree.children[id].forEach(function (child) {
        var node = data.nodeMap.get(child);
        if (previousYear !== null && node.year !== previousYear && column !== 0) {
          row += 1;
          column = 0;
        }
        positions[child] = {
          x: branchX[id] + (column - 1.5) * 88,
          y: 105 + row * 23,
          depth: 2,
          yearGroup: node.year == null ? "unknown" : String(node.year)
        };
        previousYear = node.year;
        column += 1;
        if (column === 4) { column = 0; row += 1; }
      });
    });
    return { positions: positions, tree: tree };
  }

  function radialLayout(data, visibleIds) {
    var tree = hierarchy(data, visibleIds), sectors = assignSectors(tree);
    var positions = { PROBLEM: { x: 0, y: 0, depth: 0, angle: 0 } };
    ["P1", "P2", "P3"].forEach(function (id) {
      var angle = (sectors[id][0] + sectors[id][1]) / 2;
      positions[id] = { x: 125 * Math.cos(angle), y: 125 * Math.sin(angle), depth: 1, angle: angle };
      tree.children[id].forEach(function (child) {
        var sector = sectors[child], a = (sector[0] + sector[1]) / 2;
        positions[child] = { x: 370 * Math.cos(a), y: 370 * Math.sin(a), depth: 2, angle: a };
      });
    });
    return { positions: positions, tree: tree, sectors: sectors };
  }

  function hyperbolicLayout(data, visibleIds) {
    var radial = radialLayout(data, visibleIds), ell = 1.35;
    var years = sourceNodes(data).filter(function (n) {
      return visibleIds.has(n.id) && n.year != null;
    }).map(function (n) { return n.year; });
    years = Array.from(new Set(years)).sort(function (a, b) { return a - b; });
    var yearRanks = new Map(years.map(function (year, index) {
      return [year, years.length > 1 ? index / (years.length - 1) : 0.5];
    }));
    var positions = {};
    Object.keys(radial.positions).forEach(function (id) {
      var p = radial.positions[id], node = data.nodeMap.get(id), depth = p.depth, yearRank = null;
      if (node.type === "bibliography_source") {
        yearRank = node.year == null ? null : yearRanks.get(node.year);
        depth = node.year == null ? 2 : 1.55 + 0.9 * yearRank;
      }
      var rho = Math.tanh(depth * ell / 2);
      positions[id] = { x: rho * Math.cos(p.angle || 0), y: rho * Math.sin(p.angle || 0),
        depth: depth, yearRank: yearRank };
    });
    return { positions: positions, tree: radial.tree, sectors: radial.sectors, ell: ell,
      yearRange: years.length ? [years[0], years[years.length - 1]] : [] };
  }

  function mobius(z, a) {
    var nr = [z[0] + a[0], z[1] + a[1]];
    var dr = [1 + a[0] * z[0] + a[1] * z[1], a[0] * z[1] - a[1] * z[0]];
    var denominator = dr[0] * dr[0] + dr[1] * dr[1];
    if (denominator < 1e-12) return z.slice();
    return [
      (nr[0] * dr[0] + nr[1] * dr[1]) / denominator,
      (nr[1] * dr[0] - nr[0] * dr[1]) / denominator
    ];
  }

  function geodesic(p, q, steps) {
    var cross = p[0] * q[1] - p[1] * q[0], result = [];
    var norm = p[0] * p[0] + p[1] * p[1];
    if (Math.abs(cross) < 1e-7 || norm < 1e-10) {
      for (var s = 0; s <= steps; s++) result.push([p[0] + (q[0] - p[0]) * s / steps, p[1] + (q[1] - p[1]) * s / steps]);
      return result;
    }
    var inverse = [p[0] / norm, p[1] / norm];
    var ax = p[0], ay = p[1], bx = q[0], by = q[1], cx = inverse[0], cy = inverse[1];
    var d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-10) return geodesic([0, 0], q, steps).map(function (_, i) {
      return [p[0] + (q[0] - p[0]) * i / steps, p[1] + (q[1] - p[1]) * i / steps];
    });
    var ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    var uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    var radius = Math.hypot(ax - ux, ay - uy);
    var a1 = Math.atan2(ay - uy, ax - ux), a2 = Math.atan2(by - uy, bx - ux);
    var difference = a2 - a1;
    while (difference > Math.PI) difference -= Math.PI * 2;
    while (difference < -Math.PI) difference += Math.PI * 2;
    for (var i = 0; i <= steps; i++) {
      var angle = a1 + difference * i / steps;
      result.push([ux + radius * Math.cos(angle), uy + radius * Math.sin(angle)]);
    }
    return result;
  }

  function selectedCitations(data, visibleIds, show, direction, selectedId) {
    if (!show) return [];
    if (direction !== "all" && !selectedId) return [];
    return data.edges.filter(function (e) {
      return e.type === "cites" && visibleIds.has(e.source) && visibleIds.has(e.target) &&
        (direction === "all" || (direction === "outgoing" ? e.source === selectedId : e.target === selectedId));
    });
  }

  function page(items, pageNumber, perPage) {
    var pages = Math.max(1, Math.ceil(items.length / perPage));
    var current = Math.min(pages, Math.max(1, pageNumber || 1));
    return { items: items.slice((current - 1) * perPage, current * perPage), page: current, pages: pages, total: items.length };
  }

  return {
    normalize: normalize,
    sourceCompare: sourceCompare,
    sourceRadius: sourceRadius,
    sourceNodes: sourceNodes,
    filterSources: filterSources,
    hierarchy: hierarchy,
    assignSectors: assignSectors,
    hierarchicalLayout: hierarchicalLayout,
    radialLayout: radialLayout,
    hyperbolicLayout: hyperbolicLayout,
    mobius: mobius,
    geodesic: geodesic,
    selectedCitations: selectedCitations,
    page: page
  };
}));
