"use client";

import { AlertTriangle } from "lucide-react";

export default function CustomersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-700"><AlertTriangle size={24} /></span><h1 className="mt-5 text-2xl font-bold">Chưa thể tải danh sách khách hàng</h1><p className="mt-2 text-sm leading-6 text-[#718078]">Có lỗi tạm thời khi đọc dữ liệu. Thử lại mà không cần tải lại toàn bộ ứng dụng.</p><button onClick={reset} className="focus-ring mt-5 min-h-11 rounded-xl bg-[#176a4f] px-5 text-sm font-bold text-white">Thử lại</button></div></div>;
}

