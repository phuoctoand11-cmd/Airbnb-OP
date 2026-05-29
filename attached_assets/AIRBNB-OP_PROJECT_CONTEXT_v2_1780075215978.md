# Airbnb Ops — Tài liệu ngữ cảnh dự án (Project Context) — v2

> **Cách dùng:** Dán **toàn bộ** file này vào đầu mỗi phiên ChatGPT / Replit Agent **trước khi** nhờ AI sửa code hoặc database. Mục đích: để AI hiểu hệ thống đã có gì, tránh tạo bảng/vai trò trùng lặp và tránh phá vỡ thứ đang chạy.
>
> Cập nhật lần cuối: 2026-05 (sau khi hoàn thành luồng tạo nhân viên 1-bước).

---

## 1. Tổng quan

App quản lý vận hành **villa cho thuê ngắn hạn** (Airbnb / Booking.com). Dashboard nội bộ cho đội vận hành: quản lý villa, đặt phòng, lịch trống, công việc, tài chính, nhân sự.

**Stack:**
- Frontend: React 18 + Vite + Tailwind v4 + shadcn/ui + wouter + react-query + react-hook-form + zod
- Backend dữ liệu: **Supabase** (PostgreSQL + Auth + Storage). KHÔNG có API server riêng — frontend gọi thẳng Supabase.
- Cấu trúc: pnpm monorepo. App chính ở `artifacts/admin/`.
- Hạ tầng: code trên Replit, version trên GitHub.
- Auth: Supabase email/password. Client chỉ dùng anon key. Mọi phân quyền do **RLS** kiểm soát.

---

## 2. ⚠️ QUY TẮC VÀNG khi sửa dự án (đọc trước tiên)

Rút ra từ lỗi thực tế. Vi phạm = tạo bug.

1. **Luôn liệt kê bảng hiện có trước khi tạo bảng mới.** Đã có 40 bảng — đừng tạo trùng.
2. **KHÔNG tạo bảng danh tính mới.** Người dùng/nhân viên đã có `users`, `employees`, `profiles`. Đừng tạo thêm `staff`, `members`...
3. **KHÔNG tạo bảng lịch mới.** Lịch villa dùng `listing_calendar`.
4. **Tên vai trò CỐ ĐỊNH, đúng 6 giá trị:** `admin`, `manager`, `sales`, `cleaner`, `maintenance`, `accountant`. KHÔNG dùng biến thể cũ: ~~sale, cleaningstaff, staff, reception~~.
5. **Vai trò người dùng đọc từ `users` + `roles`** (qua `users.role_id`), KHÔNG đọc từ `profiles`.
6. **KHÔNG xóa/đổi tên** `profiles`, `calendar_entries`, `listing_blocks` — code frontend vẫn đọc trực tiếp (xem Nợ kỹ thuật).
7. **task_type chỉ nhận giá trị hợp lệ** (mục 6).
8. **Connector Supabase đang chỉ-đọc.** Mọi thay đổi (DDL/UPDATE/DELETE) chạy thủ công trong Supabase SQL Editor.
9. **⭐ MỚI — Tạo tài khoản auth bằng SQL phải tạo ĐỦ 4 mảnh, nếu không sẽ lỗi đăng nhập `Database error querying schema`:**
   - (a) Dòng trong `auth.users` — kèm `email_confirmed_at = now()`.
   - (b) **Các cột token phải = chuỗi rỗng `''`, KHÔNG để NULL:** `confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`...
   - (c) **Dòng trong `auth.identities`** (provider 'email') — thiếu cái này là lỗi đăng nhập dù mọi thứ khác đúng.
   - (d) Dòng trong `profiles` (vì FK `employees.profile_id` trỏ tới `profiles`).
   - → Đã đóng gói sẵn trong hàm `admin_create_employee` (mục 3). Dùng hàm này, đừng tự INSERT auth.users rời rạc.
10. **Kiểm tra khóa ngoại bằng `pg_constraint`, KHÔNG dùng `information_schema`** — `information_schema` có thể báo sót FK (đã từng gây nhầm khi xử lý `profiles`).

---

## 3. Mô hình danh tính & phân quyền

**3 bảng liên quan con người** — mỗi bảng một vai trò, ĐỪNG nhầm:

| Bảng | Vai trò | Khóa liên kết |
|---|---|---|
| `users` | **Nguồn chính** cho đăng nhập & vai trò. App đọc role từ đây. | `users.id` = `auth.users.id`; `users.role_id` → `roles.id` |
| `roles` | Danh mục 6 vai trò | |
| `employees` | Hồ sơ nhân sự (phòng ban, vị trí, lương) | `employees.profile_id` = `auth.users.id`; **FK trỏ tới `profiles.id`** |
| `profiles` | Bảng legacy. Module HR còn đọc trực tiếp + FK của employees đòi. Chưa xóa được. | `profiles.id` = `auth.users.id` |

**Hàm bảo mật trong DB (dùng trong RLS):**
- `current_user_role()` → tên vai trò user đang đăng nhập (đọc từ `users` + `roles`).
- `is_admin()`, `is_manager()`, `is_manager_or_admin()`, `is_accountant_or_above()` → gọi lại `current_user_role()`.
- `current_user_team_id()` → đọc `employees.team_id`.

**Hàm tạo nhân viên — `admin_create_employee(...)`:**
- Hàm RPC (SECURITY DEFINER) tạo trọn vẹn 1 nhân viên trong 1 giao dịch: `auth.users` + token rỗng + `auth.identities` + `users` (qua trigger) + `profiles` + `employees`.
- Chỉ `admin`/`manager` gọi được (kiểm tra quyền trong thân hàm).
- Frontend gọi qua `supabase.rpc("admin_create_employee", { p_email, p_password, p_role_name, ... })`.

**Trigger tự động:** `on_auth_user_created` (hàm `handle_new_user`) — khi có dòng mới ở `auth.users`, tự tạo dòng `users`. KHÔNG tạo `profiles`/`employees`/`identities`.

### Quy trình tạo tài khoản nhân viên
**Cách chính (khuyên dùng) — 1 bước qua app:**
- Đăng nhập admin/manager → Nhân sự → **+ Thêm nhân viên** → điền form (có ô Mật khẩu + dropdown Vai trò) → Tạo.
- Hàm `admin_create_employee` lo hết. Nhân viên đăng nhập được ngay.

**Cách phụ — qua Supabase Authentication dashboard:**
- Authentication → Add user (tạo `auth.users` + identity + trigger tạo `users`). Nhưng KHÔNG tạo `employees`/`profiles` → phải bổ sung thủ công. Chỉ dùng khi cần tài khoản không gắn hồ sơ HR.

### Tóm tắt quyền theo vai trò
| Vai trò | Làm được gì | Xem giá? |
|---|---|---|
| **admin** (Chủ) | Toàn quyền | Có |
| **manager** (Quản lý) | Listings, lịch, giá, booking, task, tài chính, báo cáo, HR, hiệu suất | Có |
| **sales** (Sale + check-in/out) | Tạo/xem booking, xem lịch, quản lý task | Không |
| **accountant** (Kế toán) | Xem booking, tài chính, báo cáo | Có |
| **cleaner** (Dọn dẹp) | Task được giao, xem hiệu suất bản thân | Không |
| **maintenance** (Bảo trì) | Task được giao | Không |

---

## 4. Danh mục bảng (40 bảng)

**Danh tính & nhân sự:** `users`, `roles`, `profiles` (legacy), `employees`, `departments`, `positions`, `teams`
**Villa & tiện ích:** `listings`, `listing_images`, `amenities`, `listing_amenities`, `pricing_rules`
**Lịch:** `listing_calendar` (chính), `calendar_entries` (Dashboard), `listing_blocks` (tính năng Bảo trì)
**Đặt phòng & tài chính:** `bookings`, `payments`, `revenues`, `expenses`, `customers`, `channels`
**Công việc:** `tasks`
**HR & hiệu suất:** `employee_performance_logs`, `employee_performance_scores`, `employee_monthly_reviews`
**Chat:** `chat_groups`, `chat_group_members`, `chat_topics`, `chat_messages`, `chat_attachments`
**Báo cáo & vận hành:** `daily_ops_logs`, `weekly_reviews`, `monthly_reports`
**Marketing & nghiên cứu:** `content_posts`, `competitors`, `competitor_prices`, `reviews`, `owners`
**Hệ thống:** `activity_logs`, `notifications`

> Tất cả bảng đã bật RLS và có policy.

---

## 5. Bảng `listing_calendar` (lịch chính)

Cột: `id`, `listing_id`, `date`, `status` (enum), `booking_id`, `price_override`, `min_nights`, `note`, `created_at`, `updated_at`.
Có **ràng buộc duy nhất (listing_id, date)** → chống đặt trùng.

---

## 6. Quy ước & giá trị hợp lệ

**Vai trò (`roles.name`):** `admin`, `manager`, `sales`, `cleaner`, `maintenance`, `accountant`
**task_type:** `cleaning`, `maintenance`, `inspection`, `guest_support`, `checkin_prepare`, `checkout_check`, `other`
**calendar_status (enum):** `available`, `booked`, `blocked`, `maintenance`
**employee_status:** `candidate`, `interviewing`, `probation`, `active`, `inactive`, `resigned`, `terminated`, `rejected`
(Chặn đăng nhập: `inactive`, `resigned`, `terminated`, `rejected`)
**booking.status:** `pending`, `confirmed`, `completed`, `cancelled`

---

## 7. Nợ kỹ thuật

✅ **ĐÃ XỬ LÝ — Tài khoản mới thiếu profiles:** hàm `admin_create_employee` giờ tạo đủ cả `profiles` + `identities`.

Còn tồn:
1. **3 bảng danh tính song song** (`users` / `profiles` / `employees`). Bỏ `profiles` cần: gỡ FK `employees.profile_id`, tìm hết `.from("profiles")` trong code, chuyển sang `users`, test, rồi mới xóa.
2. **3 bảng lịch song song.** `listing_calendar` (trang Lịch) + `calendar_entries` (Dashboard) + `listing_blocks` (Bảo trì). Gộp cần sửa code frontend.
3. **Lệch code ↔ DB:**
   - `supabase.ts` (`AppRole`) còn `cleaningstaff`, `staff` (đã bỏ ở DB). Vô hại nhưng nên dọn.
   - `supabase.ts` (`ListingCalStatus`) có `owner_stay`, `cleaning_hold` nhưng enum DB `calendar_status` lại có `booked` và thiếu 2 cái đó → bug tiềm ẩn.
4. **Bảo mật:** leaked password protection đang TẮT trong Supabase Auth → nên bật.

---

## 8. Cách yêu cầu AI hỗ trợ (tránh lỗi)

- "Đọc file ngữ cảnh này trước. KHÔNG tạo bảng/vai trò trùng với danh mục đã có."
- "Trước khi xóa/đổi tên bảng, hỏi tôi và cảnh báo bảng đó có đang được code đọc không."
- "Mỗi lần chỉ làm 1 việc, dừng cho tôi xác nhận."
- "Lệnh thay đổi DB phải dạng SQL để tôi tự dán vào Supabase SQL Editor."
- "Nếu đề nghị làm thêm việc ngoài yêu cầu → hỏi tôi trước, đừng tự làm."
