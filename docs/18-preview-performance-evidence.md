# Bằng chứng smoke và hiệu năng Vercel Preview

## Phiên kiểm tra 2026-08-09

- Commit: `77474c509c73ddb7ddb980ab38a646af7be52520` trên nhánh `codex/preview-performance-audit`.
- Vercel Preview: `https://im-crm-git-codex-preview-p-2d339c-thongtmmmd-gmailcoms-projects.vercel.app`.
- GitHub Actions: `https://github.com/MitonTran/IM-CRM/actions/runs/31305363447`.
- Thời gian hoàn tất audit: `2026-08-09T09:14:00.160Z`.
- Phương pháp: Playwright Chromium, ba browser context lạnh cho mỗi route, lấy median.
- Tài khoản: Admin UAT trên Supabase Preview, credential chỉ nằm trong GitHub Actions secrets; report và log không chứa email hoặc mật khẩu.

Public deployment smoke đạt các kiểm tra `/api/health`, nội dung đăng nhập, security headers và response budget.

| Route | TTFB | FCP | LCP | CLS | Transfer | JavaScript | Kết quả |
|---|---:|---:|---:|---:|---:|---:|---|
| `/login` | 15 ms | 188 ms | 188 ms | 0 | 328,753 B | 142,217 B | Pass |
| `/dashboard` | 14 ms | 584 ms | 1,708 ms | 0.0122 | 333,757 B | 144,795 B | Pass |
| `/customers` | 15 ms | 956 ms | 1,496 ms | 0.0022 | 400,929 B | 221,352 B | Pass |

Budget áp dụng: TTFB ≤ 2,000 ms, FCP/LCP ≤ 2,500 ms, CLS ≤ 0.1, tổng transfer ≤ 3,000,000 B và JavaScript transfer ≤ 1,500,000 B. Cả ba route đều pass toàn bộ budget.

Lần chạy đầu `31305196957` phát hiện race condition khi lấy Playwright storage state sau đăng nhập. Commit trên đã buộc chờ storage state hoàn tất trước khi đóng browser context; lần chạy `31305363447` là regression test end-to-end và đã pass.

Artifact `preview-verification` gồm `deployment-smoke.json` và `preview-performance.json`, được GitHub giữ 14 ngày. Đây là lab evidence; vẫn cần Lighthouse hoặc Speed Insights field data và ký UAT Sale/Leader/Admin/Release owner trước cổng Production.
