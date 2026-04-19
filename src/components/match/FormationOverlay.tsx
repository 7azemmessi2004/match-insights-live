import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { yToSvg } from "@/components/pitch/Pitch";

// Known formations with player positions (x=0-100, y=0-100)
const FORMATIONS: Record<string, { label: string; positions: { x: number; y: number; role: string }[] }> = {
  "4-3-3": {
    label: "4-3-3",
    positions: [
      { x: 5, y: 50, role: "GK" },
      { x: 25, y: 15, role: "LB" },
      { x: 25, y: 38, role: "CB" },
      { x: 25, y: 62, role: "CB" },
      { x: 25, y: 85, role: "RB" },
      { x: 50, y: 25, role: "CM" },
      { x: 50, y: 50, role: "CM" },
      { x: 50, y: 75, role: "CM" },
      { x: 78, y: 20, role: "LW" },
      { x: 80, y: 50, role: "ST" },
      { x: 78, y: 80, role: "RW" },
    ],
  },
  "4-4-2": {
    label: "4-4-2",
    positions: [
      { x: 5, y: 50, role: "GK" },
      { x: 25, y: 15, role: "LB" },
      { x: 25, y: 38, role: "CB" },
      { x: 25, y: 62, role: "CB" },
      { x: 25, y: 85, role: "RB" },
      { x: 50, y: 15, role: "LM" },
      { x: 50, y: 38, role: "CM" },
      { x: 50, y: 62, role: "CM" },
      { x: 50, y: 85, role: "RM" },
      { x: 78, y: 38, role: "ST" },
      { x: 78, y: 62, role: "ST" },
    ],
  },
  "4-2-3-1": {
    label: "4-2-3-1",
    positions: [
      { x: 5, y: 50, role: "GK" },
      { x: 25, y: 15, role: "LB" },
      { x: 25, y: 38, role: "CB" },
      { x: 25, y: 62, role: "CB" },
      { x: 25, y: 85, role: "RB" },
      { x: 42, y: 35, role: "DM" },
      { x: 42, y: 65, role: "DM" },
      { x: 60, y: 20, role: "LW" },
      { x: 60, y: 50, role: "AM" },
      { x: 60, y: 80, role: "RW" },
      { x: 80, y: 50, role: "ST" },
    ],
  },
  "3-5-2": {
    label: "3-5-2",
    positions: [
      { x: 5, y: 50, role: "GK" },
      { x: 25, y: 28, role: "CB" },
      { x: 25, y: 50, role: "CB" },
      { x: 25, y: 72, role: "CB" },
      { x: 50, y: 10, role: "LWB" },
      { x: 45, y: 32, role: "CM" },
      { x: 45, y: 50, role: "CM" },
      { x: 45, y: 68, role: "CM" },
      { x: 50, y: 90, role: "RWB" },
      { x: 78, y: 35, role: "ST" },
      { x: 78, y: 65, role: "ST" },
    ],
  },
  "5-3-2": {
    label: "5-3-2",
    positions: [
      { x: 5, y: 50, role: "GK" },
      { x: 25, y: 10, role: "LWB" },
      { x: 28, y: 28, role: "CB" },
      { x: 28, y: 50, role: "CB" },
      { x: 28, y: 72, role: "CB" },
      { x: 25, y: 90, role: "RWB" },
      { x: 50, y: 28, role: "CM" },
      { x: 50, y: 50, role: "CM" },
      { x: 50, y: 72, role: "CM" },
      { x: 78, y: 35, role: "ST" },
      { x: 78, y: 65, role: "ST" },
    ],
  },
};

export interface FormationData {
  key: string;
  label: string;
  team: "home" | "away";
  imageUrl?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (data: FormationData) => void;
  homeTeamName: string;
  awayTeamName: string;
}

export function FormationDialog({ open, onClose, onApply, homeTeamName, awayTeamName }: Props) {
  const [selected, setSelected] = useState<string>("4-3-3");
  const [team, setTeam] = useState<"home" | "away">("home");
  const [imageUrl, setImageUrl] = useState("");

  const handleApply = () => {
    onApply({ key: selected, label: selected, team, imageUrl: imageUrl || undefined });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Set Formation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Team</Label>
            <div className="flex gap-2">
              {(["home", "away"] as const).map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={team === t ? "default" : "ghost"}
                  className="flex-1"
                  onClick={() => setTeam(t)}
                >
                  {t === "home" ? homeTeamName : awayTeamName}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Formation</Label>
            <div className="grid grid-cols-3 gap-2">
              {Object.keys(FORMATIONS).map((key) => (
                <Button
                  key={key}
                  size="sm"
                  variant={selected === key ? "default" : "outline"}
                  className="font-mono text-xs"
                  onClick={() => setSelected(key)}
                >
                  {key}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Or paste an image URL (optional)</Label>
            <Input
              className="h-8 text-xs"
              placeholder="https://…"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleApply}>Apply Formation</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface OverlayProps {
  formation: FormationData;
  color: string;
  mirror?: boolean; // away team faces right-to-left
}

/** SVG overlay showing formation player dots on the pitch */
export function FormationOverlay({ formation, color, mirror }: OverlayProps) {
  const schema = FORMATIONS[formation.key];
  if (!schema) return null;

  return (
    <>
      {schema.positions.map((pos, i) => {
        const x = mirror ? 100 - pos.x : pos.x;
        const y = pos.y;
        return (
          <g key={i}>
            <circle
              cx={x}
              cy={yToSvg(y)}
              r="2.2"
              fill={color}
              opacity={0.7}
              stroke="white"
              strokeWidth="0.3"
            />
            <text
              x={x}
              y={yToSvg(y) + 0.5}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize="1.4"
              fontWeight="bold"
              style={{ pointerEvents: "none" }}
            >
              {pos.role}
            </text>
          </g>
        );
      })}
    </>
  );
}
