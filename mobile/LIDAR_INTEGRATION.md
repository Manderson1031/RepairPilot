# RepairPilot LiDAR hardware scanner

RepairPilot uses a local Expo native module in `modules/repairpilot-lidar` and the JavaScript adapter in `src/lidarScanner.ts`.

The local-module layout follows Expo's supported `modules/<name>` convention and uses Expo Autolinking. Native changes require a development build / native rebuild; Expo Go does not contain this custom module.

## Native module name

`RepairPilotLidar`

## Current native contract

### `isSupported() -> Promise<boolean>`

Returns true only when the current iOS device supports the ARKit scene-depth capability used for hardware measurement.

### `startSession() -> Promise<{ running: boolean }>`

Starts an `ARWorldTrackingConfiguration` session with scene depth enabled. It must fail rather than simulate support on an incompatible device.

### `stopSession() -> Promise<void>`

Pauses the AR session and clears any frozen frame/depth state.

### `captureDepthSnapshot() -> Promise<object>`

Freezes an RGB camera frame and its matching ARKit scene-depth frame, then returns:

```json
{
  "image_base64": "...",
  "mime_type": "image/jpeg",
  "width": 1920,
  "height": 1440,
  "depth_width": 256,
  "depth_height": 192
}
```

The measurement UI displays this same frozen camera image and maps the user's normalized tap coordinates back to the matching frozen depth frame.

### `measureBetweenPoints(start, end) -> Promise<object>`

`start` and `end` are normalized image coordinates in the range 0 to 1:

```json
{
  "x": 0.25,
  "y": 0.50
}
```

The module samples a small neighborhood around both depth points, rejects invalid depth, scales the camera intrinsics to depth-map resolution, deprojects both endpoints into 3D camera space, and returns the physical 3D distance:

```json
{
  "distance_mm": 47.92,
  "confidence": 0.91,
  "depth_m": {
    "start": 0.43,
    "end": 0.44
  }
}
```

The native implementation must not invent a dimension when either endpoint lacks reliable depth.

## User workflow

1. Hardware Scanner identifies the part from an RGB photo.
2. The user opens LiDAR Measurement and chooses the intended field: diameter, length, width, or height.
3. RepairPilot freezes a depth-aligned camera frame.
4. The user taps two physical endpoints.
5. The native module calculates the 3D distance and depth confidence.
6. Measurements below 0.75 confidence are blocked from exact-size fusion.
7. Accepted measurements are returned to Hardware Scanner and sent to the authenticated `/hardware/fuse-depth` endpoint.
8. The server remains authoritative when applying the measurement to the hardware scan.

## ARKit implementation requirements

Use `ARWorldTrackingConfiguration` only on supported hardware. Obtain depth from the same AR frame as the RGB camera image. Use camera intrinsics plus depth to deproject image coordinates into 3D camera-space points.

Gross dimensions such as bolt length, shank diameter, bearing OD/ID, fitting OD and body width should use multiple nearby depth samples rather than one raw pixel. Reject measurements when the selected surface has invalid depth, the depth map has holes, or the endpoint neighborhoods do not provide enough valid samples.

The native module returns a normalized confidence from 0 to 1. The mobile UI and backend fusion layer both require at least 0.75 before applying a LiDAR dimension.

## Display-coordinate requirement

The frozen image must be displayed without geometric stretching. The measurement screen preserves the captured image aspect ratio and converts taps using the actual rendered frame dimensions. If native capture orientation is changed later, the same transform must also be applied to the normalized measurement coordinates before sampling the depth map.

## Thread pitch

LiDAR is not the primary source for fine thread pitch on small hardware. RepairPilot uses LiDAR for gross scale and the calibrated close-up RGB workflow for crest-to-crest thread spacing / TPI.

## Safety and validation

The server-side depth fusion layer validates positive finite dimensions and refuses low-confidence depth results. This remains authoritative even when the native measurement succeeds locally.

## Physical-device validation

Before production release, build the custom native development client and test on a supported LiDAR-equipped iPhone or iPad using known references measured with calipers or gauge blocks. Record absolute error and repeatability across representative bolts, fittings and bearings. Validate portrait orientation, endpoint mapping, confidence behavior, reflective surfaces and close-range depth holes. Do not expose an "exact size" claim until measured error is inside the product's stated tolerance.
