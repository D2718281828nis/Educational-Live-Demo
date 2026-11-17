// js/p3-core.js verifyNumbers and parseVerdict must reproduce Graph-EVT-agent verify_numbers and parse_verdict (Python).
// Reference: tests/fixtures/p3_reference.json (tests/make_p3_reference.py). Run: node tests/p3_check.js
"use strict";
var path = require("path");
var C = require(path.join(__dirname, "..", "js", "p3-core.js"));
var ref = require(path.join(__dirname, "fixtures", "p3_reference.json"));

var failures = 0, total = 0;
function report(ok, label, got, want) {
  total++; if (!ok) failures++;
  console.log((ok ? "ok   " : "FAIL ") + label + (ok ? "" : "  got " + JSON.stringify(got) + " want " + JSON.stringify(want)));
}
ref.numbers.forEach(function (c) {
  var got = C.verifyNumbers(c.text, ref.evidence);
  report(JSON.stringify(got) === JSON.stringify(c.unverified), "verify_numbers  " + c.text, got, c.unverified);
});
ref.verdicts.forEach(function (c) {
  var got = C.parseVerdict(c.text);
  report(JSON.stringify(got) === JSON.stringify(c.verdict), "parse_verdict   " + JSON.stringify(c.text), got, c.verdict);
});

// Stub consilium: the evidence is frozen, every fault keeps y unchanged, and the protocol behaves as stated.
var ev = C.deepFreeze(JSON.parse(JSON.stringify(Object.assign({}, ref.evidence, { arrival_fit: "B", sigma3_alarm: 412 }))));
var before = C.fingerprint(ev);
["none", "misquote", "stubborn", "disagree", "threshold"].forEach(function (fault) {
  ["a", "b"].forEach(function (provider) {
    ["en", "ru"].forEach(function (lang) {
      var r = C.consilium(ev, { provider: provider, fault: fault }, lang), ok = C.fingerprint(ev) === before;
      var want = {
        none: !r.rewritten && !r.unverified.final && !r.disagreement.source,
        misquote: r.rewritten && !r.unverified.final && !r.disagreement.source,
        stubborn: r.rewritten && !!r.unverified.final,
        disagree: !r.rewritten && r.disagreement.source === true,
        threshold: !r.rewritten || !!r.unverified.final
      }[fault];
      if (fault === "threshold") want = r.rewritten && JSON.stringify(r.unverified.final) === JSON.stringify([lang === "ru" ? "0,90" : "0.90"]);
      report(ok && want && r.refused.denied, "consilium       fault=" + fault + " provider=" + provider + " lang=" + lang,
        { y_unchanged: ok, rewritten: r.rewritten, unverified: r.unverified, disagreement: r.disagreement }, "protocol");
    });
  });
});
console.log(failures ? failures + " of " + total + " checks differ" : "all " + total + " checks match");
process.exit(failures ? 1 : 0);
