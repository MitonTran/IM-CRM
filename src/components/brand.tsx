import Link from "next/link";

export function Brand({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  return (
    <Link href="/dashboard" className="focus-ring inline-flex items-center gap-3 rounded-lg">
      <span className="grid size-10 place-items-center rounded-[13px] bg-[#173c2f] text-sm font-bold tracking-tight text-white shadow-lg shadow-emerald-950/15">
        IM
      </span>
      {!compact && (
        <span>
          <span className={`block text-[15px] font-bold leading-4 ${inverse ? "text-white" : "text-[#173c2f]"}`}>IELTS Mentor</span>
          <span className={`mt-1 block text-[11px] font-semibold uppercase tracking-[.16em] ${inverse ? "text-emerald-50/60" : "text-[#728078]"}`}>Thanh Hóa · CRM</span>
        </span>
      )}
    </Link>
  );
}
