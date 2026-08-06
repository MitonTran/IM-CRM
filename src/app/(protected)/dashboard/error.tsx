"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="grid min-h-[60vh] place-items-center"><div className="max-w-md rounded-[24px] border border-[#eadbd5] bg-white p-8 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f7e6e1] text-[#945444]"><AlertTriangle size={21} /></span><h1 className="mt-4 text-xl font-bold">Chưa tải được dashboard</h1><p className="mt-2 text-sm leading-6 text-[#718078]">Dữ liệu không bị thay đổi. Hãy thử tải lại KPI.</p><button onClick={reset} className="focus-ring mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#176a4f] px-4 text-sm font-bold text-white"><RotateCcw size={16} /> Thử lại</button></div></div>;
}
