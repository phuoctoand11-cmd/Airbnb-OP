// Edge Function: airbnb-import
// Đọc CSV "completed" của Airbnb và ghi doanh thu vào bookings + revenues.
// CÁCH TÍNH ĐÚNG: doanh thu VND của mỗi booking = lấy THẲNG số ở dòng "Payout"
// (cột "Đã chi trả") của nhóm chứa booking đó — KHÔNG quy đổi theo tỷ giá.
// Booking thuộc nhóm payout = 0đ -> BỎ QUA, không nhập.
// (Booking "Đồng chủ nhà" có payout > 0 = tiền thật về ANVI -> VẪN GHI doanh thu.)
// Ngày ghi nhận doanh thu = check-in + 1.
// GIỮ "Verify JWT" BẬT.
//
// Body JSON: { "csv": "<toàn bộ nội dung file .csv>", "dry_run": true,
//              "listing_id": "<uuid>" | null }
//
// listing_id (tuỳ chọn): khi có giá trị, CHỈ những booking khớp đúng villa đó
// mới được ghi. Booking của villa khác vẫn hiện trong danh sách xem trước với
// excluded = true để người dùng thấy đã loại gì, nhưng không được ghi và không
// tính vào tổng. Đây là bộ LỌC, không phải gán cứng: hàm này không bao giờ đổi
// villa của một booking.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// --- Tiện ích ---

const BOM = 0xfeff;

// Parser CSV chuẩn (xử lý dấu phẩy trong ô có ngoặc kép, và BOM)
function parseCSV(text: string): string[][] {
  if (text.charCodeAt(0) === BOM) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* bỏ qua */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Số: bỏ dấu phẩy ngăn nghìn, giữ dấu chấm thập phân
function num(s: string): number {
  const v = parseFloat((s ?? "").replace(/,/g, "").trim());
  return isNaN(v) ? 0 : v;
}

// "MM/DD/YYYY" -> "YYYY-MM-DD"
function toISO(mdy: string): string {
  const m = (mdy ?? "").trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return "";
  const mm = m[1].padStart(2, "0"), dd = m[2].padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

// chuẩn hoá tên nhà để so khớp
function norm(s: string): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// cộng n ngày vào 'YYYY-MM-DD' (thuần UTC)
function addDays(d: string, n: number): string {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: { csv?: string; dry_run?: boolean; listing_id?: string | null };
  try { body = await req.json(); }
  catch { return json({ error: "Body phải là JSON { csv, dry_run, listing_id? }" }, 400); }

  const csv = body.csv ?? "";
  const dryRun = body.dry_run !== false; // mặc định an toàn
  const filterListingId = body.listing_id ? String(body.listing_id) : null;
  if (!csv) return json({ error: "Thiếu nội dung CSV" }, 400);

  const rows = parseCSV(csv);
  if (rows.length < 2) return json({ error: "File rỗng hoặc sai định dạng" }, 400);

  const header = rows[0];
  const col = (name: string) => header.findIndex((h) => norm(h) === norm(name));
  const cLoai = col("Loại"), cMa = col("Mã xác nhận");
  const cStart = col("Ngày bắt đầu"), cEnd = col("Ngày kết thúc");
  const cKhach = col("Khách"), cNha = col("Nhà/phòng cho thuê");
  const cCur = col("Loại tiền tệ"), cSoTien = col("Số tiền"), cChiTra = col("Đã chi trả");

  if (cLoai < 0 || cMa < 0 || cSoTien < 0 || cChiTra < 0) {
    return json({ error: "Không nhận diện được cột (Loại / Mã xác nhận / Số tiền / Đã chi trả)" }, 400);
  }

  // ---- Gom theo BLOCK payout ----
  // Mỗi dòng "Payout" (VND) mở một nhóm; các dòng đặt phòng/thuế/đồng chủ nhà ngay sau
  // thuộc nhóm đó. payoutVND = số ở cột "Đã chi trả" của dòng Payout.
  type Item = {
    start?: string; end?: string; khach?: string; nha?: string;
    sotien: number; tax: number; coHost: boolean;
  };
  type Block = { payoutVND: number; items: Record<string, Item> };

  const blocks: Block[] = [];
  let cur: Block | null = null;
  const ensure = (ma: string): Item => {
    if (!cur!.items[ma]) cur!.items[ma] = { sotien: 0, tax: 0, coHost: false };
    return cur!.items[ma];
  };

  for (const r of rows.slice(1)) {
    const loai = (r[cLoai] ?? "").trim();
    const ma = (r[cMa] ?? "").trim();
    const cur_ccy = (r[cCur] ?? "").trim();

    if (loai === "Payout" && cur_ccy === "VND") {
      cur = { payoutVND: num(r[cChiTra]), items: {} };
      blocks.push(cur);
      continue;
    }
    if (!cur) continue; // dòng trước payout đầu tiên (không xảy ra với file Airbnb)

    if (loai === "Đặt phòng" && ma) {
      const it = ensure(ma);
      it.start = toISO(r[cStart]); it.end = toISO(r[cEnd]);
      it.khach = (r[cKhach] ?? "").trim(); it.nha = (r[cNha] ?? "").trim();
      it.sotien = num(r[cSoTien]);
    } else if (loai.toLowerCase().includes("withholding") && ma) {
      ensure(ma).tax += num(r[cSoTien]); // âm
    } else if (loai.includes("Đồng chủ nhà") && ma) {
      // Booking dạng đồng chủ nhà: cũng là 1 booking thật.
      // Lấy ngày/khách/nhà/USD nếu chưa có (không ghi đè dòng Đặt phòng nếu trùng mã).
      const it = ensure(ma);
      it.coHost = true;
      if (!it.start) {
        it.start = toISO(r[cStart]); it.end = toISO(r[cEnd]);
        it.khach = (r[cKhach] ?? "").trim(); it.nha = (r[cNha] ?? "").trim();
        it.sotien = num(r[cSoTien]);
      }
    }
  }

  // ---- Bảng map tên nhà Airbnb -> villa trong app ----
  const { data: listings } = await supabase
    .from("listings").select("id, title, airbnb_listing_name");
  const byName: Record<string, string> = {};
  (listings ?? []).forEach((l: any) => {
    if (l.airbnb_listing_name) byName[norm(l.airbnb_listing_name)] = l.id;
  });

  // Nếu người dùng chọn lọc theo villa, villa đó phải tồn tại. Một id sai là lỗi
  // cấu hình, không phải "không khớp gì cả" — dừng hẳn thay vì ghi 0 dòng im lặng.
  let filterListingTitle: string | null = null;
  if (filterListingId) {
    const hit = (listings ?? []).find((l: any) => l.id === filterListingId);
    if (!hit) return json({ error: "listing_id không tồn tại" }, 400);
    filterListingTitle = hit.title ?? null;
  }

  // Tìm booking đã có để KHÔNG tạo trùng
  async function findExisting(listingId: string, ci: string, co: string, code: string) {
    const { data: byCode } = await supabase
      .from("bookings").select("id").eq("confirmation_code", code).maybeSingle();
    if (byCode) return { id: byCode.id as string, by: "code" as const };
    const { data: byDate } = await supabase
      .from("bookings").select("id")
      .eq("listing_id", listingId).eq("check_in", ci).eq("check_out", co)
      .is("confirmation_code", null).limit(1);
    if (byDate && byDate.length) return { id: byDate[0].id as string, by: "date" as const };
    return { id: null, by: null };
  }

  // ---- Dựng danh sách xem trước ----
  const preview: any[] = [];
  let sumVND = 0, sumUSD = 0, skippedCount = 0, excludedCount = 0;

  for (const blk of blocks) {
    // các mã có thông tin booking (ngày bắt đầu) — từ "Đặt phòng" HOẶC "Đồng chủ nhà"
    const mas = Object.keys(blk.items).filter((ma) => blk.items[ma].start);
    if (mas.length === 0) continue;

    // net USD từng booking (để chia khi 1 payout gồm nhiều booking)
    const nets = mas.map((ma) => Math.max(0, blk.items[ma].sotien + blk.items[ma].tax));
    const totalNet = nets.reduce((a, b) => a + b, 0) || 1;

    // phân bổ payout VND cho từng booking (giữ tổng khớp tuyệt đối)
    // LƯU Ý: chia trên TOÀN BỘ nhóm, kể cả booking sẽ bị lọc bỏ. Nếu chỉ chia cho
    // phần còn lại thì booking được giữ sẽ nhận sai số tiền.
    const amounts: Record<string, number> = {};
    if (blk.payoutVND > 0) {
      if (mas.length === 1) {
        amounts[mas[0]] = Math.round(blk.payoutVND);
      } else {
        let allocated = 0;
        mas.forEach((ma, i) => {
          if (i < mas.length - 1) {
            const a = Math.round(blk.payoutVND * (nets[i] / totalNet));
            amounts[ma] = a; allocated += a;
          } else {
            amounts[ma] = Math.round(blk.payoutVND) - allocated;
          }
        });
      }
    }

    for (const ma of mas) {
      const it = blk.items[ma];

      // BỎ QUA: chỉ khi nhóm payout = 0đ (không có tiền thật về ANVI).
      // -> không đưa vào danh sách xem trước, chỉ đếm để báo lại.
      if (blk.payoutVND <= 0) { skippedCount++; continue; }

      const afterTax = it.sotien + it.tax;
      const listing_id = byName[norm(it.nha ?? "")] ?? null;
      const amount_vnd = amounts[ma] ?? 0;

      // Lọc theo villa đã chọn. Dòng vẫn hiện để người dùng thấy đã loại gì.
      const excluded = !!filterListingId && listing_id !== filterListingId;
      if (excluded) excludedCount++;

      let action = "create";
      let existing_id: string | null = null;
      if (listing_id && !excluded) {
        const m = await findExisting(listing_id, it.start!, it.end!, ma);
        existing_id = m.id;
        action = m.by === "code" ? "update_imported"
               : m.by === "date" ? "merge_manual"
               : "create";
      }

      if (!excluded) { sumVND += amount_vnd; sumUSD += afterTax; }

      preview.push({
        confirmation_code: ma,
        guest: it.khach || "Khách Airbnb",
        check_in: it.start!, check_out: it.end!,
        listing_name: it.nha ?? "",
        listing_id, mapped: !!listing_id,
        usd_after_tax: +afterTax.toFixed(2),
        amount_vnd,
        action, existing_id,
        excluded,
      });
    }
  }

  const kept = preview.filter((p) => !p.excluded);

  const summary = {
    // tỷ giá trung bình CHỈ để tham khảo (không dùng để tính nữa)
    rate: sumUSD > 0 ? Math.round(sumVND / sumUSD) : 0,
    total_payout_vnd: Math.round(sumVND),
    total_usd_after_tax: +sumUSD.toFixed(2),
    count: kept.length,
    create: kept.filter((p) => p.mapped && p.action === "create").length,
    update_imported: kept.filter((p) => p.action === "update_imported").length,
    merge_manual: kept.filter((p) => p.action === "merge_manual").length,
    skipped: skippedCount,
    excluded: excludedCount,
    // Tính trên TOÀN BỘ preview, không chỉ phần được giữ. Dòng chưa map cũng bị
    // bộ lọc loại ra khỏi `kept`, nên nếu lọc ở đây thì cảnh báo "chưa map villa"
    // sẽ không bao giờ hiện — đúng lúc người dùng cần nó nhất.
    unmapped: [...new Set(
      preview.filter((p) => !p.mapped).map((p) => p.listing_name),
    )],
    // Giao diện dùng hai trường này để xác nhận bộ lọc THỰC SỰ đã chạy. Bản cũ
    // của function không trả về chúng, nên giao diện sẽ chặn việc ghi thay vì
    // âm thầm nhập nhầm cả file.
    applied_listing_filter: filterListingId,
    applied_listing_title: filterListingTitle,
  };

  if (dryRun) return json({ dry_run: true, summary, bookings: preview });

  // ----- GHI THẬT -----
  const written: any[] = [];
  for (const p of preview) {
    if (p.excluded) { written.push({ code: p.confirmation_code, skipped: "villa khác — đã lọc bỏ" }); continue; }
    if (!p.listing_id) { written.push({ code: p.confirmation_code, skipped: "villa chưa được map" }); continue; }

    let bookingId: string | null = p.existing_id;

    const bookingRow = {
      listing_id: p.listing_id,
      guest_name: p.guest,
      check_in: p.check_in, check_out: p.check_out,
      guests: 1,
      total_amount: p.amount_vnd,
      status: "completed", source: "Airbnb",
      confirmation_code: p.confirmation_code,
    };

    if (bookingId) {
      await supabase.from("bookings").update(bookingRow).eq("id", bookingId);
    } else {
      const { data: ins, error } = await supabase.from("bookings").insert(bookingRow).select("id").single();
      if (error) { written.push({ code: p.confirmation_code, error: error.message }); continue; }
      bookingId = ins.id;
    }

    const { error: rerr } = await supabase.from("revenues").upsert({
      listing_id: p.listing_id, booking_id: bookingId,
      amount: p.amount_vnd, category: "booking_revenue",
      received_at: addDays(p.check_in, 1),
      description: `Airbnb ${p.confirmation_code} - ${p.guest}`,
    }, { onConflict: "booking_id,category" });

    written.push({
      code: p.confirmation_code, booking_id: bookingId, action: p.action,
      amount_vnd: p.amount_vnd, revenue_error: rerr?.message ?? null,
    });
  }

  return json({ dry_run: false, summary, written });
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj, null, 2), {
    status, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
