from __future__ import annotations

from math import isfinite
from typing import Any

MEASUREMENT_KEYS = (
    "diameter_mm",
    "length_mm",
    "thread_pitch_mm",
    "threads_per_inch",
    "width_mm",
    "height_mm",
)


def _finite_positive(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not isfinite(number) or number <= 0:
        return None
    return number


def sanitize_depth_measurements(payload: dict[str, Any] | None) -> dict[str, float | None]:
    """Accept only positive finite dimensional values from a trusted depth module."""
    payload = payload or {}
    out: dict[str, float | None] = {key: None for key in MEASUREMENT_KEYS}
    for key in MEASUREMENT_KEYS:
        if key == "threads_per_inch":
            continue
        out[key] = _finite_positive(payload.get(key))

    pitch = out.get("thread_pitch_mm")
    if pitch:
        out["threads_per_inch"] = round(25.4 / pitch, 2)
    return out


def fuse_scan_with_depth(
    scan: dict[str, Any],
    depth_measurements: dict[str, Any] | None,
    *,
    depth_confidence: float,
    minimum_confidence: float = 0.75,
    source: str = "arkit_lidar",
) -> dict[str, Any]:
    """Merge trusted ARKit/LiDAR geometry into an AI hardware identification.

    LiDAR is allowed to supply gross physical dimensions only when the native
    module reports adequate confidence. Thread pitch should normally come from
    close-up vision; it is accepted here only if a native measurement pipeline
    explicitly supplies it with the same confidence gate.
    """
    result = dict(scan)
    existing = dict(result.get("measurements") or {})
    for key in MEASUREMENT_KEYS:
        existing.setdefault(key, None)

    try:
        confidence = float(depth_confidence)
    except (TypeError, ValueError):
        confidence = 0.0

    warnings = list(result.get("warnings") or [])
    if not isfinite(confidence) or confidence < minimum_confidence:
        warnings.append("LiDAR/depth measurement confidence was too low; dimensions were not applied.")
        result["measurements"] = existing
        result["warnings"] = warnings
        result["depth_measurement"] = {
            "applied": False,
            "source": source,
            "confidence": max(0.0, confidence if isfinite(confidence) else 0.0),
        }
        return result

    sanitized = sanitize_depth_measurements(depth_measurements)
    applied = []
    for key, value in sanitized.items():
        if value is not None:
            existing[key] = round(value, 3) if key != "threads_per_inch" else value
            applied.append(key)

    result["measurements"] = existing
    if applied:
        result["needs_reference_scale"] = False
    else:
        warnings.append("LiDAR/depth capture contained no usable physical dimensions.")

    result["warnings"] = warnings
    result["depth_measurement"] = {
        "applied": bool(applied),
        "source": source,
        "confidence": confidence,
        "fields": applied,
    }
    return result
