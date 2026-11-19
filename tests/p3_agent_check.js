// Agent emulator of section 5 (js/p3-agent-core.js): the trace replays the stub consilium faithfully,
// spends no tokens, keeps y unchanged and shows each fault where it acts. Run: node tests/p3_agent_check.js
"use strict";
var path = require("path");
var C = require(path.join(__dirname, "..", "js", "p3-core.js"));
var A = require(path.join(__dirname, "..", "js", "p3-agent-core.js"));

var failures = 0, total = 0;
function report(ok, label, got, want) {
  total++; if (!ok) failures++;
  console.log((ok ? "ok   " : "FAIL ") + label + (ok ? "" : "  got " + JSON.stringify(got) + " want " + JSON.stringify(want)));
}

var base = {
  detection: { detected: true, alarm_1d: 412, t_hat: 128 },
  ranking: { node_ids: ["B", "A", "D", "C", "E"], probabilities: [0.6481, 0.2, 0.1, 0.05, 0.0019] },
  graph: { method: "partial", nodes: ["A", "B", "C", "D", "E"], functional_edges: 4 },
  spec: { q: 0.98, gamma: 0.1, r: 3 },
  arrival_fit: "A", sigma3_alarm: 96
};
var meta = { n: 2048, series_fnv1a: "0123abcd" };
var STAGES = ["x", "f", "freeze", "s", "consilium", "report"];

["none", "misquote", "stubborn", "disagree", "threshold"].forEach(function (fault) {
  ["a", "b"].forEach(function (provider) {
    ["en", "ru"].forEach(function (lang) {
      var ev = C.deepFreeze(JSON.parse(JSON.stringify(base))), fp = C.fingerprint(ev);
      var out = C.consilium(ev, { provider: provider, fault: fault }, lang);
      var write = null;
      if (fault === "threshold") { try { ev.spec.q = 0.9; write = { ok: true }; } catch (e) { write = { ok: false, msg: e.name }; } }
      var t1 = A.trace(ev, out, meta, { fault: fault, provider: provider, write: write }, lang);
      var t2 = A.trace(ev, out, meta, { fault: fault, provider: provider, write: write }, lang);
      var tag = " fault=" + fault + " provider=" + provider + " lang=" + lang;

      report(JSON.stringify(t1) === JSON.stringify(t2), "deterministic" + tag);
      report(C.fingerprint(ev) === fp, "y unchanged by the trace" + tag);
      report(t1.every(function (s, i) { return s.i === i && STAGES.indexOf(s.stage) >= 0 && A.ACTORS[s.actor] && (s.phase === null || A.PHASES.indexOf(s.phase) >= 0); }),
        "well-formed steps" + tag);
      report(t1.every(function (s) { return !s.phase || A.ACTORS[s.actor].agent; }) && t1.every(function (s) { return A.ACTORS[s.actor].agent || s.phase === null; }),
        "only agents have loop phases" + tag);

      // every replayed message is a text of the consilium, in order
      var msgs = t1.filter(function (s) { return s.msg !== undefined; }).map(function (s) { return s.msg; });
      var want = [out.round1.evt, out.round1.graph, out.round1.loc, out.round2.evt, out.round2.graph, out.round2.loc, out.first].concat(out.rewritten ? [out.final] : []);
      report(JSON.stringify(msgs) === JSON.stringify(want), "messages replay the consilium" + tag, msgs.length, want.length);

      // each model call carries the R3 guard and the frozen summary; tokens are estimated, none spent
      var calls = t1.filter(function (s) { return s.call; }), guard = A.GUARD[lang];
      report(calls.length === msgs.length && calls.every(function (s) { return s.call.system.indexOf(guard) >= 0 && s.call.user.indexOf(JSON.stringify(ev)) >= 0 && s.call.tokens > 0; }),
        "calls: guard + s(y) in every prompt" + tag);
      var tot = A.totals(t1);
      report(tot.spent === 0 && tot.calls === calls.length && tot.tokens > 0, "0 tokens spent" + tag, tot);

      // separate bases: the cross-base request is refused; the number check follows every message
      report(t1.some(function (s) { return s.refused && s.tool && s.tool.args.base === "evt_db" && s.actor === "graph"; }), "cross-base refusal shown" + tag);
      var checks = t1.filter(function (s) { return s.actor === "checker" && s.check; });
      report(checks.length === msgs.length, "a number check after every message" + tag, checks.length, msgs.length);

      // the store keeps the unchanged fingerprint; the fault is flagged where it acts
      var last = t1[t1.length - 1];
      report(last.actor === "store" && last.status === "good" && last.body.indexOf(fp) >= 0, "store: fingerprint unchanged" + tag);
      var flagged = t1.filter(function (s) { return s.fault; });
      var expectFault = {
        none: flagged.length === 0,
        misquote: flagged.length === 1 && flagged[0].actor === "chair",
        stubborn: flagged.length === 2 && flagged.every(function (s) { return s.actor === "chair"; }),
        disagree: flagged.length === 2 && flagged.every(function (s) { return s.actor === "graph" && s.round === 2; }),
        threshold: flagged.some(function (s) { return s.tool && s.refused && s.stage === "freeze"; })
      }[fault];
      report(expectFault, "fault flagged where it acts" + tag, flagged.map(function (s) { return s.actor + ":" + s.title; }), fault);
    });
  });
});

// no event: the trace still runs and says so
var ev0 = C.deepFreeze({ detection: { detected: false, alarm_1d: -1, t_hat: null }, ranking: null,
  graph: { method: "corr", nodes: ["A", "B"], functional_edges: 0 }, spec: { q: 0.98, gamma: 0.1, r: 3 }, arrival_fit: null, sigma3_alarm: 50 });
var t0 = A.trace(ev0, C.consilium(ev0, { provider: "a", fault: "none" }, "en"), meta, { fault: "none" }, "en");
report(t0.length > 10 && t0[t0.length - 1].status === "good", "no-event input", t0.length, "> 10 steps");

report(A.estTokens("") === 0 && A.estTokens("abcd") === 1 && A.estTokens("абв") === 2, "token estimate");

console.log(failures ? failures + " of " + total + " checks differ" : "all " + total + " checks match");
process.exit(failures ? 1 : 0);
