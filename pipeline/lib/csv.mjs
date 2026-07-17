/**
 * RFC4180-compliant CSV parser.
 *
 * This is NOT optional pedantry. The CER postcode CSVs quote any value with a
 * thousands separator (`"1,234"`), and 1,077 of 2,811 rows in the solar file
 * contain at least one. A naive `line.split(',')` silently shifts every column
 * after the first quoted field, which understated the national install total by
 * 89% (477,892 vs the true 4,437,269) during research. Always parse properly.
 */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parse a CSV into {header, rows} keeping only rows with the full column count. */
export function parseTable(text) {
  const all = parseCSV(text.trim());
  if (all.length === 0) return { header: [], rows: [] };
  const header = all[0].map((h) => h.trim());
  const rows = all.slice(1).filter((r) => r.length === header.length);
  return { header, rows };
}

/** Numeric coercion that strips thousands separators and handles blanks/dashes. */
export function num(value) {
  if (value == null) return 0;
  const cleaned = String(value).replace(/[,\s$]/g, '');
  if (cleaned === '' || cleaned === '-') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}
