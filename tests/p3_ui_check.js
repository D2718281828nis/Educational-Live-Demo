// UI helpers of section 5 (js/p3-ui-core.js): number-token diffs between consilium drafts and permalink state.
// Run: node tests/p3_ui_check.js
"use strict";
var path = require("path");
var C = require(path.join(__dirname, "..", "js", "p3-core.js"));
var U = require(path.join(__dirname, "..", "js", "p3-ui-core.js"));

var failures = 0, total = 0;
function report(ok, label, got, want) {
  total++; if (!ok) failures++;
  console.log((ok ? "ok   " : "FAIL ") + label + (ok ? "" : "  got " + JSON.stringify(got) + " want " + JSON.stringify(want)));
}

// --- diffNumbers: token-level diff of the chair's drafts, as shown in the "what the fault changed" panel
var d1 = U.diffNumbers("onset at sample 137 (alarm at 412).", "onset at sample 128 (alarm at 412).");
report(d1.pairs.length === 1 && d1.pairs[0].from === "137" && d1.pairs[0].to === "128" && d1.left.length === 0, "diff one corrected number", d1, "137→128");

var d2 = U.diffNumbers("- **When:** onset at sample 137.\n", "- **When:** onset at sample 137.\n");
report(d2.pairs.length === 0 && d2.left.length === 0, "diff identical drafts", d2, "no changes");

var d3 = U.diffNumbers("P = 0,65.", "P = 0.65.");
report(d3.pairs.length === 0, "decimal comma vs point is not a change", d3, "0,65 = 0.65");

// what the real consilium produces: misquote → one pair (wrong onset → true onset), stubborn → no pair
var ev = C.deepFreeze(JSON.parse(JSON.stringify({
  detection: { detected: true, alarm_1d: 412, t_hat: 128 },
  ranking: { node_ids: ["B", "A", "D", "C", "E"], probabilities: [0.6481, 0.2, 0.1, 0.05, 0.0019] },
  graph: { method: "partial", nodes: ["A", "B", "C", "D", "E"], functional_edges: 4 },
  spec: { q: 0.98, gamma: 0.1, r: 3 },
  arrival_fit: "A", sigma3_alarm: 96
})));
var mis = C.consilium(ev, { provider: "a", fault: "misquote" }, "en");
var dm = U.diffNumbers(mis.first, mis.final);
report(mis.rewritten && dm.pairs.length === 1 && String(dm.pairs[0].to) === String(ev.detection.t_hat), "consilium misquote diff", dm, "wrong → t_hat");
var stb = C.consilium(ev, { provider: "a", fault: "stubborn" }, "en");
var ds = U.diffNumbers(stb.first, stb.final);
report(stb.rewritten && ds.pairs.length === 0 && stb.unverified.final.length === 1, "consilium stubborn diff", { pairs: ds.pairs, unverified: stb.unverified.final }, "no pair, one unverified");

// --- permalink state: parse and build ?p3-fault=…&p3-provider=…
var FAULTS = ["none", "misquote", "stubborn", "disagree", "threshold"], PROVIDERS = ["a", "b"];
report(JSON.stringify(U.stateFromURL("?p3-fault=stubborn&p3-provider=b", FAULTS, PROVIDERS)) === JSON.stringify({ fault: "stubborn", provider: "b" }), "stateFromURL valid params");
report(JSON.stringify(U.stateFromURL("?p3-fault=bogus&p3-provider=a", FAULTS, PROVIDERS)) === JSON.stringify({ provider: "a" }), "stateFromURL drops unknown values");
report(JSON.stringify(U.stateFromURL("", FAULTS, PROVIDERS)) === JSON.stringify({}), "stateFromURL empty");

var url = U.stateURL("https://example.github.io/index?lang=ru", "disagree", "b");
var parsed = U.stateFromURL(new URL(url).search, FAULTS, PROVIDERS);
report(parsed.fault === "disagree" && parsed.provider === "b" && /[?&]lang=ru/.test(url) && url.indexOf("#p3") > 0, "stateURL round-trip", url, "params kept, hash #p3");

// --- probe line: the frozen-write refusal shown in the REST log
report(U.probeLine("en").indexOf("403 Frozen") > 0 && U.probeLine("ru").indexOf("403 Frozen") > 0, "probe line contains 403 Frozen");

console.log(failures ? failures + " of " + total + " checks differ" : "all " + total + " checks match");
process.exit(failures ? 1 : 0);
