import { Pitch, yToSvg } from "./Pitch";

interface Pt { x: number | null; y: number | null }
interface Props { points: Pt[]; color?: string; className?: string }

/** Quick CPU-friendly heatmap built from binned events. */
export function Heatmap({ points, color = "var(--color-primary)", className }: Props) {
  const cols = 24;
  const rows = 16;
  const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  let max = 0;
  for (const p of points) {
    if (p.x == null || p.y == null) continue;
    const cx = Math.min(cols - 1, Math.floor((p.x / 100) * cols));
    const cy = Math.min(rows - 1, Math.floor((p.y / 100) * rows));
    grid[cy][cx]++;
    if (grid[cy][cx] > max) max = grid[cy][cx];
  }
  const cw = 100 / cols;
  const ch = 100 / rows;

  return (
    <Pitch interactive={false} className={className}>
      {grid.flatMap((row, ry) =>
        row.map((v, rx) => {
          if (v === 0) return null;
          const intensity = max ? v / max : 0;
          return (
            <rect
              key={`${rx}-${ry}`}
              x={rx * cw}
              y={yToSvg(ry * ch)}
              width={cw}
              height={yToSvg(ch)}
              fill={color}
              opacity={0.15 + intensity * 0.7}
              style={{ filter: `blur(0.6px)` }}
            />
          );
        })
      )}
    </Pitch>
  );
}
