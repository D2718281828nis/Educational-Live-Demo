// Section 6 (Conclusion): who computes what. Live values come from section 3 (eld:od-result) and section 5 (eld:p3-run).

(function () {
  "use strict";

  var root = document.documentElement;
  var table = document.getElementById("cc-table");
  if (!table) return;

  function $(id) { return document.getElementById(id); }
  function ru() { return root.getAttribute("data-lang") === "ru"; }
  function L(en, r) { return ru() ? r : en; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function num(v) { return ru() ? String(v).replace(".", ",") : String(v); }

  var SUM = null, RUN = null, sel = "when";

  function live(k) {
    if (!SUM) return "–";
    var d = SUM.detection, g = SUM.graph, rk = SUM.ranking;
    if (k === "when") return d.detected ? "t̂ = " + d.t_hat + L(" (1-D alarm ", " (1-D тревога ") + d.alarm_1d + ")" : L("no event", "события нет");
    if (k === "graph") return g.method + " · " + g.functional_edges + L(" edges · ", " рёбер · ") + g.nodes.length + L(" nodes", " узлов");
    if (k === "where") return rk ? rk.node_ids[0] + ": P = " + num(rk.probabilities[0]) + L(" · arrival fit ", " · приходы ") + (SUM.arrival_fit || "–") : L("not determined", "не определено");
    if (k === "report") {
      if (!RUN) return "–";
      var dis = RUN.out.disagreement || {}, anyDis = Object.keys(dis).some(function (x) { return dis[x]; });
      var unv = (RUN.out.unverified.final || []).length;
      return (anyDis ? L("verdict differs (kept)", "вердикт расходится (сохранено)") : L("verdict agrees", "вердикт совпадает")) + " · " +
        L("unverified ", "непроверенных ") + unv + " · y " + (RUN.fp0 === RUN.fp1 ? L("unchanged", "не изменён") + " ✓" : L("CHANGED", "ИЗМЕНЁН"));
    }
    return "–";
  }

  function detail(k) {
    var s = SUM, d = s && s.detection, sp = s && s.spec;
    var D = {
      when: {
        h: L("when — the onset moment t̂", "когда — момент начала t̂"),
        who: L("Planner agent (rules policy) · action detect_evt", "Агент-планировщик (политика-правила) · действие detect_evt"),
        how: [
          L("Robust z per channel: z = |X − median| / (1.4826·MAD), the median and MAD from the background only.", "Робастный z по каналу: z = |X − медиана| / (1,4826·MAD), медиана и MAD — только по фону."),
          L("Top-k indicator: the mean of the k largest z across channels (top_k = 3).", "Индикатор top-k: среднее k наибольших z по каналам (top_k = 3)."),
          L("POT/GPD on the background: u = the 0.95 quantile; the excesses over u follow a GPD; the alarm threshold is the 0.999 level (empirical quantile if fewer than 5 excesses).", "POT/GPD на фоне: u — квантиль 0,95; превышения над u — ОРП; порог тревоги — уровень 0,999 (эмпирический квантиль, если превышений меньше 5)."),
          L("Run rule: t̂ is the first moment after the background with r = 3 exceedances in a row (persistence).", "Правило серии: t̂ — первый момент после фона с r = 3 превышениями подряд (persistence).")
        ],
        ret: L("EVTDetection: detected, time_index = t̂, alarm_threshold, indicator, location, scale; evt.find_events — every onset of the record (refractory 50, re-arm below the frozen threshold).",
          "EVTDetection: detected, time_index = t̂, alarm_threshold, indicator, location, scale; evt.find_events — все начала записи (refractory 50, перевзвод ниже замороженного порога)."),
        page: s ? L("On this page: q = " + sp.q + ", γ = " + sp.gamma + ", r = " + sp.r + "; " + (d.detected ? "t̂ = " + d.t_hat + ", 1-D alarm at " + d.alarm_1d : "no event") + ".",
          "На странице: q = " + num(sp.q) + ", γ = " + num(sp.gamma) + ", r = " + sp.r + "; " + (d.detected ? "t̂ = " + d.t_hat + ", одномерная тревога — " + d.alarm_1d : "события нет") + ".") : "",
        stop: L("Stop rule: no persistent alarm → no_evt_detected.", "Правило остановки: нет устойчивой тревоги → no_evt_detected."),
        check: L("Positive control (§ 3): 0 alarms in 20 event-free series against 16 for the 3σ rule; the right answer under 8 of 8 specifications.", "Положительный контроль (§ 3): 0 тревог в 20 рядах без события против 16 у правила 3σ; верный ответ при 8 из 8 спецификаций."),
        link: ["#od-when", L("See stage 1 in section 3 ↑", "Этап 1 в разделе 3 ↑")]
      },
      graph: {
        h: L("graph — the edges: how the graph of the system looks", "граф — рёбра: как выглядит граф системы"),
        who: L("Planner agent · action build_baseline_graph (after the structural analysis)", "Агент-планировщик · действие build_baseline_graph (после структурного анализа)"),
        how: [
          L("Structural: edges from the known structure of the object (physical, sector, anatomical).", "Структурный: рёбра по известной структуре объекта (физической, отраслевой, анатомической)."),
          L("Functional: edges estimated from the background only — corr, partial, xcorr, pwxcorr, granger or their ensemble, with a surrogate threshold.", "Функциональный: рёбра оцениваются только по фону — corr, partial, xcorr, pwxcorr, granger или их ансамбль, с порогом по суррогатам."),
          L("With one sensor (§ 3) the structural analysis first finds the nodes (spectral peaks) and one envelope per node.", "При одном датчике (§ 3) структурный анализ сначала находит узлы (спектральные пики) и огибающую на узел.")
        ],
        ret: L("GraphResult: adjacency (edges), dependence (pairwise scores), method (the one that ran), diagnostics.", "GraphResult: adjacency (рёбра), dependence (попарные оценки), method (фактический метод), diagnostics."),
        page: s ? L("On this page: method " + s.graph.method + ", " + s.graph.functional_edges + " functional edges over nodes " + s.graph.nodes.join(", ") + ".",
          "На странице: метод " + s.graph.method + ", функциональных рёбер " + s.graph.functional_edges + " на узлах " + s.graph.nodes.join(", ") + ".") : "",
        stop: L("Status: the estimated structure — an association, not a causal link.", "Статус: оценённая структура — ассоциация, а не причинная связь."),
        check: L("Its value is tested by the same model with and without edges: 77 / 77 / 78 correct of 80 for structural / functional / empty (§ 3); on the three real systems no graph is confirmed.", "Ценность проверяется той же моделью с рёбрами и без: 77 / 77 / 78 верных из 80 для структурного / функционального / пустого (§ 3); на трёх реальных системах ни один граф не подтверждён."),
        link: ["#od-edges", L("See the edges in section 3 ↑", "Рёбра в разделе 3 ↑")]
      },
      where: {
        h: L("where — a distribution P(ŝ = v) over the nodes", "где — распределение P(ŝ = v) по узлам"),
        who: L("Planner agent · action rank_source", "Агент-планировщик · действие rank_source"),
        how: [
          L("Transparent ranking at t̂ on the graph: P(ŝ = j) = softmax_j(peak_j + √E_j + 0.15·nbr_j − 0.5·lat_j).", "Прозрачное ранжирование в момент t̂ на графе: P(ŝ = j) = softmax_j(peak_j + √E_j + 0,15·nbr_j − 0,5·lat_j)."),
          L("The arrival-time fit ŝ = arg min_v ‖P(a − d_v/c)‖² is reported next to it, not merged with it.", "Подгонка по временам прихода ŝ = arg min_v ‖P(a − d_v/c)‖² сообщается рядом и не сливается с ним."),
          L("Optional: GNN / GAT process models on the same graph.", "Дополнительно: процессные модели GNN / GAT на том же графе.")
        ],
        ret: L("SourceRanking: node_ids and probabilities, plus the node features behind them.", "SourceRanking: node_ids и probabilities, а также признаки узлов, на которых они основаны."),
        page: s && s.ranking ? L("On this page: " + s.ranking.node_ids.map(function (v, i) { return v + " " + num(s.ranking.probabilities[i]); }).join(" · ") + "; arrival fit " + (s.arrival_fit || "–") + ".",
          "На странице: " + s.ranking.node_ids.map(function (v, i) { return v + " " + num(s.ranking.probabilities[i]); }).join(" · ") + "; подгонка приходов — " + (s.arrival_fit || "–") + ".") : L("On this page: no ranking.", "На странице: ранжирования нет."),
        stop: L("Stop rule: one channel without structural analysis → single_channel_cannot_localize (Theorem 6.1).", "Правило остановки: один канал без структурного анализа → single_channel_cannot_localize (теорема 6.1)."),
        check: L("An auxiliary result of the 2.3.5 version: not published, not put forward for defence.", "Вспомогательный результат версии 2.3.5: не опубликован и на защиту не выносится."),
        link: ["#od-rank", L("See rank_source in section 3 ↑", "rank_source в разделе 3 ↑")]
      },
      report: {
        h: L("conclusion — written by the LLM agents, checked", "заключение — пишут LLM-агенты, сверяется"),
        who: L("LLM agents (EVTAgentTeam): reviewers of the input, EVT, graph and localization, and the coordinator", "LLM-агенты (EVTAgentTeam): рецензенты входа, EVT, графа и локализации и координатор"),
        how: [
          L("They receive the frozen bounded summary s(y), never the raw series.", "Получают замороженную ограниченную сводку s(y), а не сырой ряд."),
          L("Each writes through complete(system, user) with the guard “rely only on the JSON, do not change the numerical results”.", "Каждый пишет через complete(system, user) с ограничением «опирайся только на JSON, не изменяй численные результаты»."),
          L("verify_numbers checks every number against s(y); one rewrite; what remains is marked.", "verify_numbers сверяет каждое число с s(y); одна переписка; остаток помечается."),
          L("parse_verdict reads the JSON verdict; the disagreement with the pipeline is stored, not resolved.", "parse_verdict читает JSON-вердикт; расхождение с конвейером сохраняется, а не разрешается.")
        ],
        ret: L("AgentReport: the reviews, final_report, pipeline_verdict, agent_verdict, disagreement, unverified_numbers, final_report_rewritten.", "AgentReport: отзывы, final_report, pipeline_verdict, agent_verdict, disagreement, unverified_numbers, final_report_rewritten."),
        page: RUN ? L("On this page: fingerprint of y " + RUN.fp0 + " before and " + RUN.fp1 + " after the agent layer; fault “" + RUN.fault + "”, stub " + RUN.provider.toUpperCase() + ".",
          "На странице: отпечаток y " + RUN.fp0 + " до и " + RUN.fp1 + " после агентного слоя; ошибка «" + RUN.fault + "», заглушка " + RUN.provider.toUpperCase() + ".") : "",
        stop: L("They cannot change a number: no tool of theirs writes to y.", "Изменить число они не могут: ни один их инструмент не пишет в y."),
        check: L("The system supports the decision; it does not make it. Agreement with experts was not measured.", "Система поддерживает решение, а не принимает его. Согласие с экспертами не измерялось."),
        link: ["#p3-emu", L("Watch it in the emulator (5.2) ↑", "Посмотреть в эмуляторе (5.2) ↑")]
      }
    };
    return D[k];
  }

  function render() {
    table.querySelectorAll("[data-live]").forEach(function (td) { td.textContent = live(td.getAttribute("data-live")); });
    table.querySelectorAll("tr[data-k]").forEach(function (tr) {
      var on = tr.getAttribute("data-k") === sel;
      tr.classList.toggle("sel", on);
      tr.setAttribute("aria-selected", String(on));
    });
    var x = detail(sel);
    $("cc-detail").innerHTML = "<h4>" + esc(x.h) + "</h4>" +
      '<div class="cc-who"><span class="p3e-dot agent' + (sel === "report" ? "" : " rules") + '"></span>' + esc(x.who) + "</div>" +
      '<div class="panel-label">' + L("How", "Как") + "</div><ol>" + x.how.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ol>" +
      '<div class="panel-label">' + L("Returns", "Возвращает") + "</div><p>" + esc(x.ret) + "</p>" +
      (x.page ? '<p class="cc-live">' + esc(x.page) + "</p>" : "") +
      "<p>" + esc(x.stop) + "</p><p class=\"muted\">" + esc(x.check) + "</p>" +
      '<a class="btn small" href="' + x.link[0] + '">' + esc(x.link[1]) + "</a>";
  }

  table.querySelectorAll("tr[data-k]").forEach(function (tr) {
    var pick = function () { sel = tr.getAttribute("data-k"); render(); };
    tr.addEventListener("click", pick);
    tr.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  });
  document.addEventListener("eld:od-result", function (e) { SUM = e.detail.summary; render(); });
  document.addEventListener("eld:p3-run", function (e) { RUN = e.detail; render(); });
  document.addEventListener("eld:lang", render);
  if (window.ELD_OD_RESULT) SUM = window.ELD_OD_RESULT.summary;
  if (window.ELD_P3_RUN) RUN = window.ELD_P3_RUN;
  render();
})();
