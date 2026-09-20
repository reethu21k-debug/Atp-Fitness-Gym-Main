"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Check, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CameraCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File) => void;
}

/**
 * Opens the device camera in a live preview (via getUserMedia) inside a
 * dialog, lets the user snap a photo, review it, retake if needed, and
 * confirm — at which point the captured frame is handed back as a File
 * ready to feed into the existing upload pipeline.
 *
 * Falls back gracefully with an error message if the browser/device has no
 * camera or the user denies permission (e.g. desktop browsers without a
 * webcam, or camera access blocked).
 */
export function CameraCaptureDialog({ open, onOpenChange, onCapture }: CameraCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  // Start the camera whenever the dialog opens; always stop it on close/unmount
  // so the browser's camera indicator light turns off and the device is freed.
  useEffect(() => {
    if (!open) {
      stopStream();
      setCapturedUrl(null);
      setCapturedBlob(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setStarting(true);
    setError(null);

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Couldn't access the camera. Check your browser's camera permission, or use \"Choose from device\" instead.");
        }
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });

    return () => {
      cancelled = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setCapturedUrl(URL.createObjectURL(blob));
        stopStream(); // freeze the frame, release the camera while reviewing
      },
      "image/jpeg",
      0.92
    );
  }

  function handleRetake() {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
    setCapturedBlob(null);
    // Restart the camera for another shot.
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setError("Couldn't restart the camera. Try closing and reopening this dialog."));
  }

  function handleUsePhoto() {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture(file);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-6 p-6">
        <DialogHeader>
          <DialogTitle className="text-xl">Take a photo</DialogTitle>
          <DialogDescription>
            {capturedUrl ? "Review your photo below before saving." : "Line up your shot, then tap Capture."}
          </DialogDescription>
        </DialogHeader>

        {/* Camera Viewfinder */}
        <div className="group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl bg-black shadow-inner ring-1 ring-border/20">
          {error ? (
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="rounded-full bg-destructive/20 p-3">
                <Camera className="h-6 w-6 text-destructive" />
              </div>
              <p className="text-sm font-medium text-destructive">{error}</p>
            </div>
          ) : capturedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capturedUrl} alt="Captured preview" className="h-full w-full object-cover transition-opacity duration-300" />
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              
              {/* Viewfinder overlay corners */}
              {!starting && (
                <div className="pointer-events-none absolute inset-0 p-6 opacity-60 transition-opacity group-hover:opacity-100">
                  <div className="absolute left-6 top-6 h-10 w-10 rounded-tl-xl border-l-4 border-t-4 border-white/70" />
                  <div className="absolute right-6 top-6 h-10 w-10 rounded-tr-xl border-r-4 border-t-4 border-white/70" />
                  <div className="absolute bottom-6 left-6 h-10 w-10 rounded-bl-xl border-b-4 border-l-4 border-white/70" />
                  <div className="absolute bottom-6 right-6 h-10 w-10 rounded-br-xl border-b-4 border-r-4 border-white/70" />
                </div>
              )}

              {/* Loading Overlay */}
              {starting && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm transition-all">
                  <Loader2 className="h-8 w-8 animate-spin text-white/90" />
                  <span className="animate-pulse text-sm font-medium tracking-wide text-white/90">
                    Starting camera...
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Hidden canvas used only to grab a still frame from the video stream. */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Actions */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:gap-2 mt-2">
          {error ? (
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : capturedUrl ? (
            <div className="flex w-full gap-3 sm:w-auto sm:gap-2">
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={handleRetake}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Retake
              </Button>
              <Button className="flex-1 sm:flex-none" onClick={handleUsePhoto}>
                <Check className="mr-2 h-4 w-4" />
                Use photo
              </Button>
            </div>
          ) : (
            <Button 
              size="lg" 
              className="w-full font-semibold sm:w-auto" 
              onClick={handleCapture} 
              disabled={starting}
            >
              <Camera className="mr-2 h-5 w-5" />
              Capture
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}