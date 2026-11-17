// Numerics of section 5 (Position 3): the rules that keep an agent layer from changing the numbers.
// verify_numbers, parse_verdict and the disagreement mark are ported from Graph-EVT-agent `graph_evt_agent/agents.py`
// (commit 244474c) and checked against it by tests/p3_check.js. The agents here are a stub client, as in R3's tests:
// no language model runs on the page. Works in the browser (window.P3Core) and in Node (module.exports).

(function (global) {
  "use strict";

  // Python: (?<![\w.])[-−]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)? with Unicode \w.
  var NUMBER = /(?<![\p{L}\p{N}_.])[-−]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?/gu;

  // Numbers of a text as {raw, value, decimals, index}; "13,3" and "13.3" are the same number.
  function numbers(text) {
    var out = [], m;
    NUMBER.lastIndex = 0;
    while ((m = NUMBER.exec(String(text))) !== null) {
      var raw = m[0], s = raw.replace("−", "-").replace(",", ".");
      var mant = s.split(/[eE]/)[0], dot = mant.indexOf(".");
      out.push({ raw: raw, value: parseFloat(s), decimals: dot >= 0 ? mant.length - dot - 1 : 0, index: m.index });
    }
    return out;
  }

  function evidenceValues(obj) {
    if (obj === null || obj === undefined || typeof obj === "boolean") return [];
    if (typeof obj === "number") return isFinite(obj) ? [obj] : [];
    if (typeof obj === "string") return numbers(obj).map(function (n) { return n.value; });
    if (Array.isArray(obj)) return obj.reduce(function (a, x) { return a.concat(evidenceValues(x)); }, []);
    if (typeof obj === "object") return Object.keys(obj).reduce(function (a, k) { return a.concat(evidenceValues(obj[k])); }, []);
    return [];
  }

  // eq:fidelity. A number with d decimals is verified when some evidence value e has |a − e| ≤ 0.5·10^-d (also a = 100·e,
  // percentages). Integers below skipSmallInt are not checked. Returns every number with its status and the matched value.
  function checkNumbers(text, evidence, relTol, skipSmallInt) {
    relTol = relTol == null ? 1e-9 : relTol; skipSmallInt = skipSmallInt == null ? 10 : skipSmallInt;
    var known = evidenceValues(evidence);
    return numbers(text).map(function (n) {
      var a = n.value;
      if (n.decimals === 0 && Math.abs(a) < skipSmallInt && Number.isInteger(a)) { n.status = "skipped"; return n; }
      var tol = 0.5 * Math.pow(10, -n.decimals) + relTol * Math.abs(a);
      for (var i = 0; i < known.length; i++) {
        var e = known[i];
        if (Math.abs(a - e) <= tol) { n.status = "ok"; n.match = e; n.tol = tol; return n; }
        if (Math.abs(a - 100 * e) <= tol) { n.status = "ok"; n.match = e; n.percent = true; n.tol = tol; return n; }
      }
      n.status = "bad"; n.tol = tol;
      return n;
    });
  }
  function verifyNumbers(text, evidence, relTol, skipSmallInt) {
    return checkNumbers(text, evidence, relTol, skipSmallInt).filter(function (n) { return n.status === "bad"; }).map(function (n) { return n.raw; });
  }

  // The coordinator's structured verdict: the last JSON object with "event_detected".
  var VERDICT = /\{[^{}]*"event_detected"[^{}]*\}/g;
  function parseVerdict(text) {
    var found = String(text).match(VERDICT);
    if (!found) return null;
    try {
      var v = JSON.parse(found[found.length - 1]);
      return typeof v.event_detected === "boolean" ? v : null;
    } catch (e) { return null; }
  }
  // eq:disagree: which fields of the agents' verdict differ from the pipeline's.
  function disagreement(pipeline, agent) {
    if (!agent) return null;
    var out = {};
    Object.keys(pipeline).forEach(function (k) { if (k in agent) out[k] = agent[k] !== pipeline[k]; });
    return out;
  }

  // FNV-1a over a canonical JSON (sorted keys): the fingerprint of the numerical result y.
  function canonical(v) {
    if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + canonical(v[k]); }).join(",") + "}";
    return JSON.stringify(v);
  }
  function fingerprint(v) {
    var s = canonical(v), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("00000000" + h.toString(16)).slice(-8);
  }
  function deepFreeze(o) {
    if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach(function (k) { deepFreeze(o[k]); }); }
    return o;
  }

  // ------------------------------------------------------------ separate RAG bases (one per role) and retrieval
  var BASES = {
    evt_db: [
      { id: 1, en: "POT/GPD: the threshold u is the q-quantile of the background; excesses over u follow a generalized Pareto law.", ru: "POT/GPD: порог u — квантиль q фона; превышения над u подчиняются обобщённому закону Парето." },
      { id: 2, en: "Run rule: an alarm needs r exceedances in a row; ARL0 = μ_r(1 − γ) grows fast with r.", ru: "Правило серии: тревога требует r превышений подряд; ARL0 = μ_r(1 − γ) быстро растёт с r." },
      { id: 3, en: "The 3σ rule assumes a normal law; on heavy tails it raises alarms on event-free series.", ru: "Правило 3σ предполагает нормальный закон; на тяжёлых хвостах оно даёт тревоги на рядах без события." }
    ],
    graph_db: [
      { id: 1, en: "The graph is a testable hypothesis, not a causal claim.", ru: "Граф — проверяемая гипотеза, а не утверждение о причинности." },
      { id: 2, en: "The value of a graph is Δ_G = M(f(X, A)) − M(f(X, ∅)): the same model with and without edges.", ru: "Ценность графа — Δ_G = M(f(X, A)) − M(f(X, ∅)): та же модель с рёбрами и без них." },
      { id: 3, en: "Edges help only when they are homophilous and the class is not visible in small neighbourhoods.", ru: "Рёбра помогают, только если они гомофильны, а класс не виден в малых окрестностях." }
    ],
    dict_db: [
      { id: 1, en: "Object dictionary: nodes A–E are named by their characteristic frequencies.", ru: "Словарь объекта: узлы A–E названы по характерным частотам." },
      { id: 2, en: "One sensor cannot tell the source (Theorem 6.1): the structural analysis must produce an n-D series first.", ru: "Один датчик не различает источник (теорема 6.1): сначала структурный анализ строит n-D-ряд." },
      { id: 3, en: "Source ranking is a distribution P(ŝ = v), reported next to the arrival-time estimate, not merged with it.", ru: "Ранжирование источника — распределение P(ŝ = v); оно сообщается рядом с оценкой по временам прихода и не сливается с ней." }
    ]
  };
  var ROLES = [
    { id: "evt", base: "evt_db", en: "EVT reviewer", ru: "Рецензент EVT", p21: { en: "professor (textbooks base)", ru: "профессор (база учебников)" } },
    { id: "graph", base: "graph_db", en: "Graph reviewer", ru: "Рецензент графа", p21: { en: "neurologist (clinical guidelines base)", ru: "невролог (база клинических рекомендаций)" } },
    { id: "loc", base: "dict_db", en: "Localization reviewer", ru: "Рецензент локализации", p21: { en: "intern", ru: "интерн" } },
    { id: "chair", base: null, en: "Chair (coordinator)", ru: "Председатель (координатор)", p21: { en: "chair of the consilium", ru: "председатель консилиума" } }
  ];
  // A role may query only its own base; any other base is refused.
  function retrieve(role, base) {
    var r = ROLES.filter(function (x) { return x.id === role; })[0];
    if (!r || r.base !== base) return { denied: true, base: base };
    return { denied: false, base: base, hits: BASES[base] };
  }

  // ------------------------------------------------------------ stub consilium
  // ev: the summary s(y) (frozen). opts: provider "a" | "b"; fault "none" | "misquote" | "stubborn" | "disagree" | "threshold".
  function f(v, d, lang) { var s = Number(v).toFixed(d); return lang === "ru" ? s.replace(".", ",").replace("-", "−") : s; }
  function consilium(ev, opts, lang) {
    var ru = lang === "ru", L = function (en, r) { return ru ? r : en; };
    var prov = opts.provider || "a", fault = opts.fault || "none";
    var det = ev.detection, rk = ev.ranking, gr = ev.graph;
    var top = rk ? rk.node_ids[0] : null, pTop = rk ? rk.probabilities[0] : null;
    var pTxt = function (p) { return prov === "a" ? f(p, 2, lang) : f(100 * p, 1, lang) + " %"; };
    var out = { round1: {}, round2: {}, retrieval: {} };

    ROLES.forEach(function (r) { if (r.base) out.retrieval[r.id] = retrieve(r.id, r.base); });
    // a cross-base request is logged and refused (separate RAG bases)
    out.refused = retrieve("graph", "evt_db");

    // round 1: independent conclusions, each from the summary and its own base
    out.round1.evt = det.detected
      ? L("The 1-D alarm at E fired at sample " + det.alarm_1d + "; the n-D onset is t̂ = " + det.t_hat + " (q = " + f(ev.spec.q, 2, lang) + ", r = " + ev.spec.r + ") [evt_db#1, #2].",
          "Одномерная тревога в E — отсчёт " + det.alarm_1d + "; начало по n-D t̂ = " + det.t_hat + " (q = " + f(ev.spec.q, 2, lang) + ", r = " + ev.spec.r + ") [evt_db#1, #2].")
      : L("No extreme event: the run rule was not met [evt_db#2].", "Экстремального события нет: правило серии не выполнено [evt_db#2].");
    out.round1.graph = L("Graph: " + gr.nodes.length + " nodes from the background, " + gr.functional_edges + " functional edges by " + gr.method + ". It is a hypothesis; its value is measured against the empty graph [graph_db#1, #2].",
      "Граф: " + gr.nodes.length + " узлов по фону, " + gr.functional_edges + " функциональных рёбер методом " + gr.method + ". Это гипотеза; её ценность измеряется против пустого графа [graph_db#1, #2].");
    out.round1.loc = rk
      ? L("Source " + top + " with P = " + pTxt(pTop) + "; the arrival fit names " + (ev.arrival_fit || "–") + " [dict_db#2, #3].",
          "Источник " + top + " с P = " + pTxt(pTop) + "; подгонка приходов называет " + (ev.arrival_fit || "–") + " [dict_db#2, #3].")
      : L("No ranking: the chain stopped before rank_source [dict_db#2].", "Ранжирования нет: конвейер остановился до rank_source [dict_db#2].");

    // round 2: debate — each reviewer answers the others
    out.round2.evt = L("Agree with the localization reviewer; note that the 3σ rule alarmed at sample " + (ev.sigma3_alarm >= 0 ? ev.sigma3_alarm : "–") + ", which is not evidence of an event [evt_db#3].",
      "Согласен с рецензентом локализации; правило 3σ дало тревогу на отсчёте " + (ev.sigma3_alarm >= 0 ? ev.sigma3_alarm : "–") + ", это не довод в пользу события [evt_db#3].");
    out.round2.graph = fault === "disagree" && rk
      ? L("I dispute the ranking: the source should be " + (rk.node_ids[1] || top) + ", the second candidate.", "Оспариваю ранжирование: источником должен быть " + (rk.node_ids[1] || top) + ", второй кандидат.")
      : L("No objection: the source rests on the node features, so the answer should not depend on the graph [graph_db#3].",
          "Возражений нет: источник опирается на признаки узлов, и ответ не должен зависеть от графа [graph_db#3].");
    out.round2.loc = rk && ev.arrival_fit && ev.arrival_fit !== top
      ? L("The two estimates differ (" + top + " vs " + ev.arrival_fit + "); they are kept side by side [dict_db#3].", "Две оценки расходятся (" + top + " и " + ev.arrival_fit + "); они сохраняются рядом [dict_db#3].")
      : L("The two estimates agree; nothing to merge [dict_db#3].", "Две оценки совпадают; сводить нечего [dict_db#3].");
    if (fault === "threshold") out.round2.evt += L(" Proposal: lower q to 0.90 to alarm earlier.", " Предложение: снизить q до 0,90, чтобы тревога была раньше.");

    // the chair's conclusion (Markdown) and verdict (JSON)
    var agentSource = fault === "disagree" && rk ? (rk.node_ids[1] || top) : top;
    // A misquoted onset: the first integer from t̂ + 7 that is not a value of the summary (a wrong number that happens to
    // equal another value of the summary would pass the check: it is necessary, not sufficient).
    var tWrong = det.t_hat;
    if (det.detected && det.t_hat != null) { tWrong = Math.max(10, det.t_hat + 7); while (!verifyNumbers(String(tWrong), ev).length) tWrong++; }
    function chair(wrongT) {
      var t = wrongT ? tWrong : det.t_hat, p = pTop;
      var md = "### " + L("Conclusion of the consilium", "Заключение консилиума") + "\n\n";
      md += det.detected
        ? L("- **When:** onset at sample " + t + " (1-D alarm at " + det.alarm_1d + ").\n", "- **Когда:** начало на отсчёте " + t + " (одномерная тревога — " + det.alarm_1d + ").\n")
        : L("- **When:** no extreme event.\n", "- **Когда:** экстремального события нет.\n");
      md += rk
        ? L("- **Where:** node " + agentSource + (agentSource === top ? ", P = " + pTxt(p) : " (disputed in round 2)") + ".\n", "- **Где:** узел " + agentSource + (agentSource === top ? ", P = " + pTxt(p) : " (оспорено во втором раунде)") + ".\n")
        : L("- **Where:** not determined.\n", "- **Где:** не определено.\n");
      md += L("- **Graph:** " + gr.functional_edges + " edges, a hypothesis checked against the empty graph.\n", "- **Граф:** рёбер " + gr.functional_edges + ", гипотеза, проверяемая против пустого графа.\n");
      if (fault === "threshold") md += L("- **Proposal:** lower q to 0.90.\n", "- **Предложение:** снизить q до 0,90.\n");
      md += L("- The system supports the decision; it does not make it.\n", "- Система поддерживает решение, а не принимает его.\n");
      md += "\n```json\n" + JSON.stringify({ event_detected: !!det.detected, source: rk ? agentSource : null }) + "\n```";
      return md;
    }
    var first = chair(fault === "misquote" || fault === "stubborn");
    var bad1 = verifyNumbers(first, ev);
    var final = first, rewritten = false;
    if (bad1.length) {                                       // one rewrite; what remains is marked
      rewritten = true;
      final = chair(fault === "stubborn");
    }
    out.first = first; out.firstBad = bad1; out.final = final; out.rewritten = rewritten;
    out.unverified = {};
    ["evt", "graph", "loc"].forEach(function (k) {
      var b1 = verifyNumbers(out.round1[k], ev), b2 = verifyNumbers(out.round2[k], ev);
      if (b1.length || b2.length) out.unverified[k] = b1.concat(b2);
    });
    var bf = verifyNumbers(final, ev);
    if (bf.length) out.unverified.final = bf;
    out.pipelineVerdict = { event_detected: !!det.detected, source: top };
    out.agentVerdict = parseVerdict(final);
    out.disagreement = disagreement(out.pipelineVerdict, out.agentVerdict);
    return out;
  }

  var api = {
    numbers: numbers, evidenceValues: evidenceValues, checkNumbers: checkNumbers, verifyNumbers: verifyNumbers,
    parseVerdict: parseVerdict, disagreement: disagreement, fingerprint: fingerprint, deepFreeze: deepFreeze,
    BASES: BASES, ROLES: ROLES, retrieve: retrieve, consilium: consilium
  };
  global.P3Core = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
