// household.js

let maintenanceCandidateCache = null;
let mobileDetailExplicitlyOpened = false;

function categoryText(item) {
  return String(item?.category || "");
}

function inferEssential(item) {
  if (item?.flow === "saving") return true;
  const text = categoryText(item);
  if (/住宅|税|社会保険|医療|教育|水道|光熱|通信|保険|車|交通|貯蓄|投資/.test(text)) return true;
  if (/娯楽|その他|日用品/.test(text)) return false;
  return item?.nature === "fixed";
}

function inferReducible(item) {
  const text = categoryText(item);
  if (/通信|保険|水道|光熱|車|交通|娯楽|その他|日用品/.test(text)) return true;
  if (/住宅|税|社会保険|教育|医療|貯蓄|投資/.test(text) || item?.flow === "saving") return false;
  return item?.nature === "variable";
}

function normalizeJudgmentFlags(item) {
  return {
    ...item,
    essential: typeof item?.essential === "boolean" ? item.essential : inferEssential(item),
    reducible: typeof item?.reducible === "boolean" ? item.reducible : inferReducible(item),
  };
}

function buildDefaultMaster() {
  return data.items.map((item) => normalizeJudgmentFlags({
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
    nature: String(item.costType || "").includes("固定") || String(item.costType || "").includes("蝗ｺ") ? "fixed" : "variable",
    flow: String(item.flow || "").includes("貯") || String(item.flow || "").includes("雋ｯ") ? "saving" : "expense",
    frequency: "monthly",
    paymentMonths: [],
    bimonthlyPattern: "even",
    monthlyAmount: item.amount,
    originalAmount: item.amount,
    updateMonth: "",
    mfAlias: "",
    externalAliases: [],
    incomeLinks: [],
    note: "",
    amountHistory: [],
  }));
}


function uniqueValues(field) {
  return [...new Set(master.map((item) => item[field]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ja"));
}

function expensePersonValues() {
  return [...new Set([...(optionLists.person || []), ...master.map((item) => item.person)].filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ja"));
}

function activeExpensePerson() {
  const values = expensePersonValues();
  if (!selectedExpensePerson) selectedExpensePerson = "all";
  if (selectedExpensePerson !== "all" && !values.includes(selectedExpensePerson)) selectedExpensePerson = values[0] || "all";
  return selectedExpensePerson;
}

function renderExpensePersonSelect() {
  const select = byId("expensePersonSelect");
  if (!select) return;
  const current = activeExpensePerson();
  select.innerHTML = `<option value="all" ${current === "all" ? "selected" : ""}>すべて</option>` + expensePersonValues()
    .map((person) => `<option value="${esc(person)}" ${person === current ? "selected" : ""}>${esc(person)}</option>`)
    .join("");
  select.value = current;
}

function externalAliases(item) {
  const legacy = String(item?.mfAlias || "")
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([...(item?.externalAliases || []), ...legacy])];
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

function percent(value) {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function expenseSummaryMetrics() {
  const income = monthlyIncome();
  const expense = monthlyExpense();
  const saving = monthlySaving();
  const surplus = income - expense - saving;
  const fixed = enabledItems().filter((item) => item.nature === "fixed" && item.flow === "expense").reduce((sum, item) => sum + Number(item.monthlyAmount || 0), 0);
  const housing = enabledItems().filter((item) => item.category === "住宅費").reduce((sum, item) => sum + Number(item.monthlyAmount || 0), 0);
  const expenseRatio = income ? expense / income : 0;
  const fixedRatio = income ? fixed / income : 0;
  const savingRatio = income ? saving / income : 0;
  const housingRatio = income ? housing / income : Number(data.totals?.housingLoanRatio || 0);
  const pendingCount =
    typeof buildUpdateCandidates === "function"
      ? buildUpdateCandidates().filter((candidate) => candidateDisplayStatus(candidate) === "pending").length
      : (data.masterAlignment?.reviewCandidates || []).filter((candidate) => candidateStatus[candidate.itemId]?.status !== "reflected" && candidateStatus[candidate.itemId]?.status !== "rejected").length;
  const attentionItems = enabledItems().filter((item) => expenseAttentionReasons(item, income).length);
  const attentionCount = attentionItems.length;
  const health = surplus < 0 ? "赤字" : surplus < income * 0.08 ? "警戒" : "健全";
  return { income, expense, saving, surplus, expenseRatio, fixed, fixedRatio, savingRatio, housing, housingRatio, pendingCount, attentionCount, health };
}

function expenseAttentionReasons(item, income = monthlyIncome()) {
  if (item.enabled === false) return [];
  const amount = Number(item.monthlyAmount || 0);
  const reasons = [];
  const hasDetail = String(item.detail || "").trim().length >= 3;
  const hasNote = String(item.note || "").trim().length >= 3;
  if (!amount) reasons.push("金額未設定");
  if (!item.updateMonth) reasons.push("更新月未設定");
  if (rowStatus(item) === "editing" || item.status === "editing") reasons.push("編集中");
  if (!hasDetail && !hasNote) reasons.push("詳細不足");
  if (income && amount >= income * 0.08 && (!item.updateMonth || !hasNote)) reasons.push("高額項目の情報不足");
  return reasons;
}

function expenseHealthComment(health) {
  if (health === "赤字") return "現在の支出設計では、毎月の収支がマイナスです。";
  if (health === "警戒") return "黒字ですが、余力が薄い状態です。";
  return "現在の支出設計は、世帯収入に対して概ね維持可能です。";
}

function ratioBar(label, value, help) {
  const clamped = Math.max(0, Math.min(1.4, Number(value || 0)));
  return `
    <div class="expense-ratio-row" title="${esc(help)}">
      <div><span>${esc(label)}</span><strong>${percent(value)}</strong></div>
      <div class="expense-ratio-track"><i style="width:${Math.min(100, clamped * 100).toFixed(1)}%"></i></div>
    </div>
  `;
}

function renderExpenseSummary() {
  const cards = byId("expenseSummaryCards");
  const badge = byId("expenseHealthStatus");
  const notes = byId("expenseSummaryNotes");
  if (!cards || !badge || !notes) return;
  const metrics = expenseSummaryMetrics();
  const healthClass = metrics.health === "赤字" ? "danger" : metrics.health === "警戒" ? "attention" : "reflected";
  badge.className = `status-pill ${healthClass}`;
  badge.textContent = metrics.health;
  cards.innerHTML = [
    ["世帯収入", yen(metrics.income), "収入管理または既存データから参照する月額収入です。"],
    ["支出合計", yen(metrics.expense), "支出として登録されている有効項目の月額合計です。"],
    ["貯蓄・投資合計", yen(metrics.saving), "貯蓄・投資として登録されている有効項目の月額合計です。"],
    ["月次余力", yen(metrics.surplus), "世帯収入 - 支出合計 - 貯蓄・投資合計です。"],
    ["固定費率", percent(metrics.fixedRatio), "固定費を世帯収入で割った割合です。"],
    ["貯蓄率", percent(metrics.savingRatio), "貯蓄・投資合計を世帯収入で割った割合です。"],
    ["住宅費率", percent(metrics.housingRatio), "住宅費を世帯収入で割った割合です。"],
    ["更新確認", `${metrics.pendingCount}件`, "外部データなどから確認できるメンテナンス通知の件数です。"],
    ["要確認項目", `${metrics.attentionCount}件`, "金額未設定、高額項目の情報不足、編集中など確認したい項目です。"],
  ]
    .map(([label, value, help]) => `<div class="summary-card expense-summary-card" title="${esc(help)}" tabindex="0"><span>${esc(label)}<em class="kpi-info" title="${esc(help)}">i</em></span><strong>${esc(value)}</strong></div>`)
    .join("");
  notes.innerHTML = `
    <div class="review-panel ${metrics.health === "赤字" ? "warn" : "ok"}">
      <strong>判定: ${esc(metrics.health)}</strong>
      <p>${esc(expenseHealthComment(metrics.health))}</p>
      <small>赤字は月次余力がマイナス、警戒は月次余力が世帯収入の8%未満、健全は8%以上です。</small>
    </div>
    <section class="expense-ratio-card">
      <h4>構成比</h4>
      ${ratioBar("支出合計 / 世帯収入", metrics.expenseRatio, "支出合計を世帯収入で割った割合です。")}
      ${ratioBar("貯蓄・投資 / 世帯収入", metrics.savingRatio, "貯蓄・投資合計を世帯収入で割った割合です。")}
      ${ratioBar("固定費 / 世帯収入", metrics.fixedRatio, "固定費を世帯収入で割った割合です。")}
      ${ratioBar("住宅費 / 世帯収入", metrics.housingRatio, "住宅費を世帯収入で割った割合です。")}
    </section>
    <div class="expense-summary-actions">
      <button type="button" data-summary-tab="master">入力を見る</button>
      <button type="button" data-summary-tab="master">入力で確認</button>
      <button type="button" data-summary-tab="import">外部データを見る</button>
    </div>
  `;
  notes.querySelectorAll("[data-summary-tab]").forEach((button) => {
    button.addEventListener("click", () => switchTabTo(button.dataset.summaryTab));
  });
}

function candidateSourceLabel(source) {
  return {
    moneyforward: "MF",
    rakuten: "楽天カード",
    payroll: "収入管理",
    "link-income": "収入管理",
    "link-external": "外部データ",
  }[source] || source || "-";
}

function candidateConfidence(score) {
  if (score >= 75) return { key: "high", label: "高" };
  if (score >= 50) return { key: "medium", label: "中" };
  return { key: "low", label: "低" };
}

function candidateSavedStatus(id) {
  const value = candidateStatus[id]?.status || "pending";
  if (value === "rejected") return "ignored";
  return ["pending", "hold", "ignored", "reflected", "linked"].includes(value) ? value : "pending";
}

function candidateDisplayStatus(candidate) {
  const saved = candidateSavedStatus(candidate.id);
  const item = candidateTargetItem(candidate);
  if (saved === "pending" && candidate?.source === "payroll" && item && hasIncomeLink(item, candidate.incomeKey, candidate.profile)) return "linked";
  return saved;
}

function notifyLinkGroupCandidates(context = "") {
  const count = buildLinkGroupCandidates().filter((candidate) => candidateDisplayStatus(candidate) === "pending").length;
  if (!count || typeof showToast !== "function") return;
  showToast(`紐づけ済みの支出項目に更新候補があります。${context ? `（${context}）` : ""}`, "warn");
}


function invalidateMaintenanceCandidateCache() {
  maintenanceCandidateCache = null;
}

function maintenanceCandidateIndex() {
  if (maintenanceCandidateCache) return maintenanceCandidateCache;
  const active = buildUpdateCandidates().filter((candidate) => ["pending", "hold"].includes(candidateDisplayStatus(candidate)) && candidateTargetItem(candidate));
  const byItem = new Map();
  active.forEach((candidate) => {
    const item = candidateTargetItem(candidate);
    if (!item) return;
    if (!byItem.has(item.id)) byItem.set(item.id, []);
    byItem.get(item.id).push(candidate);
  });
  const pending = active.filter((candidate) => candidateDisplayStatus(candidate) === "pending");
  maintenanceCandidateCache = { active, byItem, pending };
  return maintenanceCandidateCache;
}

function activeMaintenanceCandidates() {
  return maintenanceCandidateIndex().active;
}

function itemMaintenanceCandidates(item) {
  if (!item) return [];
  return maintenanceCandidateIndex().byItem.get(item.id) || [];
}

function pendingMaintenanceCandidates() {
  return maintenanceCandidateIndex().pending;
}

function renderMaintenanceNotice() {
  const notice = byId("masterCandidateNotice");
  if (!notice) return;
  const count = pendingMaintenanceCandidates().length;
  notice.classList.toggle("hidden", !count);
  notice.innerHTML = count ? '<span>更新確認が必要な項目 ' + count + '件</span>' : "";
}

function renderDetailMaintenanceCandidates(item) {
  const candidates = itemMaintenanceCandidates(item);
  if (!candidates.length) return "";
  return '<section class="detail-maintenance-box"><div class="detail-maintenance-head"><strong>支出項目メンテナンス通知</strong><span>' + candidates.length + '件</span></div>' +
    candidates.map((candidate) => {
      const status = candidateDisplayStatus(candidate);
      const canApply = status !== "reflected" && Number.isFinite(Number(candidate.latest));
      return '<article class="detail-candidate-card">' +
        '<div class="detail-candidate-title"><span class="mini-badge attention">' + esc(candidateSourceLabel(candidate.source)) + '</span><strong>' + esc(candidate.ym || "対象月なし") + '</strong><small>' + esc(candidateStatusLabel(status)) + '</small></div>' +
        '<div class="detail-candidate-grid">' +
          '<div><span>現在額</span><b>' + yen(candidate.current) + '</b></div>' +
          '<div><span>候補額</span><b>' + yen(candidate.latest) + '</b></div>' +
          '<div><span>差額</span><b>' + (candidate.diff > 0 ? "+" : "") + yen(candidate.diff) + '</b></div>' +
          '<div><span>データ元</span><b>' + esc(candidateSourceLabel(candidate.source)) + '</b></div>' +
        '</div>' +
        '<details class="candidate-evidence compact"><summary>根拠</summary><p>' + esc(candidateEvidenceText(candidate) || "根拠情報なし") + '</p></details>' +
        '<div class="candidate-actions compact">' +
          '<button type="button" data-candidate-action="amount" data-candidate-apply="' + encodeURIComponent(candidate.id) + '" ' + (canApply ? "" : "disabled") + '>反映</button>' +
          '<button type="button" data-candidate-status="' + encodeURIComponent(candidate.id) + '" data-status-value="hold">保留</button>' +
          '<button type="button" data-candidate-status="' + encodeURIComponent(candidate.id) + '" data-status-value="ignored">無視</button>' +
        '</div></article>';
    }).join("") + '</section>';
}

function candidateStatusLabel(status) {
  if (status === "reflected") return "反映済み";
  if (status === "linked") return "連携済み";
  return { pending: "未確認", hold: "保留", ignored: "無視" }[status] || "未確認";
}

function candidateStatusClass(status) {
  if (status === "ignored") return "danger";
  if (status === "hold" || status === "pending") return "attention";
  return "reflected";
}

function candidateTargetItem(candidate) {
  return candidate.item || master.find((item) => item.alignmentId === candidate.itemId || item.id === candidate.itemId) || null;
}

function incomeLinks(item) {
  return Array.isArray(item?.incomeLinks) ? item.incomeLinks : [];
}

function hasIncomeLink(item, key, profile = typeof payrollActiveProfile === "function" ? payrollActiveProfile() : "primary") {
  return incomeLinks(item).some((link) => link.key === key && (!link.profile || link.profile === profile));
}

function candidateAmountDiff(current, latest) {
  const diff = Number(latest || 0) - Number(current || 0);
  const rate = Number(current || 0) ? diff / Number(current || 0) : diff ? 1 : 0;
  return { diff, rate };
}

function scoreCandidate(parts) {
  let score = 0;
  if (parts.nameMatch) score += 25;
  if (parts.aliasMatch) score += 25;
  if (parts.amountNear) score += 20;
  if (parts.monthly) score += 10;
  if (parts.categoryMatch) score += 10;
  if (parts.personMatch) score += 5;
  if (parts.latestMonth) score += 5;
  return Math.max(0, Math.min(100, score));
}

function externalAmount(row) {
  return Math.abs(numberValue(row.paymentAmount ?? row.amount ?? row.total ?? 0));
}

function rowMonthValue(row) {
  return row.month || String(row.date || "").slice(0, 7).replace("/", "-");
}

function householdExternalSourceType(rowOrValue) {
  if (typeof normalizeExternalSourceType === "function") return normalizeExternalSourceType(rowOrValue);
  const value = typeof rowOrValue === "string"
    ? rowOrValue
    : rowOrValue?.sourceType || rowOrValue?.source || rowOrValue?.provider || rowOrValue?.importType || rowOrValue?.sourceFile || "";
  const normalized = normalize(value).toLowerCase();
  if (/rakuten|楽天|enavi/.test(normalized)) return "rakuten";
  if (typeof rowOrValue === "object" && (rowOrValue.paymentMethod || rowOrValue.paymentAmount || rowOrValue.user)) return "rakuten";
  return "moneyforward";
}

function householdExternalMonth(row) {
  if (typeof externalMonthOf === "function") return externalMonthOf(row);
  const raw = String(row?.month || row?.useMonth || row?.date || "").normalize("NFKC");
  const match = raw.match(/(20\d{2})\D?(0?[1-9]|1[0-2])/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}` : raw.replaceAll("/", "-").slice(0, 7);
}

function findBestMasterForExternal(row) {
  const rowName = normalize(row.content);
  const rowCategory = normalize(row.major || row.category || "");
  let best = null;
  for (const item of enabledItems()) {
    const aliases = externalAliases(item).map(normalize);
    const name = normalize(`${item.name || ""} ${item.detail || ""}`);
    const category = normalize(item.category || "");
    const aliasMatch = aliases.some((alias) => alias && rowName.includes(alias));
    const nameMatch = name && (rowName.includes(name.slice(0, 8)) || name.includes(rowName.slice(0, 8)));
    const categoryMatch = category && rowCategory && (rowCategory.includes(category) || category.includes(rowCategory));
    const current = Number(item.monthlyAmount || 0);
    const amount = externalAmount(row);
    const amountNear = current ? Math.abs(current - amount) <= Math.max(1000, current * 0.08) : false;
    const score = scoreCandidate({ nameMatch, aliasMatch, amountNear, monthly: false, categoryMatch, personMatch: false, latestMonth: true });
    if (score > (best?.score || 0)) best = { item, score, nameMatch, aliasMatch, amountNear, categoryMatch };
  }
  return best?.score >= 30 ? best : null;
}

function buildStoredExternalCandidates() {
  return (data.masterAlignment?.reviewCandidates || []).map((candidate, index) => {
    const item = master.find((entry) => entry.alignmentId === candidate.itemId) || null;
    const source = candidate.moneyForward ? "moneyforward" : "moneyforward";
    const current = item ? Number(item.monthlyAmount || 0) : Number(candidate.excel?.amount || 0);
    const latest = Number(candidate.suggestedAmount ?? candidate.moneyForward?.latest ?? candidate.moneyForward?.average ?? 0);
    const average = Number(candidate.moneyForward?.average || 0);
    const score = Number(candidate.score || 0);
    const { diff, rate } = candidateAmountDiff(current, latest);
    return {
      id: `stored:${candidate.itemId}:${index}`,
      itemId: candidate.itemId,
      item,
      targetName: item?.name || candidate.excel?.name || "支出項目候補",
      current,
      latest,
      average,
      diff,
      rate,
      source,
      ym: candidate.moneyForward?.lastDate || "",
      score,
      confidence: candidateConfidence(score),
      reasons: candidate.reasons || [],
      evidence: [
        candidate.moneyForward?.content ? `外部件名: ${candidate.moneyForward.content}` : "",
        candidate.moneyForward?.months ? `出現月数: ${candidate.moneyForward.months}か月` : "",
        candidate.moneyForward?.category ? `カテゴリ: ${candidate.moneyForward.category}` : "",
      ].filter(Boolean),
    };
  });
}

function buildImportedExternalCandidates() {
  const groups = new Map();
  importedRows.forEach((row) => {
    if (!householdExternalSourceType(row)) return;
    const match = findBestMasterForExternal(row);
    if (!match?.item) return;
    const source = householdExternalSourceType(row);
    const key = `import:${source}:${match.item.id}:${normalize(row.content).slice(0, 32)}`;
    const group = groups.get(key) || { rows: [], match, source, content: row.content };
    group.rows.push(row);
    groups.set(key, group);
  });
  return [...groups.entries()].map(([id, group]) => {
    const rows = group.rows.slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    const latestRow = rows.at(-1);
    const amounts = rows.map(externalAmount).filter((value) => value > 0);
    const latest = externalAmount(latestRow);
    const average = amounts.length ? amounts.reduce((sum, value) => sum + value, 0) / amounts.length : latest;
    const item = group.match.item;
    const current = Number(item.monthlyAmount || 0);
    const { diff, rate } = candidateAmountDiff(current, latest);
    const months = new Set(rows.map(rowMonthValue).filter(Boolean));
    const score = scoreCandidate({
      nameMatch: group.match.nameMatch,
      aliasMatch: group.match.aliasMatch,
      amountNear: group.match.amountNear,
      monthly: months.size >= 3,
      categoryMatch: group.match.categoryMatch,
      personMatch: false,
      latestMonth: true,
    });
    return {
      id,
      itemId: item.id,
      item,
      targetName: item.name || "支出項目",
      current,
      latest,
      average,
      diff,
      rate,
      source: group.source,
      ym: rowMonthValue(latestRow) || latestRow?.date || "",
      score,
      confidence: candidateConfidence(score),
      reasons: [
        group.match.aliasMatch ? "外部データ別名と一致" : "",
        group.match.nameMatch ? "名称が近い" : "",
        group.match.amountNear ? "金額が近い" : "",
        months.size >= 3 ? "毎月性あり" : "",
        group.match.categoryMatch ? "カテゴリが近い" : "",
      ].filter(Boolean),
      evidence: [
        `外部件名: ${group.content || "-"}`,
        `明細数: ${rows.length}件`,
        `出現月数: ${months.size}か月`,
      ],
    };
  });
}

const payrollExpenseLinks = [
  { key: "incomeTax", label: "所得税", aliases: ["所得税"], flowHint: "expense" },
  { key: "residentTax", label: "住民税", aliases: ["住民税"], flowHint: "expense" },
  { key: "healthIns", label: "健康保険料", aliases: ["健康保険", "健康保険料"] },
  { key: "careIns", label: "介護保険料", aliases: ["介護保険", "介護保険料"] },
  { key: "pension", label: "厚生年金", aliases: ["厚生年金", "厚生年金保険料"] },
  { key: "employmentIns", label: "雇用保険", aliases: ["雇用保険", "雇用保険料"] },
  { key: "dbPension", label: "確定給付年金本人拠出", aliases: ["確定給付年金"] },
  { key: "dcPension", label: "確定拠出年金本人掛金", aliases: ["確定拠出年金"], flowHint: "saving" },
  { key: "stock", label: "持株拠出金", aliases: ["持株", "持株拠出金"], flowHint: "saving" },
  { key: "housingSaving", label: "持ち家財形貯蓄", aliases: ["持ち家財形", "財形貯蓄"], flowHint: "saving" },
  { key: "savings", label: "総合預金", aliases: ["総合預金"], flowHint: "saving" },
  { key: "medicalAid", label: "医療共済会費", aliases: ["医療共済", "医療共済会費"] },
  { key: "cAccount", label: "C口座", aliases: ["C口座", "Ｃ口座"], flowHint: "saving" },
];

function findBestMasterForPayroll(link) {
  let best = null;
  const profile = typeof payrollActiveProfile === "function" ? payrollActiveProfile() : "primary";
  for (const item of enabledItems()) {
    const haystack = normalize(`${item.name || ""} ${item.detail || ""} ${item.category || ""} ${externalAliases(item).join(" ")}`);
    const nameMatch = link.aliases.some((alias) => haystack.includes(normalize(alias)));
    const aliasMatch = externalAliases(item).some((alias) => link.aliases.some((name) => normalize(alias).includes(normalize(name))));
    const payrollLinked = hasIncomeLink(item, link.key, profile);
    const paymentDeducted = normalize(item.payment).includes(normalize("天引")) || normalize(item.payment).includes("蠑");
    const flowMatch = link.flowHint ? item.flow === link.flowHint : ["expense", "saving", "investment"].includes(item.flow);
    const categoryMatch = ["保険", "貯蓄", "投資", "税", "社会", "年金", "菫晞匱", "雋ｯ", "謚戊ｳ", "遞・"].some((word) => haystack.includes(normalize(word)));
    const score = scoreCandidate({ nameMatch, aliasMatch: aliasMatch || payrollLinked, amountNear: false, monthly: true, categoryMatch: categoryMatch || flowMatch || paymentDeducted, personMatch: paymentDeducted, latestMonth: true });
    if (score > (best?.score || 0)) best = { item, score, nameMatch, aliasMatch, payrollLinked, paymentDeducted, flowMatch, categoryMatch };
  }
  return best?.score >= 30 ? best : null;
}

function buildPayrollCandidates() {
  if (typeof payrollRecords !== "function" || typeof payrollValue !== "function") return [];
  const records = payrollRecords();
  const latestRecord = records.at(-1);
  if (!latestRecord) return [];
  const recent = records.slice(-6);
  const profile = typeof payrollActiveProfile === "function" ? payrollActiveProfile() : "primary";
  const profileLabel = typeof payrollProfileLabel === "function" ? payrollProfileLabel(profile) : profile;
  return payrollExpenseLinks
    .map((link) => {
      const latest = Math.abs(payrollValue(latestRecord, link.key));
      if (!latest) return null;
      const values = recent.map((record) => Math.abs(payrollValue(record, link.key))).filter((value) => value > 0);
      const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : latest;
      const match = findBestMasterForPayroll(link);
      const item = match?.item || null;
      const current = item ? Number(item.monthlyAmount || 0) : 0;
      const amountNear = current ? Math.abs(current - latest) <= Math.max(1000, current * 0.08) : false;
      const linked = item ? hasIncomeLink(item, link.key, profile) : false;
      const score = item
        ? scoreCandidate({ nameMatch: match.nameMatch, aliasMatch: match.aliasMatch || linked, amountNear, monthly: true, categoryMatch: match.categoryMatch || match.flowMatch || match.paymentDeducted, personMatch: match.paymentDeducted, latestMonth: true })
        : 35;
      const { diff, rate } = candidateAmountDiff(current, latest);
      return {
        id: `payroll:${link.key}:${item?.id || "unlinked"}`,
        itemId: item?.id || "",
        item,
        targetName: item?.name || `未紐づけ: ${link.label}`,
        current,
        latest,
        average,
        diff,
        rate,
        source: "payroll",
        incomeKey: link.key,
        payrollLabel: link.label,
        profile,
        profileLabel,
        linked,
        ym: latestRecord.ym,
        score,
        confidence: candidateConfidence(score),
        reasons: [
          linked ? "収入管理と連携済み" : "",
          item ? "支出項目名と給与控除項目が近い" : "対応する支出項目が未確定",
          match?.paymentDeducted ? "支払い方法が天引きに近い" : "",
          match?.flowMatch ? "支出/貯蓄区分が近い" : "",
          "収入管理の最新月から取得",
          values.length >= 3 ? "直近平均あり" : "",
        ].filter(Boolean),
        evidence: [
          `給与項目: ${link.label}`,
          `ユーザー: ${profileLabel}`,
          `対象月: ${latestRecord.ym}`,
          `直近平均対象: ${values.length}か月`,
        ],
      };
    })
    .filter(Boolean);
}

function linkGroupExpenseMembers(group) {
  return (group.members || [])
    .filter((member) => member.type === "expense")
    .map((member) => master.find((item) => item.id === member.id))
    .filter(Boolean);
}

function linkGroupIncomeAmount(group) {
  if (typeof payrollRecords !== "function" || typeof payrollValue !== "function") return null;
  const records = payrollRecords();
  const latestRecord = records.at(-1);
  if (!latestRecord) return null;
  const incomeMembers = (group.members || []).filter((member) => member.type === "income");
  if (!incomeMembers.length) return null;
  const total = incomeMembers.reduce((sum, member) => sum + Math.abs(payrollValue(latestRecord, member.key)), 0);
  return total ? {
    total,
    ym: latestRecord.ym,
    labels: incomeMembers.map((member) => member.label || member.key),
    evidence: incomeMembers.map((member) => `${member.label || member.key}: ${yen(Math.abs(payrollValue(latestRecord, member.key)))}`),
  } : null;
}

function normalizedExternalMemberKey(member) {
  const source = householdExternalSourceType(member?.source || "moneyforward");
  const key = String(member?.key || "");
  const parts = key.split(":");
  if (parts.length >= 2) return `${source}:${parts.slice(1).join(":")}`;
  return `${source}:${normalize(member?.label || key)}`;
}

function rowMatchesExternalMember(row, member) {
  if (householdExternalSourceType(row) !== householdExternalSourceType(member.source)) return false;
  const content = normalize(row.content || "");
  if (member.matchRule === "normalized-name" && member.key) return `${householdExternalSourceType(member.source)}:${content}` === normalizedExternalMemberKey(member);
  if (member.matchRule === "contains") return content.includes(normalize(member.key || member.label || ""));
  return externalKey(row) === member.key || content === normalize(member.label || "");
}

function linkGroupExternalAmount(group) {
  const externalMembers = (group.members || []).filter((member) => member.type === "external");
  if (!externalMembers.length) return null;
  const matched = importedRows.filter((row) => externalMembers.some((member) => rowMatchesExternalMember(row, member)));
  if (!matched.length) return null;
  const latestMonth = [...new Set(matched.map(householdExternalMonth).filter(Boolean))].sort().at(-1) || "";
  const latestRows = matched.filter((row) => !latestMonth || householdExternalMonth(row) === latestMonth);
  const total = latestRows.reduce((sum, row) => sum + externalAmount(row), 0);
  return total ? {
    total,
    ym: latestMonth,
    labels: externalMembers.map((member) => member.label || member.key),
    evidence: [
      `対象明細: ${latestRows.length}件`,
      ...externalMembers.map((member) => `${candidateSourceLabel(member.source)}: ${member.label || member.key}`),
    ],
  } : null;
}

function buildLinkGroupCandidates() {
  const candidates = [];
  (linkGroups || []).forEach((group) => {
    const expenseItems = linkGroupExpenseMembers(group);
    if (!expenseItems.length) return;
    const ambiguous = expenseItems.length !== 1;
    const sources = [
      { key: "income", source: "link-income", sourceName: "収入管理", data: linkGroupIncomeAmount(group) },
      { key: "external", source: "link-external", sourceName: "外部データ", data: linkGroupExternalAmount(group) },
    ];
    sources.forEach((source) => {
      if (!source.data) return;
      expenseItems.forEach((item) => {
        const current = Number(item.monthlyAmount || 0);
        const latest = source.data.total;
        const { diff, rate } = candidateAmountDiff(current, latest);
        if (!diff) return;
        const score = ambiguous ? 45 : 90;
        candidates.push({
          id: `link:${group.id}:${source.key}:${item.id}`,
          itemId: item.id,
          item: ambiguous ? null : item,
          targetName: ambiguous ? `${group.name || "紐づけグループ"}（複数支出）` : item.name || "支出項目",
          current,
          latest,
          average: latest,
          diff,
          rate,
          source: source.source,
          sourceName: source.sourceName,
          ym: source.data.ym || "",
          score,
          confidence: candidateConfidence(score),
          linkGroupId: group.id,
          linkGroupName: group.name || "",
          reasons: [
            `紐づけグループ: ${group.name || "名称未設定"}`,
            ambiguous ? "支出項目が複数あるため反映対象の確認が必要" : "",
            `${source.sourceName}側の合算値と差額あり`,
          ].filter(Boolean),
          evidence: source.data.evidence || [],
        });
      });
    });
  });
  return candidates;
}

function buildUpdateCandidates() {
  const byIdMap = new Map();
  [...buildStoredExternalCandidates(), ...buildImportedExternalCandidates(), ...buildPayrollCandidates(), ...buildLinkGroupCandidates()].forEach((candidate) => {
    if (!byIdMap.has(candidate.id)) byIdMap.set(candidate.id, candidate);
  });
  return [...byIdMap.values()].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || b.score - a.score);
}

function filteredUpdateCandidates() {
  return buildUpdateCandidates().filter((candidate) => {
    const status = candidateDisplayStatus(candidate);
    if (candidateFilters.source !== "all" && candidate.source !== candidateFilters.source) return false;
    if (candidateFilters.confidence !== "all" && candidate.confidence.key !== candidateFilters.confidence) return false;
    if (candidateFilters.status !== "all" && status !== candidateFilters.status) return false;
    if (candidateFilters.changedOnly && !candidate.diff) return false;
    return true;
  });
}

function renderCandidateCard(candidate) {
  const status = candidateDisplayStatus(candidate);
  const canApply = status !== "reflected" && !!candidateTargetItem(candidate) && Number.isFinite(Number(candidate.latest));
  const isIncome = candidate.source === "payroll";
  const isLink = String(candidate.source || "").startsWith("link-");
  return `
    <article class="update-candidate-card">
      <div class="candidate-card-head">
        <div>
          <span class="candidate-source">${esc(candidateSourceLabel(candidate.source))}</span>
          <h4>${esc(candidate.targetName)}</h4>
          <p>${esc(candidate.item?.detail || "支出項目との対応を確認してください。")}</p>
        </div>
        <div class="candidate-status-stack">
          <span class="confidence-badge ${candidate.confidence.key}">信頼度 ${candidate.confidence.label} ${Math.round(candidate.score)}%</span>
          <span class="status-pill ${candidateStatusClass(status)}">${candidateStatusLabel(status)}</span>
        </div>
      </div>
      <div class="candidate-metrics">
        <div><span>現在の登録額</span><strong>${yen(candidate.current)}</strong></div>
        <div><span>最新値</span><strong>${yen(candidate.latest)}</strong></div>
        <div><span>直近平均</span><strong>${candidate.average ? yen(candidate.average) : "-"}</strong></div>
        <div><span>差額</span><strong>${candidate.diff > 0 ? "+" : ""}${yen(candidate.diff)}</strong></div>
        <div><span>差額率</span><strong>${candidate.rate > 0 ? "+" : ""}${percent(candidate.rate)}</strong></div>
        <div><span>対象年月</span><strong>${esc(candidate.ym || "-")}</strong></div>
        ${isIncome ? `<div><span>支払者 / ユーザー</span><strong>${esc(candidate.item?.person || "-")} / ${esc(candidate.profileLabel || "-")}</strong></div><div><span>給与項目名</span><strong>${esc(candidate.payrollLabel || "-")}</strong></div>` : ""}
      </div>
      ${isIncome ? `<p class="income-link-note">この項目は給与天引き項目です。世帯収入の定義によっては二重計上に注意してください。</p>` : ""}
      ${isLink ? `<p class="income-link-note">紐づけ管理から検出した候補です。収入データ・外部データは更新せず、確認後に支出項目の費用だけを更新します。</p>` : ""}
      <details class="candidate-evidence">
        <summary>根拠を確認</summary>
        <ul>
          ${[...candidate.reasons, ...candidate.evidence].map((line) => `<li>${esc(line)}</li>`).join("")}
        </ul>
      </details>
      <div class="candidate-actions">
        ${
          isIncome
            ? `<button type="button" data-candidate-action="amount" data-candidate-apply="${encodeURIComponent(candidate.id)}" ${canApply ? "" : "disabled"}>${status === "reflected" ? "反映済み" : "金額だけ反映"}</button>
               <button type="button" data-candidate-action="link" data-candidate-apply="${encodeURIComponent(candidate.id)}" ${canApply ? "" : "disabled"}>収入管理と紐づけ</button>
               <button type="button" data-candidate-action="both" data-candidate-apply="${encodeURIComponent(candidate.id)}" ${canApply ? "" : "disabled"}>反映して紐づけ</button>`
            : `<button type="button" data-candidate-action="amount" data-candidate-apply="${encodeURIComponent(candidate.id)}" ${canApply ? "" : "disabled"}>${status === "reflected" ? "反映済み" : "支出項目を更新する"}</button>`
        }
        <button type="button" data-candidate-status="${encodeURIComponent(candidate.id)}" data-status-value="hold">保留</button>
        <button type="button" data-candidate-status="${encodeURIComponent(candidate.id)}" data-status-value="ignored">無視</button>
      </div>
    </article>
  `;
}

function renderUpdateCandidates() {
  const panel = byId("panel-candidates");
  if (!panel) return;
  const candidates = filteredUpdateCandidates();
  panel.innerHTML = `
    <article class="panel">
      <div class="candidate-filters">
        <label>データ元
          <select id="candidateSourceFilter">
            <option value="all" ${candidateFilters.source === "all" ? "selected" : ""}>すべて</option>
            <option value="moneyforward" ${candidateFilters.source === "moneyforward" ? "selected" : ""}>MoneyForward</option>
            <option value="rakuten" ${candidateFilters.source === "rakuten" ? "selected" : ""}>楽天カード</option>
            <option value="payroll" ${candidateFilters.source === "payroll" ? "selected" : ""}>収入管理</option>
            <option value="link-income" ${candidateFilters.source === "link-income" ? "selected" : ""}>紐づけ: 収入</option>
            <option value="link-external" ${candidateFilters.source === "link-external" ? "selected" : ""}>紐づけ: 外部</option>
          </select>
        </label>
        <label>信頼度
          <select id="candidateConfidenceFilter">
            <option value="all" ${candidateFilters.confidence === "all" ? "selected" : ""}>すべて</option>
            <option value="high" ${candidateFilters.confidence === "high" ? "selected" : ""}>高</option>
            <option value="medium" ${candidateFilters.confidence === "medium" ? "selected" : ""}>中</option>
            <option value="low" ${candidateFilters.confidence === "low" ? "selected" : ""}>低</option>
          </select>
        </label>
        <label>状態
          <select id="candidateStatusFilter">
            <option value="all" ${candidateFilters.status === "all" ? "selected" : ""}>すべて</option>
            <option value="pending" ${candidateFilters.status === "pending" ? "selected" : ""}>未確認</option>
            <option value="hold" ${candidateFilters.status === "hold" ? "selected" : ""}>保留</option>
            <option value="ignored" ${candidateFilters.status === "ignored" ? "selected" : ""}>無視</option>
            <option value="reflected" ${candidateFilters.status === "reflected" ? "selected" : ""}>反映済み</option>
            <option value="linked" ${candidateFilters.status === "linked" ? "selected" : ""}>連携済み</option>
          </select>
        </label>
        <label class="inline-check"><input id="candidateChangedOnly" type="checkbox" ${candidateFilters.changedOnly ? "checked" : ""} /> 差額あり</label>
        <span class="muted-text">${candidates.length}件</span>
      </div>
      <div class="update-candidate-list">
        ${candidates.length ? candidates.map(renderCandidateCard).join("") : '<div class="empty-state">条件に合う更新候補はありません。</div>'}
      </div>
    </article>
  `;
}

function updateCandidateFilters(event) {
  const target = event.target;
  if (target.id === "candidateSourceFilter") candidateFilters.source = target.value;
  if (target.id === "candidateConfidenceFilter") candidateFilters.confidence = target.value;
  if (target.id === "candidateStatusFilter") candidateFilters.status = target.value;
  if (target.id === "candidateChangedOnly") candidateFilters.changedOnly = target.checked;
  renderUpdateCandidates();
}

function handleCandidateActionClick(event) {
  const apply = event.target.closest("[data-candidate-apply]");
  if (apply) {
    openCandidateApplyModal(decodeURIComponent(apply.dataset.candidateApply), apply.dataset.candidateAction || "amount");
    return true;
  }
  const button = event.target.closest("[data-candidate-status]");
  if (button) {
    updateCandidateStatus(decodeURIComponent(button.dataset.candidateStatus), button.dataset.statusValue);
    return true;
  }
  return false;
}

function updateCandidateStatus(id, status) {
  const labels = { hold: "保留", ignored: "無視" };
  if ((status === "hold" || status === "ignored") && !window.confirm(`この更新候補を「${labels[status]}」にしますか？`)) return;
  candidateStatus[id] = { status, at: new Date().toISOString() };
  saveCandidateStatus();
  invalidateMaintenanceCandidateCache();
  renderMaster();
  renderExpenseAnalysis();
  renderExpenseSummary();
}

function findUpdateCandidate(id) {
  return buildUpdateCandidates().find((candidate) => candidate.id === id) || null;
}

function candidateEvidenceText(candidate) {
  return [...(candidate.reasons || []), ...(candidate.evidence || [])].filter(Boolean).join(" / ");
}

function ensureCandidateApplyModal() {
  let modal = byId("candidateApplyModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "candidateApplyModal";
  modal.className = "modal hidden";
  modal.innerHTML = `
    <div class="modal-card candidate-apply-modal">
      <div class="modal-head">
        <h3>更新候補を反映しますか</h3>
        <button id="closeCandidateApply" type="button">×</button>
      </div>
      <div id="candidateApplyBody"></div>
      <div class="modal-actions">
        <button id="confirmCandidateApply" type="button">反映する</button>
        <button id="cancelCandidateApply" type="button">キャンセル</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.id === "closeCandidateApply" || event.target.id === "cancelCandidateApply") closeCandidateApplyModal();
    if (event.target.id === "confirmCandidateApply") applyPendingUpdateCandidate();
  });
  return modal;
}

function candidateActionLabel(action, candidate) {
  if (String(candidate?.source || "").startsWith("link-")) return "支出項目を更新する";
  if (candidate?.source !== "payroll") return "反映する";
  return { amount: "金額だけ反映", link: "収入管理と紐づけ", both: "反映して紐づけ" }[action] || "金額だけ反映";
}

function openCandidateApplyModal(id, action = "amount") {
  const candidate = findUpdateCandidate(id);
  const item = candidate && candidateTargetItem(candidate);
  if (!candidate || !item || candidateDisplayStatus(candidate) === "reflected") return;
  pendingUpdateCandidate = candidate;
  pendingUpdateAction = candidate.source === "payroll" ? action : "amount";
  const modal = ensureCandidateApplyModal();
  byId("candidateApplyBody").innerHTML = `
    <p class="income-link-note">${
      candidate.source === "payroll"
        ? "この項目は給与天引き項目です。世帯収入の定義によっては二重計上に注意してください。"
        : String(candidate.source || "").startsWith("link-")
          ? "紐づけ管理から検出した候補です。収入データ・外部データは変更せず、支出項目の費用だけを更新します。"
          : "確認した候補だけを支出項目へ反映します。"
    }</p>
    <div class="apply-confirm-grid">
      <div><span>対象支出項目</span><strong>${esc(item.name || candidate.targetName)}</strong><small>${esc(item.detail || "")}</small></div>
      <div><span>現在の登録額</span><strong>${yen(candidate.current)}</strong></div>
      <div><span>反映後の金額</span><strong>${pendingUpdateAction === "link" ? "変更なし" : yen(candidate.latest)}</strong></div>
      <div><span>差額</span><strong>${candidate.diff > 0 ? "+" : ""}${yen(candidate.diff)}</strong></div>
      <div><span>データ元</span><strong>${esc(candidateSourceLabel(candidate.source))}</strong></div>
      <div><span>対象年月</span><strong>${esc(candidate.ym || "-")}</strong></div>
      <div><span>信頼度</span><strong>${esc(candidate.confidence.label)} ${Math.round(candidate.score)}%</strong></div>
      ${candidate.linkGroupName ? `<div><span>紐づけグループ</span><strong>${esc(candidate.linkGroupName)}</strong></div>` : ""}
      ${candidate.source === "payroll" ? `<div><span>操作</span><strong>${esc(candidateActionLabel(pendingUpdateAction, candidate))}</strong></div><div><span>支払者 / ユーザー</span><strong>${esc(item.person || "-")} / ${esc(candidate.profileLabel || "-")}</strong></div><div><span>給与項目名</span><strong>${esc(candidate.payrollLabel || "-")}</strong></div>` : ""}
    </div>
    <details class="candidate-evidence" open>
      <summary>根拠</summary>
      <ul>${[...(candidate.reasons || []), ...(candidate.evidence || [])].map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
    </details>
  `;
  byId("confirmCandidateApply").textContent = candidateActionLabel(pendingUpdateAction, candidate);
  modal.classList.remove("hidden");
}

function closeCandidateApplyModal() {
  pendingUpdateCandidate = null;
  pendingUpdateAction = "amount";
  byId("candidateApplyModal")?.classList.add("hidden");
}

function applyPendingUpdateCandidate() {
  const candidate = pendingUpdateCandidate;
  const action = pendingUpdateAction || "amount";
  const item = candidate && candidateTargetItem(candidate);
  if (!candidate || !item) return;
  const from = Number(item.monthlyAmount || 0);
  const to = Number(candidate.latest || 0);
  const shouldUpdateAmount = action === "amount" || action === "both" || candidate.source !== "payroll";
  const shouldLinkIncome = candidate.source === "payroll" && (action === "link" || action === "both");
  try {
    createHouseholdSnapshot("before-candidate-apply", {
      candidateId: candidate.id,
      itemId: item.id,
      from,
      to,
      action,
      sourceType: candidate.source === "payroll" ? "income" : "external",
      sourceName: candidateSourceLabel(candidate.source),
      sourceYm: candidate.ym || "",
    });
  } catch (error) {
    if (typeof showToast === "function") showToast(`反映前退避に失敗したため、更新しませんでした: ${String(error.message || error)}`, "warn");
    return;
  }
  if (shouldUpdateAmount) item.monthlyAmount = to;
  item.status = "normal";
  if (shouldUpdateAmount) {
    item.amountHistory ||= [];
    item.amountHistory.push({
      date: new Date().toISOString().slice(0, 10),
      changedAt: new Date().toISOString(),
      from,
      to,
      reason: "更新候補を反映",
      sourceType: candidate.source === "payroll" || candidate.source === "link-income" ? "income" : "external",
      sourceName: candidateSourceLabel(candidate.source),
      sourceYm: candidate.ym || "",
      linkGroupId: candidate.linkGroupId || "",
      linkGroupName: candidate.linkGroupName || "",
      evidence: candidateEvidenceText(candidate),
      confidence: { score: candidate.score, label: candidate.confidence.label },
      memo: candidate.linkGroupId ? `紐づけ管理により、${candidateSourceLabel(candidate.source)} ${candidate.ym || ""} を根拠に更新` : candidate.source === "payroll" ? `収入管理候補から${candidateActionLabel(action, candidate)}` : "更新候補タブからユーザー確認後に反映",
    });
    if (item.frequency === "yearly" && item.updateMonth) saveVersionForItem(item);
  }
  if (shouldLinkIncome) {
    item.incomeLinks ||= [];
    const profile = candidate.profile || (typeof payrollActiveProfile === "function" ? payrollActiveProfile() : "primary");
    const existing = item.incomeLinks.find((link) => link.key === candidate.incomeKey && link.profile === profile);
    const linkPayload = {
      key: candidate.incomeKey,
      label: candidate.payrollLabel,
      profile,
      lastLinkedYm: candidate.ym || "",
      linkedAt: new Date().toISOString(),
    };
    if (existing) Object.assign(existing, linkPayload);
    else item.incomeLinks.push(linkPayload);
  }
  candidateStatus[candidate.id] = {
    status: shouldUpdateAmount ? "reflected" : "linked",
    at: new Date().toISOString(),
    itemId: item.id,
    from,
    to: shouldUpdateAmount ? to : from,
    action,
    sourceType: candidate.source === "payroll" || candidate.source === "link-income" ? "income" : "external",
    sourceName: candidateSourceLabel(candidate.source),
    sourceYm: candidate.ym || "",
    linkGroupId: candidate.linkGroupId || "",
    linkGroupName: candidate.linkGroupName || "",
    incomeKey: candidate.incomeKey || "",
  };
  selectedId = item.id;
  saveMaster();
  saveCandidateStatus();
  invalidateMaintenanceCandidateCache();
  closeCandidateApplyModal();
  renderMaster();
  renderExpenseAnalysis();
  renderHeader();
  if (typeof showToast === "function") {
    const message = shouldUpdateAmount
      ? `${item.name || candidate.targetName}を ${yen(from)} → ${yen(to)} に更新しました。`
      : `${item.name || candidate.targetName}を収入管理と紐づけました。`;
    showToast(message, "ok");
  }
}

function sumBy(items, keyFn, valueFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item) || "未設定";
    map.set(key, (map.get(key) || 0) + Number(valueFn(item) || 0));
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function compactTopRows(rows, limit = 6) {
  return rows.slice(0, limit).map(([label, value]) => `<tr><th>${esc(label)}</th><td class="amount">${yen(value)}</td></tr>`).join("");
}

function itemExternalMatchScore(item, row) {
  const rowName = normalize(row.content || "");
  const aliases = externalAliases(item).map(normalize);
  const itemName = normalize(`${item.name || ""} ${item.detail || ""}`);
  let score = 0;
  if (aliases.some((alias) => alias && rowName.includes(alias))) score += 60;
  if (itemName && (rowName.includes(itemName.slice(0, 8)) || itemName.includes(rowName.slice(0, 8)))) score += 30;
  if (normalize(item.category || "") && normalize(row.major || row.category || "").includes(normalize(item.category).slice(0, 4))) score += 10;
  return score;
}

function latestImportMonth() {
  return [...new Set(importedRows.map(rowMonthValue).filter(Boolean))].sort().at(-1) || "";
}

function actualAmountForItem(item, month = latestImportMonth()) {
  const rows = importedRows.filter((row) => (!month || rowMonthValue(row) === month) && itemExternalMatchScore(item, row) >= 50);
  return rows.reduce((sum, row) => sum + externalAmount(row), 0);
}

function designActualComparisons() {
  const month = latestImportMonth();
  return enabledItems()
    .map((item) => {
      const design = Number(item.monthlyAmount || 0);
      const actual = actualAmountForItem(item, month);
      const diff = actual - design;
      const diffRate = design ? diff / design : actual ? 1 : 0;
      const judgment = !actual ? "実績なし" : Math.abs(diffRate) <= 0.1 ? "想定内" : Math.abs(diffRate) <= 0.3 ? "要確認" : "大幅乖離";
      return { item, month, design, actual, diff, diffRate, judgment };
    })
    .filter((row) => row.actual > 0 || externalAliases(row.item).length)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

function monthlyActualTrend() {
  return sumBy(
    importedRows.filter((row) => row.sourceType === "moneyforward" || row.sourceType === "rakuten"),
    rowMonthValue,
    externalAmount,
  )
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .slice(-12);
}

function reviewScore(item, comparison) {
  const amount = Number(item.monthlyAmount || 0);
  const reasons = [];
  let score = 0;
  if (amount >= monthlyIncome() * 0.08) {
    score += 30;
    reasons.push("月額が大きい");
  }
  if (item.nature === "variable" && amount >= monthlyIncome() * 0.03) {
    score += 25;
    reasons.push("変動費が大きい");
  }
  if (item.reducible) {
    score += 20;
    reasons.push("削減可能");
  }
  if (!item.updateMonth) {
    score += 15;
    reasons.push("更新月未設定");
  }
  if (comparison && Math.abs(comparison.diffRate) > 0.2) {
    score += 25;
    reasons.push("外部実績と乖離");
  }
  if (!item.amountHistory?.length && !item.versions?.length) {
    score += 10;
    reasons.push("長期間レビューなし");
  }
  if (expenseAttentionReasons(item).some((reason) => /詳細|情報/.test(reason))) {
    score += 10;
    reasons.push("メモ・詳細不足");
  }
  return { score, reasons };
}

function reviewTopItems() {
  const comparisons = new Map(designActualComparisons().map((row) => [row.item.id, row]));
  return enabledItems()
    .map((item) => ({ item, comparison: comparisons.get(item.id), ...reviewScore(item, comparisons.get(item.id)) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.item.monthlyAmount || 0) - Number(a.item.monthlyAmount || 0))
    .slice(0, 5);
}

function analysisTable(title, rows) {
  return `
    <section class="analysis-card">
      <h4>${esc(title)}</h4>
      <table class="analysis-mini-table"><tbody>${rows || '<tr><td>データがありません。</td></tr>'}</tbody></table>
    </section>
  `;
}

function trendBars(rows) {
  const max = Math.max(...rows.map(([, value]) => value), 1);
  return rows.length
    ? rows
        .map(
          ([month, value]) => `
            <div class="expense-trend-row">
              <span>${esc(month)}</span>
              <div class="expense-ratio-track"><i style="width:${Math.max(3, (value / max) * 100).toFixed(1)}%"></i></div>
              <strong>${yen(value)}</strong>
            </div>
          `,
        )
        .join("")
    : '<p class="muted-text">外部実績がありません。</p>';
}

function renderExpenseAnalysis() {
  const panel = byId("panel-expense-analysis");
  if (!panel) return;
  const items = enabledItems();
  const expenseItems = items.filter((item) => item.flow === "expense");
  const metrics = expenseSummaryMetrics();
  const comparisons = designActualComparisons();
  const reviewItems = reviewTopItems();
  const bigGapCount = comparisons.filter((row) => row.judgment === "大幅乖離").length;
  const essentialTotal = expenseItems.filter((item) => item.essential).reduce((sum, item) => sum + Number(item.monthlyAmount || 0), 0);
  const optionalTotal = expenseItems.filter((item) => !item.essential).reduce((sum, item) => sum + Number(item.monthlyAmount || 0), 0);
  const reducibleTotal = expenseItems.filter((item) => item.reducible).reduce((sum, item) => sum + Number(item.monthlyAmount || 0), 0);
  panel.innerHTML = `
    <article class="panel expense-analysis-panel">
      <div class="analysis-summary">
        <div><span>支出合計</span><b>${yen(metrics.expense)}</b><small>有効な支出項目</small></div>
        <div><span>必須支出</span><b>${yen(essentialTotal)}</b><small>${percent(metrics.expense ? essentialTotal / metrics.expense : 0)}</small></div>
        <div><span>任意支出</span><b>${yen(optionalTotal)}</b><small>${percent(metrics.expense ? optionalTotal / metrics.expense : 0)}</small></div>
        <div><span>削減可能額</span><b>${yen(reducibleTotal)}</b><small>見直し余地あり</small></div>
        <div><span>固定費率</span><b>${percent(metrics.fixedRatio)}</b><small>世帯収入比</small></div>
        <div><span>判定</span><b>${esc(metrics.health)}</b><small>${bigGapCount ? `大幅乖離 ${bigGapCount}件` : "設計値ベース"}</small></div>
      </div>
      <section class="analysis-card analysis-card-wide">
        <div class="analysis-card-head">
          <h4>見直し候補 Top5</h4>
          <button type="button" data-analysis-tab="master">入力で確認</button>
        </div>
        <div class="review-top-list">
          ${
            reviewItems.length
              ? reviewItems
                  .map(
                    (row, index) => `
                      <div class="review-top-item">
                        <strong>${index + 1}. ${esc(row.item.name || "名称未設定")}</strong>
                        <span>${yen(row.item.monthlyAmount)} / ${esc([...row.reasons, ...itemMaintenanceCandidates(row.item).map(() => "更新候補あり")].join("・"))}</span>
                        <button type="button" data-analysis-item="${encodeURIComponent(row.item.id)}">支出設計で確認</button>
                      </div>
                    `,
                  )
                  .join("")
              : '<div class="empty-state">優先的に見直す候補はありません。</div>'
          }
        </div>
      </section>
      <div class="analysis-grid expense-analysis-grid">
        ${analysisTable("カテゴリ別支出", compactTopRows(sumBy(expenseItems, (item) => item.category, (item) => item.monthlyAmount)))}
        ${analysisTable("支払者別支出", compactTopRows(sumBy(expenseItems, (item) => item.person, (item) => item.monthlyAmount)))}
        ${analysisTable("固定費 / 変動費", compactTopRows(sumBy(expenseItems, (item) => displayValue("nature", item.nature), (item) => item.monthlyAmount)))}
        ${analysisTable("支出 / 貯蓄 / 投資", compactTopRows(sumBy(items, (item) => displayValue("flow", item.flow), (item) => item.monthlyAmount)))}
      </div>
      <section class="analysis-card analysis-card-wide">
        <div class="analysis-card-head">
          <h4>設計値と外部実績の比較</h4>
          <button type="button" data-analysis-tab="import">外部データを見る</button>
        </div>
        <div class="table-wrap">
          <table class="analysis-compare-table">
            <thead><tr><th>項目</th><th>対象月</th><th>設計額</th><th>実績額</th><th>差額</th><th>差額率</th><th>判定</th><th></th></tr></thead>
            <tbody>
              ${
                comparisons.slice(0, 12).map((row) => `
                  <tr>
                    <td>${esc(row.item.name || "名称未設定")}</td>
                    <td>${esc(row.month || "-")}</td>
                    <td class="amount">${yen(row.design)}</td>
                    <td class="amount">${yen(row.actual)}</td>
                    <td class="amount">${row.diff > 0 ? "+" : ""}${yen(row.diff)}</td>
                    <td class="amount">${row.diffRate > 0 ? "+" : ""}${percent(row.diffRate)}</td>
                    <td><span class="status-pill ${row.judgment === "大幅乖離" ? "danger" : row.judgment === "要確認" ? "attention" : "reflected"}">${esc(row.judgment)}</span></td>
                    <td><button class="subtle-button" type="button" data-analysis-item="${encodeURIComponent(row.item.id)}">確認</button></td>
                  </tr>
                `).join("") || '<tr><td colspan="8">比較できる外部実績がありません。</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </section>
      <section class="analysis-card analysis-card-wide">
        <h4>月次推移</h4>
        <div class="expense-trend-chart">${trendBars(monthlyActualTrend())}</div>
      </section>
    </article>
  `;
}

function openAnalysisItem(id) {
  const item = master.find((entry) => entry.id === id);
  if (!item) return;
  selectedExpensePerson = item.person || "all";
  selectedId = item.id;
  switchTabTo("master");
  renderMaster();
}

function historyDate(history) {
  return history?.changedAt || history?.date || history?.at || "";
}

function historySource(history) {
  if (history?.sourceType === "income") return "収入";
  if (history?.sourceType === "external") return history.sourceName || "外部";
  return history?.reason || "手動";
}

function amountHistoryRows() {
  return master
    .flatMap((item) =>
      (item.amountHistory || []).map((history) => ({
        item,
        history,
        at: historyDate(history),
      })),
    )
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadText(text, fileName, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function exportExpenseItemsCsv() {
  const headers = ["内容", "詳細", "種別", "支払者", "支払方法", "固定/変動", "区分", "費用", "年換算", "支払い時期", "支払い月", "隔月", "更新月", "必要性", "見直し余地", "状態", "有効", "メモ"];
  const rows = master.map((item) => [
    item.name,
    item.detail,
    item.category,
    item.person,
    item.payment,
    displayValue("nature", item.nature),
    displayValue("flow", item.flow),
    Number(item.monthlyAmount || 0),
    annualizedCost(item),
    displayValue("frequency", item.frequency),
    (item.paymentMonths || []).join("/"),
    item.bimonthlyPattern === "odd" ? "奇数月" : "偶数月",
    item.updateMonth,
    item.essential ? "必須" : "任意",
    item.reducible ? "削減可能" : "削減困難",
    displayValue("status", item.status),
    item.enabled === false ? "無効" : "有効",
    item.note,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  downloadText(`\uFEFF${csv}`, `支出項目-${date}.csv`);
  if (typeof showToast === "function") showToast("支出項目CSVを出力しました。", "ok");
}

function renderExpenseData() {
  const panel = byId("panel-expense-data");
  if (!panel) return;
  const rows = master.slice().sort((a, b) => String(a.category || "").localeCompare(String(b.category || ""), "ja") || String(a.name || "").localeCompare(String(b.name || ""), "ja"));
  const histories = amountHistoryRows();
  panel.innerHTML = `
    <article class="panel expense-data-panel">
      <div class="expense-data-actions">
        <button id="exportExpenseCsv" type="button">CSV出力</button>
      </div>
      <section class="analysis-card analysis-card-wide">
        <div class="analysis-card-head">
          <h4>支出項目一覧</h4>
          <span class="muted-text">${rows.length}件</span>
        </div>
        <div class="expense-data-list">
          ${rows
            .map(
              (item) => `
                <button class="expense-data-row" type="button" data-expense-data-item="${encodeURIComponent(item.id)}">
                  <span><b>${esc(item.name || "名称未設定")}</b><small>${esc(item.category || "未分類")} / ${esc(item.detail || "")}</small></span>
                  ${costText(item)}
                  <em>${item.enabled === false ? "無効" : item.essential ? "必須" : "任意"}</em>
                </button>
              `,
            )
            .join("")}
        </div>
      </section>
      <details class="analysis-card analysis-card-wide expense-history-box" open>
        <summary>
          <span>更新履歴</span>
          <small>${histories.length}件</small>
        </summary>
        <div class="table-wrap">
          <table class="analysis-compare-table">
            <thead><tr><th>変更日時</th><th>項目</th><th>変更前</th><th>変更後</th><th>変更元</th><th>根拠</th></tr></thead>
            <tbody>
              ${
                histories.length
                  ? histories
                      .map(
                        ({ item, history }) => `
                          <tr>
                            <td>${esc(historyDate(history).slice(0, 16).replace("T", " ") || "-")}</td>
                            <td>${esc(item.name || "名称未設定")}</td>
                            <td class="amount">${yen(history.from)}</td>
                            <td class="amount">${yen(history.to)}</td>
                            <td>${esc(historySource(history))}</td>
                            <td>${esc(history.evidence || history.memo || history.reason || "-")}</td>
                          </tr>
                        `,
                      )
                      .join("")
                  : '<tr><td colspan="6">更新履歴はまだありません。</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </details>
    </article>
  `;
}


function parkDetailPanelBeforeMasterRender() {
  const panel = byId("detailPanel");
  const layout = document.querySelector(".master-layout");
  if (panel && layout && panel.closest("#masterCards")) layout.appendChild(panel);
}

function renderMaster() {
  invalidateMaintenanceCandidateCache();
  renderExpensePersonSelect();
  const rows = filteredSortedRows();
  const mobileExpenseLayout = isMobileExpenseLayout();
  if (mobileExpenseLayout && !mobileDetailExplicitlyOpened) selectedId = null;
  else if (!rows.some((item) => item.id === selectedId)) selectedId = mobileExpenseLayout ? null : rows[0]?.id || null;
  if (byId("masterCount")) byId("masterCount").textContent = `${rows.length}件表示`;
  renderMaintenanceNotice();
  renderPendingApplyPanel();
  renderColumnFilters();
  parkDetailPanelBeforeMasterRender();
  const useCardView = window.matchMedia("(max-width: 768px)").matches;
  const effectiveViewMode = useCardView ? "cards" : masterViewMode;
  document.querySelectorAll("[data-master-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.masterView === effectiveViewMode);
    button.setAttribute("aria-pressed", button.dataset.masterView === effectiveViewMode ? "true" : "false");
    button.disabled = useCardView && button.dataset.masterView === "list";
  });
  byId("masterCards")?.classList.toggle("hidden", effectiveViewMode !== "cards");
  byId("masterList")?.classList.toggle("hidden", effectiveViewMode !== "list");
  if (byId("masterCards")) byId("masterCards").innerHTML = effectiveViewMode === "cards" ? renderMasterCards(rows) : "";
  if (byId("masterRows")) byId("masterRows").innerHTML = effectiveViewMode === "list" ? rows.map(renderMasterRow).join("") : "";
  renderDetailPanel();
  positionDetailPanel();
}

function renderMasterCards(rows) {
  const groups = new Map();
  rows.forEach((item) => {
    const key = item.category || "未分類";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  if (!groups.size) return `<div class="empty-state">表示できる支出項目がありません。</div>`;
  return [...groups.entries()]
    .map(([category, items]) => {
      const total = items.reduce((sum, item) => sum + Number(item.monthlyAmount || 0), 0);
      return `
        <article class="expense-category-card">
          <div class="expense-category-head">
            <h4>${esc(category)}</h4>
            <span>${items.length}件 / ${yen(total)}</span>
          </div>
          <div class="expense-card-items">
            ${items.map(renderMasterCardItem).join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderMasterCardItem(item) {
  const selected = item.id === selectedId ? "selected" : "";
  const incomeFlag = incomeLinks(item).length ? '<span class="mini-badge">収入連携済み</span>' : "";
  const aliasFlag = externalAliases(item).length ? '<span class="mini-badge">外部別名</span>' : "";
  const essentialFlag = `<span class="mini-badge ${item.essential ? "essential" : "optional"}">${item.essential ? "必須" : "任意"}</span>`;
  const reducibleFlag = `<span class="mini-badge ${item.reducible ? "reducible" : "hard-reduce"}">${item.reducible ? "見直し可" : "削減困難"}</span>`;
  const candidateFlag = itemMaintenanceCandidates(item).length ? '<span class="mini-badge maintenance-chip" title="更新候補あり" aria-label="更新候補あり">更新</span>' : "";
  return `
    <button class="expense-card-row ${selected}" type="button" data-select-id="${esc(item.id)}">
      <span>
        <strong>${esc(item.name || "名称未設定")}</strong>
        <small>${esc(item.detail || item.person || "")}</small>
      </span>
      <span class="expense-card-meta">
        ${costText(item)}
        ${candidateFlag}${essentialFlag}${reducibleFlag}
        ${incomeFlag}${aliasFlag}
      </span>
    </button>
  `;
}

function filteredSortedRows() {
  const filter = byId("masterFilter").value;
  const query = byId("masterSearch").value.trim().toLowerCase();
  let rows = master;
  const person = activeExpensePerson();
  if (person !== "all") rows = rows.filter((item) => item.person === person);
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
  const incomeFlag = incomeLinks(item).length ? '<span class="alias-flag income-link-flag" title="収入管理と紐づいています">収入連携済み</span>' : "";
  const judgmentFlags = `<span class="mini-badge ${item.essential ? "essential" : "optional"}">${item.essential ? "必須" : "任意"}</span><span class="mini-badge ${item.reducible ? "reducible" : "hard-reduce"}">${item.reducible ? "見直し可" : "削減困難"}</span>`;
  const candidateFlag = itemMaintenanceCandidates(item).length ? '<span class="alias-flag candidate-flag" title="更新候補あり" aria-label="更新候補あり">更新</span>' : "";
  return `
    <tr class="${selected} ${pending || reflected}" data-row-id="${esc(item.id)}">
      <td>${statusPill(rowStatus(item))}</td>
      <td><strong>${esc(item.name || "名称未設定")}</strong>${candidateFlag}${aliasFlag}${incomeFlag}<span class="row-badges">${judgmentFlags}</span></td>
      <td>${esc(item.category)}</td>
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

function booleanOptionHtml(selected, trueLabel, falseLabel) {
  return `
    <option value="true" ${selected ? "selected" : ""}>${esc(trueLabel)}</option>
    <option value="false" ${!selected ? "selected" : ""}>${esc(falseLabel)}</option>
  `;
}

function renderPersonField(view, editing, disabled) {
  const person = activeExpensePerson();
  if (person !== "all") {
    if (editing && editDraft) editDraft.person = person;
    return `<label>支払者<input value="${esc(person)}" disabled data-fixed-person="true" /></label>`;
  }
  return `<label>支払者<select data-detail-field="person" ${disabled}>${optionHtml("person", view.person)}</select></label>`;
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

function paymentTimingFields(view, disabled) {
  const months = Array.isArray(view.paymentMonths) ? view.paymentMonths : [];
  return `
    <label class="${view.frequency === "yearly" ? "" : "hidden"}">年払い月<select data-detail-field="updateMonth" ${disabled}><option value="">未設定</option>${monthOptions(view.updateMonth)}</select></label>
    <label class="${view.frequency === "bimonthly" ? "" : "hidden"}">隔月パターン<select data-detail-field="bimonthlyPattern" ${disabled}>
      <option value="even" ${view.bimonthlyPattern === "odd" ? "" : "selected"}>偶数月</option>
      <option value="odd" ${view.bimonthlyPattern === "odd" ? "selected" : ""}>奇数月</option>
    </select></label>
    <label class="${view.frequency === "semiannual" ? "" : "hidden"}">半年払い月1<select data-detail-field="paymentMonth1" ${disabled}>${monthOptions(months[0] || "")}</select></label>
    <label class="${view.frequency === "semiannual" ? "" : "hidden"}">半年払い月2<select data-detail-field="paymentMonth2" ${disabled}>${monthOptions(months[1] || "")}</select></label>
  `;
}

function isMobileExpenseLayout() {
  return window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
}

function selectedItem() {
  return master.find((item) => item.id === selectedId) || (isMobileExpenseLayout() ? null : master[0]);
}

function ensureExpenseDetailBackdrop() {
  let backdrop = byId("expenseDetailBackdrop");
  if (backdrop) return backdrop;
  backdrop = document.createElement("div");
  backdrop.id = "expenseDetailBackdrop";
  backdrop.className = "expense-detail-backdrop hidden";
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.addEventListener("click", closeDetailPanel);
  document.body.appendChild(backdrop);
  return backdrop;
}

function setExpenseDetailModalOpen(open) {
  const backdrop = ensureExpenseDetailBackdrop();
  const panel = byId("detailPanel");
  if (!isMobileExpenseLayout()) {
    document.body.classList.remove("expense-detail-modal-open");
    backdrop.classList.add("hidden");
    panel?.classList.remove("mobile-detail-modal");
    return;
  }
  document.body.classList.toggle("expense-detail-modal-open", open);
  backdrop.classList.toggle("hidden", !open);
  panel?.classList.toggle("mobile-detail-modal", open);
}

function renderDetailPanel() {
  const panel = byId("detailPanel");
  const item = selectedItem();
  if (!item) {
    panel.classList.add("detail-panel-empty");
    panel.classList.toggle("hidden", isMobileExpenseLayout());
    panel.innerHTML = isMobileExpenseLayout()
      ? ""
      : `<p>支出項目がありません。</p>`;
    setExpenseDetailModalOpen(false);
    return;
  }
  panel.classList.remove("detail-panel-empty", "hidden");
  setExpenseDetailModalOpen(isMobileExpenseLayout());
  selectedId = item.id;
  const editing = editingId === item.id;
  if (editing && !editDraft) editDraft = { ...item, externalAliases: externalAliases(item) };
  const view = editing ? editDraft : item;
  const disabled = editing ? "" : "disabled";
  panel.innerHTML = `
    <div class="panel-head detail-head">
      <h3 title="${esc(view.name || "名称未設定")}">${esc(view.name || "名称未設定")}</h3>
      <div class="detail-title-actions">
        ${statusPill(rowStatus(item))}
        ${isMobileExpenseLayout() && !editing ? '<button type="button" id="closeDetailPanel" class="subtle-button detail-close-button">閉じる</button>' : ""}
        ${editing ? "" : '<button type="button" id="toggleRowEdit">編集</button>'}
      </div>
    </div>
    <div class="detail-grid">
      <label class="wide">内容1<input value="${esc(view.name)}" data-detail-field="name" ${disabled} /></label>
      <label class="wide">内容2<input value="${esc(view.detail)}" data-detail-field="detail" ${disabled} /></label>
      ${renderPersonField(view, editing, disabled)}
      <label>種別<select data-detail-field="category" ${disabled}>${optionHtml("category", view.category)}</select></label>
      <label>支払い方法<select data-detail-field="payment" ${disabled}>${optionHtml("payment", view.payment)}</select></label>
      <label>固定/変動<select data-detail-field="nature" ${disabled}>${optionHtml("nature", view.nature)}</select></label>
      <label>フロー<select data-detail-field="flow" ${disabled}>${optionHtml("flow", view.flow)}</select></label>
      <label>必要性<select data-detail-field="essential" ${disabled}>${booleanOptionHtml(view.essential, "必須", "任意")}</select></label>
      <label>見直し余地<select data-detail-field="reducible" ${disabled}>${booleanOptionHtml(view.reducible, "削減可能", "削減困難")}</select></label>
      <label>支払い時期<select data-detail-field="frequency" ${disabled}>${optionHtml("frequency", view.frequency)}</select></label>
      <label>費用<input type="number" min="0" step="100" value="${Number(view.monthlyAmount || 0)}" data-detail-field="monthlyAmount" ${disabled} /></label>
      ${paymentTimingFields(view, disabled)}
      ${renderAliasPicker(view, editing)}
      <label class="wide">メモ<textarea data-detail-field="note" ${disabled}>${esc(view.note)}</textarea></label>
    </div>
    ${editing ? "" : renderDetailMaintenanceCandidates(item)}
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

function positionDetailPanel() {
  const panel = byId("detailPanel");
  if (!panel) return;
  const layout = document.querySelector(".master-layout");
  if (!isMobileExpenseLayout()) {
    setExpenseDetailModalOpen(false);
    layout?.appendChild(panel);
    return;
  }
  if (!selectedId || panel.classList.contains("detail-panel-empty")) return;
  document.body.appendChild(panel);
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
      <span>現在の金額: ${yen(pendingCandidate.excel.amount)} → 候補: ${yen(pendingCandidate.suggestedAmount)}</span>
    </div>
    <button id="applyPendingCandidate" type="button">反映する</button>
    <button id="rejectPendingCandidate" type="button">反映しない</button>
  `;
}


function closeDetailPanel() {
  if (editingId === selectedId && editDraft) {
    if (!window.confirm("編集中の内容を破棄して閉じますか？")) return;
    const item = selectedItem();
    if (item?.draftNew) {
      master = master.filter((entry) => entry.id !== item.id);
      saveMaster();
      loadOptions();
    }
    editingId = null;
    editDraft = null;
  }
  selectedId = null;
  mobileDetailExplicitlyOpened = false;
  renderMaster();
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
  if (isMobileExpenseLayout()) mobileDetailExplicitlyOpened = true;
  renderMaster();
  if (isMobileExpenseLayout()) setExpenseDetailModalOpen(true);
}

function updateDetail(event) {
  const target = event.target;
  const field = target.dataset.detailField;
  if (!field || editingId !== selectedId) return;
  if (field === "monthlyAmount") editDraft[field] = Number(target.value || 0);
  else if (field === "essential" || field === "reducible") editDraft[field] = target.value === "true";
  else if (field === "paymentMonth1" || field === "paymentMonth2") {
    const months = Array.isArray(editDraft.paymentMonths) ? [...editDraft.paymentMonths] : ["", ""];
    months[field === "paymentMonth1" ? 0 : 1] = target.value;
    editDraft.paymentMonths = [...new Set(months.filter(Boolean))].slice(0, 2);
  }
  else editDraft[field] = target.value;
  if (field === "frequency") {
    if (editDraft.frequency !== "yearly") editDraft.updateMonth = "";
    if (editDraft.frequency !== "bimonthly") editDraft.bimonthlyPattern = "even";
    if (editDraft.frequency !== "semiannual") editDraft.paymentMonths = [];
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
    const person = activeExpensePerson();
    if (person !== "all") editDraft.person = person;
  }
  renderMaster();
}

function commitEdit() {
  const index = master.findIndex((item) => item.id === selectedId);
  if (index < 0 || !editDraft) return;
  const oldAmount = Number(master[index].monthlyAmount || 0);
  try {
    createHouseholdSnapshot("before-manual-master-save", { itemId: selectedId, from: oldAmount, to: Number(editDraft.monthlyAmount || 0) });
  } catch (error) {
    if (typeof showToast === "function") showToast(`保存前退避に失敗したため、更新しませんでした: ${String(error.message || error)}`, "warn");
    return;
  }
  editDraft.externalAliases = externalAliases(editDraft);
  editDraft.mfAlias = editDraft.externalAliases.join(", ");
  const person = activeExpensePerson();
  if (person !== "all") editDraft.person = person;
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
  const closeAfterCancel = isMobileExpenseLayout();
  const item = selectedItem();
  if (item?.draftNew) {
    master = master.filter((entry) => entry.id !== item.id);
    selectedId = closeAfterCancel ? null : master[0]?.id || null;
    saveMaster();
    loadOptions();
  }
  editingId = null;
  editDraft = null;
  if (closeAfterCancel) selectedId = null;
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
  try {
    createHouseholdSnapshot("before-master-delete", { itemId: selectedId, itemName: master[index].name || "" });
  } catch (error) {
    if (typeof showToast === "function") showToast(`削除前退避に失敗したため、削除しませんでした: ${String(error.message || error)}`, "warn");
    return;
  }
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
  if (item) {
    selectedExpensePerson = item.person || "all";
    selectedId = item.id;
  }
  switchTabTo("master");
  rerender();
}

function addMasterItem() {
  const id = `manual::${Date.now()}`;
  const person = activeExpensePerson();
  const item = {
    id,
    alignmentId: id,
    source: "manual",
    enabled: true,
    status: "normal",
    person: person !== "all" ? person : optionLists.person[0] || "未設定",
    category: optionLists.category[0] || "未分類",
    payment: optionLists.payment[0] || "未設定",
    name: "",
    detail: "",
    nature: optionLists.nature[0] || "fixed",
    flow: optionLists.flow[0] || "expense",
    essential: true,
    reducible: true,
    frequency: optionLists.frequency[0] || "monthly",
    paymentMonths: [],
    bimonthlyPattern: "even",
    monthlyAmount: 0,
    originalAmount: 0,
    updateMonth: "",
    mfAlias: "",
    externalAliases: [],
    incomeLinks: [],
    note: "",
    amountHistory: [],
    draftNew: true,
  };
  master.unshift(item);
  selectedId = id;
  if (isMobileExpenseLayout()) mobileDetailExplicitlyOpened = true;
  editingId = id;
  editDraft = { ...item, externalAliases: [] };
  saveMaster();
  loadOptions();
  switchTabTo("master");
  rerender();
  if (person === "all" && typeof showToast === "function") showToast("新規項目の支払者を確認してください。", "warn");
}

function bindHouseholdEvents() {
  document.querySelector(".master-table thead").addEventListener("click", updateSort);
  document.querySelector(".master-table thead").addEventListener("change", updateColumnFilter);
  byId("masterRows").addEventListener("click", selectRow);
  byId("masterCards").addEventListener("click", selectRow);
  byId("detailPanel").addEventListener("change", updateDetail);
  byId("detailPanel").addEventListener("input", updateAliasSuggestions);
  byId("detailPanel").addEventListener("focusin", focusAliasSearch);
  byId("detailPanel").addEventListener("click", (event) => {
    if (event.target.closest("#closeDetailPanel")) {
      closeDetailPanel();
      return;
    }
    if (event.target.id === "toggleRowEdit") toggleRowEdit();
    if (event.target.id === "commitEdit") commitEdit();
    if (event.target.id === "cancelEdit") cancelEdit();
    if (event.target.id === "deleteItem") deleteSelectedItem();
    if (event.target.id === "saveVersion") saveVersion();
    if (event.target.id === "toggleHistory") byId("historyPanel")?.classList.toggle("hidden");
    if (handleCandidateActionClick(event)) return;
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
  byId("expensePersonSelect").addEventListener("change", (event) => {
    selectedExpensePerson = event.target.value || "all";
    selectedId = null;
    mobileDetailExplicitlyOpened = false;
    editingId = null;
    editDraft = null;
    renderMaster();
  });
  document.querySelectorAll("[data-master-view]").forEach((button) => {
    button.addEventListener("click", () => {
      masterViewMode = button.dataset.masterView === "list" ? "list" : "cards";
      renderMaster();
    });
  });
  byId("masterFilter").addEventListener("change", renderMaster);
  byId("masterSearch").addEventListener("input", renderMaster);
  byId("exportExpenseCsv")?.addEventListener("click", exportExpenseItemsCsv);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isMobileExpenseLayout() && selectedId) closeDetailPanel();
  });
  byId("resetMaster").addEventListener("click", () => {
    try {
      createHouseholdSnapshot("before-master-reset", {});
    } catch (error) {
      if (typeof showToast === "function") showToast(`初期化前退避に失敗したため、初期化しませんでした: ${String(error.message || error)}`, "warn");
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    selectedId = null;
    editingId = null;
    pendingCandidate = null;
    loadMaster();
    loadOptions();
    rerender();
  });
  byId("panel-candidates")?.addEventListener("change", updateCandidateFilters);
  byId("panel-candidates")?.addEventListener("click", handleCandidateActionClick);
  byId("panel-expense-analysis").addEventListener("click", (event) => {
    const item = event.target.closest("[data-analysis-item]");
    if (item) {
      openAnalysisItem(decodeURIComponent(item.dataset.analysisItem));
      return;
    }
    const tab = event.target.closest("[data-analysis-tab]");
    if (tab) switchTabTo(tab.dataset.analysisTab);
  });
  byId("panel-expense-data").addEventListener("click", (event) => {
    if (event.target.closest("#exportExpenseCsv")) {
      exportExpenseItemsCsv();
      return;
    }
    const item = event.target.closest("[data-expense-data-item]");
    if (item) openAnalysisItem(decodeURIComponent(item.dataset.expenseDataItem));
  });
}



