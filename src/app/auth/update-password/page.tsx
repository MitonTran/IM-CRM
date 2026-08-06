import { ArrowRight, KeyRound } from "lucide-react";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { updatePassword } from "./actions";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login?error=recovery-expired");
  const { error } = await searchParams;
  const message = error === "update-failed" ? "Không thể cập nhật mật khẩu. Liên kết có thể đã hết hạn." : error;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7f4] px-5 py-10">
      <section className="card-shadow w-full max-w-[460px] rounded-[28px] border border-[#e0e7e2] bg-white p-7 sm:p-9">
        <Brand />
        <div className="mt-10 flex size-12 items-center justify-center rounded-2xl bg-[#e7f1d3] text-[#315f43]"><KeyRound size={22} /></div>
        <h1 className="mt-5 text-3xl font-bold tracking-[-.035em]">Tạo mật khẩu mới</h1>
        <p className="mt-3 text-sm leading-6 text-[#718078]">Mật khẩu cần ít nhất 8 ký tự. Không sử dụng lại mật khẩu của email hoặc tài khoản khác.</p>
        {message && <div role="alert" className="mt-6 rounded-xl border border-[#efc9c1] bg-[#fff3f0] px-4 py-3 text-sm text-[#9a3d30]">{message}</div>}
        <form action={updatePassword} className="mt-7 space-y-5">
          <label className="block text-sm font-semibold text-[#32483f]">Mật khẩu mới
            <Input className="mt-2" type="password" name="password" autoComplete="new-password" minLength={8} required />
          </label>
          <label className="block text-sm font-semibold text-[#32483f]">Nhập lại mật khẩu
            <Input className="mt-2" type="password" name="confirmPassword" autoComplete="new-password" minLength={8} required />
          </label>
          <Button className="w-full" type="submit">Lưu mật khẩu <ArrowRight size={17} /></Button>
        </form>
      </section>
    </main>
  );
}
