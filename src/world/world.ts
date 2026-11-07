import { CatmullRomCurve3, Color, DirectionalLight, Fog, Group, HemisphereLight, Object3D, Scene, Texture } from 'three';
import { disposeObject } from '../render/dispose';
import type { Renderer } from '../render/renderer';
import { Castle } from './castle';
import { createClouds } from './clouds';
import { Landscape } from './landscape';
import type { LevelDefinition } from './levels';
import { Obstacles } from './obstacles';
import { createRiver } from './river';
import { Sky } from './sky';
import { createTerrain } from './terrain';
import { createVillages } from './village';

function createLights(level: LevelDefinition): Object3D[] {
  const { lighting } = level;
  const key = new DirectionalLight(lighting.key, lighting.keyIntensity);
  key.position.copy(level.sunDirection).multiplyScalar(1000);
  const fill = new DirectionalLight(lighting.fill, lighting.fillIntensity);
  fill.position.set(-300, 400, 800);
  const ambient = new HemisphereLight(lighting.sky, lighting.ground, lighting.ambientIntensity);
  return [key, key.target, fill, ambient];
}

/** Everything that belongs to one level: land, sky, light, castle and the obstacles on the way. */
export class World {
  readonly group = new Group();
  readonly landscape: Landscape;
  readonly curve: CatmullRomCurve3;
  readonly castle: Castle;
  readonly obstacles: Obstacles;
  readonly sky: Sky;
  private environment: Texture | null = null;

  constructor(readonly level: LevelDefinition) {
    this.landscape = new Landscape(level.terrain);
    this.curve = this.landscape.createFlightCurve();
    this.sky = new Sky(level.sky, level.sunDirection);
    this.castle = new Castle(this.landscape.castlePosition(), this.landscape, level.castle);
    this.obstacles = new Obstacles(this.curve);
    this.group.add(
      this.sky.mesh,
      createTerrain(this.landscape, level.terrain),
      createRiver(this.landscape, level.water),
      createClouds(this.landscape, level.cloudTint),
      createVillages(this.landscape),
      this.castle.group,
      this.obstacles.group,
      ...createLights(level),
    );
  }

  attach(scene: Scene, renderer: Renderer): void {
    const { fog, lighting } = this.level;
    scene.fog = new Fog(fog.color, fog.near, fog.far);
    scene.background = new Color(fog.color);
    this.environment = renderer.createEnvironment(this.sky);
    scene.environment = this.environment;
    scene.environmentIntensity = lighting.environment;
    renderer.setExposure(lighting.exposure);
    scene.add(this.group);
  }

  detach(scene: Scene): void {
    scene.remove(this.group);
    disposeObject(this.group);
    this.environment?.dispose();
  }
}
