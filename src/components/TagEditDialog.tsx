import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Trash2, Save } from "lucide-react";
import { EVENT_TYPES } from "@/lib/tagging";

export const BODY_PARTS = [
  { value: "right_foot", label: "Right Foot" },
  { value: "left_foot", label: "Left Foot" },
  { value: "head", label: "Head" },
  { value: "chest", label: "Chest" },
  { value: "other", label: "Other" },
];

export interface EditableEvent {
  id: string;
  event_type: string;
  outcome: string | null;
  minute: number;
  second: number;
  tags: string[];
  metadata: Record<string, unknown>;
}

interface Props {
  event: EditableEvent | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, patch: Partial<EditableEvent>) => void;
  onDelete: (id: string) => void;
}

export function TagEditDialog({ event, open, onClose, onSave, onDelete }: Props) {
  const [eventType, setEventType] = useState(event?.event_type ?? "pass");
  const [outcome, setOutcome] = useState(event?.outcome ?? "");
  const [minute, setMinute] = useState(event?.minute ?? 0);
  const [second, setSecond] = useState(event?.second ?? 0);
  const [playerName, setPlayerName] = useState((event?.metadata?.player_name as string) ?? "");
  const [playerNumber, setPlayerNumber] = useState(
    (event?.metadata?.player_number as number | undefined)?.toString() ?? ""
  );
  const [bodyPart, setBodyPart] = useState((event?.metadata?.body_part as string) ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync state when event changes
  const key = event?.id ?? "none";

  if (!event) return null;

  const handleSave = () => {
    const metadata = {
      ...event.metadata,
      player_name: playerName || undefined,
      player_number: playerNumber ? Number(playerNumber) : undefined,
      body_part: bodyPart || undefined,
    };
    onSave(event.id, { event_type: eventType, outcome: outcome || null, minute, second, metadata });
    onClose();
  };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    onDelete(event.id);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setConfirmDelete(false); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Edit Tag</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Event type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.type} value={t.type}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Outcome</Label>
              <Input
                className="h-8"
                placeholder="e.g. goal, on_target"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Minute</Label>
              <Input
                className="h-8 font-mono"
                type="number" min={0} max={120}
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Second</Label>
              <Input
                className="h-8 font-mono"
                type="number" min={0} max={59}
                value={second}
                onChange={(e) => setSecond(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Player details
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Player name</Label>
                <Input
                  className="h-8"
                  placeholder="e.g. Salah"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Jersey #</Label>
                <Input
                  className="h-8 font-mono"
                  type="number" min={1} max={99}
                  placeholder="11"
                  value={playerNumber}
                  onChange={(e) => setPlayerNumber(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-2 space-y-1">
              <Label className="text-xs text-muted-foreground">Body part</Label>
              <Select value={bodyPart} onValueChange={setBodyPart}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {BODY_PARTS.map((b) => (
                    <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            size="sm"
            variant={confirmDelete ? "destructive" : "ghost"}
            onClick={handleDelete}
            className="gap-1.5"
          >
            <Trash2 className="size-3.5" />
            {confirmDelete ? "Confirm delete?" : "Delete"}
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} className="gap-1.5">
              <Save className="size-3.5" /> Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
