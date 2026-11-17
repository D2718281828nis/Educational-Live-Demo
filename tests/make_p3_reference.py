"""Reference output of Graph-EVT-agent verify_numbers and parse_verdict for tests/p3_check.js.

Usage: GRAPH_EVT_AGENT=/path/to/Graph-EVT-agent python tests/make_p3_reference.py
Writes tests/fixtures/p3_reference.json: for every case the text, the evidence and what the Python functions return.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.environ.get("GRAPH_EVT_AGENT", str(Path(__file__).resolve().parents[2] / "Graph-EVT-agent")))
from graph_evt_agent.agents import parse_verdict, verify_numbers  # noqa: E402

EVIDENCE = {
    "detection": {"detected": True, "alarm_1d": 1032, "t_hat": 1016, "threshold": 4.2817},
    "ranking": {"node_ids": ["B", "A", "C"], "probabilities": [0.8312, 0.1201, 0.0487]},
    "graph": {"method": "granger", "functional_edges": 5, "nodes": ["A", "B", "C", "D", "E"]},
    "spec": {"q": 0.95, "gamma": 0.999, "r": 3},
    "note": "excess kurtosis 13,27 on the background",
}
TEXTS = [
    "Onset at sample 1016, 1-D alarm at 1032.",
    "Onset at sample 1023.",
    "Source B with P = 0.83.",
    "Source B with P = 0.84.",
    "Source B with P = 83.1 %.",
    "Source B with P = 83 %.",
    "Source B with P = 95.3 %.",
    "Threshold 4.28, exactly 4.2817, too precise 4.28170, wrong 4.2.",
    "Kurtosis 13.3 and 13,27 and 13.2.",
    "Top-3 candidates, step 2 of 5, r = 3, 11 nodes.",
    "Negative −0.05 and -0.95 and 0.95.",
    "Начало на отсчёте 1016, тревога — 1032; P = 0,83; узел5 и x1016.",
    "Scientific 1.016e3 and 1e3.",
    "Version v2.3.5 and 2.3.5 and 12.5.",
    "q = 0.90 would alarm earlier.",
]
VERDICTS = [
    'text {"event_detected": true, "source": "B"}',
    '```json\n{"event_detected": false, "source": null}\n```',
    'first {"event_detected": true} then {"event_detected": false, "source": "A"}',
    'broken {"event_detected": yes}',
    'no verdict here',
    '{"source": "B"}',
]


def main():
    out = {"evidence": EVIDENCE,
           "numbers": [{"text": t, "unverified": verify_numbers(t, EVIDENCE)} for t in TEXTS],
           "verdicts": [{"text": t, "verdict": parse_verdict(t)} for t in VERDICTS]}
    path = Path(__file__).resolve().parent / "fixtures" / "p3_reference.json"
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1))
    for c in out["numbers"]:
        print(f"{c['unverified']!s:28s} {c['text']}")
    print("wrote", path)


if __name__ == "__main__":
    sys.exit(main())
