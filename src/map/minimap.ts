import { LngLatBounds, Map as MapView } from "maplibre-gl";
import type { Camera } from "./camera";
import { minimapStyle } from "./mapStyle";

const OVERVIEW = new LngLatBounds([-46.805, -23.8], [-46.655, -23.652]);

export type Minimap = {
  update(camera: Camera): void;
  resize(): void;
};

export function createMinimap(container: HTMLElement, marker: HTMLElement, onPick: (lng: number, lat: number) => void): Minimap {
  const mini = new MapView({
    container,
    style: minimapStyle,
    center: [-46.7328, -23.7278],
    zoom: 11,
    attributionControl: false,
    interactive: false,
    dragPan: false,
    dragRotate: false,
    scrollZoom: false,
    boxZoom: false,
    doubleClickZoom: false,
    keyboard: false,
    touchZoomRotate: false,
    touchPitch: false,
    fadeDuration: 0,
  });

  let framed = false;
  mini.on("load", () => {
    frame();
    framed = true;
    const canvas = container.querySelector(".maplibregl-canvas");
    canvas?.setAttribute(
      "aria-label",
      "Mini mapa da Represa Guarapiranga, com o norte para cima. Clique para levar a câmera até o ponto.",
    );
  });

  container.addEventListener("click", (event) => {
    if (!framed) return;
    const rect = container.getBoundingClientRect();
    const point = mini.unproject([event.clientX - rect.left, event.clientY - rect.top]);
    onPick(point.lng, point.lat);
  });

  return {
    resize() {
      mini.resize();
      if (framed) frame();
    },
    update(camera) {
      if (!framed) return;
      const point = mini.project([camera.lng, camera.lat]);
      const width = container.clientWidth;
      const height = container.clientHeight;
      const x = Math.min(width - 16, Math.max(16, point.x));
      const y = Math.min(height - 16, Math.max(16, point.y));
      marker.style.left = `${x}px`;
      marker.style.top = `${y}px`;
      marker.style.transform = `translate(-50%, -50%) rotate(${camera.bearing}deg)`;
    },
  };

  function frame(): void {
    mini.fitBounds(OVERVIEW, { padding: 18, animate: false, bearing: 0, pitch: 0 });
  }
}
