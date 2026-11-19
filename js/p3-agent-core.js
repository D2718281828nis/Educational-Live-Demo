// Agent emulator of section 5 (Position 3): the consilium of js/p3-core.js replayed as an agent trace, step by step.
// No language model and no tokens: every agent "call" has the shape of Graph-EVT-agent's ChatClient.complete(system, user)
// (graph_evt_agent/agents.py, EVTAgentTeam.run), and its response is replayed from the deterministic stub consilium.
// To plug a real model, replace the replayed response by client.complete(system, user) — see README, "Real model".
// Works in the browser (window.P3AgentCore) and in Node (module.exports).

(function (global) {
  "use strict";

  var C = global.P3Core || (typeof require === "function" ? require("./p3-core.js") : null);

  // The agent loop shown in the explainer; a deterministic component (server, checker, store) has no phase.
  var PHASES = ["perceive", "recall", "reason", "act", "check"];

  // The guard of EVTAgentTeam.run, word for word in Russian.
  var GUARD = {
    ru: "Опирайся только на JSON. Не изменяй численные результаты. Отделяй статистическую редкость от причинности и явно отмечай ограничения.",
    en: "Rely only on the JSON. Do not change the numerical results. Separate statistical rarity from causality and state limitations explicitly."
  };
  var ACTORS = {
    planner: { en: "Planner agent", ru: "Агент-планировщик", agent: true, policy: "rules" },
    evt: { en: "EVT reviewer", ru: "Рецензент EVT", agent: true, policy: "llm" },
    graph: { en: "Graph reviewer", ru: "Рецензент графа", agent: true, policy: "llm" },
    loc: { en: "Localization reviewer", ru: "Рецензент локализации", agent: true, policy: "llm" },
    chair: { en: "Chair", ru: "Председатель", agent: true, policy: "llm" },
    checker: { en: "Number check (M6)", ru: "Сверка чисел (М6)", agent: false },
    store: { en: "Result store", ru: "Хранилище результата", agent: false }
  };
  var SYSTEM = {
    evt: { en: "You are the EVT detection agent.", ru: "Ты агент EVT-детекции." },
    graph: { en: "You are the graph dependence agent.", ru: "Ты агент графовых зависимостей." },
    loc: { en: "You are the localization agent.", ru: "Ты агент локализации." },
    chair: { en: "You are the team coordinator.", ru: "Ты координатор команды." }
  };
  // Which fields of s(y) each reviewer reads (its "plan" before writing).
  var READS = {
    evt: ["detection.detected", "detection.alarm_1d", "detection.t_hat", "spec.q", "spec.r", "sigma3_alarm"],
    graph: ["graph.method", "graph.nodes", "graph.functional_edges"],
    loc: ["ranking.node_ids[0]", "ranking.probabilities[0]", "arrival_fit"]
  };

  // A rough count of the tokens a real model would be sent (≈ 4 characters per token in English, ≈ 2.5 in Russian).
  // It is an estimate for the reader; the emulator spends none.
  function estTokens(text) {
    var s = String(text || "");
    var cyr = (s.match(/[а-яё]/gi) || []).length;
    return Math.ceil(cyr / 2.5 + (s.length - cyr) / 4);
  }

  function pick(obj, path) {
    var m, cur = obj, parts = path.replace(/\[(\d+)\]/g, ".$1").split(".");
    for (var i = 0; i < parts.length; i++) { if (cur === null || cur === undefined) return null; m = parts[i]; cur = cur[m]; }
    return cur === undefined ? null : cur;
  }
  function counts(text, ev) {
    var c = { ok: 0, bad: 0, skipped: 0, badList: [] };
    C.checkNumbers(text, ev).forEach(function (n) { c[n.status]++; if (n.status === "bad") c.badList.push(n.raw); });
    return c;
  }

  // ev: the frozen summary s(y); out: C.consilium(ev, opts, lang); meta: { n, series_fnv1a }; opts: { fault, provider, write }.
  // Returns the list of steps. Every step: { stage, actor, phase, round, title, body, msg?, call?, context?, check?, tool?, status? }.
  function trace(ev, out, meta, opts, lang) {
    var ru = lang === "ru", L = function (en, r) { return ru ? r : en; };
    opts = opts || {}; meta = meta || {};
    var fault = opts.fault || "none", provider = opts.provider || "a";
    var steps = [], evJSON = JSON.stringify(ev), fp = C.fingerprint(ev), det = ev.detection, rk = ev.ranking;
    function push(s) { s.i = steps.length; steps.push(s); return s; }
    function sys(role) { return SYSTEM[role][lang === "ru" ? "ru" : "en"] + " " + GUARD[lang === "ru" ? "ru" : "en"]; }
    function chunks(base) {
      return C.BASES[base].map(function (c) { return "[" + base + "#" + c.id + "] " + (ru ? c.ru : c.en); }).join("\n");
    }
    function call(role, user) {
      var system = sys(role);
      return { client: provider === "a" ? "StubClientA" : "StubClientB", system: system, user: user, tokens: estTokens(system) + estTokens(user) };
    }
    function checkStep(actor, text, round, stage) {
      var c = counts(text, ev);
      return push({
        stage: stage || "consilium", actor: "checker", phase: null, round: round, check: c,
        status: c.bad ? "bad" : "good",
        title: L("verify_numbers(" + actor + ")", "verify_numbers(" + actor + ")"),
        body: c.bad
          ? L(c.ok + " numbers found in s(y), " + c.bad + " not found: " + c.badList.join(", ") + ".",
              "Найдено в s(y): " + c.ok + ", не найдено: " + c.bad + " — " + c.badList.join(", ") + ".")
          : L("All " + c.ok + " checked numbers are found in s(y)" + (c.skipped ? "; " + c.skipped + " integers below 10 skipped" : "") + ".",
              "Все проверенные числа (" + c.ok + ") есть в s(y)" + (c.skipped ? "; целых меньше 10 пропущено: " + c.skipped : "") + ".")
      });
    }

    // ---------------------------------------------------------------- level 1: the planner agent (rules policy) runs the numerical tools
    push({ stage: "x", actor: "planner", phase: "perceive", round: 0,
      title: "POST /api/v1/files/",
      body: L("The planner agent receives the raw series x(t) of section 3: n = " + meta.n + ", fingerprint of the series " + meta.series_fnv1a + ". The LLM agents never see these samples.",
        "Агент-планировщик получает сырой ряд x(t) раздела 3: n = " + meta.n + ", отпечаток ряда " + meta.series_fnv1a + ". LLM-агенты этих отсчётов не видят.") });
    push({ stage: "f", actor: "planner", phase: "act", round: 0,
      tool: { name: "detect_evt → build_baseline_graph → rank_source", args: { route: "1-D → structural → n-D" }, ok: true, result: "y" },
      title: "y = fθ(X)",
      body: det.detected
        ? L("The planner calls its numerical tools: 1-D alarm at sample " + det.alarm_1d + ", n-D onset t̂ = " + det.t_hat + (rk ? ", top node " + rk.node_ids[0] : "") + ". This is the answer; the LLM agents only explain it.",
            "Планировщик вызывает численные инструменты: одномерная тревога — отсчёт " + det.alarm_1d + ", начало по n-D t̂ = " + det.t_hat + (rk ? ", первый узел " + rk.node_ids[0] : "") + ". Это и есть ответ; LLM-агенты его только объясняют.")
        : L("The planner calls detect_evt: no extreme event (the run rule was not met) — it stops with no_evt_detected. This is the answer; the LLM agents only explain it.",
            "Планировщик вызывает detect_evt: экстремального события нет (правило серии не выполнено) — остановка no_evt_detected. Это и есть ответ; LLM-агенты его только объясняют.") });
    push({ stage: "freeze", actor: "planner", phase: "check", round: 0, status: "good",
      title: "freeze(y) · FNV-1a = " + fp,
      body: L("The planner observes that its plan is complete; the result is deep-frozen (Object.freeze) and fingerprinted before any LLM agent starts. Any later write to it throws — the planner’s too.",
        "Планировщик видит, что план выполнен; результат глубоко замораживается (Object.freeze) и получает отпечаток до запуска любого LLM-агента. Любая запись в него дальше вызывает ошибку — и запись планировщика тоже."),
      context: [{ k: L("fingerprint before the agents", "отпечаток до агентов"), v: fp }] });
    push({ stage: "s", actor: "planner", phase: "act", round: 0,
      title: L("s(y): bounded summary", "s(y): ограниченная сводка"),
      body: L("Hand-off: only a summary of " + evJSON.length + " characters goes to the LLM agents — decisions to audit, not samples. It is their whole “world”.",
        "Передача: LLM-агентам уходит только сводка в " + evJSON.length + " символов — решения для проверки, а не отсчёты. Это весь их «мир»."),
      context: [{ k: "s(y)", v: JSON.stringify(ev, null, 1) }] });

    // ---------------------------------------------------------------- level 2, round 1: independent reviews
    var r1users = {};
    ["evt", "graph", "loc"].forEach(function (role) {
      var base = C.ROLES.filter(function (r) { return r.id === role; })[0].base;
      push({ stage: "consilium", actor: role, phase: "perceive", round: 1,
        title: L("receives the task and s(y)", "получает задачу и s(y)"),
        body: L("Its context window is empty except for its role (system prompt), the task and the frozen summary. It does not see the other reviewers yet.",
          "Окно контекста пусто, кроме роли (системный промпт), задачи и замороженной сводки. Других рецензентов агент пока не видит."),
        context: [{ k: L("system prompt (role)", "системный промпт (роль)"), v: sys(role) }, { k: "s(y)", v: evJSON }] });
      if (role === "graph") {
        var refused = C.retrieve("graph", "evt_db");
        push({ stage: "consilium", actor: role, phase: "recall", round: 1, status: "good", refused: true,
          tool: { name: "retrieve", args: { base: "evt_db" }, ok: !refused.denied, result: refused.denied ? "403 denied" : "ok" },
          title: L("retrieve(evt_db) → refused", "retrieve(evt_db) → отклонено"),
          body: L("It tries another role’s base. The tool refuses: each role queries only its own base, so the opinions stay independent.",
            "Агент пробует чужую базу. Инструмент отказывает: каждая роль обращается только к своей базе, поэтому мнения независимы.") });
      }
      var hits = C.retrieve(role, base);
      push({ stage: "consilium", actor: role, phase: "recall", round: 1, status: "good",
        tool: { name: "retrieve", args: { base: base }, ok: !hits.denied, result: hits.hits.length + " chunks" },
        title: "retrieve(" + base + ") → " + hits.hits.length + L(" chunks", " фрагм."),
        body: L("RAG: the knowledge chunks of its own base are added to the context. They hold rules and definitions, not numbers of this case.",
          "RAG: фрагменты своей базы знаний добавляются в контекст. В них правила и определения, а не числа этого случая."),
        context: [{ k: base, v: chunks(base) }] });
      var plan = READS[role].map(function (p) { return p + " = " + JSON.stringify(pick(ev, p)); });
      push({ stage: "consilium", actor: role, phase: "reason", round: 1,
        title: L("plans what to say", "планирует ответ"),
        body: L("It picks the fields of s(y) it is responsible for and the chunks it will cite. Numbers are copied from s(y), never computed anew.",
          "Агент выбирает поля s(y), за которые отвечает, и фрагменты, на которые сошлётся. Числа копируются из s(y), а не вычисляются заново."),
        context: [{ k: L("fields read", "читаемые поля"), v: plan.join("\n") }] });
      var user = L("Task: find when and where the event started.\nSummary s(y): ", "Задача: найти, когда и где началось событие.\nСводка s(y): ") + evJSON +
        L("\nYour base " + base + ":\n", "\nТвоя база " + base + ":\n") + chunks(base);
      r1users[role] = user;
      push({ stage: "consilium", actor: role, phase: "act", round: 1, call: call(role, user), msg: out.round1[role],
        title: "client.complete(system, user)",
        body: L("The model call. Here the response is replayed by the stub client: the same text every time, no network, no tokens.",
          "Вызов модели. Здесь ответ воспроизводит подставной клиент: каждый раз тот же текст, без сети и без токенов.") });
      checkStep(role, out.round1[role], 1);
    });

    // ---------------------------------------------------------------- level 2, round 2: debate
    var reviews = JSON.stringify({ evt: out.round1.evt, graph: out.round1.graph, loc: out.round1.loc });
    ["evt", "graph", "loc"].forEach(function (role) {
      push({ stage: "consilium", actor: role, phase: "perceive", round: 2,
        title: L("reads the other reviews", "читает отзывы остальных"),
        body: L("Round 2 adds the round-1 texts of the other reviewers to its context: this is how agents talk — through messages, not shared variables.",
          "Во втором раунде в контекст добавляются тексты первого раунда остальных рецензентов: агенты общаются сообщениями, а не общими переменными."),
        context: [{ k: L("round 1 reviews", "отзывы раунда 1"), v: reviews }] });
      var reasonBody = role === "graph" && fault === "disagree"
        ? L("Injected fault: it decides to dispute the ranking and name the second candidate.", "Внесённая ошибка: агент решает оспорить ранжирование и назвать второго кандидата.")
        : role === "evt" && fault === "threshold"
          ? L("Injected fault: it decides to propose a lower threshold q and to apply it itself.", "Внесённая ошибка: агент решает предложить меньший порог q и применить его сам.")
          : L("It compares the other conclusions with s(y) and its own base and looks for a contradiction.", "Агент сравнивает чужие выводы с s(y) и своей базой и ищет противоречия.");
      var faulty = (role === "graph" && fault === "disagree") || (role === "evt" && fault === "threshold");
      push({ stage: "consilium", actor: role, phase: "reason", round: 2, status: faulty ? "warn" : null, fault: faulty,
        title: L("weighs the others", "взвешивает чужие доводы"), body: reasonBody });
      var user = L("Reviews of round 1: ", "Отзывы раунда 1: ") + reviews + L("\nAnswer the others. Summary s(y): ", "\nОтветь остальным. Сводка s(y): ") + evJSON;
      push({ stage: "consilium", actor: role, phase: "act", round: 2, call: call(role, user), msg: out.round2[role], fault: faulty,
        title: "client.complete(system, user)",
        body: L("The debate reply, replayed by the stub client.", "Ответ в дебатах, воспроизведённый подставным клиентом.") });
      if (role === "evt" && fault === "threshold") {
        var w = opts.write || { ok: false, msg: "TypeError" };
        push({ stage: "freeze", actor: role, phase: "act", round: 2, status: w.ok ? "bad" : "good", refused: !w.ok, fault: true,
          tool: { name: "PATCH s(y).spec.q", args: { q: 0.9 }, ok: !!w.ok, result: w.ok ? "200" : "403 Frozen (" + w.msg + ")" },
          title: L("PATCH s(y).spec.q = 0.90 → 403 Frozen", "PATCH s(y).spec.q = 0,90 → 403 Frozen"),
          body: w.ok
            ? L("The write went through — the summary was not frozen.", "Запись прошла — сводка не была заморожена.")
            : L("It tries to act on its proposal. The write is refused by the freeze: an agent can only produce text; no tool writes to a numerical step.",
                "Агент пытается выполнить своё предложение. Запись отклонена заморозкой: агент может только выдать текст; ни один инструмент не пишет в численный шаг.") });
      }
      checkStep(role, out.round2[role], 2);
    });

    // ---------------------------------------------------------------- level 3: the chair, the number check, the store
    push({ stage: "consilium", actor: "chair", phase: "perceive", round: 3,
      title: L("collects all reviews", "собирает все отзывы"),
      body: L("The coordinator sees s(y) and both rounds. It has no knowledge base of its own: it only composes.",
        "Координатор видит s(y) и оба раунда. Своей базы знаний у него нет: он только составляет итог."),
      context: [{ k: L("round 2 replies", "ответы раунда 2"), v: JSON.stringify(out.round2) }] });
    push({ stage: "consilium", actor: "chair", phase: "reason", round: 3,
      title: L("plans the conclusion", "планирует заключение"),
      body: L("“When”, “where”, the graph caveat, the support-not-decision line, and a JSON verdict in the last line — the format required by the system prompt.",
        "«Когда», «где», оговорка о графе, строка «поддержка, а не решение» и JSON-вердикт в последней строке — формат из системного промпта.") });
    var chairSys = sys("chair") + L(' In the last line give the verdict as one JSON object: {"event_detected": true|false, "source": "<node or null>"}.',
      ' В последней строке дай вердикт одним JSON-объектом: {"event_detected": true|false, "source": "<узел или null>"}.');
    var chairUser = L("Write a short conclusion for the user. Numerical data: ", "Составь краткий итог для пользователя. Численные данные: ") + evJSON + L("\nReviews: ", "\nОтзывы: ") + reviews;
    var chairCall = call("chair", chairUser); chairCall.system = chairSys; chairCall.tokens = estTokens(chairSys) + estTokens(chairUser);
    var faultyDraft = fault === "misquote" || fault === "stubborn";
    push({ stage: "report", actor: "chair", phase: "act", round: 3, call: chairCall, msg: out.first, status: faultyDraft ? "warn" : null, fault: faultyDraft,
      title: L("client.complete → first draft", "client.complete → первый вариант"),
      body: faultyDraft ? L("Injected fault: the stub misquotes the onset t̂, as a real model sometimes does.", "Внесённая ошибка: заглушка искажает начало t̂, как иногда делает настоящая модель.")
        : L("The draft conclusion, replayed by the stub client.", "Черновик заключения, воспроизведённый подставным клиентом.") });
    checkStep("chair", out.first, 3, "report");
    if (out.rewritten) {
      var rwUser = L("The conclusion has numbers that are not in the numerical data: ", "В итоге есть числа, которых нет в численных данных: ") + out.firstBad.join(", ") +
        L(". Rewrite it using only numbers from the JSON.\nNumerical data: ", ". Перепиши итог, используя только числа из JSON.\nЧисленные данные: ") + evJSON +
        L("\nPrevious conclusion: ", "\nПрежний итог: ") + out.first;
      var rwCall = call("chair", rwUser); rwCall.system = chairSys; rwCall.tokens = estTokens(chairSys) + estTokens(rwUser);
      push({ stage: "report", actor: "chair", phase: "act", round: 3, call: rwCall, msg: out.final, status: fault === "stubborn" ? "warn" : null, fault: fault === "stubborn",
        title: L("the one allowed rewrite", "единственная переписка"),
        body: fault === "stubborn" ? L("The checker names the bad numbers and asks once. Injected fault: the model repeats the mistake.", "Сверка называет неверные числа и просит один раз. Внесённая ошибка: модель повторяет ошибку.")
          : L("The checker names the bad numbers and asks once for a rewrite with numbers from the JSON only.", "Сверка называет неверные числа и один раз просит переписать, используя только числа из JSON.") });
      checkStep("chair", out.final, 3, "report");
    }
    var dis = out.disagreement || {}, anyDis = Object.keys(dis).some(function (k) { return dis[k]; });
    push({ stage: "report", actor: "checker", phase: null, round: 3, status: anyDis ? "warn" : "good",
      title: "parse_verdict + disagreement",
      body: anyDis
        ? L("The agents’ JSON verdict differs from the pipeline’s. The mark is recorded; the agents do not overwrite the classifier.", "JSON-вердикт агентов расходится с вердиктом конвейера. Отметка записывается; агенты не переписывают классификатор.")
        : L("The agents’ JSON verdict matches the pipeline’s.", "JSON-вердикт агентов совпадает с вердиктом конвейера."),
      context: [{ k: L("verdicts", "вердикты"), v: JSON.stringify({ pipeline: out.pipelineVerdict, agents: out.agentVerdict, disagreement: out.disagreement }) }] });
    var fpAfter = C.fingerprint(ev);
    var record = { pipeline_verdict: out.pipelineVerdict, agent_verdict: out.agentVerdict, disagreement: out.disagreement,
      unverified_numbers: out.unverified, final_report_rewritten: out.rewritten, fingerprint_before: fp, fingerprint_after: fpAfter };
    push({ stage: "report", actor: "store", phase: null, round: 3, status: fp === fpAfter ? "good" : "bad",
      title: L("store the report next to y", "сохранить заключение рядом с y"),
      body: fp === fpAfter
        ? L("Fingerprint of y after the agent layer: " + fpAfter + " — unchanged. Markdown + JSON are stored next to the unchanged result.", "Отпечаток y после агентного слоя: " + fpAfter + " — не изменился. Markdown и JSON хранятся рядом с неизменным результатом.")
        : L("Fingerprint of y changed: " + fp + " → " + fpAfter + ".", "Отпечаток y изменился: " + fp + " → " + fpAfter + "."),
      context: [{ k: "AgentReport", v: JSON.stringify(record, null, 1) }] });
    return steps;
  }

  // Totals of a trace: model calls, the tokens a real model would be sent, and the tokens spent (always 0 here).
  function totals(steps) {
    var calls = steps.filter(function (s) { return s.call; });
    return { calls: calls.length, tokens: calls.reduce(function (a, s) { return a + s.call.tokens; }, 0), spent: 0 };
  }


  // ---------------------------------------------------------------- 5.4: one agentic architecture
  // The planner agent of section 3 as a plan → act → observe loop (Graph-EVT-agent PipelinePlanner, page route H7:
  // 1-D → structural → n-D). ev: the summary s(y); what: { noAlarm: force "no 1-D alarm", noStructural: skip the
  // structural analysis (the library's plain 1-D route) }. Returns { plan, steps, stop, result }.
  function plannerRun(ev, what, lang) {
    var ru = lang === "ru", L = function (en, r) { return ru ? r : en; };
    what = what || {};
    var det = ev.detection, rk = ev.ranking, gr = ev.graph;
    var alarm = what.noAlarm ? -1 : det.alarm_1d;
    var plan = what.noStructural
      ? ["inspect_input", "detect_evt_1d", "handoff"]
      : ["inspect_input", "detect_evt_1d", "structural_analysis", "build_baseline_graph", "detect_evt_nd", "rank_source", "handoff"];
    var steps = [], done = [], stop = null;
    function step(phase, action, text, status, result) {
      if (action && phase === "act") done.push(action);
      steps.push({ phase: phase, action: action, text: text, status: status || null, result: result === undefined ? null : result, completed: done.slice() });
    }
    step("perceive", "inspect_input", L("Input: one series, p = 1, background [1, T_b) known to be normal. Route: 1-D.", "Вход: один ряд, p = 1, фон [1, T_b) заведомо нормален. Маршрут: 1-D."), null, { p: 1 });
    step("reason", null, L("Plan: " + plan.join(" → ") + (what.noStructural ? " (structural analysis switched off)." : "."), "План: " + plan.join(" → ") + (what.noStructural ? " (структурный анализ выключен)." : ".")));
    step("act", "detect_evt_1d", L("Tool detect_evt on the 1-D series: POT/GPD threshold from the background, r = " + ev.spec.r + " in a row.", "Инструмент detect_evt на одномерном ряде: порог POT/GPD по фону, r = " + ev.spec.r + " подряд."));
    if (alarm < 0 || alarm === null) {
      stop = "no_evt_detected";
      step("check", null, L("Observation: no 1-D alarm. Stop: no_evt_detected — nothing to localize.", "Наблюдение: одномерной тревоги нет. Остановка: no_evt_detected — локализовать нечего."), "warn", { alarm_1d: null });
    } else {
      step("check", null, L("Observation: 1-D alarm at sample " + alarm + " — an extreme event happened.", "Наблюдение: одномерная тревога на отсчёте " + alarm + " — экстремальное событие произошло."), "good", { alarm_1d: alarm });
      if (what.noStructural) {
        stop = "single_channel_cannot_localize";
        step("check", null, L("One sensor cannot tell the source (Theorem 6.1). Stop: single_channel_cannot_localize — “when” only.", "Один датчик не различает источник (теорема 6.1). Остановка: single_channel_cannot_localize — только «когда»."), "warn");
      } else {
        step("act", "structural_analysis", L("Tool structural analysis: nodes from the spectral peaks of the background, one envelope per node → an n-D series.", "Инструмент структурного анализа: узлы — спектральные пики фона, огибающая на узел → n-D-ряд."), null, { nodes: gr.nodes });
        step("check", null, L("Observation: " + gr.nodes.length + " nodes (" + gr.nodes.join(", ") + "). The route switches to n-D.", "Наблюдение: " + gr.nodes.length + " узлов (" + gr.nodes.join(", ") + "). Маршрут переключается на n-D."), "good");
        step("act", "build_baseline_graph", L("Tool build_baseline_graph: method " + gr.method + ", background only.", "Инструмент build_baseline_graph: метод " + gr.method + ", только фон."), null, { method: gr.method, functional_edges: gr.functional_edges });
        step("check", null, L("Observation: " + gr.functional_edges + " functional edges — the estimated structure, a hypothesis to test against the empty graph.", "Наблюдение: функциональных рёбер " + gr.functional_edges + " — оценённая структура, гипотеза для проверки против пустого графа."), "good");
        step("act", "detect_evt_nd", L("Tool detect_evt on the n-D series: robust z → top-k → POT/GPD → r in a row.", "Инструмент detect_evt на n-D-ряде: робастный z → top-k → POT/GPD → r подряд."));
        if (!det.detected) {
          stop = "no_evt_detected";
          step("check", null, L("Observation: no persistent n-D alarm. Stop: no_evt_detected.", "Наблюдение: устойчивой n-D-тревоги нет. Остановка: no_evt_detected."), "warn", { t_hat: null });
        } else {
          step("check", null, L("Observation: onset t̂ = " + det.t_hat + ".", "Наблюдение: начало t̂ = " + det.t_hat + "."), "good", { t_hat: det.t_hat });
          step("act", "rank_source", L("Tool rank_source: P(ŝ = v) over the nodes; the arrival fit is kept beside it.", "Инструмент rank_source: P(ŝ = v) по узлам; подгонка приходов сохраняется рядом."));
          step("check", null, rk ? L("Observation: top node " + rk.node_ids[0] + ", P = " + rk.probabilities[0] + "; arrival fit " + (ev.arrival_fit || "–") + ".", "Наблюдение: первый узел " + rk.node_ids[0] + ", P = " + rk.probabilities[0] + "; подгонка приходов — " + (ev.arrival_fit || "–") + ".")
            : L("Observation: no ranking.", "Наблюдение: ранжирования нет."), "good", rk ? { source: rk.node_ids[0], p: rk.probabilities[0] } : null);
        }
      }
    }
    var result = {
      when: alarm >= 0 && alarm !== null ? (what.noStructural ? alarm : (det.detected ? det.t_hat : null)) : null,
      where: !stop && rk ? rk.node_ids[0] : null,
      edges: !what.noStructural && alarm >= 0 && alarm !== null ? gr.functional_edges : null,
      stop: stop
    };
    step("act", "handoff", L("Hand-off: freeze(y), fingerprint, bounded summary s(y) → the LLM agents" + (stop ? " (with the stop reason " + stop + ")." : "."),
      "Передача: freeze(y), отпечаток, ограниченная сводка s(y) → LLM-агентам" + (stop ? " (с причиной остановки " + stop + ")." : ".")), "good", result);
    return { plan: plan, steps: steps, stop: stop, result: result };
  }

  // Which tools each agent of the architecture is given. Same agent abstraction; what differs is the tool set.
  var TOOLS = ["detect_evt", "build_baseline_graph", "rank_source", "retrieve_own", "retrieve_other", "complete", "write_y"];
  var BASE_OF = { evt: "evt_db", graph: "graph_db", loc: "dict_db" };
  function tryTool(agent, tool, ev, lang) {
    var ru = lang === "ru", L = function (en, r) { return ru ? r : en; };
    var numeric = tool === "detect_evt" || tool === "build_baseline_graph" || tool === "rank_source";
    var llm = A_LLM.indexOf(agent) >= 0;
    if (tool === "write_y") {
      return agent === "planner"
        ? { allowed: "before", reason: L("Only before freeze(y): the planner writes y while it runs its plan; after the hand-off the write throws (TypeError), its own too.", "Только до freeze(y): планировщик записывает y, пока выполняет план; после передачи запись вызывает ошибку (TypeError), и его собственная тоже.") }
        : { allowed: false, reason: L("No agent with an LLM policy has a tool that writes y; it can only return text. A write attempt hits the freeze (403).", "Ни у одного агента с LLM-политикой нет инструмента записи в y; он может только вернуть текст. Попытка записи упирается в заморозку (403).") };
    }
    if (agent === "planner") {
      if (numeric) {
        var r = tool === "detect_evt" ? "t̂ = " + ev.detection.t_hat : tool === "build_baseline_graph" ? ev.graph.functional_edges + L(" edges (", " рёбер (") + ev.graph.method + ")"
          : ev.ranking ? ev.ranking.node_ids[0] + ", P = " + ev.ranking.probabilities[0] : L("no ranking", "ранжирования нет");
        return { allowed: true, result: r, reason: L("A numerical tool of the planner; its result goes into y.", "Численный инструмент планировщика; его результат входит в y.") };
      }
      return { allowed: false, reason: tool === "complete" ? L("The planner’s policy is fixed rules: it calls no language model, so its run is reproducible.", "Политика планировщика — фиксированные правила: он не вызывает языковую модель, поэтому его прогон воспроизводим.")
        : L("The planner has no knowledge base: it decides by rules over observations.", "У планировщика нет базы знаний: он решает по правилам над наблюдениями.") };
    }
    if (llm || agent === "chair") {
      if (numeric) return { allowed: false, reason: L("Numerical tools are given only to the planner. An LLM agent receives the frozen summary s(y), not the series.", "Численные инструменты выданы только планировщику. LLM-агент получает замороженную сводку s(y), а не ряд.") };
      if (tool === "complete") return { allowed: true, result: L("text", "текст"), reason: L("Its only way to act: return text through client.complete(system, user); every number in it is checked (M6).", "Единственный способ действовать — вернуть текст через client.complete(system, user); каждое число в нём сверяется (М6).") };
      if (tool === "retrieve_own") return agent === "chair"
        ? { allowed: false, reason: L("The chair has no base of its own: it only composes the reviews.", "У председателя нет своей базы: он только сводит отзывы.") }
        : { allowed: true, result: BASE_OF[agent] + " · " + C.BASES[BASE_OF[agent]].length + L(" chunks", " фрагм."), reason: L("RAG over its own base only.", "RAG только по своей базе.") };
      if (tool === "retrieve_other") return { allowed: false, reason: L("A role queries only its own base, so the opinions stay independent.", "Роль обращается только к своей базе, поэтому мнения независимы.") };
    }
    return { allowed: false, reason: "" };
  }
  var A_LLM = ["evt", "graph", "loc"];

  var api = { PHASES: PHASES, ACTORS: ACTORS, GUARD: GUARD, estTokens: estTokens, trace: trace, totals: totals,
    plannerRun: plannerRun, TOOLS: TOOLS, tryTool: tryTool };
  global.P3AgentCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
