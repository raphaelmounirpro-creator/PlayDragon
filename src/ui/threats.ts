import { Camera, Vector3 } from 'three';

export type ThreatKind = 'enemy' | 'boss' | 'projectile';

export interface Threat {
  position: Vector3;
  kind: ThreatKind;
}

const MAX_ARROWS = 8;
const EDGE_X = 0.92;
const EDGE_Y = 0.84;

/** Arrows at the edge of the screen pointing at dangers that are out of view (behind, beside). */
export class ThreatIndicators {
  private readonly arrows: HTMLElement[] = [];
  private readonly local = new Vector3();
  private readonly projected = new Vector3();

  constructor(container: HTMLElement) {
    for (let i = 0; i < MAX_ARROWS; i++) {
      const arrow = document.createElement('div');
      arrow.className = 'threat';
      arrow.hidden = true;
      container.appendChild(arrow);
      this.arrows.push(arrow);
    }
  }

  update(threats: Threat[], camera: Camera): void {
    let used = 0;
    for (const threat of threats) {
      if (used >= MAX_ARROWS) break;
      this.local.copy(threat.position).applyMatrix4(camera.matrixWorldInverse);
      this.projected.copy(threat.position).project(camera);
      const inFront = this.local.z < 0;
      if (inFront && Math.abs(this.projected.x) <= 0.95 && Math.abs(this.projected.y) <= 0.95) continue;
      // Camera-space direction: correct on every side, including straight behind.
      let x = this.local.x;
      let y = this.local.y;
      if (Math.hypot(x, y) < 1e-3) y = -1;
      const scale = 1 / Math.max(Math.abs(x) / EDGE_X, Math.abs(y) / EDGE_Y);
      x *= scale;
      y *= scale;
      const arrow = this.arrows[used++];
      arrow.className = `threat threat--${threat.kind}`;
      arrow.style.left = `${(x + 1) * 50}%`;
      arrow.style.top = `${(1 - y) * 50}%`;
      arrow.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(-y, x)}rad)`;
      arrow.hidden = false;
    }
    for (let i = used; i < MAX_ARROWS; i++) this.arrows[i].hidden = true;
  }

  hide(): void {
    for (const arrow of this.arrows) arrow.hidden = true;
  }
}
