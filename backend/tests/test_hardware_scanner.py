from app.hardware_scanner import _normalize_result, analyze_hardware_image


def test_scanner_without_ai_does_not_invent_measurements(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    image = tmp_path / "part.jpg"
    image.write_bytes(b"not-a-real-image")

    result = analyze_hardware_image(image, "part.jpg", "FASTENER")

    assert result["kind"] == "FASTENER"
    assert result["identified_part"] == ""
    assert result["confidence"] == 0.0
    assert result["needs_reference_scale"] is True
    assert all(value is None for value in result["measurements"].values())
    assert result["warnings"]


def test_scanner_normalizes_unknown_category(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    image = tmp_path / "part.jpg"
    image.write_bytes(b"not-a-real-image")

    result = analyze_hardware_image(image, "part.jpg", "mystery")

    assert result["kind"] == "OTHER"


def test_server_withholds_model_dimensions_when_reference_is_not_confirmed():
    result = _normalize_result({
        "identified_part": "hex bolt",
        "standard": "",
        "measurements": {"diameter_mm": 10, "length_mm": 40, "thread_pitch_mm": 1.5, "threads_per_inch": 16.93, "width_mm": None, "height_mm": None},
        "markings": [],
        "candidate_matches": [],
        "confidence": .8,
        "needs_reference_scale": True,
        "warnings": [],
    }, "FASTENER")

    assert all(value is None for value in result["measurements"].values())
    assert any("withheld" in warning.lower() for warning in result["warnings"])


def test_server_accepts_positive_measurements_only_after_reference_is_confirmed():
    result = _normalize_result({
        "identified_part": "hex bolt",
        "standard": "",
        "measurements": {"diameter_mm": 10, "length_mm": 40, "thread_pitch_mm": 1.5, "threads_per_inch": 16.93, "width_mm": -2, "height_mm": None},
        "markings": ["8.8"],
        "candidate_matches": [],
        "confidence": 3,
        "needs_reference_scale": False,
        "warnings": [],
    }, "FASTENER")

    assert result["measurements"]["diameter_mm"] == 10
    assert result["measurements"]["thread_pitch_mm"] == 1.5
    assert result["measurements"]["width_mm"] is None
    assert result["confidence"] == 1.0
