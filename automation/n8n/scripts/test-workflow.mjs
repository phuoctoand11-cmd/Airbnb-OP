#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const workflowPath = new URL("../workflows/airbnb-import-dry-run.json", import.meta.url);
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const codeByName = Object.fromEntries(
  workflow.nodes.filter((node) => node.parameters.jsCode).map((node) => [node.name, node.parameters.jsCode]),
);

function runNode(name, input = []) {
  const code = codeByName[name];
  assert.ok(code, `Missing Code node: ${name}`);
  return vm.runInNewContext(`(() => { ${code} })()`, {
    $input: { all: () => input },
    Buffer,
    Date,
    JSON,
    Map,
    Number,
    Object,
    Set,
    String,
  });
}

function clone(value) {
  return structuredClone(value);
}

function expectThrow(label, action, pattern) {
  assert.throws(action, pattern, label);
}

const fixtures = runNode("Redacted CSV Fixtures");
const parsed = runNode("Parse and Normalize - No Writes", fixtures);
const keyed = runNode("Idempotency Preview - No Writes", parsed);
const mapped = runNode("Listing Mapping Preview - No Writes", keyed);

assert.ok(parsed.every(({ json }) => json.valid === true));
assert.equal(parsed.reduce((sum, { json }) => sum + json.normalized_count, 0), 6);
assert.equal(mapped.reduce((sum, { json }) => sum + json.database_writes, 0), 0);
assert.equal(mapped.reduce((sum, { json }) => sum + json.network_calls, 0), 0);

const empty = clone(fixtures[0]);
empty.json.csv = "";
expectThrow("empty CSV", () => runNode("Parse and Normalize - No Writes", [empty]), /CSV is empty/);

const oversized = clone(fixtures[0]);
oversized.json.csv = "x".repeat(1024 * 1024 + 1);
expectThrow("oversized CSV", () => runNode("Parse and Normalize - No Writes", [oversized]), /1 MiB/);

const missingHeader = clone(fixtures[0]);
missingHeader.json.csv = missingHeader.json.csv.replace("Mã tham chiếu", "Cột khác");
expectThrow("missing required column", () => runNode("Parse and Normalize - No Writes", [missingHeader]), /Missing required columns/);

const unclosedQuote = clone(fixtures[0]);
unclosedQuote.json.csv += '\nĐặt phòng,"BROKEN';
expectThrow("unclosed quoted field", () => runNode("Parse and Normalize - No Writes", [unclosedQuote]), /unclosed quoted field/);

const unsafe = clone(fixtures[0]);
unsafe.json.dry_run = false;
expectThrow("dry-run guard", () => runNode("Parse and Normalize - No Writes", [unsafe]), /dry_run must be true/);

const invalidDate = clone(fixtures[0]);
invalidDate.json.source = "invalid-date.csv";
invalidDate.json.csv = invalidDate.json.csv.replace("08/15/2026", "02/30/2026");
const invalidAmount = clone(fixtures[0]);
invalidAmount.json.source = "invalid-amount.csv";
invalidAmount.json.csv = invalidAmount.json.csv.replace(",USD,200,,", ",USD,not-a-number,,");
const invalidWidth = clone(fixtures[0]);
invalidWidth.json.source = "invalid-width.csv";
invalidWidth.json.csv += ",unexpected";
const partial = runNode("Parse and Normalize - No Writes", [fixtures[0], invalidDate, invalidAmount, invalidWidth]);
assert.equal(partial[0].json.valid, true);
assert.equal(partial[1].json.valid, false);
assert.ok(partial[1].json.errors.some((error) => error.codes?.includes("invalid_payout_date")));
assert.equal(partial[2].json.valid, false);
assert.ok(partial[2].json.errors.some((error) => error.codes?.includes("invalid_amount")));
assert.equal(partial[3].json.valid, false);
assert.ok(partial[3].json.errors.some((error) => error.code === "invalid_column_count"));

const duplicated = runNode("Idempotency Preview - No Writes", [...parsed, ...clone(parsed)]);
assert.equal(duplicated.reduce((sum, { json }) => sum + json.idempotency_preview.duplicate, 0), 6);

const unknown = clone(keyed);
unknown[1].json.transactions.find(
  (transaction) => transaction.confirmation_code === "HMREDACTED2" && transaction.transaction_type === "booking",
).listing_name = "Villa Không Map";
const unknownMapped = runNode("Listing Mapping Preview - No Writes", unknown);
assert.equal(unknownMapped[1].json.listing_mapping_preview.unmapped_listing, 2);
assert.equal(
  unknownMapped[1].json.transactions.filter((transaction) => transaction.classification === "unmapped_listing").length,
  2,
);

console.log("PASS workflow JSON and all Code nodes");
console.log("PASS 2 valid fixtures, 6 normalized records, 0 network calls, 0 database writes");
console.log("PASS empty, oversized, missing-header, unclosed-quote, date, amount, width, and dry-run guards");
console.log("PASS partial failure, duplicate detection, direct mapping, inherited mapping, and unmapped listing");
