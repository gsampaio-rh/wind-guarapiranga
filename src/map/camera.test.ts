import { describe, expect, it } from "vitest";
import { distanceMeters, raiseToClearance, wrapDegrees } from "../domain/geo";
import {
  BOOST,
  DOLLY_RATE,
  LIMITS,
  MOVE_RATE,
  TURN_DEG_PER_SEC,
  advanceOrbit,
  cameraPosition,
  dollyByWheel,
  integrateCamera,
  lerpAngle,
  orbitByPointer,
  panByPointer,
  type Axes,
  type Camera,
} from "./camera";

const idle: Axes = { forward: 0, right: 0, dolly: 0, turn: 0, tilt: 0, boost: false };

function camera(overrides: Partial<Camera> = {}): Camera {
  return {
    lng: -46.7328,
    lat: -23.7278,
    elevation: 1000,
    distance: 2000,
    bearing: 0,
    pitch: 60,
    ...overrides,
  };
}

describe("cameraPosition", () => {
  it("places an overhead camera on the look point", () => {
    const pos = cameraPosition(camera({ pitch: 0, distance: 2000 }));
    expect(pos.lng).toBeCloseTo(-46.7328, 5);
    expect(pos.lat).toBeCloseTo(-23.7278, 5);
    expect(pos.altitude).toBeCloseTo(3000, 5);
  });

  it("places a north-looking camera to the south and above the look point", () => {
    const cam = camera({ bearing: 0, pitch: 60, distance: 2000, elevation: 1000 });
    const pos = cameraPosition(cam);
    expect(pos.altitude).toBeCloseTo(2000, 3);
    expect(pos.lat).toBeLessThan(cam.lat);
    expect(pos.lng).toBeCloseTo(cam.lng, 3);
    expect(distanceMeters(cam.lng, cam.lat, pos.lng, pos.lat)).toBeCloseTo(2000 * Math.sin(Math.PI / 3), 0);
  });
});

describe("integrateCamera", () => {
  it("moves north when flying forward at bearing 0", () => {
    const start = camera();
    const next = integrateCamera(start, { ...idle, forward: 1 }, 0.05);
    expect(next.lat).toBeGreaterThan(start.lat);
    expect(distanceMeters(start.lng, start.lat, next.lng, next.lat)).toBeCloseTo(
      start.distance * MOVE_RATE * 0.05,
      0,
    );
  });

  it("keeps diagonal flight the same speed as cardinal flight", () => {
    const start = camera();
    const north = integrateCamera(start, { ...idle, forward: 1 }, 0.05);
    const diagonal = integrateCamera(start, { ...idle, forward: 1, right: 1 }, 0.05);
    expect(distanceMeters(start.lng, start.lat, diagonal.lng, diagonal.lat)).toBeCloseTo(
      distanceMeters(start.lng, start.lat, north.lng, north.lat),
      1,
    );
  });

  it("flies faster while boosted", () => {
    const start = camera();
    const normal = integrateCamera(start, { ...idle, forward: 1 }, 0.05);
    const boosted = integrateCamera(start, { ...idle, forward: 1, boost: true }, 0.05);
    expect(distanceMeters(start.lng, start.lat, boosted.lng, boosted.lat)).toBeCloseTo(
      distanceMeters(start.lng, start.lat, normal.lng, normal.lat) * BOOST,
      0,
    );
  });

  it("does not move when no axis is held", () => {
    const start = camera({ bearing: 37, pitch: 50 });
    const next = integrateCamera(start, idle, 0.05);
    expect(next.lng).toBeCloseTo(start.lng, 8);
    expect(next.lat).toBeCloseTo(start.lat, 8);
    expect(next.distance).toBeCloseTo(start.distance, 8);
  });

  it("moves closer when dolly is positive and clamps a huge frame", () => {
    const start = camera();
    const closer = integrateCamera(start, { ...idle, dolly: 1 }, 1);
    expect(closer.distance).toBeCloseTo(start.distance * Math.exp(-DOLLY_RATE * 0.05), 4);
    expect(closer.distance).toBeLessThan(start.distance);
  });

  it("stops at the north edge of the reservoir", () => {
    const start = camera({ lat: -23.62005 });
    const next = integrateCamera(start, { ...idle, forward: 1, boost: true }, 0.05);
    expect(next.lat).toBe(-23.62);
  });

  it("turns right and wraps bearing", () => {
    const start = camera({ bearing: 350 });
    const next = integrateCamera(start, { ...idle, turn: 1 }, 0.05);
    expect(next.bearing).toBeCloseTo(wrapDegrees(350 + TURN_DEG_PER_SEC * 0.05), 5);
  });

  it("clamps pitch at the horizon", () => {
    const next = integrateCamera(camera({ pitch: 79 }), { ...idle, tilt: 1 }, 0.05);
    expect(next.pitch).toBe(LIMITS.maxPitch);
  });
});

describe("pointer and orbit", () => {
  it("orbits clockwise when the pointer moves right", () => {
    const start = camera({ bearing: 10, pitch: 40 });
    const next = orbitByPointer(start, 20, 0);
    expect(next.bearing).toBeCloseTo(14.4, 5);
    expect(next.pitch).toBe(40);
  });

  it("raises the view toward the horizon when the pointer moves up", () => {
    const next = orbitByPointer(camera({ pitch: 40 }), 0, -10);
    expect(next.pitch).toBeCloseTo(41.5, 5);
  });

  it("pans west when dragged right while looking north", () => {
    const start = camera({ bearing: 0 });
    const next = panByPointer(start, 40, 0);
    expect(next.lng).toBeLessThan(start.lng);
    expect(next.lat).toBeCloseTo(start.lat, 4);
  });

  it("zooms out on a downward wheel", () => {
    const next = dollyByWheel(camera(), 100);
    expect(next.distance).toBeGreaterThan(2000);
  });

  it("advances the auto orbit", () => {
    const next = advanceOrbit(camera({ bearing: 10 }), 0.5, 8);
    expect(next.bearing).toBeCloseTo(10.4, 5);
  });
});

describe("helpers", () => {
  it("lifts the camera above the ground", () => {
    expect(raiseToClearance(800, 900, 45)).toBe(945);
    expect(raiseToClearance(800, null, 45)).toBe(800);
  });

  it("lerps bearing across north", () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0, 5);
  });
});
