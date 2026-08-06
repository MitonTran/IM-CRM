import { ChevronDown, ContactRound, LogOut, Settings2, UsersRound } from "lucide-react";
import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import { Brand } from "@/components/brand";
import { type Profile, ROLE_LABELS, canManagePeople } from "@/lib/access";
import { initials } from "@/lib/utils";

export function AppShell({ profile, teamName, children }: { profile: Profile; teamName?: string | null; children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="hidden min-h-screen border-r border-[#dce5df] bg-white/85 px-4 py-5 backdrop-blur lg:flex lg:flex-col">
        <div className="px-2"><Brand /></div>
        <AppNav />
        {canManagePeople(profile.role) && (
          <div className="mt-8 border-t border-[#e5ebe7] pt-5">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-[#93a099]">Quản trị</p>
            <Link href="/admin/people" className="focus-ring flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#506159] hover:bg-[#f0f4f1]"><UsersRound size={19} /> Nhân sự & team</Link>
            <span className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#a0aaa5]"><Settings2 size={19} /> Cấu hình</span>
          </div>
        )}
        <div className="mt-auto rounded-2xl border border-[#e2e9e4] bg-[#f7f9f7] p-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#dbeac4] text-xs font-bold text-[#315a42]">{initials(profile.full_name)}</span>
            <div className="min-w-0"><p className="truncate text-sm font-bold">{profile.full_name}</p><p className="truncate text-[11px] text-[#75837c]">{ROLE_LABELS[profile.role]}</p></div>
            <ChevronDown className="ml-auto text-[#91a099]" size={15} />
          </div>
          <form action="/auth/signout" method="post"><button className="focus-ring mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-[#75837c] hover:bg-white"><LogOut size={14} /> Đăng xuất</button></form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#dfe7e2] bg-[#f7f9f7]/90 px-5 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3 lg:hidden"><Brand compact /><Link href="/customers" aria-label="Khách hàng" className="focus-ring grid size-9 place-items-center rounded-xl text-[#557068] hover:bg-white"><ContactRound size={19} /></Link></div>
          <div className="hidden text-sm text-[#7b8982] lg:block">{teamName ?? "Toàn hệ thống"}</div>
          <div className="flex items-center gap-2 lg:hidden"><span className="grid size-9 place-items-center rounded-xl bg-[#dbeac4] text-xs font-bold text-[#315a42]">{initials(profile.full_name)}</span></div>
        </header>
        <main className="px-5 py-7 sm:px-7 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
