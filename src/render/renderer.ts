import {
  ACESFilmicToneMapping,
  Camera,
  Mesh,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector2,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Sky } from '../world/sky';

/** Warm sunset grade with a soft vignette, applied before tone mapping. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      vec3 shadows = vec3(0.32, 0.16, 0.22);
      vec3 highlights = vec3(1.08, 0.94, 0.78);
      color = mix(color * mix(vec3(1.0), shadows * 2.4, 0.35), color * highlights, smoothstep(0.0, 0.8, luma));
      float vignette = smoothstep(1.15, 0.35, length(vUv - 0.5) * 1.4);
      gl_FragColor = vec4(color * mix(0.55, 1.0, vignette), 1.0);
    }
  `,
};

export class Renderer {
  readonly webgl: WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;

  constructor(container: HTMLElement, scene: Scene, camera: Camera) {
    this.webgl = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.webgl.outputColorSpace = SRGBColorSpace;
    this.webgl.toneMapping = ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = 0.9;
    container.appendChild(this.webgl.domElement);

    this.composer = new EffectComposer(this.webgl);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new Vector2(window.innerWidth, window.innerHeight), 0.5, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new ShaderPass(GradeShader));
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  /** Image-based lighting baked from the level's sky, so scales and water reflect it. */
  createEnvironment(sky: Sky): Texture {
    const skyScene = new Scene();
    skyScene.add(new Mesh(sky.mesh.geometry, sky.mesh.material));
    const generator = new PMREMGenerator(this.webgl);
    const environment = generator.fromScene(skyScene, 0.04, 0.1, 5000).texture;
    generator.dispose();
    return environment;
  }

  setExposure(exposure: number): void {
    this.webgl.toneMappingExposure = exposure;
  }

  resize(): void {
    this.webgl.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.bloom.resolution.set(window.innerWidth / 2, window.innerHeight / 2);
  }

  render(): void {
    this.composer.render();
  }
}
