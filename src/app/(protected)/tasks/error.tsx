"use client";
export default function TasksError({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="grid min-h-[60vh] place-items-center text-center"><div><h1 className="text-2xl font-bold">Chưa thể tải công việc</h1><p className="mt-2 text-sm text-[#718078]">Có lỗi tạm thời khi đọc lịch chăm sóc.</p><button onClick={reset} className="focus-ring mt-5 min-h-11 rounded-xl bg-[#176a4f] px-5 text-sm font-bold text-white">Thử lại</button></div></div>; }

