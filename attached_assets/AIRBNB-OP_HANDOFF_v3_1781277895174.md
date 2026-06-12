# Airbnb Ops — Tài liệu Bàn giao & Ngữ cảnh Dự án (v3)

> **Cách dùng:** Dán **toàn bộ** file này vào đầu phiên chat mới (Claude / ChatGPT) hoặc lưu trong project Replit. Mục đích: AI hiểu ngay hệ thống đang có gì, đã làm tới đâu, và tránh lặp lại lỗi cũ.
>
> Cập nhật: 2026-06 — sau khi hoàn thành luồng tạo nhân viên 1-bước, sửa dòng tiền & múi giờ, và phân công task.

---

## 0. Bối cảnh người dùng & cách làm việc

- Chủ dự án: **Toàn** — quản lý villa cho thuê ngắn hạn tại TP.HCM, **không chuyên kỹ thuật (non-tech)**. Cần giải thích plain language, từng bước, xác nhận sau mỗi bước.
- Công cụ: code trên **Replit**, dữ liệu trên **Supabase**, version trên **GitHub**. Sửa code qua **Replit Agent** (dán prompt), sửa DB qua **Supabase SQL Editor** (dán SQL).
- AI **đọc được Supabase** (read-only qua connector) nhưng **không ghi** — mọi thay đổi DB do Toàn tự chạy SQL. AI **không** truy cập trực tiếp Replit/GitHub — Toàn copy-paste file.
- Nguyên tắc: **mỗi lần 1 bước, dừng xác nhận**; **không tự refactor/thêm tính năng ngoài yêu cầu**; **thiếu thông tin thì HỎI, đừng đoán**.

---

## 1. Tổng quan & Stack

App quản lý vận hành **villa cho thuê ngắn hạn** (Airbnb/Booking.com) — dashboard nội bộ: villa, đặt phòng, lịch trống, công việc, tài chính, nhân sự.

- Frontend: React 18 + Vite + Tailwind v4 + shadcn/ui + wouter + react-query + react-hook-form + zod + recharts
- Backend dữ liệu: **Supabase** (PostgreSQL + Auth + Storage). KHÔNG có API server riêng.
- pnpm monorepo, app chính ở `artifacts/admin/`. File quan trọng: `src/lib/supabase.ts`, `src/lib/auth-context.tsx`, `src/lib/role-permissions.ts`, `src/pages/*.tsx`.
- Auth: Supabase email/password, anon key ở client, RLS kiểm soát mọi truy cập.

---

## 2. Trạng thái hiện tại — đang chạy được

App **chạy đầy đủ**: đăng nhập, Tổng quan, Lịch, Đặt phòng, Công việc, Nhân sự, Báo cáo, Doanh thu/Chi phí.

Các tính năng đã hoàn thiện/sửa xong:
- ✅ 6 vai trò chuẩn, phân quyền thống nhất đọc từ `users`+`roles`.
- ✅ Tạo nhân viên **1 bước** qua app (tài khoản đăng nhập + hồ sơ HR cùng lúc).
- ✅ Booking tự tạo task + ghi nhận tiền (cọc/balance/doanh thu) đúng.
- ✅ Báo cáo dòng tiền & doanh thu tính đúng, không lệch múi giờ.
- ✅ Admin/manager phân công task cho nhân viên, có gợi ý vai trò phù hợp.

---

## 3. ⚠️ QUY TẮC VÀNG (đọc trước khi sửa bất cứ gì)

1. **Liệt kê bảng hiện có trước khi tạo bảng mới** (đã có 40 bảng). KHÔNG tạo trùng.
2. **KHÔNG tạo bảng danh tính/lịch mới.** Danh tính: `users`/`employees`/`profiles`. Lịch: `listing_calendar`.
3. **Tên vai trò CỐ ĐỊNH, đúng 6:** `admin`, `manager`, `sales`, `cleaner`, `maintenance`, `accountant`. KHÔNG dùng biến thể cũ (sale, cleaningstaff, staff, reception). **sales kiêm luôn check-in/out.**
4. **Vai trò đọc từ `users`+`roles`** (qua `users.role_id`), KHÔNG đọc `profiles`.
5. **KHÔNG xóa/đổi tên** `profiles`, `calendar_entries`, `listing_blocks` — code frontend đọc trực tiếp.
6. **Kiểm tra khóa ngoại bằng `pg_constraint`, KHÔNG dùng `information_schema`** (information_schema từng báo sót FK → gây lỗi).
7. **Tạo tài khoản auth bằng SQL phải đủ 4 mảnh** (nếu thiếu → lỗi đăng nhập `Database error querying schema` hoặc lỗi FK):
   - `auth.users` (kèm `email_confirmed_at = now()`)
   - **Các cột token = chuỗi rỗng `''`, KHÔNG NULL:** `confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`
   - **Dòng `auth.identities`** (provider 'email')
   - Dòng `profiles` (vì FK `employees.profile_id → profiles.id`)
   - → Đã gói trong hàm `admin_create_employee`. Dùng hàm, đừng INSERT auth.users rời.
8. **Ngày tháng: dùng `T12:00:00` (giữa trưa), KHÔNG `T00:00:00`** — VN là UTC+7, nửa đêm bị lùi sang ngày hôm trước khi đổi sang UTC → sai báo cáo theo ngày.
9. **`upsert(..., { onConflict })` cần ràng buộc UNIQUE khớp đúng cột** — thiếu là upsert lỗi và không ghi gì.
10. **`employees.role` (text) phải khớp `roles.name`** — đừng nhập tay tiếng Việt ("vệ sinh", "Bán hàng"...). Code lọc task theo giá trị chuẩn.
11. **Trước khi xóa/đổi tên bảng: tìm `.from("tên_bảng")` trong toàn bộ code** rồi mới quyết. Hỏi Toàn trước.
12. **Replit Agent: ép giữ đúng phạm vi** — luôn ghi "KHÔNG refactor, KHÔNG sửa file khác". Nếu Agent đề nghị làm thêm → từ chối.

---

## 4. Nhật ký tiến độ (đã làm gì)

**Đợt 1 — Dọn database nền:**
- Chuẩn hoá vai trò → 6 (đổi sale→sales, cleaningstaff→cleaner, bỏ staff).
- Viết lại `current_user_role()` đọc từ `users`+`roles` (thay vì `profiles`).
- Mở khóa 9 bảng RLS (customers, owners, channels, competitors, competitor_prices, content_posts, reviews, teams, employee_monthly_reviews).
- Gắn trigger `on_auth_user_created` (hàm `handle_new_user`) tự tạo dòng `users`.
- Thử gộp 3 bảng lịch & bỏ `profiles` → **đã hoàn tác** (code còn dùng). Giữ nguyên.
- Sửa ràng buộc `tasks_task_type_check` (thêm `checkin_prepare`, `checkout_check`, `other`) → booking tạo task được.
- Gộp check-in/out vào sales (thêm `sales` vào quyền `manageTasks` trong `role-permissions.ts`).

**Đợt 2 — Luồng tạo nhân viên 1-bước:**
- Viết hàm RPC `admin_create_employee(...)` (17 tham số): tạo trọn `auth.users` + token rỗng + `auth.identities` + `users`(qua trigger) + `profiles` + `employees` trong 1 giao dịch. Chỉ admin/manager gọi được.
- Sửa `hr.tsx`: thêm ô **Mật khẩu**, đổi field **Vai trò** thành dropdown 6 vai trò, gọi `supabase.rpc("admin_create_employee", ...)` thay cho insert thẳng.
- Phát hiện & sửa lần lượt 3 lỗi: FK profile_id (thiếu profiles) → token NULL → thiếu identity.

**Đợt 3 — Dòng tiền & phân công (Giai đoạn 2 test):**
- Thêm UNIQUE `payments(booking_id, payment_type)` và `revenues(booking_id, category)` → upsert tiền chạy đúng (cọc/balance/doanh thu).
- Mô hình tiền: **cọc tính khi nhận** (lúc tạo booking), **doanh thu ghi nhận khi hoàn thành** (toàn bộ giá trị).
- Sửa lỗi múi giờ: `T00:00:00` → `T12:00:00` (6 chỗ trong `bookings.tsx`).
- Thêm phân công task trong `TaskDetailDialog`: dropdown chọn nhân viên (chỉ admin/manager), lưu `assigned_employee_id`. Lọc mềm theo loại task (vai trò khớp lên đầu) qua hằng `TASK_PREFERRED_ROLES`.
- Chuẩn hoá `employees.role` đồng bộ từ `users`+`roles`.

---

## 5. Mô hình danh tính & phân quyền

**3 bảng con người** (đừng nhầm):
| Bảng | Vai trò | Liên kết |
|---|---|---|
| `users` | **Nguồn chính** đăng nhập & vai trò | `users.id`=`auth.users.id`; `users.role_id`→`roles.id` |
| `roles` | Danh mục 6 vai trò | |
| `employees` | Hồ sơ HR | `employees.profile_id`=`auth.users.id`; **FK→`profiles.id`** |
| `profiles` | Legacy, HR còn đọc + FK đòi | `profiles.id`=`auth.users.id` |

**Quyền theo vai trò:**
| Vai trò | Làm được | Xem giá |
|---|---|---|
| admin (Chủ) | Toàn quyền | Có |
| manager (Quản lý) | Listings, lịch, giá, booking, task, tài chính, báo cáo, HR | Có |
| sales (Sale + check-in/out) | Tạo/xem booking, lịch, quản lý task | Không |
| accountant (Kế toán) | Xem booking, tài chính, báo cáo | Có |
| cleaner (Dọn dẹp) | Task được giao, xem hiệu suất bản thân | Không |
| maintenance (Bảo trì) | Task được giao | Không |

**Lọc nhân viên khi phân công task (`TASK_PREFERRED_ROLES`):**
`cleaning`→cleaner · `maintenance`→maintenance · `checkin_prepare`/`checkout_check`→sales · `inspection`→maintenance,manager · còn lại→không ưu tiên.

---

## 6. Hàm & Trigger quan trọng trong DB

- **`current_user_role()`** → tên vai trò user đang đăng nhập (đọc users+roles). `is_admin()`, `is_manager()`, `is_manager_or_admin()`, `is_accountant_or_above()` gọi lại nó.
- **`current_user_team_id()`** → đọc `employees.team_id`.
- **`handle_new_user()`** + trigger `on_auth_user_created` → tạo dòng `users` khi có auth user mới.
- **`admin_create_employee(...)`** → tạo nhân viên 1-bước (mục 4). Frontend gọi qua RPC.

**Ràng buộc quan trọng:**
- `payments_booking_type_uniq` UNIQUE(booking_id, payment_type)
- `revenues_booking_category_uniq` UNIQUE(booking_id, category)
- `listing_calendar` UNIQUE(listing_id, date) — chống đặt trùng.

---

## 7. Danh mục bảng (40) & giá trị hợp lệ

**Nhóm bảng:** Danh tính/HR (`users`, `roles`, `profiles`, `employees`, `departments`, `positions`, `teams`) · Villa (`listings`, `listing_images`, `amenities`, `listing_amenities`, `pricing_rules`) · Lịch (`listing_calendar`, `calendar_entries`, `listing_blocks`) · Booking/Tài chính (`bookings`, `payments`, `revenues`, `expenses`, `customers`, `channels`) · Task (`tasks`) · HR hiệu suất (`employee_performance_logs`, `employee_performance_scores`, `employee_monthly_reviews`) · Chat (`chat_groups`, `chat_group_members`, `chat_topics`, `chat_messages`, `chat_attachments`) · Báo cáo (`daily_ops_logs`, `weekly_reviews`, `monthly_reports`) · Marketing (`content_posts`, `competitors`, `competitor_prices`, `reviews`, `owners`) · Hệ thống (`activity_logs`, `notifications`).

**Giá trị hợp lệ:**
- `roles.name`: admin, manager, sales, cleaner, maintenance, accountant
- `task_type`: cleaning, maintenance, inspection, guest_support, checkin_prepare, checkout_check, other
- `calendar_status`: available, booked, blocked, maintenance
- `employee_status`: candidate, interviewing, probation, active, inactive, resigned, terminated, rejected (chặn login: inactive/resigned/terminated/rejected)
- `booking.status`: pending, confirmed, completed, cancelled
- `payment_type`: deposit, balance, refund, cancellation_fee

---

## 8. Nợ kỹ thuật còn lại

1. **3 bảng danh tính song song** (users/profiles/employees). Bỏ profiles cần: gỡ FK `employees.profile_id`, sửa code HR đọc users, rồi mới xóa.
2. **3 bảng lịch song song** (listing_calendar/calendar_entries/listing_blocks) — gộp cần sửa code frontend.
3. **Lệch code↔DB:**
   - `supabase.ts` `AppRole` còn cleaningstaff/staff (đã bỏ ở DB).
   - `supabase.ts` `ListingCalStatus` có owner_stay/cleaning_hold nhưng enum DB `calendar_status` có booked & thiếu 2 cái đó → bug tiềm ẩn.
4. **Lỗi typecheck nền** trong `vi.ts` & `performance.tsx` (i18n type mismatch) — chưa ảnh hưởng chạy, nên dọn.
5. **Bảo mật:** leaked password protection đang TẮT trong Supabase Auth → nên bật.
6. `employees.role` có thể lệch lại nếu nhập tay trong HR (xem Quy tắc Vàng #10).

---

## 9. Bước tiếp theo (theo lộ trình 4 giai đoạn)

- **Giai đoạn 2 (đang làm):** test từng module theo từng vai trò; vá 2 lệch code-DB (#3 ở trên).
- **Giai đoạn 3:** bật bảo mật; thay dữ liệu test bằng villa & nhân viên thật.
- **Giai đoạn 4:** deploy bản chính thức trên Replit; dọn GitHub; phương án sao lưu.

> Mục tiêu cuối: app dùng được thật cho vận hành villa, tối ưu thời gian & chi phí.

---

## 10. Cách yêu cầu AI hỗ trợ (tránh tái lỗi)

- "Đọc file ngữ cảnh này trước. KHÔNG tạo bảng/vai trò trùng."
- "Trước khi xóa/đổi bảng: hỏi tôi và cảnh báo bảng có đang được code đọc không."
- "Mỗi lần 1 việc, dừng cho tôi xác nhận. Lệnh DB dạng SQL để tôi tự dán vào SQL Editor."
- "Tôi non-tech — giải thích plain language, không lý thuyết thừa."
- (Với Replit Agent) "KHÔNG refactor, KHÔNG sửa file khác ngoài yêu cầu."
