import type { Map as MapView } from "maplibre-gl";
import type { BoundsGrid } from "../../domain/geo";
import { offsetMeters } from "../../domain/geo";
import { inReservoir } from "../../domain/water";
import { armGust, restingGustState, tickGust, type GustState } from "../../domain/wind/gust";
import { blendSpeed, pickWaterPoint, randomLife, speedScale } from "../../domain/wind/particle";

const MEAN_COUNT = 420;
const TRAIL = 0.5;
const KNOT_PX = 9;

type Rgb = [number, number, number];
const WHITE: Rgb = [255, 255, 255];
const GUST_RED: Rgb = [255, 42, 32];

type LngLat = { lng: number; lat: number };

export type WindSample = { u: number; v: number; mean: number; gust: number };
export type SampleWind = (lng: number, lat: number) => WindSample | null;

type TrailPoint = { x: number; y: number; t: number; gust: number };

type Particle = {
  lng: number;
  lat: number;
  age: number;
  life: number;
  trail: TrailPoint[];
  gust: GustState;
};

type TrailView = {
  x: number;
  y: number;
  zoom: number;
  bearing: number;
  pitch: number;
  width: number;
  height: number;
};

export type ParticleCanvas = {
  /** Re-arms every particle for the gust toggle: ~12% jump straight into a gust. */
  setGustsOn(active: boolean): void;
  step(dt: number, sampleWind: SampleWind, gustsOn: boolean): void;
  draw(particlesOn: boolean): void;
  resize(): void;
};

export function createParticleCanvas(
  map: MapView,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  rings: number[][][],
  grid: BoundsGrid,
  waterCells: { col: number; row: number }[],
): ParticleCanvas {
  let trailClock = 0;
  let spawnBudget = 0;
  let trailView: TrailView | null = null;
  const particles = Array.from({ length: MEAN_COUNT }, () => spawnParticle());

  return {
    setGustsOn(active) {
      for (const particle of particles) particle.gust = armGust(active);
    },
    step(dt, sampleWind, gustsOn) {
      if (waterCells.length === 0) return;
      spawnBudget = 80;
      trailClock += dt;
      if (cameraMoved()) {
        for (const particle of particles) particle.trail = [];
      }
      for (const particle of particles) stepParticle(particle, dt, sampleWind, gustsOn);
    },
    draw(particlesOn) {
      sizeCanvas();
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      ctx.save();
      clipWater();
      if (particlesOn) drawParticles();
      ctx.restore();
    },
    resize() {
      sizeCanvas();
    },
  };

  function spawnParticle(): Particle {
    const point = pickWaterPoint(grid, waterCells, rings);
    const life = randomLife();
    return {
      lng: point.lng,
      lat: point.lat,
      age: Math.random() * life,
      life,
      trail: [],
      gust: restingGustState(),
    };
  }

  function onWater(point: LngLat): boolean {
    return inReservoir(rings, point.lng, point.lat);
  }

  function stepParticle(particle: Particle, dt: number, sampleWind: SampleWind, gustsOn: boolean): void {
    const envelope = tickGust(particle.gust, dt, gustsOn);
    const place = { lng: particle.lng, lat: particle.lat };
    const sample = sampleWind(place.lng, place.lat);
    if (!sample || particle.age >= particle.life || !onWater(place)) {
      recycle(particle);
      return;
    }
    const mean = sample.mean;
    const gust = Math.max(mean, sample.gust);
    const speed = blendSpeed(mean, gust, envelope);
    const scale = speedScale(mean, speed);
    const moved = moveOnScreen(place, sample.u * scale, sample.v * scale, dt);
    if (!moved) return;
    if (!onWater(moved)) {
      recycle(particle);
      return;
    }
    particle.lng = moved.lng;
    particle.lat = moved.lat;
    particle.age += dt;
    const head = map.project([particle.lng, particle.lat]);
    const margin = 64;
    const outside =
      head.x < -margin ||
      head.y < -margin ||
      head.x > canvas.clientWidth + margin ||
      head.y > canvas.clientHeight + margin;
    if (outside) {
      particle.trail = [];
      return;
    }
    const previous = particle.trail[particle.trail.length - 1];
    const jumped = previous != null && Math.hypot(head.x - previous.x, head.y - previous.y) > 36;
    if (jumped) particle.trail = [];
    particle.trail.push({ x: head.x, y: head.y, t: trailClock, gust: envelope });
    const cutoff = trailClock - TRAIL;
    while (particle.trail.length > 1 && (particle.trail[0]?.t ?? 0) < cutoff) particle.trail.shift();
  }

  function recycle(particle: Particle): void {
    if (spawnBudget <= 0) {
      particle.trail = [];
      particle.age = particle.life;
      return;
    }
    spawnBudget -= 1;
    Object.assign(particle, spawnParticle());
  }

  function moveOnScreen(place: LngLat, u: number, v: number, dt: number): LngLat | null {
    const knots = Math.hypot(u, v);
    if (knots === 0) return place;
    const here = map.project([place.lng, place.lat]);
    const probe = offsetMeters(place.lng, place.lat, (u / knots) * 80, (v / knots) * 80);
    const there = map.project([probe.lng, probe.lat]);
    if (!Number.isFinite(here.x) || !Number.isFinite(here.y) || !Number.isFinite(there.x) || !Number.isFinite(there.y)) {
      return null;
    }
    const sx = there.x - here.x;
    const sy = there.y - here.y;
    const screen = Math.hypot(sx, sy);
    if (screen < 0.05) return place;
    const want = knots * KNOT_PX * dt;
    const dest = map.unproject([here.x + (sx / screen) * want, here.y + (sy / screen) * want]);
    if (!Number.isFinite(dest.lng) || !Number.isFinite(dest.lat)) return null;
    return { lng: dest.lng, lat: dest.lat };
  }

  function cameraMoved(): boolean {
    const zoom = map.getZoom();
    const bearing = map.getBearing();
    const pitch = map.getPitch();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const anchor = map.project([-46.73, -23.72]);
    const next = { x: anchor.x, y: anchor.y, zoom, bearing, pitch, width, height };
    const prev = trailView;
    if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) return false;
    if (!prev || !Number.isFinite(prev.x)) {
      trailView = next;
      return false;
    }
    const bearingDelta = Math.abs((((bearing - prev.bearing) % 360) + 540) % 360 - 180);
    const moved =
      width !== prev.width ||
      height !== prev.height ||
      Math.abs(zoom - prev.zoom) > 0.0015 ||
      bearingDelta > 0.06 ||
      Math.abs(pitch - prev.pitch) > 0.06 ||
      Math.hypot(next.x - prev.x, next.y - prev.y) > 2;
    if (moved) trailView = next;
    return moved;
  }

  function drawParticles(): void {
    ctx.lineCap = "butt";
    ctx.lineJoin = "bevel";
    ctx.lineWidth = 1.25;
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    for (const particle of particles) {
      const trail = particle.trail;
      if (trail.length < 2) continue;
      const headT = trail[trail.length - 1]?.t ?? trailClock;
      strokeRun(trail, headT);
    }
  }

  function strokeRun(run: TrailPoint[], headT: number): void {
    const tail = run[0];
    const tip = run[run.length - 1];
    if (!tail || !tip || run.length < 2) return;
    if (Math.hypot(tip.x - tail.x, tip.y - tail.y) < 0.8) return;
    const gradient = ctx.createLinearGradient(tail.x, tail.y, tip.x, tip.y);
    const last = run.length - 1;
    for (let index = 0; index < run.length; index += 1) {
      const point = run[index];
      if (!point) continue;
      const age = clamp01((headT - point.t) / TRAIL);
      const remain = 1 - age;
      const alpha = remain * remain * 0.92;
      const color = mixRgb(WHITE, GUST_RED, point.gust);
      gradient.addColorStop(index / last, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`);
    }
    ctx.beginPath();
    ctx.moveTo(tail.x, tail.y);
    for (let index = 1; index < run.length; index += 1) {
      const point = run[index];
      if (point) ctx.lineTo(point.x, point.y);
    }
    ctx.strokeStyle = gradient;
    ctx.stroke();
  }

  function clipWater(): void {
    ctx.beginPath();
    for (const ring of rings) {
      ring.forEach((pair, index) => {
        const lng = pair[0];
        const lat = pair[1];
        if (lng === undefined || lat === undefined) return;
        const projected = map.project([lng, lat]);
        if (index === 0) ctx.moveTo(projected.x, projected.y);
        else ctx.lineTo(projected.x, projected.y);
      });
      ctx.closePath();
    }
    ctx.clip("evenodd");
  }

  function sizeCanvas(): void {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.min(4096, Math.round(canvas.clientWidth * ratio));
    const height = Math.min(4096, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}

function mixRgb(from: Rgb, to: Rgb, amount: number): Rgb {
  const t = clamp01(amount);
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
