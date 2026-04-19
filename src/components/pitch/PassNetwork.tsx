import { Pitch, yToSvg } from "./Pitch";

interface Edge {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  count: number;
}
interface Node {
  x: number;
  y: number;
  count: number;
  label?: string;
}

/** Pass network: nodes are aggregated start positions, edges are pass connections. */
export function PassNetwork({
  edges,
  nodes,
  color = "var(--color-primary)",
  className,
}: {
  edges: Edge[];
  nodes: Node[];
  color?: string;
  className?: string;
}) {
  const maxEdge = edges.reduce((m, e) => Math.max(m, e.count), 1);
  const maxNode = nodes.reduce((m, n) => Math.max(m, n.count), 1);

  return (
    <Pitch interactive={false} className={className}>
      {edges.map((e, i) => {
        const w = 0.15 + (e.count / maxEdge) * 0.9;
        const o = 0.25 + (e.count / maxEdge) * 0.55;
        return (
          <line
            key={i}
            x1={e.fromX}
            y1={yToSvg(e.fromY)}
            x2={e.toX}
            y2={yToSvg(e.toY)}
            stroke={color}
            strokeWidth={w}
            opacity={o}
            strokeLinecap="round"
          />
        );
      })}
      {nodes.map((n, i) => {
        const r = 0.8 + (n.count / maxNode) * 2.4;
        return (
          <g key={i}>
            <circle
              cx={n.x}
              cy={yToSvg(n.y)}
              r={r}
              fill={color}
              stroke="oklch(0.18 0.02 255)"
              strokeWidth="0.3"
            />
            {n.label && (
              <text
                x={n.x}
                y={yToSvg(n.y) + r + 1.6}
                fill="oklch(1 0 0 / 0.85)"
                fontSize="1.6"
                textAnchor="middle"
                fontFamily="JetBrains Mono"
              >
                {n.label}
              </text>
            )}
          </g>
        );
      })}
    </Pitch>
  );
}
