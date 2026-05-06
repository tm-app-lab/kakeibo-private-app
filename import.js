// import.js

function normalizeExternalSourceType(rowOrValue) {
  const value = typeof rowOrValue === "string"
    ? rowOrValue
    : rowOrValue?.sourceType || rowOrValue?.source || rowOrValue?.provider || rowOrValue?.importType || "";
  const normalized = normalize(value);
  if (/rakuten|楽天|enavi|e-navi/.test(normalized)) return "rakuten";
  if (/moneyforward|money forward|mf|マネーフォワード/.test(normalized)) return "moneyforward";
  if (typeof rowOrValue === "object" && (rowOrValue.paymentMethod || rowOrValue.paymentAmount || rowOrValue.user)) return "rakuten";
  return "moneyforward";
}

function normalizeExternalMonthValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.match(/(20\d{2})\D?(0?[1-9]|1[0-2])/);
  if (!compact) return raw.replaceAll("/", "-").slice(0, 7);
  return `${compact[1]}-${compact[2].padStart(2, "0")}`;
}

function externalMonthOf(row) {
  return normalizeExternalMonthValue(row?.month || row?.paymentMonth || row?.useMonth || row?.date || row?.useDate);
}

function isExternalSource(row, sourceType) {
  return normalizeExternalSourceType(row) === sourceType;
}

function getRowsForExternalSource(sourceType) {
  return importedRows.filter((row) => isExternalSource(row, sourceType));
}

function getMonthsForExternalSource(sourceType) {
  return [...new Set(getRowsForExternalSource(sourceType).map(externalMonthOf).filter(Boolean))].sort().reverse();
}

function getExternalRowsForMonth(sourceType, selectedMonth) {
  const normalizedMonth = normalizeExternalMonthValue(selectedMonth);
  return getRowsForExternalSource(sourceType).filter((row) => !normalizedMonth || externalMonthOf(row) === normalizedMonth);
}

function getRakutenRowsForMonth(selectedMonth) {
  return getExternalRowsForMonth("rakuten", selectedMonth);
}
function rakutenRowsForPayment(month, amount) {
  const rows = getRakutenRowsForMonth(month);
  const total = rows.reduce((sum, row) => sum + numberValue(row.paymentAmount || row.amount), 0);
  return total === numberValue(amount) ? rows : [];
}

function isRakutenCardTransfer(row) {
  if (row.sourceType !== "moneyforward") return false;
  const isRakuten = /口座振替4\s*ラクテンカ-ドサ-ビ|ラクテン|楽天|ﾗｸﾃﾝ/i.test(row.content || "");
  const isTakashiAccount = /孝/.test(row.institution || "");
  return isRakuten && isTakashiAccount;
}

function renderRakutenDetailButton(row) {
  if (row.sourceType !== "moneyforward") return "";
  const isOtherCategory = !row.major || /その他|未分類/.test(row.major || "");
  if (!isRakutenCardTransfer(row)) return "";
  if (!isOtherCategory && !/口座振替4\s*ラクテンカ-ドサ-ビ/i.test(row.content || "")) return "";
  const matches = rakutenRowsForPayment(row.month, row.amount);
  if (!matches.length) return "";
  return "linked";
}

function renderExternalActionButtons(row, hasLink = false) {
  const key = encodeURIComponent(externalKey(row));
  const linkButton = row.sourceType === "moneyforward"
    ? `<button class="link-button" type="button" data-mf-link="${key}" ${hasLink ? "" : "disabled"}>紐づけ</button>`
    : "";
  return `${linkButton}<button class="subtle-button" type="button" data-row-popup="${encodeURIComponent(JSON.stringify(row))}">詳細</button>`;
}

function renderMoneyForwardCards(rows) {
  const target = byId("mfImportedCards");
  if (!target) return;
  target.innerHTML = rows.length
    ? rows.map((row) => {
        const hasLink = !!findRakutenMatchForMf(row)?.rows?.length;
        return `
          <article class="external-mobile-card ${highlightClass(row)}" data-external-key="${encodeURIComponent(externalKey(row))}">
            <div class="external-card-head"><span>${esc(row.date || "-")}</span><strong class="amount">${yen(numberValue(row.amount))}</strong></div>
            <strong class="external-card-title">${esc(row.content || "-")}</strong>
            <dl>
              <div><dt>分類</dt><dd>${esc(row.major || "-")}${row.middle ? ` / ${esc(row.middle)}` : ""}</dd></div>
              <div><dt>詳細</dt><dd>${esc(row.institution || "-")}</dd></div>
              <div><dt>紐づけ状態</dt><dd>${hasLink ? "候補あり" : "候補なし"}</dd></div>
            </dl>
            <div class="external-card-actions">${renderExternalActionButtons(row, hasLink)}</div>
          </article>`;
      }).join("")
    : `<div class="external-empty-card">マネーフォワード明細はまだ取り込まれていません。</div>`;
}

function renderRakutenCards(rows) {
  const target = byId("rakutenImportedCards");
  if (!target) return;
  target.innerHTML = rows.length
    ? rows.map((row) => `
        <article class="external-mobile-card ${highlightClass(row)}" data-external-key="${encodeURIComponent(externalKey(row))}">
          <div class="external-card-head"><span>${esc(row.date || "-")}</span><strong class="amount">${yen(numberValue(row.paymentAmount || row.amount))}</strong></div>
          <strong class="external-card-title">${esc(row.content || "-")}</strong>
          <dl>
            <div><dt>支払方法</dt><dd>${esc(row.paymentMethod || "-")}</dd></div>
            <div><dt>詳細</dt><dd>${esc(row.sourceFile || "-")}</dd></div>
            <div><dt>紐づけ状態</dt><dd>${highlightClass(row) ? "遷移対象" : "-"}</dd></div>
          </dl>
          <div class="external-card-actions">${renderExternalActionButtons(row)}</div>
        </article>`).join("")
    : `<div class="external-empty-card">楽天カード明細はこの月にはありません。</div>`;
}
function renderMoneyForwardRows(rows) {
  const income = rows.filter((row) => Number(String(row.amount || "0").replaceAll(",", "")) > 0).reduce((sum, row) => sum + numberValue(row.amount), 0);
  const payment = rows.filter((row) => Number(String(row.amount || "0").replaceAll(",", "")) < 0).reduce((sum, row) => sum + numberValue(row.amount), 0);
  byId("mfIncomeTotal").innerHTML = `<small>収入</small><strong>${yen(income)}</strong>`;
  byId("mfPaymentTotal").innerHTML = `<small>支払い</small><strong>${yen(payment)}</strong>`;
  byId("mfBalanceTotal").innerHTML = `<small>収支</small><strong>${yen(income - payment)}</strong>`;
  byId("mfImportedRows").innerHTML = rows.length
    ? rows.map((row) => {
        const hasLink = !!findRakutenMatchForMf(row)?.rows?.length;
        return `
          <tr class="${highlightClass(row)}" data-external-key="${encodeURIComponent(externalKey(row))}">
            <td><button class="link-button" type="button" data-mf-link="${encodeURIComponent(externalKey(row))}" ${hasLink ? "" : "disabled"}>紐づけ</button></td>
            <td>${esc(row.date)}</td>
            <td><strong>${esc(row.content)}</strong><small>${esc(row.institution)}</small></td>
            <td class="amount">${yen(numberValue(row.amount))}</td>
            <td>${esc(row.major)}<br><small>${esc(row.middle)}</small></td>
            <td><button class="subtle-button" type="button" data-row-popup="${encodeURIComponent(JSON.stringify(row))}">詳細</button></td>
          </tr>`;
      }).join("")
    : `<tr><td colspan="6">マネーフォワード明細はまだ取り込まれていません。</td></tr>`;
  renderMoneyForwardCards(rows);
}

function externalKey(row) {
  return row.id || `${row.sourceFile}-${row.date}-${row.content}-${row.amount || row.paymentAmount}`;
}

function highlightClass(row) {
  return highlightedExternalKey && externalKey(row) === highlightedExternalKey ? "linked-row" : "";
}

function findRakutenMatchForMf(row) {
  const monthRows = getRakutenRowsForMonth(row.month);
  const paymentMatches = renderRakutenDetailButton(row) ? rakutenRowsForPayment(row.month, row.amount) : [];
  if (isRakutenCardTransfer(row) && monthRows.length) return { type: "month", rows: monthRows };
  if (paymentMatches.length) return { type: "month", rows: paymentMatches };
  const amount = numberValue(row.amount);
  const sameDay = importedRows.filter(
    (candidate) =>
      isExternalSource(candidate, "rakuten") &&
      candidate.date === row.date &&
      numberValue(candidate.paymentAmount || candidate.amount) === amount &&
      normalize(candidate.content).includes(normalize(row.content).slice(0, 8)),
  );
  return sameDay.length ? { type: "record", rows: sameDay } : null;
}

function renderRakutenRows(rows) {
  const total = rows.reduce((sum, row) => sum + numberValue(row.paymentAmount || row.amount), 0);
  byId("rakutenPaymentTotal").innerHTML = `<small>支払い総計</small><strong>${yen(total)}</strong>`;
  byId("rakutenImportedRows").innerHTML = rows.length
    ? rows.map((row) => `
        <tr class="${highlightClass(row)}" data-external-key="${encodeURIComponent(externalKey(row))}">
          <td>${esc(row.date)}</td>
          <td><strong title="${esc(row.content || "")}">${esc(row.content)}</strong><br><small>${esc(row.sourceFile || "")}</small></td>
          <td>${esc(row.user)}</td>
          <td>${esc(row.paymentMethod)}</td>
          <td class="amount">${yen(numberValue(row.amount))}</td>
          <td class="amount">${yen(numberValue(row.fee))}</td>
          <td class="amount">${yen(numberValue(row.total))}</td>
          <td class="amount">${yen(numberValue(row.paymentAmount || row.amount))}</td>
          <td>${renderExternalActionButtons(row)}</td>
        </tr>`).join("")
    : `<tr><td colspan="9">楽天カード明細はまだ取り込まれていません。</td></tr>`;
  renderRakutenCards(rows);
  byId("rakutenSummary").innerHTML = rows.length
    ? `<div class="candidate-card"><strong>表示中の楽天カード合計</strong><span>${rows.length}件 / ${yen(total)}</span></div>`
    : "";
}

function linkMoneyForwardToRakuten(mfKey) {
  const row = importedRows.find((candidate) => externalKey(candidate) === mfKey);
  if (!row) return;
  const match = findRakutenMatchForMf(row);
  if (!match?.rows?.length) return;
  returnExternalKey = externalKey(row);
  returnExternalMonth = row.month;
  returnExternalTab = "mf";
  switchExternalTab("rakuten");
  highlightedExternalKey = match.type === "record" ? externalKey(match.rows[0]) : null;
  byId("importMonthSelect").value = match.rows[0].month;
  renderImport();
}

function renderExternalBackButton() {
  byId("externalLinkBack").innerHTML = returnExternalKey
    ? `<button class="link-button" type="button" data-return-external>戻る</button>`
    : "";
}

function returnToLinkedSource() {
  if (!returnExternalKey) return;
  switchExternalTab(returnExternalTab || "mf");
  byId("importMonthSelect").value = returnExternalMonth || byId("importMonthSelect").value;
  highlightedExternalKey = returnExternalKey;
  returnExternalKey = null;
  returnExternalMonth = null;
  returnExternalTab = null;
  renderImport();
}

function scrollExternalTarget() {
  if (!highlightedExternalKey) {
    document.querySelector(`#externalRakutenPanel:not(.hidden) .imported-table-wrap`)?.scrollTo({ top: 0 });
    return;
  }
  const target = [...document.querySelectorAll("[data-external-key]")].find(
    (row) => decodeURIComponent(row.dataset.externalKey || "") === highlightedExternalKey,
  );
  target?.scrollIntoView({ block: "center" });
}

const externalDetailLabels = {
  id: "ID",
  sourceType: "データ元",
  sourceFile: "ファイル",
  month: "対象月",
  useMonth: "利用月",
  date: "日付",
  content: "内容",
  amount: "金額",
  fee: "手数料・利息",
  total: "支払総額",
  paymentAmount: "支払金額",
  carryover: "繰越残高",
  major: "分類",
  middle: "詳細",
  institution: "金融機関",
  paymentMethod: "支払方法",
  user: "ユーザー",
  counted: "計算対象",
  memo: "メモ",
};

function externalDetailValue(key, value) {
  if (/amount|total|fee|carryover/i.test(key)) return yen(numberValue(value));
  if (key === "sourceType") {
    if (value === "moneyforward") return "マネーフォワード";
    if (value === "rakuten") return "楽天カード";
  }
  return value || "-";
}

function showRowPopup(encoded) {
  const row = JSON.parse(decodeURIComponent(encoded));
  window.alert(
    Object.entries(row)
      .map(([key, value]) => {
        const label = externalDetailLabels[key] || key;
        return `${label}: ${externalDetailValue(key, value)}`;
      })
      .join("\n"),
  );
}

function deleteImportedRow(key) {
  importedRows = importedRows.filter((row) => externalKey(row) !== key);
  if (highlightedExternalKey === key) highlightedExternalKey = null;
  if (returnExternalKey === key) returnExternalKey = null;
  saveImportedRows();
  renderImport();
}

function clearImportedRows() {
  const month = byId("importMonthSelect").value;
  if (!importedRows.length) return;
  const targetTab = byId("externalSourceSelect")?.value || document.querySelector("[data-external-tab].active")?.dataset.externalTab;
  const sourceType = targetTab === "rakuten" ? "rakuten" : "moneyforward";
  const targetRows = importedRows.filter((row) => row.month === month && row.sourceType === sourceType);
  if (!targetRows.length) return;
  const label = sourceType === "rakuten" ? "楽天カード" : "マネーフォワード";
  const ok = window.confirm(`${label}の${month || "表示中"}データ ${targetRows.length}件を一括削除します。\nこの操作は元に戻せません。削除してよろしいですか？`);
  if (!ok) return;
  importedRows = importedRows.filter((row) => !(row.month === month && row.sourceType === sourceType));
  highlightedExternalKey = null;
  returnExternalKey = null;
  saveImportedRows();
  renderImport();
}

function toggleImportEdit() {
  importEditMode = !importEditMode;
  renderImport();
}

async function decodeCsvFile(file) {
  const buffer = await file.arrayBuffer();
  let text;
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    text = new TextDecoder("utf-8").decode(buffer);
  } else {
    try {
      text = new TextDecoder("shift-jis").decode(buffer);
    } catch {
      text = new TextDecoder("utf-8").decode(buffer);
    }
  }
  const rows = parseCsv(text);
  const headers = rows[0] || [];
  const type = detectImportType(headers, file.name);
  return rows.slice(1).map((row) => {
    const raw = Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));
    return type === "rakuten" ? normalizeRakutenRow(raw, file.name, headers) : { ...normalizeImportedRow(raw, file.name), sourceType: "moneyforward" };
  }).filter(Boolean);
}

async function handleExternalImport(event) {
  const files = [...event.target.files];
  const imported = [];
  for (const file of files) imported.push(...(await decodeCsvFile(file)));
  importedRows = mergeImportedRows(importedRows, imported);
  saveImportedRows();
  const importedRakuten = imported.filter((row) => row.sourceType === "rakuten" && row.month);
  const importedMoneyForward = imported.filter((row) => row.sourceType === "moneyforward" && row.month);
  const preferredSource = importedRakuten.length ? "rakuten" : importedMoneyForward.length ? "mf" : byId("externalSourceSelect")?.value || "mf";
  const preferredMonth = [...new Set((importedRakuten.length ? importedRakuten : importedMoneyForward).map((row) => row.month).filter(Boolean))].sort().reverse()[0];
  if (typeof switchExternalTab === "function") switchExternalTab(preferredSource);
  if (preferredMonth && byId("importMonthSelect")) byId("importMonthSelect").value = preferredMonth;
  renderImport();
  if (typeof notifyLinkGroupCandidates === "function") notifyLinkGroupCandidates("外部データ取り込み");
  event.target.value = "";
}

function currentExternalSourceType() {
  return byId("externalSourceSelect")?.value === "rakuten" ? "rakuten" : "moneyforward";
}

function externalRowsForSource(sourceType = currentExternalSourceType()) {
  return getRowsForExternalSource(sourceType);
}

function externalMonthsForSource(sourceType = currentExternalSourceType()) {
  return getMonthsForExternalSource(sourceType);
}

function renderImport() {
  const sourceType = currentExternalSourceType();
  const months = externalMonthsForSource(sourceType);
  const sourceRows = externalRowsForSource(sourceType);
  const current = byId("importMonthSelect")?.value || "";
  const selected = months.includes(current) ? current : months[0] || "";
  const sourceLabel = sourceType === "rakuten" ? "楽天カード" : "マネーフォワード";
  byId("importSummary").textContent = sourceRows.length ? `${sourceLabel} ${sourceRows.length}件 / ${months.length}か月` : `${sourceLabel} 未取り込み`;
  const externalNotice = byId("externalCandidateNotice");
  if (externalNotice) {
    externalNotice.classList.add("hidden");
    externalNotice.innerHTML = "";
  }
  byId("importMonthSelect").innerHTML = months.length
    ? months.map((month) => `<option value="${esc(month)}" ${month === selected ? "selected" : ""}>${esc(month)}</option>`).join("")
    : '<option value="">データなし</option>';
  const monthIndex = months.indexOf(selected);
  byId("prevImportMonth").disabled = monthIndex < 0 || monthIndex >= months.length - 1;
  byId("nextImportMonth").disabled = monthIndex <= 0;
  const rows = getExternalRowsForMonth(sourceType, selected);
  renderMoneyForwardRows(sourceType === "moneyforward" ? rows : []);
  renderRakutenRows(sourceType === "rakuten" ? rows : []);
  renderExternalBackButton();
  byId("toggleImportEdit")?.classList.add("hidden");
  byId("bulkDeleteImportedRows")?.classList.add("hidden");
  requestAnimationFrame(scrollExternalTarget);
}

function moveImportMonth(direction) {
  const months = externalMonthsForSource();
  const select = byId("importMonthSelect");
  const index = months.indexOf(select.value);
  if (index < 0) return;
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= months.length) return;
  select.value = months[nextIndex];
  renderImport();
}

function bindImportEvents() {
  byId("panel-import").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-external-tab]");
    if (tab) switchExternalTab(tab.dataset.externalTab);
    const mfLink = event.target.closest("[data-mf-link]");
    if (mfLink) linkMoneyForwardToRakuten(decodeURIComponent(mfLink.dataset.mfLink));
    const back = event.target.closest("[data-return-external]");
    if (back) returnToLinkedSource();
    const deleteButton = event.target.closest("[data-delete-import]");
    if (deleteButton) deleteImportedRow(decodeURIComponent(deleteButton.dataset.deleteImport));
    const popup = event.target.closest("[data-row-popup]");
    if (popup) showRowPopup(popup.dataset.rowPopup);
    const openMaintenance = event.target.closest("[data-open-maintenance]");
    if (openMaintenance) switchTabTo("master");
  });
  byId("externalCsvInput").addEventListener("change", handleExternalImport);
  byId("externalSourceSelect")?.addEventListener("change", (event) => switchExternalTab(event.target.value));
  byId("importMonthSelect").addEventListener("change", renderImport);
  byId("prevImportMonth").addEventListener("click", () => moveImportMonth(1));
  byId("nextImportMonth").addEventListener("click", () => moveImportMonth(-1));
  byId("toggleImportEdit").addEventListener("click", toggleImportEdit);
  byId("bulkDeleteImportedRows").addEventListener("click", clearImportedRows);
}



