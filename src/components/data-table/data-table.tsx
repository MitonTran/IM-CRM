"use client";

import type { ReactNode } from "react";

export type DataColumn<Row> = { key: string; label: string; className?: string; render: (row: Row) => ReactNode };

export function DataTable<Row extends { id: string }>({ rows, columns, onOpen }: { rows: Row[]; columns: DataColumn<Row>[]; onOpen: (row: Row) => void }) {
  if (!rows.length) return <div className="grid min-h-64 place-items-center px-6 text-center text-sm text-[#7c8982]">Chưa có khách hàng phù hợp với bộ lọc.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left">
        <thead className="sticky top-0 z-10 bg-[#f8faf8]"><tr>{columns.map((column) => <th key={column.key} className={`border-b border-[#e2e9e4] px-4 py-3 text-[11px] font-bold uppercase tracking-[.1em] text-[#596961] ${column.className ?? ""}`}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id} tabIndex={0} onClick={() => onOpen(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(row); }} className="group cursor-pointer outline-none hover:bg-[#f7faf5] focus-visible:bg-[#eef5e9]">{columns.map((column) => <td key={column.key} className={`border-b border-[#edf1ee] px-4 py-3.5 text-sm ${column.className ?? ""}`}>{column.render(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
