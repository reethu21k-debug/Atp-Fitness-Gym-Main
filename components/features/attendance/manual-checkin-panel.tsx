"use client";

import { useEffect, useState, useTransition } from "react";
import { Search, UserCheck, UserX, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  searchMembersForCheckIn,
  manualCheckIn,
  manualCheckOut,
  type CheckInMemberOption,
} from "@/lib/actions/attendance.actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function ManualCheckInPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CheckInMemberOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [justChangedId, setJustChangedId] = useState<{ id: string; action: "in" | "out" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(() => {
      startTransition(async () => {
        const rows = await searchMembersForCheckIn(query);
        setResults(rows);
        setSearching(false);
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  async function handleCheckIn(member: CheckInMemberOption) {
    setError(null);
    setPendingId(member.memberId);
    const result = await manualCheckIn(member.memberId);
    setPendingId(null);

    if (!result.success) {
      setError(result.error);
      return;
    }
    setResults((prev) =>
      prev.map((m) => (m.memberId === member.memberId ? { ...m, alreadyCheckedIn: true } : m))
    );
    setJustChangedId({ id: member.memberId, action: "in" });
    setTimeout(() => setJustChangedId(null), 2500);
  }

  async function handleCheckOut(member: CheckInMemberOption) {
    setError(null);
    setPendingId(member.memberId);
    const result = await manualCheckOut(member.memberId);
    setPendingId(null);

    if (!result.success) {
      setError(result.error);
      return;
    }
    setResults((prev) =>
      prev.map((m) => (m.memberId === member.memberId ? { ...m, alreadyCheckedIn: false } : m))
    );
    setJustChangedId({ id: member.memberId, action: "out" });
    setTimeout(() => setJustChangedId(null), 2500);
  }

  return (
    <Card className="border-border/40 bg-card/30 shadow-lg backdrop-blur-xl transition-all duration-300">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <UserCheck className="h-5 w-5 text-primary" /> 
          Manual Check-in
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          For members without their phone — search by name or number to log them in directly.
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Search Input - Glassmorphic styling */}
        <div className="relative group">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search member by name or phone…"
            className="pl-10 h-11 rounded-xl bg-background/50 backdrop-blur-md border-border/50 shadow-inner focus-visible:ring-primary/30 transition-all"
          />
          
          {/* Inline Loading Spinner */}
          {(searching || isPending) && query.trim().length >= 2 && (
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Error State */}
        {error && (
          <div className="flex items-center gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive backdrop-blur-md animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Empty State */}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-border/40 bg-muted/5 text-sm text-muted-foreground animate-in fade-in">
            No members found.
          </div>
        )}

        {/* Results List */}
        {results.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border/40 bg-card/20 shadow-sm backdrop-blur-md animate-in fade-in slide-in-from-top-2">
            <ul className="divide-y divide-border/20">
              {results.map((member) => {
                const justChanged = justChangedId?.id === member.memberId ? justChangedId.action : null;
                
                return (
                  <li 
                    key={member.memberId} 
                    className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4 transition-colors hover:bg-muted/10 group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {member.fullName}
                      </p>
                      <p className="truncate text-xs font-medium text-muted-foreground mt-0.5">
                        {member.phone ?? "No phone on file"}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                      {justChanged ? (
                        <Badge 
                          variant={justChanged === "in" ? "success" : "secondary"} 
                          className="shrink-0 animate-in zoom-in duration-300 shadow-sm py-1.5"
                        >
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> 
                          {justChanged === "in" ? "Checked in" : "Checked out"}
                        </Badge>
                      ) : member.alreadyCheckedIn ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="success" className="bg-success/15 text-success hover:bg-success/20 border-0 py-1.5 shadow-none hidden sm:flex">
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Active
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-background/50 backdrop-blur-sm hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                            disabled={pendingId === member.memberId}
                            onClick={() => handleCheckOut(member)}
                          >
                            {pendingId === member.memberId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <UserX className="mr-2 h-4 w-4" /> Check out
                              </>
                            )}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          className="shrink-0 shadow-sm transition-transform active:scale-95"
                          disabled={pendingId === member.memberId}
                          onClick={() => handleCheckIn(member)}
                        >
                          {pendingId === member.memberId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Check in"
                          )}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}