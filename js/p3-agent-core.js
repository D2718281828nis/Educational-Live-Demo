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
    server: { en: "Processing server", ru: "Сервер обработки", agent: false },
    evt: { en: "EVT reviewer", ru: "Рецензент EVT", agent: true },
    graph: { en: "Graph reviewer", ru: "Рецензент графа", agent: true },
    loc: { en: "Localization reviewer", ru: "Рецензент локализации", agent: true },
    chair: { en: "Chair", ru: "Председатель", agent: true },
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

    // ---------------------------------------------------------------- level 1: deterministic components, no agent
    push({ stage: "x", actor: "server", phase: null, round: 0,
      title: "POST /api/v1/files/",
      body: L("The raw series x(t) of section 3 is uploaded: n = " + meta.n + ", fingerprint of the series " + meta.series_fnv1a + ". Agents never see these samples.",
        "Загружается сырой ряд x(t) раздела 3: n = " + meta.n + ", отпечаток ряда " + meta.series_fnv1a + ". Агенты этих отсчётов не видят.") });
    push({ stage: "f", actor: "server", phase: null, round: 0,
      title: "y = fθ(X)",
      body: det.detected
        ? L("The numerical step runs: 1-D alarm at sample " + det.alarm_1d + ", n-D onset t̂ = " + det.t_hat + (rk ? ", top node " + rk.node_ids[0] : "") + ". This is the answer; the agents only explain it.",
            "Выполняется численный шаг: одномерная тревога — отсчёт " + det.alarm_1d + ", начало по n-D t̂ = " + det.t_hat + (rk ? ", первый узел " + rk.node_ids[0] : "") + ". Это и есть ответ; агенты его только объясняют.")
        : L("The numerical step runs: no extreme event (the run rule was not met). This is the answer; the agents only explain it.",
            "Выполняется численный шаг: экстремального события нет (правило серии не выполнено). Это и есть ответ; агенты его только объясняют.") });
    push({ stage: "freeze", actor: "server", phase: null, round: 0, status: "good",
      title: "freeze(y) · FNV-1a = " + fp,
      body: L("The result is deep-frozen (Object.freeze) and fingerprinted before any agent starts. Any later write to it throws.",
        "Результат глубоко замораживается (Object.freeze) и получает отпечаток до запуска любого агента. Любая запись в него дальше вызывает ошибку."),
      context: [{ k: L("fingerprint before the agents", "отпечаток до агентов"), v: fp }] });
    push({ stage: "s", actor: "server", phase: null, round: 0,
      title: L("s(y): bounded summary", "s(y): ограниченная сводка"),
      body: L("Only a summary of " + evJSON.length + " characters is handed on — decisions to audit, not samples. It is the whole “world” of the agents.",
        "Дальше передаётся только сводка в " + evJSON.length + " символов — решения для проверки, а не отсчёты. Это весь «мир» агентов."),
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

  var api = { PHASES: PHASES, ACTORS: ACTORS, GUARD: GUARD, estTokens: estTokens, trace: trace, totals: totals };
  global.P3AgentCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
