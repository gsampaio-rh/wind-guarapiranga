import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapView,
} from "maplibre-gl";
import { smoothedWaterFeature as water } from "../data/waterGeometry";
import { buildWaterMesh } from "./waterMesh";

const mesh = buildWaterMesh(water.geometry.coordinates);
const CLEARANCE_M = 1.2;

const VERTEX = `#version 300 es
precision highp float;
uniform mat4 u_matrix;
in vec3 a_pos;
out vec3 v_pos;
void main() {
  gl_Position = u_matrix * vec4(a_pos, 1.0);
  v_pos = a_pos;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform float u_time;
uniform vec3 u_cam;
in vec3 v_pos;
out vec4 fragColor;

float wave(vec2 p) {
  return sin(p.x * 900000.0 + p.y * 280000.0 + u_time * 1.5)
    + 0.7 * sin(p.y * 1100000.0 - u_time * 1.2)
    + 0.45 * sin((p.x - p.y) * 640000.0 + u_time * 0.85);
}

void main() {
  float step = 0.0000012;
  float height = wave(v_pos.xy);
  float dx = wave(v_pos.xy + vec2(step, 0.0)) - height;
  float dy = wave(v_pos.xy + vec2(0.0, step)) - height;
  vec3 normal = normalize(vec3(-dx * 28.0, -dy * 28.0, 1.0));
  vec3 viewDir = normalize(u_cam - v_pos);
  float facing = clamp(dot(normal, viewDir), 0.0, 1.0);
  float fresnel = pow(1.0 - facing, 2.4);
  vec3 deep = vec3(0.02, 0.24, 0.38);
  vec3 shoal = vec3(0.10, 0.48, 0.58);
  vec3 sky = vec3(0.72, 0.86, 0.90);
  float swell = 0.5 + 0.5 * sin(height);
  vec3 color = mix(deep, shoal, swell);
  vec3 light = normalize(vec3(-0.35, 0.55, 0.76));
  vec3 halfVec = normalize(light + viewDir);
  float spec = pow(clamp(dot(normal, halfVec), 0.0, 1.0), 64.0);
  color = mix(color, sky, fresnel * 0.72);
  color += vec3(0.75, 0.9, 0.95) * spec;
  float alpha = mix(0.9, 0.78, fresnel);
  fragColor = vec4(color * alpha, alpha);
}`;

class WaterLayer implements CustomLayerInterface {
  id = "water-surface";
  type = "custom" as const;
  renderingMode = "3d" as const;

  private map: MapView | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private positions = new Float32Array(mesh.lng.length * 3);
  private count = mesh.indices.length;
  private enabled = true;
  private drape = true;
  private dirty = true;
  private resampleUntil = 0;
  private failed = false;
  private reduceMotion = false;
  private matrix = new Float32Array(16);
  private camera = new Float32Array(3);

  onAdd(map: MapView, gl: WebGL2RenderingContext): void {
    this.map = map;
    this.gl = gl;
    this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const program = linkProgram(gl, VERTEX, FRAGMENT);
    if (!program) {
      this.failed = true;
      return;
    }
    this.program = program;
    const positions = gl.createBuffer();
    const indices = gl.createBuffer();
    const vao = gl.createVertexArray();
    if (!positions || !indices || !vao) {
      this.failed = true;
      return;
    }
    this.positionBuffer = positions;
    this.vao = vao;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, positions);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  onRemove(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.program) gl.deleteProgram(this.program);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.program = null;
    this.positionBuffer = null;
    this.vao = null;
  }

  setViewpoint(lng: number, lat: number, altitude: number): void {
    const coord = MercatorCoordinate.fromLngLat([lng, lat], altitude);
    this.camera[0] = coord.x;
    this.camera[1] = coord.y;
    this.camera[2] = coord.z;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.map?.triggerRepaint();
  }

  setDrape(drape: boolean): void {
    if (this.drape === drape) return;
    this.drape = drape;
    this.invalidate();
  }

  invalidate(): void {
    this.dirty = true;
    this.resampleUntil = performance.now() + 1000;
    this.map?.triggerRepaint();
  }

  render(gl: WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    if (!this.enabled || this.failed || !this.program || !this.vao || !this.positionBuffer) return;
    if (this.dirty || performance.now() < this.resampleUntil) this.sample(gl);
    copyMatrix(options.defaultProjectionData.mainMatrix, this.matrix);

    gl.bindVertexArray(this.vao);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.program, "u_matrix"), false, this.matrix);
    gl.uniform1f(gl.getUniformLocation(this.program, "u_time"), this.reduceMotion ? 0 : performance.now() / 1000);
    gl.uniform3fv(gl.getUniformLocation(this.program, "u_cam"), this.camera);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(-2, -2);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindVertexArray(null);
    if (!this.reduceMotion) this.map?.triggerRepaint();
  }

  private sample(gl: WebGL2RenderingContext): void {
    if (!this.positionBuffer) return;
    const terrain = this.drape && this.map?.getTerrain() != null;
    let found = !terrain;
    for (let index = 0; index < mesh.lng.length; index += 1) {
      const lng = mesh.lng[index] ?? 0;
      const lat = mesh.lat[index] ?? 0;
      let meters = 0;
      if (terrain && this.map) {
        const elevation = this.map.queryTerrainElevation([lng, lat]);
        if (elevation != null) {
          meters = elevation + CLEARANCE_M;
          found = true;
        } else {
          meters = CLEARANCE_M;
        }
      }
      const coord = MercatorCoordinate.fromLngLat([lng, lat], meters);
      this.positions[index * 3] = coord.x;
      this.positions[index * 3 + 1] = coord.y;
      this.positions[index * 3 + 2] = coord.z;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positions);
    if (found) this.dirty = false;
  }
}

export const waterSurface = new WaterLayer();

function linkProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram | null {
  const program = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  if (!program || !vs || !fs) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, "a_pos");
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function copyMatrix(source: ArrayLike<number>, target: Float32Array): void {
  for (let index = 0; index < 16; index += 1) target[index] = source[index] ?? 0;
}
