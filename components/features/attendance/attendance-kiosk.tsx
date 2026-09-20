"use client";

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { RefreshCw, AlertCircle, Smartphone } from "lucide-react";

interface QrPayload {
  gymId: string;
  bucket: number;
  token: string;
  expiresAt: number;
}

const WINDOW_MS = 20_000;

export function AttendanceKiosk({ gymName }: { gymName: string }) {
  const [payload, setPayload] = useState<QrPayload | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function fetchToken() {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/attendance/qr-token", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load QR code.");
      setPayload(await res.json());
      setError(null);
    } catch {
      setError("Could not refresh the QR code. Retrying…");
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    fetchToken();
    const refreshInterval = setInterval(fetchToken, WINDOW_MS);
    return () => clearInterval(refreshInterval);
  }, []);

  useEffect(() => {
    if (!payload) return;
    const tick = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((payload.expiresAt - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(tick);
  }, [payload]);

  const qrValue = payload 
    ? JSON.stringify({ gymId: payload.gymId, bucket: payload.bucket, token: payload.token }) 
    : "";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center justify-center gap-8 rounded-[2.5rem] border border-border/40 bg-card/30 p-8 sm:p-12 text-center shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-xl transition-all duration-500">
      
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          {gymName}
        </h2>
        <p className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
          <Smartphone className="h-4 w-4" />
          Scan from ATP Fitness app
        </p>
      </div>

      {/* QR Code Container */}
      <div className="relative group w-full flex justify-center">
        {/* Outer glowing glass ring */}
        <div className="absolute -inset-2 rounded-[2.5rem] bg-primary/20 opacity-50 blur-xl transition-opacity duration-500 group-hover:opacity-75"></div>
        
        {/* Inner high-contrast box for scanning reliability (Scanners fail on glass/dark backgrounds) */}
        <div className="relative flex aspect-square w-full max-w-[280px] items-center justify-center rounded-[2rem] border border-border/50 bg-white p-6 shadow-xl backdrop-blur-2xl transition-all">
          {payload ? (
            <div className={`w-full transition-opacity duration-300 ${isRefreshing ? 'opacity-40' : 'opacity-100'}`}>
              <QRCode
                value={qrValue}
                size={256}
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                viewBox={`0 0 256 256`}
              />
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl bg-muted/10">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground/50" />
              <span className="text-sm font-medium text-muted-foreground">Generating...</span>
            </div>
          )}
        </div>
      </div>

      {/* Status, Timer, & Error */}
      <div className="flex w-full flex-col items-center gap-4">
        
        {/* Pill Badge */}
        <div className="inline-flex items-center gap-2.5 rounded-full border border-border/40 bg-secondary/40 px-5 py-2.5 text-sm font-medium shadow-sm backdrop-blur-md transition-colors">
          <RefreshCw className={`h-4 w-4 ${isRefreshing || !payload ? 'animate-spin text-primary' : 'text-muted-foreground'}`} />
          <span className="text-foreground/80">
            {payload ? `Refreshes in ${secondsLeft}s` : 'Connecting...'}
          </span>
        </div>

        {/* Visual Progress Bar */}
        {payload && (
          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-secondary/50">
            <div 
              className="h-full rounded-full bg-primary transition-all duration-250 ease-linear"
              style={{ width: `${(secondsLeft / (WINDOW_MS / 1000)) * 100}%` }}
            />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}