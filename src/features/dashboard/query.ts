import { z } from "zod";

const uuidOrEmpty = z.union([z.uuid(), z.literal("")]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const schema = z.object({
  period: z.enum(["day", "month", "year"]).catch("month"),
  anchor: z.string().regex(datePattern).refine(isRealDate).catch(todayInVietnam()),
  owner: uuidOrEmpty.catch(""),
  team: uuidOrEmpty.catch(""),
  source: uuidOrEmpty.catch(""),
});

export type DashboardQuery = z.infer<typeof schema>;
export type DashboardPeriod = DashboardQuery["period"];
export type PeriodBounds = {
  period: DashboardPeriod;
  startDate: string;
  endDate: string;
  startUtc: string;
  endUtc: string;
  previousStartUtc: string;
  previousEndUtc: string;
  label: string;
};

function isRealDate(value: string) {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function todayInVietnam() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts();
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function vietnamStartUtc(key: string) {
  return new Date(`${key}T00:00:00+07:00`).toISOString();
}

export function parseDashboardQuery(input: Record<string, string | string[] | undefined>): DashboardQuery {
  const first = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  return schema.parse(first);
}

export function getPeriodBounds(query: Pick<DashboardQuery, "period" | "anchor">): PeriodBounds {
  const [year, month, day] = query.anchor.split("-").map(Number);
  let start = new Date(Date.UTC(year, month - 1, day));
  let endExclusive: Date;
  let previousStart: Date;
  let label: string;

  if (query.period === "year") {
    start = new Date(Date.UTC(year, 0, 1));
    endExclusive = new Date(Date.UTC(year + 1, 0, 1));
    previousStart = new Date(Date.UTC(year - 1, 0, 1));
    label = `Năm ${year}`;
  } else if (query.period === "month") {
    start = new Date(Date.UTC(year, month - 1, 1));
    endExclusive = new Date(Date.UTC(year, month, 1));
    previousStart = new Date(Date.UTC(year, month - 2, 1));
    label = `Tháng ${month}/${year}`;
  } else {
    endExclusive = new Date(Date.UTC(year, month - 1, day + 1));
    previousStart = new Date(Date.UTC(year, month - 1, day - 1));
    label = new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(start);
  }

  const endDate = new Date(endExclusive.getTime() - 86_400_000);
  return {
    period: query.period,
    startDate: dateKey(start),
    endDate: dateKey(endDate),
    startUtc: vietnamStartUtc(dateKey(start)),
    endUtc: vietnamStartUtc(dateKey(endExclusive)),
    previousStartUtc: vietnamStartUtc(dateKey(previousStart)),
    previousEndUtc: vietnamStartUtc(dateKey(start)),
    label,
  };
}

