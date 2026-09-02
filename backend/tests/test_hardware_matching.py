from app.hardware_matching import dimensional_candidates, enrich_scan_with_dimensional_candidates


def scan(diameter=None, pitch=None, tpi=None, length=None):
    return {
        "kind": "FASTENER",
        "measurements": {
            "diameter_mm": diameter,
            "length_mm": length,
            "thread_pitch_mm": pitch,
            "threads_per_inch": tpi,
            "width_mm": None,
            "height_mm": None,
        },
        "candidate_matches": [],
    }


def test_metric_diameter_narrows_nominal_size_without_claiming_thread():
    candidates = dimensional_candidates(scan(diameter=7.98, length=30.1))
    metric = next(x for x in candidates if x["system"] == "metric")
    assert metric["name"].startswith("M8")
    assert metric["thread_confirmed"] is False


def test_metric_pitch_confirms_common_thread():
    candidates = dimensional_candidates(scan(diameter=8.02, pitch=1.24, length=30.0))
    metric = next(x for x in candidates if x["system"] == "metric")
    assert "M8 × 1.25" in metric["name"]
    assert metric["thread_confirmed"] is True


def test_sae_tpi_confirms_common_thread():
    candidates = dimensional_candidates(scan(diameter=12.68, tpi=13.1))
    inch = next(x for x in candidates if x["system"] == "inch")
    assert inch["name"].startswith("1/2-13")
    assert inch["thread_confirmed"] is True


def test_non_fastener_is_not_force_fit_to_bolt_standard():
    payload = scan(diameter=8.0)
    payload["kind"] = "BEARING"
    assert dimensional_candidates(payload) == []


def test_enrichment_preserves_existing_candidates():
    payload = scan(diameter=6.01)
    payload["candidate_matches"] = [{"name": "visual candidate", "reason": "marking"}]
    enriched = enrich_scan_with_dimensional_candidates(payload)
    assert any(x.get("name") == "visual candidate" for x in enriched["candidate_matches"])
    assert enriched["size_resolution"]["candidate_count"] >= 1
