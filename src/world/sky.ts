import { BackSide, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import type { SkyPalette } from './levels';

const vertexShader = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = clip.xyww;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 sunDirection;
  uniform float time;
  uniform vec3 zenith, upper, horizon, below, glow, halo, disc;
  uniform vec3 cloudShadow, cloudLight, cloudRim, cloudThin;
  uniform float discInner, discOuter, stars;
  varying vec3 vDirection;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float sum = 0.0; float amp = 0.5;
    for (int i = 0; i < 6; i++) { sum += noise(p) * amp; p = p * 2.02 + vec2(1.7, 9.2); amp *= 0.5; }
    return sum;
  }

  void main() {
    vec3 dir = normalize(vDirection);
    float height = dir.y;
    float sunAmount = max(dot(dir, sunDirection), 0.0);

    vec3 color = mix(horizon, upper, smoothstep(0.0, 0.22, height));
    color = mix(color, zenith, smoothstep(0.22, 0.8, height));
    color = mix(color, below, smoothstep(0.0, -0.2, height));
    color += glow * pow(sunAmount, 14.0);
    color += halo * pow(sunAmount, 3.0);

    // Painterly cloud masses: dark bodies, molten edges where the light grazes them
    vec2 uv = dir.xz / max(height + 0.1, 0.04);
    float cloud = fbm(uv * vec2(0.8, 1.9) + vec2(time * 0.004, 0.0));
    float cover = smoothstep(0.42, 0.66, cloud) * smoothstep(-0.02, 0.05, height) * (1.0 - smoothstep(0.55, 0.95, height));
    float rim = smoothstep(0.5, 0.72, cloud) - smoothstep(0.72, 0.9, cloud);
    vec3 litCloud = mix(cloudShadow, cloudLight, pow(sunAmount, 2.0)) + cloudRim * rim * pow(sunAmount, 12.0);
    litCloud += cloudThin * (1.0 - smoothstep(0.55, 0.8, cloud));
    color = mix(color, litCloud, cover * 0.9);

    // Stars on clear night skies, gently twinkling
    vec2 sphere = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0))) * 160.0;
    float seed = hash(floor(sphere));
    float star = step(0.986, seed) * smoothstep(0.45, 0.0, length(fract(sphere) - 0.5));
    star *= 0.6 + 0.4 * sin(time * 2.0 + seed * 60.0);
    color += vec3(1.3, 1.1, 1.0) * star * stars * smoothstep(0.03, 0.25, height) * (1.0 - cover);

    // Sun or moon disc, bright enough for the bloom pass to turn it into a halo
    float mottle = 0.82 + 0.18 * noise(dir.xy * 520.0);
    color += disc * mottle * smoothstep(discInner, discOuter, sunAmount);

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Sky {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  constructor(palette: SkyPalette, sunDirection: Vector3) {
    const uniforms: Record<string, { value: unknown }> = { sunDirection: { value: sunDirection.clone() }, time: { value: 0 } };
    for (const [name, value] of Object.entries(palette)) uniforms[name] = { value };
    this.material = new ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: BackSide, depthWrite: false });
    this.mesh = new Mesh(new SphereGeometry(1000, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  update(cameraPosition: Vector3, time: number): void {
    this.mesh.position.copy(cameraPosition);
    this.material.uniforms.time.value = time;
  }
}
