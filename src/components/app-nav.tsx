"use client";

import { Banknote, BarChart3, BookOpen, Bot, CircleGauge, ContactRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { label: "Tổng quan", href: "/dashboard", icon: CircleGauge, enabled: true },
  { label: "Khách hàng", href: "/customers", icon: ContactRound, enabled: true },
  { label: "Công việc", href: "/tasks", icon: BarChart3, enabled: true },
  { label: "Giao dịch", href: "/deals", icon: Banknote, enabled: true },
  { label: "Tài liệu", href: "/documents", icon: BookOpen, enabled: true },
  { label: "Trợ lý AI", href: "/ai", icon: Bot, enabled: true },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Điều hướng chính" className="mt-10 space-y-1">
      {nav.map(({ label, href, icon: Icon, enabled }) => {
        const active = enabled && (pathname === href || pathname.startsWith(`${href}/`));
        return (
          <Link key={label} href={href} aria-disabled={!enabled} aria-current={active ? "page" : undefined} tabIndex={enabled ? 0 : -1}
            className={`focus-ring flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${active ? "bg-[#eaf2df] text-[#24563f]" : enabled ? "text-[#66766e] hover:bg-[#f0f4f1]" : "cursor-not-allowed text-[#9aa59f]"}`}>
            <Icon size={19} /> {label} {!enabled && <span className="ml-auto text-[9px] font-bold uppercase tracking-wider">Sắp có</span>}
          </Link>
        );
      })}
    </nav>
  );
}
