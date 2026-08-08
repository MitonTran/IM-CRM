import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "./actions";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  "invalid-email": "Vui lòng nhập email hợp lệ.",
  "not-configured": "Dự án chưa được kết nối Supabase.",
  "request-failed": "Không thể gửi liên kết lúc này. Vui lòng thử lại sau.",
};

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const { error, status } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7f4] px-5 py-10">
      <section className="card-shadow w-full max-w-[460px] rounded-[28px] border border-[#e0e7e2] bg-white p-7 sm:p-9">
        <Brand />
        <div className="mt-10 flex size-12 items-center justify-center rounded-2xl bg-[#e7f1d3] text-[#315f43]"><Mail size={22} /></div>
        <h1 className="mt-5 text-3xl font-bold tracking-[-.035em]">Đặt lại mật khẩu</h1>
        <p className="mt-3 text-sm leading-6 text-[#718078]">Nhập email tài khoản. Nếu email hợp lệ, hệ thống sẽ gửi một liên kết đặt mật khẩu an toàn.</p>

        {error && <div role="alert" className="mt-6 rounded-xl border border-[#efc9c1] bg-[#fff3f0] px-4 py-3 text-sm text-[#9a3d30]">{errorMessages[error] ?? "Không thể xử lý yêu cầu."}</div>}
        {status === "sent" && <div role="status" className="mt-6 rounded-xl border border-[#bddbc8] bg-[#eff9f2] px-4 py-3 text-sm leading-6 text-[#286342]">Nếu email thuộc tài khoản hợp lệ, liên kết đặt mật khẩu đã được gửi. Hãy kiểm tra cả thư mục Spam.</div>}

        <form action={requestPasswordReset} className="mt-7 space-y-5">
          <label className="block text-sm font-semibold text-[#32483f]">Email
            <Input className="mt-2" type="email" name="email" autoComplete="email" placeholder="ten@ieltsmentor.edu.vn" required />
          </label>
          <Button className="w-full" type="submit">Gửi liên kết đặt mật khẩu</Button>
        </form>
        <Link className="focus-ring mt-6 inline-flex items-center gap-2 rounded text-sm font-semibold text-[#52665e] hover:text-[#173c2f]" href="/login"><ArrowLeft size={16} /> Quay lại đăng nhập</Link>
      </section>
    </main>
  );
}
