import { ArrowRight, CheckCircle2, LockKeyhole, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { login } from "./actions";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  credentials: "Email hoặc mật khẩu chưa đúng.",
  inactive: "Tài khoản chưa được kích hoạt. Vui lòng liên hệ quản trị viên.",
  "not-configured": "Dự án chưa được kết nối Supabase.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims) redirect("/dashboard");
  }

  const { error } = await searchParams;
  const message = error ? errorMessages[error] ?? error : null;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.08fr_.92fr]">
      <section className="relative hidden overflow-hidden bg-[#173c2f] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute inset-0 opacity-70" style={{ background: "radial-gradient(circle at 15% 20%, #3a765e 0, transparent 38%), radial-gradient(circle at 82% 78%, #677d3a 0, transparent 32%)" }} />
        <div className="relative z-10"><Brand inverse /></div>
        <div className="relative z-10 my-auto max-w-xl">
          <div className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-white/10"><Sparkles size={20} /></div>
          <h1 className="font-[family-name:var(--font-display)] text-5xl leading-[1.12] tracking-[-.035em]">Chăm đúng khách.<br />Đúng lúc. Cùng một đội.</h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-emerald-50/75">Theo dõi hành trình khách hàng, lịch chăm sóc và hiệu quả kinh doanh trong một không gian rõ ràng.</p>
          <div className="mt-10 grid grid-cols-2 gap-3 text-sm text-emerald-50/90">
            {["Dữ liệu theo đúng quyền", "Lịch sử luôn rõ ràng", "KPI từ hoạt động thật", "AI chỉ hỗ trợ quyết định"].map((item) => (
              <div key={item} className="flex items-center gap-2.5"><CheckCircle2 size={17} className="text-[#c5dc8c]" />{item}</div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-xs text-emerald-50/45">Hệ thống nội bộ · IELTS Mentor Thanh Hóa</p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="rise w-full max-w-[430px]">
          <div className="mb-12 lg:hidden"><Brand /></div>
          <div className="mb-8 flex size-12 items-center justify-center rounded-2xl bg-[#e7f1d3] text-[#315f43]"><LockKeyhole size={22} /></div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#6d7c74]">Chào mừng trở lại</p>
          <h2 className="mt-2 text-3xl font-bold tracking-[-.035em]">Đăng nhập IM CRM</h2>
          <p className="mt-3 text-sm leading-6 text-[#718078]">Sử dụng tài khoản do quản trị viên cấp.</p>

          {message && <div role="alert" className="mt-6 rounded-xl border border-[#efc9c1] bg-[#fff3f0] px-4 py-3 text-sm text-[#9a3d30]">{message}</div>}

          <form action={login} className="mt-7 space-y-5">
            <label className="block text-sm font-semibold text-[#32483f]">Email
              <Input className="mt-2" type="email" name="email" autoComplete="email" placeholder="ten@ieltsmentor.edu.vn" required />
            </label>
            <label className="block text-sm font-semibold text-[#32483f]">Mật khẩu
              <Input className="mt-2" type="password" name="password" autoComplete="current-password" placeholder="Tối thiểu 8 ký tự" minLength={8} required />
            </label>
            <Button className="w-full" type="submit">Đăng nhập <ArrowRight size={17} /></Button>
          </form>
          <p className="mt-6 text-center text-xs leading-5 text-[#89948f]">Không chia sẻ tài khoản. Mọi thay đổi quan trọng đều được lưu lịch sử.</p>
        </div>
      </section>
    </main>
  );
}
