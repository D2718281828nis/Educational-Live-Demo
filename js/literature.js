(function () {
  "use strict";

  var section = document.getElementById("literature");
  if (!section) return;
  var C = window.LiteratureCore;
  var root = document.documentElement;
  var canvas = document.getElementById("lg-canvas");
  var box = document.getElementById("lg-canvas-box");
  var tooltip = document.getElementById("lg-tooltip");
  var loading = document.getElementById("lg-loading");
  var detailsBody = document.getElementById("lg-details-body");
  var ctx = canvas.getContext("2d");
  var PER_PAGE = 20;
  var state = {
    data: null, mode: "normal", layout: "hierarchical", visibleIds: new Set(), visibleSources: [],
    visibleOrder: [], positions: {}, hyperBase: {}, hyperFocus: [0, 0], hyperZoom: 1,
    scale: 1, panX: 0, panY: 0, width: 0, height: 0, dpr: 1, screenPositions: {},
    selectedId: null, hoverId: null, drag: null, frame: 0, generation: 0,
    forceRunning: false, forceFrame: 0, forceTick: 0, details: null, detailsPromise: null,
    detailToken: 0, pages: { outgoing: 1, incoming: 1 }, citationEdges: []
  };

  function byId(id) { return document.getElementById(id); }
  function language() { return root.getAttribute("data-lang") === "ru" ? "ru" : "en"; }
  function t(en, ru) { return language() === "ru" ? ru : en; }
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeURL(value) {
    try {
      var url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch (e) { return ""; }
  }
  function doiURL(value) { return value ? "https://doi.org/" + encodeURI(String(value).trim()) : ""; }
  function colors() {
    var css = getComputedStyle(root);
    function v(name) { return css.getPropertyValue(name).trim(); }
    return { surface: v("--surface"), ink: v("--ink"), ink2: v("--ink-2"), muted: v("--muted"),
      axis: v("--axis"), p1: v("--series-1"), p2: v("--series-3"), p3: v("--series-2"),
      position: v("--series-7"), citation: v("--series-2") };
  }
  function requestDraw() {
    if (state.frame) return;
    state.frame = requestAnimationFrame(function () { state.frame = 0; draw(); });
  }
  function resize() {
    var rect = canvas.getBoundingClientRect();
    state.width = Math.max(1, rect.width);
    state.height = Math.max(1, rect.height);
    state.dpr = Math.min(3, window.devicePixelRatio || 1);
    var width = Math.round(state.width * state.dpr), height = Math.round(state.height * state.dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    requestDraw();
  }

  function currentFilters() {
    return {
      query: byId("lg-search").value, position: byId("lg-position").value,
      yearMin: byId("lg-year-min").value, yearMax: byId("lg-year-max").value,
      entryType: byId("lg-type").value, abstract: byId("lg-abstract").value
    };
  }
  function updateCounters() {
    if (!state.data) return;
    byId("lg-node-count").textContent = state.visibleIds.size + " / " + state.data.nodes.length;
    byId("lg-citation-count").textContent = state.citationEdges.length + " / " + state.data.meta.counts.internal_citations;
    canvas.dataset.visible = String(state.visibleIds.size);
    canvas.dataset.citations = String(state.citationEdges.length);
    canvas.dataset.mode = state.mode;
    canvas.dataset.layout = state.layout;
    canvas.dataset.selected = state.selectedId || "";
  }
  function updateNodeOptions() {
    var select = byId("lg-node-select"), value = state.selectedId || "";
    var fragment = document.createDocumentFragment();
    var first = document.createElement("option");
    first.value = ""; first.textContent = "—"; fragment.appendChild(first);
    state.visibleOrder.forEach(function (id) {
      var node = state.data.nodeMap.get(id), option = document.createElement("option");
      option.value = id;
      option.textContent = id + (node.year ? " · " + node.year : "") + " · " + node.title;
      fragment.appendChild(option);
    });
    select.replaceChildren(fragment);
    select.value = value;
    if (select.value !== value) select.value = "";
  }
  function updateVisibleGraph() {
    var chain = byId("lg-direction").value === "chain" ? C.citationChain(state.data, state.selectedId) : null;
    if (chain) {
      state.visibleIds = new Set(chain.nodeIds);
      state.visibleSources = C.sourceNodes(state.data).filter(function (node) {
        return chain.sourceIds.has(node.id);
      }).sort(C.sourceCompare);
    } else {
      state.visibleIds = new Set(state.data.nodes.filter(function (node) {
        return node.type !== "bibliography_source";
      }).map(function (node) { return node.id; }));
      state.visibleSources.forEach(function (node) { state.visibleIds.add(node.id); });
    }
    state.visibleOrder = state.data.nodes.filter(function (node) {
      return state.visibleIds.has(node.id);
    }).map(function (node) { return node.id; });
    updateCitationEdges();
  }
  function applyFilters() {
    if (!state.data) return;
    state.visibleSources = C.filterSources(state.data, currentFilters()).sort(C.sourceCompare);
    var selected = state.data.nodeMap.get(state.selectedId);
    if (selected && selected.type === "bibliography_source" && !state.visibleSources.some(function (node) {
      return node.id === state.selectedId;
    })) {
      state.selectedId = null;
      state.detailToken += 1;
      renderDetails();
    }
    updateVisibleGraph();
    computeLayout(true);
    updateNodeOptions();
    updateSummary();
    updateCounters();
  }
  function updateCitationEdges() {
    state.citationEdges = C.selectedCitations(state.data, state.visibleIds,
      byId("lg-citations").checked, byId("lg-direction").value, state.selectedId);
  }

  function computeLayout(fit) {
    stopForce();
    state.generation += 1;
    if (!state.data) return;
    if (state.mode === "hyper") {
      var hyper = C.hyperbolicLayout(state.data, state.visibleIds);
      state.hyperBase = hyper.positions;
      if (fit) { state.hyperFocus = [0, 0]; state.hyperZoom = 1; }
    } else if (state.layout === "hierarchical") {
      state.positions = C.hierarchicalLayout(state.data, state.visibleIds).positions;
      if (fit) fitNormal();
    } else if (state.layout === "radial") {
      state.positions = C.radialLayout(state.data, state.visibleIds).positions;
      if (fit) fitNormal();
    } else {
      var radial = C.radialLayout(state.data, state.visibleIds).positions;
      state.positions = {};
      Object.keys(radial).forEach(function (id, index) {
        var p = radial[id], jitter = ((index * 37) % 11 - 5) * 2.5;
        state.positions[id] = { x: p.x + jitter, y: p.y - jitter * 0.4, vx: 0, vy: 0, depth: p.depth };
      });
      if (fit) fitNormal();
      startForce();
    }
    updateCounters();
    requestDraw();
  }
  function fitNormal() {
    var ids = Object.keys(state.positions);
    if (!ids.length) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ids.forEach(function (id) {
      var p = state.positions[id];
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    var width = Math.max(1, maxX - minX + 70), height = Math.max(1, maxY - minY + 70);
    state.scale = Math.max(0.04, Math.min(1.35, (state.width - 30) / width, (state.height - 30) / height));
    state.panX = -state.scale * (minX + maxX) / 2;
    state.panY = -state.scale * (minY + maxY) / 2;
  }
  function updateForceButton() {
    var button = byId("lg-force-toggle");
    button.querySelector('[lang="en"]').textContent = state.forceRunning ? "Stop" : "Restart";
    button.querySelector('[lang="ru"]').textContent = state.forceRunning ? "Остановить" : "Перезапустить";
    button.setAttribute("aria-pressed", String(state.forceRunning));
  }
  function stopForce() {
    state.forceRunning = false;
    if (state.forceFrame) cancelAnimationFrame(state.forceFrame);
    state.forceFrame = 0;
    updateForceButton();
  }
  function startForce() {
    if (state.forceRunning || state.mode !== "normal" || state.layout !== "force") return;
    state.forceRunning = true;
    state.forceTick = 0;
    updateForceButton();
    var generation = state.generation;
    var ids = Object.keys(state.positions);
    var links = state.data.edges.filter(function (e) {
      return state.visibleIds.has(e.source) && state.visibleIds.has(e.target);
    });
    function tick() {
      if (!state.forceRunning || generation !== state.generation) return;
      var i, j, a, b, dx, dy, distance, force;
      for (i = 0; i < ids.length; i++) {
        a = state.positions[ids[i]];
        for (j = i + 1; j < ids.length; j++) {
          b = state.positions[ids[j]];
          dx = a.x - b.x; dy = a.y - b.y;
          distance = Math.max(16, dx * dx + dy * dy);
          force = Math.min(2.5, 950 / distance);
          var length = Math.sqrt(distance) || 1, fx = dx / length * force, fy = dy / length * force;
          a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
        }
        a.vx -= a.x * 0.0007; a.vy -= a.y * 0.0007;
      }
      links.forEach(function (e) {
        a = state.positions[e.source]; b = state.positions[e.target];
        if (!a || !b) return;
        dx = b.x - a.x; dy = b.y - a.y;
        distance = Math.max(1, Math.hypot(dx, dy));
        var target = e.type === "cites" ? 120 : 75;
        force = (distance - target) * (e.type === "cites" ? 0.0015 : 0.006);
        var fx = dx / distance * force, fy = dy / distance * force;
        a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
      });
      ids.forEach(function (id) {
        var p = state.positions[id];
        p.vx *= 0.82; p.vy *= 0.82;
        p.x += Math.max(-12, Math.min(12, p.vx)); p.y += Math.max(-12, Math.min(12, p.vy));
      });
      state.forceTick += 1;
      requestDraw();
      if (state.forceTick >= 180) { stopForce(); return; }
      state.forceFrame = requestAnimationFrame(tick);
    }
    state.forceFrame = requestAnimationFrame(tick);
  }

  function nodeRadius(node, scale) {
    var base = node.type === "scientific_problem" ? 11 : node.type === "dissertation_position" ? 8 :
      node.type === "dissertation_task" ? 7 : node.type === "dissertation_method" ? 6 : C.sourceRadius(node);
    return Math.max(base, 2.8 / (scale || 1));
  }
  function nodeColor(node, palette) {
    if (node.type === "scientific_problem") return palette.ink;
    if (node.type === "dissertation_position") return palette.position;
    if (node.type === "dissertation_task") return palette.p2;
    if (node.type === "dissertation_method") return palette.p3;
    return palette[node.positions[0].toLowerCase()] || palette.p1;
  }
  function arrow(context, from, to, color, width, dashed, curved, targetRadius) {
    var dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
    if (length < 0.01) return;
    var ux = dx / length, uy = dy / length;
    var end = { x: to.x - ux * (targetRadius + 3), y: to.y - uy * (targetRadius + 3) };
    var control = null;
    context.beginPath();
    context.moveTo(from.x, from.y);
    if (curved) {
      var bend = Math.min(45, length * 0.12) * (from.x <= to.x ? 1 : -1);
      control = { x: (from.x + end.x) / 2 - uy * bend, y: (from.y + end.y) / 2 + ux * bend };
      context.quadraticCurveTo(control.x, control.y, end.x, end.y);
    } else context.lineTo(end.x, end.y);
    context.strokeStyle = color; context.lineWidth = width;
    context.setLineDash(dashed ? [5, 4] : []); context.stroke(); context.setLineDash([]);
    var tx = control ? end.x - control.x : ux, ty = control ? end.y - control.y : uy;
    var tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    var size = Math.max(4, width * 4);
    context.beginPath(); context.moveTo(end.x, end.y);
    context.lineTo(end.x - tx * size - ty * size * 0.48, end.y - ty * size + tx * size * 0.48);
    context.lineTo(end.x - tx * size + ty * size * 0.48, end.y - ty * size - tx * size * 0.48);
    context.closePath(); context.fillStyle = color; context.fill();
  }
  function shortLabel(node) {
    if (node.type !== "bibliography_source") return node.id;
    var author = node.authors.length ? String(node.authors[0]).split(",")[0] + " " : "";
    return (author + (node.year || t("no year", "без года"))).slice(0, 30);
  }
  function drawNormal(palette) {
    var scale = state.scale;
    ctx.translate(state.width / 2 + state.panX, state.height / 2 + state.panY);
    ctx.scale(scale, scale);
    var visible = state.visibleIds;
    state.data.edges.forEach(function (e) {
      if (e.type === "cites" || !visible.has(e.source) || !visible.has(e.target)) return;
      var a = state.positions[e.source], b = state.positions[e.target];
      if (!a || !b) return;
      arrow(ctx, a, b, palette.axis, 0.9 / scale, false, false, nodeRadius(state.data.nodeMap.get(e.target), scale));
    });
    state.citationEdges.forEach(function (e) {
      var a = state.positions[e.source], b = state.positions[e.target];
      if (!a || !b) return;
      ctx.globalAlpha = 0.78;
      arrow(ctx, a, b, palette.citation, 1.05 / scale, true, true, nodeRadius(state.data.nodeMap.get(e.target), scale));
      ctx.globalAlpha = 1;
    });
    state.screenPositions = {};
    visible.forEach(function (id) {
      var p = state.positions[id]; if (!p) return;
      var node = state.data.nodeMap.get(id), radius = nodeRadius(node, scale);
      var sx = state.width / 2 + state.panX + p.x * scale, sy = state.height / 2 + state.panY + p.y * scale;
      state.screenPositions[id] = { x: sx, y: sy, r: Math.max(3, radius * scale) };
      ctx.beginPath();
      if (node.type === "scientific_problem") {
        ctx.moveTo(p.x, p.y - radius); ctx.lineTo(p.x + radius, p.y); ctx.lineTo(p.x, p.y + radius); ctx.lineTo(p.x - radius, p.y); ctx.closePath();
      } else if (node.type === "dissertation_position") ctx.rect(p.x - radius, p.y - radius, radius * 2, radius * 2);
      else ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor(node, palette); ctx.fill();
      if (id === state.selectedId || id === state.hoverId) {
        ctx.beginPath(); ctx.arc(p.x, p.y, radius + 3 / scale, 0, Math.PI * 2);
        ctx.strokeStyle = id === state.selectedId ? palette.ink : palette.muted; ctx.lineWidth = 2 / scale; ctx.stroke();
      }
      if (node.type !== "bibliography_source" || scale > 1.35 || state.visibleSources.length < 35 || id === state.selectedId || id === state.hoverId) {
        ctx.font = (node.type === "bibliography_source" ? 10 : 12) / scale + "px system-ui, sans-serif";
        ctx.fillStyle = palette.ink2; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(shortLabel(node), p.x + radius + 4 / scale, p.y);
      }
    });
  }
  function hyperPoint(id) {
    var p = state.hyperBase[id];
    if (!p) return null;
    return C.mobius([p.x, p.y], state.hyperFocus);
  }
  function drawHyper(palette) {
    var radius = Math.max(20, (Math.min(state.width, state.height) / 2 - 16) * state.hyperZoom);
    var center = { x: state.width / 2, y: state.height / 2 };
    function screen(z) { return { x: center.x + z[0] * radius, y: center.y + z[1] * radius }; }
    ctx.beginPath(); ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = palette.surface; ctx.fill(); ctx.strokeStyle = palette.axis; ctx.lineWidth = 1.2; ctx.stroke();
    var display = {};
    state.visibleIds.forEach(function (id) { display[id] = hyperPoint(id); });
    function hyperEdge(e, citation) {
      var p = display[e.source], q = display[e.target]; if (!p || !q) return;
      var points = C.geodesic(p, q, citation ? 16 : 12).map(screen);
      ctx.beginPath(); points.forEach(function (point, i) { if (i) ctx.lineTo(point.x, point.y); else ctx.moveTo(point.x, point.y); });
      ctx.strokeStyle = citation ? palette.citation : palette.axis;
      ctx.lineWidth = citation ? 1 : 0.85; ctx.globalAlpha = citation ? 0.78 : 0.65;
      ctx.setLineDash(citation ? [5, 4] : []); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      var end = points[points.length - 1], before = points[points.length - 2];
      var dx = end.x - before.x, dy = end.y - before.y, length = Math.hypot(dx, dy) || 1;
      dx /= length; dy /= length;
      var target = state.data.nodeMap.get(e.target), nr = hyperRadius(target, display[e.target]);
      var x = end.x - dx * (nr + 2), y = end.y - dy * (nr + 2), size = citation ? 5 : 4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dx * size - dy * size * 0.5, y - dy * size + dx * size * 0.5);
      ctx.lineTo(x - dx * size + dy * size * 0.5, y - dy * size - dx * size * 0.5); ctx.closePath();
      ctx.fillStyle = citation ? palette.citation : palette.axis; ctx.fill();
    }
    function hyperRadius(node) {
      if (node.type === "scientific_problem") return 10;
      if (node.type === "dissertation_position") return 7;
      if (node.type === "dissertation_task") return 6;
      if (node.type === "dissertation_method") return 5;
      return C.sourceRadius(node);
    }
    state.data.edges.forEach(function (e) {
      if (e.type !== "cites" && state.visibleIds.has(e.source) && state.visibleIds.has(e.target)) hyperEdge(e, false);
    });
    state.citationEdges.forEach(function (e) { hyperEdge(e, true); });
    state.screenPositions = {};
    state.visibleIds.forEach(function (id) {
      var node = state.data.nodeMap.get(id), z = display[id], p = screen(z), r = hyperRadius(node, z);
      state.screenPositions[id] = { x: p.x, y: p.y, r: r };
      ctx.beginPath();
      if (node.type === "scientific_problem") {
        ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r, p.y); ctx.closePath();
      } else if (node.type === "dissertation_position") ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
      else ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor(node, palette); ctx.fill();
      if (id === state.selectedId || id === state.hoverId) {
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2); ctx.strokeStyle = palette.ink; ctx.lineWidth = 1.8; ctx.stroke();
      }
      if (node.type !== "bibliography_source" || id === state.selectedId || id === state.hoverId) {
        ctx.font = (node.type === "bibliography_source" ? 10 : 12) + "px system-ui, sans-serif";
        ctx.fillStyle = palette.ink2; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(shortLabel(node), p.x + r + 4, p.y);
      }
    });
  }
  function draw() {
    if (!state.data || !state.width || !state.height) return;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.fillStyle = colors().surface; ctx.fillRect(0, 0, state.width, state.height);
    var palette = colors();
    if (state.mode === "hyper") drawHyper(palette); else drawNormal(palette);
    updateCounters();
  }

  function pointFromEvent(event) {
    var rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function hitNode(point) {
    var best = null, distance = Infinity;
    Object.keys(state.screenPositions).forEach(function (id) {
      var p = state.screenPositions[id], d = Math.hypot(point.x - p.x, point.y - p.y);
      if (d <= Math.max(8, p.r + 5) && d < distance) { best = id; distance = d; }
    });
    return best;
  }
  function hideTooltip() { tooltip.hidden = true; }
  function showTooltip(id, point) {
    if (!id || !state.data) { hideTooltip(); return; }
    var node = state.data.nodeMap.get(id);
    var meta = node.type === "bibliography_source" ?
      esc((node.authors.join("; ") || t("Authors unavailable", "Авторы недоступны")) + (node.year ? " · " + node.year : "")) :
      esc(t("Dissertation hierarchy", "Иерархия диссертации"));
    var citations = node.type === "bibliography_source" ? '<div class="lg-tip-meta">' +
      esc(t("Cited in the collection: ", "Цитируется в коллекции: ") + node.internal_incoming_count +
        t(" · outgoing internal citations: ", " · исходящих внутренних цитирований: ") + node.internal_outgoing_count) + '</div>' : "";
    tooltip.innerHTML = '<div class="t">' + esc(node.title) + '</div><div class="lg-tip-meta">' + meta + '</div>' + citations;
    tooltip.hidden = false;
    var left = Math.min(state.width - tooltip.offsetWidth - 8, Math.max(8, point.x + 12));
    var top = Math.min(state.height - tooltip.offsetHeight - 8, Math.max(8, point.y + 12));
    tooltip.style.left = left + "px"; tooltip.style.top = top + "px";
  }
  function zoom(factor, point) {
    if (state.mode === "hyper") state.hyperZoom = Math.max(0.5, Math.min(4, state.hyperZoom * factor));
    else {
      var old = state.scale, next = Math.max(0.04, Math.min(8, old * factor));
      if (point) {
        var wx = (point.x - state.width / 2 - state.panX) / old, wy = (point.y - state.height / 2 - state.panY) / old;
        state.panX = point.x - state.width / 2 - wx * next; state.panY = point.y - state.height / 2 - wy * next;
      }
      state.scale = next;
    }
    requestDraw();
  }

  function updateSummary() {
    var summary = byId("lg-selection-summary"), node = state.data && state.data.nodeMap.get(state.selectedId);
    if (!node) {
      summary.textContent = t("No node selected. Use the node list or click the graph.", "Узел не выбран. Используйте список узлов или нажмите на граф.");
      return;
    }
    summary.textContent = node.title + (node.year ? " · " + node.year : "") +
      (node.type === "bibliography_source" ? " · " + t("cites", "цитирует") + " " + node.internal_outgoing_count +
        " · " + t("cited by", "цитируется в") + " " + node.internal_incoming_count : "");
  }
  function missingNote(fields) {
    if (!fields || !fields.length) return "";
    return '<p class="lg-missing">' + esc(t("Unavailable in Zotero, OpenAlex, Crossref or PubMed: ",
      "Данные недоступны в Zotero, OpenAlex, Crossref или PubMed: ") + fields.join(", ")) + '</p>';
  }
  function externalLink(label, url) {
    url = safeURL(url);
    return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + ' ↗</a>' : "";
  }
  function referenceItem(reference) {
    var internal = reference.internal_id && state.data.nodeMap.get(reference.internal_id);
    var title = reference.title || (internal && internal.title) || "";
    var main = internal ? '<button type="button" class="lg-ref-internal" data-lg-node="' + esc(internal.id) + '">' +
      esc(title || internal.id) + '</button>' : esc(title);
    var year = reference.year || (internal && internal.year);
    var doi = reference.doi || (internal && internal.doi);
    var parts = [];
    if (year) parts.push(esc(year));
    if (doi) parts.push(externalLink("DOI " + doi, doiURL(doi)));
    else if (reference.url) parts.push(externalLink("URL", reference.url));
    var citation = !title && reference.citation ? '<span class="lg-ref-citation">' + esc(reference.citation) + '</span>' : "";
    return '<li>' + (main || esc(reference.citation || t("Untitled reference", "Ссылка без названия"))) +
      (parts.length ? ' <span class="lg-detail-meta">· ' + parts.join(" · ") + '</span>' : "") + citation + '</li>';
  }
  function outgoingList(node, detail) {
    var references = detail ? detail.references : node.internal_reference_ids.map(function (id) {
      var target = state.data.nodeMap.get(id);
      return { internal_id: id, title: target.title, year: target.year, doi: target.doi };
    });
    var page = C.page(references, state.pages.outgoing, PER_PAGE);
    state.pages.outgoing = page.page;
    var html = '<h4>' + esc(t("Cites", "Цитирует")) + ' (' + references.length + ')</h4>';
    if (!detail && state.detailsPromise) return html + '<p class="lang-note">' + esc(t("Loading full references…", "Загрузка полного списка ссылок…")) + '</p>';
    if (!references.length) return html + '<p class="lg-missing">' + esc(t("Reference data were unavailable in Zotero, OpenAlex, Crossref or PubMed.",
      "Данные ссылок не были доступны в Zotero, OpenAlex, Crossref или PubMed.")) + '</p>';
    html += '<ol class="lg-ref-list" start="' + ((page.page - 1) * PER_PAGE + 1) + '">' + page.items.map(referenceItem).join("") + '</ol>' + pager("outgoing", page);
    return html;
  }
  function incomingList(node) {
    var references = node.cited_by_internal_ids.map(function (id) { return state.data.nodeMap.get(id); });
    var page = C.page(references, state.pages.incoming, PER_PAGE);
    state.pages.incoming = page.page;
    var html = '<h4>' + esc(t("Cited in the collection", "Цитируется в коллекции")) + ' (' + references.length + ')</h4>';
    if (!references.length) return html + '<p class="lang-note">' + esc(t("No confirmed internal incoming citations.", "Подтверждённых внутренних входящих цитирований нет.")) + '</p>';
    html += '<ol class="lg-ref-list" start="' + ((page.page - 1) * PER_PAGE + 1) + '">' + page.items.map(function (target) {
      return '<li><button type="button" class="lg-ref-internal" data-lg-node="' + esc(target.id) + '">' + esc(target.title) + '</button>' +
        ' <span class="lg-detail-meta">· ' + esc(target.year || "") + '</span></li>';
    }).join("") + '</ol>' + pager("incoming", page);
    return html;
  }
  function pager(kind, page) {
    if (page.pages <= 1) return "";
    return '<div class="lg-pager"><span>' + page.page + ' / ' + page.pages + ' · ' + page.total + '</span>' +
      '<button type="button" class="btn small" data-lg-list="' + kind + '" data-lg-page="' + (page.page - 1) + '"' + (page.page <= 1 ? " disabled" : "") + '>←</button>' +
      '<button type="button" class="btn small" data-lg-list="' + kind + '" data-lg-page="' + (page.page + 1) + '"' + (page.page >= page.pages ? " disabled" : "") + '>→</button></div>';
  }
  function renderDetails() {
    var node = state.data && state.data.nodeMap.get(state.selectedId);
    if (!node) {
      detailsBody.innerHTML = '<p class="lang-note">' + esc(t("Select a source to see its full metadata, abstract and references. Long reference lists are paged.",
        "Выберите источник, чтобы увидеть полные метаданные, аннотацию и ссылки. Длинные списки выводятся постранично.")) + '</p>';
      return;
    }
    if (node.type !== "bibliography_source") {
      var labels = {
        scientific_problem: t("Research problem", "Научная проблема"),
        dissertation_position: t("Dissertation Position", "Положение диссертации"),
        dissertation_task: t("Dissertation task", "Задача диссертации"),
        dissertation_method: t("Dissertation method", "Метод диссертации")
      };
      detailsBody.innerHTML = '<p class="lg-detail-title">' + esc(node.title) + '</p><p class="lg-detail-meta">' + esc(node.id) + ' · ' +
        esc(labels[node.type] || node.type) + '</p>';
      return;
    }
    var detail = state.details && state.details.details[node.id];
    var links = [];
    if (node.doi) links.push(externalLink("DOI " + node.doi, doiURL(node.doi)));
    if (node.url && node.url !== doiURL(node.doi)) links.push(externalLink("URL", node.url));
    if (node.openalex_id) links.push(externalLink("OpenAlex " + node.openalex_id, node.openalex_id));
    if (node.pmid) links.push(externalLink("PMID " + node.pmid, "https://pubmed.ncbi.nlm.nih.gov/" + encodeURIComponent(node.pmid) + "/"));
    var abstract = detail && detail.abstract ? '<p class="lg-abstract">' + esc(detail.abstract) + '</p>' :
      detail ? '<p class="lg-missing">' + esc(t("The abstract was unavailable in Zotero, OpenAlex, Crossref or PubMed.",
        "Аннотация не была доступна в Zotero, OpenAlex, Crossref или PubMed.")) + '</p>' :
        '<p class="lang-note">' + esc(t("Loading abstract and full references…", "Загрузка аннотации и полного списка ссылок…")) + '</p>';
    detailsBody.innerHTML = '<p class="lg-detail-title">' + esc(node.title) + '</p>' +
      '<p class="lg-detail-meta">' + esc(node.authors.join("; ") || t("Authors unavailable", "Авторы недоступны")) + '</p>' +
      '<p class="lg-detail-meta">' + esc(node.year || t("No year", "Без года")) + ' · ' + esc(node.entry_type) + ' · ' + esc(node.positions.join(", ")) + '</p>' +
      '<div class="lg-detail-links">' + links.join("") + '</div>' + missingNote(node.missing_fields) +
      '<h4>' + esc(t("Abstract", "Аннотация")) + (detail && detail.abstract_source ? ' · <span class="lg-detail-meta">' + esc(detail.abstract_source) + '</span>' : "") + '</h4>' +
      abstract + outgoingList(node, detail) + incomingList(node);
  }
  function ensureDetails() {
    if (state.details) return Promise.resolve(state.details);
    if (state.detailsPromise) return state.detailsPromise;
    state.detailsPromise = fetch(section.dataset.detailsUrl).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    }).then(function (details) {
      if (!details || typeof details.details !== "object") throw new Error("Invalid details schema");
      state.details = details;
      return details;
    }).catch(function (error) { state.detailsPromise = null; throw error; });
    return state.detailsPromise;
  }
  function selectNode(id, reveal) {
    if (!state.data || !state.data.nodeMap.has(id)) return;
    if (reveal && !state.visibleIds.has(id)) {
      byId("lg-search").value = ""; byId("lg-position").value = "all";
      byId("lg-year-min").value = ""; byId("lg-year-max").value = "";
      byId("lg-type").value = "all"; byId("lg-abstract").value = "all";
      state.selectedId = id;
      applyFilters();
    }
    state.selectedId = id;
    state.pages = { outgoing: 1, incoming: 1 };
    updateVisibleGraph();
    computeLayout(true);
    updateNodeOptions();
    byId("lg-node-select").value = id;
    updateSummary(); updateCounters(); renderDetails(); requestDraw();
    var token = ++state.detailToken, node = state.data.nodeMap.get(id);
    if (node.type === "bibliography_source" && !state.details) {
      ensureDetails().then(function () { if (token === state.detailToken) renderDetails(); }).catch(function (error) {
        if (token !== state.detailToken) return;
        detailsBody.insertAdjacentHTML("beforeend", '<p class="lg-error">' + esc(t("Could not load details: ", "Не удалось загрузить детали: ") + error.message) + '</p>');
      });
    }
  }

  function clearFilters() {
    byId("lg-search").value = ""; byId("lg-position").value = "all";
    byId("lg-year-min").value = ""; byId("lg-year-max").value = "";
    byId("lg-type").value = "all"; byId("lg-abstract").value = "all";
  }
  function bindControls() {
    byId("lg-mode").addEventListener("click", function (event) {
      var button = event.target.closest("button[data-v]"); if (!button) return;
      state.mode = button.dataset.v;
      this.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b === button)); });
      byId("lg-layout-control").hidden = state.mode === "hyper";
      byId("lg-hyper-note").hidden = state.mode !== "hyper";
      byId("lg-force-wrap").hidden = state.mode === "hyper" || state.layout !== "force";
      hideTooltip(); computeLayout(true);
    });
    byId("lg-layout").addEventListener("change", function () {
      state.layout = this.value;
      byId("lg-force-wrap").hidden = state.mode === "hyper" || state.layout !== "force";
      computeLayout(true);
    });
    ["lg-search", "lg-position", "lg-year-min", "lg-year-max", "lg-type", "lg-abstract"].forEach(function (id) {
      byId(id).addEventListener(id === "lg-search" ? "input" : "change", applyFilters);
    });
    byId("lg-citations").addEventListener("change", function () { updateCitationEdges(); updateCounters(); requestDraw(); });
    byId("lg-direction").addEventListener("change", applyFilters);
    byId("lg-force-toggle").addEventListener("click", function () { if (state.forceRunning) stopForce(); else startForce(); });
    byId("lg-zoom-in").addEventListener("click", function () { zoom(1.25); });
    byId("lg-zoom-out").addEventListener("click", function () { zoom(0.8); });
    byId("lg-fit").addEventListener("click", function () { if (state.mode === "hyper") { state.hyperFocus = [0, 0]; state.hyperZoom = 1; } else fitNormal(); requestDraw(); });
    byId("lg-reset").addEventListener("click", function () {
      if (state.mode === "hyper") { state.hyperFocus = [0, 0]; state.hyperZoom = 1; }
      else fitNormal();
      hideTooltip(); requestDraw();
    });
    byId("lg-node-select").addEventListener("change", function () { if (this.value) selectNode(this.value); });
    detailsBody.addEventListener("click", function (event) {
      var nodeButton = event.target.closest("[data-lg-node]");
      if (nodeButton) { selectNode(nodeButton.dataset.lgNode, true); return; }
      var pageButton = event.target.closest("[data-lg-page]");
      if (pageButton && !pageButton.disabled) {
        state.pages[pageButton.dataset.lgList] = +pageButton.dataset.lgPage;
        renderDetails();
      }
    });
    canvas.addEventListener("pointerdown", function (event) {
      if (event.button !== 0 || !state.data) return;
      var point = pointFromEvent(event);
      state.drag = { last: point, start: point, moved: false };
      canvas.setPointerCapture(event.pointerId); hideTooltip();
    });
    canvas.addEventListener("pointermove", function (event) {
      var point = pointFromEvent(event);
      if (state.drag) {
        var dx = point.x - state.drag.last.x, dy = point.y - state.drag.last.y;
        if (Math.hypot(point.x - state.drag.start.x, point.y - state.drag.start.y) > 3) state.drag.moved = true;
        if (state.drag.moved) {
          if (state.mode === "normal") { state.panX += dx; state.panY += dy; }
          else {
            var radius = Math.max(20, (Math.min(state.width, state.height) / 2 - 16) * state.hyperZoom);
            var a = [dx / radius * 0.9, dy / radius * 0.9], norm = Math.hypot(a[0], a[1]);
            if (norm > 0.16) { a[0] *= 0.16 / norm; a[1] *= 0.16 / norm; }
            state.hyperFocus = C.mobius(state.hyperFocus, a);
            var focusNorm = Math.hypot(state.hyperFocus[0], state.hyperFocus[1]);
            if (focusNorm > 0.96) { state.hyperFocus[0] *= 0.96 / focusNorm; state.hyperFocus[1] *= 0.96 / focusNorm; }
          }
          state.drag.last = point; requestDraw();
        }
      } else {
        var id = hitNode(point);
        if (id !== state.hoverId) { state.hoverId = id; requestDraw(); }
        showTooltip(id, point);
      }
    });
    function endPointer(event) {
      if (!state.drag) return;
      var drag = state.drag; state.drag = null;
      if (!drag.moved) { var id = hitNode(pointFromEvent(event)); if (id) selectNode(id); }
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", function () { state.drag = null; });
    canvas.addEventListener("pointerleave", function () { if (!state.drag) { state.hoverId = null; hideTooltip(); requestDraw(); } });
    canvas.addEventListener("wheel", function (event) {
      if (!state.data) return;
      event.preventDefault(); zoom(event.deltaY < 0 ? 1.12 : 0.89, pointFromEvent(event));
    }, { passive: false });
    canvas.addEventListener("keydown", function (event) {
      if (!state.data) return;
      if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].indexOf(event.key) >= 0) {
        event.preventDefault();
        var direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
        var index = state.visibleOrder.indexOf(state.selectedId);
        index = (index + direction + state.visibleOrder.length) % state.visibleOrder.length;
        selectNode(state.visibleOrder[index]);
      } else if (event.key === "Enter" && state.hoverId) { event.preventDefault(); selectNode(state.hoverId); }
      else if (event.key === "+" || event.key === "=") { event.preventDefault(); zoom(1.25); }
      else if (event.key === "-") { event.preventDefault(); zoom(0.8); }
      else if (event.key === "0") { event.preventDefault(); if (state.mode === "hyper") { state.hyperFocus = [0, 0]; state.hyperZoom = 1; } else fitNormal(); requestDraw(); }
      else if (event.key === "Escape") { state.selectedId = null; state.hoverId = null; state.detailToken += 1; applyFilters(); renderDetails(); }
    });
    document.addEventListener("eld:lang", function () {
      section.querySelectorAll("option[data-en]").forEach(function (option) { option.textContent = option.dataset[language()]; });
      updateSummary(); renderDetails(); requestDraw();
    });
    var observer = new MutationObserver(function () { requestDraw(); });
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", requestDraw);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(box);
    else window.addEventListener("resize", resize);
  }

  function validate(data) {
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges) || !data.meta || !data.meta.counts) throw new Error("Invalid graph schema");
    var sources = data.nodes.filter(function (n) { return n.type === "bibliography_source"; });
    if (sources.length !== 227) throw new Error("Expected 227 sources, got " + sources.length);
    data.nodeMap = new Map(data.nodes.map(function (n) { return [n.id, n]; }));
    if (data.nodeMap.size !== data.nodes.length) throw new Error("Duplicate node ids");
    data.edges.forEach(function (e) { if (!data.nodeMap.has(e.source) || !data.nodeMap.has(e.target)) throw new Error("Missing edge endpoint"); });
  }
  function initialize(data) {
    validate(data); state.data = data;
    var years = C.sourceNodes(data).map(function (n) { return n.year; }).filter(function (y) { return y != null; });
    var min = Math.min.apply(Math, years), max = Math.max.apply(Math, years);
    byId("lg-year-min").placeholder = String(min); byId("lg-year-max").placeholder = String(max);
    byId("lg-year-min").min = min; byId("lg-year-min").max = max;
    byId("lg-year-max").min = min; byId("lg-year-max").max = max;
    var types = Array.from(new Set(C.sourceNodes(data).map(function (n) { return n.entry_type; }))).sort();
    var fragment = document.createDocumentFragment();
    types.forEach(function (type) { var option = document.createElement("option"); option.value = type; option.textContent = type; fragment.appendChild(option); });
    byId("lg-type").appendChild(fragment);
    resize(); applyFilters(); loading.hidden = true;
    section.dataset.ready = "true";
  }

  bindControls();
  fetch(section.dataset.graphUrl).then(function (response) {
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.json();
  }).then(initialize).catch(function (error) {
    loading.innerHTML = '<span class="lg-error">' + esc(t("Could not load the literature graph: ", "Не удалось загрузить граф литературы: ") + error.message) + '</span>';
    section.dataset.ready = "error";
  });
}());
