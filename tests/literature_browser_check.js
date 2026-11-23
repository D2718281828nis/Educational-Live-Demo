// End-to-end checks for the literature section. Run: node tests/literature_browser_check.js
// Requires the development-only Playwright dependency and `npx playwright install chromium --no-shell`.
"use strict";
var http = require("http"), fs = require("fs"), path = require("path"), assert = require("assert");
var { chromium } = require("playwright");
var root = path.join(__dirname, "..");
var graph = require(path.join(root, "data", "literature-graph.json"));
var C = require(path.join(root, "js", "literature-core.js"));
graph.nodeMap = new Map(graph.nodes.map(function (n) { return [n.id, n]; }));
var sources = graph.nodes.filter(function (n) { return n.type === "bibliography_source"; });
var sample = sources.find(function (n) { return n.internal_reference_ids.length && n.cited_by_internal_ids.length && n.doi; });
var sampleChain = C.citationChain(graph, sample.id);
var mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
var server = http.createServer(function (request, response) {
  var pathname;
  try { pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
  catch (e) { response.writeHead(400).end(); return; }
  if (pathname.indexOf("/Educational-Live-Demo/") === 0) pathname = pathname.slice("/Educational-Live-Demo".length);
  if (pathname.endsWith("/")) pathname += "index.html";
  if (pathname.endsWith("/version.json")) { response.writeHead(200, { "Content-Type": "application/json" }).end("{}"); return; }
  if (pathname.endsWith("/favicon.ico")) { response.writeHead(204).end(); return; }
  var filename = path.resolve(root, "." + pathname);
  if (filename.indexOf(root + path.sep) !== 0 || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "Content-Type": mime[path.extname(filename)] || "application/octet-stream" });
  fs.createReadStream(filename).pipe(response);
});
var browser, base, failures = [];
function ok(name) { console.log("ok   " + name); }
async function test(name, fn) {
  try { await fn(); ok(name); }
  catch (error) { failures.push(name + ": " + error.message); console.log("FAIL " + name + "\n     " + error.stack); }
}

(async function () {
  await new Promise(function (resolve) { server.listen(0, "127.0.0.1", resolve); });
  base = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({ headless: true, channel: "chromium", executablePath: process.env.CHROMIUM_EXECUTABLE || undefined });
  var context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route("https://doi.org/**", function (route) { return route.fulfill({ status: 200, contentType: "text/html", body: "DOI test target" }); });
  var page = await context.newPage();
  var errors = [], requested = [];
  page.on("pageerror", function (error) { errors.push(error.message); });
  page.on("console", function (message) { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", function (response) { if (response.url().indexOf("literature-") >= 0) requested.push(response.url()); });
  var prefix = base + "/Educational-Live-Demo/";

  await test("relative graph JSON works at a GitHub Pages-style subpath; details stay lazy", async function () {
    await page.goto(prefix, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return document.getElementById("literature").dataset.ready === "true"; });
    assert.strictEqual(await page.locator("#lg-node-count").textContent(), "244 / 244");
    assert.strictEqual(await page.locator("#lg-citation-count").textContent(), "0 / 379");
    assert(requested.some(function (url) { return url.endsWith("/Educational-Live-Demo/data/literature-graph.json"); }));
    assert(!requested.some(function (url) { return url.indexOf("literature-details.json") >= 0; }));
    assert(await page.locator("#lg-force-wrap").isHidden());
  });
  await test("all three ordinary layouts and both visualisers switch without errors", async function () {
    for (var layout of ["force", "radial", "hierarchical"]) {
      await page.locator("#lg-layout").selectOption(layout);
      await page.waitForFunction(function (value) { return document.getElementById("lg-canvas").dataset.layout === value; }, layout);
      if (layout === "force") { await page.waitForTimeout(150); await page.locator("#lg-force-toggle").click(); }
    }
    await page.locator('#lg-mode button[data-v="hyper"]').click();
    await page.waitForFunction(function () { return document.getElementById("lg-canvas").dataset.mode === "hyper"; });
    assert(await page.locator("#lg-layout-control").isHidden());
    assert(await page.locator("#lg-hyper-note").isVisible());
    assert((await page.locator("#lg-hyper-note").textContent()).indexOf("rank(year)") >= 0);
    var rect = await page.locator("#lg-canvas").boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down(); await page.mouse.move(rect.x + rect.width / 2 + 60, rect.y + 30, { steps: 5 }); await page.mouse.up();
    await page.locator("#lg-reset").click();
    await page.locator('#lg-mode button[data-v="normal"]').click();
    assert.strictEqual(await page.locator("#lg-canvas").getAttribute("data-mode"), "normal");
    assert(await page.locator("#lg-hyper-note").isHidden());
  });
  await test("selecting an article reveals its complete recursive citation chain and hierarchy", async function () {
    assert.strictEqual(await page.locator("#lg-direction").inputValue(), "chain");
    await page.locator("#lg-node-select").selectOption(sample.id);
    assert(sampleChain.sourceIds.size > sample.internal_reference_ids.length + sample.cited_by_internal_ids.length);
    assert.strictEqual(await page.locator("#lg-node-count").textContent(), sampleChain.nodeIds.size + " / 244");
    assert.strictEqual(await page.locator("#lg-citation-count").textContent(), sampleChain.edges.length + " / 379");
    var options = await page.locator("#lg-node-select option").evaluateAll(function (items) { return items.map(function (item) { return item.value; }); });
    sampleChain.nodeIds.forEach(function (id) { assert(options.indexOf(id) >= 0, id + " must be revealed"); });
    await page.locator("#lg-canvas").focus(); await page.keyboard.press("Escape");
    assert.strictEqual(await page.locator("#lg-node-count").textContent(), "244 / 244");
    assert.strictEqual(await page.locator("#lg-citation-count").textContent(), "0 / 379");
  });
  await test("search, filters, citation visibility and direction update live", async function () {
    await page.locator("#lg-search").fill(sample.title.slice(0, 24));
    await page.waitForFunction(function (id) { return Array.from(document.getElementById("lg-node-select").options).some(function (option) { return option.value === id; }); }, sample.id);
    await page.locator("#lg-search").fill("");
    await page.locator("#lg-position").selectOption("P1");
    assert.strictEqual(await page.locator("#lg-node-count").textContent(), "156 / 244");
    await page.locator("#lg-position").selectOption("all");
    await page.locator("#lg-year-min").fill("2011"); await page.locator("#lg-year-max").fill("2011");
    assert.notStrictEqual(await page.locator("#lg-node-count").textContent(), "244 / 244");
    await page.locator("#lg-year-min").fill(""); await page.locator("#lg-year-max").fill("");
    await page.locator("#lg-type").selectOption("article");
    assert.notStrictEqual(await page.locator("#lg-node-count").textContent(), "244 / 244");
    await page.locator("#lg-type").selectOption("all");
    await page.locator("#lg-abstract").selectOption("yes");
    assert.strictEqual(await page.locator("#lg-node-count").textContent(), "218 / 244");
    await page.locator("#lg-abstract").selectOption("all");
    await page.locator("#lg-direction").selectOption("outgoing");
    assert.strictEqual(await page.locator("#lg-citation-count").textContent(), "0 / 379");
    await page.locator("#lg-node-select").selectOption(sample.id);
    assert.strictEqual(await page.locator("#lg-citation-count").textContent(), sample.internal_reference_ids.length + " / 379");
    await page.locator("#lg-citations").uncheck();
    assert.strictEqual(await page.locator("#lg-citation-count").textContent(), "0 / 379");
    await page.locator("#lg-citations").check(); await page.locator("#lg-direction").selectOption("all");
  });
  await test("source card lazily loads full abstract/references, pages them and opens DOI", async function () {
    await page.locator("#lg-node-select").selectOption(sample.id);
    await page.waitForFunction(function (id) {
      var body = document.getElementById("lg-details-body"); return body && body.querySelector('[data-lg-list="outgoing"]') && body.textContent.indexOf("Loading") < 0 && body.textContent.indexOf("Загрузка") < 0;
    }, sample.id);
    assert(requested.some(function (url) { return url.endsWith("/data/literature-details.json"); }));
    assert((await page.locator("#lg-details-body .lg-detail-title").textContent()) === sample.title);
    assert((await page.locator("#lg-details-body .lg-ref-list li").count()) <= 40);
    var doi = page.locator('#lg-details-body a[href^="https://doi.org/"]').first();
    assert.strictEqual(await doi.getAttribute("href"), "https://doi.org/" + sample.doi);
    var popupPromise = context.waitForEvent("page"); await doi.click();
    var popup = await popupPromise; await popup.waitForLoadState("domcontentloaded");
    assert.strictEqual(popup.url(), "https://doi.org/" + sample.doi); await popup.close();
    var next = page.locator('[data-lg-list="outgoing"][data-lg-page="2"]');
    if (await next.count()) { await next.click(); assert(await page.locator('[data-lg-list="outgoing"][data-lg-page="1"]').isVisible()); }
  });
  await test("internal citation navigation selects the target node", async function () {
    await page.locator("#lg-node-select").selectOption(sample.id);
    await page.waitForTimeout(100);
    var button = page.locator("#lg-details-body [data-lg-node]").first();
    var target = await button.getAttribute("data-lg-node"); await button.click();
    assert.strictEqual(await page.locator("#lg-canvas").getAttribute("data-selected"), target);
    assert.strictEqual(await page.locator("#lg-node-select").inputValue(), target);
  });
  await test("zoom, fit, reset and keyboard alternative work", async function () {
    for (var id of ["lg-zoom-in", "lg-zoom-out", "lg-fit", "lg-reset"]) await page.locator("#" + id).click();
    await page.locator("#lg-canvas").focus(); await page.keyboard.press("ArrowRight");
    assert(await page.locator("#lg-canvas").getAttribute("data-selected"));
    await page.keyboard.press("Escape"); assert.strictEqual(await page.locator("#lg-canvas").getAttribute("data-selected"), "");
    assert((await page.locator("#lg-selection-summary").textContent()).length > 10);
  });
  await test("EN/RU and light/dark theme apply to the new section", async function () {
    await page.locator('[data-set-lang="ru"]').click();
    assert.strictEqual(await page.locator("html").getAttribute("data-lang"), "ru");
    assert(await page.locator('#literature h2 [lang="ru"]').isVisible());
    assert.strictEqual(await page.locator("#lg-position option").first().textContent(), "Все положения");
    var before = await page.locator("html").getAttribute("data-theme");
    await page.locator("#theme-toggle").click();
    assert.notStrictEqual(await page.locator("html").getAttribute("data-theme"), before);
    await page.locator('[data-set-lang="en"]').click();
  });
  await test("mobile layout stacks controls and source card without covering the graph", async function () {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    var canvasRect = await page.locator("#lg-canvas").boundingBox(), detailsRect = await page.locator("#lg-details").boundingBox();
    assert(detailsRect.y >= canvasRect.y + canvasRect.height);
    var dimensions = await page.locator("#literature").evaluate(function (section) {
      return { scroll: section.scrollWidth, client: section.clientWidth, columns: getComputedStyle(document.querySelector(".lg-workspace")).gridTemplateColumns };
    });
    assert(dimensions.scroll <= dimensions.client + 1, JSON.stringify(dimensions));
    assert(dimensions.columns.indexOf(" ") < 0, dimensions.columns);
  });
  await test("local root paths and the Russian redirect also load the graph", async function () {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto(base + "/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return document.getElementById("literature").dataset.ready === "true"; });
    await page.goto(base + "/Educational-Live-Demo/ru/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return document.getElementById("literature") && document.getElementById("literature").dataset.ready === "true"; });
    assert.strictEqual(await page.locator("html").getAttribute("data-lang"), "ru");
  });
  await test("browser console has no errors and previous demonstrations remain present", async function () {
    assert.strictEqual(errors.length, 0, errors.join("\n"));
    for (var id of ["s3", "p2", "p3", "concl"]) assert.strictEqual(await page.locator("#" + id).count(), 1);
  });

  await context.close();
  await browser.close(); browser = null;
  server.close();
  console.log(failures.length ? failures.length + " browser checks failed" : "all browser literature checks passed");
  process.exit(failures.length ? 1 : 0);
})().catch(async function (error) {
  console.error(error.stack);
  if (browser) await browser.close();
  server.close(); process.exit(1);
});
