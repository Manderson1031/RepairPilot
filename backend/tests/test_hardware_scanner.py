import os
from pathlib import Path

from app.hardware_scanner import analyze_hardware_image


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
