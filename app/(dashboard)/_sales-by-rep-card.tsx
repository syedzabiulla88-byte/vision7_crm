"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api, type SalesReport } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight } from "@/lib/icons";

const WINDOW_DAYS = 30;
const TOP_N = 5;

// Pinned to en-US so a browser set to e.g. en-IN doesn't regroup the digits.
const SAR = (n: number): string =>
  `SAR ${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/**
 * Dashboard card: who sold what over the last 30 days. Reads the same
 * `/reports/sales` endpoint as the full report, so the figures always agree
 * with it. Loads independently of the dashboard bundle — a failure here shows
 * a note inside the card instead of blanking the page.
 */
export function SalesByRepCard() {
  const [data, setData] = useState<SalesReport | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - WINDOW_DAYS);
    api.reports
      .sales({ from: from.toISOString(), to: to.toISOString() })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const named = (data?.rows ?? []).filter((r) => r.salesUserId);
  const unassigned = (data?.rows ?? []).find((r) => !r.salesUserId);
  const top = named.slice(0, TOP_N);
  const hidden = named.length - top.length;

  return (
    <Card>
      <CardContent className="space-y-4 py-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Sales by salesperson</h3>
            <p className="text-xs text-muted-foreground">
              Last {WINDOW_DAYS} days · invoices credited to the rep on each invoice
            </p>
          </div>
          <Button variant="ghost" size="sm" render={<Link href="/reports/sales" />}>
            Full report
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        {state === "loading" && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        )}

        {state === "error" && (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load sales figures.</p>
        )}

        {state === "ready" && data && (
          <>
            {top.length === 0 && !unassigned ? (
              <p className="text-sm text-muted-foreground">
                No invoices in the last {WINDOW_DAYS} days.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-1.5 pr-3 font-medium">Salesperson</th>
                      <th className="px-3 py-1.5 text-right font-medium">Invoices</th>
                      <th className="px-3 py-1.5 text-right font-medium">Billed</th>
                      <th className="py-1.5 pl-3 text-right font-medium">Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((r) => (
                      <tr key={r.salesUserId} className="border-t">
                        <td className="py-2 pr-3 font-medium">{r.salesUserName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.invoices}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{SAR(r.billed)}</td>
                        <td className="py-2 pl-3 text-right tabular-nums">{SAR(r.collected)}</td>
                      </tr>
                    ))}
                    {unassigned && (
                      <tr className="border-t text-muted-foreground">
                        <td className="py-2 pr-3">
                          <span className="flex items-center gap-2">
                            Unassigned
                            <Badge variant="outline" className="text-amber-500">
                              no rep set
                            </Badge>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{unassigned.invoices}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{SAR(unassigned.billed)}</td>
                        <td className="py-2 pl-3 text-right tabular-nums">
                          {SAR(unassigned.collected)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <td className="py-2 pr-3">All sales</td>
                      <td className="px-3 py-2 text-right tabular-nums">{data.totals.invoices}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{SAR(data.totals.billed)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">
                        {SAR(data.totals.collected)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {hidden > 0 && (
              <p className="text-xs text-muted-foreground">
                + {hidden} more {hidden === 1 ? "salesperson" : "salespeople"} in the full report
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
