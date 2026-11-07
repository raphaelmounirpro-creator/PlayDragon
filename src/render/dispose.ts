import { Material, Mesh, Object3D, Texture } from 'three';

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof Texture && !value.userData.shared) value.dispose();
  }
  material.dispose();
}

/** Frees the GPU memory of everything under `root` (textures marked `userData.shared` are kept). */
export function disposeObject(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as Mesh;
    mesh.geometry?.dispose();
    if (!mesh.material) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) disposeMaterial(material);
  });
}
