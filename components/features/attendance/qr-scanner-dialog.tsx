"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { checkInMember } from "@/lib/actions/attendance.actions";
import { ScanLine, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

const SCANNER_ELEMENT_ID = "atp-fitness-qr-scanner";

export function QrScannerDialog({ 
  open, 
  onOpenChange, 
  onSuccess 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  onSuccess: () => void 
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isRunningRef = useRef(false);
  const [status, setStatus] = useState<"scanning" | "processing" | "success" | "error">("scanning");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStatus("scanning");
    setMessage(null);

    let cancelled = false;
    let rafId: number | null = null;

    const safeStop = async (scanner: Html5Qrcode) => {
      // html5-qrcode throws if you call stop() when it isn't actually
      // running/paused — guard with our own tracked flag rather than
      // trusting the caller to know the internal state.
      if (!isRunningRef.current) return;
      isRunningRef.current = false;
      await scanner.stop().catch(() => {});
    };

    const tryStart = () => {
      if (cancelled) return;

      const el = document.getElementById(SCANNER_ELEMENT_ID);
      if (!el) {
        rafId = requestAnimationFrame(tryStart);
        return;
      }

      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
      scannerRef.current = scanner;

      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 240 },
          async (decodedText) => {
            if (cancelled) return;
            setStatus((prev) => (prev === "processing" || prev === "success" ? prev : "processing"));

            await safeStop(scanner);
            if (cancelled) return;

            try {
              const parsed = JSON.parse(decodedText);
              const gps = await getGpsCoords();
              const result = await checkInMember({
                gymId: parsed.gymId,
                bucket: parsed.bucket,
                token: parsed.token,
                gps,
              });
              if (cancelled) return;

              if (!result.success) {
                setStatus("error");
                setMessage(result.error);
              } else {
                setStatus("success");
                setMessage(result.data?.gpsVerified ? "Checked in — location verified." : "Checked in!");
                setTimeout(() => {
                  onSuccess();
                  onOpenChange(false);
                }, 1500);
              }
            } catch {
              if (!cancelled) {
                setStatus("error");
                setMessage("That doesn't look like a valid ATP Fitness check-in code.");
              }
            }
          },
          () => {} // ignore per-frame scan failures
        )
        .then(() => {
          if (cancelled) {
            // Effect was cleaned up while start() was still resolving —
            // stop immediately instead of leaving the camera running.
            safeStop(scanner);
          } else {
            isRunningRef.current = true;
          }
        })
        .catch(() => {
          if (!cancelled) {
            setStatus("error");
            setMessage("Could not access the camera. Check your browser permissions.");
          }
        });
    };

    rafId = requestAnimationFrame(tryStart);

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) safeStop(scanner);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md overflow-hidden border-border/40 bg-background/80 p-6 shadow-2xl backdrop-blur-2xl">
        <DialogHeader className="text-center sm:text-left">
          <DialogTitle className="text-xl font-bold tracking-tight">Scan to check in</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Point your camera at the QR code on the front-desk screen.
          </DialogDescription>
        </DialogHeader>

        {/* Viewfinder Container */}
        <div className="relative mx-auto mt-2 w-full max-w-[280px] overflow-hidden rounded-2xl border border-border/40 bg-muted/20 shadow-inner sm:max-w-[320px]">
          
          {/* Frosted overlay when not actively scanning */}
          {status !== "scanning" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-md transition-all duration-500">
              {status === "processing" && (
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-primary shadow-[0_0_20px_rgba(var(--primary),0.3)]">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-20"></span>
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              )}
              {status === "success" && (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/20 text-success shadow-[0_0_20px_rgba(var(--success),0.3)] animate-in zoom-in duration-300">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
              )}
              {status === "error" && (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/20 text-destructive shadow-[0_0_20px_rgba(var(--destructive),0.3)] animate-in zoom-in duration-300">
                  <AlertCircle className="h-8 w-8" />
                </div>
              )}
            </div>
          )}

          {/* HTML5-QRCode injects raw DOM here, so we keep it clean */}
          <div id={SCANNER_ELEMENT_ID} className="w-full" />
        </div>

        {/* Status Badges */}
        <div className="mt-4 flex min-h-[48px] flex-col items-center justify-center">
          {status === "scanning" && (
            <div className="flex animate-pulse items-center gap-2 rounded-full bg-secondary/40 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur-md">
              <ScanLine className="h-4 w-4" /> Looking for a QR code...
            </div>
          )}
          
          {status === "processing" && (
            <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-medium text-primary backdrop-blur-md">
              Verifying location & checking in...
            </div>
          )}
          
          {status === "success" && (
            <div className="flex items-center gap-2 rounded-full border border-success/20 bg-success/10 px-4 py-2 text-xs font-medium text-success backdrop-blur-md">
              {message}
            </div>
          )}
          
          {status === "error" && (
            <div className="flex w-full flex-col items-center gap-3 animate-in slide-in-from-bottom-2">
              <div className="text-center text-sm font-medium text-destructive px-2">
                {message}
              </div>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                className="rounded-full border-border/50 bg-background/50 px-6 backdrop-blur-md hover:bg-muted/50"
              >
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getGpsCoords(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 4000 }
    );
  });
}