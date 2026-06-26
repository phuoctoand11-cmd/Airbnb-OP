// cleanup-orphans.mjs
// Dọn file rác (orphan) trong bucket Storage "listing-images".
// File rác = file có trong Storage nhưng KHÔNG còn dòng listing_images nào trỏ tới.
//
// AN TOÀN: mặc định CHỈ LIỆT KÊ (xem trước, không xóa).
// Phải đặt CONFIRM=DELETE mới xóa thật.
//
// CÁCH CHẠY (trong Replit Shell, ở thư mục gốc project):
//   1) Thêm 2 Secret trong Replit (tab Secrets):
//        SUPABASE_URL                = https://ravcgwnshziipdngquop.supabase.co
//        SUPABASE_SERVICE_ROLE_KEY   = (lấy ở Supabase > Settings > API > service_role) -- GIỮ BÍ MẬT
//   2) Xem trước (không xóa gì):     node cleanup-orphans.mjs
//   3) Xóa thật:                     CONFIRM=DELETE node cleanup-orphans.mjs

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'listing-images';

if (!URL || !KEY) {
  console.error('❌ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong Secrets.');
  process.exit(1);
}

const supa = createClient(URL, KEY);

// 1) Lấy tất cả storage_path đang được dùng trong DB (ảnh sống)
const referenced = new Set();
{
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await supa
      .from('listing_images')
      .select('storage_path')
      .not('storage_path', 'is', null)
      .range(from, from + page - 1);
    if (error) { console.error('❌ Lỗi đọc listing_images:', error.message); process.exit(1); }
    data.forEach(r => referenced.add(r.storage_path));
    if (data.length < page) break;
    from += page;
  }
}
console.log(`Ảnh đang dùng trong DB: ${referenced.size}`);

// 2) Liệt kê toàn bộ file trong bucket (đệ quy theo từng thư mục villa)
async function listAll(prefix = '') {
  const out = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const { data, error } = await supa.storage.from(BUCKET).list(prefix, { limit, offset });
    if (error) { console.error('❌ Lỗi list Storage:', error.message); process.exit(1); }
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null || item.metadata == null) {
        out.push(...await listAll(path)); // là "thư mục" -> đệ quy
      } else {
        out.push({ path, size: Number(item.metadata?.size ?? 0) });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}
const allFiles = await listAll();
console.log(`Tổng file trong bucket "${BUCKET}": ${allFiles.length}`);

// 3) Tính file rác
const orphans = allFiles.filter(f => !referenced.has(f.path));
const totalMB = (orphans.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(1);

console.log(`\n=== FILE RÁC (orphan): ${orphans.length} file, ~${totalMB} MB ===`);
orphans
  .sort((a, b) => b.size - a.size)
  .forEach(f => console.log(`${(f.size / 1048576).toFixed(2).padStart(7)} MB   ${f.path}`));

// 4) Xóa (chỉ khi CONFIRM=DELETE)
if (process.env.CONFIRM !== 'DELETE') {
  console.log('\n[XEM TRƯỚC] Chưa xóa gì.');
  console.log('Để xóa thật, chạy:  CONFIRM=DELETE node cleanup-orphans.mjs');
  process.exit(0);
}
if (orphans.length === 0) { console.log('\n✅ Không có file rác để xóa.'); process.exit(0); }

const paths = orphans.map(f => f.path);
for (let i = 0; i < paths.length; i += 100) {
  const batch = paths.slice(i, i + 100);
  const { error } = await supa.storage.from(BUCKET).remove(batch);
  if (error) { console.error('❌ Lỗi xóa:', error.message); process.exit(1); }
  console.log(`Đã xóa ${Math.min(i + 100, paths.length)}/${paths.length}`);
}
console.log(`\n✅ XONG. Đã dọn ${paths.length} file rác (~${totalMB} MB).`);
