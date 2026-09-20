"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Receipt, 
  Wallet,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Banknote,
  Smartphone,
  Landmark,
  SplitSquareHorizontal,
  Loader2,
  FileX
} from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { listPayments } from "@/lib/actions/payment.actions";

const METHOD_FILTERS = [
  { value: "all", label: "All methods" },
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank" },
  { value: "split", label: "Split" },
];

const getMethodIcon = (method: string) => {
  switch (method.toLowerCase()) {
    case "cash": return <Banknote className="h-3 w-3" />;
    case "upi": return <Smartphone className="h-3 w-3" />;
    case "card": return <CreditCard className="h-3 w-3" />;
    case "bank": return <Landmark className="h-3 w-3" />;
    case "split": return <SplitSquareHorizontal className="h-3 w-3" />;
    default: return <Wallet className="h-3 w-3" />;
  }
};

export function PaymentsTable({ basePath }: { basePath: string }) {
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const { data, isLoading } = useQuery({
    queryKey: ["payments", { page, search, method }],
    queryFn: () => listPayments({ page, pageSize, search, method }),
    placeholderData: keepPreviousData,
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data?.total ?? 0) / pageSize)),
    [data?.total],
  );
  
  const totalCollected = useMemo(
    () =>
      (data?.rows ?? [])
        .filter((r) => !r.is_refunded)
        .reduce((sum, r) => sum + r.total_amount, 0),
    [data?.rows],
  );

  return (
    <div className="space-y-6">
      
      {/* Top Action Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        
        {/* Filters */}
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm flex-1 group">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input
              placeholder="Search invoice, receipt, member…"
              className="h-11 rounded-xl border-border/40 bg-card/40 pl-10 shadow-sm backdrop-blur-md transition-all hover:bg-card/60 focus:bg-background"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setPage(1);
            }}
            className="h-11 rounded-xl border border-border/40 bg-card/40 px-4 text-sm shadow-sm backdrop-blur-md transition-all hover:bg-card/60 focus:bg-background"
          >
            {METHOD_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </div>

        {/* Total Metric Card */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/40 bg-card/40 px-5 py-2.5 shadow-sm backdrop-blur-md sm:w-fit">
          <div className="flex flex-col text-right">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Page Total
            </span>
            <span className="font-mono text-lg font-bold text-foreground">
              ₹{totalCollected.toFixed(2)}
            </span>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 shadow-inner">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/40 shadow-2xl backdrop-blur-2xl">
        
        {/* Ambient Glows */}
        <div className="absolute -left-32 -top-32 -z-10 h-64 w-64 rounded-full bg-primary/5 blur-[100px]" />
        <div className="absolute -bottom-32 -right-32 -z-10 h-64 w-64 rounded-full bg-secondary/10 blur-[100px]" />

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border/40 bg-secondary/20">
              <tr className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Member</th>
                <th className="px-6 py-4">Plan</th>
                <th className="px-6 py-4">Method</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4">Invoice #</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              
              {/* Loading State */}
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <p className="text-sm font-medium">Loading payments…</p>
                    </div>
                  </td>
                </tr>
              )}

              {/* Empty State */}
              {!isLoading && (data?.rows.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/30">
                        <FileX className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-medium">No payments found for this filter.</p>
                    </div>
                  </td>
                </tr>
              )}

              {/* Data Rows */}
              {data?.rows.map((p) => (
                <tr
                  key={p.id}
                  className="group transition-colors hover:bg-muted/10"
                >
                  <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                    {format(new Date(p.created_at), "dd MMM yyyy")}
                  </td>
                  <td className="px-6 py-4 font-medium text-foreground">
                    {p.member_name}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {p.plan_name ?? "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-secondary/30 px-2.5 py-1 text-xs font-medium capitalize text-foreground backdrop-blur-md">
                      {getMethodIcon(p.method)}
                      {p.method}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-medium text-foreground">
                    ₹{p.total_amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                    {p.invoice_number}
                  </td>
                  <td className="px-6 py-4">
                    {p.is_refunded ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive backdrop-blur-md">
                        <AlertCircle className="h-3 w-3" /> Refunded
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 backdrop-blur-md dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Paid
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`${basePath}/${p.id}/invoice`}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-border/40 bg-background/50 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-md transition-all hover:bg-primary hover:text-primary-foreground hover:shadow-md"
                    >
                      <Receipt className="h-3.5 w-3.5" /> 
                      <span className="hidden sm:inline">View</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-border/40 bg-card/40 px-5 py-3 shadow-sm backdrop-blur-md sm:flex-row">
        <span className="text-sm font-medium text-muted-foreground">
          Showing page <span className="text-foreground">{page}</span> of <span className="text-foreground">{totalPages}</span>
          <span className="mx-2 hidden sm:inline">·</span>
          <span className="block sm:inline">{data?.total ?? 0} total payments</span>
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-full bg-background/50 backdrop-blur-md hover:bg-muted/50"
          >
            <ChevronLeft className="h-4 w-4 sm:mr-1" /> 
            <span className="hidden sm:inline">Previous</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-full bg-background/50 backdrop-blur-md hover:bg-muted/50"
          >
            <span className="hidden sm:inline">Next</span> 
            <ChevronRight className="h-4 w-4 sm:ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}