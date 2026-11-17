// UI helpers of section 5 (Position 3): pure functions that back the didactic layer of js/p3.js.
// Kept separate from p3-core.js (the numerical core checked against Graph-EVT-agent) and tested in Node.
// Works in the browser (window.P3UICore) and in Node (module.exports).

(function (global) {
  "use strict";

  // Numbers of a text as tokens, using the same pattern as p3-core.numbers (re-implemented to stay dependency-free).
  var NUMBER = /(?<![\p{L}\p{N}_.])[-−]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?/gu;
  function tokens(text) {
    var out = [], m;
    NUMBER.lastIndex = 0;
    while ((m = NUMBER.exec(String(text))) !== null) out.push(m[0]);
    return out;
  }

  // What an injected fault changed between the first draft and the final conclusion:
  // pairs of number tokens that differ at the same position, plus tokens of the first draft that have no
  // counterpart at the same position (kept unverified). Strings are compared as parsed numbers, so
  // "0.90" and "0,90" are equal.
  function valueOf(raw) { return parseFloat(String(raw).replace("−", "-").replace(",", ".")); }
  function diffNumbers(first, final) {
    var a = tokens(first), b = tokens(final), pairs = [], left = [];
    var n = Math.max(a.length, b.length);
    for (var i = 0; i < n; i++) {
      if (i >= a.length) break;                       // extra tokens of the final: not an effect of the fault
      if (i >= b.length) { left.push(a[i]); continue; }
      if (valueOf(a[i]) !== valueOf(b[i])) pairs.push({ from: a[i], to: b[i] });
    }
    return { pairs: pairs, left: left };
  }

  // Permalink state: read and build ?p3-fault=…&p3-provider=…, ignoring unknown values.
  function stateFromURL(search, faults, providers) {
    var out = {};
    try {
      var sp = new URLSearchParams(search || "");
      var f = sp.get("p3-fault"), p = sp.get("p3-provider");
      if (f && faults.indexOf(f) >= 0) out.fault = f;
      if (p && providers.indexOf(p) >= 0) out.provider = p;
    } catch (e) {}
    return out;
  }
  function stateURL(href, fault, provider) {
    var url;
    try { url = new URL(href); } catch (e) { return href; }
    url.searchParams.set("p3-fault", fault);
    url.searchParams.set("p3-provider", provider);
    url.hash = "p3";
    return url.toString();
  }

  // The probe line shown in the REST log: the agent layer tries to write the summary and is refused by the freeze.
  function probeLine(lang) {
    return lang === "ru"
      ? "PATCH s(y).spec.q = 0,90  →  403 Frozen — сводка заморожена, запись невозможна"
      : "PATCH s(y).spec.q = 0.90  →  403 Frozen — the summary is frozen, writes are refused";
  }

  var api = { tokens: tokens, diffNumbers: diffNumbers, stateFromURL: stateFromURL, stateURL: stateURL, probeLine: probeLine };
  global.P3UICore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
