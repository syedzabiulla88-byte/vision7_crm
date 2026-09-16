"use client";

// Shared instalment-schedule editor + read-only display, used from both the
// Assign Membership modal (members/page.tsx) and the invoice detail page.
// A schedule is purely a printed/tracked PLAN — { description, amount, dueDate }[]
// — independent of amountPaid/balance, which recordPayment() alone still drives.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatSAR, formatDate } from "./_shared";

export type InstallmentRow = { description: string; amount: string; dueDate: string };

function addInterval(date: Date, unit: "month" | "week" | "day", n: number): Date {
  const d = new Date(date);
  if (unit === "month") d.setMonth(d.getMonth() + n);
  else if (unit === "week") d.setDate(d.getDate() + n * 7);
  else d.setDate(d.getDate() + n);
  return d;
}

function toDateInputStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Row-based editor: add/edit/remove rows manually, plus a quick generator
 *  for N repeating instalments (e.g. "8 more, SAR 765 each, monthly from
 *  5 Oct") — generated rows land in the same editable list, so a schedule
 *  where later instalments vary can still be hand-adjusted afterward. */
export function InstallmentScheduleEditor({
  rows,
  onChange,
}: {
  rows: InstallmentRow[];
  onChange: (rows: InstallmentRow[]) => void;
}) {
  const [genCount, setGenCount] = useState("");
  const [genAmount, setGenAmount] = useState("");
  const [genStart, setGenStart] = useState("");
  const [genUnit, setGenUnit] = useState<"month" | "week" | "day">("month");
  const [genInterval, setGenInterval] = useState("1");
  const [genLabel, setGenLabel] = useState("Instalment");

  const updateRow = (i: number, patch: Partial<InstallmentRow>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const removeRow = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const addBlankRow = () =>
    onChange([...rows, { description: "", amount: "", dueDate: "" }]);

  const generate = () => {
    const count = Math.max(0, Math.round(Number(genCount) || 0));
    const amount = Number(genAmount);
    if (!count || !Number.isFinite(amount) || amount <= 0 || !genStart) {
      return;
    }
    const interval = Math.max(1, Math.round(Number(genInterval) || 1));
    const start = new Date(genStart);
    const startIdx = rows.length;
    const generated: InstallmentRow[] = Array.from({ length: count }, (_, i) => ({
      description: `${genLabel.trim() || "Instalment"} ${startIdx + i + 1}`,
      amount: String(amount),
      dueDate: toDateInputStr(addInterval(start, genUnit, i * interval)),
    }));
    onChange([...rows, ...generated]);
    setGenCount("");
    setGenAmount("");
    setGenStart("");
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Instalment schedule (optional)</span>
        <Button type="button" size="sm" variant="outline" onClick={addBlankRow}>
          Add row
        </Button>
      </div>
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No schedule set — the invoice will just show a single due date. Add rows to print a
          full instalment plan on the invoice, matching the signed agreement.
        </p>
      )}
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_140px_160px_auto] items-end gap-2">
          <div className="space-y-1">
            {i === 0 && <Label className="text-xs">Description</Label>}
            <Input
              value={row.description}
              onChange={(e) => updateRow(i, { description: e.target.value })}
              placeholder={`Instalment ${i + 1}`}
            />
          </div>
          <div className="space-y-1">
            {i === 0 && <Label className="text-xs">Amount (SAR)</Label>}
            <Input
              type="number"
              min={0}
              step="0.01"
              value={row.amount}
              onChange={(e) => updateRow(i, { amount: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            {i === 0 && <Label className="text-xs">Due date</Label>}
            <Input
              type="date"
              value={row.dueDate}
              onChange={(e) => updateRow(i, { dueDate: e.target.value })}
            />
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => removeRow(i)}>
            Remove
          </Button>
        </div>
      ))}

      <div className="rounded-md border bg-muted/30 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Generate repeating instalments (appends to the list above — e.g. &quot;8 more, SAR 765
          each, monthly from 5 Oct&quot;)
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-xs">Count</Label>
            <Input type="number" min={1} value={genCount} onChange={(e) => setGenCount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount each</Label>
            <Input type="number" min={0} step="0.01" value={genAmount} onChange={(e) => setGenAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">First due date</Label>
            <Input type="date" value={genStart} onChange={(e) => setGenStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Every</Label>
            <Input type="number" min={1} value={genInterval} onChange={(e) => setGenInterval(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unit</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={genUnit}
              onChange={(e) => setGenUnit(e.target.value as "month" | "week" | "day")}
            >
              <option value="month">Month(s)</option>
              <option value="week">Week(s)</option>
              <option value="day">Day(s)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Label prefix</Label>
            <Input value={genLabel} onChange={(e) => setGenLabel(e.target.value)} placeholder="Instalment" />
          </div>
        </div>
        <Button type="button" size="sm" className="mt-2" onClick={generate}>
          Add generated instalments
        </Button>
      </div>
    </div>
  );
}

/** Read-only display, mirroring the PDF's "Instalment Payment Plan" table. */
export function InstallmentScheduleTable({
  schedule,
  currency = "SAR",
}: {
  schedule: { description: string; amount: number; dueDate: string }[];
  currency?: string;
}) {
  if (!schedule?.length) return null;
  const [first, ...rest] = schedule;
  const total = schedule.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const restTotal = rest.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const sameAmount = rest.length > 0 && rest.every((r) => Number(r.amount) === Number(rest[0].amount));

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-[#011b2b] dark:text-[#FFCF01]">
        Instalment Payment Plan
      </h3>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#011b2b] text-left text-xs uppercase tracking-wider text-[#FFCF01]">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-right font-medium">Due Date</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((row, i) => (
              <tr key={i} className={i % 2 === 1 ? "bg-muted/30" : undefined}>
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2">{row.description}</td>
                <td className="px-3 py-2 text-right font-medium">{formatSAR(row.amount).replace("SAR", currency)}</td>
                <td className="px-3 py-2 text-right">{formatDate(row.dueDate)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className="px-3 py-2" colSpan={2}>
                Total Programme Fee
              </td>
              <td className="px-3 py-2 text-right">{formatSAR(total).replace("SAR", currency)}</td>
              <td className="px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        First instalment: {formatSAR(first.amount).replace("SAR", currency)}.
        {rest.length > 0 && (
          <>
            {" "}
            Remaining balance: {formatSAR(restTotal).replace("SAR", currency)}, payable in {rest.length} further
            instalment{rest.length === 1 ? "" : "s"}
            {sameAmount ? ` of ${formatSAR(Number(rest[0].amount)).replace("SAR", currency)} each.` : "."}
          </>
        )}
      </p>
    </div>
  );
}
