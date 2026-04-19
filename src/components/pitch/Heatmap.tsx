import { useEffect, useRef } from "react";
import { Pitch } from "./Pitch";

interface Pt { x: number | null; y: number | null }
interface Props { points: Pt[]; color?: string; className?: string }

const PITCH_ASPECT = 100 / 64; // width / height of SVG viewBox

/**
 * Smooth canvas-based heatmap rendered as an overlay on the SVG pitch.
 * Uses a Gaussian kernel for density estimation — much smoother than the old rect grid.
 */
export function Heatmap({ points, color = "#3b82f6", className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const drawDensity = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = canvas.width;
    const H = canvas.height;
    if (W === 0 || H === 0) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);

    const validPts = points.filter((p) => p.x != null && p.y != null);
    if (validPts.length === 0) return;

    const sigma = Math.min(W, H) * 0.055;
    const kernelR = Math.ceil(sigma * 3);

    const density = new Float32Array(W * H);

    const pitchHCanvas = Math.min(H, W / PITCH_ASPECT);
    const pitchWCanvas = Math.min(W, H * PITCH_ASPECT);
    const offsetX = (W - pitchWCanvas) / 2;
    const offsetY = (H - pitchHCanvas) / 2;

    for (const p of validPts) {
      const px = offsetX + (p.x! / 100) * pitchWCanvas;
      const py = offsetY + (p.y! / 100) * pitchHCanvas;
      const minX = Math.max(0, Math.floor(px - kernelR));
      const maxX = Math.min(W - 1, Math.ceil(px + kernelR));
      const minY = Math.max(0, Math.floor(py - kernelR));
      const maxY = Math.min(H - 1, Math.ceil(py + kernelR));
      for (let ky = minY; ky <= maxY; ky++) {
        for (let kx = minX; kx <= maxX; kx++) {
          const dx = kx - px, dy = ky - py;
          density[ky * W + kx] += Math.exp(-(dx*dx + dy*dy) / (2 * sigma * sigma));
        }
      }
    }

    let maxDensity = 0;
    for (let i = 0; i < density.length; i++) if (density[i] > maxDensity) maxDensity = density[i];
    if (maxDensity === 0) return;

    const [br, bg, bb] = hexToRgb(color);
    const imageData = ctx.createImageData(W, H);
    const d = imageData.data;

    for (let i = 0; i < density.length; i++) {
      const t = density[i] / maxDensity;
      if (t < 0.01) continue;
      const [pr, pg, pb, alpha] = heatColor(t, br, bg, bb);
      const idx = i * 4;
      d[idx] = pr; d[idx+1] = pg; d[idx+2] = pb; d[idx+3] = alpha;
    }
    ctx.putImageData(imageData, 0, 0);
  };

  useEffect(() => { drawDensity(); }, [points, color]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const observer = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width = Math.round(width * (window.devicePixelRatio || 1));
      canvas.height = Math.round(height * (window.devicePixelRatio || 1));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      drawDensity();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [points, color]);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <Pitch interactive={false} className="h-full w-full" />
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 rounded"
        style={{ mixBlendMode: "screen", opacity: 0.82 }} />
    </div>
  );
}

function heatColor(t: number, baseR: number, baseG: number, baseB: number): [number,number,number,number] {
  if (t < 0.15) return [baseR, baseG, baseB, Math.round((t/0.15)*80)];
  if (t < 0.5) {
    const l = (t-0.15)/0.35;
    return [lerp(baseR,0,l), lerp(baseG,220,l), lerp(baseB,220,l), 80+l*80].map(Math.round) as any;
  }
  if (t < 0.75) {
    const l = (t-0.5)/0.25;
    return [lerp(0,255,l), 220, lerp(220,0,l), 160+l*40].map(Math.round) as any;
  }
  const l = (t-0.75)/0.25;
  return [255, lerp(220,30,l), 0, Math.min(255, 200+l*55)].map(Math.round) as any;
}

function lerp(a:number,b:number,t:number){return Math.round(a+(b-a)*t);}

function hexToRgb(color: string): [number,number,number] {
  if (color.startsWith("var(")) return [59,130,246];
  const hex = color.replace("#","");
  if (hex.length===3) return [parseInt(hex[0]+hex[0],16),parseInt(hex[1]+hex[1],16),parseInt(hex[2]+hex[2],16)];
  if (hex.length>=6) return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)];
  return [59,130,246];
}
