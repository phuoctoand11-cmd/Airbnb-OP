// Edge Function: airbnb-import
// Preview is read-only; commit is one authenticated PostgreSQL transaction.

import { createClient } from "npm:@supabase/supabase-js@2.104.1";

const MAX_CSV_BYTES = 1024 * 1024;
const ALLOWED_ROLES = new Set(["admin", "manager", "accountant"]);
const BOM = 0xfeff;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Item = {
  start?: string; end?: string; guest?: string; listingName?: string;
  sourceAmount: number; withholding: number; currency: string; coHost: boolean;
};
type Block = {
  referenceCode: string; payoutDate: string; paidAmount: number;
  items: Record<string, Item>;
};
type PreviewRow = {
  confirmation_code: string; guest: string; check_in: string; check_out: string;
  listing_name: string; listing_id: string | null; mapped: boolean;
  usd_after_tax: number; amount_vnd: number;
  action: "create" | "update_imported" | "merge_manual";
  existing_id: string | null; excluded: boolean; payout_index: number;
  transaction_type: "reservation" | "co_host";
  source_amount: number; source_currency: string;
};

function parseCSV(text: string): string[][] {
  if (text.charCodeAt(0) === BOM) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field");
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseAmount(value: string, label: string): number {
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) throw new Error(`${label} is not a valid number`);
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) throw new Error(`${label} is not finite`);
  return amount;
}

function parseDate(value: string, label: string): string {
  const match = String(value ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new Error(`${label} must use MM/DD/YYYY`);
  const month = Number(match[1]), day = Number(match[2]), year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${label} is not a valid calendar date`);
  }
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization") ?? "";
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) return json({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) throw new Error("Supabase function environment is incomplete");
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser(tokenMatch[1]);
    if (authError || !authData.user) return json({ error: "Invalid or expired session" }, 401);
    const { data: userRow, error: userError } = await supabase
      .from("users").select("role_id, is_active").eq("id", authData.user.id).single();
    if (userError || !userRow || userRow.is_active === false) return json({ error: "User is not active" }, 403);
    const { data: roleRow, error: roleError } = await supabase
      .from("roles").select("name").eq("id", userRow.role_id).single();
    if (roleError || !roleRow || !ALLOWED_ROLES.has(roleRow.name)) {
      return json({ error: "Not authorized to import Airbnb payouts" }, 403);
    }

    let body: { csv?: unknown; dry_run?: unknown; listing_id?: unknown };
    try { body = await request.json(); }
    catch { return json({ error: "Body must be valid JSON" }, 400); }
    const csv = typeof body.csv === "string" ? body.csv : "";
    const dryRun = body.dry_run !== false;
    const filterListingId = typeof body.listing_id === "string" && body.listing_id ? body.listing_id : null;
    if (!csv) return json({ error: "CSV content is required" }, 400);
    if (new TextEncoder().encode(csv).byteLength > MAX_CSV_BYTES) {
      return json({ error: "CSV exceeds the 1 MiB import limit" }, 413);
    }

    const rows = parseCSV(csv);
    if (rows.length < 2) return json({ error: "CSV is empty" }, 400);
    const header = rows[0].map(normalize);
    const requiredColumns = ["Loại", "Mã xác nhận", "Ngày bắt đầu", "Ngày kết thúc", "Khách",
      "Nhà/phòng cho thuê", "Loại tiền tệ", "Số tiền", "Đã chi trả", "Ngày chi trả", "Mã tham chiếu"];
    const missing = requiredColumns.filter((name) => !header.includes(normalize(name)));
    if (missing.length) return json({ error: `Missing required columns: ${missing.join(", ")}` }, 400);
    const invalidWidths = rows.slice(1).map((row, index) => ({ line: index + 2, columns: row.length }))
      .filter((row) => row.columns !== header.length);
    if (invalidWidths.length) return json({ error: "CSV rows have an invalid column count", rows: invalidWidths }, 400);

    const column = (name: string) => header.indexOf(normalize(name));
    const cType = column("Loại"), cCode = column("Mã xác nhận"), cStart = column("Ngày bắt đầu");
    const cEnd = column("Ngày kết thúc"), cGuest = column("Khách"), cListing = column("Nhà/phòng cho thuê");
    const cCurrency = column("Loại tiền tệ"), cAmount = column("Số tiền"), cPaid = column("Đã chi trả");
    const cPayoutDate = column("Ngày chi trả"), cReference = column("Mã tham chiếu");

    const blocks: Block[] = [];
    let current: Block | null = null;
    const ensureItem = (code: string): Item => {
      if (!current!.items[code]) current!.items[code] = {
        sourceAmount: 0, withholding: 0, currency: "USD", coHost: false,
      };
      return current!.items[code];
    };

    for (let index = 1; index < rows.length; index++) {
      const row = rows[index], line = index + 1;
      const type = String(row[cType] ?? "").trim(), code = String(row[cCode] ?? "").trim();
      const currency = String(row[cCurrency] ?? "").trim().toUpperCase();
      if (type === "Payout") {
        if (currency && currency !== "VND") {
          throw new Error(`Line ${line}: unsupported payout currency ${currency}`);
        }
        const referenceCode = String(row[cReference] ?? "").trim();
        if (!referenceCode) throw new Error(`Line ${line}: payout reference code is required`);
        const paidAmount = parseAmount(row[cPaid], `Line ${line} paid amount`);
        if (paidAmount < 0) throw new Error(`Line ${line}: payout amount cannot be negative`);
        current = { referenceCode, payoutDate: parseDate(row[cPayoutDate], `Line ${line} payout date`), paidAmount, items: {} };
        blocks.push(current);
        continue;
      }
      if (!current) continue;
      if (type === "Đặt phòng" && code) {
        const item = ensureItem(code);
        item.start = parseDate(row[cStart], `Line ${line} check-in`);
        item.end = parseDate(row[cEnd], `Line ${line} check-out`);
        item.guest = String(row[cGuest] ?? "").trim(); item.listingName = String(row[cListing] ?? "").trim();
        item.sourceAmount = parseAmount(row[cAmount], `Line ${line} amount`); item.currency = currency || "USD";
      } else if ((normalize(type).includes("thuế khấu lưu") || normalize(type).includes("withholding")) && code) {
        ensureItem(code).withholding += parseAmount(row[cAmount], `Line ${line} withholding`);
      } else if (type.includes("Đồng chủ nhà") && code) {
        const item = ensureItem(code); item.coHost = true;
        if (!item.start) {
          item.start = parseDate(row[cStart], `Line ${line} check-in`);
          item.end = parseDate(row[cEnd], `Line ${line} check-out`);
          item.guest = String(row[cGuest] ?? "").trim(); item.listingName = String(row[cListing] ?? "").trim();
          item.sourceAmount = parseAmount(row[cAmount], `Line ${line} amount`); item.currency = currency || "USD";
        }
      }
    }
    if (!blocks.length) return json({ error: "No VND payout rows were found" }, 400);

    const { data: listings, error: listingsError } = await supabase
      .from("listings").select("id, title, airbnb_listing_name");
    if (listingsError) throw new Error("Unable to load listing mappings");
    const listingsByName = new Map<string, string>();
    for (const listing of listings ?? []) if (listing.airbnb_listing_name) {
      listingsByName.set(normalize(listing.airbnb_listing_name), listing.id);
    }
    let filterListingTitle: string | null = null;
    if (filterListingId) {
      const match = (listings ?? []).find((listing) => listing.id === filterListingId);
      if (!match) return json({ error: "listing_id does not exist" }, 400);
      filterListingTitle = match.title ?? null;
    }

    const findExisting = async (listingId: string, checkIn: string, checkOut: string, code: string) => {
      const byCode = await supabase.from("bookings").select("id").eq("confirmation_code", code).limit(1).maybeSingle();
      if (byCode.error) throw new Error("Unable to check existing confirmation codes");
      if (byCode.data) return { id: byCode.data.id as string, by: "code" as const };
      const byDate = await supabase.from("bookings").select("id").eq("listing_id", listingId)
        .eq("check_in", checkIn).eq("check_out", checkOut).is("confirmation_code", null).limit(1);
      if (byDate.error) throw new Error("Unable to check existing booking dates");
      return byDate.data?.length ? { id: byDate.data[0].id as string, by: "date" as const } : { id: null, by: null };
    };

    const preview: PreviewRow[] = [];
    let sumVnd = 0, sumUsd = 0, skippedCount = 0, excludedCount = 0;
    for (let payoutIndex = 0; payoutIndex < blocks.length; payoutIndex++) {
      const block = blocks[payoutIndex];
      const codes = Object.keys(block.items).filter((code) => block.items[code].start);
      if (!codes.length) continue;
      if (block.paidAmount === 0) { skippedCount += codes.length; continue; }
      const netAmounts = codes.map((code) => Math.max(0, block.items[code].sourceAmount + block.items[code].withholding));
      const totalNet = netAmounts.reduce((total, amount) => total + amount, 0);
      if (totalNet <= 0) { skippedCount += codes.length; continue; }
      const allocatedAmounts: Record<string, number> = {}; let allocated = 0;
      codes.forEach((code, index) => {
        const amount = index === codes.length - 1 ? Math.round(block.paidAmount) - allocated
          : Math.round(block.paidAmount * (netAmounts[index] / totalNet));
        allocatedAmounts[code] = amount; allocated += amount;
      });

      for (const code of codes) {
        const item = block.items[code];
        const listingId = listingsByName.get(normalize(item.listingName)) ?? null;
        const excluded = !!filterListingId && listingId !== filterListingId;
        if (excluded) excludedCount++;
        let action: PreviewRow["action"] = "create", existingId: string | null = null;
        if (listingId && !excluded) {
          const existing = await findExisting(listingId, item.start!, item.end!, code);
          existingId = existing.id;
          action = existing.by === "code" ? "update_imported" : existing.by === "date" ? "merge_manual" : "create";
        }
        const sourceAmount = item.sourceAmount + item.withholding, amountVnd = allocatedAmounts[code] ?? 0;
        if (!excluded) { sumVnd += amountVnd; sumUsd += sourceAmount; }
        preview.push({
          confirmation_code: code, guest: item.guest || "Khách Airbnb", check_in: item.start!, check_out: item.end!,
          listing_name: item.listingName ?? "", listing_id: listingId, mapped: !!listingId,
          usd_after_tax: Number(sourceAmount.toFixed(2)), amount_vnd: amountVnd, action, existing_id: existingId,
          excluded, payout_index: payoutIndex, transaction_type: item.coHost ? "co_host" : "reservation",
          source_amount: Number(item.sourceAmount.toFixed(2)), source_currency: item.currency,
        });
      }
    }

    const kept = preview.filter((row) => !row.excluded);
    const unmapped = [...new Set(preview.filter((row) => !row.mapped).map((row) => row.listing_name))];
    const summary = {
      rate: sumUsd > 0 ? Math.round(sumVnd / sumUsd) : 0, total_payout_vnd: Math.round(sumVnd),
      total_usd_after_tax: Number(sumUsd.toFixed(2)), count: kept.length,
      create: kept.filter((row) => row.mapped && row.action === "create").length,
      update_imported: kept.filter((row) => row.action === "update_imported").length,
      merge_manual: kept.filter((row) => row.action === "merge_manual").length,
      skipped: skippedCount, excluded: excludedCount, unmapped,
      applied_listing_filter: filterListingId, applied_listing_title: filterListingTitle,
    };
    if (dryRun) return json({ dry_run: true, summary, bookings: preview });
    if (unmapped.length) return json({ error: "All Airbnb listing names must be mapped before commit" }, 400);
    const eligible = preview.filter((row) => !row.excluded && row.listing_id && row.amount_vnd > 0);
    if (!eligible.length) return json({ error: "There are no mapped transactions to write" }, 400);

    const idempotencyKeys = new Set<string>();
    for (const row of eligible) {
      const block = blocks[row.payout_index];
      const key = [row.confirmation_code, block.payoutDate, row.transaction_type, row.source_amount].join("|");
      if (idempotencyKeys.has(key)) return json({ error: "CSV contains duplicate Airbnb transactions" }, 400);
      idempotencyKeys.add(key);
    }
    const payouts = blocks.map((block, payoutIndex) => ({
      reference_code: block.referenceCode, payout_date: block.payoutDate, paid_amount: block.paidAmount,
      transactions: eligible.filter((row) => row.payout_index === payoutIndex).map((row) => ({
        listing_id: row.listing_id, confirmation_code: row.confirmation_code,
        transaction_type: row.transaction_type, guest_name: row.guest, check_in: row.check_in, check_out: row.check_out,
        amount: row.source_amount, currency: row.source_currency, allocated_amount_vnd: row.amount_vnd,
      })),
    })).filter((payout) => payout.transactions.length > 0);

    const { data: commitResult, error: commitError } = await supabase.rpc("commit_airbnb_import", {
      p_payouts: payouts, p_expected_listing_id: filterListingId,
    });
    if (commitError) {
      console.error("airbnb-import RPC failed", { code: commitError.code });
      return json({ error: "Airbnb import was rolled back" }, 500);
    }
    return json({ dry_run: false, summary, ...(commitResult as Record<string, unknown>) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected import error" }, 400);
  }
});
