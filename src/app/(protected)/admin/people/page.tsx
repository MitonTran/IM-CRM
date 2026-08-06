import { MailPlus, Plus, ShieldAlert, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { ROLE_LABELS, type AppRole } from "@/lib/access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { createTeam, invitePerson } from "./actions";

export const metadata = { title: "Nhân sự và team" };

const errors: Record<string, string> = {
  "team-invalid": "Tên team cần từ 2 đến 80 ký tự.",
  "team-create": "Không thể tạo team. Có thể tên team đã tồn tại.",
  "invite-invalid": "Thông tin mời chưa hợp lệ.",
  "team-required": "Leader và Sale cần được gán một team.",
  "invite-failed": "Không thể gửi lời mời. Kiểm tra email hoặc cấu hình máy chủ.",
  "profile-update": "Đã tạo tài khoản nhưng chưa cập nhật được quyền. Hãy kiểm tra audit và thử lại.",
};

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const { data: current } = await supabase.from("profiles").select("role,is_active").eq("id", claimsData?.claims?.sub ?? "").single();
  if (current?.role !== "admin" || !current.is_active) redirect("/dashboard");

  const [{ data: teams }, { data: profiles }, params] = await Promise.all([
    supabase.from("teams").select("id,name,is_active").order("name"),
    supabase.from("profiles").select("id,full_name,role,is_active,team_id,team:teams!profiles_team_id_fkey(name)").order("full_name"),
    searchParams,
  ]);

  return (
    <div className="mx-auto max-w-[1280px]">
      <div><p className="text-sm font-semibold text-[#708078]">Quản trị hệ thống</p><h1 className="mt-2 text-3xl font-bold tracking-[-.035em]">Nhân sự & team</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#718078]">Mời tài khoản, gán vai trò và tổ chức đội ngũ. Mọi thay đổi quyền đều được lưu lịch sử.</p></div>

      {params.error && <div role="alert" className="mt-6 flex items-start gap-3 rounded-2xl border border-[#efc9c1] bg-[#fff3f0] p-4 text-sm text-[#8e3e32]"><ShieldAlert className="shrink-0" size={19} />{errors[params.error] ?? "Có lỗi xảy ra."}</div>}

      <div className="mt-8 grid gap-5 xl:grid-cols-[.75fr_1.25fr]">
        <section className="card-shadow rounded-[24px] border border-[#e0e7e2] bg-white p-6">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[14px] bg-[#e8f0df] text-[#456044]"><Plus size={18} /></span><div><h2 className="font-bold">Tạo team mới</h2><p className="mt-1 text-xs text-[#85918b]">Một người thuộc tối đa một team.</p></div></div>
          <form action={createTeam} className="mt-6 flex gap-2"><Input name="name" required minLength={2} maxLength={80} placeholder="Ví dụ: Team Tư vấn 1" /><Button type="submit" className="shrink-0">Tạo</Button></form>
          <div className="mt-7 space-y-2">
            {(teams ?? []).map((team) => <div key={team.id} className="flex items-center justify-between rounded-xl border border-[#e5ebe7] px-4 py-3"><span className="text-sm font-semibold">{team.name}</span><span className={`text-[10px] font-bold uppercase ${team.is_active ? "text-[#4e7a48]" : "text-[#a0aaa5]"}`}>{team.is_active ? "Hoạt động" : "Đã khóa"}</span></div>)}
            {!teams?.length && <p className="rounded-xl bg-[#f6f8f6] px-4 py-5 text-center text-sm text-[#85918b]">Chưa có team nào.</p>}
          </div>
        </section>

        <section className="card-shadow rounded-[24px] border border-[#e0e7e2] bg-white p-6">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[14px] bg-[#e1eee8] text-[#285b47]"><MailPlus size={18} /></span><div><h2 className="font-bold">Mời thành viên</h2><p className="mt-1 text-xs text-[#85918b]">Email kích hoạt được gửi từ Supabase Auth.</p></div></div>
          <form action={invitePerson} className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Họ và tên<Input className="mt-2" name="fullName" required minLength={2} maxLength={120} /></label>
            <label className="text-sm font-semibold">Email<Input className="mt-2" name="email" type="email" required /></label>
            <label className="text-sm font-semibold">Vai trò<select name="role" defaultValue="sale" className="focus-ring mt-2 min-h-11 w-full rounded-xl border border-[#cedbd3] bg-white px-3.5 text-sm"><option value="sale">Nhân viên Sale</option><option value="leader">Sale Leader</option><option value="admin">Quản trị viên</option></select></label>
            <label className="text-sm font-semibold">Team<select name="teamId" defaultValue="" className="focus-ring mt-2 min-h-11 w-full rounded-xl border border-[#cedbd3] bg-white px-3.5 text-sm"><option value="">Không thuộc team</option>{(teams ?? []).filter((t) => t.is_active).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
            <Button type="submit" className="sm:col-span-2">Gửi lời mời</Button>
          </form>
        </section>
      </div>

      <section className="mt-5 overflow-hidden rounded-[24px] border border-[#e0e7e2] bg-white">
        <div className="flex items-center gap-3 border-b border-[#e6ece8] px-6 py-5"><UsersRound size={19} className="text-[#35614e]" /><h2 className="font-bold">Thành viên ({profiles?.length ?? 0})</h2></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[#f8faf8] text-[10px] uppercase tracking-[.12em] text-[#849089]"><tr><th className="px-6 py-3 font-bold">Họ tên</th><th className="px-5 py-3 font-bold">Vai trò</th><th className="px-5 py-3 font-bold">Team</th><th className="px-5 py-3 font-bold">Trạng thái</th></tr></thead><tbody className="divide-y divide-[#edf1ee]">{(profiles ?? []).map((person) => { const team = Array.isArray(person.team) ? person.team[0] : person.team; return <tr key={person.id}><td className="px-6 py-4 font-semibold">{person.full_name}</td><td className="px-5 py-4 text-[#64736c]">{ROLE_LABELS[person.role as AppRole]}</td><td className="px-5 py-4 text-[#64736c]">{(team as { name?: string } | null)?.name ?? "—"}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${person.is_active ? "bg-[#eaf2df] text-[#4c7044]" : "bg-[#f0f2f1] text-[#87928c]"}`}>{person.is_active ? "Hoạt động" : "Chưa kích hoạt"}</span></td></tr>; })}{!profiles?.length && <tr><td colSpan={4} className="px-6 py-10 text-center text-[#87928c]">Chưa có thành viên.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
