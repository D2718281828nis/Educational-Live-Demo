#!/usr/bin/env python3
"""Validate and export the prepared dissertation literature graph.

Run from the repository root (all paths are relative to it):
  python3 scripts/export_literature_graph.py \
    --source ../disser-text/bibliography/dissertation_citation_graph.json \
    --bibtex ../disser-text/bibliography/DoctorDisser.bib

The script uses only the Python standard library and performs no network access.
"""

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

SOURCE_COUNT = 227
EDGE_TYPES = {"cites", "decomposes_into", "thematically_supports"}
REFERENCE_KEYS = {
    "citation", "doi", "evidence_source", "openalex_id", "pmid",
    "title", "type", "url", "year",
}


class SchemaError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise SchemaError(message)


def normalized(value):
    value = unicodedata.normalize("NFKD", str(value or "")).casefold()
    return " ".join("".join(c for c in value if not unicodedata.combining(c)).split())


def doi_key(value):
    value = normalized(value)
    return re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", "", value).rstrip(".")


def read_json(path):
    try:
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise SchemaError(f"Cannot read {path}: {exc}") from exc


def validate_bibtex(path, sources):
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise SchemaError(f"Cannot read BibTeX {path}: {exc}") from exc
    keys = set(re.findall(r"@\w+\s*\{\s*([^,\s]+)", text))
    missing = [node["id"] for node in sources if node.get("bibtex_key") not in keys]
    require(not missing, f"BibTeX keys missing for: {', '.join(missing[:8])}")


def export(source_path, bibtex_path, output_dir):
    raw = read_json(source_path)
    require(isinstance(raw, dict), "Root must be an object")
    require(isinstance(raw.get("nodes"), list), "nodes must be a list")
    require(isinstance(raw.get("edges"), list), "edges must be a list")

    nodes = raw["nodes"]
    edges = raw["edges"]
    require(all(isinstance(node, dict) for node in nodes), "Every node must be an object")
    ids = [node.get("id") for node in nodes]
    require(all(isinstance(node_id, str) and node_id for node_id in ids), "Every node needs a non-empty id")
    require(len(ids) == len(set(ids)), "Node id values must be unique")
    by_id = {node["id"]: node for node in nodes}
    sources = [node for node in nodes if node.get("type") == "bibliography_source"]
    require(len(sources) == SOURCE_COUNT, f"Expected {SOURCE_COUNT} sources, found {len(sources)}")
    require({"PROBLEM", "P1", "P2", "P3"}.issubset(by_id), "Missing problem or position nodes")

    zotero_keys = [node.get("zotero_key") for node in sources]
    require(all(isinstance(key, str) and key for key in zotero_keys), "Every source needs a zotero_key")
    require(len(zotero_keys) == len(set(zotero_keys)), "zotero_key values must be unique")
    if bibtex_path:
        validate_bibtex(bibtex_path, sources)

    outgoing = {node["id"]: set() for node in sources}
    incoming = {node["id"]: set() for node in sources}
    hierarchy = {node["id"]: set() for node in sources}
    edge_counts = Counter()
    for index, edge in enumerate(edges):
        require(isinstance(edge, dict), f"Edge {index} must be an object")
        source, target, kind = edge.get("source"), edge.get("target"), edge.get("type")
        require(source in by_id and target in by_id, f"Edge {index} has a missing endpoint")
        require(kind in EDGE_TYPES, f"Edge {index} has invalid type {kind!r}")
        edge_counts[kind] += 1
        if kind == "cites":
            require(source in outgoing and target in outgoing, f"Citation edge {index} must join two sources")
            require(source != target, f"Citation edge {index} is a self-citation")
            outgoing[source].add(target)
            incoming[target].add(source)
        elif kind == "thematically_supports":
            require(source in {"P1", "P2", "P3"} and target in hierarchy,
                    f"Thematic edge {index} must join a position to a source")
            hierarchy[target].add(source)

    require(edge_counts["decomposes_into"] == 3, "Expected three decomposes_into edges")
    require(edge_counts["thematically_supports"] == SOURCE_COUNT,
            "Expected exactly one thematic edge per source")
    require(len({(e.get("source"), e.get("target")) for e in edges if e.get("type") == "cites"}) ==
            edge_counts["cites"], "Duplicate citation edges")

    for node in sources:
        node_id = node["id"]
        declared_out = node.get("internal_reference_ids")
        declared_in = node.get("cited_by_internal_ids")
        require(isinstance(declared_out, list) and isinstance(declared_in, list),
                f"{node_id}: internal citation lists must be lists")
        require(set(declared_out) == outgoing[node_id],
                f"{node_id}: internal_reference_ids do not match outgoing cites edges")
        require(set(declared_in) == incoming[node_id],
                f"{node_id}: cited_by_internal_ids do not match incoming cites edges")
        require(set(node.get("positions", [])) == hierarchy[node_id],
                f"{node_id}: positions do not match thematic edges")
        require(len(hierarchy[node_id]) == 1, f"{node_id}: expected exactly one position")
        require(isinstance(node.get("title"), str) and node["title"].strip(),
                f"{node_id}: title is required")
        require(isinstance(node.get("authors"), list), f"{node_id}: authors must be a list")
        require(isinstance(node.get("references"), list), f"{node_id}: references must be a list")
        require(isinstance(node.get("missing_fields"), list), f"{node_id}: missing_fields must be a list")
        year = node.get("year")
        require(year is None or isinstance(year, int), f"{node_id}: year must be an integer or null")

    doi_index = {doi_key(n.get("doi")): n["id"] for n in sources if n.get("doi")}
    openalex_index = {normalized(n.get("openalex_id")): n["id"] for n in sources if n.get("openalex_id")}
    pmid_index = {str(n.get("pmid")): n["id"] for n in sources if n.get("pmid")}
    graph_nodes = []
    details = {}
    for node in nodes:
        node_id = node["id"]
        if node.get("type") != "bibliography_source":
            graph_nodes.append({"id": node_id, "type": node.get("type"), "title": node.get("title", "")})
            continue
        year = node.get("year")
        abstract = node.get("abstract") or ""
        authors = [str(author) for author in node["authors"]]
        search_parts = [node["title"], " ".join(authors), node.get("doi") or "", str(year or "")]
        exported = {
            "id": node_id,
            "zotero_key": node["zotero_key"],
            "bibtex_key": node.get("bibtex_key"),
            "type": node["type"],
            "entry_type": node.get("entry_type") or "misc",
            "title": node["title"],
            "authors": authors,
            "year": year,
            "doi": node.get("doi") or "",
            "url": node.get("url") or "",
            "openalex_id": node.get("openalex_id") or "",
            "pmid": node.get("pmid"),
            "abstract_source": node.get("abstract_source"),
            "missing_fields": list(node["missing_fields"]),
            "positions": sorted(hierarchy[node_id]),
            "search_text": normalized(" ".join(search_parts)),
            "internal_incoming_count": len(incoming[node_id]),
            "internal_outgoing_count": len(outgoing[node_id]),
            "internal_reference_ids": sorted(outgoing[node_id]),
            "cited_by_internal_ids": sorted(incoming[node_id]),
            "has_abstract": bool(abstract.strip()),
        }
        graph_nodes.append(exported)

        references = []
        represented = set()
        for reference in node["references"]:
            require(isinstance(reference, dict), f"{node_id}: every reference must be an object")
            item = {key: reference.get(key) for key in REFERENCE_KEYS if key in reference}
            internal_id = (doi_index.get(doi_key(item.get("doi"))) if item.get("doi") else None)
            internal_id = internal_id or (openalex_index.get(normalized(item.get("openalex_id")))
                                          if item.get("openalex_id") else None)
            internal_id = internal_id or (pmid_index.get(str(item.get("pmid"))) if item.get("pmid") else None)
            if internal_id in outgoing[node_id]:
                item["internal_id"] = internal_id
                represented.add(internal_id)
            references.append(item)
        for internal_id in sorted(outgoing[node_id] - represented):
            target = by_id[internal_id]
            references.insert(0, {
                "internal_id": internal_id, "title": target["title"], "year": target.get("year"),
                "doi": target.get("doi") or "", "url": target.get("url") or "",
                "evidence_source": "Internal citation metadata",
            })
        details[node_id] = {
            "abstract": abstract,
            "abstract_source": node.get("abstract_source"),
            "references": references,
        }

    graph_edges = []
    for edge in edges:
        item = {key: edge[key] for key in ("source", "target", "type")}
        if edge.get("assignment_method"):
            item["assignment_method"] = edge["assignment_method"]
        if edge.get("evidence_source"):
            item["evidence_source"] = edge["evidence_source"]
        graph_edges.append(item)

    counts = {
        "nodes": len(graph_nodes),
        "sources": len(sources),
        "edges": len(graph_edges),
        "internal_citations": edge_counts["cites"],
        "hierarchy_edges": edge_counts["decomposes_into"] + edge_counts["thematically_supports"],
        "outgoing_references": sum(len(item["references"]) for item in details.values()),
        "with_abstract": sum(node["has_abstract"] for node in graph_nodes if node["type"] == "bibliography_source"),
    }
    meta = dict(raw.get("meta", {}))
    meta["counts"] = counts
    graph = {"schema_version": 1, "meta": meta, "nodes": graph_nodes, "edges": graph_edges}
    detail_document = {"schema_version": 1, "details": details}

    output_dir.mkdir(parents=True, exist_ok=True)
    for name, document in (("literature-graph.json", graph), ("literature-details.json", detail_document)):
        destination = output_dir / name
        temporary = destination.with_suffix(".json.tmp")
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(document, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
        temporary.replace(destination)
    return counts


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path,
                        default=root.parent / "disser-text/bibliography/dissertation_citation_graph.json")
    parser.add_argument("--bibtex", type=Path,
                        default=root.parent / "disser-text/bibliography/DoctorDisser.bib")
    parser.add_argument("--output-dir", type=Path, default=root / "data")
    args = parser.parse_args()
    try:
        counts = export(args.source.resolve(), args.bibtex.resolve(), args.output_dir.resolve())
    except SchemaError as exc:
        print(f"Literature graph export failed: {exc}", file=sys.stderr)
        return 1
    print("Exported " + ", ".join(f"{key}={value}" for key, value in counts.items()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
