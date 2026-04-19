import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertTriangle, CheckCircle2, FileJson, FileText } from "lucide-react";
import { readImportFile, type ImportedEvent } from "@/lib/import-data";

interface Props {
  open: boolean;
  onClose: () => void;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId: string;
  awayTeamId: string;
  onImport: (events: ImportedEvent[], teamMapping: Record<"home" | "away", string>) => void;
}

export function ImportDialog({
  open, onClose, homeTeamName, awayTeamName, homeTeamId, awayTeamId, onImport,
}: Props) {
  const [parsed, setParsed] = useState<ImportedEvent[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const result = await readImportFile(file);
      setParsed(result.events);
      setWarnings(result.warnings);
      setFileName(file.name);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = () => {
    onImport(parsed, { home: homeTeamId, away: awayTeamId });
    onClose();
    setParsed([]);
    setWarnings([]);
    setFileName(null);
  };

  const handleClose = () => {
    onClose();
    setParsed([]);
    setWarnings([]);
    setFileName(null);
  };

  // Preview — show first 5 events
  const preview = parsed.slice(0, 5);
  const homeCount = parsed.filter((e) => e._team_hint === "home").length;
  const awayCount = parsed.filter((e) => e._team_hint === "away").length;
  const unknownCount = parsed.length - homeCount - awayCount;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Import Match Data</DialogTitle>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-background/40 p-6 transition-colors hover:border-primary/50 hover:bg-primary/5"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-8 text-muted-foreground" />
          <div className="text-center text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Click to browse</span> or drag & drop
            <div className="mt-0.5 text-xs">Accepts JSON or CSV</div>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="gap-1 text-[10px]">
              <FileJson className="size-3" /> JSON
            </Badge>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <FileText className="size-3" /> CSV
            </Badge>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".json,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>

        {/* Loading */}
        {loading && (
          <div className="py-4 text-center text-sm text-muted-foreground">Parsing file…</div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-1">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 rounded bg-warning/10 px-3 py-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {w}
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {parsed.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-green-400" />
              <span className="font-medium">{parsed.length} events parsed</span>
              {fileName && <span className="text-muted-foreground">from {fileName}</span>}
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">{homeCount} → {homeTeamName}</Badge>
              <Badge variant="outline">{awayCount} → {awayTeamName}</Badge>
              {unknownCount > 0 && (
                <Badge variant="outline" className="text-muted-foreground">
                  {unknownCount} team unknown (will be assigned to home)
                </Badge>
              )}
            </div>

            {/* Preview table */}
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-surface">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-2 py-1.5">Min</th>
                    <th className="px-2 py-1.5">Type</th>
                    <th className="px-2 py-1.5">Outcome</th>
                    <th className="px-2 py-1.5">Player</th>
                    <th className="px-2 py-1.5">Team</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((e, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1.5 font-mono">{e.minute}:{String(e.second).padStart(2,"0")}</td>
                      <td className="px-2 py-1.5 capitalize">{e.event_type}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{e.outcome ?? "—"}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {(e.metadata.player_name as string) ?? "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        {e._team_hint === "home" ? homeTeamName : e._team_hint === "away" ? awayTeamName : "?"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.length > 5 && (
                <div className="border-t border-border px-2 py-1.5 text-center text-xs text-muted-foreground">
                  +{parsed.length - 5} more events
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button size="sm" onClick={handleImport} disabled={parsed.length === 0}>
            Import {parsed.length > 0 ? `(${parsed.length} events)` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
