# Quy tắc làm việc cho Codex

1. Luôn đọc toàn bộ tài liệu trong `docs/` trước khi thay đổi kiến trúc; đọc ít nhất tài liệu liên quan trước mọi issue.
2. Không tự ý mở rộng phạm vi. Cảnh báo khi yêu cầu mới xung đột với đặc tả.
3. Dừng và hỏi khi thay đổi ảnh hưởng schema cốt lõi, mô hình quyền, hoặc rơi vào điều kiện tại `docs/12-open-decisions.md`.
4. Không sửa trực tiếp Production. Luôn triển khai và kiểm tra Preview trước Production.
5. Mọi thay đổi database phải qua migration có tên rõ ràng; không sửa migration đã chạy Production.
6. Không tắt RLS. Mọi bảng ứng dụng và Storage phải có policy phù hợp; UI không thay thế kiểm soát database.
7. Không đưa `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` hoặc secret ra frontend/repository/log.
8. AI không được chạy SQL tùy ý hoặc ghi/sửa/xóa CRM; tool backend phải allowlist và kiểm tra quyền.
9. Chỉ dùng dữ liệu giả trong dev/test. Không commit PII hoặc credential thật.
10. Phải chạy lint, typecheck và test phù hợp sau mỗi nhiệm vụ; nếu chưa chạy được phải nêu lý do và rủi ro.
11. Sau mỗi nhiệm vụ, ghi rõ: file đã sửa, migration đã tạo, kiểm tra đã chạy và vấn đề còn lại.
12. Giữ thay đổi nhỏ, bám issue; không chỉnh sửa thay đổi không liên quan của người khác.
13. Mọi thao tác quan trọng phải có audit; thời gian lưu UTC và hiển thị `Asia/Ho_Chi_Minh`; tiền mặc định VND.
14. Review RLS bằng ít nhất Sale A, Sale B, Leader team A, Leader team B và Admin khi thay đổi truy cập dữ liệu.
15. Trước merge và Production, dùng checklist trong `docs/10-milestones.md` và tiêu chí `docs/11-acceptance-criteria.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
