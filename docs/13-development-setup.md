# Thiết lập phát triển

## Yêu cầu

- Node.js 22 trở lên, npm và Docker-compatible runtime (worker PDF dùng runtime Node 22+).
- Supabase project phát triển/Preview tách biệt Production.

## Local

1. Sao chép `.env.example` thành `.env.local` và điền URL/publishable key local hoặc project phát triển. Chỉ điền service role ở môi trường server tin cậy.
2. Chạy `npm install`.
3. Chạy `npm run db:start`, sau đó `npm run db:reset`.
4. Lấy URL và publishable key từ kết quả Supabase local, cập nhật `.env.local`.
5. Chạy `npm run dev`.

## Cấu hình AI từ M6

- Chọn `AI_PROVIDER` trong allowlist `openai`, `openrouter`, `gemini`, `deepseek`, `nvidia`; đặt `AI_MODEL` và đúng một key tương ứng trong `.env.local`/Vercel Environment Variables. Không dùng tiền tố `NEXT_PUBLIC_` và không commit giá trị thật.
- Endpoint được cố định trong backend, không nhận URL tùy ý từ frontend. Nếu provider/key sai hoặc thiếu, nút phân tích trả thông báo cấu hình và không tạo request/quota dang dở.
- Gateway vẫn kiểm tra mọi kết quả bằng cùng schema Zod và evidence trong snapshot trước khi lưu. OpenAI dùng Responses API với `store: false`; các provider tương thích dùng Chat Completions.
- Trang `/ai` dùng hai lượt gọi có cấu trúc: lập kế hoạch tool rồi soạn câu trả lời từ kết quả đã qua RLS. Cần cấu hình `SUPABASE_SERVICE_ROLE_KEY` ở server để chỉ ghi completion/failure; key này không được dùng cho retrieval và không được lộ ra client.
- Để chạy retention 90 ngày, gọi `purge_expired_ai_history()` từ job server tin cậy bằng `service_role`; không cấp RPC này cho user thường.
- `vercel.json` gọi extraction lúc `18:00 UTC` và retention AI lúc `18:30 UTC` mỗi ngày. Cả hai route yêu cầu đúng `Authorization: Bearer <CRON_SECRET>`; response lỗi không trả chi tiết database.
- Chỉ cấu hình và thử bằng Vercel Preview/Supabase Preview trước Production. Kết quả AI là đề xuất, không tự ghi customer, activity, follow-up hoặc deal.

| `AI_PROVIDER` | Key server | Model mặc định | Ghi chú khởi đầu |
|---|---|---|---|
| `openrouter` | `OPENROUTER_API_KEY` | `openrouter/free` | Miễn phí, model được router chọn; giới hạn và model có thể thay đổi. |
| `gemini` | `GEMINI_API_KEY` | `gemini-3.1-flash-lite` | Có free tier theo quota Google AI Studio. |
| `nvidia` | `NVIDIA_NIM_API_KEY` | `nvidia/nemotron-3-nano-30b-a3b` | Free endpoint/trial cho phát triển, có thể bị rate limit. |
| `deepseek` | `DEEPSEEK_API_KEY` | `deepseek-v4-flash` | Chi phí thấp nhưng API chính thức không mặc định miễn phí. |
| `openai` | `OPENAI_API_KEY` | `gpt-5.6-terra` | Giữ tích hợp Structured Outputs hiện tại. |

Ví dụ khởi đầu với OpenRouter:

```dotenv
AI_PROVIDER=openrouter
AI_MODEL=openrouter/free
OPENROUTER_API_KEY=<đặt trong môi trường server>
```

Free tier có điều khoản lưu trữ/sử dụng dữ liệu khác nhau và có thể thay đổi. Chỉ dùng dữ liệu giả trong dev/Preview; không gửi dữ liệu CRM thật cho free endpoint trước khi duyệt điều khoản riêng tư, vùng xử lý dữ liệu, retention và hợp đồng phù hợp.

## Admin đầu tiên

Đây là thao tác bootstrap duy nhất và phải thực hiện trong Supabase Dashboard/SQL Editor của môi trường mới, không qua frontend:

1. Tạo user email đã xác minh trong Authentication > Users.
2. Lấy UUID user và chạy câu lệnh sau với UUID thật trong SQL Editor:

```sql
update public.profiles
set role = 'admin', is_active = true
where id = '<UUID_ADMIN>';
```

Không đưa email, mật khẩu hoặc UUID thật vào migration/seed/repository. Sau bootstrap, Admin mời các thành viên khác trong màn hình “Nhân sự & team”.

Email mời và email khôi phục phải đưa người dùng qua `/auth/confirm` hoặc `/auth/callback`, sau đó tới `/auth/update-password`. Màn hình đăng nhập có liên kết “Quên mật khẩu”; phản hồi gửi email luôn dùng thông báo chung để không tiết lộ tài khoản có tồn tại. Với email template mặc định, thêm URL `/auth/callback?next=/auth/update-password` vào Redirect URLs và mở email trong cùng trình duyệt đã yêu cầu khôi phục để hoàn tất PKCE.

Khi đã cấu hình custom SMTP và Dashboard cho phép sửa Auth Email Templates, ưu tiên liên kết token-hash phía server cho Invite user và Reset password để người dùng có thể mở email ở trình duyệt khác:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/update-password">Hoàn tất tài khoản</a>
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password">Đặt lại mật khẩu</a>
```

## Kiểm tra

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run db:test` khi Supabase local đang chạy
- `npm run test:e2e` khi Supabase local đang chạy
- `npm run build`

### E2E local

`npm run test:e2e` tự động build bản production, khởi động app ở `127.0.0.1:3200` và chạy Playwright Chromium với 5 luồng auth/quyền. Global setup tạo dữ liệu giả cho Sale A, Sale B, Leader hai team và Admin; global teardown dọn các fixture này sau khi chạy. Cả hai bước chỉ hoạt động khi Supabase API lẫn PostgreSQL URL trỏ về `localhost`/`127.0.0.1`.

Không chạy bộ fixture này với Preview hoặc Production. Tài khoản dùng tên miền `example.invalid`; có thể xóa toàn bộ dữ liệu local sau khi kiểm tra bằng `npm run db:reset`.

E2E cũng kiểm tra health/security headers và baseline production-like cho `/login`, `/dashboard`, `/customers`. Guardrail local/CI hiện tại: TTFB dưới 2 giây, DOMContentLoaded dưới 3,5 giây, load dưới 5 giây, tổng transfer dưới 3 MB và JavaScript transfer dưới 1,5 MB cho mỗi full navigation. File `performance-baseline.json` được đính kèm vào test result; GitHub Actions lưu cả thư mục `test-results` trong artifact `playwright-results` 14 ngày. Đây là ngưỡng chống hồi quy, không thay thế Lighthouse và Core Web Vitals thật trên Vercel Preview.

## Preview

Tạo Supabase branch/project Preview và Vercel Preview với secret riêng. Chạy migration bằng Supabase CLI đã link đúng project, kiểm tra ba role rồi mới xem xét Production.

Sau deploy, kiểm tra `GET /api/health` trả `200`, `Cache-Control: no-store`, sau đó kiểm tra CSP/security headers trên `/login`. Liveness không thay thế smoke test đăng nhập và quyền dữ liệu.

Có thể chạy kiểm tra chỉ đọc bằng `npm run smoke:deployment -- https://<preview-domain>`. Script từ chối HTTP từ xa, URL chứa credential/path/query, kiểm tra health, nội dung login, security headers và budget phản hồi 5 giây; báo cáo không chứa bypass secret. Workflow `Preview smoke` trong GitHub Actions nhận `preview_url` thủ công và lưu `deployment-smoke.json` 14 ngày.

Nếu Vercel Preview bật Deployment Protection, tạo Protection Bypass for Automation riêng cho CI và lưu giá trị vào GitHub Actions secret `VERCEL_AUTOMATION_BYPASS_SECRET`. Script chỉ gửi secret bằng header `x-vercel-protection-bypass`; không đặt secret trong URL, repository hoặc report. Có thể bỏ secret này nếu Preview không được bảo vệ.
