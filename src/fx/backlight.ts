import { Color, MeshStandardMaterial, Vector3 } from 'three';

/** Sun direction in view space, shared by every backlit material and refreshed each frame. */
export const sunInView = { value: new Vector3(0, 0, -1) };

interface BacklightOptions {
  /** Golden glow along the silhouette (Fresnel). */
  rimColor: Color;
  rimPower: number;
  /** Warm light passing through thin parts when the sun is behind them (wing membranes). */
  transmission?: Color;
}

/**
 * Adds the sunset backlighting of the reference painting to a standard material:
 * a golden rim on the silhouette, and optionally light glowing through the surface.
 */
export function addBacklight(material: MeshStandardMaterial, options: BacklightOptions): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: options.rimColor };
    shader.uniforms.rimPower = { value: options.rimPower };
    shader.uniforms.transmissionColor = { value: options.transmission ?? new Color(0, 0, 0) };
    shader.uniforms.sunInView = sunInView;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 rimColor;\nuniform float rimPower;\nuniform vec3 transmissionColor;\nuniform vec3 sunInView;',
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 toCamera = normalize(vViewPosition);
        float facing = abs(dot(normal, toCamera));
        float towardSun = max(dot(-toCamera, sunInView), 0.0);
        totalEmissiveRadiance += rimColor * pow(1.0 - facing, rimPower) * (0.35 + 0.65 * towardSun);
        totalEmissiveRadiance += transmissionColor * diffuseColor.rgb * pow(towardSun, 4.0);`,
      );
  };
}
