from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials

from .authdb import audit
from .hardware_depth import fuse_scan_with_depth
from .hardware_matching import enrich_scan_with_dimensional_candidates
from .main import app, bearer_scheme, limiter, user_from_credentials


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
