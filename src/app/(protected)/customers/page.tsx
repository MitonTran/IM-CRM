import { ChevronLeft, ChevronRight, Filter, Plus, Search, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { CreateCustomerForm, EditCustomerForm, ManagementForms } from "@/features/customers/customer-forms";
import { CustomersTable } from "@/features/customers/customers-table";
import { CustomerJourney } from "@/features/customers/customer-journey";
import { CustomerDeals } from "@/features/deals/customer-deals";
import { buildDealAmendmentKeys } from "@/features/deals/amendment-access";
import { CUSTOMER_PAGE_SIZE, getCustomerDetail, getCustomerPageData } from "@/features/customers/data";
import { customerQueryString, parseCustomerQuery } from "@/features/customers/query";
import { CUSTOMER_STATUSES, STATUS_LABELS } from "@/features/customers/types";
import { CustomerAnalysisPanel } from "@/features/ai/customer-analysis-panel";

export const metadata = { title: "Khách hàng" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parseCustomerQuery(await searchParams);
  const [pageData, detail] = await Promise.all([getCustomerPageData(query), query.customer ? getCustomerDetail(query.customer) : Promise.resolve(null)]);
  const totalPages = Math.max(1, Math.ceil(pageData.count / CUSTOMER_PAGE_SIZE));
  const closeDetailHref = `/customers?${customerQueryString(query, { customer: null })}`;
  const amendmentKeys = detail ? buildDealAmendmentKeys(detail.deals, pageData.viewer) : {};

  return <div className="mx-auto max-w-[1500px]">
    <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#728179]">Quan hệ khách hàng</p><h1 className="mt-2 text-3xl font-bold tracking-[-.035em] sm:text-4xl">Khách hàng</h1><p className="mt-2 text-sm text-[#718078]">Theo dõi khách, người phụ trách và tiến độ tư vấn trong một nơi.</p></div><Link href={`/customers?${customerQueryString(query, { new: "1", customer: null })}`} className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#176a4f] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#11583f]"><Plus size={17} /> Thêm khách hàng</Link></header>

    <section className="card-shadow mt-7 overflow-hidden rounded-[22px] border border-[#dfe7e2] bg-white">
      <form method="get" className="grid gap-3 border-b border-[#e4ebe7] p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="relative"><span className="sr-only">Tìm khách hàng</span><Search className="pointer-events-none absolute left-3 top-3.5 text-[#829088]" size={17} /><input name="q" defaultValue={query.q} className="focus-ring min-h-11 w-full rounded-xl border border-[#d9e2dd] bg-[#fbfcfb] pl-10 pr-3 text-sm outline-none" placeholder="Tên, điện thoại hoặc email" /></label>
        <label><span className="sr-only">Trạng thái</span><select name="status" defaultValue={query.status} className="focus-ring min-h-11 w-full rounded-xl border border-[#d9e2dd] bg-white px-3 text-sm"><option value="">Mọi trạng thái</option>{CUSTOMER_STATUSES.map((status) => <option value={status} key={status}>{STATUS_LABELS[status]} ({pageData.facets.status[status] ?? 0})</option>)}</select></label>
        <label><span className="sr-only">Người phụ trách</span><select name="owner" defaultValue={query.owner} className="focus-ring min-h-11 w-full rounded-xl border border-[#d9e2dd] bg-white px-3 text-sm"><option value="">Mọi người phụ trách</option>{pageData.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label>
        <label><span className="sr-only">Nguồn khách</span><select name="source" defaultValue={query.source} className="focus-ring min-h-11 w-full rounded-xl border border-[#d9e2dd] bg-white px-3 text-sm"><option value="">Mọi nguồn</option>{pageData.sources.map((source) => <option key={source.id} value={source.id}>{source.name} ({pageData.facets.source[source.id] ?? 0})</option>)}</select></label>
        <label><span className="sr-only">Nhóm</span><select name="team" defaultValue={query.team} className="focus-ring min-h-11 w-full rounded-xl border border-[#d9e2dd] bg-white px-3 text-sm"><option value="">Mọi nhóm</option>{pageData.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label><span className="sr-only">Nhãn</span><select name="tag" defaultValue={query.tag} className="focus-ring min-h-11 w-full rounded-xl border border-[#d9e2dd] bg-white px-3 text-sm"><option value="">Mọi nhãn</option>{pageData.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>
        <label><span className="sr-only">Sắp xếp</span><select name="sort" defaultValue={query.sort} className="focus-ring min-h-11 w-full rounded-xl border border-[#d9e2dd] bg-white px-3 text-sm"><option value="updated_at">Cập nhật gần đây</option><option value="full_name">Tên khách hàng</option><option value="status">Trạng thái</option><option value="priority">Ưu tiên</option></select></label>
        <input type="hidden" name="dir" value={query.dir} />
        <button className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#cbd8d0] px-4 text-sm font-bold text-[#315d49] hover:bg-[#f2f7f2]"><Filter size={16} /> Áp dụng bộ lọc</button>
      </form>
      <div className="flex items-center justify-between border-b border-[#edf1ee] px-4 py-3"><p className="text-sm font-semibold text-[#64736b]"><span className="font-bold text-[#20342b]">{pageData.count}</span> khách hàng</p>{(query.q || query.status || query.owner || query.source || query.team || query.tag) && <Link href="/customers" className="text-xs font-bold text-[#176a4f] hover:underline">Xóa bộ lọc</Link>}</div>
      <CustomersTable rows={pageData.rows} />
      <footer className="flex items-center justify-between px-4 py-4 text-sm text-[#69776f]"><span>Trang {Math.min(query.page, totalPages)} / {totalPages}</span><div className="flex gap-2"><Link aria-label="Trang trước" aria-disabled={query.page <= 1} tabIndex={query.page <= 1 ? -1 : 0} href={`/customers?${customerQueryString(query, { page: Math.max(1, query.page - 1), customer: null })}`} className={`focus-ring grid size-10 place-items-center rounded-xl border border-[#dbe3de] ${query.page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-[#f4f8f4]"}`}><ChevronLeft size={17} /></Link><Link aria-label="Trang sau" aria-disabled={query.page >= totalPages} tabIndex={query.page >= totalPages ? -1 : 0} href={`/customers?${customerQueryString(query, { page: Math.min(totalPages, query.page + 1), customer: null })}`} className={`focus-ring grid size-10 place-items-center rounded-xl border border-[#dbe3de] ${query.page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-[#f4f8f4]"}`}><ChevronRight size={17} /></Link></div></footer>
    </section>

    {query.new === "1" && <Drawer title="Thêm khách hàng" closeHref={`/customers?${customerQueryString(query, { new: null })}`}><CreateCustomerForm sources={pageData.sources} owners={pageData.owners} teams={pageData.teams} tags={pageData.tags} role={pageData.viewer.role} /></Drawer>}
    {query.customer && <Drawer title={detail?.fullName ?? "Không tìm thấy khách hàng"} closeHref={closeDetailHref}>{detail ? <div className="space-y-7"><div className="flex items-center gap-3 rounded-2xl bg-[#f4f8f3] p-4"><span className="grid size-11 place-items-center rounded-2xl bg-[#deedca] text-[#315b43]"><UsersRound size={20} /></span><div><p className="text-sm font-bold">{detail.ownerName ?? "Chưa giao"}</p><p className="mt-0.5 text-xs text-[#738179]">{detail.teamName} · {detail.sourceName}</p></div></div><CustomerAnalysisPanel customerId={detail.id} analyses={detail.aiAnalyses} enabled={detail.aiEnabled} /><CustomerJourney customerId={detail.id} activities={detail.activities} followUps={detail.followUps} /><CustomerDeals customerId={detail.id} deals={detail.deals} viewer={pageData.viewer} idempotencyKey={crypto.randomUUID()} amendmentKeys={amendmentKeys} /><details className="rounded-2xl border border-[#dfe7e2] bg-white p-4"><summary className="focus-ring cursor-pointer list-none rounded-lg font-bold">Thông tin khách hàng</summary><div className="mt-5"><EditCustomerForm customer={detail} sources={pageData.sources} tags={pageData.tags} /></div></details>{pageData.viewer.role !== "sale" && <ManagementForms customerId={detail.id} owners={pageData.owners} />}</div> : <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">Bản ghi không tồn tại hoặc bạn không có quyền xem.</p>}</Drawer>}
  </div>;
}

function Drawer({ title, closeHref, children }: { title: string; closeHref: string; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex justify-end bg-[#10281e]/30 backdrop-blur-[2px]"><Link href={closeHref} aria-label="Đóng" className="absolute inset-0" /><aside role="dialog" aria-modal="true" aria-label={title} className="relative h-full w-full overflow-y-auto border-l border-[#dce5df] bg-[#fbfcfb] p-5 shadow-2xl sm:max-w-xl sm:p-7"><header className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-[#78867e]">Hồ sơ khách hàng</p><h2 className="mt-2 text-2xl font-bold tracking-[-.025em]">{title}</h2></div><Link href={closeHref} aria-label="Đóng" className="focus-ring grid size-10 shrink-0 place-items-center rounded-xl border border-[#dbe4de] bg-white hover:bg-[#f2f6f3]"><X size={18} /></Link></header>{children}</aside></div>;
}
