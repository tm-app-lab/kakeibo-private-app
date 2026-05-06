// import-utils.js

function numberValue(value) {
  return Math.abs(Number(String(value || "0").replaceAll(",", "")) || 0);
}

function parseCsv(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeHeaderKey(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .normalize("NFKC")
    .replace(/[\s　・･()（）\[\]【】「」『』_\-ー－]/g, "")
    .toLowerCase();
}

function normalizedHeaderMap(raw = {}, headers = Object.keys(raw)) {
  const map = new Map();
  for (const header of headers) {
    const key = normalizeHeaderKey(header);
    if (key && !map.has(key)) map.set(key, header);
  }
  return map;
}

function pickCsvValue(raw, headers, candidates = []) {
  const map = normalizedHeaderMap(raw, headers);
  for (const candidate of candidates) {
    const normalized = normalizeHeaderKey(candidate);
    const exact = map.get(normalized);
    if (exact !== undefined && raw[exact] !== undefined) return raw[exact];
  }
  for (const [normalized, original] of map.entries()) {
    if (candidates.some((candidate) => normalized.includes(normalizeHeaderKey(candidate)))) {
      return raw[original] || "";
    }
  }
  return "";
}

function hasHeader(headers, candidates = []) {
  const normalizedHeaders = headers.map(normalizeHeaderKey);
  return candidates.some((candidate) => {
    const normalized = normalizeHeaderKey(candidate);
    return normalizedHeaders.some((header) => header === normalized || header.includes(normalized));
  });
}

function normalizeMonthText(value) {
  const raw = String(value || "").trim().normalize("NFKC");
  const match = raw.match(/(20\d{2})\D?(0?[1-9]|1[0-2])/);
  if (!match) return raw.replaceAll("/", "-").slice(0, 7);
  return `${match[1]}-${match[2].padStart(2, "0")}`;
}

function normalizeImportedRow(raw, fileName) {
  const date = pickCsvValue(raw, Object.keys(raw), ["日付"]);
  const month = normalizeMonthText(date);
  return {
    sourceFile: fileName,
    month,
    counted: pickCsvValue(raw, Object.keys(raw), ["計算対象"]),
    date,
    content: pickCsvValue(raw, Object.keys(raw), ["内容"]),
    amount: pickCsvValue(raw, Object.keys(raw), ["金額（円）", "金額"]),
    institution: pickCsvValue(raw, Object.keys(raw), ["保有金融機関"]),
    major: pickCsvValue(raw, Object.keys(raw), ["大項目"]),
    middle: pickCsvValue(raw, Object.keys(raw), ["中項目"]),
    memo: pickCsvValue(raw, Object.keys(raw), ["メモ"]),
    transfer: pickCsvValue(raw, Object.keys(raw), ["振替"]),
    id: pickCsvValue(raw, Object.keys(raw), ["ID"]),
  };
}

function detectImportType(headers, fileName = "") {
  const normalizedName = String(fileName || "").normalize("NFKC").toLowerCase();
  if (/enavi|rakuten|楽天|楽天カード/.test(normalizedName)) return "rakuten";
  const hasRakutenDate = hasHeader(headers, ["利用日", "利用年月日"]);
  const hasRakutenShop = hasHeader(headers, ["利用店名商品名", "利用店名・商品名", "利用店名", "商品名"]);
  const hasRakutenAmount = hasHeader(headers, ["利用金額", "支払金額", "支払総額", "月支払金額"]);
  if (hasRakutenDate && (hasRakutenShop || hasRakutenAmount)) return "rakuten";
  if (hasHeader(headers, ["計算対象"]) && hasHeader(headers, ["保有金融機関"])) return "moneyforward";
  return "moneyforward";
}

function normalizeRakutenRow(raw, fileName, headers = Object.keys(raw)) {
  const date = pickCsvValue(raw, headers, ["利用日", "利用年月日"]);
  const amount = pickCsvValue(raw, headers, ["利用金額"]);
  const content = pickCsvValue(raw, headers, ["利用店名・商品名", "利用店名商品名", "利用店名", "商品名"]);
  if (!date && !content && numberValue(amount) === 0) return null;
  const fileMonth = String(fileName || "").match(/enavi(\d{6})/i)?.[1];
  const paymentHeader = headers.find((header) => /月支払金額$/.test(String(header || "").normalize("NFKC"))) || "";
  const paymentAmount = raw[paymentHeader]
    || pickCsvValue(raw, headers, ["月支払金額", "支払金額", "支払総額", "利用金額"]);
  const paymentMonth = fileMonth
    ? `${fileMonth.slice(0, 4)}-${fileMonth.slice(4, 6)}`
    : normalizeMonthText(date);
  const total = pickCsvValue(raw, headers, ["支払総額", "合計"]);
  return {
    sourceType: "rakuten",
    sourceFile: fileName,
    month: paymentMonth,
    useMonth: normalizeMonthText(date),
    date,
    content,
    user: pickCsvValue(raw, headers, ["利用者", "本人", "家族"]),
    paymentMethod: pickCsvValue(raw, headers, ["支払方法", "支払い方法"]),
    amount,
    fee: pickCsvValue(raw, headers, ["手数料/利息", "手数料", "利息"]),
    total,
    paymentAmount,
    carryover: pickCsvValue(raw, headers, ["月繰越残高", "繰越残高"]),
    id: `${fileName}-${date}-${content}-${total}-${amount}-${paymentAmount}`,
  };
}

function importedRowKey(row) {
  return row.id || `${row.sourceFile}-${row.date}-${row.content}-${row.amount || row.paymentAmount}`;
}

function mergeImportedRows(existingRows, newRows) {
  const replacing = new Set(newRows.map((row) => `${row.sourceType}:${row.month}`).filter((key) => !key.endsWith(":")));
  const keptRows = existingRows.filter((row) => !replacing.has(`${row.sourceType}:${row.month}`));
  const merged = new Map(keptRows.map((row) => [importedRowKey(row), row]));
  for (const row of newRows) merged.set(importedRowKey(row), row);
  return [...merged.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

if (typeof module !== "undefined") {
  module.exports = {
    numberValue,
    parseCsv,
    normalizeHeaderKey,
    pickCsvValue,
    normalizeMonthText,
    normalizeImportedRow,
    detectImportType,
    normalizeRakutenRow,
    importedRowKey,
    mergeImportedRows,
  };
}
