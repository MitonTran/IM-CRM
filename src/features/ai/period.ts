import type { AiPeriod } from "./assistant-schema";

export function vietnamDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function startUtc(year: number, month: number, day = 1) {
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+07:00`).toISOString();
}

export function aiPeriodBounds(period: AiPeriod, now = new Date()) {
  const [year, month] = vietnamDateKey(now).split("-").map(Number);
  if (period === "this_year") return { start: startUtc(year, 1), end: startUtc(year + 1, 1), label: `năm ${year}` };
  if (period === "last_month") {
    const startYear = month === 1 ? year - 1 : year;
    const startMonth = month === 1 ? 12 : month - 1;
    return { start: startUtc(startYear, startMonth), end: startUtc(year, month), label: `tháng ${startMonth}/${startYear}` };
  }
  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  return { start: startUtc(year, month), end: startUtc(endYear, endMonth), label: `tháng ${month}/${year}` };
}
