// Section 5 (Position 3): REST → consilium → conclusion, run by a stub client on the live result of section 3.
// The rules (verify_numbers, parse_verdict, disagreement) come from js/p3-core.js; this file only shows them at work.

(function () {
  "use strict";

  var C = window.P3Core;
  var U = window.P3UICore;
  var root = document.documentElement;
  if (!C || !U || !document.getElementById("p3")) return;

  function $(id) { return document.getElementById(id); }
  function ru() { return root.getAttribute("data-lang") === "ru"; }
  function L(en, r) { return ru() ? r : en; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function press(sel, val) {
    document.querySelectorAll(sel + " [data-v]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === String(val))); });
  }
  function num(v) { return ru() ? String(v).replace(".", ",") : String(v); }

  var FAULTS = ["none", "misquote", "stubborn", "disagree", "threshold"];
  var PROVIDERS = ["a", "b"];
  var urlState = U.stateFromURL(location.search, FAULTS, PROVIDERS);
  var st = { provider: urlState.provider || "a", fault: urlState.fault || "none", edited: null };
  var IN = null, EV = null, OUT = null, FP0 = null, FP1 = null, OTHER = null, WRITE = null, LAST_FP = null, staleTimer = null;

  // Text with every number marked by its status against s(y); light Markdown (### heading, - item, **bold**, ```json).
  function marked(line) {
    var parts = C.checkNumbers(line, EV), html = "", at = 0;
    parts.forEach(function (n) {
      html += esc(line.slice(at, n.index));
      var title = n.status === "ok" ? "= " + n.match + (n.percent ? " × 100" : "") + "  (|a − e| ≤ " + n.tol.toPrecision(2) + ")" : n.status === "bad" ? L("not in s(y)", "нет в s(y)") : L("integer below 10: not checked", "целое меньше 10: не проверяется");
      html += '<span class="p3-num ' + n.status + '" title="' + esc(title) + '">' + esc(n.raw) +
        (n.status === "ok" || n.status === "bad" ? '<span class="p3-glyph" aria-hidden="true">' + (n.status === "ok" ? "✓" : "✗") + "</span>" : "") + "</span>";
      at = n.index + n.raw.length;
    });
    html += esc(line.slice(at));
    return html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\[([a-z_]+#[^\]]*)\]/g, '<span class="p3-cite">[$1]</span>');
  }
  function md(text) {
    var out = [], code = false;
    String(text).split("\n").forEach(function (line) {
      if (/^```/.test(line)) { code = !code; return; }
      if (code) { out.push('<code class="mono">' + marked(line) + "</code>"); return; }
      if (/^### /.test(line)) { out.push("<h4>" + marked(line.slice(4)) + "</h4>"); return; }
      out.push(marked(line));
    });
    return out.join("\n").replace(/\n{2,}/g, "\n");
  }

  function run() {
    if (!IN) return;
    EV = C.deepFreeze(JSON.parse(JSON.stringify(IN.summary)));
    FP0 = C.fingerprint(EV);
    var lang = ru() ? "ru" : "en";
    OUT = C.consilium(EV, { provider: st.provider, fault: st.fault }, lang);
    OTHER = C.consilium(EV, { provider: st.provider === "a" ? "b" : "a", fault: st.fault }, lang);
    WRITE = null;
    if (st.fault === "threshold") {                 // the agent layer tries to act on its proposal: the summary is frozen
      try { EV.spec.q = 0.9; WRITE = { ok: true }; } catch (e) { WRITE = { ok: false, msg: e.name }; }
    }
    FP1 = C.fingerprint(EV);
    render();
  }

  function render() {
    if (!OUT) return;
    var ev = EV, meta = IN.meta, sid = "s-" + meta.series_fnv1a.slice(0, 4), fid = "f-" + meta.series_fnv1a.slice(4, 8);
    var verdict = { event_detected: OUT.pipelineVerdict.event_detected, source: OUT.pipelineVerdict.source };
    $("p3-rest").textContent = [
      "POST /api/v1/files/            x(t): n = " + meta.n + ", fnv1a " + meta.series_fnv1a,
      "  201 " + JSON.stringify({ file_id: fid }),
      "POST /api/v1/session/          " + JSON.stringify({ file_id: fid, pipeline: "onedim", q: meta.spec.q, gamma: meta.spec.gamma, r: meta.spec.r }),
      "  202 " + JSON.stringify({ session_id: sid, status: "queued" }),
      "GET  /api/v1/session/" + sid + "  →  200 " + JSON.stringify({ status: "running" }),
      "GET  /api/v1/session/" + sid + "  →  200 " + JSON.stringify({ status: "done", verdict: verdict }),
      "",
      L("freeze(s(y)) · fingerprint y = ", "freeze(s(y)) · отпечаток y = ") + FP0,
      "",
      U.probeLine(ru() ? "ru" : "en")
    ].join("\n");
    $("p3-evidence").textContent = JSON.stringify(ev, null, 1);

    // level 2: rounds
    var rows = C.ROLES.filter(function (r) { return r.base; }).map(function (r) {
      var hits = OUT.retrieval[r.id];
      return "<tr><td>" + L(r.en, r.ru) + '<br><span class="p3-base">' + r.base + " · " + hits.hits.length + L(" chunks", " фрагм.") + '</span><br><span class="p3-cite">[P21]: ' + L(r.p21.en, r.p21.ru) + "</span></td>" +
        "<td>" + md(OUT.round1[r.id]) + "</td><td>" + md(OUT.round2[r.id]) + "</td></tr>";
    });
    $("p3-rounds").innerHTML = "<thead><tr><th>" + L("Role · own base", "Роль · своя база") + "</th><th>" + L("Round 1 · independent", "Раунд 1 · независимо") + "</th><th>" + L("Round 2 · debate", "Раунд 2 · дебаты") + "</th></tr></thead><tbody>" + rows.join("") + "</tbody>";
    $("p3-refused").innerHTML = '<span class="p3-flag bad">✗</span> ' + L("Graph reviewer → <code>evt_db</code>: <b>refused</b> — a role queries only its own base, so the reviewers’ opinions stay independent.",
      "Рецензент графа → <code>evt_db</code>: <b>отклонено</b> — роль обращается только к своей базе, поэтому мнения рецензентов независимы.");

    // level 3: conclusion and checks
    $("p3-final").innerHTML = md(OUT.final);
    $("p3-first-box").hidden = !OUT.rewritten;
    $("p3-first").innerHTML = md(OUT.first);

    // what the injected fault did: numbers fixed by the rewrite, and numbers still unverified
    var diffBox = $("p3-diff");
    if (OUT.rewritten) {
      var d = U.diffNumbers(OUT.first, OUT.final);
      var parts = d.pairs.map(function (p) { return "<span class=\"mono\">" + esc(p.from) + " → " + esc(p.to) + "</span>"; });
      var pairedFrom = {};
      d.pairs.forEach(function (p) { pairedFrom[String(p.from)] = true; });
      (OUT.unverified.final || []).forEach(function (raw) {
        if (!pairedFrom[String(raw)]) parts.push("<span class=\"mono\">" + esc(raw) + "</span>");
      });
      diffBox.innerHTML = (parts.length
        ? L("<b>What the fault changed.</b> Numbers of the first draft vs the final: ", "<b>Что изменила ошибка.</b> Числа первого варианта и итога: ") + parts.join(" · ") +
          (d.pairs.length ? L(" — fixed by the one allowed rewrite.", " — исправлено единственной перепиской.") : L(" — after the rewrite these still fail the number check and are kept with a mark (M6).", " — после переписки эти числа всё ещё не проходят сверку и сохраняются с отметкой (М6)."))
        : L("<b>What the fault changed.</b> The rewrite produced the same text: the fault had no numerical effect.", "<b>Что изменила ошибка.</b> Переписка дала тот же текст: численного эффекта ошибка не имела."));
      diffBox.hidden = false;
    } else diffBox.hidden = true;
    var checks = [];
    checks.push([FP0 === FP1 ? "good" : "bad", L("<b>Invariance (Def. 5.1).</b> Fingerprint of y before the agent layer " + FP0 + ", after " + FP1 + (FP0 === FP1 ? " — unchanged." : " — CHANGED."),
      "<b>Инвариантность (опр. 5.1).</b> Отпечаток y до агентного слоя " + FP0 + ", после — " + FP1 + (FP0 === FP1 ? " — не изменился." : " — ИЗМЕНИЛСЯ."))]);
    checks.push(["good", L("<b>Provider switch.</b> With the other stub the text differs, y does not: fingerprint " + C.fingerprint(EV) + " in both runs; verdict " + JSON.stringify(OTHER.agentVerdict) + ".",
      "<b>Смена провайдера.</b> С другой заглушкой текст другой, а y — нет: отпечаток " + C.fingerprint(EV) + " в обоих прогонах; вердикт " + JSON.stringify(OTHER.agentVerdict) + ".")]);
    if (WRITE) checks.push([WRITE.ok ? "bad" : "good", WRITE.ok ? L("<b>Write to s(y).spec.q succeeded</b> — the summary was not frozen.", "<b>Запись в s(y).spec.q прошла</b> — сводка не заморожена.")
      : L("<b>Proposal to change q.</b> The agent layer tried to write s(y).spec.q = 0.90: refused (" + WRITE.msg + ", the summary is frozen). The proposal can only stay in the text, where the number check flags it.",
          "<b>Предложение изменить q.</b> Агентный слой попытался записать s(y).spec.q = 0,90: отклонено (" + WRITE.msg + ", сводка заморожена). Предложение остаётся только в тексте, где его помечает сверка чисел.")]);
    var bad1 = OUT.firstBad, badF = OUT.unverified.final || [];
    checks.push([!bad1.length ? "good" : !badF.length ? "warn" : "bad",
      !bad1.length ? L("<b>Number check (M6).</b> Every number of the conclusion is found in s(y); no rewrite needed.", "<b>Сверка чисел (М6).</b> Каждое число заключения есть в s(y); переписка не нужна.")
      : !badF.length ? L("<b>Number check (M6).</b> The first draft had " + bad1.map(esc).join(", ") + " — not in s(y). One rewrite was requested; the final text passes.", "<b>Сверка чисел (М6).</b> В первом варианте " + bad1.map(esc).join(", ") + " — нет в s(y). Запрошена одна переписка; итоговый текст проходит.")
      : L("<b>Number check (M6).</b> After the one allowed rewrite " + badF.map(esc).join(", ") + " is still not in s(y): it is kept and marked in <code>unverified_numbers</code>, not silently fixed.", "<b>Сверка чисел (М6).</b> После единственной переписки " + badF.map(esc).join(", ") + " всё ещё нет в s(y): число сохраняется с отметкой в <code>unverified_numbers</code>, а не исправляется молча.")]);
    var dis = OUT.disagreement || {}, anyDis = Object.keys(dis).some(function (k) { return dis[k]; });
    checks.push([anyDis ? "warn" : "good", anyDis ? L("<b>Disagreement kept (§ 5.3).</b> The agents’ verdict differs from the pipeline’s; both are stored with the mark — the agents do not overwrite the classifier.", "<b>Расхождение сохранено (§ 5.3).</b> Вердикт агентов расходится с вердиктом конвейера; оба хранятся с отметкой — агенты не переписывают классификатор.")
      : L("<b>Verdicts agree.</b> The agents’ JSON verdict matches the pipeline’s.", "<b>Вердикты совпадают.</b> JSON-вердикт агентов совпадает с вердиктом конвейера.")]);
    $("p3-checks").innerHTML = checks.map(function (c) { return '<div class="p3-check ' + c[0] + '"><span class="m">' + (c[0] === "good" ? "✓" : c[0] === "warn" ? "!" : "✗") + "</span><span>" + c[1] + "</span></div>"; }).join("");

    var av = OUT.agentVerdict || {}, pv = OUT.pipelineVerdict;
    var cell = function (v) { return '<td class="mono">' + esc(v === null || v === undefined ? "null" : String(v)) + "</td>"; };
    var mark = function (k) { return dis[k] === undefined ? "<td>–</td>" : '<td><span class="p3-flag ' + (dis[k] ? "bad" : "good") + '">' + (dis[k] ? "1 · " + L("differs", "расходится") : "0") + "</span></td>"; };
    $("p3-verdicts").innerHTML = "<thead><tr><th></th><th>event_detected</th><th>source</th></tr></thead><tbody>" +
      "<tr><td>ŷ<sub>clf</sub> · " + L("pipeline", "конвейер") + "</td>" + cell(pv.event_detected) + cell(pv.source) + "</tr>" +
      "<tr><td>ŷ<sub>agents</sub></td>" + cell(av.event_detected) + cell(av.source) + "</tr>" +
      '<tr id="p3-dis-row"' + (anyDis ? ' class="p3-dis"' : "") + "><td>𝟙[ŷ<sub>agents</sub> ≠ ŷ<sub>clf</sub>]</td>" + mark("event_detected") + mark("source") + "</tr></tbody>";
    if (anyDis) flash("p3-dis-row");

    if (st.edited === null) $("p3-edit").value = OUT.final;
    renderEdit();
    press("#p3-provider", st.provider); press("#p3-fault", st.fault);
    updateRules();
  }

  // brief highlight of an element a rule card points to
  function flash(id) {
    var el = $(id);
    if (!el) return;
    el.classList.remove("p3-flash");
    void el.offsetWidth;                       // restart the animation
    el.classList.add("p3-flash");
  }

  // which guarantees are being demonstrated right now
  function updateRules() {
    var dis = OUT.disagreement || {};
    var active = {
      def51: true,
      rag: true,
      rounds: true,
      m6: st.fault === "misquote" || st.fault === "stubborn" || st.fault === "threshold",
      rewrite: !!OUT.rewritten,
      disagree: Object.keys(dis).some(function (k) { return dis[k]; })
    };
    document.querySelectorAll("#p3-rules [data-rule]").forEach(function (b) {
      var on = !!active[b.getAttribute("data-rule")];
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }

  document.querySelectorAll("#p3-rules [data-rule]").forEach(function (b) {
    b.addEventListener("click", function () {
      var target = $(b.getAttribute("data-target"));
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      flash(target.id);
      if (target.id === "p3-verdicts") flash("p3-dis-row");
    });
  });

  function renderEdit() {
    var text = $("p3-edit").value, list = C.checkNumbers(text, EV);
    $("p3-edit-view").innerHTML = md(text);
    var label = { ok: L("found", "найдено"), bad: L("not in s(y)", "нет в s(y)"), skipped: L("not checked (< 10)", "не проверяется (< 10)") };
    $("p3-edit-table").innerHTML = "<thead><tr><th>a</th><th>" + L("status", "статус") + '</th><th class="num">e ∈ s(y)</th><th class="num">ε</th></tr></thead><tbody>' +
      list.map(function (n) {
        return '<tr><td class="mono">' + esc(n.raw) + '</td><td><span class="p3-num ' + n.status + '">' + label[n.status] + "</span></td>" +
          '<td class="num mono">' + (n.status === "ok" ? num(n.match) + (n.percent ? " ×100" : "") : "–") + '</td><td class="num mono">' + (n.tol ? num(+n.tol.toPrecision(2)) : "–") + "</td></tr>";
      }).join("") + "</tbody>";
  }

  document.querySelectorAll("#p3-provider [data-v]").forEach(function (b) { b.addEventListener("click", function () { st.provider = b.getAttribute("data-v"); st.edited = null; run(); }); });
  document.querySelectorAll("#p3-fault [data-v]").forEach(function (b) { b.addEventListener("click", function () { st.fault = b.getAttribute("data-v"); st.edited = null; run(); }); });
  $("p3-edit").addEventListener("input", function () { st.edited = this.value; renderEdit(); });
  $("p3-edit-reset").addEventListener("click", function () { st.edited = null; if (OUT) { $("p3-edit").value = OUT.final; renderEdit(); } });

  // The consilium restarts whenever section 3 publishes a new result; say so when the input actually changed.
  function takeInput(detail) {
    IN = detail;
    var fp = C.fingerprint(JSON.parse(JSON.stringify(detail.summary)));
    if (LAST_FP !== null && fp !== LAST_FP) {
      var note = $("p3-stale");
      note.textContent = L("Input changed in section 3 — the consilium has rerun on the new frozen s(y). New fingerprint: " + fp,
        "Вход изменился в разделе 3 — консилиум пересчитан на новой замороженной s(y). Новый отпечаток: " + fp);
      note.hidden = false;
      clearTimeout(staleTimer);
      staleTimer = setTimeout(function () { note.hidden = true; }, 8000);
    }
    LAST_FP = fp;
    run();
  }
  document.addEventListener("eld:od-result", function (e) { takeInput(e.detail); });
  if (window.ELD_OD_RESULT) takeInput(window.ELD_OD_RESULT);

  // Permalink to the current fault/provider state (for slides and classroom).
  $("p3-permalink").addEventListener("click", function () {
    var btn = this, url = U.stateURL(location.href, st.fault, st.provider);
    var done = function () {
      btn.querySelectorAll("[lang]").forEach(function (s) { s.textContent = s.getAttribute("lang") === "ru" ? "Ссылка скопирована" : "Link copied"; });
      setTimeout(function () { renderBtnLabel(); }, 1600);
    };
    var renderBtnLabel = function () {
      btn.querySelectorAll("[lang]").forEach(function (s) { s.textContent = s.getAttribute("lang") === "ru" ? "Скопировать ссылку на это состояние" : "Copy link to this state"; });
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt(L("Copy the link:", "Скопируйте ссылку:"), url); });
    else window.prompt(L("Copy the link:", "Скопируйте ссылку:"), url);
  });
})();
