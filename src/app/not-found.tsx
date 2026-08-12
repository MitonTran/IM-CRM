import Link from "next/link";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center px-6"><div className="card-shadow w-full max-w-xl rounded-[26px] border border-[#dfe7e2] bg-white p-8 text-center sm:p-10"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#728179]">404 · IM CRM</p><h1 className="mt-3 text-3xl font-bold tracking-[-.03em]">Không tìm thấy trang</h1><p className="mt-3 text-sm leading-6 text-[#68766f]">Đường dẫn có thể đã thay đổi hoặc bạn chưa được cấp quyền truy cập.</p><Link href="/dashboard" className="focus-ring mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#176a4f] px-5 text-sm font-bold text-white">Về tổng quan</Link></div></main>;
}
