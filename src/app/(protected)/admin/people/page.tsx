import { MailPlus, Plus, Power, PowerOff, Save, ShieldAlert, UserRoundCog, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadAuthEmailDirectory } from "@/features/admin/auth-directory";
import { createClient } from "@/lib/supabase/server";
import { createTeam, invitePerson, managePerson, manageTeam } from "./actions";

export const metadata = { title: "Nhân sự và team" };

const errors: Record<string, string> = {
  "team-invalid": "Tên team cần từ 2 đến 80 ký tự.",
  "team-create": "Không thể tạo team. Có thể tên team đã tồn tại.",
  "invite-invalid": "Thông tin mời chưa hợp lệ.",
  "team-required": "Leader và Sale cần được gán một team.",
  "invite-failed": "Không thể gửi lời mời. Kiểm tra email hoặc cấu hình máy chủ.",
  "invite-directory": "Không thể kiểm tra danh sách Auth lúc này. Không có quyền nào được thay đổi.",
  "invite-exists": "Email này đã thuộc một tài khoản được xác nhận hoặc đang hoạt động.",
  "invite-integrity": "Kết quả Auth không khớp tài khoản đang phục hồi. Hồ sơ chưa được kích hoạt.",
  "invite-pending": "Supabase chưa gửi được email. Quyền đã được lưu ở trạng thái chưa kích hoạt; hãy gửi lại cùng email sau ít phút.",
  "profile-update": "Email có thể đã được gửi nhưng hồ sơ vẫn chưa kích hoạt. Hãy gửi lại cùng thông tin để phục hồi an toàn.",
  team_manage_input_invalid: "Thông tin team chưa hợp lệ.",
  team_manage_not_found: "Team không còn tồn tại hoặc vừa thay đổi.",
  team_manage_active_members: "Hãy khóa hoặc chuyển toàn bộ thành viên hoạt động trước khi ngừng team.",
  team_manage_active_customers: "Hãy chuyển hoặc xóa mềm toàn bộ khách đang thuộc team trước khi ngừng team.",
  team_manage_name_taken: "Tên team này đã được sử dụng.",
  profile_manage_input_invalid: "Thông tin thành viên chưa hợp lệ.",
  profile_manage_not_found: "Thành viên không còn tồn tại hoặc vừa thay đổi.",
  profile_manage_team_required: "Leader và Sale luôn phải thuộc một team.",
  profile_manage_team_invalid: "Không thể kích hoạt thành viên trong một team đã ngừng hoạt động.",
  profile_manage_self_privileges: "Bạn có thể đổi tên mình nhưng không thể tự hạ quyền, chuyển team hoặc khóa phiên Admin hiện tại.",
  profile_manage_active_customers: "Hãy chuyển toàn bộ khách đang do Sale này phụ trách trước khi đổi role, chuyển team hoặc khóa.",
  profile_manage_pending_tasks: "Hãy hoàn thành, hủy hoặc chuyển các follow-up đang mở trước khi đổi role, chuyển team hoặc khóa Sale.",
  "management-failed": "Không thể lưu thay đổi quản trị. Dữ liệu hiện tại vẫn được giữ nguyên.",
};

const statuses: Record<string, string> = {
  "invite-sent": "Email mời đã được gửi và hồ sơ quyền đã được kích hoạt.",
  "team-created": "Đã tạo team mới.",
  "team-saved": "Đã lưu tên và trạng thái team.",
  "person-saved": "Đã lưu hồ sơ và trạng thái thành viên.",
};

const selectClass = "focus-ring min-h-11 w-full rounded-xl border border-[#cedbd3] bg-white px-3 text-sm";

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ error?: string; status?: string }> }) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const currentUserId = claimsData?.claims?.sub ?? "";
  const { data: current } = await supabase.from("profiles").select("role,is_active").eq("id", currentUserId).single();
  if (current?.role !== "admin" || !current.is_active) redirect("/dashboard");

  const [{ data: teams }, { data: profiles }, params, authDirectory] = await Promise.all([
    supabase.from("teams").select("id,name,is_active").order("name"),
    supabase.from("profiles").select("id,full_name,role,is_active,team_id,team:teams!profiles_team_id_fkey(name)").order("full_name"),
    searchParams,
    loadAuthEmailDirectory(),
  ]);
  const allTeams = teams ?? [];
  const activeTeams = allTeams.filter((team) => team.is_active);

  return (
    <div className="mx-auto max-w-[1380px]">
      <div>
        <p className="text-sm font-semibold text-[#708078]">Quản trị hệ thống</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-.035em]">Nhân sự & team</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#718078]">
          Mời, đổi tên, phân quyền và khóa mềm tài khoản hoặc team. Không có thao tác xóa cứng; toàn bộ lịch sử và audit được giữ lại.
        </p>
      </div>

      {params.error && (
        <div role="alert" className="mt-6 flex items-start gap-3 rounded-2xl border border-[#efc9c1] bg-[#fff3f0] p-4 text-sm text-[#8e3e32]">
          <ShieldAlert className="shrink-0" size={19} />
          {errors[params.error] ?? "Có lỗi xảy ra."}
        </div>
      )}
      {params.status && statuses[params.status] && (
        <div role="status" className="mt-6 rounded-2xl border border-[#cfe2d5] bg-[#f0f8f2] p-4 text-sm text-[#35614e]">
          {statuses[params.status]}
        </div>
      )}

      <div className="mt-8 grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <section className="card-shadow rounded-[24px] border border-[#e0e7e2] bg-white p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-[14px] bg-[#e8f0df] text-[#456044]"><Plus size={18} /></span>
            <div><h2 className="font-bold">Team</h2><p className="mt-1 text-xs text-[#85918b]">Ngừng hoạt động thay cho xóa; team còn người hoặc khách sẽ bị chặn.</p></div>
          </div>
          <form action={createTeam} className="mt-6 flex gap-2">
            <Input name="name" required minLength={2} maxLength={80} placeholder="Ví dụ: Team Tư vấn 1" />
            <Button type="submit" className="shrink-0">Tạo</Button>
          </form>
          <div className="mt-7 space-y-3">
            {allTeams.map((team) => (
              <article key={team.id} aria-label={`Quản lý team ${team.name}`} className="rounded-2xl border border-[#e5ebe7] p-3">
                <form action={manageTeam} className="flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="teamId" value={team.id} />
                  <input type="hidden" name="isActive" value={String(team.is_active)} />
                  <label className="flex-1">
                    <span className="sr-only">Tên {team.name}</span>
                    <Input name="name" required minLength={2} maxLength={80} defaultValue={team.name} />
                  </label>
                  <Button type="submit" variant="secondary" className="shrink-0"><Save size={16} /> Lưu tên</Button>
                </form>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#edf1ee] pt-3">
                  <span className={`text-[10px] font-bold uppercase ${team.is_active ? "text-[#4e7a48]" : "text-[#a0aaa5]"}`}>
                    {team.is_active ? "Hoạt động" : "Ngừng hoạt động"}
                  </span>
                  <form action={manageTeam}>
                    <input type="hidden" name="teamId" value={team.id} />
                    <input type="hidden" name="name" value={team.name} />
                    <input type="hidden" name="isActive" value={String(!team.is_active)} />
                    <Button type="submit" variant={team.is_active ? "danger" : "secondary"} className="min-h-9 px-3 py-1.5 text-xs">
                      {team.is_active ? <><PowerOff size={15} /> Ngừng</> : <><Power size={15} /> Kích hoạt</>}
                    </Button>
                  </form>
                </div>
              </article>
            ))}
            {!allTeams.length && <p className="rounded-xl bg-[#f6f8f6] px-4 py-5 text-center text-sm text-[#85918b]">Chưa có team nào.</p>}
          </div>
        </section>

        <section className="card-shadow rounded-[24px] border border-[#e0e7e2] bg-white p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-[14px] bg-[#e1eee8] text-[#285b47]"><MailPlus size={18} /></span>
            <div><h2 className="font-bold">Mời thành viên</h2><p className="mt-1 text-xs text-[#85918b]">Email kích hoạt được gửi từ Supabase Auth.</p></div>
          </div>
          <form action={invitePerson} className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Họ và tên<Input className="mt-2" name="fullName" required minLength={2} maxLength={120} /></label>
            <label className="text-sm font-semibold">Email<Input className="mt-2" name="email" type="email" required /></label>
            <label className="text-sm font-semibold">Vai trò<select name="role" defaultValue="sale" className={`${selectClass} mt-2`}><option value="sale">Nhân viên Sale</option><option value="leader">Sale Leader</option><option value="admin">Quản trị viên</option></select></label>
            <label className="text-sm font-semibold">Team<select name="teamId" defaultValue="" className={`${selectClass} mt-2`}><option value="">Không thuộc team</option>{activeTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
            <Button type="submit" className="sm:col-span-2">Gửi lời mời</Button>
          </form>
        </section>
      </div>

      <section className="mt-5 overflow-hidden rounded-[24px] border border-[#e0e7e2] bg-white">
        <div className="flex items-center gap-3 border-b border-[#e6ece8] px-6 py-5"><UsersRound size={19} className="text-[#35614e]" /><h2 className="font-bold">Thành viên ({profiles?.length ?? 0})</h2></div>
        {!authDirectory.available && (
          <p role="status" className="border-b border-[#f0dfbc] bg-[#fff9ec] px-6 py-3 text-xs text-[#805f22]">
            Email đăng nhập tạm thời chưa tải được; các thao tác quản trị khác vẫn hoạt động.
          </p>
        )}
        <div className="divide-y divide-[#edf1ee]">
          {(profiles ?? []).map((person) => {
            const isSelf = person.id === currentUserId;
            const authEmail = authDirectory.emails[person.id];
            return (
              <article key={person.id} aria-label={`Quản lý thành viên ${person.full_name}`} className="p-5">
                <form action={managePerson} className="grid gap-4 lg:grid-cols-[1.15fr_.8fr_1fr_auto] lg:items-end">
                  <input type="hidden" name="userId" value={person.id} />
                  <input type="hidden" name="isActive" value={String(person.is_active)} />
                  <label className="text-xs font-bold uppercase tracking-[.08em] text-[#7d8a83]">
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span>Họ tên thành viên</span>
                      <span className="break-all font-medium normal-case tracking-normal text-[#607169]">— {authEmail ?? "Chưa có email Auth"}</span>
                    </span>
                    <Input aria-label="Họ tên thành viên" className="mt-2 normal-case tracking-normal text-[#17251e]" name="fullName" required minLength={2} maxLength={120} defaultValue={person.full_name} />
                  </label>
                  <label className="text-xs font-bold uppercase tracking-[.08em] text-[#7d8a83]">
                    Vai trò
                    {isSelf && <input type="hidden" name="role" value={person.role} />}
                    <select name="role" defaultValue={person.role} disabled={isSelf} className={`${selectClass} mt-2 normal-case tracking-normal text-[#17251e]`}>
                      <option value="sale">Nhân viên Sale</option>
                      <option value="leader">Sale Leader</option>
                      <option value="admin">Quản trị viên</option>
                    </select>
                  </label>
                  <label className="text-xs font-bold uppercase tracking-[.08em] text-[#7d8a83]">
                    Team
                    {isSelf && <input type="hidden" name="teamId" value={person.team_id ?? ""} />}
                    <select name="teamId" defaultValue={person.team_id ?? ""} disabled={isSelf} className={`${selectClass} mt-2 normal-case tracking-normal text-[#17251e]`}>
                      <option value="">Không thuộc team (Admin)</option>
                      {allTeams.map((team) => <option key={team.id} value={team.id} disabled={!team.is_active}>{team.name}{team.is_active ? "" : " · đã ngừng"}</option>)}
                    </select>
                  </label>
                  <Button type="submit" variant="secondary" className="min-h-11 px-4"><Save size={15} /> Lưu</Button>
                </form>
                <div className="mt-4 flex flex-col gap-3 border-t border-[#edf1ee] pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${person.is_active ? "bg-[#eaf2df] text-[#4c7044]" : "bg-[#f0f2f1] text-[#87928c]"}`}>{person.is_active ? "Hoạt động" : "Không hoạt động"}</span>
                    {isSelf && <p className="text-xs text-[#87928c]">Phiên Admin hiện tại chỉ được đổi tên.</p>}
                  </div>
                  <form action={managePerson}>
                    <input type="hidden" name="userId" value={person.id} />
                    <input type="hidden" name="fullName" value={person.full_name} />
                    <input type="hidden" name="role" value={person.role} />
                    <input type="hidden" name="teamId" value={person.team_id ?? ""} />
                    <input type="hidden" name="isActive" value={String(!person.is_active)} />
                    <Button type="submit" disabled={isSelf} variant={person.is_active ? "danger" : "secondary"} className="min-h-10 px-3">
                      {person.is_active ? <><PowerOff size={15} /> Khóa</> : <><Power size={15} /> Kích hoạt</>}
                    </Button>
                  </form>
                </div>
              </article>
            );
          })}
          {!profiles?.length && <p className="px-6 py-10 text-center text-sm text-[#87928c]">Chưa có thành viên.</p>}
        </div>
        <div className="border-t border-[#edf1ee] bg-[#fafbfa] px-6 py-4 text-xs leading-5 text-[#74827b]">
          <UserRoundCog className="mr-2 inline" size={15} />
          Trước khi khóa hoặc chuyển team một Sale, hãy chuyển khách và xử lý follow-up đang mở. Hệ thống sẽ chặn nếu lịch sử nghiệp vụ có nguy cơ bị bỏ rơi.
        </div>
      </section>
    </div>
  );
}
