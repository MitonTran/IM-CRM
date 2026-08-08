# Kho tài liệu nội bộ

## Mô hình

- Thư mục logic trong DB, không phụ thuộc cấu trúc Storage.
- `documents` là tài liệu; `document_versions` giữ file gốc bất biến; phiên bản mới không ghi đè file cũ.
- Scope: `organization`, `team`, `user`. Scope user là danh sách/người được cấp cụ thể theo thiết kế MVP đơn giản một `user_id`; nhiều người dùng cần bảng ACL ở giai đoạn sau.
- Bucket private; tải/preview qua signed URL ngắn hạn sau kiểm tra quyền.

## Quy trình upload

1. Client yêu cầu upload session với metadata và scope.
2. Backend kiểm tra quyền, MIME/extension/size, sinh path ngẫu nhiên.
3. Upload private bucket; backend xác minh checksum/size rồi tạo version.
4. Worker đặt `extraction_status: pending→processing→ready|failed|unsupported`.
5. Khi extraction `ready`, queue embedding chạy theo batch tối đa 64 chunks và đặt `embedding_status: pending→processing→ready|failed`; lỗi embedding không làm mất full-text search.
6. File gốc luôn giữ riêng; text trích xuất và chunks không thay thế file gốc.

## Định dạng

| Loại | Preview | Trích xuất cho AI |
|---|---|---|
| PDF | viewer | text/OCR khi cần, giữ page number |
| DOCX | preview chuyển đổi hoặc tải | paragraph/table text |
| XLSX | bảng giới hạn sheet/row | cell text có sheet/range; không thực thi macro |
| PPTX | slide preview nếu có | text theo slide |
| PNG/JPEG/WebP | ảnh | OCR tùy cấu hình; không nhận diện sinh trắc học |
| Khác | tải xuống | `unsupported` cho AI |

## Metadata và tìm kiếm

- Title, folder, version, MIME, size, checksum, uploader, scope, created/updated, extraction status.
- Tìm theo title/metadata; full-text trên nội dung đã trích xuất; semantic dùng OpenAI `text-embedding-3-small` 1536 chiều khi embedding `ready`.
- Kết quả tìm kiếm luôn lọc quyền trước xếp hạng; citation gồm document, version, page/slide/sheet/chunk.

## Cập nhật và xóa

- Cập nhật file tạo version mới và re-index; hội thoại cũ giữ citation tới version cũ.
- Xóa mềm ẩn tài liệu và chunks khỏi tìm kiếm ngay; file vật lý chỉ purge theo retention sau khi Admin duyệt (ngoài MVP mặc định).
- Mọi upload, đổi quyền, version, tải và xóa quan trọng được audit.

## Tiêu chí nghiệm thu

- Sale không tạo signed URL cho tài liệu ngoài scope dù biết path.
- File không hợp lệ/quá giới hạn bị từ chối; upload lỗi không để metadata “ready”.
- Preview fallback sang tải; trạng thái xử lý và lỗi thân thiện.
- AI không truy xuất chunk của version đã xóa hoặc tài liệu mất quyền.
