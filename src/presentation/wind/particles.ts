import type { Map as MapView } from "maplibre-gl";
import type { BoundsGrid } from "../../domain/geo";
import { gridCenter, offsetMeters } from "../../domain/geo";
import { inReservoir } from "../../domain/water";
import {
  armGust,
  gustFrequencyFactor,
  gustHoldFactor,
  rainGustFrequencyBoost,
  rainGustHoldBoost,
  restingGustState,
  tickGust,
  type GustState,
} from "../../domain/wind/gust";
import {
  blendSpeed,
  fetchFactor,
  gustRatio,
  localGustBias,
  pickWaterPoint,
  randomLife,
  speedScale,
} from "../../domain/wind/particle";
import { speedToColor } from "./windColor";

const MEAN_COUNT = 420;
const MIN_ADAPTIVE_COUNT = 60;
const TRAIL = 0.5;
const KNOT_PX = 9;

type LngLat = { lng: number; lat: number };

export type WindSample = {
  u: number;
  v: number;
  mean: number;
  gust: number;
  direction: number;
  /** Fator orográfico já aplicado em mean/gust/u/v (1 = sem toggle ligado); usado só para localizar a rajada. */
  terrain?: number;
  /** F7: fator de curvatura da margem já aplicado em mean/gust/u/v (1 = sem toggle ligado); usado só para localizar a rajada. */
  curvature?: number;
  /** F12: fator de rugosidade da margem já aplicado em mean/gust/u/v (1 = sem toggle ligado/sem dado de OSM); usado só para localizar a rajada. */
  roughness?: number;
  /** Chuva (mm/h) da hora, pelo catálogo — usada só para a rajada ficar mais frequente, não afeta a cor/velocidade. */
  rain?: number;
  /** F11: magnitude (nós) da brisa de lago já somada em mean/gust/u/v (0 = sem toggle ligado); estimativa, exibida só no readout. */
  breeze?: number;
};
export type SampleWind = (lng: number, lat: number) => WindSample | null;

type TrailPoint = { x: number; y: number; t: number; speed: number };

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
  step(
    dt: number,
    sampleWind: SampleWind,
    gustsOn: boolean,
    waterFetchOn?: boolean,
    shoreCurvatureOn?: boolean,
    shoreRoughnessOn?: boolean,
    adaptiveDensityOn?: boolean,
  ): void;
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
  let activeCount = MEAN_COUNT;
  const particles = Array.from({ length: MEAN_COUNT }, () => spawnParticle());

  return {
    setGustsOn(active) {
      for (const particle of particles) particle.gust = armGust(active);
    },
    step(
      dt,
      sampleWind,
      gustsOn,
      waterFetchOn = false,
      shoreCurvatureOn = false,
      shoreRoughnessOn = false,
      adaptiveDensityOn = false,
    ) {
      if (waterCells.length === 0) return;
      updateActiveCount(adaptiveDensityOn);
      spawnBudget = 80;
      trailClock += dt;
      if (cameraMoved()) {
        for (let index = 0; index < activeCount; index += 1) particles[index].trail = [];
      }
      for (let index = 0; index < activeCount; index += 1) {
        stepParticle(particles[index], dt, sampleWind, gustsOn, waterFetchOn, shoreCurvatureOn, shoreRoughnessOn);
      }
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

  /**
   * F6: com o toggle ligado, o número de partículas ativas acompanha a área de
   * água visível no viewport (em células do grid), em vez do MEAN_COUNT fixo.
   * As partículas fora da faixa ativa continuam existindo no pool, só não são
   * simuladas nem desenhadas — evita realocar o array a cada zoom/resize.
   */
  function updateActiveCount(adaptiveDensityOn: boolean): void {
    const previous = activeCount;
    activeCount = adaptiveDensityOn ? targetParticleCount() : MEAN_COUNT;
    for (let index = previous; index < activeCount; index += 1) particles[index].trail = [];
  }

  function targetParticleCount(): number {
    if (waterCells.length === 0) return MEAN_COUNT;
    const visible = visibleWaterCellCount();
    const density = MEAN_COUNT / waterCells.length;
    return Math.max(MIN_ADAPTIVE_COUNT, Math.min(MEAN_COUNT, Math.round(density * visible)));
  }

  function visibleWaterCellCount(): number {
    const margin = 64;
    let count = 0;
    for (const cell of waterCells) {
      const center = gridCenter(grid, cell.col, cell.row);
      const projected = map.project([center.lng, center.lat]);
      if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) continue;
      if (
        projected.x >= -margin &&
        projected.y >= -margin &&
        projected.x <= canvas.clientWidth + margin &&
        projected.y <= canvas.clientHeight + margin
      ) {
        count += 1;
      }
    }
    return count;
  }

  function stepParticle(
    particle: Particle,
    dt: number,
    sampleWind: SampleWind,
    gustsOn: boolean,
    waterFetchOn: boolean,
    shoreCurvatureOn: boolean,
    shoreRoughnessOn: boolean,
  ): void {
    const place = { lng: particle.lng, lat: particle.lat };
    const sample = sampleWind(place.lng, place.lat);
    if (!sample || particle.age >= particle.life || !onWater(place)) {
      recycle(particle);
      return;
    }
    const mean = sample.mean;
    const gust = Math.max(mean, sample.gust);
    const fetch = waterFetchOn ? fetchFactor(rings, place, sample.direction) : 1;
    // Local, frequência e duração da rajada vêm de sinais reais, não de ruído:
    // a razão rajada/vento-médio da própria hora decide o quanto ela se repete
    // e quanto tempo sustenta o pico; o relevo (orográfico) e a proximidade da
    // margem (fetch curto) decidem onde ela é mais provável. Com os toggles
    // correspondentes desligados, esses fatores já chegam neutros (1) — então
    // a rajada cai de volta no comportamento uniforme por partícula.
    const ratio = gustRatio(mean, gust);
    const bias = localGustBias(
      sample.terrain ?? 1,
      fetch,
      waterFetchOn,
      sample.curvature ?? 1,
      shoreCurvatureOn,
      sample.roughness ?? 1,
      shoreRoughnessOn,
    );
    const rain = sample.rain ?? 0;
    const frequency = gustFrequencyFactor(ratio, bias) * rainGustFrequencyBoost(rain);
    const hold = gustHoldFactor(ratio) * rainGustHoldBoost(rain);
    const envelope = tickGust(particle.gust, dt, gustsOn, frequency, hold);
    const speed = blendSpeed(mean, gust, envelope);
    const scale = speedScale(mean, speed);
    // Velocidade efetiva mostrada na cor: já inclui rajada (via envelope, acima)
    // e aceleração por fetch — tudo que pode acelerar o traço também o esquenta
    // na escala fraco→forte, sem precisar de uma lógica própria por controle.
    const displaySpeed = speed * fetch;
    const moved = moveOnScreen(place, sample.u * scale * fetch, sample.v * scale * fetch, dt);
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
    particle.trail.push({ x: head.x, y: head.y, t: trailClock, speed: displaySpeed });
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
    for (let index = 0; index < activeCount; index += 1) {
      const trail = particles[index].trail;
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
      const color = speedToColor(point.speed);
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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
