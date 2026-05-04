import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, X, Download, Upload, QrCode, Camera, CheckCircle2,
  AlertTriangle, FileJson, Loader2, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import QRCodeSVG from "react-qr-code";
import jsQR from "jsqr";

async function compress(data: string): Promise<string> {
  try {
    const stream = new Blob([new TextEncoder().encode(data)])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    const buf = await new Response(stream).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  } catch {
    return btoa(encodeURIComponent(data));
  }
}

async function decompress(b64: string): Promise<string> {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  } catch {
    try { return decodeURIComponent(atob(b64)); } catch { return b64; }
  }
}

function collectExportData(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("ankigen-")) {
        const val = localStorage.getItem(key);
        if (val !== null) {
          try { out[key] = JSON.parse(val); } catch { out[key] = val; }
        }
      }
    }
  } catch {
    // localStorage may throw SecurityError in restricted contexts; return partial data
    return out;
  }
  return out;
}

function applyImportData(data: Record<string, unknown>) {
  for (const [key, val] of Object.entries(data)) {
    try {
      localStorage.setItem(key, typeof val === "string" ? val : JSON.stringify(val));
    } catch {
      // Individual key may exceed quota; skip and continue
    }
  }
}

const QR_BYTE_LIMIT = 2800;

function ExportPanel({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [state, setState] = useState<"idle" | "loading" | "qr" | "toolarge">("idle");
  const [compressed, setCompressed] = useState<string | null>(null);

  const generateQr = useCallback(async () => {
    setState("loading");
    try {
      const raw = JSON.stringify(collectExportData());
      const c = await compress(raw);
      setCompressed(c);
      if (c.length > QR_BYTE_LIMIT) {
        setState("toolarge");
        return;
      }
      setState("qr");
    } catch {
      toast({ title: "Export failed", description: "Could not generate QR code.", variant: "destructive" });
      setState("idle");
    }
  }, [toast]);

  const downloadFile = useCallback(() => {
    try {
      const raw = JSON.stringify(collectExportData(), null, 2);
      const blob = new Blob([raw], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `ankigen-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: "Backup downloaded", description: "All your decks and progress have been saved." });
      onClose();
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  }, [toast, onClose]);

  const copyText = useCallback(async () => {
    if (!compressed) return;
    try {
      await navigator.clipboard.writeText(`AGX:${compressed}`);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", description: "Could not access clipboard. Try saving the file instead.", variant: "destructive" });
    }
  }, [compressed, toast]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Export all your decks, cards, and study progress for backup or cross-device transfer.
      </p>

      {state === "idle" && (
        <div className="flex flex-col gap-2">
          <Button className="w-full gap-2" onClick={generateQr}>
            <QrCode className="h-4 w-4" /> Generate QR Code
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={downloadFile}>
            <FileJson className="h-4 w-4" /> Download JSON backup
          </Button>
        </div>
      )}

      {state === "loading" && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Compressing data…</span>
        </div>
      )}

      {state === "qr" && compressed && (
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-xl border border-border/60 bg-white p-3">
            <QRCodeSVG value={`AGX:${compressed}`} size={220} level="L" />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Scan this on your other device to import all data.
          </p>
          <div className="flex w-full gap-2">
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={copyText}>
              <Copy className="h-3.5 w-3.5" /> Copy code
            </Button>
            <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={downloadFile}>
              <FileJson className="h-3.5 w-3.5" /> Save file too
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setState("idle")}>
            ← Back
          </Button>
        </div>
      )}

      {state === "toolarge" && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Library too large for QR</p>
              <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-400/80">
                Your data ({Math.round(compressed!.length / 1024)}KB compressed) exceeds QR capacity (~2.8KB). Use file export instead.
              </p>
            </div>
          </div>
          <Button className="w-full gap-2" onClick={downloadFile}>
            <FileJson className="h-4 w-4" /> Download JSON backup
          </Button>
          <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setState("idle")}>
            ← Back
          </Button>
        </div>
      )}
    </div>
  );
}

function ImportPanel({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const applyPayload = useCallback(async (payload: string) => {
    try {
      const stripped = payload.startsWith("AGX:") ? payload.slice(4) : payload;
      const raw = await decompress(stripped);
      const data = JSON.parse(raw);
      applyImportData(data);
      setDone(true);
      toast({
        title: "Import successful",
        description: "All data imported. Reloading in 2 seconds…",
      });
      setTimeout(() => window.location.reload(), 2000);
    } catch {
      toast({ title: "Import failed", description: "Could not read QR data.", variant: "destructive" });
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      const tick = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
          stopCamera();
          applyPayload(code.data);
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCameraError(msg.includes("Permission") ? "Camera permission denied." : "Camera not available.");
      setScanning(false);
    }
  }, [applyPayload, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string;
        const data = JSON.parse(text);
        applyImportData(data);
        setDone(true);
        toast({
          title: "Import successful",
          description: "All data imported. Reloading in 2 seconds…",
        });
        setTimeout(() => window.location.reload(), 2000);
      } catch {
        toast({ title: "Invalid file", description: "Could not parse the backup file.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  }, [toast, applyPayload]);

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        <p className="text-center font-semibold">Import successful!</p>
        <p className="text-center text-sm text-muted-foreground">Reloading app with your data…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Import data from a QR code (scan from another device) or from a JSON backup file.
      </p>

      {!scanning && !cameraError && (
        <div className="flex flex-col gap-2">
          <Button className="w-full gap-2" onClick={startCamera}>
            <Camera className="h-4 w-4" /> Scan QR Code
          </Button>
          <Button variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Import from file
          </Button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileImport} />
        </div>
      )}

      {cameraError && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{cameraError}</p>
          </div>
          <Button variant="outline" className="w-full gap-2" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Import from file instead
          </Button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileImport} />
        </div>
      )}

      {scanning && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl bg-black aspect-square max-h-64">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-40 w-40 rounded-xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>
            <p className="absolute bottom-2 left-0 right-0 text-center text-xs font-medium text-white/80">
              Point camera at QR code
            </p>
          </div>
          <Button variant="outline" className="w-full" onClick={stopCamera}>
            Cancel scanning
          </Button>
        </div>
      )}
    </div>
  );
}

type Tab = "export" | "import";

export function SettingsSheet() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("export");

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        aria-label="Settings"
      >
        <Settings className="h-4 w-4" />
      </Button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
            >
              <div className="rounded-t-2xl border-t border-x border-border/60 bg-background/97 backdrop-blur-xl shadow-2xl">
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-base font-semibold">Settings</h2>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => setOpen(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex gap-1 px-5 pb-3">
                  {(["export", "import"] as Tab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-all ${
                        tab === t
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {t === "export" ? (
                        <span className="flex items-center justify-center gap-1.5"><Download className="h-3.5 w-3.5" /> Export</span>
                      ) : (
                        <span className="flex items-center justify-center gap-1.5"><Upload className="h-3.5 w-3.5" /> Import</span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="px-5 pb-6 min-h-[12rem]">
                  {tab === "export"
                    ? <ExportPanel onClose={() => setOpen(false)} />
                    : <ImportPanel onClose={() => setOpen(false)} />
                  }
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
