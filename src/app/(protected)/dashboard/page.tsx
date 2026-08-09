import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Banknote, CalendarCheck, ContactRound, ListChecks, Medal, PhoneCall, Target, UsersRound } from "lucide-react";
import { getDashboardData } from "@/features/dashboard/data";
import { getPeriodBounds, parseDashboardQuery } from "@/features/dashboard/query";
import { TargetForm } from "@/features/dashboard/target-form";

export const metadata = { title: "Tổng quan KPI" };
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("vi-VN");

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parseDashboardQuery(await searchParams);
  const bounds = getPeriodBounds(query);
  const data = await getDashboardData(query, bounds);
  const firstName = data.viewer.name.trim().split(/\s+/).at(-1) ?? "bạn";
  const revenueTarget = data.targets.find((item) => item.metricCode === "revenue_vnd");
  const progress = revenueTarget?.targetValue ? Math.min(100, data.summary.revenue_vnd * 100 / revenueTarget.targetValue) : null;

  return <div className="mx-auto max-w-[1380px]">
    <header className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
      <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#728179]">Hiệu suất · {bounds.label}</p><h1 className="mt-2 text-3xl font-bold tracking-[-.035em] sm:text-4xl">Chào {firstName}, đây là nhịp bán hàng.</h1><p className="mt-2 text-sm text-[#718078]">KPI lấy từ hoạt động, task và giao dịch đã ghi nhận trong CRM.</p></div>
      <form method="get" className="grid gap-2 rounded-2xl border border-[#dfe7e2] bg-white p-3 sm:grid-cols-3 xl:min-w-[630px]">
        <select aria-label="Kỳ báo cáo" name="period" defaultValue={query.period} className="focus-ring min-h-11 rounded-xl border border-[#d8e2dc] bg-white px-3 text-sm"><option value="day">Theo ngày</option><option value="month">Theo tháng</option><option value="year">Theo năm</option></select>
        <input aria-label="Ngày tham chiếu" type="date" name="anchor" defaultValue={query.anchor} className="focus-ring min-h-11 rounded-xl border border-[#d8e2dc] px-3 text-sm" />
        <button className="focus-ring min-h-11 rounded-xl bg-[#176a4f] px-4 text-sm font-bold text-white">Xem kỳ</button>
        {data.viewer.role !== "sale" ? <><select aria-label="Lọc theo team" name="team" defaultValue={data.effectiveFilters.team} className="focus-ring min-h-11 rounded-xl border border-[#d8e2dc] bg-white px-3 text-sm" disabled={data.viewer.role === "leader"}><option value="">Mọi team</option>{data.teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Lọc theo nhân viên Sale" name="owner" defaultValue={data.effectiveFilters.user} className="focus-ring min-h-11 rounded-xl border border-[#d8e2dc] bg-white px-3 text-sm"><option value="">Mọi Sale</option>{data.owners.filter((item) => !data.effectiveFilters.team || item.teamId === data.effectiveFilters.team).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></> : null}
        <select aria-label="Lọc theo nguồn khách" name="source" defaultValue={data.effectiveFilters.source} className="focus-ring min-h-11 rounded-xl border border-[#d8e2dc] bg-white px-3 text-sm"><option value="">Mọi nguồn</option>{data.sources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </form>
    </header>

    <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={Banknote} label="Doanh thu" value={money.format(data.summary.revenue_vnd)} current={data.summary.revenue_vnd} previous={data.previous.revenue_vnd} href="/deals" tone="green" />
      <Metric icon={UsersRound} label="Khách mới" value={integer.format(data.summary.new_customers)} current={data.summary.new_customers} previous={data.previous.new_customers} href="/customers" tone="lime" />
      <Metric icon={PhoneCall} label="Lần liên hệ" value={integer.format(data.summary.contact_attempts)} current={data.summary.contact_attempts} previous={data.previous.contact_attempts} href="/customers" tone="sand" />
      <Metric icon={ListChecks} label="Task quá hạn hiện tại" value={integer.format(data.summary.overdue_now)} current={data.summary.overdue_now} previous={data.previous.overdue_now} href="/tasks" tone="rose" inverse />
    </section>

    <section className="mt-5 grid gap-5 xl:grid-cols-[1.18fr_.82fr]">
      <div className="card-shadow rounded-[24px] border border-[#e0e7e2] bg-white p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#596961]">Phễu chuyển đổi</p><h2 className="mt-2 text-xl font-bold tracking-[-.02em]">Từ liên hệ đến đăng ký</h2></div><span className="grid size-11 place-items-center rounded-2xl bg-[#edf3e3] text-[#426043]"><ContactRound size={20} /></span></div>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <FunnelStep label="Liên hệ thành công" value={data.summary.successful_contacts} rate={data.summary.contact_rate} />
          <FunnelStep label="Đến tư vấn" value={data.summary.consultations} rate={data.summary.appointment_to_consultation_rate} />
          <FunnelStep label="Tư vấn → thắng" value={data.summary.won_customers} rate={data.summary.consultation_to_win_rate} />
        </div>
        <div className="mt-6 grid gap-3 border-t border-[#e7ece9] pt-5 sm:grid-cols-3"><Mini label="Lịch hẹn" value={data.summary.appointments} /><Mini label="Task đúng hạn" value={`${data.summary.tasks_on_time}/${data.summary.tasks_completed}`} /><Mini label="Nhập muộn" value={data.summary.late_entries} /></div>
      </div>

      <div className="relative overflow-hidden rounded-[24px] bg-[#173c2f] p-6 text-white sm:p-7">
        <div className="absolute -right-12 -top-14 size-40 rounded-full bg-[#7e9a4d]/30 blur-2xl" />
        <Target className="relative text-[#c7db91]" size={23} /><p className="relative mt-7 text-xs font-bold uppercase tracking-[.14em] text-emerald-50/60">Mục tiêu doanh thu · {bounds.label}</p>
        {revenueTarget ? <><p className="relative mt-2 text-2xl font-bold">{money.format(data.summary.revenue_vnd)}</p><p className="relative mt-1 text-sm text-emerald-50/65">trên {money.format(revenueTarget.targetValue)}</p><div className="relative mt-6 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#c7db91]" style={{ width: `${progress ?? 0}%` }} /></div><p className="relative mt-3 text-sm font-bold text-[#d9e8af]">{progress?.toFixed(1)}% hoàn thành</p></> : <><p className="relative mt-3 text-2xl font-bold">Chưa đặt mục tiêu</p><p className="relative mt-3 text-sm leading-6 text-emerald-50/65">Chọn một Sale hoặc team để theo dõi tiến độ doanh thu của kỳ này.</p></>}
      </div>
    </section>

    {data.viewer.role !== "sale" ? <section className="mt-5 grid gap-5 xl:grid-cols-[1.18fr_.82fr]">
      <div className="card-shadow overflow-hidden rounded-[24px] border border-[#e0e7e2] bg-white"><div className="flex items-center justify-between border-b border-[#e7ece9] p-6"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#596961]">Theo Sale</p><h2 className="mt-2 text-xl font-bold">Bảng hiệu suất</h2></div><Medal className="text-[#8b6b32]" size={22} /></div>
        {data.leaderboard.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#f7f9f7] text-xs uppercase tracking-[.08em] text-[#596961]"><tr><th className="px-6 py-3">Sale</th><th className="px-4 py-3">Liên hệ</th><th className="px-4 py-3">Thành công</th><th className="px-4 py-3">Khách thắng</th><th className="px-4 py-3">Quá hạn</th><th className="px-6 py-3 text-right">Doanh thu</th></tr></thead><tbody>{data.leaderboard.map((row, index) => <tr key={row.user_id} className="border-t border-[#edf1ee]"><td className="px-6 py-4 font-bold"><span className="mr-3 text-[#596961]">{index + 1}</span>{row.full_name}</td><td className="px-4 py-4">{row.contact_attempts}</td><td className="px-4 py-4">{row.successful_contacts}</td><td className="px-4 py-4">{row.won_customers}</td><td className="px-4 py-4">{row.overdue_now}</td><td className="px-6 py-4 text-right font-bold">{money.format(row.revenue_vnd)}</td></tr>)}</tbody></table></div> : <p className="p-8 text-center text-sm text-[#596961]">Chưa có Sale trong phạm vi được chọn.</p>}
      </div>
      <div className="card-shadow rounded-[24px] border border-[#e0e7e2] bg-white p-6"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#596961]">Thiết lập</p><h2 className="mt-2 text-xl font-bold">Đặt mục tiêu KPI</h2><p className="mt-2 text-sm leading-6 text-[#596961]">Leader chỉ đặt cho team và Sale thuộc team của mình; Admin có thể đặt cho toàn hệ thống.</p><TargetForm teams={data.teams} owners={data.owners} period={query.period} start={bounds.startDate} end={bounds.endDate} defaultTeam={data.effectiveFilters.team} />{data.targets.length ? <div className="mt-5 border-t border-[#e7ece9] pt-4"><p className="text-xs font-bold uppercase tracking-[.1em] text-[#596961]">Mục tiêu đã đặt cho scope đang xem</p><div className="mt-3 flex flex-wrap gap-2">{data.targets.map((item) => <span key={item.metricCode} className="rounded-full bg-[#edf3e3] px-3 py-1.5 text-xs font-semibold text-[#426043]">{targetLabel(item.metricCode)}: {item.metricCode === "revenue_vnd" ? money.format(item.targetValue) : integer.format(item.targetValue)}</span>)}</div></div> : null}</div>
    </section> : null}
  </div>;
}

function Metric({ icon: Icon, label, value, current, previous, href, tone, inverse = false }: { icon: typeof Banknote; label: string; value: string; current: number; previous: number; href: string; tone: "green" | "lime" | "sand" | "rose"; inverse?: boolean }) {
  const tones = { green: "bg-[#dcece3] text-[#275b45]", lime: "bg-[#eaf1d6] text-[#566e2f]", sand: "bg-[#f4ead7] text-[#7d5b2a]", rose: "bg-[#f7e6e1] text-[#945444]" };
  const delta = previous === 0 ? null : (current - previous) * 100 / previous; const positive = delta !== null && (inverse ? delta <= 0 : delta >= 0);
  return <Link href={href} className="focus-ring card-shadow rounded-[22px] border border-[#e0e7e2] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#b9cdc1]"><div className="flex items-start justify-between"><span className={`grid size-10 place-items-center rounded-[14px] ${tones[tone]}`}><Icon size={19} /></span><ArrowUpRight size={16} className="text-[#a2ada7]" /></div><p className="mt-5 text-sm font-semibold text-[#66766e]">{label}</p><p className="mt-1 text-2xl font-bold tracking-[-.03em]">{value}</p><p className={`mt-3 inline-flex items-center gap-1 text-xs font-semibold ${delta === null ? "text-[#596961]" : positive ? "text-emerald-700" : "text-rose-700"}`}>{delta === null ? "Chưa có kỳ trước" : <>{delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(delta).toFixed(1)}% so với kỳ trước</>}</p></Link>;
}

function FunnelStep({ label, value, rate }: { label: string; value: number; rate: number | null }) { return <div className="rounded-2xl border border-[#e3e9e5] bg-[#f8faf8] p-4"><span className="grid size-9 place-items-center rounded-xl bg-white text-[#426043]"><CalendarCheck size={17} /></span><p className="mt-4 text-sm font-bold">{label}</p><p className="mt-2 text-2xl font-bold">{integer.format(value)}</p><p className="mt-1 text-xs font-semibold text-[#596961]">Tỷ lệ {rate === null ? "—" : `${rate.toFixed(1)}%`}</p></div>; }
function Mini({ label, value }: { label: string; value: number | string }) { return <div><p className="text-xs font-semibold text-[#596961]">{label}</p><p className="mt-1 text-lg font-bold">{typeof value === "number" ? integer.format(value) : value}</p></div>; }
function targetLabel(metric: string) { return ({ new_customers: "Khách mới", contact_attempts: "Liên hệ", successful_contacts: "Liên hệ thành công", appointments: "Lịch hẹn", consultations: "Tư vấn", tasks_on_time: "Task đúng hạn", won_customers: "Khách thắng", revenue_vnd: "Doanh thu" } as Record<string, string>)[metric] ?? metric; }
