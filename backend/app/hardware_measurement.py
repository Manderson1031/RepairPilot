from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Iterable


@dataclass(frozen=True)
class ScaleCalibration:
    """A 2D scale derived from a known reference in the same image plane.

    The caller must only construct this from a trustworthy reference whose real
    size is known. Perspective-heavy scenes should be rejected before using a
    single global scale.
    """

    mm_per_pixel: float
    source: str = "reference"

    def __post_init__(self) -> None:
        if not isfinite(self.mm_per_pixel) or self.mm_per_pixel <= 0:
            raise ValueError("mm_per_pixel must be a positive finite number")


def calibration_from_reference(reference_mm: float, reference_pixels: float, source: str = "reference") -> ScaleCalibration:
    if not isfinite(reference_mm) or reference_mm <= 0:
        raise ValueError("reference_mm must be a positive finite number")
    if not isfinite(reference_pixels) or reference_pixels <= 0:
        raise ValueError("reference_pixels must be a positive finite number")
    return ScaleCalibration(reference_mm / reference_pixels, source=source)


def pixels_to_mm(pixels: float, calibration: ScaleCalibration) -> float:
    if not isfinite(pixels) or pixels < 0:
        raise ValueError("pixels must be a non-negative finite number")
    return pixels * calibration.mm_per_pixel


def thread_pitch_mm_from_spacing(spacings_pixels: Iterable[float], calibration: ScaleCalibration) -> float:
    """Return robust thread pitch from repeated crest-to-crest pixel spacings.

    At least three spacings are required. The median is used so a single bad
    edge detection does not dominate the result.
    """
    values = sorted(float(x) for x in spacings_pixels if isfinite(float(x)) and float(x) > 0)
    if len(values) < 3:
        raise ValueError("at least three valid thread spacings are required")
    n = len(values)
    median = values[n // 2] if n % 2 else (values[n // 2 - 1] + values[n // 2]) / 2
    return pixels_to_mm(median, calibration)


def tpi_from_pitch_mm(pitch_mm: float) -> float:
    if not isfinite(pitch_mm) or pitch_mm <= 0:
        raise ValueError("pitch_mm must be a positive finite number")
    return 25.4 / pitch_mm


def measurement_payload(
    *,
    calibration: ScaleCalibration | None,
    diameter_pixels: float | None = None,
    length_pixels: float | None = None,
    width_pixels: float | None = None,
    height_pixels: float | None = None,
    thread_spacings_pixels: Iterable[float] | None = None,
) -> dict:
    """Build scanner measurements without fabricating unsupported dimensions."""
    out = {
        "diameter_mm": None,
        "length_mm": None,
        "thread_pitch_mm": None,
        "threads_per_inch": None,
        "width_mm": None,
        "height_mm": None,
    }
    if calibration is None:
        return out

    if diameter_pixels is not None:
        out["diameter_mm"] = round(pixels_to_mm(diameter_pixels, calibration), 3)
    if length_pixels is not None:
        out["length_mm"] = round(pixels_to_mm(length_pixels, calibration), 3)
    if width_pixels is not None:
        out["width_mm"] = round(pixels_to_mm(width_pixels, calibration), 3)
    if height_pixels is not None:
        out["height_mm"] = round(pixels_to_mm(height_pixels, calibration), 3)
    if thread_spacings_pixels is not None:
        pitch = thread_pitch_mm_from_spacing(thread_spacings_pixels, calibration)
        out["thread_pitch_mm"] = round(pitch, 3)
        out["threads_per_inch"] = round(tpi_from_pitch_mm(pitch), 2)
    return out
