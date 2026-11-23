// Static data and layout checks for the literature section. Run: node tests/literature_check.js
"use strict";
var fs = require("fs"), path = require("path"), assert = require("assert");
var root = path.join(__dirname, "..");
var data = require(path.join(root, "data", "literature-graph.json"));
var details = require(path.join(root, "data", "literature-details.json")).details;
var C = require(path.join(root, "js", "literature-core.js"));
var failures = 0, checks = 0;
function check(name, fn) {
  checks++;
  try { fn(); console.log("ok   " + name); }
  catch (error) { failures++; console.log("FAIL " + name + "\n     " + error.message); }
}

var sources = data.nodes.filter(function (n) { return n.type === "bibliography_source"; });
var tasks = data.nodes.filter(function (n) { return n.type === "dissertation_task"; });
var methods = data.nodes.filter(function (n) { return n.type === "dissertation_method"; });
var ids = new Set(data.nodes.map(function (n) { return n.id; }));
var sourceIds = new Set(sources.map(function (n) { return n.id; }));
var citations = data.edges.filter(function (e) { return e.type === "cites"; });
data.nodeMap = new Map(data.nodes.map(function (n) { return [n.id, n]; }));
var visible = new Set(ids);

check("new graph has 244 nodes, five hierarchy levels and 664 edges", function () {
  assert.strictEqual(data.nodes.length, 244); assert.strictEqual(sources.length, 227);
  assert.strictEqual(tasks.length, 4); assert.strictEqual(methods.length, 9);
  assert.strictEqual(data.edges.length, 664); assert.strictEqual(citations.length, 379);
  assert.strictEqual(ids.size, data.nodes.length);
  assert.strictEqual(new Set(sources.map(function (n) { return n.zotero_key; })).size, 227);
});
check("all edges have valid types, endpoints and citation direction", function () {
  var types = new Set(["cites", "decomposes_into", "thematically_supports"]);
  data.edges.forEach(function (e) {
    assert(types.has(e.type)); assert(ids.has(e.source) && ids.has(e.target));
    if (e.type === "cites") {
      assert(sourceIds.has(e.source) && sourceIds.has(e.target));
      assert(data.nodeMap.get(e.source).internal_reference_ids.indexOf(e.target) >= 0,
        e.source + " must cite " + e.target);
      assert(data.nodeMap.get(e.target).cited_by_internal_ids.indexOf(e.source) >= 0);
    }
  });
  var tree = C.hierarchy(data);
  sources.forEach(function (node) {
    assert(tree.parents[node.id].every(function (id) { return data.nodeMap.get(id).type === "dissertation_method"; }));
    var queue = [node.id], seen = new Set();
    for (var i = 0; i < queue.length; i++) {
      if (seen.has(queue[i])) continue;
      seen.add(queue[i]); queue.push.apply(queue, tree.parents[queue[i]]);
    }
    assert(seen.has("PROBLEM"), node.id + " must have a hierarchy path to PROBLEM");
  });
});
check("derived metadata and lazy details are complete", function () {
  var references = 0, abstracts = 0;
  sources.forEach(function (n) {
    assert.strictEqual(n.internal_outgoing_count, n.internal_reference_ids.length);
    assert.strictEqual(n.internal_incoming_count, n.cited_by_internal_ids.length);
    assert.strictEqual(n.search_text, C.normalize([n.title, n.authors.join(" "), n.doi, n.year].join(" ")));
    assert(details[n.id]); assert.strictEqual(typeof details[n.id].abstract, "string");
    assert(Array.isArray(details[n.id].references));
    assert.strictEqual(n.has_abstract, !!details[n.id].abstract.trim());
    references += details[n.id].references.length; if (n.has_abstract) abstracts++;
  });
  assert.strictEqual(references, 22999); assert.strictEqual(abstracts, 201);
});
check("all ordinary layouts place every visible node without starting a simulation", function () {
  ["hierarchical", "radial"].forEach(function (layout) {
    var result = layout === "hierarchical" ? C.hierarchicalLayout(data, visible) : C.radialLayout(data, visible);
    assert.strictEqual(Object.keys(result.positions).length, 244);
    Object.keys(result.positions).forEach(function (id) {
      assert(Number.isFinite(result.positions[id].x) && Number.isFinite(result.positions[id].y));
    });
  });
});
check("method children are sorted by year, unknown year last, then full title", function () {
  var tree = C.hierarchy(data, visible);
  methods.forEach(function (method) {
    var branch = tree.children[method.id].map(function (child) { return data.nodeMap.get(child); });
    assert(branch.every(function (node) { return node.type === "bibliography_source"; }));
    assert.deepStrictEqual(branch, branch.slice().sort(C.sourceCompare));
  });
  assert(C.sourceCompare({ year: null, title: "A" }, { year: 2026, title: "Z" }) > 0);
});
check("source radius grows with confirmed internal incoming citations", function () {
  assert.strictEqual(C.sourceRadius({ internal_incoming_count: 0 }), 3);
  assert.strictEqual(C.sourceRadius({ internal_incoming_count: 1 }), 4.65);
  assert(C.sourceRadius({ internal_incoming_count: 4 }) < C.sourceRadius({ internal_incoming_count: 14 }));
  assert.strictEqual(C.sourceRadius({ internal_incoming_count: 14 }), 3 + 1.65 * Math.sqrt(14));
});
check("hyperbolic radii put older articles farther from their Position", function () {
  var result = C.hyperbolicLayout(data, visible);
  assert.strictEqual(Object.keys(result.positions).length, 244);
  ["P1", "P2", "P3"].forEach(function (id) {
    var p = result.positions[id], expected = Math.tanh(result.ell / 2);
    assert(Math.abs(Math.hypot(p.x, p.y) - expected) < 1e-12);
  });
  tasks.forEach(function (node) {
    assert(Math.abs(result.positions[node.id].depth - 2) < 1e-12);
  });
  methods.forEach(function (node) {
    assert(Math.abs(result.positions[node.id].depth - 3) < 1e-12);
  });
  var byYear = new Map();
  sources.forEach(function (n) {
    var p = result.positions[n.id], radius = Math.hypot(p.x, p.y);
    assert(radius > Math.tanh(3 * result.ell / 2) && radius < 1);
    if (!byYear.has(n.year)) byYear.set(n.year, []);
    byYear.get(n.year).push(radius);
  });
  var years = Array.from(byYear.keys()).filter(function (year) { return year != null; }).sort(function (a, b) { return a - b; });
  years.forEach(function (year, index) {
    var radii = byYear.get(year), expectedDepth = 3.35 + 1.1 * (1 - index / (years.length - 1));
    radii.forEach(function (radius) {
      assert(Math.abs(radius - Math.tanh(expectedDepth * result.ell / 2)) < 1e-12);
    });
    if (index) assert(radii[0] < byYear.get(years[index - 1])[0]);
  });
  assert.deepStrictEqual(result.yearRange, [years[0], years[years.length - 1]]);
});
check("ordinary layouts also increase article distance with age", function () {
  var hierarchical = C.hierarchicalLayout(data, visible).positions;
  var radial = C.radialLayout(data, visible).positions;
  var oldSource = sources.slice().sort(function (a, b) { return a.year - b.year; })[0];
  var newSource = sources.slice().sort(function (a, b) { return b.year - a.year; })[0];
  assert(hierarchical[oldSource.id].x > hierarchical[newSource.id].x);
  assert(Math.hypot(radial[oldSource.id].x, radial[oldSource.id].y) >
    Math.hypot(radial[newSource.id].x, radial[newSource.id].y));
});
check("Mobius focus and geodesics preserve disk geometry", function () {
  assert.deepStrictEqual(C.mobius([0.2, 0.3], [0, 0]), [0.2, 0.3]);
  var z = C.mobius([0.2, 0.3], [0.4, -0.2]); assert(Math.hypot(z[0], z[1]) < 1);
  var line = C.geodesic([-0.4, 0.1], [0.5, 0.2], 16);
  assert.strictEqual(line.length, 17); assert(Math.abs(line[0][0] + 0.4) < 1e-12 && Math.abs(line[0][1] - 0.1) < 1e-12);
  line.forEach(function (p) { assert(Number.isFinite(p[0]) && Number.isFinite(p[1])); });
});
check("search and filters use full title, authors, DOI and year", function () {
  var sample = sources.find(function (n) { return n.doi && n.authors.length; });
  var base = { query: "", position: "all", yearMin: "", yearMax: "", entryType: "all", abstract: "all" };
  [sample.title.slice(0, 24), sample.authors[0], sample.doi, String(sample.year)].forEach(function (query) {
    assert(C.filterSources(data, Object.assign({}, base, { query: query })).some(function (n) { return n.id === sample.id; }), query);
  });
  assert.strictEqual(C.filterSources(data, Object.assign({}, base, { position: "P1" })).length, 139);
  assert.strictEqual(C.filterSources(data, Object.assign({}, base, { abstract: "yes" })).length, 201);
});
check("full citation chain is recursive in both directions and includes hierarchy paths", function () {
  var sample = data.nodeMap.get("v35-162"), chain = C.citationChain(data, sample.id);
  assert(chain && chain.sourceIds.size > 10);
  ["bartolomei_epileptogenicity_2008", "george_early_2023", "maturana_critical_2020"].forEach(function (id) {
    assert(chain.sourceIds.has(id), id + " must be in the chain");
  });
  assert(!chain.sourceIds.has("v35-163"), "a co-citing side branch must stay hidden");
  assert(!chain.edges.some(function (e) { return e.source === "v35-163"; }), "side-branch edges must stay hidden");
  assert(chain.nodeIds.has("PROBLEM"));
  var tree = C.hierarchy(data);
  chain.sourceIds.forEach(function (id) {
    var queue = [id], seen = new Set();
    for (var i = 0; i < queue.length; i++) {
      if (seen.has(queue[i])) continue;
      seen.add(queue[i]);
      tree.parents[queue[i]].forEach(function (parent) {
        assert(chain.nodeIds.has(parent), parent + " must be revealed for " + id);
        queue.push(parent);
      });
    }
    assert(seen.has("PROBLEM"), id + " must have a visible path to PROBLEM");
  });
  assert.strictEqual(C.selectedCitations(data, chain.nodeIds, true, "chain", sample.id).length, chain.edges.length);
  assert.strictEqual(C.selectedCitations(data, chain.nodeIds, true, "all", sample.id).length, chain.edges.length);
  assert(chain.edges.every(function (e) { return chain.sourceIds.has(e.source) && chain.sourceIds.has(e.target); }));
});
check("direct citation layer direction and paging stay bounded", function () {
  var sample = sources.find(function (n) { return n.internal_reference_ids.length && n.cited_by_internal_ids.length; });
  var outgoing = C.selectedCitations(data, visible, true, "outgoing", sample.id);
  var incoming = C.selectedCitations(data, visible, true, "incoming", sample.id);
  assert(outgoing.length && outgoing.every(function (e) { return e.source === sample.id; }));
  assert(incoming.length && incoming.every(function (e) { return e.target === sample.id; }));
  assert.strictEqual(C.selectedCitations(data, visible, false, "all", null).length, 0);
  assert.strictEqual(C.selectedCitations(data, visible, true, "chain", null).length, 0);
  var longest = sources.slice().sort(function (a, b) { return details[b.id].references.length - details[a.id].references.length; })[0];
  var page = C.page(details[longest.id].references, 1, 20);
  assert.strictEqual(page.items.length, 20); assert(page.pages > 20);
});
check("HTML uses relative JSON paths and both language entry points retain the section", function () {
  var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  var ru = fs.readFileSync(path.join(root, "ru", "index.html"), "utf8");
  assert(html.indexOf('data-graph-url="data/literature-graph.json"') >= 0);
  assert(html.indexOf('data-details-url="data/literature-details.json"') >= 0);
  assert(html.indexOf('href="#literature"') >= 0 && html.indexOf('id="literature"') >= 0);
  assert(html.indexOf('lang="ru">Научная проблема и граф литературы') >= 0);
  assert(html.indexOf('value="chain"') >= 0);
  assert(ru.indexOf('../?lang=ru') >= 0);
});

console.log(failures ? failures + " of " + checks + " literature checks failed" : "all " + checks + " literature checks passed");
process.exit(failures ? 1 : 0);
