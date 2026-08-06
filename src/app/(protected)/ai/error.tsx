"use client";

export default function AiAssistantError({ reset }: { reset: () => void }) {
  return <div className="mx-auto max-w-2xl rounded-3xl border border-rose-200 bg-white p-8 text-center"><h1 className="text-2xl font-bold">Không tải được Trợ lý AI</h1><p className="mt-2 text-sm text-[#718078]">Quyền truy cập hoặc kết nối dữ liệu có thể vừa thay đổi.</p><button onClick={reset} className="focus-ring mt-5 rounded-xl bg-[#176a4f] px-5 py-3 text-sm font-bold text-white">Thử lại</button></div>;
}
