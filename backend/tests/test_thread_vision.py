from app.hardware_matching import enrich_scan_with_dimensional_candidates
from app.thread_vision import fuse_thread_measurement, measure_thread_pitch_from_crests


def base_scan():
    return {
        "kind": "FASTENER",
        "measurements": {
            "diameter_mm": 8.02,
            "length_mm": 30.0,
            "thread_pitch_mm": None,
            "threads_per_inch": None,
            "width_mm": None,
            "height_mm": None,
        },
        "candidate_matches": [],
        "warnings": [],
    }


def test_calibrated_crests_measure_metric_pitch():
    measured = measure_thread_pitch_from_crests([10, 35, 60, 85, 110, 135], mm_per_pixel=0.05)
    assert measured["applied"] is True
    assert measured["thread_pitch_mm"] == 1.25
    assert measured["threads_per_inch"] == 20.32
    assert measured["confidence"] >= 0.75


def test_thread_measurement_requires_calibration():
    measured = measure_thread_pitch_from_crests([10, 35, 60, 85, 110], mm_per_pixel=None)
    assert measured["applied"] is False
    assert measured["confidence"] == 0.0


def test_thread_measurement_rejects_inconsistent_crests():
    measured = measure_thread_pitch_from_crests([10, 20, 55, 62, 120, 126], mm_per_pixel=0.05)
    assert measured["applied"] is False


def test_trusted_thread_pitch_confirms_size_candidate():
    scan = base_scan()
    measured = measure_thread_pitch_from_crests([10, 35, 60, 85, 110, 135], mm_per_pixel=0.05)
    fused = fuse_thread_measurement(scan, measured)
    resolved = enrich_scan_with_dimensional_candidates(fused)
    assert fused["measurements"]["thread_pitch_mm"] == 1.25
    assert resolved["size_resolution"]["thread_confirmed"] is True
    assert resolved["candidate_matches"][0]["name"].startswith("M8 × 1.25")


def test_low_confidence_thread_result_is_not_applied():
    scan = base_scan()
    fused = fuse_thread_measurement(scan, {"applied": True, "thread_pitch_mm": 1.25, "confidence": 0.5})
    assert fused["measurements"]["thread_pitch_mm"] is None
    assert fused["thread_measurement"]["applied"] is False
