# Airbnb Ops — Tài liệu ngữ cảnh dự án (Project Context)

> **Cách dùng:** Dán **toàn bộ** file này vào đầu mỗi phiên ChatGPT / Replit Agent **trước khi** nhờ AI sửa code hoặc database. Mục đích: để AI hiểu hệ thống đã có gì, tránh tạo bảng/vai trò trùng lặp và tránh phá vỡ thứ đang chạy.
>
> Cập nhật lần cuối: 2026-05 (sau đợt dọn dẹp database & phân quyền).

---

## 1. Tổng quan

App quản lý vận hành **villa cho thuê ngắn hạn** (Airbnb / Booking.com). Đây là dashboard nội bộ cho đội vận hành: quản lý villa, đặt phòng, lịch trống, công việc, tài chính, nhân sự.

**Stack:**
- Frontend: React 18 + Vite + Tailwind v4 + shadcn/ui + wouter + react-query + react-hook-form + zod
- Backend dữ liệu: **Supabase** (PostgreSQL + Auth + Storage). KHÔNG có API server riêng — frontend gọi thẳng Supabase.
- Cấu trúc: pnpm monorepo. App chính nằm ở `artifacts/admin/`.
- Hạ tầng: code trên Replit, version trên GitHub.
- Auth: Supabase email/password. Client chỉ dùng anon key. Mọi phân quyền do **RLS** (Row Level Security) trong database kiểm soát.

---

## 2. ⚠️ QUY TẮC VÀNG khi sửa dự án (đọc trước tiên)

Đây là các quy tắc rút ra từ lỗi thực tế. Vi phạm = tạo bug.

1. **Luôn liệt kê bảng hiện có trước khi tạo bảng mới.** Database đã có 40 bảng. Nhiều khái niệm đã có bảng — đừng tạo bảng trùng.
2. **KHÔNG tạo bảng danh tính mới.** Người dùng/nhân viên đã có `users`, `employees`. Đừng tạo thêm `profiles` mới, `staff`, `members`...
3. **KHÔNG tạo bảng lịch mới.** Lịch villa dùng `listing_calendar`. Đừng tạo bảng lịch khác.
4. **Tên vai trò là CỐ ĐỊNH, đúng 6 giá trị:** `admin`, `manager`, `sales`, `cleaner`, `maintenance`, `accountant`. KHÔNG dùng biến thể cũ đã bỏ: ~~sale, cleaningstaff, staff, reception~~.
5. **Vai trò người dùng đọc từ `users` + `roles`** (qua `users.role_id`), KHÔNG đọc từ `profiles`.
6. **KHÔNG xóa/đổi tên** `profiles`, `calendar_entries`, `listing_blocks` — code frontend vẫn đọc trực tiếp các bảng này (xem mục Nợ kỹ thuật).
7. **task_type chỉ nhận các giá trị hợp lệ** (xem mục 6). Sai giá trị → vi phạm ràng buộc.
8. **Connector Supabase đang ở chế độ chỉ-đọc.** Mọi lệnh thay đổi (DDL/UPDATE/DELETE) phải chạy thủ công trong Supabase SQL Editor.

---

## 3. Mô hình danh tính & phân quyền

Hệ thống có **3 bảng liên quan đến con người** — mỗi bảng một vai trò, ĐỪNG nhầm lẫn:

| Bảng | Vai trò | Khóa liên kết |
|---|---|---|
| `users` | **Nguồn chính** cho đăng nhập & vai trò. App đọc role từ đây. | `users.id` = `auth.users.id`; `users.role_id` → `roles.id` |
| `roles` | Danh mục 6 vai trò + mô tả | |
| `employees` | Hồ sơ nhân sự (phòng ban, vị trí, lương, trạng thái) | `employees.profile_id` = `auth.users.id` |
| `profiles` | **Bảng cũ (legacy).** Còn được module HR đọc trực tiếp. Chưa xóa được. | `profiles.id` = `auth.users.id` |

**Hàm bảo mật trong DB** (dùng trong RLS policy):
- `current_user_role()` → trả về tên vai trò của user đang đăng nhập (đọc từ `users` + `roles`).
- `is_admin()`, `is_manager()`, `is_manager_or_admin()`, `is_accountant_or_above()` → gọi lại `current_user_role()`.
- `current_user_team_id()` → đọc `employees.team_id`.

**Trigger tự động:** khi tạo tài khoản mới ở Supabase Authentication, trigger `on_auth_user_created` (hàm `handle_new_user`) **tự tạo dòng trong `users`**, lấy role từ metadata nếu có. KHÔNG tự tạo `employees` (vì cần phòng ban/vị trí) và KHÔNG tạo `profiles`.

### Quy trình tạo tài khoản nhân viên (2 bước)
1. **Authentication → Add user** → nhập email + mật khẩu → bật Auto Confirm. (Trigger tự tạo dòng `users`.)
2. Gán vai trò: sửa `role_id` của dòng đó trong Table Editor (hoặc trang quản lý user trong app).
3. Tạo hồ sơ nhân sự đầy đủ qua app (Nhân sự → Thêm nhân viên).

### Tóm tắt quyền theo vai trò
| Vai trò | Làm được gì | Xem giá? |
|---|---|---|
| **admin** (Chủ) | Toàn quyền | Có |
| **manager** (Quản lý) | Listings, lịch, giá, booking, task, tài chính, báo cáo, HR, hiệu suất | Có |
| **sales** (Sale + check-in/out) | Tạo/xem booking, xem lịch, quản lý task | Không |
| **accountant** (Kế toán) | Xem booking, tài chính (doanh thu/chi phí), báo cáo | Có |
| **cleaner** (Dọn dẹp) | Task được giao, xem hiệu suất bản thân | Không |
| **maintenance** (Bảo trì) | Task được giao | Không |

---

## 4. Danh mục bảng (40 bảng, đã nhóm)

**Danh tính & nhân sự:** `users`, `roles`, `profiles` (legacy), `employees`, `departments`, `positions`, `teams`

**Villa & tiện ích:** `listings`, `listing_images`, `amenities`, `listing_amenities`, `pricing_rules`

**Lịch (xem cảnh báo mục 7):** `listing_calendar` (chính), `calendar_entries`, `listing_blocks`

**Đặt phòng & tài chính:** `bookings`, `payments`, `revenues`, `expenses`, `customers`, `channels`

**Công việc:** `tasks`

**HR & hiệu suất:** `employee_performance_logs`, `employee_performance_scores`, `employee_monthly_reviews`

**Chat nội bộ:** `chat_groups`, `chat_group_members`, `chat_topics`, `chat_messages`, `chat_attachments`

**Báo cáo & vận hành:** `daily_ops_logs`, `weekly_reviews`, `monthly_reports`

**Marketing & nghiên cứu:** `content_posts`, `competitors`, `competitor_prices`, `reviews`, `owners`

**Hệ thống:** `activity_logs`, `notifications`

> Tất cả bảng đều đã bật RLS và có policy.

---

## 5. Bảng `listing_calendar` (lịch chính)

Cột: `id`, `listing_id`, `date`, `status` (enum), `booking_id`, `price_override`, `min_nights`, `note`, `created_at`, `updated_at`.

Có **ràng buộc duy nhất trên (listing_id, date)** → database tự chặn 2 bản ghi đè lên cùng villa cùng ngày (chống đặt trùng).

---

## 6. Quy ước & giá trị hợp lệ

**Vai trò (`roles.name`):** `admin`, `manager`, `sales`, `cleaner`, `maintenance`, `accountant`

**task_type (cột text + ràng buộc check):**
`cleaning`, `maintenance`, `inspection`, `guest_support`, `checkin_prepare`, `checkout_check`, `other`

**calendar_status (enum của `listing_calendar.status`):**
`available`, `booked`, `blocked`, `maintenance`

**employee_status:** `candidate`, `interviewing`, `probation`, `active`, `inactive`, `resigned`, `terminated`, `rejected`
(Các trạng thái chặn đăng nhập: `inactive`, `resigned`, `terminated`, `rejected`)

**booking.status:** `pending`, `confirmed`, `completed`, `cancelled`

---

## 7. Nợ kỹ thuật hiện tại (cần xử lý dần)

1. **Tài khoản mới thiếu dòng `profiles`.** Trigger chỉ tạo `users`. Module HR còn đọc `profiles` → nhân viên tạo qua Authentication có thể hiển thị thiếu trong HR. *Cần kiểm tra luồng "Thêm nhân viên" trong app.*
2. **3 bảng danh tính song song** (`users` / `profiles` / `employees`). Muốn bỏ `profiles`: phải tìm hết `.from("profiles")` trong code, chuyển sang `users`, test, rồi mới xóa.
3. **3 bảng lịch song song.** `listing_calendar` (trang Lịch villa) + `calendar_entries` (trang Tổng quan/Dashboard) + `listing_blocks` (tính năng Bảo trì). Gộp lại cần sửa code frontend.
4. **Lệch code ↔ DB:**
   - `supabase.ts` (type `AppRole`) còn liệt kê `cleaningstaff`, `staff` (đã bỏ ở DB) và thiếu phản ánh việc bỏ `reception`. Vô hại nhưng nên dọn.
   - `supabase.ts` (type `ListingCalStatus`) có `owner_stay`, `cleaning_hold` nhưng enum DB `calendar_status` lại có `booked` và thiếu 2 cái đó → bug tiềm ẩn nếu app ghi 2 trạng thái này.
5. **Bảo mật:** tính năng chặn mật khẩu rò rỉ (leaked password protection) đang TẮT trong Supabase Auth → nên bật.

---

## 8. Cách yêu cầu AI hỗ trợ (để tránh lỗi)

Khi nhờ AI sửa code/DB, kèm theo:
- "Đọc file ngữ cảnh này trước. KHÔNG tạo bảng/vai trò trùng với danh mục đã có."
- "Trước khi xóa/đổi tên bảng, hãy hỏi tôi và cảnh báo bảng đó có đang được code đọc không."
- "Mỗi lần chỉ làm 1 việc, dừng cho tôi xác nhận."
- "Lệnh thay đổi DB phải dạng SQL để tôi tự dán vào Supabase SQL Editor."
