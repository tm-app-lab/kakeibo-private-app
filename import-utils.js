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

function normalizeImportedRow(raw, fileName) {
  const date = raw["日付"] || "";
  const month = date.replaceAll("/", "-").slice(0, 7);
  return {
    sourceFile: fileName,
    month,
    counted: raw["計算対象"] || "",
    date,
    content: raw["内容"] || "",
    amount: raw["金額（円）"] || "",
    institution: raw["保有金融機関"] || "",
    major: raw["大項目"] || "",
    middle: raw["中項目"] || "",
    memo: raw["メモ"] || "",
    transfer: raw["振替"] || "",
    id: raw["ID"] || "",
  };
}

function detectImportType(headers, fileName) {
  if (headers.includes("利用日") && headers.includes("利用店名・商品名")) return "rakuten";
  if (headers.includes("計算対象") && headers.includes("保有金融機関")) return "moneyforward";
  return fileName.toLowerCase().includes("enavi") ? "rakuten" : "moneyforward";
}

function normalizeRakutenRow(raw, fileName, headers) {
  const date = raw["利用日"] || "";
  const amount = raw["利用金額"] || "";
  if (!date && numberValue(amount) === 0) return null;
  const fileMonth = fileName.match(/enavi(\d{6})/)?.[1];
  const paymentHeader = headers.find((header) => /月支払金額$/.test(header)) || "";
  const paymentMonth = fileMonth ? `${fileMonth.slice(0, 4)}-${fileMonth.slice(4, 6)}` : date.replaceAll("/", "-").slice(0, 7);
  return {
    sourceType: "rakuten",
    sourceFile: fileName,
    month: paymentMonth,
    useMonth: date.replaceAll("/", "-").slice(0, 7),
    date,
    content: raw["利用店名・商品名"] || "",
    user: raw["利用者"] || "",
    paymentMethod: raw["支払方法"] || "",
    amount,
    fee: raw["手数料/利息"] || "",
    total: raw["支払総額"] || "",
    paymentAmount: raw[paymentHeader] || raw["支払総額"] || raw["利用金額"] || "",
    carryover: raw[headers.find((header) => /月繰越残高$/.test(header))] || "",
    id: `${fileName}-${date}-${raw["利用店名・商品名"]}-${raw["支払総額"]}-${raw["利用金額"]}`,
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
    normalizeImportedRow,
    detectImportType,
    normalizeRakutenRow,
    importedRowKey,
    mergeImportedRows,
  };
}
