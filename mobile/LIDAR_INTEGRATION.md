# RepairPilot LiDAR hardware scanner

RepairPilot's JavaScript scanner now has a stable native-module contract through `src/lidarScanner.ts`.

## Native module name

`RepairPilotLidar`

## Required methods

### `isSupported() -> Promise<boolean>`

Return true only when the current iOS device supports the ARKit scene-depth capability needed for hardware measurement.

### `captureHardware() -> Promise<object>`

Return an object shaped like:

```json
{
  "confidence": 0.91,
  "measurements": {
    "diameter_mm": 12.04,
    "length_mm": 47.92,
    "width_mm": 18.0,
    "height_mm": null,
    "thread_pitch_mm": null
  }
}
```

The native implementation must not invent dimensions. A field is `null` when the geometry cannot be measured reliably.

## ARKit implementation requirements

Use `ARWorldTrackingConfiguration` only on supported hardware. Enable scene depth / smoothed scene depth when available and obtain depth from the same AR frame as the RGB camera image. Use camera intrinsics plus depth to deproject image coordinates into 3D camera-space points.

Gross dimensions such as bolt length, shank diameter, bearing OD/ID, fitting OD and body width should be derived from multiple depth samples across the selected part, not from one pixel. Reject measurements when the target boundary is ambiguous, the surface is reflective, the depth map has holes, the camera moves excessively during capture, or repeated samples disagree beyond the configured tolerance.

The native module must return a normalized confidence from 0 to 1. The backend fusion layer currently requires at least 0.75 before applying LiDAR dimensions.

## Thread pitch

LiDAR is not the primary source for fine thread pitch on small hardware. RepairPilot should use LiDAR for gross scale and close-up RGB vision for crest-to-crest thread spacing. If a future native pipeline can resolve pitch reliably, it may populate `thread_pitch_mm`; the backend will derive TPI from that value.

## Safety and validation

The server-side `hardware_depth.py` layer validates positive finite dimensions and refuses low-confidence depth results. This must remain authoritative even after the native module is added.

## Physical-device validation

Before enabling production LiDAR measurement, test on a supported LiDAR-equipped iPhone or iPad with known gauge blocks / calipers across representative bolts, fittings and bearings. Record absolute error and repeatability by dimension range and material. Do not expose an "exact size" claim until the measured error is inside the product's stated tolerance.
