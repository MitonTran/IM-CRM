# Thiết kế cơ sở dữ liệu

## Quan hệ chính

```text
auth.users 1--1 profiles *--1 teams
teams 1--* customers *--1 profiles(owner)
customers 1--* customer_assignments
customers 1--* activities 1--0..1 follow_up_tasks
customers 1--* deals
profiles/teams 1--* kpi_targets
document_folders 1--* documents 1--* document_versions 1--* document_chunks
customers 1--* ai_customer_analyses
profiles 1--* ai_conversations 1--* ai_messages
profiles 1--* audit_logs
```

## Quy ước chung

- PK `uuid`; timestamp `timestamptz`; tiền `numeric(15,0)`; JSON có schema kiểm tra ở application/backend.
- Bảng nghiệp vụ có `created_at`, `created_by`, `updated_at`, `updated_by`; bảng cần xóa mềm thêm `deleted_at/by/reason`.
- Dùng enum PostgreSQL hoặc check constraint cho trạng thái ổn định; migration có phương án rollback/forward.
- Mọi bảng ứng dụng bật RLS. FK có hành vi xóa hạn chế; không cascade dữ liệu nghiệp vụ quan trọng.

## Danh sách bảng

| Bảng | Mục đích | Trường chính và kiểu | Quan hệ/chỉ mục | RLS tóm tắt |
|---|---|---|---|---|
| `profiles` | hồ sơ user | `id uuid PK/FK auth.users`, `full_name text`, `role text`, `team_id uuid`, `is_active bool`, timestamps | idx `(team_id,is_active)`, `(role)` | self đọc; Leader đọc team; Admin all; chỉ Admin sửa role/team |
| `teams` | nhóm Sale | `id`, `name`, `leader_user_id`, `is_active` | unique name; idx leader | thành viên đọc team; Admin all; Leader không tự đổi leader |
| `lead_sources` | nguồn khách | `id`, `name`, `is_active` | unique lower(name) | authenticated đọc; Admin CRUD |
| `customers` | hồ sơ khách | `id`, `full_name`, `phone`, `phone_normalized`, `email`, `email_normalized`, `source_id`, `status`, `owner_user_id`, `team_id`, `priority`, `note_summary`, audit + soft delete | partial unique phone/email khi not deleted; idx owner/status, team/status, source, updated_at; trigram tên/phone | Sale own; Leader team; Admin all; write theo ma trận |
| `customer_tags` | tag | `id`, `name`, `color` | unique lower(name) | đọc authenticated; Admin CRUD |
| `customer_tag_links` | gắn tag | `customer_id`, `tag_id`, audit | PK kép; idx tag | kế thừa quyền customer |
| `customer_assignments` | lịch sử giao | `id`, `customer_id`, `assignee_user_id`, `team_id`, `started_at`, `ended_at`, `reason`, `assigned_by` | unique partial một assignment mở/customer; idx assignee, team | theo quyền customer; chỉ RPC đặc quyền ghi |
| `activities` | hành trình | `id`, `customer_id`, `type`, `outcome`, `content`, `occurred_at`, `performed_by`, `next_action`, `follow_up_at`, `is_late_entry`, audit + soft delete | idx customer/occurred desc, performer/occurred, type/occurred | kế thừa customer; actor/rule quản lý khi sửa |
| `follow_up_tasks` | việc chăm sóc | `id`, `customer_id`, `activity_id`, `assignee_user_id`, `due_at`, `status`, `priority`, `completed_at`, audit | idx partial `(assignee_user_id,due_at)` pending; customer/status | assignee own; Leader team; Admin all |
| `deals` | đăng ký/doanh thu | `id`, `customer_id`, `owner_user_id`, `team_id`, `amount_vnd numeric(15,0)`, `registered_at`, `status`, `idempotency_key`, `void_reason`, audit | unique idempotency; idx owner/date, team/date, customer | theo customer/team; vô hiệu hóa Leader/Admin |
| `kpi_targets` | mục tiêu | `id`, `metric_code`, `scope_type`, `user_id`, `team_id`, `period_type`, `period_start/end`, `target_value numeric`, audit | unique metric/scope/period; idx period | Sale đọc own; Leader team; Admin all; Leader/Admin ghi |
| `document_folders` | cây thư mục | `id`, `parent_id`, `name`, `scope_type`, `team_id`, `user_id`, audit + soft delete | unique parent/name/scope; idx parent | theo scope tài liệu |
| `documents` | metadata logic | `id`, `folder_id`, `title`, `scope_type`, `team_id`, `user_id`, `current_version_id`, `status`, audit + soft delete | idx folder, scope/team/user, search title | org/team/user; ghi theo ma trận |
| `document_versions` | phiên bản file | `id`, `document_id`, `version_no`, `storage_path`, `mime_type`, `size_bytes`, `checksum`, `extraction_status`, `embedding_status`, `extracted_text_path`, audit | unique doc/version; unique storage path; idx extraction/embedding queue | kế thừa document |
| `document_chunks` | đoạn cho RAG | `id`, `document_version_id`, `chunk_index`, `content`, `embedding vector(1536)`, `embedding_model`, `embedded_at`, `token_count`, `metadata jsonb` | unique version/index; HNSW cosine partial index | kế thừa document qua version; không client ghi |
| `ai_customer_analyses` | lịch sử phân tích | `id`, `customer_id`, `requested_by`, `input_snapshot jsonb`, `result jsonb`, `model`, `tokens`, `cost_estimate`, `created_at` | idx customer/date, requester/date | quyền customer; không update |
| `ai_conversations` | phiên hỏi đáp | `id`, `user_id`, `title`, timestamps | idx user/updated | owner; Admin chỉ metadata khi cần audit |
| `ai_messages` | câu hỏi/trả lời/tool | `id`, `conversation_id`, `role`, `content`, `citations jsonb`, `tool_calls jsonb`, `tokens`, `cost_estimate`, `created_at` | idx conversation/date | kế thừa conversation; server ghi assistant/tool |
| `audit_logs` | log bất biến | `id bigint`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `before_data`, `after_data`, `request_id`, `ip_hash`, `created_at` | idx entity/date, actor/date, action/date | Admin đọc; server/trigger ghi; không update/delete |

## Chống trùng và toàn vẹn

- Chuẩn hóa điện thoại theo quy tắc Việt Nam đã cấu hình; email lowercase/trim.
- Partial unique index cho giá trị không null và chưa xóa. Khi chính sách cho phép khách trùng số dùng chung, chuyển sang bảng `duplicate_candidates` sau quyết định sản phẩm.
- Constraint owner phải là Sale hoạt động và thuộc `team_id` được kiểm tra trong RPC/trigger.
- `registered_at`, `occurred_at` không được vượt tương lai quá ngưỡng cấu hình.

## Function/RPC đề xuất

- `create_customer_with_assignment(...)`
- `transfer_customer(customer_id, new_owner_id, reason, task_policy)`
- `record_activity_with_follow_up(...)`
- `register_deal(...)`
- `void_deal(deal_id, reason)`
- `get_kpi_summary(filters)` và các function AI chỉ đọc ở tài liệu AI.
