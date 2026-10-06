import { clamp, clampLngLat, offsetMeters, wrapDegrees } from "../domain/geo";

export const LIMITS = {
  minPitch: 4,
  maxPitch: 80,
  minDistance: 180,
  maxDistance: 14_000,
} as const;

export const TURN_DEG_PER_SEC = 70;
export const TILT_DEG_PER_SEC = 42;
export const MOVE_RATE = 0.12;
export const BOOST = 3;
export const DOLLY_RATE = 0.9;
export const MIN_CLEARANCE_M = 45;

export type Camera = {
  lng: number;
  lat: number;
  elevation: number;
  distance: number;
  bearing: number;
  pitch: number;
};

export type Axes = {
  forward: number;
  right: number;
  dolly: number;
  turn: number;
  tilt: number;
  boost: boolean;
};

export function clampCamera(camera: Camera): Camera {
  const lngLat = clampLngLat(camera.lng, camera.lat);
  return {
    ...camera,
    ...lngLat,
    distance: clamp(camera.distance, LIMITS.minDistance, LIMITS.maxDistance),
    bearing: wrapDegrees(camera.bearing),
    pitch: clamp(camera.pitch, LIMITS.minPitch, LIMITS.maxPitch),
  };
}

/** Camera sits behind the look point. Pitch 0 is overhead; 80 looks toward the horizon. */
export function cameraPosition(camera: Camera): { lng: number; lat: number; altitude: number } {
  const pitchRad = (camera.pitch * Math.PI) / 180;
  const horizontal = camera.distance * Math.sin(pitchRad);
  const altitude = camera.elevation + camera.distance * Math.cos(pitchRad);
  const behind = ((camera.bearing + 180) * Math.PI) / 180;
  const shifted = offsetMeters(
    camera.lng,
    camera.lat,
    Math.sin(behind) * horizontal,
    Math.cos(behind) * horizontal,
  );
  return { ...shifted, altitude };
}

export function integrateCamera(camera: Camera, axes: Axes, dt: number): Camera {
  const step = clamp(dt, 0, 0.05);
  const len = Math.hypot(axes.forward, axes.right);
  const forward = len > 0 ? axes.forward / len : 0;
  const right = len > 0 ? axes.right / len : 0;
  const meters = camera.distance * MOVE_RATE * (axes.boost ? BOOST : 1) * step;
  const bearingRad = (camera.bearing * Math.PI) / 180;
  const east = Math.sin(bearingRad);
  const north = Math.cos(bearingRad);
  const moved = offsetMeters(
    camera.lng,
    camera.lat,
    (east * forward + north * right) * meters,
    (north * forward - east * right) * meters,
  );
  const dolly = Math.exp(-axes.dolly * DOLLY_RATE * (axes.boost ? BOOST : 1) * step);
  return clampCamera({
    ...camera,
    ...moved,
    distance: camera.distance * dolly,
    bearing: camera.bearing + axes.turn * TURN_DEG_PER_SEC * step,
    pitch: camera.pitch + axes.tilt * TILT_DEG_PER_SEC * step,
  });
}

export function orbitByPointer(camera: Camera, dxPx: number, dyPx: number): Camera {
  return clampCamera({
    ...camera,
    bearing: camera.bearing + dxPx * 0.22,
    pitch: camera.pitch - dyPx * 0.15,
  });
}

export function panByPointer(camera: Camera, dxPx: number, dyPx: number): Camera {
  const metersPerPx = camera.distance / 850;
  const bearingRad = (camera.bearing * Math.PI) / 180;
  const east = Math.sin(bearingRad);
  const north = Math.cos(bearingRad);
  const forwardM = -dyPx * metersPerPx;
  const rightM = -dxPx * metersPerPx;
  const moved = offsetMeters(
    camera.lng,
    camera.lat,
    north * rightM + east * forwardM,
    -east * rightM + north * forwardM,
  );
  return clampCamera({ ...camera, ...moved });
}

export function dollyByWheel(camera: Camera, deltaY: number): Camera {
  return clampCamera({
    ...camera,
    distance: camera.distance * Math.exp(deltaY * 0.0011),
  });
}

export function advanceOrbit(camera: Camera, dt: number, degPerSec = 8): Camera {
  return clampCamera({
    ...camera,
    bearing: camera.bearing + degPerSec * clamp(dt, 0, 0.05),
  });
}

export function lerpAngle(a: number, b: number, t: number): number {
  const delta = ((((b - a) % 360) + 540) % 360) - 180;
  return wrapDegrees(a + delta * t);
}

export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  return {
    lng: a.lng + (b.lng - a.lng) * t,
    lat: a.lat + (b.lat - a.lat) * t,
    elevation: a.elevation + (b.elevation - a.elevation) * t,
    distance: a.distance + (b.distance - a.distance) * t,
    bearing: lerpAngle(a.bearing, b.bearing, t),
    pitch: a.pitch + (b.pitch - a.pitch) * t,
  };
}
