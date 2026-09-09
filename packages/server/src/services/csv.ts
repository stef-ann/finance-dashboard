import type { CsvColumnMapping, CsvField } from "../shared.ts";

// ---------------------------------------------------------------------------
// RFC 4180-ish CSV parser (handles quoted fields, "" escapes, CRLF/LF)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // strip BOM

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // handled by \n
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// ---------------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------------

const FIELD_HINTS: { field: CsvField; test: RegExp }[] = [
  { field: "date", test: /^(posting date|post(ed)? date|transaction date|trans date|date)$/i },
  { field: "description", test: /^(description|payee name|payee|merchant|name|memo\/description)$/i },
  { field: "amountOut", test: /^(debit|withdrawal|withdrawal amount|amount debit|money out|paid out)$/i },
  { field: "amountIn", test: /^(credit|deposit|deposit amount|amount credit|money in|paid in)$/i },
  { field: "amount", test: /^(amount|transaction amount|amt)$/i },
  { field: "balance", test: /^(balance|running balance|running bal\.?|balance after)$/i },
  { field: "category", test: /^(category|categories)$/i },
];

export function detectMapping(headers: string[]): CsvColumnMapping {
  const mapping: CsvColumnMapping = {};
  const used = new Set<CsvField>();
  headers.forEach((hRaw, idx) => {
    const key = headers[idx] && headers[idx]!.trim() !== "" ? headers[idx]!.trim() : `col ${idx + 1}`;
    const h = hRaw.trim();
    let assigned: CsvField = "ignore";
    for (const hint of FIELD_HINTS) {
      if (hint.test.test(h) && !used.has(hint.field)) {
        assigned = hint.field;
        break;
      }
    }
    // second pass: allow a looser "description" match if none found yet
    if (assigned === "ignore" && !used.has("description") && /desc|payee|merchant/i.test(h)) {
      assigned = "description";
    }
    if (assigned !== "ignore") used.add(assigned);
    mapping[key] = assigned;
  });
  return mapping;
}

export function detectFormat(headers: string[]): string {
  const norm = headers.map((h) => h.trim().toLowerCase()).join("|");
  if (norm.includes("posting date") && norm.includes("balance") && norm.includes("details")) {
    return "Chase checking/savings";
  }
  if (norm.includes("transaction date") && norm.includes("post date")) {
    return "Chase credit card";
  }
  return "Generic CSV";
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

export function parseDateToISO(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  // YYYY-MM-DD
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // MM/DD/YYYY or M/D/YY (US)
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let [, mm, dd, yy] = m;
    let year = Number(yy);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return `${year}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}`;
  }
  // DD.MM.YYYY or DD-MM-YYYY
  m = v.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  const parsed = new Date(v);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  return null;
}

/** "-$1,234.56" / "(1,234.56)" / "1234.56" -> cents (integer, signed). */
export function parseAmountToCents(value: string): number | null {
  let v = value.trim();
  if (!v) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(v)) {
    sign = -1;
    v = v.slice(1, -1);
  }
  if (v.includes("-")) sign = -1;
  v = v.replace(/[^0-9.]/g, "");
  if (!v) return null;
  const num = Number(v);
  if (Number.isNaN(num)) return null;
  return Math.round(num * 100) * sign;
}
