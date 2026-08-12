import { ArrowRight, CircleAlert } from "lucide-react";
import { Brand } from "@/components/brand";

export function SetupRequired() {
  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <Brand />
        <section className="grid min-h-[calc(100vh-8rem)] items-center gap-12 py-12 lg:grid-cols-[1.15fr_.85fr]">
          <div className="rise max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#c8dccd] bg-white/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-[.12em] text-[#35614e]">
              <span className="size-2 rounded-full bg-[#d49a35]" /> Cần hỗ trợ
            </div>
            <h1 className="font-[family-name:var(--font-display)] text-5xl leading-[1.08] font-semibold tracking-[-.035em] text-[#173c2f] sm:text-6xl">
              Một nơi để cả đội chăm sóc khách hàng tốt hơn.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[#66736d]">
              Hệ thống đang chờ hoàn tất thiết lập trước khi bạn có thể đăng nhập và làm việc.
            </p>
          </div>

          <div className="card-shadow rise rounded-[28px] border border-white/80 bg-white/90 p-6 backdrop-blur sm:p-8" style={{ animationDelay: "120ms" }}>
            <div className="mb-7 flex size-12 items-center justify-center rounded-2xl bg-[#e7f1d3] text-[#315f43]">
              <CircleAlert size={23} />
            </div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-[#849089]">Hệ thống chưa sẵn sàng</p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-.025em]">Vui lòng liên hệ quản trị viên</h2>
            <p className="mt-5 text-sm leading-6 text-[#607068]">
              Người phụ trách sẽ hoàn tất thiết lập và thông báo khi bạn có thể sử dụng IM CRM.
            </p>
            <a href="/login" className="focus-ring mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#166b4f] px-4 text-sm font-semibold text-white">
              Quay lại đăng nhập <ArrowRight size={17} />
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
