# IM CRM

Ứng dụng CRM nội bộ cho IELTS Mentor Thanh Hóa, xây dựng bằng Next.js, Supabase và Vercel. Hệ thống quản lý khách hàng, hoạt động chăm sóc, follow-up, giao dịch, KPI, tài liệu và trợ lý AI theo phạm vi quyền Sale, Leader và Admin.

## Trạng thái

MVP đã có Vercel Preview và Supabase Preview riêng, với migration, RLS, kiểm thử database, unit test và Playwright E2E. Luồng AI M6 đã được smoke test có đăng nhập bằng dữ liệu giả, gồm Gemini embedding, Groq trả lời và citation mở file private. Production chưa được triển khai; không sử dụng dữ liệu thật trước khi hoàn tất UAT và cổng M7.

## Công nghệ

- Next.js 16, React 19 và TypeScript.
- Supabase Auth, PostgreSQL, RLS và Storage.
- Vercel cho Preview/Production và cron được bảo vệ bằng secret.
- Vitest, pgTAP và Playwright cho kiểm thử.
- AI gateway phía server hỗ trợ OpenAI, OpenRouter, Gemini, DeepSeek, Groq và NVIDIA NIM.

## Chạy local

Yêu cầu Node.js 22+, npm và Docker-compatible runtime.

```bash
npm install
cp .env.example .env.local
npm run db:start
npm run db:reset
npm run dev
```

Điền URL và publishable key của Supabase local vào `.env.local`. Mọi service-role key, cron secret và API key AI chỉ được đặt ở môi trường server; không dùng tiền tố `NEXT_PUBLIC_` và không commit giá trị thật.

## Kiểm tra

```bash
npm run lint
npm run typecheck
npm run test
npm run db:test
npm run test:e2e
npm run build
```

Sau khi có Vercel Preview URL, chạy smoke test chỉ đọc:

```bash
npm run smoke:deployment -- https://preview-domain.example
```

## Phát hành

Luồng bắt buộc là pull request → CI → Supabase Preview → Vercel Preview → smoke test/UAT → duyệt Production. Không apply migration hoặc triển khai trực tiếp lên Production.

- Thiết lập phát triển: [`docs/13-development-setup.md`](docs/13-development-setup.md)
- Runbook Preview → Production: [`docs/15-production-runbook.md`](docs/15-production-runbook.md)
- Checklist UAT: [`docs/16-uat-checklist.md`](docs/16-uat-checklist.md)
- Đặc tả đầy đủ: [`docs/`](docs/)

## Nguyên tắc an toàn

- RLS là lớp kiểm soát dữ liệu chính; UI không thay thế quyền ở database.
- Mọi thay đổi database phải đi qua migration mới và được thử trên Preview.
- AI chỉ dùng các tool đọc được allowlist, không chạy SQL tùy ý và không ghi CRM.
- Chỉ sử dụng dữ liệu giả trong local/Preview; không commit PII hoặc credential.
