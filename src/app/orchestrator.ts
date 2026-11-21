/**
 * Decides which renderer draws. Exactly one WebGL renderer should draw at any moment; both draw only during a short
 * preheat (Cesium draws hidden so its first tiles load) and the crossfade. Pure logic: no DOM, no GPU, fully testable.
 * Altitudes in metres. hIn < hOut gives hysteresis, so hovering near the boundary does not flicker between engines.
 */
export interface OrchestratorConfig { hIn: number; hOut: number; preheatMs: number; crossfadeMs: number }
export interface StageFrame { mix: number; threeRendering: boolean; cesiumRendering: boolean; threeOpacity: number; cesiumOpacity: number; phase: 'three' | 'preheat' | 'crossfade' | 'cesium' }

export const DEFAULT_ORCHESTRATOR: OrchestratorConfig = { hIn: 4_000_000, hOut: 5_500_000, preheatMs: 300, crossfadeMs: 600 };

export class Orchestrator {
  private mix = 0; // 0 = only Three visible, 1 = only Cesium visible
  private target: 0 | 1 = 0;
  private preheatSince: number | null = null;
  private last: number | null = null;
  constructor(private cfg: OrchestratorConfig = DEFAULT_ORCHESTRATOR) {}

  update(altM: number, nowMs: number): StageFrame {
    const dt = this.last === null ? 0 : Math.max(0, nowMs - this.last);
    this.last = nowMs;
    if (this.target === 0 && altM < this.cfg.hIn) { this.target = 1; this.preheatSince = nowMs; }
    else if (this.target === 1 && altM > this.cfg.hOut) { this.target = 0; this.preheatSince = null; }
    const preheating = this.target === 1 && this.mix === 0 && this.preheatSince !== null && nowMs - this.preheatSince < this.cfg.preheatMs;
    if (!preheating) {
      const step = dt / this.cfg.crossfadeMs;
      this.mix = this.target === 1 ? Math.min(1, this.mix + step) : Math.max(0, this.mix - step);
    }
    const cesiumRendering = this.target === 1 || this.mix > 0;
    const threeRendering = this.mix < 1;
    const phase = this.mix >= 1 ? 'cesium' : this.mix > 0 ? 'crossfade' : cesiumRendering ? 'preheat' : 'three';
    return { mix: this.mix, threeRendering, cesiumRendering, threeOpacity: 1 - this.mix, cesiumOpacity: this.mix, phase };
  }
}
