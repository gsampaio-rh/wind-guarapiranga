import { compassLabel, formatAltitude, formatCoord } from "../domain/format";
import type { Camera } from "../map/camera";
import { cameraPosition } from "../map/camera";
import type { Minimap } from "../map/minimap";

export type HudElements = {
  readoutEl: HTMLElement;
  compass: HTMLButtonElement;
};

export function updateCameraHud(elements: HudElements, camera: Camera, minimap: Minimap): void {
  const pos = cameraPosition(camera);
  elements.readoutEl.textContent = `${formatAltitude(pos.altitude)}  ·  ${compassLabel(camera.bearing)}  ·  ${formatCoord(camera.lat, camera.lng)}`;
  elements.compass.style.setProperty("--dial", `${-camera.bearing}deg`);
  elements.compass.setAttribute(
    "aria-label",
    `Bússola, visão para ${compassLabel(camera.bearing)}. Clique para alinhar o norte para cima.`,
  );
  minimap.update(camera);
}
