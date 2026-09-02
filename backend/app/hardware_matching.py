from __future__ import annotations

from math import isfinite
from typing import Any

METRIC_DIAMETERS_MM = (2, 2.5, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 27, 30)
SAE_DIAMETERS_IN = (0.125, 0.138, 0.164, 0.190, 0.25, 0.3125, 0.375, 0.4375, 0.5, 0.5625, 0.625, 0.75, 0.875, 1.0)

METRIC_COARSE_PITCH = {
    2: 0.4, 2.5: 0.45, 3: 0.5, 4: 0.7, 5: 0.8, 6: 1.0, 8: 1.25,
    10: 1.5, 12: 1.75, 14: 2.0, 16: 2.0, 18: 2.5, 20: 2.5, 22: 2.5,
    24: 3.0, 27: 3.0, 30: 3.5,
}

SAE_COMMON_TPI = {
    0.125: (40,), 0.138: (32,), 0.164: (32,), 0.190: (24, 32),
    0.25: (20, 28), 0.3125: (18, 24), 0.375: (16, 24), 0.4375: (14, 20),
    0.5: (13, 20), 0.5625: (12, 18), 0.625: (11, 18), 0.75: (10, 16),
    0.875: (9, 14), 1.0: (8, 12),
}


def _number(value: Any) -> float | None:
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return value if isfinite(value) and value > 0 else None


def _nearest(value: float, choices: tuple[float, ...]) -> tuple[float, float]:
    match = min(choices, key=lambda x: abs(x - value))
    return match, abs(match - value)


def _fraction_label(inches: float) -> str:
    known = {
        0.125: '1/8', 0.138: '#6', 0.164: '#8', 0.190: '#10', 0.25: '1/4',
        0.3125: '5/16', 0.375: '3/8', 0.4375: '7/16', 0.5: '1/2',
        0.5625: '9/16', 0.625: '5/8', 0.75: '3/4', 0.875: '7/8', 1.0: '1',
    }
    return known.get(inches, f'{inches:g}')


def dimensional_candidates(scan: dict[str, Any]) -> list[dict[str, Any]]:
    """Return conservative size candidates supported by trusted measurements.

    Diameter can narrow nominal size, but exact thread designation is only emitted
    when pitch/TPI is also present and agrees with a common standard.
    """
    if str(scan.get('kind', '')).upper() != 'FASTENER':
        return []

    measurements = scan.get('measurements') or {}
    diameter = _number(measurements.get('diameter_mm'))
    if diameter is None:
        return []

    pitch = _number(measurements.get('thread_pitch_mm'))
    tpi = _number(measurements.get('threads_per_inch'))
    length = _number(measurements.get('length_mm'))
    out: list[dict[str, Any]] = []

    metric, metric_error = _nearest(diameter, METRIC_DIAMETERS_MM)
    metric_tolerance = max(0.18, metric * 0.035)
    if metric_error <= metric_tolerance:
        exact_thread = False
        designation = f'M{metric:g}'
        reason = f'Trusted diameter {diameter:.2f} mm is consistent with nominal M{metric:g}.'
        coarse = METRIC_COARSE_PITCH.get(metric)
        if pitch and coarse and abs(pitch - coarse) <= max(0.08, coarse * 0.08):
            designation = f'M{metric:g} × {coarse:g}'
            exact_thread = True
            reason += f' Measured {pitch:.3g} mm pitch agrees with the common {coarse:g} mm pitch.'
        if length:
            designation += f' × {round(length, 1):g} mm length'
        out.append({'name': designation, 'reason': reason, 'system': 'metric', 'thread_confirmed': exact_thread})

    diameter_in = diameter / 25.4
    sae, sae_error = _nearest(diameter_in, SAE_DIAMETERS_IN)
    sae_tolerance = max(0.009, sae * 0.035)
    if sae_error <= sae_tolerance:
        label = _fraction_label(sae)
        exact_thread = False
        designation = f'{label} in nominal diameter'
        reason = f'Trusted diameter {diameter:.2f} mm ({diameter_in:.3f} in) is consistent with {label} in hardware.'
        tpi_value = tpi or (25.4 / pitch if pitch else None)
        common = SAE_COMMON_TPI.get(sae, ())
        if tpi_value and common:
            nearest_tpi = min(common, key=lambda x: abs(x - tpi_value))
            if abs(nearest_tpi - tpi_value) <= 1.0:
                designation = f'{label}-{nearest_tpi}'
                exact_thread = True
                reason += f' Measured thread spacing agrees with {nearest_tpi} TPI.'
        if length:
            designation += f' × {length / 25.4:.3g} in length'
        out.append({'name': designation, 'reason': reason, 'system': 'inch', 'thread_confirmed': exact_thread})

    return out


def enrich_scan_with_dimensional_candidates(scan: dict[str, Any]) -> dict[str, Any]:
    result = dict(scan)
    dimensional = dimensional_candidates(result)
    if not dimensional:
        return result

    existing = list(result.get('candidate_matches') or [])
    names = {str(item.get('name', '')).lower() for item in existing if isinstance(item, dict)}
    for candidate in dimensional:
        if candidate['name'].lower() not in names:
            existing.insert(0, candidate)
    result['candidate_matches'] = existing[:8]
    result['size_resolution'] = {
        'candidate_count': len(dimensional),
        'thread_confirmed': any(bool(x.get('thread_confirmed')) for x in dimensional),
        'basis': 'trusted_dimensions',
    }
    return result
