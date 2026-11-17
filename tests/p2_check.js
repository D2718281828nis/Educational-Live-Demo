// js/p2-core.js must reproduce tests/fixtures/p2_reference.json (tests/make_p2_reference.py, Python) on the page's data.
// Run: node tests/p2_check.js
"use strict";
var path = require("path");
var C = require(path.join(__dirname, "..", "js", "p2-core.js"));
var ref = require(path.join(__dirname, "fixtures", "p2_reference.json"));
var data = require(path.join(__dirname, "..", "data", "p2_datasets.json")).datasets;

var KEYS = ["components", "edges", "h", "h1", "f1_component", "f1_empty", "f1_local_dk", "f1_smooth"];
var failures = 0, total = 0;
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
