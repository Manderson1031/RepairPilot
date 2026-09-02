from app.hardware_depth import fuse_scan_with_depth, sanitize_depth_measurements


def base_scan():
    return {
        "kind": "FASTENER",
        "identified_part": "hex-head bolt",
        "standard": "",
        "measurements": {
            "diameter_mm": None,
            "length_mm": None,
            "thread_pitch_mm": None,
            "threads_per_inch": None,
            "width_mm": None,
            "height_mm": None,
        },
        "markings": [],
        "candidate_matches": [],
        "confidence": 0.82,
        "needs_reference_scale": True,
        "warnings": [],
    }


def test_low_confidence_depth_is_not_applied():
    result = fuse_scan_with_depth(
        base_scan(),
        {"diameter_mm": 12.0, "length_mm": 48.0},
        depth_confidence=0.4,
    )
    assert result["measurements"]["diameter_mm"] is None
    assert result["measurements"]["length_mm"] is None
    assert result["needs_reference_scale"] is True
    assert result["depth_measurement"]["applied"] is False


def test_trusted_depth_populates_gross_dimensions():
    result = fuse_scan_with_depth(
        base_scan(),
        {"diameter_mm": 12.04, "length_mm": 47.92, "width_mm": 18.0},
        depth_confidence=0.91,
    )
    assert result["measurements"]["diameter_mm"] == 12.04
    assert result["measurements"]["length_mm"] == 47.92
    assert result["measurements"]["width_mm"] == 18.0
    assert result["needs_reference_scale"] is False
    assert result["depth_measurement"]["applied"] is True


def test_pitch_derives_tpi_when_supplied_by_trusted_pipeline():
    result = fuse_scan_with_depth(
        base_scan(),
        {"thread_pitch_mm": 1.27},
        depth_confidence=0.95,
    )
    assert result["measurements"]["thread_pitch_mm"] == 1.27
    assert result["measurements"]["threads_per_inch"] == 20.0


def test_invalid_depth_values_are_discarded():
    values = sanitize_depth_measurements({
        "diameter_mm": -1,
        "length_mm": "bad",
        "width_mm": float("inf"),
        "height_mm": 9.5,
    })
    assert values["diameter_mm"] is None
    assert values["length_mm"] is None
    assert values["width_mm"] is None
    assert values["height_mm"] == 9.5
