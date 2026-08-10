import type { AppRole } from "@/lib/access";
import type { AiCustomerAnalysisItem } from "@/features/ai/schema";

export const CUSTOMER_STATUSES = ["new", "contacting", "consulting", "follow_up", "won", "lost", "unqualified"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
export const CUSTOMER_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type CustomerPriority = (typeof CUSTOMER_PRIORITIES)[number];
export const ACTIVITY_TYPES = ["call", "message", "appointment", "consultation", "note"] as const;
export type UserActivityType = (typeof ACTIVITY_TYPES)[number];
export const ACTIVITY_OUTCOMES = ["connected", "no_answer", "replied", "booked", "attended", "cancelled", "interested", "objection", "not_interested", "completed"] as const;
export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number];

export const STATUS_LABELS: Record<CustomerStatus, string> = {
  new: "Mới", contacting: "Đang liên hệ", consulting: "Đang tư vấn", follow_up: "Cần theo dõi",
  won: "Đã chốt", lost: "Đã mất", unqualified: "Không phù hợp",
};

export const PRIORITY_LABELS: Record<CustomerPriority, string> = {
  low: "Thấp", normal: "Bình thường", high: "Cao", urgent: "Khẩn cấp",
};

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  customer_created: "Tạo khách", call: "Cuộc gọi", message: "Tin nhắn", appointment: "Lịch hẹn",
  consultation: "Tư vấn", note: "Ghi chú", status_change: "Đổi trạng thái",
  assignment_change: "Chuyển phụ trách", registration: "Đăng ký",
};

export const ACTIVITY_OUTCOME_LABELS: Record<ActivityOutcome, string> = {
  connected: "Đã kết nối", no_answer: "Không nghe máy", replied: "Đã phản hồi", booked: "Đã đặt lịch",
  attended: "Đã tham dự", cancelled: "Đã hủy", interested: "Quan tâm", objection: "Có băn khoăn",
  not_interested: "Không quan tâm", completed: "Hoàn thành",
};

export type ActivityItem = {
  id: string; type: string; outcome: ActivityOutcome | null; content: string | null; occurredAt: string;
  performerName: string; nextAction: string | null; followUpAt: string | null; isLateEntry: boolean;
};

export type FollowUpTask = {
  id: string; dueAt: string; status: "pending" | "completed" | "cancelled"; priority: CustomerPriority;
  completionReason: string | null; assigneeName: string; nextAction: string;
};

export type DealItem = {
  id: string; customerId: string; customerName: string; ownerName: string; teamName: string;
  amountVnd: number; registeredAt: string; status: "active" | "void"; note: string | null;
  voidReason: string | null; createdAt: string; createdBy: string | null;
  replacesDealId: string | null; amendmentReason: string | null;
};

export type CustomerListItem = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  status: CustomerStatus;
  priority: CustomerPriority;
  sourceName: string;
  ownerName: string | null;
  teamName: string;
  updatedAt: string;
};

export type CustomerDetail = CustomerListItem & {
  sourceId: string;
  statusReason: string | null;
  noteSummary: string | null;
  tags: { id: string; name: string; color: string }[];
  activities: ActivityItem[];
  followUps: FollowUpTask[];
  deals: DealItem[];
  aiAnalyses: AiCustomerAnalysisItem[];
  aiEnabled: boolean;
  aiProviderName: string;
};

export type CustomerOption = { id: string; name: string };
export type OwnerOption = CustomerOption & { teamId: string | null };

export type CustomerPageData = {
  rows: CustomerListItem[];
  count: number;
  sources: CustomerOption[];
  tags: (CustomerOption & { color: string })[];
  owners: OwnerOption[];
  teams: CustomerOption[];
  facets: { status: Record<string, number>; source: Record<string, number> };
  viewer: { id: string; role: AppRole; teamId: string | null };
};
