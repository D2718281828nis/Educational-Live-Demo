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
    var children = {}, parents = {};
    data.nodes.forEach(function (node) { children[node.id] = []; parents[node.id] = []; });
    data.edges.forEach(function (e) {
      if (e.type === "cites" || (visibleIds && (!visibleIds.has(e.source) || !visibleIds.has(e.target)))) return;
      children[e.source].push(e.target);
      parents[e.target].push(e.source);
    });
    Object.keys(children).forEach(function (id) {
      children[id].sort(function (a, b) {
        var left = data.nodeMap.get(a), right = data.nodeMap.get(b);
        if (left.type === "bibliography_source" && right.type === "bibliography_source") return sourceCompare(left, right);
        return a.localeCompare(b, "en", { numeric: true });
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
    var sectors = { PROBLEM: [0, Math.PI * 2] }, memo = {};
    function visit(id) {
      var sector = sectors[id], children = tree.children[id] || [];
      var total = leafCounts(tree, id, memo), angle = sector[0];
      children.forEach(function (child) {
        var width = (sector[1] - sector[0]) * leafCounts(tree, child, memo) / total;
        if (!sectors[child]) {
          sectors[child] = [angle, angle + width];
          visit(child);
        }
        angle += width;
      });
    }
    visit("PROBLEM");
    return sectors;
  }

  function yearRanks(data, visibleIds) {
    var years = sourceNodes(data).filter(function (n) {
      return visibleIds.has(n.id) && n.year != null;
    }).map(function (n) { return n.year; });
    years = Array.from(new Set(years)).sort(function (a, b) { return a - b; });
    var ranks = new Map(years.map(function (year, index) {
      return [year, years.length > 1 ? index / (years.length - 1) : 0];
    }));
    return { ranks: ranks, range: years.length ? [years[0], years[years.length - 1]] : [] };
  }

  function ageRank(node, years) {
    return node.year == null ? 0 : 1 - years.ranks.get(node.year);
  }

  function hierarchicalLayout(data, visibleIds) {
    var radial = radialLayout(data, visibleIds), groups = {};
    Object.keys(radial.positions).forEach(function (id) {
      var type = data.nodeMap.get(id).type;
      if (!groups[type]) groups[type] = [];
      groups[type].push(id);
    });
    var positions = {};
    Object.keys(groups).forEach(function (type) {
      var ids = groups[type], spacing = type === "bibliography_source" ? 26 : 105;
      ids.sort(function (a, b) { return radial.positions[a].angle - radial.positions[b].angle || a.localeCompare(b); });
      ids.forEach(function (id, index) {
        var p = radial.positions[id];
        positions[id] = { x: p.depth * 230, y: (index - (ids.length - 1) / 2) * spacing,
          depth: p.depth, yearRank: p.yearRank };
      });
    });
    return { positions: positions, tree: radial.tree, yearRange: radial.yearRange };
  }

  function radialLayout(data, visibleIds) {
    var tree = hierarchy(data, visibleIds), sectors = assignSectors(tree), years = yearRanks(data, visibleIds);
    var positions = { PROBLEM: { x: 0, y: 0, depth: 0, angle: 0 } };
    var levelRadii = { 1: 125, 2: 220, 3: 310 };
    function visit(id) {
      (tree.children[id] || []).forEach(function (child) {
        if (positions[child]) return;
        var node = data.nodeMap.get(child), sector = sectors[child];
        var angle = (sector[0] + sector[1]) / 2, depth = positions[id].depth + 1, yearRank = null;
        var radius = levelRadii[depth];
        if (node.type === "bibliography_source") {
          yearRank = node.year == null ? null : years.ranks.get(node.year);
          depth = 4 + ageRank(node, years);
          radius = 390 + 105 * ageRank(node, years);
        }
        positions[child] = { x: radius * Math.cos(angle), y: radius * Math.sin(angle),
          depth: depth, angle: angle, yearRank: yearRank };
        visit(child);
      });
    }
    visit("PROBLEM");
    return { positions: positions, tree: tree, sectors: sectors, yearRange: years.range };
  }

  function hyperbolicLayout(data, visibleIds) {
    var radial = radialLayout(data, visibleIds), ell = 1.35, years = yearRanks(data, visibleIds);
    var positions = {};
    Object.keys(radial.positions).forEach(function (id) {
      var p = radial.positions[id], node = data.nodeMap.get(id), depth = p.depth, yearRank = null;
      if (node.type === "bibliography_source") {
        yearRank = node.year == null ? null : years.ranks.get(node.year);
        depth = 3.35 + 1.1 * ageRank(node, years);
      }
      var rho = Math.tanh(depth * ell / 2);
      positions[id] = { x: rho * Math.cos(p.angle || 0), y: rho * Math.sin(p.angle || 0),
        depth: depth, yearRank: yearRank };
    });
    return { positions: positions, tree: radial.tree, sectors: radial.sectors, ell: ell,
      yearRange: years.range };
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

  function citationChain(data, selectedId) {
    var selected = data.nodeMap.get(selectedId);
    if (!selected || selected.type !== "bibliography_source") return null;
    var outgoing = {}, incoming = {};
    data.edges.forEach(function (e) {
      if (e.type !== "cites") return;
      if (!outgoing[e.source]) outgoing[e.source] = [];
      if (!incoming[e.target]) incoming[e.target] = [];
      outgoing[e.source].push(e.target);
      incoming[e.target].push(e.source);
    });
    var sourceIds = new Set([selectedId]), queue = [selectedId];
    for (var index = 0; index < queue.length; index++) {
      var id = queue[index];
      (outgoing[id] || []).concat(incoming[id] || []).forEach(function (next) {
        if (!sourceIds.has(next)) { sourceIds.add(next); queue.push(next); }
      });
    }
    var tree = hierarchy(data), nodeIds = new Set(sourceIds), ancestors = Array.from(sourceIds);
    for (var i = 0; i < ancestors.length; i++) {
      (tree.parents[ancestors[i]] || []).forEach(function (parent) {
        if (!nodeIds.has(parent)) { nodeIds.add(parent); ancestors.push(parent); }
      });
    }
    var edges = data.edges.filter(function (e) {
      return e.type === "cites" && sourceIds.has(e.source) && sourceIds.has(e.target);
    });
    return { sourceIds: sourceIds, nodeIds: nodeIds, edges: edges };
  }

  function selectedCitations(data, visibleIds, show, direction, selectedId) {
    if (!show || (direction !== "all" && !selectedId)) return [];
    if (direction === "chain") {
      var chain = citationChain(data, selectedId);
      return chain ? chain.edges.filter(function (e) {
        return visibleIds.has(e.source) && visibleIds.has(e.target);
      }) : [];
    }
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
    citationChain: citationChain,
    selectedCitations: selectedCitations,
    page: page
  };
}));
