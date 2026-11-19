// Builds js/p2-data.js from data/p2_datasets.json, so section 4.2 works without fetch (e.g. opened as file://).
// Run: node tests/build_p2_data.js         (writes js/p2-data.js)
//      node tests/build_p2_data.js --check (CI: fails if js/p2-data.js is out of date)
"use strict";
var fs = require("fs"), path = require("path");
var src = path.join(__dirname, "..", "data", "p2_datasets.json"), dst = path.join(__dirname, "..", "js", "p2-data.js");
var json = JSON.stringify(JSON.parse(fs.readFileSync(src, "utf8")));
var out = "// Generated from data/p2_datasets.json by tests/build_p2_data.js — do not edit by hand.\nwindow.ELD_P2_DATA = " + json + ";\n";
if (process.argv.indexOf("--check") >= 0) {
  var cur = fs.existsSync(dst) ? fs.readFileSync(dst, "utf8") : "";
  if (cur !== out) { console.log("FAIL js/p2-data.js is out of date: run node tests/build_p2_data.js"); process.exit(1); }
  console.log("js/p2-data.js matches data/p2_datasets.json");
} else { fs.writeFileSync(dst, out); console.log("wrote js/p2-data.js (" + out.length + " bytes)"); }
