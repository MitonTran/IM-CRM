# Dashboard và KPI

## Quy ước tính

- Kỳ ngày/tháng/năm theo `Asia/Ho_Chi_Minh`, sau đó chuyển biên sang UTC để query.
- Activity tính theo `occurred_at`; giao dịch theo `registered_at`; khách mới theo `created_at`.
- Bản ghi soft-deleted, deal `void`, activity hệ thống không thuộc KPI và dữ liệu test bị loại.
- Nhập muộn vẫn tính vào kỳ xảy ra; hiển thị số lượng nhập muộn và audit. Không âm thầm sửa kỳ đã báo cáo.
- Tỷ lệ có mẫu số 0 hiển thị `—`, không hiển thị 0%.

## Bảng KPI tại điểm duyệt 3

| KPI | Định nghĩa/công thức | Nguồn | Chu kỳ | Ai xem | Loại trừ |
|---|---|---|---|---|---|
| Khách mới | `count(customer)` tạo trong kỳ | customers | ngày/tháng/năm | Sale own, Leader team, Admin | deleted/test |
| Lượt liên hệ | `count(activity)` type call/message | activities | ngày/tháng/năm | theo phạm vi | system, deleted |
| Kết nối thành công | count liên hệ outcome connected/replied | activities | ngày/tháng/năm | theo phạm vi | thiếu outcome |
| Lịch hẹn tạo | count activity outcome booked | activities | ngày/tháng/năm | theo phạm vi | cancelled activity |
| Tư vấn hoàn thành | count consultation outcome completed/interested/objection | activities | ngày/tháng/năm | theo phạm vi | deleted |
| Follow-up đúng hạn | `completed task có completed_at <= due_at / task completed` | follow_up_tasks | ngày/tháng/năm | theo phạm vi | cancelled |
| Khách quá hạn hiện tại | count pending `due_at < now()` | follow_up_tasks | thời điểm | theo phạm vi | cancelled/completed |
| Khách thắng | count customer/deal lần đầu active trong kỳ | deals | tháng/năm | theo phạm vi | void, duplicate submit |
| Doanh thu | `sum(amount_vnd)` deal active | deals | ngày/tháng/năm | theo phạm vi | void |
| Tỷ lệ liên hệ | khách có connected/replied / khách đã có attempt | activities + customers | tháng/năm | Leader/Admin; Sale own | mẫu số 0 |
| Hẹn → tư vấn | khách có tư vấn hoàn thành / khách có hẹn | activities | tháng/năm | theo phạm vi | mẫu số 0 |
| Tư vấn → thắng | khách có deal active / khách tư vấn hoàn thành | activities + deals | tháng/năm | theo phạm vi | mẫu số 0 |
| Tiến độ mục tiêu | `actual / target * 100` | aggregates + kpi_targets | ngày/tháng/năm | theo phạm vi | target thiếu/0 hiển thị chưa đặt |

Không có KPI nào trong MVP bắt buộc nhân viên nhập kết quả thủ công. Mục tiêu do Leader/Admin đặt; doanh thu là dữ liệu giao dịch nghiệp vụ, không phải số KPI tự khai.

## Dashboard Sale

- Việc quá hạn, hôm nay, 7 ngày tới.
- Khách mới được giao và khách không có hoạt động trong N ngày.
- KPI cá nhân so mục tiêu, doanh thu, phễu cá nhân, xu hướng so kỳ trước.
- Drill-down mọi số về danh sách bản ghi người dùng được phép xem.

## Dashboard Leader

- Toàn bộ widget Sale cộng bảng xếp theo từng Sale (không dùng để công khai ngoài team).
- Tổng task quá hạn, phân bố tải khách, khách chưa giao trong team.
- Phễu team, conversion, doanh thu thực tế/mục tiêu và cảnh báo Sale thiếu hoạt động.

## Dashboard Admin/Giám đốc

- Tổng quan toàn hệ thống; so sánh team/Sale/source.
- Doanh thu, phễu, KPI, backlog quá hạn, chất lượng dữ liệu và xu hướng.
- Bộ lọc ngày/tháng/năm, team, user, source; filter không được mở rộng quyền cho role thấp hơn.

## Tính toán

MVP ưu tiên SQL function/view `security_invoker` với filter rõ ràng. Nếu dữ liệu lớn, bổ sung bảng snapshot/materialized view được refresh server-side; snapshot vẫn có `team_id/user_id` và RLS, đồng thời cung cấp thời điểm cập nhật.

