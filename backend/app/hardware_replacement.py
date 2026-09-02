from __future__ import annotations

from math import isfinite
from typing import Any


def _positive(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if isfinite(number) and number > 0 else None


def replacement_plan(scan: dict[str, Any]) -> dict[str, Any]:
    """Build a conservative replacement-search plan from trusted scan evidence.

    This function does not invent an exact replacement. It reports whether the
    collected evidence is strong enough for an exact-size search and which
    missing measurements still block that search.
    """
    kind = str(scan.get("kind") or "OTHER").upper()
    measurements = scan.get("measurements") or {}
    candidates = [x for x in (scan.get("candidate_matches") or []) if isinstance(x, dict)]
    markings = [str(x).strip() for x in (scan.get("markings") or []) if str(x).strip()]

    diameter = _positive(measurements.get("diameter_mm"))
    length = _positive(measurements.get("length_mm"))
    pitch = _positive(measurements.get("thread_pitch_mm"))
    tpi = _positive(measurements.get("threads_per_inch"))
    width = _positive(measurements.get("width_mm"))
    height = _positive(measurements.get("height_mm"))

    thread_confirmed = bool((scan.get("size_resolution") or {}).get("thread_confirmed"))
    exact_candidates = [x for x in candidates if bool(x.get("thread_confirmed"))]
    preferred = exact_candidates[0] if exact_candidates else (candidates[0] if candidates else None)

    missing: list[str] = []
    readiness = "identify_only"

    if kind == "FASTENER":
        if diameter is None:
            missing.append("diameter")
        if not thread_confirmed and pitch is None and tpi is None:
            missing.append("thread_pitch_or_tpi")
        if length is None:
            missing.append("length")
        if diameter and (thread_confirmed or pitch or tpi):
            readiness = "size_resolved" if length else "size_resolved_length_missing"
        elif diameter:
            readiness = "nominal_diameter_only"
    elif kind == "BEARING":
        if diameter is None:
            missing.append("outside_or_inside_diameter")
        if width is None:
            missing.append("width")
        readiness = "dimensions_ready" if diameter and width else "partial_dimensions"
    elif kind == "FITTING":
        if diameter is None:
            missing.append("outside_diameter")
        if not markings:
            missing.append("thread_or_fitting_markings")
        readiness = "dimensions_ready" if diameter and markings else "partial_dimensions"
    else:
        missing.append("verified_part_family")

    query_parts: list[str] = []
    if preferred and preferred.get("name"):
        query_parts.append(str(preferred["name"]).strip())
    elif scan.get("identified_part"):
        query_parts.append(str(scan["identified_part"]).strip())

    if kind == "FASTENER" and length and query_parts and "length" not in query_parts[0].lower():
        query_parts.append(f"{length:g} mm length")
    if markings:
        query_parts.extend(markings[:3])

    # Exact-buy readiness is deliberately stricter than having a useful search query.
    exact_ready = bool(kind == "FASTENER" and diameter and length and thread_confirmed and exact_candidates)
    search_ready = bool(query_parts) and readiness not in {"identify_only"}

    confidence = 0.0
    if scan.get("identified_part"):
        confidence += 0.2
    if diameter:
        confidence += 0.25
    if length or width or height:
        confidence += 0.15
    if thread_confirmed:
        confidence += 0.3
    if markings:
        confidence += 0.1
    confidence = min(1.0, confidence)

    return {
        "kind": kind,
        "readiness": readiness,
        "search_ready": search_ready,
        "exact_replacement_ready": exact_ready,
        "confidence": round(confidence, 2),
        "preferred_candidate": preferred,
        "search_query": " ".join(query_parts).strip() if search_ready else "",
        "missing_evidence": missing,
        "evidence": {
            "diameter_mm": diameter,
            "length_mm": length,
            "width_mm": width,
            "height_mm": height,
            "thread_pitch_mm": pitch,
            "threads_per_inch": tpi,
            "thread_confirmed": thread_confirmed,
            "markings": markings,
        },
        "warning": None if exact_ready else "Replacement matching is a search aid until all critical dimensions and thread details are verified.",
    }
