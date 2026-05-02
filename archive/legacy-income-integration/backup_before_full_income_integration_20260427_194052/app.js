const yenFormatter = new Intl.NumberFormat("ja-JP", {
  maximumFractionDigits: 0,
});

const STORAGE_KEY = "household-maintenance-master-v3";
const OPTION_STORAGE_KEY = "household-maintenance-options-v2";
const CANDIDATE_STATUS_KEY = "household-maintenance-candidate-status-v2";
const IMPORT_STORAGE_KEY = "household-maintenance-imported-rows-v1";
const MASTER_UPDATED_KEY = "household-maintenance-master-updated-at-v1";

let data = null;
let master = [];
let optionLists = {};
let candidateStatus = {};
let importedRows = [];
let sortState = { key: "status", direction: "asc" };
let columnFilters = {};
let selectedId = null;
let editingId = null;
let editDraft = null;
let pendingCandidate = null;
let highlightedExternalKey = null;
let returnExternalKey = null;
let returnExternalMonth = null;
let returnExternalTab = null;
let importEditMode = false;
let appMode = "expense";

function byId(id) {
  return document.getElementById(id);
}

function yen(value) {
  return `${yenFormatter.format(Math.round(Number(value || 0)))}円`;
}

function costText(item) {
  return `${yen(item.monthlyAmount)}${item.frequency === "yearly" ? "/年" : "/月"}`;
}

function monthOptions(selected) {
  return Array.from({ length: 12 }, (_, index) => {
    const value = String(index + 1).padStart(2, "0");
    return `<option value="${value}" ${value === selected ? "selected" : ""}>${index + 1}月</option>`;
  }).join("");
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalize(value) {
  return String(value ?? "").normalize("NFKC").toUpperCase().replace(/\s+/g, "");
}

function masterId(item) {
  return [item.person, item.category, item.name, item.detail, item.costType, item.flow].join("::");
}

function alignmentId(item) {
  const costType = item.costType || (item.nature === "fixed" ? "固定" : "変動");
  const flow = item.flow === "saving" ? "貯蓄" : item.flow === "expense" ? "支出" : item.flow;
  return [item.person, item.category, item.name, item.detail, costType, flow].map(normalize).join("::");
}

function displayValue(field, value) {
  const maps = {
    status: { normal: "通常", editing: "編集中" },
    nature: { fixed: "固定", variable: "変動" },
    flow: { expense: "支出", saving: "貯蓄・投資" },
    frequency: { monthly: "毎月", yearly: "毎年" },
  };
  return maps[field]?.[value] || value || "-";
}

function optionValue(field, label) {
  const maps = {
    status: { "通常": "normal", "編集中": "editing" },
    nature: { "固定": "fixed", "変動": "variable" },
    flow: { "支出": "expense", "貯蓄・投資": "saving", "貯蓄": "saving" },
    frequency: { "毎月": "monthly", "毎年": "yearly", "年払い": "yearly" },
  };
  return maps[field]?.[label] || label;
}

function buildDefaultMaster() {
  return data.items.map((item) => ({
    id: masterId(item),
    alignmentId: alignmentId(item),
    source: "imported",
    enabled: true,
    status: "normal",
    person: item.person,
    category: item.category,
    payment: item.payment,
    name: item.name,
    detail: item.detail,
    nature: item.costType === "固定" ? "fixed" : "variable",
    flow: item.flow === "貯蓄" ? "saving" : "expense",
    frequency: "monthly",
    monthlyAmount: item.amount,
    originalAmount: item.amount,
    updateMonth: "",
    mfAlias: "",
    externalAliases: [],
    note: "",
    amountHistory: [],
  }));
}

function loadMaster() {
  const defaults = buildDefaultMaster();
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  master = defaults.map((item) => {
    const merged = { ...item, ...(saved[item.id] || {}) };
    merged.alignmentId = alignmentId(merged);
    merged.amountHistory ||= [];
    merged.externalAliases = externalAliases(merged);
    return merged;
  });
  for (const item of Object.values(saved)) {
    if (item.source === "manual" && !master.some((entry) => entry.id === item.id)) {
      master.unshift({ ...item, alignmentId: alignmentId(item), amountHistory: item.amountHistory || [], externalAliases: externalAliases(item) });
    }
  }
  selectedId ||= master[0]?.id || null;
}

function saveMaster() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(master.map((item) => [item.id, item]))));
  localStorage.setItem(MASTER_UPDATED_KEY, new Date().toISOString());
}

function uniqueValues(field) {
  return [...new Set(master.map((item) => item[field]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ja"));
}

function externalAliases(item) {
  const legacy = String(item?.mfAlias || "")
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...(item?.externalAliases || []), ...legacy])];
}

function loadOptions() {
  const saved = JSON.parse(localStorage.getItem(OPTION_STORAGE_KEY) || "{}");
  const merge = (field) => [...new Set([...(saved[field] || []), ...uniqueValues(field)])].filter(Boolean);
  const savedCodes = (field) => (saved[field] || []).map((value) => optionValue(field, value));
  optionLists = {
    person: merge("person"),
    category: merge("category"),
    payment: merge("payment"),
    updateMonth: merge("updateMonth"),
    status: ["normal", "editing"],
    nature: ["fixed", "variable"],
    flow: [...new Set([...savedCodes("flow"), "expense", "saving"])],
    frequency: ["monthly", "yearly"],
  };
}

function saveOptions() {
  localStorage.setItem(
    OPTION_STORAGE_KEY,
    JSON.stringify({
      person: optionLists.person,
      category: optionLists.category,
      payment: optionLists.payment,
      status: optionLists.status,
      nature: optionLists.nature,
      flow: optionLists.flow,
      frequency: optionLists.frequency,
      updateMonth: optionLists.updateMonth,
    }),
  );
}

function loadCandidateStatus() {
  candidateStatus = JSON.parse(localStorage.getItem(CANDIDATE_STATUS_KEY) || "{}");
}

function saveCandidateStatus() {
  localStorage.setItem(CANDIDATE_STATUS_KEY, JSON.stringify(candidateStatus));
}

function loadImportedRows() {
  const saved = JSON.parse(localStorage.getItem(IMPORT_STORAGE_KEY) || "[]");
  importedRows = saved.length ? saved : [...(data.rakutenCard?.rows || [])];
}

function saveImportedRows() {
  localStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify(importedRows));
}

function enabledItems() {
  return master.filter((item) => item.enabled);
}

function monthlyExpense() {
  return enabledItems().filter((item) => item.flow === "expense").reduce((sum, item) => sum + Number(item.monthlyAmount || 0), 0);
}

function monthlySaving() {
  return enabledItems().filter((item) => item.flow === "saving").reduce((sum, item) => sum + Number(item.monthlyAmount || 0), 0);
}

function monthlyIncome() {
  return data.totals.income || data.incomes.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function rowStatus(item) {
  if (editingId === item.id || item.status === "editing") return "editing";
  return "normal";
}

function statusPill(status) {
  return `<span class="status-pill ${status}">${displayValue("status", status)}</span>`;
}

function rerender() {
  renderHeader();
  renderMaster();
  renderImport();
  renderHelp();
}

function renderHeader() {
  byId("navUserLabel").textContent = appMode === "income" ? "給与アプリ内" : "世帯";
  byId("navUpdatedLabel").textContent = lastUpdatedLabel();
  byId("navStatusTitle").textContent = appMode === "income" ? "収入管理ステータス" : "支出管理ステータス";
  if (appMode === "income") {
    byId("riskText").textContent = "給与データの利用者切り替えは収入管理ページ内で行えます。";
    return;
  }
  const income = monthlyIncome();
  const expense = monthlyExpense();
  const saving = monthlySaving();
  const surplus = income - expense - saving;
  if (surplus < 0) {
    byId("riskText").textContent = "現在の支出項目では毎月の余力がマイナスです。";
  } else if (surplus < income * 0.08) {
    byId("riskText").textContent = "黒字ですが余力が薄い状態です。確認待ち項目を見直しましょう。";
  } else {
    byId("riskText").textContent = "支出項目上は維持可能です。補完候補で更新だけ確認しましょう。";
  }
}

function lastUpdatedLabel() {
  const value = localStorage.getItem(MASTER_UPDATED_KEY);
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function switchAppMode(mode) {
  appMode = mode === "income" ? "income" : "expense";
  const title = appMode === "income" ? "収入管理" : "支出管理";
  const copy =
    appMode === "income"
      ? "POSITIVEで撮影した写真を登録するだけで、簡単に給与データを管理することができます"
      : "通年の支出項目を整えます。また、支出項目のメンテナンスのため、外部データを取り込み、参照することができます。";
  byId("navTitle").textContent = title;
  byId("navCopy").textContent = copy;
  document.querySelectorAll("[data-app-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.appMode === appMode);
  });
  document.querySelectorAll(".expense-view").forEach((element) => {
    element.classList.toggle("hidden", appMode !== "expense");
  });
  byId("panel-income")?.classList.toggle("hidden", appMode !== "income");
  byId("openSettings")?.classList.toggle("hidden", appMode !== "expense");
  renderHeader();
  if (appMode === "income") requestAnimationFrame(resizeIncomeFrame);
}

function resizeIncomeFrame() {
  const frame = byId("incomeFrame");
  if (!frame || appMode !== "income") return;
  try {
    const doc = frame.contentDocument;
    if (!doc) return;
    const bottoms = [...doc.body.querySelectorAll("*")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = doc.defaultView.getComputedStyle(element);
        if (style.display === "none" || style.position === "fixed") return 0;
        return rect.bottom + doc.defaultView.scrollY;
      })
      .filter(Number.isFinite);
    const height = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, ...bottoms, window.innerHeight - 48) + 80;
    frame.style.height = `${height}px`;
  } catch {
    frame.style.height = "5200px";
  }
}

function renderHelp() {
  byId("helpContent").innerHTML = `
    <section class="help-card">
      <h4>収入管理</h4>
      <ul>
        <li>POSITIVE給与明細の写真読み込み、手入力、保存、グラフ、分析、データ管理を行えます。</li>
        <li>利用者切り替えは、収入管理ページ内の利用者設定から行います。</li>
        <li>Excel出力、バックアップ出力、バックアップ復元、月別削除はデータ管理から操作します。</li>
      </ul>
    </section>
    <section class="help-card">
      <h4>支出項目</h4>
      <ul>
        <li>左の一覧から行を選ぶと、右側で詳細を確認できます。</li>
        <li>変更するときは詳細カード上部の「編集」を押し、「決定」で保存します。</li>
        <li>「新規」で項目を追加できます。不要な項目は編集モードの「削除」で消せます。</li>
        <li>外部データ別名は、取り込み済み明細の候補から複数選択できます。</li>
      </ul>
    </section>
    <section class="help-card">
      <h4>外部取り込み</h4>
      <ul>
        <li>マネーフォワードCSVと楽天カードCSVは、まとめて選択して取り込めます。</li>
        <li>取り込み形式は自動判定します。年月を選ぶと、その月の明細に切り替わります。</li>
        <li>マネーフォワード明細の「紐づけ」で、同額の楽天カード明細や楽天カード同月データへ移動します。</li>
        <li>表示しきれない情報は各行の「詳細」から確認できます。</li>
      </ul>
    </section>
    <section class="help-card">
      <h4>設定</h4>
      <ul>
        <li>支払者、種別、支払い方法、性質、フロー、支払い時期などの選択肢を編集できます。</li>
        <li>「初期値へ戻す」は登録済みの支出項目を元データ状態へ戻す操作です。</li>
      </ul>
    </section>
  `;
}

function renderMaster() {
  const rows = filteredSortedRows();
  byId("masterCount").textContent = `${rows.length}件表示`;
  renderPendingApplyPanel();
  renderColumnFilters();
  byId("masterRows").innerHTML = rows.map(renderMasterRow).join("");
  renderDetailPanel();
}

function filteredSortedRows() {
  const filter = byId("masterFilter").value;
  const query = byId("masterSearch").value.trim().toLowerCase();
  let rows = master;
  if (filter === "fixed") rows = rows.filter((item) => item.nature === "fixed" && item.flow === "expense");
  if (filter === "variable") rows = rows.filter((item) => item.nature === "variable" && item.flow === "expense");
  if (filter === "saving") rows = rows.filter((item) => item.flow === "saving");
  if (query) rows = rows.filter((item) => [item.person, item.category, item.name, item.detail, item.mfAlias, ...externalAliases(item)].join(" ").toLowerCase().includes(query));
  for (const [field, value] of Object.entries(columnFilters)) {
    if (!value) continue;
    if (field === "status") rows = rows.filter((item) => rowStatus(item) === value);
    else rows = rows.filter((item) => String(item[field] ?? "") === value);
  }
  return sortRows(rows);
}

function sortRows(rows) {
  const direction = sortState.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aValue = sortState.key === "status" ? rowStatus(a) : a[sortState.key];
    const bValue = sortState.key === "status" ? rowStatus(b) : b[sortState.key];
    if (typeof aValue === "number" || typeof bValue === "number") return (Number(aValue || 0) - Number(bValue || 0)) * direction;
    return String(aValue ?? "").localeCompare(String(bValue ?? ""), "ja") * direction;
  });
}

function renderMasterRow(item) {
  const selected = item.id === selectedId ? "selected" : "";
  const pending = pendingCandidate?.itemId === item.alignmentId ? "pending-row" : "";
  const reflected = "";
  const aliasFlag = externalAliases(item).length ? '<span class="alias-flag" title="外部データ別名あり">外</span>' : "";
  return `
    <tr class="${selected} ${pending || reflected}" data-row-id="${esc(item.id)}">
      <td>${statusPill(rowStatus(item))}</td>
      <td><strong>${esc(item.name || "名称未設定")}</strong>${aliasFlag}</td>
      <td>${esc(item.category)}</td>
      <td>${esc(item.person)}</td>
      <td>${displayValue("nature", item.nature)}</td>
      <td class="amount">${costText(item)}</td>
    </tr>
  `;
}

function renderColumnFilters() {
  document.querySelectorAll(".column-filter").forEach((select) => {
    const field = select.dataset.filter;
    const current = columnFilters[field] || "";
    const values = field === "status" ? optionLists.status : field in optionLists ? optionLists[field] : uniqueValues(field);
    select.innerHTML = `<option value="">すべて</option>` + values
      .map((value) => `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(displayValue(field, value))}</option>`)
      .join("");
  });
}

function optionHtml(field, selected) {
  return (optionLists[field] || [])
    .map((value) => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(displayValue(field, value))}</option>`)
    .join("");
}

function externalNameCandidates(query = "", selected = []) {
  const normalizedQuery = normalize(query);
  const selectedSet = new Set(selected);
  const counts = new Map();
  importedRows.forEach((row) => {
    const name = row.content?.trim();
    if (!name || selectedSet.has(name)) return;
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return [...counts.entries()]
    .filter(([name]) => !normalizedQuery || normalize(name).includes(normalizedQuery))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .slice(0, 12);
}

function renderAliasPicker(view, editing) {
  const aliases = externalAliases(view);
  const chips = aliases.length
    ? aliases.map((name) => `<span class="alias-chip">${esc(name)}${editing ? `<button type="button" data-remove-alias="${encodeURIComponent(name)}">×</button>` : ""}</span>`).join("")
    : `<span class="muted-text">未設定</span>`;
  return `
    <label class="wide">外部データ別名
      <div class="alias-picker ${editing ? "" : "readonly"}">
        <div class="alias-chips">${chips}</div>
        ${
          editing
            ? `<div class="alias-search-wrap">
                <input id="aliasSearch" type="search" placeholder="取り込み済み明細から検索" autocomplete="off" />
                <div id="aliasSuggestions" class="alias-suggestions hidden"></div>
              </div>`
            : ""
        }
      </div>
    </label>
  `;
}

function renderAliasSuggestions(query, selected) {
  const candidates = externalNameCandidates(query, selected);
  return candidates.length
    ? candidates.map(([name, count]) => `<button type="button" data-add-alias="${encodeURIComponent(name)}"><span>${esc(name)}</span><small>${count}件</small></button>`).join("")
    : `<p>候補がありません</p>`;
}

function selectedItem() {
  return master.find((item) => item.id === selectedId) || master[0];
}

function renderDetailPanel() {
  const item = selectedItem();
  if (!item) {
    byId("detailPanel").innerHTML = `<p>支出項目がありません。</p>`;
    return;
  }
  selectedId = item.id;
  const editing = editingId === item.id;
  if (editing && !editDraft) editDraft = { ...item, externalAliases: externalAliases(item) };
  const view = editing ? editDraft : item;
  const disabled = editing ? "" : "disabled";
  byId("detailPanel").innerHTML = `
    <div class="panel-head detail-head">
      <h3 title="${esc(view.name || "名称未設定")}">${esc(view.name || "名称未設定")}</h3>
      <div class="detail-title-actions">
        ${statusPill(rowStatus(item))}
        ${editing ? "" : '<button type="button" id="toggleRowEdit">編集</button>'}
      </div>
    </div>
    <div class="detail-grid">
      <label class="wide">内容1<input value="${esc(view.name)}" data-detail-field="name" ${disabled} /></label>
      <label class="wide">内容2<input value="${esc(view.detail)}" data-detail-field="detail" ${disabled} /></label>
      <label>支払者<select data-detail-field="person" ${disabled}>${optionHtml("person", view.person)}</select></label>
      <label>種別<select data-detail-field="category" ${disabled}>${optionHtml("category", view.category)}</select></label>
      <label>支払い方法<select data-detail-field="payment" ${disabled}>${optionHtml("payment", view.payment)}</select></label>
      <label>固定/変動<select data-detail-field="nature" ${disabled}>${optionHtml("nature", view.nature)}</select></label>
      <label>フロー<select data-detail-field="flow" ${disabled}>${optionHtml("flow", view.flow)}</select></label>
      <label>支払い時期<select data-detail-field="frequency" ${disabled}>${optionHtml("frequency", view.frequency)}</select></label>
      <label>費用<input type="number" min="0" step="100" value="${Number(view.monthlyAmount || 0)}" data-detail-field="monthlyAmount" ${disabled} /></label>
      <label class="${view.frequency === "yearly" ? "" : "hidden"}">年払い月<select data-detail-field="updateMonth" ${disabled}><option value="">未設定</option>${monthOptions(view.updateMonth)}</select></label>
      ${renderAliasPicker(view, editing)}
      <label class="wide">メモ<textarea data-detail-field="note" ${disabled}>${esc(view.note)}</textarea></label>
    </div>
    <div class="detail-actions">
      ${
        editing
          ? `<button type="button" id="commitEdit">決定</button><button type="button" id="cancelEdit">キャンセル</button>${item.draftNew ? "" : '<button type="button" id="deleteItem" class="danger">削除</button>'}`
          : ''
      }
    </div>
    <div>
      <div class="panel-head">
        <h4>履歴</h4>
        <button type="button" id="toggleHistory">履歴を見る</button>
      </div>
      <div id="historyPanel" class="hidden">
        <label>年月版を選択<select id="versionSelect">${versionOptions(item)}</select></label>
        <div id="versionPreview">${renderVersionPreview(item)}</div>
      </div>
      <div>${renderAmountHistory(item)}${renderVersionHistory(item)}</div>
    </div>
  `;
}

function renderAmountHistory(item) {
  if (!item.amountHistory?.length) return `<div class="history-line"><span>履歴はまだありません。</span></div>`;
  return item.amountHistory
    .slice()
    .reverse()
    .map((entry) => `<div class="history-line"><strong>${esc(entry.date)} ${yen(entry.from)} → ${yen(entry.to)}</strong><span>${esc(entry.reason || "変更")}</span></div>`)
    .join("");
}

function renderVersionHistory(item) {
  if (!item.versions?.length) return "";
  return item.versions
    .slice()
    .reverse()
    .map((entry) => `<div class="history-line"><strong>${esc(entry.month)} 版</strong><span>${esc(entry.name)} / ${esc(entry.category)} / ${yen(entry.monthlyAmount)}</span></div>`)
    .join("");
}

function versionOptions(item) {
  if (!item.versions?.length) return '<option value="">保存済みの年月版なし</option>';
  return item.versions
    .map((entry, index) => `<option value="${index}">${esc(entry.month)} 版</option>`)
    .join("");
}

function renderVersionPreview(item, index = 0) {
  const entry = item.versions?.[index];
  if (!entry) return `<div class="history-line"><span>年月版を保存すると、ここで過去の詳細情報を閲覧できます。</span></div>`;
  return `
    <div class="history-line">
      <strong>${esc(entry.month)} 版</strong>
      <span>${esc(entry.name || "名称未設定")} / ${esc(entry.category)} / ${esc(entry.person)} / ${costText(entry)}</span>
      <span>${esc(displayValue("nature", entry.nature))} / ${esc(displayValue("flow", entry.flow))} / ${esc(displayValue("frequency", entry.frequency))}</span>
    </div>
  `;
}

function renderPendingApplyPanel() {
  const panel = byId("pendingApplyPanel");
  if (!pendingCandidate) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div>
      <strong>${esc(pendingCandidate.excel.name)} の費用反映待ち</strong>
      <span>現在の金額 ${yen(pendingCandidate.excel.amount)} → 候補 ${yen(pendingCandidate.suggestedAmount)}</span>
    </div>
    <button id="applyPendingCandidate" type="button">反映する</button>
    <button id="rejectPendingCandidate" type="button">反映しない</button>
  `;
}

function numberValue(value) {
  return Math.abs(Number(String(value || "0").replaceAll(",", "")) || 0);
}

function rakutenRowsForPayment(month, amount) {
  const rows = importedRows.filter((row) => row.sourceType === "rakuten" && row.month === month);
  const total = rows.reduce((sum, row) => sum + numberValue(row.paymentAmount), 0);
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

function renderMoneyForwardRows(rows) {
  const income = rows.filter((row) => Number(String(row.amount || "0").replaceAll(",", "")) > 0).reduce((sum, row) => sum + numberValue(row.amount), 0);
  const payment = rows.filter((row) => Number(String(row.amount || "0").replaceAll(",", "")) < 0).reduce((sum, row) => sum + numberValue(row.amount), 0);
  byId("mfIncomeTotal").textContent = `収入 ${yen(income)}`;
  byId("mfPaymentTotal").textContent = `支払い ${yen(payment)}`;
  byId("mfBalanceTotal").textContent = `収支 ${yen(income - payment)}`;
  byId("mfImportedRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => {
            const hasLink = !!findRakutenMatchForMf(row)?.rows?.length;
            return `
            <tr class="${highlightClass(row)}" data-external-key="${encodeURIComponent(externalKey(row))}">
              <td><button class="link-button" type="button" data-mf-link="${encodeURIComponent(externalKey(row))}" ${hasLink ? "" : "disabled"}>紐づけ</button></td>
              <td>${esc(row.date)}</td>
              <td>
                <strong>${esc(row.content)}</strong>
                <small>${esc(row.institution)}</small>
              </td>
              <td class="amount">${yen(numberValue(row.amount))}</td>
              <td>${esc(row.major)}<br><small>${esc(row.middle)}</small></td>
              <td>
                <button class="subtle-button" type="button" data-row-popup="${encodeURIComponent(JSON.stringify(row))}">詳細</button>
                ${importEditMode ? `<button class="subtle-button danger-button" type="button" data-delete-import="${encodeURIComponent(externalKey(row))}">削除</button>` : ""}
              </td>
            </tr>
          `;
          },
        )
        .join("")
    : `<tr><td colspan="6">マネーフォワード明細はまだ取り込まれていません。</td></tr>`;
}

function externalKey(row) {
  return row.id || `${row.sourceFile}-${row.date}-${row.content}-${row.amount || row.paymentAmount}`;
}

function highlightClass(row) {
  return highlightedExternalKey && externalKey(row) === highlightedExternalKey ? "linked-row" : "";
}

function findRakutenMatchForMf(row) {
  const monthRows = importedRows.filter((candidate) => candidate.sourceType === "rakuten" && candidate.month === row.month);
  const paymentMatches = renderRakutenDetailButton(row) ? rakutenRowsForPayment(row.month, row.amount) : [];
  if (isRakutenCardTransfer(row) && monthRows.length) return { type: "month", rows: monthRows };
  if (paymentMatches.length) return { type: "month", rows: paymentMatches };
  const amount = numberValue(row.amount);
  const sameDay = importedRows.filter(
    (candidate) =>
      candidate.sourceType === "rakuten" &&
      candidate.date === row.date &&
      numberValue(candidate.paymentAmount || candidate.amount) === amount &&
      normalize(candidate.content).includes(normalize(row.content).slice(0, 8)),
  );
  return sameDay.length ? { type: "record", rows: sameDay } : null;
}

function renderRakutenRows(rows) {
  const total = rows.reduce((sum, row) => sum + numberValue(row.paymentAmount), 0);
  byId("rakutenPaymentTotal").textContent = `支払い総計 ${yen(total)}`;
  byId("rakutenImportedRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <tr class="${highlightClass(row)}" data-external-key="${encodeURIComponent(externalKey(row))}">
              <td>${esc(row.date)}</td>
              <td><strong>${esc(row.content)}</strong><br><small>${esc(row.sourceFile || "")}</small></td>
              <td>${esc(row.user)}</td>
              <td>${esc(row.paymentMethod)}</td>
              <td class="amount">${yen(numberValue(row.amount))}</td>
              <td class="amount">${yen(numberValue(row.fee))}</td>
              <td class="amount">${yen(numberValue(row.total))}</td>
              <td class="amount">${yen(numberValue(row.paymentAmount))}</td>
              <td>
                <button class="subtle-button" type="button" data-row-popup="${encodeURIComponent(JSON.stringify(row))}">詳細</button>
                ${importEditMode ? `<button class="subtle-button danger-button" type="button" data-delete-import="${encodeURIComponent(externalKey(row))}">削除</button>` : ""}
              </td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="9">楽天カード明細はまだ取り込まれていません。</td></tr>`;

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

function showRowPopup(encoded) {
  const row = JSON.parse(decodeURIComponent(encoded));
  window.alert(
    Object.entries(row)
      .map(([key, value]) => {
        const formatted = /amount|total|fee|carryover/i.test(key) ? yen(numberValue(value)) : value;
        return `${key}: ${formatted}`;
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
  const targetTab = document.querySelector("[data-external-tab].active")?.dataset.externalTab;
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
  const replacing = new Set(imported.map((row) => `${row.sourceType}:${row.month}`).filter((key) => !key.endsWith(":")));
  const keptRows = importedRows.filter((row) => !replacing.has(`${row.sourceType}:${row.month}`));
  const merged = new Map(keptRows.map((row) => [externalKey(row), row]));
  for (const row of imported) merged.set(row.id || `${row.sourceFile}-${row.date}-${row.content}-${row.amount}`, row);
  importedRows = [...merged.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  saveImportedRows();
  renderImport();
  event.target.value = "";
}

function renderImport() {
  const months = [...new Set(importedRows.map((row) => row.month).filter(Boolean))].sort().reverse();
  const current = byId("importMonthSelect").value;
  const selected = months.includes(current) ? current : months[0] || "";
  byId("importSummary").textContent = importedRows.length ? `${importedRows.length}件 / ${months.length}か月` : "未取り込み";
  byId("importMonthSelect").innerHTML = months.length
    ? months.map((month) => `<option value="${esc(month)}" ${month === selected ? "selected" : ""}>${esc(month)}</option>`).join("")
    : '<option value="">データなし</option>';
  const rows = importedRows.filter((row) => !selected || row.month === selected);
  renderMoneyForwardRows(rows.filter((row) => row.sourceType === "moneyforward"));
  renderRakutenRows(rows.filter((row) => row.sourceType === "rakuten"));
  renderExternalBackButton();
  byId("toggleImportEdit").textContent = importEditMode ? "編集終了" : "編集";
  byId("bulkDeleteImportedRows").classList.toggle("hidden", !importEditMode);
  requestAnimationFrame(scrollExternalTarget);
}

function selectRow(event) {
  const button = event.target.closest("[data-select-id]");
  const row = event.target.closest("[data-row-id]");
  const id = button?.dataset.selectId || row?.dataset.rowId;
  if (!id) return;
  if (editingId && editingId !== id) {
    const editingItem = selectedItem();
    if (editingItem?.draftNew) {
      master = master.filter((entry) => entry.id !== editingItem.id);
      saveMaster();
      loadOptions();
    }
    editingId = null;
    editDraft = null;
  }
  selectedId = id;
  renderMaster();
}

function updateDetail(event) {
  const target = event.target;
  const field = target.dataset.detailField;
  if (!field || editingId !== selectedId) return;
  editDraft[field] = field === "monthlyAmount" ? Number(target.value || 0) : target.value;
  if (field === "frequency") {
    if (editDraft.frequency !== "yearly") editDraft.updateMonth = "";
    renderDetailPanel();
  }
}

function updateAliasSuggestions(event) {
  if (event.target.id !== "aliasSearch" || editingId !== selectedId) return;
  const panel = byId("aliasSuggestions");
  const query = event.target.value.trim();
  panel.classList.toggle("hidden", !query);
  panel.innerHTML = query ? renderAliasSuggestions(query, externalAliases(editDraft)) : "";
}

function focusAliasSearch(event) {
  if (event.target.id !== "aliasSearch") return;
  byId("aliasSuggestions").classList.add("hidden");
}

function addExternalAlias(name) {
  if (editingId !== selectedId || !editDraft) return;
  const valid = importedRows.some((row) => row.content === name);
  if (!valid) return;
  editDraft.externalAliases = [...new Set([...externalAliases(editDraft), name])];
  editDraft.mfAlias = editDraft.externalAliases.join(", ");
  renderDetailPanel();
}

function removeExternalAlias(name) {
  if (editingId !== selectedId || !editDraft) return;
  editDraft.externalAliases = externalAliases(editDraft).filter((alias) => alias !== name);
  editDraft.mfAlias = editDraft.externalAliases.join(", ");
  renderDetailPanel();
}

function toggleRowEdit() {
  if (editingId === selectedId) {
    editingId = null;
    editDraft = null;
  } else {
    editingId = selectedId;
    editDraft = { ...selectedItem() };
  }
  renderMaster();
}

function commitEdit() {
  const index = master.findIndex((item) => item.id === selectedId);
  if (index < 0 || !editDraft) return;
  const oldAmount = Number(master[index].monthlyAmount || 0);
  editDraft.externalAliases = externalAliases(editDraft);
  editDraft.mfAlias = editDraft.externalAliases.join(", ");
  master[index] = { ...master[index], ...editDraft, alignmentId: alignmentId(editDraft) };
  delete master[index].draftNew;
  if (Number(master[index].monthlyAmount || 0) !== oldAmount) {
    master[index].amountHistory ||= [];
    master[index].amountHistory.push({ date: new Date().toISOString().slice(0, 10), from: oldAmount, to: Number(master[index].monthlyAmount || 0), reason: "手動変更" });
  }
  if (master[index].updateMonth) saveVersionForItem(master[index]);
  editingId = null;
  editDraft = null;
  saveMaster();
  loadOptions();
  rerender();
}

function cancelEdit() {
  const item = selectedItem();
  if (item?.draftNew) {
    master = master.filter((entry) => entry.id !== item.id);
    selectedId = master[0]?.id || null;
    saveMaster();
    loadOptions();
  }
  editingId = null;
  editDraft = null;
  renderMaster();
}

function saveVersion() {
  const item = selectedItem();
  const month = item.updateMonth;
  if (!item || !month) return;
  saveVersionForItem(item);
  saveMaster();
  renderMaster();
}

function saveVersionForItem(item) {
  const month = item.updateMonth;
  if (!month) return;
  item.versions ||= [];
  item.versions.push({
    month,
    savedAt: new Date().toISOString(),
    name: item.name,
    detail: item.detail,
    person: item.person,
    category: item.category,
    payment: item.payment,
    nature: item.nature,
    flow: item.flow,
    frequency: item.frequency,
    monthlyAmount: item.monthlyAmount,
    updateMonth: item.updateMonth,
    mfAlias: item.mfAlias,
    note: item.note,
  });
}

function deleteSelectedItem() {
  const index = master.findIndex((item) => item.id === selectedId);
  if (index < 0) return;
  master.splice(index, 1);
  selectedId = master[0]?.id || null;
  saveMaster();
  loadOptions();
  rerender();
}

function applyPendingCandidate() {
  if (!pendingCandidate) return;
  const item = master.find((entry) => entry.alignmentId === pendingCandidate.itemId);
  if (item) {
    const oldAmount = Number(item.monthlyAmount || 0);
    item.monthlyAmount = pendingCandidate.suggestedAmount;
    item.status = "normal";
    item.amountHistory ||= [];
    item.amountHistory.push({ date: new Date().toISOString().slice(0, 10), from: oldAmount, to: item.monthlyAmount, reason: "補完候補を反映" });
    candidateStatus[pendingCandidate.itemId] = { status: "reflected", at: new Date().toISOString() };
    selectedId = item.id;
    saveMaster();
    saveCandidateStatus();
  }
  pendingCandidate = null;
  rerender();
}

function rejectPendingCandidate(reason = "既存項目に含まれる") {
  if (pendingCandidate) {
    candidateStatus[pendingCandidate.itemId] = { status: "rejected", reason, at: new Date().toISOString() };
    saveCandidateStatus();
  }
  pendingCandidate = null;
  switchTabTo("import");
  rerender();
}

function reviewCandidate(event) {
  const target = event.target.closest("[data-review-candidate]");
  if (!target) return;
  const itemId = decodeURIComponent(target.dataset.reviewCandidate);
  pendingCandidate = (data.masterAlignment?.reviewCandidates || []).find((candidate) => candidate.itemId === itemId) || null;
  const item = master.find((entry) => entry.alignmentId === itemId);
  if (item) selectedId = item.id;
  switchTabTo("master");
  rerender();
}

function addMasterItem() {
  const id = `manual::${Date.now()}`;
  const item = {
    id,
    alignmentId: id,
    source: "manual",
    enabled: true,
    status: "normal",
    person: optionLists.person[0] || "世帯",
    category: optionLists.category[0] || "未分類",
    payment: optionLists.payment[0] || "未設定",
    name: "",
    detail: "",
    nature: optionLists.nature[0] || "fixed",
    flow: optionLists.flow[0] || "expense",
    frequency: optionLists.frequency[0] || "monthly",
    monthlyAmount: 0,
    originalAmount: 0,
    updateMonth: "",
    mfAlias: "",
    externalAliases: [],
    note: "",
    amountHistory: [],
    draftNew: true,
  };
  master.unshift(item);
  selectedId = id;
  editingId = id;
  editDraft = { ...item, externalAliases: [] };
  saveMaster();
  loadOptions();
  switchTabTo("master");
  rerender();
}

function renderSettings() {
  byId("personOptions").value = (optionLists.person || []).join("\n");
  byId("categoryOptions").value = (optionLists.category || []).join("\n");
  byId("paymentOptions").value = (optionLists.payment || []).join("\n");
  byId("statusOptions").value = (optionLists.status || []).map((value) => displayValue("status", value)).join("\n");
  byId("natureOptions").value = (optionLists.nature || []).map((value) => displayValue("nature", value)).join("\n");
  byId("flowOptions").value = (optionLists.flow || []).map((value) => displayValue("flow", value)).join("\n");
  byId("frequencyOptions").value = (optionLists.frequency || []).map((value) => displayValue("frequency", value)).join("\n");
  byId("updateMonthOptions").value = (optionLists.updateMonth || []).join("\n");
}

function saveSettings() {
  const read = (id) => byId(id).value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  optionLists.person = read("personOptions");
  optionLists.category = read("categoryOptions");
  optionLists.payment = read("paymentOptions");
  optionLists.status = read("statusOptions").map((value) => optionValue("status", value));
  optionLists.nature = read("natureOptions").map((value) => optionValue("nature", value));
  optionLists.flow = read("flowOptions").map((value) => optionValue("flow", value));
  optionLists.frequency = read("frequencyOptions").map((value) => optionValue("frequency", value));
  optionLists.updateMonth = read("updateMonthOptions");
  saveOptions();
  byId("settingsModal").classList.add("hidden");
  renderMaster();
}

function switchTab(event) {
  const button = event.target.closest("[data-tab]");
  if (button) switchTabTo(button.dataset.tab);
}

function switchTabTo(target) {
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.tab === target;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `panel-${target}`));
}

function switchExternalTab(target) {
  document.querySelectorAll("[data-external-tab]").forEach((tab) => tab.classList.toggle("active", tab.dataset.externalTab === target));
  byId("externalMfPanel").classList.toggle("hidden", target !== "mf");
  byId("externalRakutenPanel").classList.toggle("hidden", target !== "rakuten");
}

function updateSort(event) {
  const button = event.target.closest("[data-sort]");
  if (!button) return;
  const key = button.dataset.sort;
  sortState = sortState.key === key ? { key, direction: sortState.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" };
  renderMaster();
}

function updateColumnFilter(event) {
  const select = event.target.closest("[data-filter]");
  if (!select) return;
  columnFilters[select.dataset.filter] = select.value;
  renderMaster();
}

function bindEvents() {
  document.querySelectorAll("[data-app-mode]").forEach((button) => {
    button.addEventListener("click", () => switchAppMode(button.dataset.appMode));
  });
  document.querySelector(".tab-strip").addEventListener("click", switchTab);
  document.querySelector(".master-table thead").addEventListener("click", updateSort);
  document.querySelector(".master-table thead").addEventListener("change", updateColumnFilter);
  byId("masterRows").addEventListener("click", selectRow);
  byId("detailPanel").addEventListener("change", updateDetail);
  byId("detailPanel").addEventListener("input", updateAliasSuggestions);
  byId("detailPanel").addEventListener("focusin", focusAliasSearch);
  byId("detailPanel").addEventListener("click", (event) => {
    if (event.target.id === "toggleRowEdit") toggleRowEdit();
    if (event.target.id === "commitEdit") commitEdit();
    if (event.target.id === "cancelEdit") cancelEdit();
    if (event.target.id === "deleteItem") deleteSelectedItem();
    if (event.target.id === "saveVersion") saveVersion();
    if (event.target.id === "toggleHistory") byId("historyPanel")?.classList.toggle("hidden");
    const addAlias = event.target.closest("[data-add-alias]");
    if (addAlias) addExternalAlias(decodeURIComponent(addAlias.dataset.addAlias));
    const removeAlias = event.target.closest("[data-remove-alias]");
    if (removeAlias) removeExternalAlias(decodeURIComponent(removeAlias.dataset.removeAlias));
  });
  byId("detailPanel").addEventListener("change", (event) => {
    if (event.target.id === "versionSelect") {
      byId("versionPreview").innerHTML = renderVersionPreview(selectedItem(), Number(event.target.value || 0));
    }
  });
  byId("pendingApplyPanel").addEventListener("click", (event) => {
    if (event.target.id === "applyPendingCandidate") applyPendingCandidate();
    if (event.target.id === "rejectPendingCandidate") {
      const reason = window.prompt("反映しない理由", "既存項目に含まれる") || "理由未入力";
      rejectPendingCandidate(reason);
    }
  });
  byId("addMasterItem").addEventListener("click", addMasterItem);
  byId("masterFilter").addEventListener("change", renderMaster);
  byId("masterSearch").addEventListener("input", renderMaster);
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
  });
  byId("openSettings").addEventListener("click", () => {
    renderSettings();
    byId("settingsModal").classList.remove("hidden");
  });
  byId("openHelp").addEventListener("click", () => {
    renderHelp();
    byId("helpModal").classList.remove("hidden");
  });
  byId("closeSettings").addEventListener("click", () => byId("settingsModal").classList.add("hidden"));
  byId("closeHelp").addEventListener("click", () => byId("helpModal").classList.add("hidden"));
  byId("saveListOptions").addEventListener("click", saveSettings);
  byId("externalCsvInput").addEventListener("change", handleExternalImport);
  byId("importMonthSelect").addEventListener("change", renderImport);
  byId("toggleImportEdit").addEventListener("click", toggleImportEdit);
  byId("bulkDeleteImportedRows").addEventListener("click", clearImportedRows);
  byId("incomeFrame").addEventListener("load", resizeIncomeFrame);
  window.addEventListener("resize", resizeIncomeFrame);
  setInterval(resizeIncomeFrame, 1200);
  byId("resetMaster").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    selectedId = null;
    editingId = null;
    pendingCandidate = null;
    loadMaster();
    loadOptions();
    rerender();
  });
}

function init() {
  data = window.HOUSEHOLD_DATA;
  if (!data) throw new Error("家計データを読み込めませんでした。");
  loadMaster();
  loadOptions();
  loadCandidateStatus();
  loadImportedRows();
  bindEvents();
  rerender();
  switchAppMode("expense");
}

init();
