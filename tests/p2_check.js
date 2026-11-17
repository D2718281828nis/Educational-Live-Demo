// js/p2-core.js must reproduce tests/fixtures/p2_reference.json (tests/make_p2_reference.py, Python) on the page's data.
// Run: node tests/p2_check.js
"use strict";
var path = require("path");
var C = require(path.join(__dirname, "..", "js", "p2-core.js"));
var ref = require(path.join(__dirname, "fixtures", "p2_reference.json"));
var data = require(path.join(__dirname, "..", "data", "p2_datasets.json")).datasets;

var KEYS = ["components", "edges", "h", "h1", "f1_component", "f1_empty", "f1_local_dk", "f1_smooth"];
var failures = 0, total = 0;
function report(ok, label, got, want) {
  total++; if (!ok) failures++;
  console.log((ok ? "ok   " : "FAIL ") + label + (ok ? "" : "  got " + JSON.stringify(got) + " want " + JSON.stringify(want)));
}

var graph = C.eventGraph(), kindCounts = {};
graph.nodes.forEach(function (n) { kindCounts[n.kind] = (kindCounts[n.kind] || 0) + 1; });
report(kindCounts.patient === 4 && kindCounts.study === 2 && kindCounts.visit === 5, "distinct patient, study and visit nodes",
  kindCounts, { patient: 4, study: 2, visit: 5 });
var k1 = C.receptive(graph, 1, 1), k2 = C.receptive(graph, 1, 2);
var k1Nodes = k1.dist.filter(function (d) { return d !== Infinity; }).length;
var k2Nodes = k2.dist.filter(function (d) { return d !== Infinity; }).length;
report(k1.dist[1] === 0 && k1Nodes === 3 && k1.edges.length === 3 && k2Nodes === 6 && k2.edges.length === 7 &&
  k1.edges.every(function (e) { return k2.edges.indexOf(e) >= 0; }),
  "K expands the trace by one hop", { K1: [k1Nodes, k1.edges.length], K2: [k2Nodes, k2.edges.length] },
  { K1: [3, 3], K2: [6, 7], K1_edges_subset_of_K2: true });

Object.keys(ref.datasets).forEach(function (name) {
  var d = data[name], cache = C.prepare(d);
  ref.datasets[name].rows.forEach(function (row) {
    var a = C.analyse(d, cache, { k: row.k, K: ref.smooth_K, leak: row.leak });
    var got = { components: a.comp.count, edges: a.edges, h: a.h, h1: a.h1, f1_component: a.f1.component, f1_empty: a.f1.empty,
      f1_local_dk: a.f1.local, f1_smooth: a.f1.smooth };
    var bad = KEYS.filter(function (k) { return Math.abs(got[k] - row[k]) > 1e-9; });
    total++;
    if (bad.length) failures++;
    console.log((bad.length ? "FAIL " : "ok   ") + name + " k=" + row.k + (row.leak ? " leak" : "") +
      (bad.length ? "  " + bad.map(function (k) { return k + " " + got[k] + " vs " + row[k]; }).join("; ") : ""));
  });
});
console.log(failures ? failures + " of " + total + " rows differ" : "all " + total + " rows match the Python reference");
process.exit(failures ? 1 : 0);
