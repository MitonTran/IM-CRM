# Ghi chú tham khảo: trycompai/crm

## Nguồn và mục đích

- Repository: `https://github.com/trycompai/crm`
- Commit đã khảo sát: `d1d92edbc4b02ef2f6987e6bc1638a0f3d64808e`
- Ngày khảo sát: 2026-08-06.
- License tại thời điểm khảo sát: MIT.

Mục đích là học các pattern giao diện, bảng CRM và tổ chức code. Không sao chép toàn bộ source, không biến IM CRM thành fork và không thay đổi đặc tả sản phẩm theo repository này.

## Điểm phù hợp để áp dụng

### 1. Trạng thái bảng nằm trong URL

Repository tham khảo quản lý tìm kiếm, sort, chiều sort, trang và facets bằng query parameters. Pattern này phù hợp với IM CRM vì:

- Refresh không làm mất view đang làm việc.
- Back/Forward hoạt động tự nhiên.
- Leader/Admin có thể lưu một view thường dùng.
- Server có thể đọc cùng một query schema để prefetch dữ liệu ban đầu.

IM CRM sẽ tự triển khai parser/validator phù hợp Next.js và Supabase. Tất cả sort/filter dùng allowlist và filter quyền được ép từ session, không lấy `user_id/team_id` tùy ý từ URL.

### 2. Một DataTable dùng chung, cấu hình theo feature

Pattern tốt gồm:

- Cột typed, sortable, hideable và responsive.
- Search, facets, sort, toggle column và pagination có giao diện nhất quán.
- Sticky header, loading/empty state và row interaction nằm trong table shell.
- Mỗi feature chỉ khai báo cột, dữ liệu, facet và hành động riêng.

Áp dụng vào IM CRM bằng `src/components/data-table/` cho primitives/query state và `src/features/customers/` cho customer-specific columns, filters và data access. Không đưa Supabase query hoặc quy tắc RLS vào component UI dùng chung.

### 3. Detail sheet giữ ngữ cảnh danh sách

Click dòng mở panel bên phải thay vì luôn điều hướng sang trang mới. URL giữ record đang mở nên người dùng có thể refresh hoặc dùng Back/Forward mà không mất filter và vị trí danh sách.

IM CRM áp dụng cho chi tiết khách hàng ở desktop; trên màn hình hẹp dùng full-screen drawer/page tương đương. Sheet chỉ là UX: mỗi lần tải dữ liệu vẫn qua Supabase session và RLS. Deep link `/customers/<id>` vẫn nên tồn tại để mở trực tiếp và làm fallback.

### 4. Prefetch có chủ đích

Prefetch chi tiết khi hover hoặc focus giúp panel mở nhanh. Chỉ áp dụng khi:

- Query chạy dưới session hiện tại và vẫn chịu RLS.
- Không prefetch hàng loạt hoặc dữ liệu timeline quá lớn.
- Không làm lộ sự tồn tại của record bị cấm.
- Mạng chậm hoặc prefetch lỗi không ảnh hưởng click chính.

### 5. UI là một nguồn sự thật

Repository tham khảo giữ button, input, table, sheet và theme trong khu vực UI dùng chung. IM CRM không cần monorepo ở quy mô hiện tại, nhưng giữ cùng nguyên tắc:

```text
src/components/ui/          primitive và variant dùng chung
src/components/data-table/  table shell + URL query helpers
src/components/layout/      app/page shell
src/features/customers/     query, actions, columns, forms, detail UI
src/lib/supabase/           client/server/proxy, không chứa UI
supabase/migrations/        schema/RLS/RPC theo thứ tự
supabase/tests/             pgTAP RLS và toàn vẹn dữ liệu
```

Nếu cần một style/variant mới, ưu tiên bổ sung ở component dùng chung thay vì rải utility class khác nhau trên từng màn hình.

### 6. Page shell nhất quán

Mỗi trang danh sách có cùng cấu trúc: tiêu đề, mô tả ngắn, action chính và content co giãn. Điều này phù hợp với Khách hàng, Công việc, Giao dịch, Tài liệu và Quản trị của IM CRM.

## Điều chỉnh riêng cho IM CRM

| Pattern tham khảo | Điều chỉnh bắt buộc |
|---|---|
| Contact/company/deal CRM | IM CRM ưu tiên một hồ sơ khách học IELTS, một Sale phụ trách và doanh thu cuối |
| Backend NestJS/tRPC/Prisma/Neon | Giữ Next.js + Supabase PostgreSQL/Auth/Storage/RLS |
| Better Auth/Google allowlist | Giữ Supabase Auth email + lời mời Admin ở MVP |
| Monorepo nhiều deployment | Giữ một Next.js app và Supabase để triển khai nhanh cho team 4–5 người |
| Agent tự nghiên cứu/lập lịch | AI IM CRM chỉ đọc và đề xuất, không tự ghi/sửa/xóa CRM |
| Single tenant không organization column | Phù hợp giả định một tổ chức; vẫn giữ `team_id` cho quyền Leader/Sale |
| Email là định danh trùng chính | IM CRM dùng cả `phone_normalized` và `email_normalized` theo quy tắc đã chốt |

## Những phần không áp dụng

- Không lấy kiến trúc agent-first, sandbox, work queue tự chạy hoặc cơ chế tự ghi “fact”.
- Không thay Supabase bằng Neon/Prisma, Supabase Auth bằng Better Auth, hoặc thêm NestJS/tRPC chỉ để giống nguồn tham khảo.
- Không thêm Gmail/Calendar, Google sync, company enrichment hoặc dữ liệu vendor vào MVP.
- Không dùng AI score/evidence model của repository để thay định nghĩa AI đã chốt.
- Không sao chép visual identity, copywriting hoặc toàn bộ component source. Chỉ học pattern tương tác và ranh giới module.

## Checklist khi triển khai M2

- [ ] Query parameters được parse/validate ở server và client bằng cùng hợp đồng.
- [ ] Sort/filter field có allowlist; thay filter reset trang về 1.
- [ ] Facet count không vượt RLS và không tiết lộ team/user ngoài quyền.
- [ ] Bảng responsive, sticky header, keyboard accessible và có loading/empty/error.
- [ ] Row click mở detail sheet nhưng deep link vẫn hoạt động.
- [ ] Back/Forward đóng/mở sheet và khôi phục view danh sách.
- [ ] Create sheet xử lý validation, duplicate conflict, pending và double-submit.
- [ ] Shared UI không chứa query nghiệp vụ; feature không tự tạo style variant rải rác.
- [ ] Test RLS vẫn là điều kiện bắt buộc, bất kể UI đã ẩn dữ liệu.
