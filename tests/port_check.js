// js/onedim-core.js functionalGraph must reproduce graph_evt_agent.graph.build_graph (Python) on a fixed input.
// Reference: tests/fixtures/graph_methods_reference.json (tests/make_graph_reference.py). Run: node tests/port_check.js
"use strict";
var path = require("path");
var C = require(path.join(__dirname, "..", "js", "onedim-core.js"));
var ref = require(path.join(__dirname, "fixtures", "graph_methods_reference.json"));

var n = ref.data.length, p = ref.data[0].length;
var chans = [];
for (var j = 0; j < p; j++) chans.push(Float64Array.from(ref.data.map(function (row) { return row[j]; })));

function jsOptions(cfg) {
  return {
    method: cfg.method, threshold: cfg.edge_threshold, rule: cfg.edge_rule || "threshold", k: cfg.top_k_edges,
    maxLag: cfg.max_lag, lagStep: cfg.lag_step, order: cfg.ar_order || 2, ridge: cfg.ridge,
    prune: !!cfg.prune_indirect, lagTol: cfg.lag_tolerance
  };
}

var failures = 0;
ref.cases.forEach(function (c) {
  var g = C.functionalGraph(chans, 0, n, jsOptions(c.config)), worst = 0, adjOk = true;
  for (var a = 0; a < p; a++) for (var b = 0; b < p; b++) {
    if (a === b) continue;
    var want = c.dependence[a][b], got = g.dependence[a * p + b];
    worst = Math.max(worst, Math.abs(got - want) / Math.max(1e-9, Math.abs(want)));
    if (!!g.adjacency[a * p + b] !== !!c.adjacency[a][b]) adjOk = false;
  }
  var ok = worst < 1e-6 && adjOk;
  if (!ok) failures++;
  console.log((ok ? "ok   " : "FAIL ") + JSON.stringify(c.config) + "  max rel diff " + worst.toExponential(2) + (adjOk ? "" : "  adjacency differs"));
});
console.log(failures ? failures + " of " + ref.cases.length + " cases differ" : "all " + ref.cases.length + " cases match the Python reference");
process.exit(failures ? 1 : 0);
