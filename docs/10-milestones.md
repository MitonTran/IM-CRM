# Lộ trình và issue triển khai

## Thứ tự milestone

| Mốc | Mục tiêu | Phạm vi/nhiệm vụ | Hoàn thành khi | Rủi ro | Không làm |
|---|---|---|---|---|---|
| M1 Nền tảng/Auth | khung an toàn | Next.js, UI, env, Supabase clients, profiles/teams, auth, RLS test, CI/Preview | 3 role đăng nhập và quyền nền tảng pass | SSR session, policy sai | CRM/AI |
| M2 CRM khách | hồ sơ và giao khách | sources, customers, tag, chống trùng, list/detail/form, assignment/transfer | CRUD đúng quyền và audit | trùng, chuyển giao lỗi | merge tự động/integration |
| M3 Hành trình | hoạt động/follow-up/deal | activities, timeline, tasks, overdue, deals | quy trình Sale end-to-end truy vết được | timezone, nhập trùng | tổng đài/nhắc ngoài app |
| M4 KPI/Dashboard | đo hiệu quả | targets, functions, 3 dashboard, drill-down | công thức khớp dữ liệu nguồn và quyền | định nghĩa lệch | BI ngoài hệ thống |
| M5 Tài liệu | kho tri thức | bucket private, metadata/version, ACL, upload/preview/search, extraction | file/ACL/version và trạng thái xử lý pass | parser/file độc | public sharing |
| M6 AI | hỗ trợ có kiểm soát | analysis JSON, tool calling, RAG/citation, history/quota | không vượt quyền, output validate, usage lưu | hallucination/cost | AI ghi CRM |
| M7 Hardening/Go-live | sẵn sàng thật | E2E, security/performance, backup/runbook, training, production deploy | checklist Production và UAT ký duyệt | dữ liệu seed/quy trình | mở rộng scope |

## Issues và phụ thuộc

| ID | Issue | Phụ thuộc | Có thể song song |
|---|---|---|---|
| 1.1 | Khởi tạo Next.js/TypeScript/Tailwind/shadcn, CI | không | 1.2 |
| 1.2 | Supabase local, env, migration conventions | không | 1.1 |
| 1.3 | Auth SSR, profiles/teams/roles | 1.1,1.2 | UI shell |
| 1.4 | RLS helpers, policy test harness | 1.3 | audit schema |
| 2.1 | Schema nguồn/khách/tag + RLS | 1.4 | wireframe CRM |
| 2.2 | Customer list/search/form/detail; URL-state, DataTable dùng chung và detail sheet | 2.1 | 2.3 sau API ổn |
| 2.3 | Assignment/transfer RPC + audit | 2.1 | 2.2 |
| 3.1 | Activities/timeline | 2.1 | 3.2 schema design |
| 3.2 | Follow-up task/overdue | 3.1 | deal UI |
| 3.3 | Deal/idempotency/audit | 2.1 | 3.1 |
| 4.1 | KPI definitions/targets/functions | 3.1–3.3 | dashboard UI shell |
| 4.2 | Dashboard Sale | 4.1 | 4.3 |
| 4.3 | Dashboard Leader/Admin | 4.1 | 4.2 |
| 5.1 | Document schema/Storage policy | 1.4 | extraction spike |
| 5.2 | Upload/version/preview/search | 5.1 | parser workers |
| 5.3 | Extraction/chunk/embedding | 5.1 | 5.2 |
| 6.1 | AI gateway, quota/history | 1.4 | prompt/eval fixtures |
| 6.2 | Customer analysis structured output | 3.1,6.1 | 6.3 tool design |
| 6.3 | CRM tools + RAG/citations | 4.1,5.3,6.1 | 6.2 |
| 7.1 | E2E/UAT/security/performance | 2–6 | docs/training |
| 7.2 | Runbook, Preview→Production | 7.1 | không |

M6.3 đã có hội thoại owner-only, 7 tool đọc allowlist, hybrid RAG có ACL/citation và lexical fallback, quota dùng chung và audit metadata. Groq `openai/gpt-oss-20b` đã pass `3/3` hợp đồng live eval bằng dữ liệu giả ngày 2026-08-08. Migration pgvector, Gemini embedding queue và hybrid ranking đã qua 336 database/RLS tests; smoke test có đăng nhập trên Vercel + Supabase Preview ngày 2026-08-09 đã xác nhận Gemini embedding, Groq trả lời đúng evidence và citation mở file private. Bằng chứng đã khử secret nằm tại `docs/17-ai-provider-eval-evidence.md`. Ký duyệt UAT nhiều vai trò vẫn thuộc cổng M7, không phải lý do để đưa bản này lên Production.

M7.1 đã có CSP nonce theo request, security headers, liveness endpoint, global error/404, Vercel cron cho retention AI, Playwright E2E cho đăng nhập/phạm vi Sale–Leader–Admin và performance budget production-like trong CI. Workflow có đăng nhập trên Vercel Preview ngày 2026-08-09 đã pass public smoke cùng lab Web Vitals cho `/login`, `/dashboard`, `/customers`; bằng chứng nằm tại `docs/18-preview-performance-evidence.md`. Lighthouse/Speed Insights field data và UAT có người dùng ký duyệt vẫn là điều kiện chưa hoàn tất.

M7.2 đã có bản nháp runbook Preview→Production, rollback/incident/backup, checklist UAT năm vai trò và GitHub workflow smoke test deployment chỉ đọc. Chưa đánh dấu hoàn tất cho đến khi chốt RTO/RPO + Supabase plan, diễn tập restore và ký UAT trên Preview.

Schema/RLS phải đi trước UI ghi dữ liệu. AI RAG bắt buộc sau ACL tài liệu; KPI sau khi activity/deal ổn định.

### Phân rã bổ sung cho issue 2.2

1. `2.2a`: query schema và parser URL có allowlist cho search/filter/sort/page.
2. `2.2b`: `DataTable` dùng chung gồm responsive columns, sticky header, loading/empty/error và pagination.
3. `2.2c`: bảng khách hàng với facet counts đã lọc theo RLS; row hover/focus prefetch có kiểm soát.
4. `2.2d`: create-customer sheet, chống submit trùng và cảnh báo khách trùng từ backend.
5. `2.2e`: customer detail sheet đồng bộ URL; giữ view danh sách và hỗ trợ Back/Forward.

Các phần có thể làm song song sau khi hợp đồng query ổn định: component `DataTable`, khung detail sheet và form UI. Query Supabase, facet counts và mọi kiểm tra quyền phải tuần tự sau migration `2.1`.

## Prompt mẫu giao issue cho Codex

```text
Thực hiện issue <ID/tên> theo docs/ trong repository. Trước khi sửa hãy đọc AGENTS.md và các tài liệu liên quan. Không mở rộng phạm vi. Nêu giả định; tạo migration nếu đổi database; giữ RLS. Viết test gồm happy path, validation và kiểm tra quyền. Chạy lint, typecheck, test; báo file đã sửa, migration, kết quả kiểm tra và rủi ro còn lại. Dừng nếu thay đổi schema cốt lõi hoặc quyền so với đặc tả.
```

## Checklist trước merge

- Scope/acceptance đúng issue; không thay đổi ngoài ý muốn.
- Migration/RLS/index được review; không có secret/service role ở client.
- Test quyền và trạng thái UI; lint/typecheck/test xanh.
- Error/log không lộ PII; accessibility cơ bản; tài liệu cập nhật.
- Preview smoke test và reviewer xem diff/migration.

## Checklist trước Production

- UAT theo cả 3 role; backup/khôi phục và rollback/runbook đã duyệt.
- Production env đúng, secret xoay và tách Preview; migration đã thử trên bản sao.
- RLS/Storage/AI quota/rate limit pass; dữ liệu demo không lẫn Production.
- Domain, HTTPS, monitoring, owner xử lý sự cố và thông báo người dùng sẵn sàng.
- Apply migration có kiểm soát, deploy Vercel, smoke test rồi theo dõi.
