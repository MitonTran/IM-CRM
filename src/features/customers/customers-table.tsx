"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { DataTable, type DataColumn } from "@/components/data-table/data-table";
import { PRIORITY_LABELS, STATUS_LABELS, type CustomerListItem } from "./types";

const statusTone: Record<CustomerListItem["status"], string> = {
  new: "bg-sky-50 text-sky-700", contacting: "bg-amber-50 text-amber-700", consulting: "bg-violet-50 text-violet-700",
  follow_up: "bg-orange-50 text-orange-700", won: "bg-emerald-50 text-emerald-700", lost: "bg-slate-100 text-slate-600", unqualified: "bg-rose-50 text-rose-700",
};

const columns: DataColumn<CustomerListItem>[] = [
  { key: "name", label: "Khách hàng", render: (row) => <div><p className="font-bold text-[#20342b]">{row.fullName}</p><p className="mt-1 text-xs text-[#829088]">{row.phone ?? row.email ?? "—"}</p></div> },
  { key: "status", label: "Trạng thái", render: (row) => <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone[row.status]}`}>{STATUS_LABELS[row.status]}</span> },
  { key: "owner", label: "Phụ trách", render: (row) => <div><p className="font-semibold">{row.ownerName ?? "Chưa giao"}</p><p className="mt-1 text-xs text-[#8a9690]">{row.teamName}</p></div> },
  { key: "source", label: "Nguồn", render: (row) => <span className="text-[#5f6f67]">{row.sourceName}</span> },
  { key: "priority", label: "Ưu tiên", render: (row) => <span className={row.priority === "urgent" ? "font-bold text-rose-600" : "text-[#5f6f67]"}>{PRIORITY_LABELS[row.priority]}</span> },
  { key: "updated", label: "Cập nhật", render: (row) => <span className="text-xs text-[#6f7e76]">{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(row.updatedAt))}</span> },
];

export function CustomersTable({ rows }: { rows: CustomerListItem[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  return <DataTable rows={rows} columns={columns} onOpen={(row) => { const next = new URLSearchParams(searchParams); next.set("customer", row.id); router.push(`/customers?${next}`); }} />;
}

