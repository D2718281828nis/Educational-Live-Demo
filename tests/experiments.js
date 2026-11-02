// The "one sensor, five nodes" numbers quoted in the dissertation, reproduced outside the browser.
// Same code as the page (js/onedim-core.js: mcJobs, mcAdd, specGrid) with the page's default settings:
// Monte Carlo 20 seeds (1001–1020) × 4 sources, the same seed without the event for source 0, and the 8-spec grid.
// Run: node tests/experiments.js            → writes results/onedim_summary.json
//      node tests/experiments.js --check    → also compares with tests/fixtures/onedim_expected.json (exit 1 on mismatch)
"use strict";
var fs = require("fs"), path = require("path");
var C = require(path.join(__dirname, "..", "js", "onedim-core.js"));

function defaults() {                       // js/onedim.js defaults() and defaultSpec()
  var o = {}; for (var k in C.DEFAULTS) o[k] = C.DEFAULTS[k];
  o.hidden = -1; o.freqs = C.FREQS.slice();
  var g = {}; for (k in C.GRAPH) g[k] = C.GRAPH[k];
  return { o: o, spec: { q: 0.95, gamma: 0.999, r: 3, sigmaK: 3, sigmaR: 1, graph: g } };
}

var d = defaults(), acc = C.mcNew(), jobs = C.mcJobs();
jobs.forEach(function (job) { C.mcAdd(d.o, d.spec, job, acc); });
function summary(list) {
  var k = list.reduce(function (s, v) { return s + v.top; }, 0), dts = list.map(function (v) { return v.dt; }).filter(isFinite);
  var ci = C.wilson(k, list.length);
  return { top1: k, n: list.length, wilson95: [+ci[0].toFixed(4), +ci[1].toFixed(4)], median_abs_dt: dts.length ? C.quantile(dts, 0.5) : null };
}
var grid = C.specGrid(d.o, d.spec);
var out = {
  settings: "page defaults (js/onedim-core.js DEFAULTS, SPEC); seeds 1001–1020 × sources 0–3",
  methods: {
    chain_structural_graph: summary(acc.st), chain_functional_graph: summary(acc.fu), chain_empty_graph: summary(acc.em),
    chain_arrival_fit: summary(acc.fit), ksigma_per_channel_first: summary(acc.cross), ksigma_raw_series: summary(acc.raw)
  },
  event_free_series_with_alarm: { chain: acc.free.chain, ksigma_raw: acc.free.s3, ksigma_per_channel: acc.free.cross, n: acc.free.n },
  spec_grid: { right: grid.filter(function (c) { return c.right; }).length, n: grid.length,
               cells: grid.map(function (c) { return { q: c.q, gamma: c.gamma, r: c.r, right: c.right, t_hat: c.x.tHat }; }) }
};
fs.mkdirSync(path.join(__dirname, "..", "results"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "..", "results", "onedim_summary.json"), JSON.stringify(out, null, 1) + "\n");
var m = out.methods.chain_structural_graph, f = out.event_free_series_with_alarm;
console.log("source right (structural graph): " + m.top1 + "/" + m.n + ", Wilson " + m.wilson95.join("–") + ", median |t̂ − t*| = " + m.median_abs_dt);
console.log("structural / functional / empty graph: " + [out.methods.chain_structural_graph.top1, out.methods.chain_functional_graph.top1, out.methods.chain_empty_graph.top1].join(" / "));
console.log("event-free series with alarm: chain " + f.chain + "/" + f.n + ", 3σ raw " + f.ksigma_raw + "/" + f.n);
console.log("spec grid: " + out.spec_grid.right + "/" + out.spec_grid.n);

if (process.argv.indexOf("--check") >= 0) {
  var want = require(path.join(__dirname, "fixtures", "onedim_expected.json")), bad = [];
  (function cmp(a, b, p) {
    if (b !== null && typeof b === "object") { Object.keys(b).forEach(function (k) { cmp(a == null ? undefined : a[k], b[k], p + "." + k); }); return; }
    if (a !== b) bad.push(p + ": expected " + b + ", got " + a);
  })(out, want, "");
  console.log(bad.length ? bad.length + " mismatches:\n  " + bad.join("\n  ") : "all quoted numbers match tests/fixtures/onedim_expected.json");
  process.exit(bad.length ? 1 : 0);
}
