from app.hardware_replacement import replacement_plan


def scan_fastener(**measurements):
    base = {
        "diameter_mm": None,
        "length_mm": None,
        "thread_pitch_mm": None,
        "threads_per_inch": None,
        "width_mm": None,
        "height_mm": None,
    }
    base.update(measurements)
    return {
        "kind": "FASTENER",
        "identified_part": "hex bolt",
        "measurements": base,
        "markings": [],
        "candidate_matches": [],
        "size_resolution": {"thread_confirmed": False},
    }


def test_fastener_without_dimensions_is_not_search_ready():
    plan = replacement_plan(scan_fastener())
    assert plan["search_ready"] is False
    assert "diameter" in plan["missing_evidence"]
    assert "thread_pitch_or_tpi" in plan["missing_evidence"]


def test_nominal_diameter_alone_does_not_claim_exact_replacement():
    plan = replacement_plan(scan_fastener(diameter_mm=8.01))
    assert plan["readiness"] == "nominal_diameter_only"
    assert plan["exact_replacement_ready"] is False
    assert "thread_pitch_or_tpi" in plan["missing_evidence"]


def test_confirmed_thread_and_length_allow_exact_fastener_plan():
    scan = scan_fastener(diameter_mm=8.01, length_mm=30.0, thread_pitch_mm=1.25, threads_per_inch=20.32)
    scan["size_resolution"] = {"thread_confirmed": True}
    scan["candidate_matches"] = [{"name": "M8 × 1.25 × 30 mm length", "thread_confirmed": True, "system": "metric"}]
    plan = replacement_plan(scan)
    assert plan["exact_replacement_ready"] is True
    assert plan["search_ready"] is True
    assert "M8 × 1.25" in plan["search_query"]
    assert plan["warning"] is None


def test_bearing_requires_dimension_evidence_without_fastener_thread_rules():
    plan = replacement_plan({
        "kind": "BEARING",
        "identified_part": "ball bearing",
        "measurements": {"diameter_mm": 35.0, "width_mm": None},
        "markings": ["6202"],
        "candidate_matches": [],
    })
    assert plan["exact_replacement_ready"] is False
    assert "width" in plan["missing_evidence"]
    assert "thread_pitch_or_tpi" not in plan["missing_evidence"]
