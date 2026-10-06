import { LngLat, Map as MapView } from "maplibre-gl";
import { raiseToClearance } from "../domain/geo";
import { type Viewpoint } from "../domain/viewpoints";
import {
  type Axes,
  type Camera,
  MIN_CLEARANCE_M,
  advanceOrbit,
  cameraPosition,
  dollyByWheel,
  integrateCamera,
  lerpCamera,
  orbitByPointer,
  panByPointer,
} from "./camera";

const FLY_MS = 1100;

export type CameraRigElements = {
  orbitButton: HTMLButtonElement;
  compass: HTMLButtonElement;
};

export type CameraRig = {
  getCamera(): Camera;
  /** Advances flying/orbit/WASD by `dt` seconds and applies the result to the map. */
  step(dt: number): void;
  lookAt(lng: number, lat: number): void;
};

/** Owns the 3D camera: WASD/pointer/wheel navigation, orbit, fly-to, and the orbit/compass buttons. */
export function createCameraRig(map: MapView, mapEl: HTMLElement, home: Viewpoint, elements: CameraRigElements): CameraRig {
  const keys = new Set<string>();
  const pointers = new Map<number, { x: number; y: number }>();

  let camera: Camera = {
    lng: home.lng,
    lat: home.lat,
    elevation: 1100,
    distance: home.distance,
    bearing: home.bearing,
    pitch: home.pitch,
  };
  let orbiting = false;
  let flying: { from: Camera; to: Camera; start: number; duration: number } | null = null;
  let pinch: number | null = null;

  mapEl.addEventListener("pointerdown", onPointerDown);
  mapEl.addEventListener("pointermove", onPointerMove);
  mapEl.addEventListener("pointerup", onPointerUp);
  mapEl.addEventListener("pointercancel", onPointerUp);
  mapEl.addEventListener("contextmenu", (event) => event.preventDefault());
  mapEl.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());

  elements.orbitButton.addEventListener("click", () => setOrbit(!orbiting));
  elements.compass.addEventListener("click", () => flyTo({ ...camera, bearing: 0 }));

  return {
    getCamera() {
      return camera;
    },
    step(dt: number) {
      if (flying) {
        const now = performance.now();
        const t = flying.duration === 0 ? 1 : Math.min(1, (now - flying.start) / flying.duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        camera = lerpCamera(flying.from, flying.to, eased);
        if (t >= 1) flying = null;
      } else {
        if (orbiting) camera = advanceOrbit(camera, dt);
        camera = integrateCamera(camera, axes(), dt);
      }
      sampleGround();
      applyCamera();
    },
    lookAt(lng, lat) {
      flyTo({ ...camera, lng, lat });
    },
  };

  function setOrbit(next: boolean): void {
    orbiting = next;
    elements.orbitButton.setAttribute("aria-pressed", String(next));
    elements.orbitButton.textContent = next ? "Parar órbita" : "Orbitar";
  }

  function flyTo(to: Camera): void {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    flying = { from: camera, to, start: performance.now(), duration: reduced ? 0 : FLY_MS };
  }

  function cancelFly(): void {
    flying = null;
  }

  function axes(): Axes {
    const held = (name: string) => (keys.has(name) ? 1 : 0);
    return {
      forward: held("w") - held("s"),
      right: held("d") - held("a"),
      dolly: held("e") - held("q"),
      turn: held("arrowright") - held("arrowleft"),
      tilt: held("arrowup") - held("arrowdown"),
      boost: keys.has("shift"),
    };
  }

  function typingTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select"));
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (typingTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === " " && event.target instanceof HTMLButtonElement) return;
    if (key === " ") {
      setOrbit(!orbiting);
      event.preventDefault();
      return;
    }
    const flown = ["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key);
    if (!flown) return;
    keys.add(key);
    cancelFly();
    event.preventDefault();
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 && event.button !== 2) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    mapEl.setPointerCapture(event.pointerId);
    mapEl.focus({ preventScroll: true });
    cancelFly();
    pinch = pointers.size === 2 ? pinchDistance() : null;
  }

  function onPointerMove(event: PointerEvent): void {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const next = pinchDistance();
      if (pinch && pinch > 0) camera = dollyByWheel(camera, (pinch - next) * 1.6);
      pinch = next;
      return;
    }
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    camera = event.buttons === 2 ? panByPointer(camera, dx, dy) : orbitByPointer(camera, dx, dy);
  }

  function onPointerUp(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    pinch = pointers.size === 2 ? pinchDistance() : null;
  }

  function pinchDistance(): number {
    const points = [...pointers.values()];
    const a = points[0];
    const b = points[1];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    cancelFly();
    camera = dollyByWheel(camera, event.deltaY);
  }

  function sampleGround(): void {
    if (!map.getTerrain()) {
      camera = { ...camera, elevation: 0 };
      return;
    }
    const ground = map.queryTerrainElevation([camera.lng, camera.lat]);
    if (ground != null) camera = { ...camera, elevation: ground };
  }

  function applyCamera(): void {
    const pos = cameraPosition(camera);
    const ground = map.queryTerrainElevation([pos.lng, pos.lat]);
    const altitude = raiseToClearance(pos.altitude, ground, MIN_CLEARANCE_M);
    if (Math.hypot(pos.lng - camera.lng, pos.lat - camera.lat) === 0 && altitude === camera.elevation) return;
    try {
      const options = map.calculateCameraOptionsFromTo(
        new LngLat(pos.lng, pos.lat),
        altitude,
        new LngLat(camera.lng, camera.lat),
        camera.elevation,
      );
      if (options.zoom == null || !Number.isFinite(options.zoom)) return;
      map.jumpTo(options);
    } catch {
      return;
    }
  }
}
