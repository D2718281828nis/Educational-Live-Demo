"""Data and Python reference for section 4 (Position 2): the chains-and-circles example of § 4.8.

Usage: ML_GRAPHS=/path/to/ML-MachineLearning-Graphs python tests/make_p2_reference.py

Reads the four CSV files of ML-MachineLearning-Graphs/datasets (commit 4518ddc, the one cited in the dissertation) and writes
  data/p2_datasets.json            points (pixel coordinates) and colours, the input of the page;
  tests/fixtures/p2_reference.json  for every dataset and k = 1..8: components, h(A), h1(A) and the F1 of
                                    component size, empty graph, local k-th distance and K-step smoothing (eq:smooth).

The k-NN graph is computed by brute force with ties broken by (distance, index), exactly as js/p2-core.js does; the
script also checks that sklearn's kneighbors_graph gives the same component counts and F1 on the default k = 2.
F1 is the expected F1 when the n_red highest scores are flagged and ties are broken at random. With n_flag = n_red,
P = R = TP / n_red, so F1 = TP / n_red is linear in TP and the expectation over ties is exact (the notebook breaks ties
with a fixed jitter instead; the values agree wherever there are no ties at the cut).
"""
import json
import math
import os
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(os.environ.get("ML_GRAPHS", ROOT.parent / "ML-MachineLearning-Graphs")) / "datasets"
FILES = {
    "original": "df_red_green_overlay.csv",
    "ring": "df_red_green_distinct.csv",
    "chains": "df_red_green_chains.csv",
    "circles": "df_red_green_circles.csv",
}
KS = list(range(1, 9))
SMOOTH_K = 3
LEAK = 1e6  # label proxy as a third coordinate: edges never cross colours (violates eq:noleak)


def load(name):
    rows = (SRC / FILES[name]).read_text().strip().splitlines()[1:]
    xs, ys, red = [], [], []
    for r in rows:
        x, y, colour, _type = r.split(",")
        xs.append(int(float(x))); ys.append(int(float(y))); red.append(1 if colour == "red" else 0)
    return xs, ys, red


def knn_lists(xs, ys, k, label=None):
    """k nearest neighbours of every point, ties by (squared distance, index); optional leaky third coordinate."""
    n = len(xs)
    X = np.array(xs, float); Y = np.array(ys, float)
    out, kth = [], []
    for i in range(n):
        d2 = (X - X[i]) ** 2 + (Y - Y[i]) ** 2
        if label is not None:
            d2 = d2 + (LEAK * (np.array(label) - label[i])) ** 2
        d2[i] = np.inf
        order = np.lexsort((np.arange(n), d2))[:k]
        out.append(sorted(int(j) for j in order))
        kth.append(math.sqrt(d2[order[-1]]) if label is None else math.sqrt(((X[order[-1]] - X[i]) ** 2 + (Y[order[-1]] - Y[i]) ** 2)))
    return out, kth


def sym_adj(nb):
    n = len(nb)
    adj = [set() for _ in range(n)]
    for i, js in enumerate(nb):
        for j in js:
            adj[i].add(j); adj[j].add(i)
    return [sorted(a) for a in adj]


def components(adj):
    n = len(adj); lab = [-1] * n; c = 0
    for s in range(n):
        if lab[s] >= 0:
            continue
        stack = [s]; lab[s] = c
        while stack:
            u = stack.pop()
            for v in adj[u]:
                if lab[v] < 0:
                    lab[v] = c; stack.append(v)
        c += 1
    size = [0] * c
    for l in lab:
        size[l] += 1
    return c, lab, [size[l] for l in lab]


def homophily(adj, red):
    same = tot = rr = r_all = 0
    for i, js in enumerate(adj):
        for j in js:
            tot += 1; same += red[i] == red[j]
            if red[i]:
                r_all += 1; rr += red[j]
    return same / tot if tot else float("nan"), rr / r_all if r_all else float("nan")


def smooth(adj, s0, K):
    """s^(K) = Â^K s0 with Â = D̃^-1/2 (A + I) D̃^-1/2; same summation order as js/p2-core.js (self first, then sorted neighbours)."""
    deg = [len(a) + 1 for a in adj]
    s = list(s0)
    for _ in range(K):
        nxt = []
        for i, js in enumerate(adj):
            acc = s[i] / deg[i]
            for j in js:
                acc += s[j] / math.sqrt(deg[i] * deg[j])
            nxt.append(acc)
        s = nxt
    return s


def expected_f1(red, score):
    n_red = sum(red)
    order = sorted(range(len(score)), key=lambda i: -score[i])
    tp = 0.0; taken = 0; i = 0
    while taken < n_red:
        j = i
        while j < len(order) and score[order[j]] == score[order[i]]:
            j += 1
        blk = j - i; reds = sum(red[order[t]] for t in range(i, j)); need = min(blk, n_red - taken)
        tp += reds * need / blk; taken += need; i = j
    return tp / n_red


def summary(xs, ys, red, k, leak=False):
    nb, kth = knn_lists(xs, ys, k, red if leak else None)
    adj = sym_adj(nb)
    n_comp, _lab, size = components(adj)
    h, h1 = homophily(adj, red)
    return {
        "k": k, "leak": leak, "components": n_comp, "edges": sum(len(a) for a in adj) // 2,
        "h": h, "h1": h1,
        "f1_component": expected_f1(red, size),
        "f1_empty": expected_f1(red, [1] * len(red)),
        "f1_local_dk": expected_f1(red, kth),
        "f1_smooth": expected_f1(red, smooth(adj, kth, SMOOTH_K)),
    }


def sklearn_check(xs, ys, red, k=2):
    from scipy.sparse.csgraph import connected_components
    from sklearn.neighbors import kneighbors_graph
    X = np.c_[xs, ys].astype(float)
    A = kneighbors_graph(X, k, mode="connectivity", include_self=False)
    A = ((A + A.T) > 0).astype(float)
    n_comp, lab = connected_components(A, directed=False)
    size = np.bincount(lab)[lab].tolist()
    return n_comp, expected_f1(red, size)


def main():
    data, ref = {}, {"source": "ML-MachineLearning-Graphs/datasets @ 4518ddc", "smooth_K": SMOOTH_K, "datasets": {}}
    for name in FILES:
        xs, ys, red = load(name)
        data[name] = {"x": xs, "y": ys, "red": red}
        rows = [summary(xs, ys, red, k) for k in KS] + [summary(xs, ys, red, 2, leak=True)]
        ref["datasets"][name] = {"n": len(red), "n_red": sum(red), "rows": rows}
        try:
            n_comp, f1 = sklearn_check(xs, ys, red)
            mine = rows[1]
            agree = n_comp == mine["components"] and abs(f1 - mine["f1_component"]) < 1e-12
            print(f"{name:9s} k=2 components {mine['components']:4d}  F1 {mine['f1_component']:.3f}  sklearn {'agrees' if agree else f'DIFFERS ({n_comp}, {f1:.3f})'}")
        except ImportError:
            print(f"{name:9s} sklearn not installed: skipped the cross-check")
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "p2_datasets.json").write_text(json.dumps({"source": ref["source"], "datasets": data}, separators=(",", ":")))
    (ROOT / "tests" / "fixtures" / "p2_reference.json").write_text(json.dumps(ref, indent=1))
    print("wrote data/p2_datasets.json and tests/fixtures/p2_reference.json")


if __name__ == "__main__":
    sys.exit(main())
