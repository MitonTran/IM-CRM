# Thiết kế trợ lý AI

## Nguyên tắc an toàn

- AI chỉ đọc dữ liệu người dùng hiện tại được phép đọc và tạo đề xuất; không tạo/sửa/xóa CRM.
- Không gửi secret, audit payload đầy đủ, dữ liệu user khác quyền hoặc file gốc không cần thiết.
- Không cho model viết/chạy SQL. Model chỉ gọi tool allowlist với schema input/output cố định.
- Kết quả có nhãn “AI hỗ trợ, cần kiểm tra trước khi sử dụng”.

## Phân tích khách hàng

### Được đọc

Hồ sơ cơ bản, source/status, owner, timeline hoạt động, task, giao dịch, tag và tài liệu nội bộ được chọn mà requester có quyền. Không đọc password/session, secret, audit kỹ thuật, hội thoại AI của người khác hoặc khách ngoài phạm vi.

### Đầu ra JSON

```json
{
  "summary": "string",
  "potential_level": "low|medium|high",
  "lead_score": 0,
  "score_reasons": ["string"],
  "key_needs": ["string"],
  "objections": ["string"],
  "risks": ["string"],
  "next_actions": [{"action":"string","priority":"low|medium|high","reason":"string"}],
  "suggested_follow_up_at": "ISO-8601|null",
  "suggested_message": "string|null",
  "missing_information": ["string"],
  "confidence": "low|medium|high",
  "evidence_activity_ids": ["uuid"]
}
```

Score là gợi ý 0–100, không dùng tự động phân công hay loại khách. Backend validate schema, giới hạn evidence thuộc snapshot, lưu input snapshot đã tối giản, model, token, chi phí ước tính và output.

## AI hỏi đáp CRM và tài liệu

### Câu hỏi hỗ trợ

- “Khách nào của tôi quá hạn?”, “KPI tháng này của team?”, “Doanh thu theo nguồn?”, “Tóm tắt khách X”.
- “Quy trình tư vấn nằm ở tài liệu nào?”, “Tóm tắt tài liệu/đoạn được trích dẫn”.
- Từ chối hoặc giải thích giới hạn với câu hỏi ngoài quyền, yêu cầu SQL tùy ý, dự đoán không có dữ liệu hoặc yêu cầu thay đổi CRM.

### Tool backend allowlist

| Tool | Chức năng | Kiểm tra quyền |
|---|---|---|
| `get_customer_summary(customer_id)` | hồ sơ + timeline giới hạn | quyền customer |
| `list_follow_ups(filters)` | task quá hạn/đến hạn | ép scope từ session |
| `get_kpi_summary(period, filters)` | KPI đã định nghĩa | ép user/team theo role |
| `get_revenue_summary(period, group_by)` | tổng hợp deal | scope theo role |
| `get_funnel_summary(period, filters)` | phễu | scope theo role |
| `search_documents(query, filters)` | hybrid RRF giữa full-text và cosine semantic; fallback full-text nếu embedding chưa sẵn sàng | lọc document ACL trước trả chunks |
| `get_document_excerpt(version_id, locator)` | đoạn trích có citation | kiểm tra lại ACL/version |

Tool không nhận `user_id/team_id` tùy ý từ model; backend lấy session và giao phần giao với filter được phép. Output giới hạn dòng/kích thước, không trả trường không cần thiết.

## RAG và citation

1. Xác thực user và quota.
2. Phân loại câu hỏi; gọi tool có cấu trúc.
3. Với tài liệu, lọc ACL trước retrieval, trả chunk kèm document/version/page/slide/sheet.
4. Model trả lời chỉ dựa trên context; citation mở được phải kiểm tra quyền lại.
5. Nếu không đủ nguồn: nói rõ chưa đủ dữ liệu, không bịa và đề xuất cách bổ sung.

## Lịch sử, chi phí và riêng tư

- Lưu conversation/message, tool name + tham số đã che, citations, tokens, model, latency, cost estimate, trạng thái lỗi.
- Provider/model được chọn bằng cấu hình server allowlist. API key không lưu database, không trả frontend; endpoint tùy ý không được phép để tránh gửi CRM tới đích ngoài kiểm soát.
- Giới hạn request/user/ngày, token đầu vào, số chunk, số activity và timeout; cache tổng hợp không nhạy cảm theo user/scope.
- Cho Admin cấu hình bật/tắt AI và quota; cảnh báo khi gần ngưỡng. Không dùng dữ liệu thật cho môi trường dev/test.
- Retention lịch sử AI mặc định 90 ngày; người dùng chỉ xem hội thoại của mình. Việc purge chạy bằng RPC chỉ cấp cho `service_role` và cần được scheduler server gọi định kỳ.

## Hợp đồng triển khai M6.3

- Planner trả tối đa 3 tool calls và bị Zod từ chối nếu có tool/argument ngoài allowlist; model không nhận `user_id`, `team_id`, SQL hoặc endpoint.
- Mọi tool CRM/RAG chạy bằng Supabase client của phiên đăng nhập. `service_role` chỉ hoàn tất trạng thái/kết quả AI sau khi backend kiểm tra citation và không dùng để đọc dữ liệu nguồn.
- Retrieval tài liệu dùng hybrid RRF giữa full-text và Google `gemini-embedding-001` 1536 chiều, giới hạn 6 chunks và tối đa 1.800 ký tự/chunk. Nếu key/query embedding lỗi, tool fallback full-text. RLS của document/version/chunk được áp dụng trước khi trả kết quả.
- Citation tài liệu lưu `document_id`, `version_id` và locator; route mở file kiểm tra lại RLS rồi mới cấp signed URL 60 giây.
- Audit chỉ lưu trạng thái, model, token và latency; không sao chép câu hỏi, câu trả lời, nội dung chunk hoặc payload tool.
- `ai_request_ledger` giữ quota dùng chung giữa phân tích khách hàng và hỏi đáp, khóa theo user/ngày Việt Nam để tránh request đồng thời vượt ngưỡng.

## Điểm duyệt 4

- Quyền đọc/không đọc, tool, JSON, lịch sử và cost control đã được xác định.
- Không có tool ghi dữ liệu. Nếu sau này muốn AI tạo task/sửa CRM, phải dừng và duyệt lại kiến trúc/quyền.
