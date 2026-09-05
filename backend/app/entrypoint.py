from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials

from .authdb import audit
from .ar_assistant import analyze_ar_component
from .hardware_depth import fuse_scan_with_depth
from .hardware_matching import enrich_scan_with_dimensional_candidates
from .hardware_replacement import replacement_plan
from .main import app, bearer_scheme, limiter, user_from_credentials
from .thread_vision import fuse_thread_measurement, measure_thread_pitch_from_crests


@app.post("/hardware/fuse-depth")
@limiter.limit("30/minute")
def hardware_fuse_depth(
    request: Request,
    payload: dict,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    user = user_from_credentials(credentials)
    scan = payload.get("scan")
    if not isinstance(scan, dict):
        raise HTTPException(400, "A hardware scan result is required.")

    measurements = payload.get("measurements")
    if measurements is not None and not isinstance(measurements, dict):
        raise HTTPException(400, "Depth measurements must be an object.")

    result = fuse_scan_with_depth(
        scan,
        measurements,
        depth_confidence=payload.get("confidence", 0),
        source=str(payload.get("source") or "arkit_lidar"),
    )
    result = enrich_scan_with_dimensional_candidates(result)

    depth = result.get("depth_measurement") or {}
    size = result.get("size_resolution") or {}
    audit(
        user["sub"],
        "hardware.depth_fused",
        "hardware",
        "",
        {
            "kind": result.get("kind", "OTHER"),
            "applied": bool(depth.get("applied")),
            "source": depth.get("source", "arkit_lidar"),
            "confidence": depth.get("confidence", 0),
            "fields": depth.get("fields", []),
            "size_candidates": size.get("candidate_count", 0),
            "thread_confirmed": bool(size.get("thread_confirmed")),
        },
    )
    return result


@app.post("/hardware/fuse-thread")
@limiter.limit("30/minute")
def hardware_fuse_thread(
    request: Request,
    payload: dict,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    user = user_from_credentials(credentials)
    scan = payload.get("scan")
    if not isinstance(scan, dict):
        raise HTTPException(400, "A hardware scan result is required.")

    crests = payload.get("crest_positions_px")
    if not isinstance(crests, list):
        raise HTTPException(400, "Thread crest positions must be an array.")

    measured = measure_thread_pitch_from_crests(
        crests,
        mm_per_pixel=payload.get("mm_per_pixel"),
    )
    result = fuse_thread_measurement(scan, measured)
    result = enrich_scan_with_dimensional_candidates(result)

    thread = result.get("thread_measurement") or {}
    size = result.get("size_resolution") or {}
    audit(
        user["sub"],
        "hardware.thread_fused",
        "hardware",
        "",
        {
            "kind": result.get("kind", "OTHER"),
            "applied": bool(thread.get("applied")),
            "source": thread.get("source", "closeup_rgb_calibrated"),
            "confidence": thread.get("confidence", 0),
            "interval_count": thread.get("interval_count"),
            "size_candidates": size.get("candidate_count", 0),
            "thread_confirmed": bool(size.get("thread_confirmed")),
        },
    )
    return result


@app.post("/hardware/replacement-plan")
@limiter.limit("30/minute")
def hardware_replacement_plan(
    request: Request,
    payload: dict,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    user = user_from_credentials(credentials)
    scan = payload.get("scan")
    if not isinstance(scan, dict):
        raise HTTPException(400, "A hardware scan result is required.")

    plan = replacement_plan(scan)
    audit(
        user["sub"],
        "hardware.replacement_planned",
        "hardware",
        "",
        {
            "kind": plan.get("kind", "OTHER"),
            "readiness": plan.get("readiness", "identify_only"),
            "search_ready": bool(plan.get("search_ready")),
            "exact_replacement_ready": bool(plan.get("exact_replacement_ready")),
            "confidence": plan.get("confidence", 0),
            "missing_evidence": plan.get("missing_evidence", []),
        },
    )
    return plan


@app.post("/ar/ask")
@limiter.limit("20/minute")
def ar_ask(
    request: Request,
    payload: dict,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    user = user_from_credentials(credentials)
    image_base64 = str(payload.get("image_base64") or "")
    if len(image_base64) > 20_000_000:
        raise HTTPException(413, "AR camera frame is too large.")
    point = payload.get("point") or {}
    if not isinstance(point, dict):
        raise HTTPException(400, "A selected AR point is required.")
    question = str(payload.get("question") or "").strip()
    if not question:
        raise HTTPException(400, "Ask a question about the selected component.")
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    try:
        result = analyze_ar_component(
            image_base64=image_base64,
            mime_type=str(payload.get("mime_type") or "image/jpeg"),
            point=point,
            question=question[:1200],
            context=context,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    audit(
        user["sub"],
        "ar.component_asked",
        "equipment",
        str(context.get("equipment_id") or ""),
        {
            "question": question[:180],
            "identified_part": result.get("identified_part", ""),
            "confidence": result.get("confidence", 0),
            "guided_steps": len(result.get("guided_steps") or []),
        },
    )
    return result
