// Section 5.1–5.2 (Position 3): the agent-loop explainer and the step-by-step emulator of the consilium.
// The trace comes from js/p3-agent-core.js (pure, tested in Node); the run itself from js/p3.js (event eld:p3-run).
// No language model, no network, no tokens: the responses are replayed from the stub consilium of js/p3-core.js.

(function () {
  "use strict";

  var A = window.P3AgentCore, C = window.P3Core;
  var root = document.documentElement;
  if (!A || !C || !document.getElementById("p3-emu")) return;

  function $(id) { return document.getElementById(id); }
  function ru() { return root.getAttribute("data-lang") === "ru"; }
  function L(en, r) { return ru() ? r : en; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function md(text) { return window.P3View ? window.P3View.md(text) : esc(text); }
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  // ------------------------------------------------------------------ 5.1 the agent loop
  var PHASE = {
    perceive: {
      name: ["Perceive", "Восприятие"],
      gen: ["The agent receives its input: the task, the data, the messages of other agents. Everything it “knows” about the case is what is in its context window — it has no other access to the world.",
        "Агент получает вход: задачу, данные, сообщения других агентов. Всё, что он «знает» о случае, — это содержимое его окна контекста; другого доступа к миру у него нет."],
      here: ["The bounded summary s(y) — decisions to audit, not samples — and, in round 2, the texts of the other reviewers. The raw series never reaches an agent.",
        "Ограниченная сводка s(y) — решения для проверки, а не отсчёты — и во втором раунде тексты остальных рецензентов. Сырой ряд до агента не доходит."]
    },
    recall: {
      name: ["Recall · RAG", "Память · RAG"],
      gen: ["Retrieval-augmented generation: the agent searches a knowledge base for relevant chunks and puts them into its context, so that the answer rests on sources it can cite.",
        "Генерация с дополнением выборкой (RAG): агент ищет в базе знаний подходящие фрагменты и добавляет их в контекст, чтобы ответ опирался на источники, на которые можно сослаться."],
      here: ["Each role has its own base (evt_db, graph_db, dict_db; in [P21] kr_db and textbook_db). A query to another role’s base is refused — this keeps the opinions independent.",
        "У каждой роли своя база (evt_db, graph_db, dict_db; в [P21] — kr_db и textbook_db). Запрос к чужой базе отклоняется — так мнения остаются независимыми."]
    },
    reason: {
      name: ["Reason", "Рассуждение"],
      gen: ["The language model reads the whole context and decides what to do next: answer, call a tool, ask another agent. It predicts text token by token; it does not run the numerical method.",
        "Языковая модель читает весь контекст и решает, что делать дальше: ответить, вызвать инструмент, спросить другого агента. Она предсказывает текст по токенам и не выполняет численный метод."],
      here: ["The replay client stands in for the model. The plan is visible: which fields of s(y) the role quotes and which chunks it cites. Numbers are copied, never recomputed.",
        "Вместо модели работает воспроизводящий клиент. План виден: какие поля s(y) роль цитирует и на какие фрагменты ссылается. Числа копируются, а не пересчитываются."]
    },
    act: {
      name: ["Act", "Действие"],
      gen: ["The agent acts through tools or by writing a message. What it can do is exactly the set of tools it is given — this is where the safety of an agent system is designed.",
        "Агент действует через инструменты или пишет сообщение. Он может ровно то, что позволяют выданные ему инструменты, — здесь и проектируется безопасность агентной системы."],
      here: ["Only two actions exist: retrieve from its own base and return text through client.complete(system, user). No tool writes to y; a write attempt hits the freeze (403).",
        "Действий только два: поиск в своей базе и возврат текста через client.complete(system, user). Ни один инструмент не пишет в y; попытка записи упирается в заморозку (403)."]
    },
    check: {
      name: ["Check", "Проверка"],
      gen: ["The result of the action is observed and checked, and the loop repeats until the task is done or a limit is reached. Good systems check outside the model, in code.",
        "Результат действия наблюдается и проверяется, и цикл повторяется, пока задача не решена или не исчерпан лимит. Надёжные системы проверяют вне модели — кодом."],
      here: ["verify_numbers — a program component, not an agent — checks every number against s(y); one rewrite is allowed and what remains is marked; parse_verdict compares the agents’ verdict with the classifier’s.",
        "verify_numbers — программный компонент, а не агент — сверяет каждое число с s(y); разрешена одна переписка, остаток помечается; parse_verdict сравнивает вердикт агентов с вердиктом классификатора."]
    }
  };
  var loopSel = "perceive";
  function stepPhase(s) { return s ? (s.phase || (s.actor === "checker" ? "check" : null)) : null; }
  function renderLoop() {
    var cur = stepPhase(S.steps[S.cur]);
    document.querySelectorAll("#p3-loop [data-phase]").forEach(function (g) {
      var ph = g.getAttribute("data-phase");
      g.classList.toggle("sel", ph === loopSel);
      g.classList.toggle("now", ph === cur);
      g.setAttribute("aria-pressed", String(ph === loopSel));
    });
    var p = PHASE[loopSel], i = ru() ? 1 : 0;
    var first = -1;
    S.steps.forEach(function (s, k) { if (first < 0 && stepPhase(s) === loopSel) first = k; });
    $("p3-loop-detail").innerHTML =
      '<div class="p3l-h"><span class="p3l-badge">' + (A.PHASES.indexOf(loopSel) + 1) + "</span>" + esc(p.name[i]) + "</div>" +
      '<div class="panel-label">' + L("In any agent", "В любом агенте") + "</div><p>" + esc(p.gen[i]) + "</p>" +
      '<div class="panel-label">' + L("In this consilium", "В этом консилиуме") + "</div><p>" + esc(p.here[i]) + "</p>" +
      (first >= 0 ? '<button type="button" class="btn small" id="p3l-go">' + L("Show it in the emulator (step " + (first + 1) + ") ↓", "Показать в эмуляторе (шаг " + (first + 1) + ") ↓") + "</button>" : "");
    var go = $("p3l-go");
    if (go) go.addEventListener("click", function () { pause(); goTo(first, false); $("p3-emu").scrollIntoView({ behavior: "smooth", block: "start" }); });
  }
  document.querySelectorAll("#p3-loop [data-phase]").forEach(function (g) {
    var pick = function () { loopSel = g.getAttribute("data-phase"); renderLoop(); };
    g.addEventListener("click", pick);
    g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  });

  // ------------------------------------------------------------------ 5.2 the emulator
  var S = { steps: [], cur: -1, playing: false, speed: 1, stream: !reduceMotion, typed: -1, timer: null, typer: null, key: null };
  var STAGE_X = { x: 50, f: 203, freeze: 400, s: 586, consilium: 761, report: 914 };
  var STAGES = ["x", "f", "freeze", "s", "consilium", "report"];
  var ACTOR_ORDER = ["server", "evt", "graph", "loc", "chair", "checker", "store"];
  function actorName(id) { var a = A.ACTORS[id]; return a ? (ru() ? a.ru : a.en) : id; }
  function phaseName(ph) { return ph ? PHASE[ph].name[ru() ? 1 : 0] : L("program step", "программный шаг"); }
  function chip(id) { return '<span class="p3e-chip a-' + id + '"><span class="p3e-dot ' + (A.ACTORS[id].agent ? "agent" : "comp") + '"></span>' + esc(actorName(id)) + "</span>"; }

  function stopTimers() { clearTimeout(S.timer); clearInterval(S.typer); S.timer = null; S.typer = null; }
  function pause() { S.playing = false; stopTimers(); S.typed = -1; render(); }
  function dwell(s) { return Math.min(4200, 700 + String(s.body || "").length * 10) / S.speed; }

  // Move to step i; animate = stream its message (if any) and, when playing, schedule the next step.
  function goTo(i, animate) {
    stopTimers();
    S.cur = Math.max(0, Math.min(S.steps.length - 1, i));
    var s = S.steps[S.cur];
    S.typed = animate && S.stream && s.msg ? 0 : -1;
    render();
    if (S.typed >= 0) {
      S.typer = setInterval(function () {
        S.typed += Math.max(2, Math.round(3 * S.speed));
        if (S.typed >= s.msg.length) { clearInterval(S.typer); S.typer = null; S.typed = -1; render(); schedule(); return; }
        var b = $("p3e-bubble-now"), t = $("p3e-stream-tok");
        if (b) b.textContent = s.msg.slice(0, S.typed) + "▍";
        if (t) t.textContent = A.estTokens(s.msg.slice(0, S.typed));
      }, 28);
    } else if (animate) schedule();
  }
  function schedule() {
    if (!S.playing) return;
    if (S.cur >= S.steps.length - 1) { S.playing = false; render(); return; }
    S.timer = setTimeout(function () { goTo(S.cur + 1, true); }, dwell(S.steps[S.cur]));
  }
  function play() {
    if (!S.steps.length) return;
    S.playing = true;
    if (S.cur >= S.steps.length - 1) goTo(0, true); else goTo(S.cur + 1, true);
  }

  function renderBar() {
    var n = S.steps.length, s = S.steps[S.cur];
    $("p3e-play").innerHTML = S.playing ? "⏸ " + L("Pause", "Пауза") : "▶ " + L(S.cur >= n - 1 ? "Replay" : "Play", S.cur >= n - 1 ? "Сначала" : "Пуск");
    $("p3e-play").setAttribute("aria-pressed", String(S.playing));
    var sc = $("p3e-scrub"); sc.max = String(Math.max(0, n - 1)); sc.value = String(S.cur);
    var round = s.round === 0 ? L("level 1 · REST", "уровень 1 · REST") : s.round === 3 ? L("level 3 · conclusion", "уровень 3 · заключение") : L("level 2 · round " + s.round, "уровень 2 · раунд " + s.round);
    $("p3e-pos").innerHTML = L("Step ", "Шаг ") + "<b>" + (S.cur + 1) + "</b> " + L("of", "из") + " " + n + " · " + round + " · " + esc(phaseName(stepPhase(s)));
    document.querySelectorAll("#p3e-speed [data-v]").forEach(function (b) { b.setAttribute("aria-pressed", String(+b.getAttribute("data-v") === S.speed)); });
    $("p3e-stream").checked = S.stream;
    // actors: active one, and which have spoken so far
    var seen = {};
    S.steps.slice(0, S.cur + 1).forEach(function (x) { seen[x.actor] = true; });
    $("p3e-actors").innerHTML = ACTOR_ORDER.map(function (id) {
      return '<span class="p3e-actor' + (id === s.actor ? " now" : "") + (seen[id] ? " seen" : "") + '">' + chip(id) + "</span>";
    }).join("") + '<span class="p3e-legend"><span class="p3e-dot agent"></span>' + L("agent", "агент") + ' <span class="p3e-dot comp"></span>' + L("program component", "программный компонент") + "</span>";
  }

  function rowHTML(s, k) {
    var now = k === S.cur, cls = "p3e-row" + (now ? " now" : "") + (s.status ? " " + s.status : "") + (s.fault ? " fault" : "");
    var mark = s.status === "good" ? (s.refused ? "⛔" : "✓") : s.status === "bad" ? "✗" : s.status === "warn" ? "!" : "·";
    var html = '<li class="' + cls + '" data-i="' + k + '"><button type="button" class="p3e-rowbtn"><span class="p3e-m">' + mark + "</span>" + chip(s.actor) +
      '<span class="p3e-ph">' + esc(phaseName(stepPhase(s))) + "</span>" + '<span class="p3e-title">' + esc(s.title) + "</span>" + (s.fault ? '<span class="p3e-ftag">' + L("fault", "ошибка") + "</span>" : "") + "</button>";
    if (s.msg) {
      html += now && S.typed >= 0 ? '<div class="p3e-bubble typing" id="p3e-bubble-now">' + esc(s.msg.slice(0, S.typed)) + "▍</div>"
        : '<div class="p3e-bubble">' + md(s.msg) + "</div>";
    }
    return html + "</li>";
  }

  function renderLog() {
    var log = $("p3e-log");
    log.innerHTML = S.steps.slice(0, S.cur + 1).map(rowHTML).join("");
    log.querySelectorAll(".p3e-rowbtn").forEach(function (b) {
      b.addEventListener("click", function () { pause(); goTo(+b.parentNode.getAttribute("data-i"), false); });
    });
    log.scrollTop = log.scrollHeight;        // keep the newest line in view, inside the log only
  }

  function renderInspect() {
    var s = S.steps[S.cur], h = "";
    h += '<div class="p3e-ihead">' + chip(s.actor) + '<span class="p3e-kind">' + (A.ACTORS[s.actor].agent ? L("agent", "агент") : L("program component — deterministic", "программный компонент — детерминирован")) + "</span>" +
      '<span class="p3e-ph">' + esc(phaseName(stepPhase(s))) + "</span></div>";
    h += '<h4 class="p3e-ititle">' + esc(s.title) + "</h4><p>" + esc(s.body) + "</p>";
    if (s.tool) {
      h += '<div class="p3e-tool ' + (s.tool.ok ? "ok" : "no") + '"><span class="panel-label">' + L("tool call", "вызов инструмента") + "</span><code>" + esc(s.tool.name) + "(" + esc(JSON.stringify(s.tool.args)) + ")</code> → <b>" + esc(s.tool.result) + "</b></div>";
    }
    if (s.call) {
      var streaming = S.typed >= 0;
      h += '<div class="p3e-call"><div class="p3e-meter"><span><code>' + esc(s.call.client) + ".complete(system, user)</code></span>" +
        "<span>" + L("a real model would be sent ≈ ", "настоящая модель получила бы ≈ ") + "<b>" + s.call.tokens + "</b>" + L(" tokens", " токенов") + "</span>" +
        '<span class="p3e-zero">' + L("spent here: 0 — replay", "потрачено здесь: 0 — воспроизведение") + "</span>" +
        (streaming ? '<span class="p3e-live">' + L("streaming… ", "печать… ") + '<b id="p3e-stream-tok">0</b>' + L(" tokens out", " токенов ответа") + "</span>" : "") + "</div>" +
        '<details class="p3e-ctx"><summary>system · ' + L("role", "роль") + "</summary><pre>" + esc(s.call.system) + "</pre></details>" +
        '<details class="p3e-ctx"><summary>user · ' + L("what the model is given", "что получает модель") + "</summary><pre>" + esc(s.call.user) + "</pre></details></div>";
    }
    if (s.check) {
      h += '<div class="p3e-check"><span class="p3-num ok">' + s.check.ok + " " + L("found", "найдено") + '</span> <span class="p3-num bad">' + s.check.bad + " " + L("not in s(y)", "нет в s(y)") +
        '</span> <span class="p3-num skipped">' + s.check.skipped + " " + L("skipped (< 10)", "пропущено (< 10)") + "</span></div>";
    }
    (s.context || []).forEach(function (c, k) {
      h += '<details class="p3e-ctx"' + (k === 0 ? " open" : "") + "><summary>" + L("context · ", "контекст · ") + esc(c.k) + "</summary><pre>" + esc(c.v) + "</pre></details>";
    });
    $("p3e-inspect").innerHTML = h;
  }

  function renderFlow() {
    var s = S.steps[S.cur], at = STAGES.indexOf(s.stage);
    // the furthest stage reached so far marks the arrows already passed
    var reach = 0;
    S.steps.slice(0, S.cur + 1).forEach(function (x) { reach = Math.max(reach, STAGES.indexOf(x.stage)); });
    document.querySelectorAll(".p3-flow [data-stage]").forEach(function (g) {
      var k = STAGES.indexOf(g.getAttribute("data-stage"));
      g.classList.toggle("now", k === at);
      g.classList.toggle("done", k <= reach && k !== at);
    });
    document.querySelectorAll(".p3-flow [data-to]").forEach(function (p) { p.classList.toggle("done", STAGES.indexOf(p.getAttribute("data-to")) <= reach); });
    $("p3f-no").classList.toggle("hit", !!(s.refused && s.stage === "freeze"));
    var cur = $("p3f-cursor");
    cur.setAttribute("transform", "translate(" + STAGE_X[s.stage] + ",118)");
    cur.classList.toggle("agent", A.ACTORS[s.actor].agent);
    $("p3f-live").textContent = actorName(s.actor);
  }

  function renderTotals() {
    var all = A.totals(S.steps), sofar = A.totals(S.steps.slice(0, S.cur + 1));
    $("p3e-totals").innerHTML =
      "<span>" + L("Model calls", "Вызовов модели") + ": <b>" + sofar.calls + "</b> / " + all.calls + "</span>" +
      "<span>" + L("tokens a real model would be sent", "токенов получила бы настоящая модель") + ": ≈ <b>" + sofar.tokens + "</b> / " + all.tokens + "</span>" +
      '<span class="p3e-zero">' + L("tokens spent: 0 · network requests: 0", "потрачено токенов: 0 · сетевых запросов: 0") + "</span>";
  }

  function render() {
    if (!S.steps.length) return;
    renderBar(); renderLog(); renderInspect(); renderFlow(); renderTotals(); renderLoop();
  }

  // a new run of js/p3.js: rebuild the trace; a newly injected fault jumps to the first step where it acts
  function onRun(d) {
    var lang = ru() ? "ru" : "en", key = d.fault + "|" + d.provider, prev = S.key;
    S.steps = A.trace(d.ev, d.out, d.meta, { fault: d.fault, provider: d.provider, write: d.write }, lang);
    S.key = key;
    var target = S.cur;
    if (prev === null || S.cur < 0) target = S.steps.length - 1;          // first run: show the finished state
    else if (prev !== key) {
      var f = -1;
      S.steps.forEach(function (s, k) { if (f < 0 && s.fault) f = k; });
      target = f >= 0 ? f : S.steps.length - 1;
      S.playing = false;
    }
    if (S.playing) goTo(Math.min(target, S.steps.length - 1), true);
    else { stopTimers(); S.typed = -1; S.cur = Math.max(0, Math.min(target, S.steps.length - 1)); render(); }
  }

  // ------------------------------------------------------------------ controls
  $("p3e-play").addEventListener("click", function () { if (S.playing) pause(); else play(); });
  $("p3e-next").addEventListener("click", function () { S.playing = false; goTo(S.cur + 1, true); });
  $("p3e-back").addEventListener("click", function () { S.playing = false; goTo(S.cur - 1, false); });
  $("p3e-restart").addEventListener("click", function () { S.playing = false; goTo(0, false); });
  $("p3e-end").addEventListener("click", function () { S.playing = false; goTo(S.steps.length - 1, false); });
  $("p3e-scrub").addEventListener("input", function () { S.playing = false; goTo(+this.value, false); });
  $("p3e-stream").addEventListener("change", function () { S.stream = this.checked; });
  document.querySelectorAll("#p3e-speed [data-v]").forEach(function (b) {
    b.addEventListener("click", function () { S.speed = +b.getAttribute("data-v"); renderBar(); });
  });
  $("p3-emu").addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;  // form controls keep their own keys
    if (e.key === "ArrowRight") { e.preventDefault(); S.playing = false; goTo(S.cur + 1, true); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); S.playing = false; goTo(S.cur - 1, false); }
    else if (e.key === " " && tag !== "button" && tag !== "summary") { e.preventDefault(); if (S.playing) pause(); else play(); }
  });
  document.querySelectorAll(".p3-flow [data-stage]").forEach(function (g) {
    var jump = function () {
      var st = g.getAttribute("data-stage"), k = -1;
      S.steps.forEach(function (s, j) { if (k < 0 && s.stage === st) k = j; });
      if (k >= 0) { pause(); goTo(k, false); }
    };
    g.addEventListener("click", jump);
    g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); jump(); } });
  });

  document.addEventListener("eld:p3-run", function (e) { onRun(e.detail); });
  document.addEventListener("eld:lang", function () { if (!S.steps.length) renderLoop(); });
  if (window.ELD_P3_RUN) onRun(window.ELD_P3_RUN); else renderLoop();
})();
