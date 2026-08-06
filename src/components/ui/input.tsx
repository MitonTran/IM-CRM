import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "focus-ring min-h-11 w-full rounded-xl border border-[#cedbd3] bg-white px-3.5 text-[15px] text-[#17251f] shadow-sm placeholder:text-[#98a39e]",
        className,
      )}
      {...props}
    />
  );
}
