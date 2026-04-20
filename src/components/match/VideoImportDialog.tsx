import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Upload, Film, HardDrive, Cloud, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  matchId: string;
  onImported: (info: {
    video_url: string;
    video_storage: "local" | "cloud";
    video_duration_sec: number | null;
  }) => void;
}

const MAX_LOCAL_MB = 2048; // 2GB hard cap
const MAX_CLOUD_MB = 500;  // safer for upload

export function VideoImportDialog({ open, onClose, matchId, onImported }: Props) {
  const [mode, setMode] = useState<"local" | "cloud">("local");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      toast.error("File must be a video");
      return;
    }
    setFile(f);
  };

  const reset = () => {
    setFile(null);
    setProgress(0);
    setUploading(false);
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  // Get video duration via temporary <video> element
  const probeDuration = (f: File): Promise<number | null> =>
    new Promise((resolve) => {
      const url = URL.createObjectURL(f);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = url;
      v.onloadedmetadata = () => {
        const d = isFinite(v.duration) ? v.duration : null;
        URL.revokeObjectURL(url);
        resolve(d);
      };
      v.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
    });

  const handleSubmit = async () => {
    if (!file) return;
    const sizeMB = file.size / (1024 * 1024);

    if (mode === "local" && sizeMB > MAX_LOCAL_MB) {
      toast.error(`File too large for local mode (max ${MAX_LOCAL_MB} MB)`);
      return;
    }
    if (mode === "cloud" && sizeMB > MAX_CLOUD_MB) {
      toast.error(`File too large for cloud upload (max ${MAX_CLOUD_MB} MB)`);
      return;
    }

    setUploading(true);
    setProgress(5);

    try {
      const duration = await probeDuration(file);
      setProgress(15);

      if (mode === "local") {
        const url = URL.createObjectURL(file);
        onImported({ video_url: url, video_storage: "local", video_duration_sec: duration });
        toast.success("Video loaded locally");
        reset();
        onClose();
        return;
      }

      // Cloud upload
      const ext = file.name.split(".").pop() || "mp4";
      const path = `${matchId}/${Date.now()}.${ext}`;
      setProgress(30);

      const { error: upErr } = await supabase.storage
        .from("match-videos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      setProgress(85);

      const { data: signed, error: signErr } = await supabase.storage
        .from("match-videos")
        .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year
      if (signErr) throw signErr;

      setProgress(100);
      onImported({
        video_url: signed.signedUrl,
        video_storage: "cloud",
        video_duration_sec: duration,
      });
      toast.success("Video uploaded to cloud");
      reset();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Import Match Video</DialogTitle>
        </DialogHeader>

        {/* Drop zone */}
        {!file ? (
          <div
            className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-background/40 p-8 transition-colors hover:border-primary/50 hover:bg-primary/5"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files[0]);
            }}
          >
            <Film className="size-10 text-muted-foreground" />
            <div className="text-center text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Click to browse</span> or drag & drop an MP4
              <div className="mt-1 text-xs">Up to 2 GB locally · 500 MB to cloud</div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        ) : (
          <div className="space-y-3 rounded-md border border-border bg-background/40 p-3 text-xs">
            <div className="flex items-center gap-2">
              <Film className="size-4 text-primary" />
              <span className="flex-1 truncate font-medium">{file.name}</span>
              <span className="font-mono text-muted-foreground">
                {(file.size / (1024 * 1024)).toFixed(1)} MB
              </span>
            </div>
            {!uploading && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setFile(null)}
              >
                Choose different file
              </button>
            )}
          </div>
        )}

        {/* Mode picker */}
        {file && !uploading && (
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as "local" | "cloud")}
            className="gap-2"
          >
            <Label
              htmlFor="local"
              className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-surface/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <RadioGroupItem value="local" id="local" className="mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <HardDrive className="size-3.5" /> Local only (this device)
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Instant load, no upload, but lost on refresh and tied to this device.
                </div>
              </div>
            </Label>
            <Label
              htmlFor="cloud"
              className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-surface/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <RadioGroupItem value="cloud" id="cloud" className="mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Cloud className="size-3.5" /> Upload to cloud
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Persistent across devices. Required for AI auto-scan.
                </div>
              </div>
            </Label>
          </RadioGroup>
        )}

        {/* Warning for local + AI */}
        {file && !uploading && mode === "local" && (
          <div className="flex items-start gap-2 rounded bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Local videos can't be sent to AI auto-scan. Upload to cloud for that.
          </div>
        )}

        {uploading && (
          <div className="space-y-2">
            <Progress value={progress} />
            <div className="text-center text-xs text-muted-foreground">
              {progress < 30 ? "Reading file…" : progress < 85 ? "Uploading…" : "Finalizing…"}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!file || uploading}>
            <Upload className="mr-1.5 size-3.5" />
            {mode === "local" ? "Load video" : "Upload"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
