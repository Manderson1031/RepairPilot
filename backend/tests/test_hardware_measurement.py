import pytest

from app.hardware_measurement import (
    calibration_from_reference,
    measurement_payload,
    thread_pitch_mm_from_spacing,
    tpi_from_pitch_mm,
)


def test_reference_calibration_converts_pixels_to_real_dimensions():
    calibration = calibration_from_reference(25.4, 254.0, source="1-inch reference")
    result = measurement_payload(
        calibration=calibration,
        diameter_pixels=80,
        length_pixels=250,
        width_pixels=100,
        height_pixels=50,
    )
    assert result["diameter_mm"] == 8.0
    assert result["length_mm"] == 25.0
    assert result["width_mm"] == 10.0
    assert result["height_mm"] == 5.0


def test_missing_calibration_never_returns_dimensions():
    result = measurement_payload(
        calibration=None,
        diameter_pixels=80,
        length_pixels=250,
        thread_spacings_pixels=[12, 12, 12, 12],
    )
    assert all(value is None for value in result.values())


def test_thread_pitch_uses_multiple_spacings_and_rejects_outlier_bias():
    calibration = calibration_from_reference(10.0, 100.0)
    pitch = thread_pitch_mm_from_spacing([12, 12, 12.2, 11.8, 40], calibration)
    assert pitch == pytest.approx(1.2)
    assert tpi_from_pitch_mm(pitch) == pytest.approx(21.166666, rel=1e-5)


def test_thread_pitch_requires_repeated_edges():
    calibration = calibration_from_reference(10.0, 100.0)
    with pytest.raises(ValueError):
        thread_pitch_mm_from_spacing([12, 12], calibration)


def test_invalid_reference_is_rejected():
    with pytest.raises(ValueError):
        calibration_from_reference(0, 100)
    with pytest.raises(ValueError):
        calibration_from_reference(10, 0)
