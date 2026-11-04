// Language and theme switches, and the thumbnail of the Kuramoto lab card.

(function () {
  "use strict";

  var root = document.documentElement;
  var SVGNS = "http://www.w3.org/2000/svg";
  var TITLES = { en: "Interactive Labs · Graph-EVT", ru: "Интерактивные лаборатории · Graph-EVT" };

  function lang() { return root.getAttribute("data-lang") === "ru" ? "ru" : "en"; }
  function store(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }

  // ------------------------------------------------------------ language
  var listeners = [];
  function setLang(next, save) {
    root.setAttribute("data-lang", next);
    root.setAttribute("lang", next);
    document.title = TITLES[next];
    document.querySelectorAll("[data-set-lang]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-set-lang") === next));
    });
    if (save) {
      store("eld-lang", next);
      try {
        var url = new URL(location.href);
        if (url.searchParams.has("lang")) { url.searchParams.set("lang", next); history.replaceState(null, "", url); }
      } catch (e) {}
    }
    listeners.forEach(function (fn) { fn(); });
    document.dispatchEvent(new CustomEvent("eld:lang", { detail: next }));
  }
  document.querySelectorAll("[data-set-lang]").forEach(function (b) {
    b.addEventListener("click", function () { setLang(b.getAttribute("data-set-lang"), true); });
  });

  // ------------------------------------------------------------ theme
  var themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var current = root.getAttribute("data-theme");
      if (current !== "light" && current !== "dark") {
        current = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      var next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      store("eld-theme", next);
    });
  }

  function el(name, attrs, parent) {
    var node = document.createElementNS(SVGNS, name);
    for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  // ------------------------------------------------------------ thumbnail of the Kuramoto card
  var kura = document.getElementById("kura-dots");
  if (kura) {
    for (var i = 0; i < 12; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 6;
      el("circle", {
        cx: (150 + 40 * Math.cos(a)).toFixed(1), cy: (58 + 40 * Math.sin(a)).toFixed(1), r: i === 0 ? 7 : 5.5,
        style: i === 0 ? "fill:var(--series-2)" : "fill:var(--series-1);fill-opacity:" + (1 - 0.12 * Math.min(i, 12 - i))
      }, kura);
    }
  }

  // ------------------------------------------------------------ published build (version.json is written by pages.yml)
  var build = document.getElementById("build-version");
  if (build && window.fetch) {
    fetch("version.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
      if (!v || !v.commit) return;
      var a = document.createElement("a");
      a.href = "https://github.com/D2718281828nis/Educational-Live-Demo/commit/" + v.commit;
      a.textContent = (v.branch || "main") + " @ " + String(v.commit).slice(0, 7);
      if (v.built) a.title = v.built;
      build.append(" · build ", a);
      build.hidden = false;
    }).catch(function () {});
  }

  setLang(lang(), false);
})();
