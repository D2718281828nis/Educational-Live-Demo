// Section 5.4 (Position 3): one agentic architecture — the numerical planner and the LLM agents as agents of one system.
// A: the same passport for every agent; B: the planner agent's plan → act → observe loop with "what-if" observations;
// C: the tool matrix (which agent may call which tool). Logic in js/p3-agent-core.js (plannerRun, tryTool), tested in Node.

(function () {
  "use strict";

  var A = window.P3AgentCore;
  var root = document.documentElement;
  if (!A || !document.getElementById("p3-arch")) return;

  function $(id) { return document.getElementById(id); }
  function ru() { return root.getAttribute("data-lang") === "ru"; }
  function L(en, r) { return ru() ? r : en; }
  function T(pair) { return pair[ru() ? 1 : 0]; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function press(sel, val) { document.querySelectorAll(sel + " [data-v]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === String(val))); }); }

  var AGENTS = ["planner", "evt", "graph", "loc", "chair"];
  var ROWS = [
    ["role", ["Role", "Роль"]], ["sees", ["Observes", "Наблюдает"]], ["policy", ["Policy", "Политика"]], ["tools", ["Tools", "Инструменты"]],
    ["memory", ["Memory", "Память"]], ["output", ["Output", "Выход"]], ["numbers", ["May change the numbers?", "Может ли менять числа?"]], ["code", ["In Graph-EVT-agent", "В Graph-EVT-agent"]]
  ];
  var PASS = {
    planner: {
      role: ["plan the numerical route and run the tools — it solves “when”, the edges and “where”", "спланировать численный маршрут и выполнить инструменты — решает «когда», рёбра и «где»"],
      sees: ["the raw series X, its shape (p channels, background), the result of every tool", "сырой ряд X, его форму (p каналов, фон), результат каждого инструмента"],
      policy: ["fixed rules: route 1-D or n-D, the next tool, stop rules — deterministic, no LLM", "фиксированные правила: маршрут 1-D или n-D, следующий инструмент, правила остановки — детерминированно, без LLM"],
      tools: ["detect_evt, structural analysis, build_baseline_graph, rank_source", "detect_evt, структурный анализ, build_baseline_graph, rank_source"],
      memory: ["the plan and the completed actions (PipelinePlan)", "план и выполненные действия (PipelinePlan)"],
      output: ["y = {t̂, edges, P(ŝ = v)} → freeze(y) → the summary s(y)", "y = {t̂, рёбра, P(ŝ = v)} → freeze(y) → сводка s(y)"],
      numbers: ["it computes them; it writes y only before freeze(y)", "вычисляет их; записывает y только до freeze(y)"],
      code: ["PipelinePlanner.plan / observe · GraphEVTPipeline.run_detailed", "PipelinePlanner.plan / observe · GraphEVTPipeline.run_detailed"]
    },
    evt: {
      role: ["audit the “when”: threshold, run rule, the 3σ comparison", "проверить «когда»: порог, правило серии, сравнение с 3σ"],
      sees: ["the frozen summary s(y), its base evt_db, the round-1 reviews", "замороженную сводку s(y), свою базу evt_db, отзывы раунда 1"],
      policy: ["a language model (Mistral in R3; replayed here, 0 tokens)", "языковая модель (Mistral в R3; здесь воспроизведение, 0 токенов)"],
      tools: ["retrieve(evt_db), complete(system, user)", "retrieve(evt_db), complete(system, user)"],
      memory: ["its context window only; no shared memory", "только окно контекста; общей памяти нет"],
      output: ["review text; every number checked by M6", "текст отзыва; каждое число сверяет М6"],
      numbers: ["no — it can only return text", "нет — может только вернуть текст"],
      code: ["EVTAgentTeam.run · EVT-detection reviewer", "EVTAgentTeam.run · рецензент EVT-детекции"]
    },
    graph: {
      role: ["audit the graph: method, edges, leakage; a hypothesis, not a cause", "проверить граф: метод, рёбра, утечку; гипотеза, а не причина"],
      sees: ["the frozen summary s(y), its base graph_db, the round-1 reviews", "замороженную сводку s(y), свою базу graph_db, отзывы раунда 1"],
      policy: ["a language model (replayed here)", "языковая модель (здесь воспроизведение)"],
      tools: ["retrieve(graph_db), complete(system, user)", "retrieve(graph_db), complete(system, user)"],
      memory: ["its context window only", "только окно контекста"],
      output: ["review text; every number checked by M6", "текст отзыва; каждое число сверяет М6"],
      numbers: ["no — it can only return text", "нет — может только вернуть текст"],
      code: ["EVTAgentTeam.run · graph reviewer", "EVTAgentTeam.run · рецензент графа"]
    },
    loc: {
      role: ["audit the “where”: the ranking and the arrival fit, kept side by side", "проверить «где»: ранжирование и подгонку приходов, хранимые рядом"],
      sees: ["the frozen summary s(y), its base dict_db, the round-1 reviews", "замороженную сводку s(y), свою базу dict_db, отзывы раунда 1"],
      policy: ["a language model (replayed here)", "языковая модель (здесь воспроизведение)"],
      tools: ["retrieve(dict_db), complete(system, user)", "retrieve(dict_db), complete(system, user)"],
      memory: ["its context window only", "только окно контекста"],
      output: ["review text; every number checked by M6", "текст отзыва; каждое число сверяет М6"],
      numbers: ["no — it can only return text", "нет — может только вернуть текст"],
      code: ["EVTAgentTeam.run · localization reviewer", "EVTAgentTeam.run · рецензент локализации"]
    },
    chair: {
      role: ["compose the conclusion and give a JSON verdict", "составить заключение и дать JSON-вердикт"],
      sees: ["the frozen summary s(y) and all reviews", "замороженную сводку s(y) и все отзывы"],
      policy: ["a language model (replayed here)", "языковая модель (здесь воспроизведение)"],
      tools: ["complete(system, user) — no base of its own", "complete(system, user) — своей базы нет"],
      memory: ["its context window only", "только окно контекста"],
      output: ["Markdown + JSON verdict; one rewrite if a number fails M6; disagreement with the pipeline kept", "Markdown + JSON-вердикт; одна переписка, если число не прошло М6; расхождение с конвейером сохраняется"],
      numbers: ["no — the verdict is stored next to the pipeline’s, not instead of it", "нет — вердикт хранится рядом с вердиктом конвейера, а не вместо него"],
      code: ["EVTAgentTeam.run · coordinator", "EVTAgentTeam.run · координатор"]
    }
  };
  var TOOL_LABEL = {
    detect_evt: ["detect_evt", "detect_evt"], build_baseline_graph: ["build_baseline_graph", "build_baseline_graph"], rank_source: ["rank_source", "rank_source"],
    retrieve_own: ["retrieve (own base)", "retrieve (своя база)"], retrieve_other: ["retrieve (another base)", "retrieve (чужая база)"],
    complete: ["complete (LLM)", "complete (LLM)"], write_y: ["write y", "запись в y"]
  };
  var ACTION_LABEL = {
    inspect_input: ["inspect_input", "inspect_input"], detect_evt_1d: ["detect_evt · 1-D", "detect_evt · 1-D"], structural_analysis: ["structural analysis → nodes, n-D", "структурный анализ → узлы, n-D"],
    build_baseline_graph: ["build_baseline_graph → edges", "build_baseline_graph → рёбра"], detect_evt_nd: ["detect_evt · n-D → t̂", "detect_evt · n-D → t̂"],
    rank_source: ["rank_source → P(ŝ = v)", "rank_source → P(ŝ = v)"], handoff: ["freeze(y) → s(y) → LLM agents", "freeze(y) → s(y) → LLM-агентам"]
  };
  var ALL_ACTIONS = ["inspect_input", "detect_evt_1d", "structural_analysis", "build_baseline_graph", "detect_evt_nd", "rank_source", "handoff"];

  var st = { agent: "planner", alarm: "live", struct: "on", cur: -1, playing: false, timer: null, tool: null };
  var EV = null, RUN = null;

  function actorName(id) { var a = A.ACTORS[id]; return ru() ? a.ru : a.en; }
  function dot(id) { return '<span class="p3e-dot agent' + (A.ACTORS[id].policy === "rules" ? " rules" : "") + '"></span>'; }
  function phaseName(ph) { var P = window.P3Phases; return P && P[ph] ? T(P[ph].name) : ph; }

  // ------------------------------------------------------------------ A: passport
  function renderAgents() {
    $("p3a-agent").innerHTML = AGENTS.map(function (id) {
      return '<button type="button" data-v="' + id + '">' + dot(id) + esc(actorName(id)) + "</button>";
    }).join("");
    $("p3a-agent").querySelectorAll("[data-v]").forEach(function (b) {
      b.addEventListener("click", function () { st.agent = b.getAttribute("data-v"); renderPassport(); renderMatrix(); });
    });
  }
  function renderPassport() {
    press("#p3a-agent", st.agent);
    var p = PASS[st.agent], pol = A.ACTORS[st.agent].policy;
    $("p3a-passport").innerHTML = '<div class="p3a-ptitle">' + dot(st.agent) + "<b>" + esc(actorName(st.agent)) + "</b> · " +
      (pol === "rules" ? L("agent with a rules policy", "агент с политикой-правилами") : L("agent with an LLM policy", "агент с LLM-политикой")) + "</div>" +
      '<dl class="p3a-dl">' + ROWS.map(function (r) {
        return "<dt>" + esc(T(r[1])) + "</dt><dd" + (r[0] === "numbers" ? ' class="' + (st.agent === "planner" ? "warn" : "good") + '"' : "") + ">" + esc(T(p[r[0]])) + "</dd>";
      }).join("") + "</dl>";
  }

  // ------------------------------------------------------------------ B: the planner agent
  function rebuild(keepAtEnd) {
    if (!EV) return;
    RUN = A.plannerRun(EV, { noAlarm: st.alarm === "none", noStructural: st.struct === "off" }, ru() ? "ru" : "en");
    if (keepAtEnd || st.cur < 0 || st.cur >= RUN.steps.length) st.cur = RUN.steps.length - 1;
    renderPlanner();
  }
  function stop() { st.playing = false; clearTimeout(st.timer); st.timer = null; }
  function goTo(i) { st.cur = Math.max(0, Math.min(RUN.steps.length - 1, i)); renderPlanner(); }
  function tick() {
    if (!st.playing) return;
    if (st.cur >= RUN.steps.length - 1) { stop(); renderPlanner(); return; }
    goTo(st.cur + 1);
    st.timer = setTimeout(tick, 1100);
  }
  function renderPlanner() {
    if (!RUN) return;
    press("#p3a-alarm", st.alarm); press("#p3a-struct", st.struct);
    var end = st.cur >= RUN.steps.length - 1;
    $("p3a-play").innerHTML = st.playing ? "⏸ " + L("Pause", "Пауза") : "▶ " + (end ? L("Replay", "Сначала") : L("Play", "Пуск"));
    var s = RUN.steps[st.cur], done = s.completed;
    $("p3a-plan").innerHTML = ALL_ACTIONS.map(function (a) {
      var inPlan = RUN.plan.indexOf(a) >= 0, isDone = done.indexOf(a) >= 0 || (a === "inspect_input" && st.cur >= 0);
      var now = s.action === a && !end, cls, mark;
      if (end && s.action === a) isDone = true;
      if (!inPlan) { cls = "out"; mark = "–"; }
      else if (now) { cls = "now"; mark = "▶"; }
      else if (isDone) { cls = "done"; mark = "✓"; }
      else if (end && RUN.stop) { cls = "skip"; mark = "⤫"; }
      else { cls = "todo"; mark = "○"; }
      var note = !inPlan ? L(" — not in the plan", " — не в плане") : cls === "skip" ? L(" — skipped: " + RUN.stop, " — пропущено: " + RUN.stop) : "";
      return '<li class="' + cls + '"><span class="m">' + mark + "</span><code>" + esc(T(ACTION_LABEL[a])) + "</code>" + esc(note) + "</li>";
    }).join("");
    $("p3a-log").innerHTML = RUN.steps.slice(0, st.cur + 1).map(function (x, k) {
      var mark = x.status === "good" ? "✓" : x.status === "warn" ? "!" : "·";
      return '<li class="p3e-row' + (k === st.cur ? " now" : "") + (x.status ? " " + x.status : "") + '"><div class="p3e-rowbtn"><span class="p3e-m">' + mark + "</span>" +
        '<span class="p3e-ph">' + esc(phaseName(x.phase)) + "</span>" + (x.action ? '<span class="p3e-title">' + esc(x.action) + "</span>" : "") +
        '<span class="p3a-text">' + esc(x.text) + "</span></div></li>";
    }).join("");
    var log = $("p3a-log"); log.scrollTop = log.scrollHeight;
    var r = RUN.result;
    var cell = function (label, v, hint) { return '<div><span class="k">' + label + '</span><b class="mono">' + (v === null || v === undefined ? "–" : esc(v)) + "</b>" + (hint ? '<span class="h">' + esc(hint) + "</span>" : "") + "</div>"; };
    $("p3a-result").innerHTML = end
      ? cell(L("when", "когда"), r.when, r.when !== null && st.struct === "off" ? L("1-D alarm only", "только одномерная тревога") : "") +
        cell(L("edges", "рёбра"), r.edges, r.edges !== null ? L("estimated structure", "оценённая структура") : "") +
        cell(L("where", "где"), r.where, r.where !== null ? "P = " + (EV.ranking ? EV.ranking.probabilities[0] : "–") : "") +
        cell(L("stop", "остановка"), r.stop || L("plan completed", "план выполнен"))
      : '<div class="h">' + L("The result appears when the loop ends.", "Результат появится, когда цикл закончится.") + "</div>";
  }

  // ------------------------------------------------------------------ C: tool matrix
  function renderMatrix() {
    if (!EV) return;
    var lang = ru() ? "ru" : "en";
    $("p3a-matrix").innerHTML = "<thead><tr><th>" + L("agent \\ tool", "агент \\ инструмент") + "</th>" + A.TOOLS.map(function (t) { return "<th><code>" + esc(T(TOOL_LABEL[t])) + "</code></th>"; }).join("") + "</tr></thead><tbody>" +
      AGENTS.map(function (a) {
        return '<tr class="' + (a === st.agent ? "sel" : "") + '"><td>' + dot(a) + esc(actorName(a)) + "</td>" + A.TOOLS.map(function (t) {
          var r = A.tryTool(a, t, EV, lang), cls = r.allowed === true ? "yes" : r.allowed === "before" ? "before" : "no";
          var sym = r.allowed === true ? "✓" : r.allowed === "before" ? L("before freeze", "до заморозки") : "✗";
          var on = st.tool && st.tool[0] === a && st.tool[1] === t ? " on" : "";
          return '<td><button type="button" class="p3a-cell ' + cls + on + '" data-a="' + a + '" data-t="' + t + '">' + sym + "</button></td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody>";
    $("p3a-matrix").querySelectorAll(".p3a-cell").forEach(function (b) {
      b.addEventListener("click", function () { st.tool = [b.getAttribute("data-a"), b.getAttribute("data-t")]; st.agent = st.tool[0]; renderPassport(); renderMatrix(); });
    });
    var out = $("p3a-try");
    if (!st.tool) { out.innerHTML = L("Click a cell: the call is made on the frozen live result, and the reason is shown.", "Нажмите на ячейку: вызов выполняется на замороженном текущем результате, и показывается причина."); return; }
    var r = A.tryTool(st.tool[0], st.tool[1], EV, lang);
    var head = "<code>" + esc(actorName(st.tool[0])) + "." + esc(st.tool[1]) + "(…)</code> → ";
    out.innerHTML = head + (r.allowed === true ? '<b class="ok">' + L("allowed", "разрешено") + (r.result ? ": " + esc(r.result) : "") + "</b>"
      : r.allowed === "before" ? '<b class="warn">' + L("only before freeze(y)", "только до freeze(y)") + "</b>"
      : '<b class="no">' + L("refused", "отклонено") + "</b>") + " — " + esc(r.reason);
  }

  // ------------------------------------------------------------------ wiring
  document.querySelectorAll("#p3a-alarm [data-v]").forEach(function (b) { b.addEventListener("click", function () { stop(); st.alarm = b.getAttribute("data-v"); rebuild(true); }); });
  document.querySelectorAll("#p3a-struct [data-v]").forEach(function (b) { b.addEventListener("click", function () { stop(); st.struct = b.getAttribute("data-v"); rebuild(true); }); });
  $("p3a-play").addEventListener("click", function () {
    if (!RUN) return;
    if (st.playing) { stop(); renderPlanner(); return; }
    st.playing = true;
    if (st.cur >= RUN.steps.length - 1) st.cur = -1;
    tick();
  });
  $("p3a-next").addEventListener("click", function () { stop(); if (RUN) goTo(st.cur + 1); });
  $("p3a-reset").addEventListener("click", function () { stop(); if (RUN) goTo(0); });
  $("p3a-end").addEventListener("click", function () { stop(); if (RUN) goTo(RUN.steps.length - 1); });

  function take(d) { EV = d.ev; rebuild(!st.playing); renderMatrix(); }
  function renderAll() { renderAgents(); renderPassport(); if (EV) { rebuild(false); renderMatrix(); } }
  document.addEventListener("eld:p3-run", function (e) { take(e.detail); });
  document.addEventListener("eld:lang", renderAll);
  renderAgents(); renderPassport();
  if (window.ELD_P3_RUN) take(window.ELD_P3_RUN);
})();
