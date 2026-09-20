"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QrScannerDialog } from "./qr-scanner-dialog";
import { checkOutMember } from "@/lib/actions/attendance.actions";
import type { AttendanceRecord } from "@/types/database";
import { ScanLine, LogOut, Clock, MapPin, Activity } from "lucide-react";

export function MemberAttendanceView({
  checkedIn,
  session,
  history,
}: {
  checkedIn: boolean;
  session: AttendanceRecord | null;
  history: AttendanceRecord[];
}) {
  const router = useRouter();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleCheckOut() {
    startTransition(async () => {
      await checkOutMember();
      router.refresh();
    });
  }

  return (
    <div className="space-y-8 p-1 sm:p-2">
      {/* Status Card - Glassmorphic */}
      <Card 
        className={`relative overflow-hidden border backdrop-blur-xl shadow-lg transition-all duration-500 ${
          checkedIn 
            ? "border-success/30 bg-success/10 shadow-success/5" 
            : "border-border/40 bg-card/30 hover:bg-card/40 hover:shadow-xl"
        }`}
      >
        {/* Ambient background glow for active state */}
        {checkedIn && (
          <div className="absolute -left-12 -top-12 h-40 w-40 rounded-full bg-success/20 blur-3xl animate-pulse" />
        )}

        <CardContent className="relative z-10 flex flex-col items-center gap-5 p-8 sm:p-10 text-center">
          {checkedIn && session ? (
            <>
              {/* Active Pulse Icon */}
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success shadow-inner">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-20"></span>
                <Clock className="h-7 w-7" />
              </div>
              
              <div className="space-y-1.5">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  You're checked in
                </h2>
                <div className="flex flex-col items-center justify-center gap-2 sm:flex-row text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5 rounded-full bg-background/50 px-3 py-1 backdrop-blur-md">
                    <Activity className="h-3.5 w-3.5 text-success" />
                    Since {format(new Date(session.check_in_at), "h:mm a")}
                  </span>
                  
                  {session.gps_verified && (
                    <span className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 font-medium text-success backdrop-blur-md">
                      <MapPin className="h-3.5 w-3.5" /> Verified
                    </span>
                  )}
                </div>
              </div>

              <Button
                variant="outline"
                size="lg"
                onClick={handleCheckOut}
                loading={isPending}
                className="mt-2 w-full max-w-xs border-border/50 bg-background/50 backdrop-blur-md transition-all hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" /> Check out
              </Button>
            </>
          ) : (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary shadow-[0_0_15px_rgba(var(--primary),0.2)]">
                <ScanLine className="h-7 w-7" />
              </div>
              
              <div className="space-y-1">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  Not checked in
                </h2>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Ready for a workout? Scan the QR code at the front desk to check in.
                </p>
              </div>

              <Button 
                size="lg" 
                onClick={() => setScannerOpen(true)}
                className="mt-2 w-full max-w-xs shadow-lg shadow-primary/25 transition-transform active:scale-95"
              >
                <ScanLine className="mr-2 h-5 w-5" /> Scan to check in
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* History Table Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold tracking-tight">Recent visits</h3>
        
        {history.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center rounded-2xl border border-border/40 bg-card/30 shadow-sm backdrop-blur-xl transition-all">
            <p className="text-sm text-muted-foreground">
              No visits recorded yet.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/40 bg-card/30 shadow-lg backdrop-blur-xl transition-all">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="border-b border-border/40 bg-secondary/20 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3.5 font-medium">Date</th>
                    <th className="px-5 py-3.5 font-medium">Check in</th>
                    <th className="px-5 py-3.5 font-medium">Check out</th>
                    <th className="px-5 py-3.5 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {history.map((h) => (
                    <tr 
                      key={h.id} 
                      className="transition-colors hover:bg-muted/10 group"
                    >
                      <td className="px-5 py-4 font-medium text-foreground">
                        {format(new Date(h.check_in_at), "dd MMM yyyy")}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {format(new Date(h.check_in_at), "h:mm a")}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {h.check_out_at ? (
                          format(new Date(h.check_out_at), "h:mm a")
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-success font-medium">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                            </span>
                            Active now
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {h.duration_minutes != null ? (
                          <span className="rounded-md bg-secondary/40 px-2.5 py-1 text-xs font-medium text-foreground backdrop-blur-md">
                            {h.duration_minutes} min
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <QrScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}