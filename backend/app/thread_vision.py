from __future__ import annotations

from math import isfinite
from statistics import median
from typing import Any


def _positive(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if isfinite(number) and number > 0 else None


def measure_thread_pitch_from_crests(
    crest_positions_px: list[Any] | None,
    *,
    mm_per_pixel: Any,
    minimum_intervals: int = 4,
    max_relative_spread: float = 0.18,
) -> dict[str, Any]:
    """Measure thread pitch from calibrated close-up RGB crest positions.

    The caller must supply a trustworthy pixel-to-mm calibration from the same
    image plane. Multiple adjacent crest intervals are required so a single
    edge/lighting artifact cannot become an exact thread designation.
    """
    scale = _positive(mm_per_pixel)
    if scale is None:
        return {"applied": False, "confidence": 0.0, "reason": "A trusted same-plane calibration is required."}

    values: list[float] = []
    for raw in crest_positions_px or []:
        value = _positive(raw)
        if value is not None:
            values.append(value)
    values = sorted(set(values))
    if len(values) < minimum_intervals + 1:
        return {"applied": False, "confidence": 0.0, "reason": f"At least {minimum_intervals + 1} thread crests are required."}

    intervals = [b - a for a, b in zip(values, values[1:]) if b > a]
    if len(intervals) < minimum_intervals:
        return {"applied": False, "confidence": 0.0, "reason": "Not enough valid adjacent thread intervals were detected."}

    center = median(intervals)
    deviations = [abs(x - center) / center for x in intervals]
    spread = median(deviations)
    if spread > max_relative_spread:
        return {"applied": False, "confidence": max(0.0, 1.0 - spread), "reason": "Thread crest spacing was not consistent enough for exact pitch."}

    pitch_mm = center * scale
    if not isfinite(pitch_mm) or pitch_mm <= 0:
        return {"applied": False, "confidence": 0.0, "reason": "Calibrated thread pitch was invalid."}

    confidence = max(0.0, min(1.0, 1.0 - spread * 2.5))
    return {
        "applied": True,
        "thread_pitch_mm": round(pitch_mm, 4),
        "threads_per_inch": round(25.4 / pitch_mm, 2),
        "confidence": round(confidence, 3),
        "interval_count": len(intervals),
        "median_interval_px": round(center, 3),
        "relative_spread": round(spread, 4),
        "source": "closeup_rgb_calibrated",
    }


def fuse_thread_measurement(scan: dict[str, Any], thread: dict[str, Any] | None, *, minimum_confidence: float = 0.75) -> dict[str, Any]:
    result = dict(scan)
    thread = thread or {}
    measurements = dict(result.get("measurements") or {})
    warnings = list(result.get("warnings") or [])
    confidence = _positive(thread.get("confidence")) or 0.0

    if not thread.get("applied") or confidence < minimum_confidence:
        warnings.append("Close-up thread measurement was not confident enough to apply exact pitch/TPI.")
        result["warnings"] = warnings
        result["thread_measurement"] = {"applied": False, "confidence": confidence, "source": thread.get("source", "closeup_rgb_calibrated")}
        return result

    pitch = _positive(thread.get("thread_pitch_mm"))
    tpi = _positive(thread.get("threads_per_inch"))
    if pitch is None:
        warnings.append("Close-up thread measurement did not contain a usable pitch.")
        result["warnings"] = warnings
        result["thread_measurement"] = {"applied": False, "confidence": confidence, "source": thread.get("source", "closeup_rgb_calibrated")}
        return result

    measurements["thread_pitch_mm"] = round(pitch, 4)
    measurements["threads_per_inch"] = round(tpi if tpi else 25.4 / pitch, 2)
    result["measurements"] = measurements
    result["thread_measurement"] = {
        "applied": True,
        "confidence": confidence,
        "source": thread.get("source", "closeup_rgb_calibrated"),
        "interval_count": thread.get("interval_count"),
    }
    return result
