import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({ className, variant = "primary", ...props }: Props) {
  const variants = {
    primary: "bg-[#166b4f] text-white hover:bg-[#0f523d]",
    secondary: "border border-[#cedbd3] bg-white text-[#214136] hover:bg-[#f4f7f5]",
    ghost: "text-[#52665e] hover:bg-[#edf2ef] hover:text-[#173c2f]",
    danger: "bg-[#fff1ef] text-[#a33a2c] hover:bg-[#ffe5e1]",
  };

  return (
    <button
      className={cn(
        "focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
