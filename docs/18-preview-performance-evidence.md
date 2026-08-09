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

Artifact `preview-verification` của phiên này gồm `deployment-smoke.json` và `preview-performance.json`, được GitHub giữ 14 ngày. Lighthouse được bổ sung trong phiên chốt bên dưới; ký UAT Sale/Leader/Admin/Release owner vẫn là cổng bắt buộc trước Production.

## Phiên Lighthouse chốt M7.1

- Commit: `f3d7b698161efeea6c42262aec247853b39c9225` trên nhánh `codex/preview-performance-audit`.
- GitHub Actions: `https://github.com/MitonTran/IM-CRM/actions/runs/31312097712`.
- Thời gian hoàn tất Lighthouse: `2026-08-09T12:00:31.729Z`.
- Phương pháp: Lighthouse desktop, một collection cô lập cho mỗi route; route bảo vệ dùng phiên Supabase Preview do Playwright tạo. Chỉ lỗi runtime `NO_FCP` được thử lại đúng một lần; score thấp không được retry.
- Guardrail: Performance ≥ 0.70, Accessibility ≥ 0.90 và Best Practices ≥ 0.90.

| Route | Performance | Accessibility | Best Practices | FCP | LCP | TBT | CLS | Kết quả |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `/login` | 0.97 | 1.00 | 1.00 | 1,068 ms | 2,418 ms | 97 ms | 0 | Pass |
| `/dashboard` | 0.99 | 1.00 | 1.00 | 854 ms | 1,138 ms | 128 ms | 0 | Pass |
| `/customers` | 0.86 | 1.00 | 1.00 | 840 ms | 1,715 ms | 556 ms | 0 | Pass |

SEO đạt 0.60 và chỉ dùng tham khảo vì CRM nội bộ cố ý gửi `noindex, nofollow`. Bản sửa accessibility đã đóng các audit `label`, `select-name`, `color-contrast` và `link-name`; cả ba route không còn audit accessibility thất bại trong phiên chốt.

Trong cùng workflow, public deployment smoke và Playwright median performance audit cũng pass. Median lab LCP lần lượt là 216 ms, 1,944 ms và 1,128 ms cho `/login`, `/dashboard`, `/customers`; toàn bộ budget TTFB/FCP/LCP/CLS/transfer đều đạt.

Artifact `preview-verification` gồm ba report số đã khử dữ liệu nhạy cảm: `deployment-smoke.json`, `preview-performance.json`, `preview-lighthouse.json`; không lưu raw Lighthouse report, DOM, email hoặc mật khẩu và được giữ 14 ngày. Phần automation của cổng performance M7.1 đã hoàn tất; ký UAT Sale/Leader/Admin/Release owner vẫn bắt buộc trước Production.

## Phiên regression sau tích hợp Auth recovery và restore drill

- Commit: `03a0720865896d35f866cc8cd87d5fd6a5069e5f` trên nhánh `codex/preview-performance-audit`.
- Vercel Preview: `https://im-crm-git-codex-preview-p-2d339c-thongtmmmd-gmailcoms-projects.vercel.app`.
- GitHub Actions chốt: `https://github.com/MitonTran/IM-CRM/actions/runs/31319847895`.
- Hoàn tất: performance `2026-08-09T14:59:22.415Z`, Lighthouse `2026-08-09T15:00:25.268Z`.
- Public smoke pass `health`, nội dung đăng nhập, security headers và response budget; route bảo vệ dùng Admin UAT từ GitHub Actions secrets.

| Route | TTFB | FCP | LCP | CLS | Transfer | JavaScript | Kết quả |
|---|---:|---:|---:|---:|---:|---:|---|
| `/login` | 15 ms | 204 ms | 204 ms | 0 | 330,297 B | 142,225 B | Pass |
| `/dashboard` | 15 ms | 552 ms | 2,012 ms | 0.0122 | 334,010 B | 144,803 B | Pass |
| `/customers` | 15 ms | 472 ms | 1,176 ms | 0.0022 | 401,040 B | 221,354 B | Pass |

| Route | Performance | Accessibility | Best Practices | SEO tham khảo | Kết quả |
|---|---:|---:|---:|---:|---|
| `/login` | 0.92 | 1.00 | 1.00 | 0.60 | Pass |
| `/dashboard` | 0.99 | 1.00 | 1.00 | 0.60 | Pass |
| `/customers` | 0.86 | 1.00 | 1.00 | 0.60 | Pass |

Lần chạy `31319754678` ngay trước đó có public smoke, `/login` và `/customers` pass nhưng median LCP `/dashboard` là `2,624 ms`, vượt budget `124 ms`; TTFB `13 ms`, FCP `640 ms`, CLS `0.0122` và transfer vẫn đạt. Không có thay đổi dashboard trong chuỗi tích hợp, nên workflow được chạy lại đúng một lần để phân loại nhiễu Preview. Lần chốt ở trên đưa dashboard LCP về `2,012 ms` và toàn bộ Lighthouse pass; không nới budget và không sửa code theo một mẫu không lặp lại.

Artifact `preview-verification` của phiên chốt chứa đủ ba report đã khử credential và được giữ 14 ngày. Production không thay đổi; cổng còn lại vẫn là UAT đăng nhập chéo và ký duyệt nhiều vai trò.
