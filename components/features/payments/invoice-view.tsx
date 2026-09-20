"use client";

import { format } from "date-fns";
import { 
  Printer, 
  MapPin, 
  Phone, 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  Receipt,
  Wallet,
  CreditCard
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaymentsOverviewRow, PaymentSplit } from "@/types/database";

interface GymInfo { 
  name: string; 
  address: string | null; 
  city: string | null; 
  phone: string | null; 
  email: string | null;
}

export function InvoiceView({ 
  payment, 
  splits, 
  gym 
}: { 
  payment: PaymentsOverviewRow; 
  splits: PaymentSplit[]; 
  gym: GymInfo | null 
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-2 sm:p-4 print:p-0">
      {/* Action Bar (Hidden when printing) */}
      <div className="flex justify-end print:hidden">
        <Button 
          onClick={() => window.print()}
          className="rounded-full border border-border/40 bg-background/50 px-6 shadow-sm backdrop-blur-md transition-all hover:bg-muted/50 hover:shadow-md"
          variant="outline"
        >
          <Printer className="mr-2 h-4 w-4" /> Print Invoice
        </Button>
      </div>

      {/* Main Invoice Card - Glassmorphic on screen, standard on print */}
      <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/40 p-8 shadow-2xl backdrop-blur-2xl print:rounded-none print:border-none print:bg-white print:p-0 print:shadow-none print:backdrop-blur-none sm:p-12">
        
        {/* Ambient Screen Glows (Hidden on print) */}
        <div className="absolute -left-20 -top-20 -z-10 h-64 w-64 rounded-full bg-primary/10 blur-[80px] print:hidden" />
        <div className="absolute -bottom-20 -right-20 -z-10 h-64 w-64 rounded-full bg-secondary/20 blur-[80px] print:hidden" />

        {/* Header Section */}
        <div className="flex flex-col justify-between gap-8 border-b border-border/40 pb-8 print:border-gray-200 sm:flex-row sm:items-start">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground print:text-black">
              {gym?.name ?? "ATP Fitness"}
            </h1>
            <div className="space-y-1.5 text-sm text-muted-foreground print:text-gray-600">
              {gym?.address && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 opacity-70" />
                  {gym.address}{gym.city ? `, ${gym.city}` : ""}
                </p>
              )}
              {gym?.phone && (
                <p className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 opacity-70" />
                  {gym.phone}
                </p>
              )}
              {gym?.email && (
                <p className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 opacity-70" />
                  {gym.email}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex flex-col items-start sm:items-end sm:text-right">
            <div className="mb-4">
              {payment.is_refunded ? (
                <span className="flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-4 py-1.5 text-sm font-semibold text-destructive backdrop-blur-md print:border-red-300 print:bg-red-50 print:text-red-700">
                  <AlertCircle className="h-4 w-4" /> Refunded
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-4 py-1.5 text-sm font-semibold text-success backdrop-blur-md print:border-green-300 print:bg-green-50 print:text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> Paid
                </span>
              )}
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground print:text-black">Invoice</h2>
            <p className="mt-1 font-mono text-sm font-medium text-muted-foreground print:text-gray-500">
              {payment.invoice_number}
            </p>
            <p className="mt-1 text-sm text-muted-foreground print:text-gray-500">
              {format(new Date(payment.created_at), "dd MMM yyyy")}
            </p>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 gap-6 border-b border-border/40 py-8 print:border-gray-200 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/30 bg-secondary/20 p-5 backdrop-blur-sm print:border-none print:bg-transparent print:p-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-gray-500">Billed to</p>
            <p className="mt-2 text-lg font-medium text-foreground print:text-black">{payment.member_name}</p>
          </div>
          <div className="rounded-2xl border border-border/30 bg-secondary/20 p-5 backdrop-blur-sm print:border-none print:bg-transparent print:p-0 sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-gray-500">Receipt number</p>
            <p className="mt-2 flex items-center gap-2 font-mono text-lg font-medium text-foreground print:text-black sm:justify-end">
              <Receipt className="h-4 w-4 text-muted-foreground print:hidden" />
              {payment.receipt_number}
            </p>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="py-8">
          <div className="overflow-hidden rounded-2xl border border-border/40 bg-background/30 backdrop-blur-md print:rounded-none print:border-none print:bg-transparent">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 print:bg-gray-100">
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-gray-600">
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30 print:divide-gray-200">
                <tr className="transition-colors hover:bg-muted/10 print:hover:bg-transparent">
                  <td className="px-6 py-5 font-medium text-foreground print:text-black">
                    {payment.plan_name ?? "Membership payment"}
                  </td>
                  <td className="px-6 py-5 text-right font-mono font-medium text-foreground print:text-black">
                    ₹{payment.amount.toFixed(2)}
                  </td>
                </tr>
                {payment.gst_amount > 0 && (
                  <tr className="transition-colors hover:bg-muted/10 print:hover:bg-transparent">
                    <td className="px-6 py-5 text-muted-foreground print:text-gray-600">
                      GST ({payment.gst_rate}%)
                    </td>
                    <td className="px-6 py-5 text-right font-mono text-muted-foreground print:text-gray-600">
                      ₹{payment.gst_amount.toFixed(2)}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t border-border/40 bg-secondary/10 print:border-gray-300 print:bg-transparent">
                <tr>
                  <td className="px-6 py-5 text-base font-bold text-foreground print:text-black">
                    Total Amount
                  </td>
                  <td className="px-6 py-5 text-right font-mono text-xl font-bold text-foreground print:text-black">
                    ₹{payment.total_amount.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Payment Footer */}
        <div className="flex flex-col gap-4 rounded-2xl border border-border/30 bg-card/40 p-6 backdrop-blur-sm print:rounded-none print:border-t print:border-gray-200 print:bg-transparent print:p-0 print:pt-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-gray-500">
              Payment Method
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary opacity-80 print:text-gray-600" />
              <p className="font-medium capitalize text-foreground print:text-black">
                {payment.method === "split" ? "Split Payment" : payment.method}
              </p>
            </div>
          </div>

          {payment.method === "split" && splits.length > 0 && (
            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-gray-500">
                Split Details
              </p>
              <ul className="mt-2 flex flex-wrap gap-2 sm:justify-end print:block print:space-y-1">
                {splits.map((s) => (
                  <li 
                    key={s.id} 
                    className="flex items-center gap-1.5 rounded-full border border-border/40 bg-background/50 px-3 py-1 text-xs font-medium capitalize text-foreground backdrop-blur-md print:border-none print:p-0 print:text-gray-700"
                  >
                    <CreditCard className="h-3 w-3 text-muted-foreground print:hidden" />
                    {s.method}: <span className="font-mono">₹{s.amount.toFixed(2)}</span>
                    {s.transaction_reference && (
                      <span className="text-muted-foreground">({s.transaction_reference})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}