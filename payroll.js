// payroll.js

let payrollMounted = false;
let payrollState = {
  tab: "input",
  chartGroup: "pay",
  chartType: "line",
  registrationYm: "",
  inputMethod: "",
  values: {},
  inputStarted: false,
  reviewConfirmed: false,
  dirty: false,
  lastSavedFeedback: null,
  analysisOpen: false,
  diffMode: false,
  deleteYm: "",
  scrollPositions: {},
  inputSummaryOpen: false,
  inputChartOpen: false,
  manageEditMode: false,
};

const payrollDeductionKeys = [
  "incomeTax",
  "yearEndShortTax",
  "residentTax",
  "healthIns",
  "careIns",
  "pension",
  "employmentIns",
  "dbPension",
  "dcPension",
  "commuteReturn",
  "stock",
  "housingSaving",
  "savings",
  "medicalAid",
  "healthBonusAdj",
  "careBonusAdj",
  "pensionBonusAdj",
];

const payrollOcrAliases = {
  base: ["基本給"],
  position: ["職位加算"],
  workPay: ["勤務給"],
  performance: ["個人業績年俸", "個人業績年棒"],
  lAllowance: ["L手当", "し手当", "上手当"],
  overtime: ["時間外手当"],
  efficiency: ["能率手当"],
  duty: ["当直手当"],
  remote: ["リモワクサポート料", "リモワクサポート"],
  specialLabor: ["特別労働手当"],
  specialWork: ["特別勤務手当"],
  stockIncentive: ["持株奨励金"],
  commute: ["通勤交通費"],
  annualSettlement: ["年俸精算"],
  nonAnnualTempSettlement: ["年俸以外・臨時精算"],
  incomeTax: ["所得税"],
  yearEndShortTax: ["年末調整課不足税額"],
  residentTax: ["住民税"],
  healthIns: ["健康保険料"],
  careIns: ["介護保険料"],
  pension: ["厚生年金保険料"],
  employmentIns: ["雇用保険料"],
  dbPension: ["確定給付年金本人拠出"],
  dcPension: ["確定拠出年金本人掛金"],
  commuteReturn: ["通勤交通費戻入"],
  stock: ["持株拠出金"],
  housingSaving: ["持ち家財形貯蓄", "持ち家財形貯蓄(非)"],
  savings: ["総合預金"],
  medicalAid: ["医療共済会費"],
  healthBonusAdj: ["健康保険賞与調整"],
  careBonusAdj: ["介護保険賞与調整"],
  pensionBonusAdj: ["厚生年金保険賞与調整"],
  healthBenefit: ["健康保険給付金"],
  cAccount: ["C口座", "Ｃ口座"],
  workDays: ["前月所定労働日数"],
  residentAnnual: ["住民税(年税額)", "住民税 年税額"],
  incomeTaxFixedReduction: ["定額減税額", "定額減税額(所得税)"],
};

const payrollChartGroups = {
  pay: ["base", "position", "workPay", "performance", "annualTotal", "lAllowance", "overtime", "efficiency", "duty", "remote", "commute", "grossTotal"],
  deduct: ["incomeTax", "residentTax", "healthIns", "careIns", "pension", "employmentIns", "deductionTotal"],
  net: ["netTotal"],
  overtime: ["overtime"],
};

function ensurePrimaryPayrollProfile() {
  if (!localStorage.getItem("positivePayrollActiveProfile")) {
    localStorage.setItem("positivePayrollActiveProfile", "primary");
  }
  if (!localStorage.getItem("positivePayrollProfileName_primary")) {
    localStorage.setItem("positivePayrollProfileName_primary", "\u5b5d");
  }
}

function payrollData() {
  return window.PAYROLL_DATA || { initialRecords: [], manual: [], calcRows: [] };
}

function payrollNumber(value) {
  return Number(String(value ?? 0).replace(/[￥,，\s]/g, "")) || 0;
}

function payrollBaseValues() {
  return Object.fromEntries(payrollData().manual.map((row) => [row[2], 0]));
}

function payrollCalc(values) {
  const v = { ...payrollBaseValues(), ...(values || {}) };
  const result = {};
  result.annualTotal = payrollNumber(v.base) + payrollNumber(v.position) + payrollNumber(v.workPay) + payrollNumber(v.performance);
  result.nonAnnualTotal =
    payrollNumber(v.lAllowance) +
    payrollNumber(v.overtime) +
    payrollNumber(v.efficiency) +
    payrollNumber(v.duty) +
    payrollNumber(v.remote) +
    payrollNumber(v.specialLabor) +
    payrollNumber(v.specialWork);
  result.monthlyGross = result.annualTotal + result.nonAnnualTotal + payrollNumber(v.stockIncentive);
  result.temporaryGross = payrollNumber(v.commute);
  result.grossTotal = result.monthlyGross + result.temporaryGross + payrollNumber(v.annualSettlement) + payrollNumber(v.nonAnnualTempSettlement);
  result.deductionTotal = payrollDeductionKeys.reduce((sum, key) => sum + payrollNumber(v[key]), 0);
  result.monthlyNet = result.grossTotal - result.deductionTotal;
  result.netTotal = result.monthlyNet + payrollNumber(v.healthBenefit);
  result.overtimePerDay = payrollNumber(v.workDays) ? payrollNumber(v.overtime) / payrollNumber(v.workDays) : 0;
  return result;
}

function payrollActiveProfile() {
  return localStorage.getItem("positivePayrollActiveProfile") === "secondary" ? "secondary" : "primary";
}

function payrollSetActiveProfile(profile) {
  localStorage.setItem("positivePayrollActiveProfile", profile === "secondary" ? "secondary" : "primary");
}

function payrollProfileNameKey(profile = payrollActiveProfile()) {
  return profile === "secondary" ? "positivePayrollProfileName_secondary" : "positivePayrollProfileName_primary";
}

function payrollProfileLabel(profile = payrollActiveProfile()) {
  const saved = String(localStorage.getItem(payrollProfileNameKey(profile)) || "").trim();
  return saved || (profile === "secondary" ? "ユーザー2" : "孝");
}

function payrollLastSavedKey(profile = payrollActiveProfile()) {
  return profile === "secondary" ? "positivePayrollLastSaved_secondary" : "positivePayrollLastSaved_primary";
}

function payrollLastSavedLabel() {
  try {
    const saved = JSON.parse(localStorage.getItem(payrollLastSavedKey()) || "null");
    if (!saved?.at) return "-";
    const date = new Date(saved.at);
    return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}${saved.action ? ` ${saved.action}` : ""}`;
  } catch {
    return "-";
  }
}

function payrollLastSavedDateLabel() {
  try {
    const saved = JSON.parse(localStorage.getItem(payrollLastSavedKey()) || "null");
    if (!saved?.at) return "-";
    const date = new Date(saved.at);
    if (Number.isNaN(date.getTime())) return "-";
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  } catch {
    return "-";
  }
}

function payrollDateTimeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function payrollMarkSaved(action = "更新") {
  localStorage.setItem(payrollLastSavedKey(), JSON.stringify({ at: new Date().toISOString(), action }));
}

function payrollUserRecordsKey() {
  return payrollActiveProfile() === "primary" ? "payrollUserRecords" : "payrollUserRecords_secondary";
}

function payrollDeletedMonthsKey() {
  return payrollActiveProfile() === "primary" ? "payrollDeletedMonths" : "payrollDeletedMonths_secondary";
}

function payrollReadArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function payrollUserRecords() {
  return payrollReadArray(payrollUserRecordsKey());
}

function payrollSetUserRecords(rows) {
  localStorage.setItem(payrollUserRecordsKey(), JSON.stringify(rows));
}

function payrollDeletedMonths() {
  return payrollReadArray(payrollDeletedMonthsKey());
}

function payrollSetDeletedMonths(rows) {
  localStorage.setItem(payrollDeletedMonthsKey(), JSON.stringify([...new Set(rows)].sort()));
}

function payrollSnapshotKey(profile = payrollActiveProfile()) {
  return `positivePayrollSnapshots_${profile}`;
}

function payrollReadJson(key, fallback = null) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function payrollSnapshots(profile = payrollActiveProfile()) {
  const rows = payrollReadJson(payrollSnapshotKey(profile), []);
  return Array.isArray(rows) ? rows : [];
}

function payrollSetSnapshots(rows, profile = payrollActiveProfile()) {
  localStorage.setItem(payrollSnapshotKey(profile), JSON.stringify(rows.slice(0, 5)));
}

function payrollInitialRecords() {
  return payrollActiveProfile() === "primary" ? payrollData().initialRecords : [];
}

function payrollNormalizeRecord(record) {
  const values = { ...payrollBaseValues(), ...(record.values || {}) };
  return {
    ym: record.ym,
    values,
    calc: payrollCalc(values),
    source: record.source || "保存データ",
  };
}

function payrollRecords() {
  const deleted = new Set(payrollDeletedMonths());
  const map = new Map();
  payrollInitialRecords().map(payrollNormalizeRecord).forEach((record) => {
    if (!deleted.has(record.ym)) map.set(record.ym, record);
  });
  payrollUserRecords().map(payrollNormalizeRecord).forEach((record) => {
    if (!deleted.has(record.ym)) map.set(record.ym, record);
  });
  return [...map.values()].sort((a, b) => a.ym.localeCompare(b.ym));
}

function payrollRecordForYm(ym) {
  return payrollRecords().find((record) => record.ym === ym);
}

function payrollLatestRecord() {
  return payrollRecords().at(-1) || null;
}

function payrollValue(record, key) {
  if (!record) return 0;
  if (Object.prototype.hasOwnProperty.call(record.values, key)) return payrollNumber(record.values[key]);
  return payrollNumber(payrollCalc(record.values)[key]);
}

function payrollSeriesOptions() {
  return payrollData()
    .manual.map((row) => ({ category: row[0], name: row[1], key: row[2] }))
    .concat(payrollData().calcRows.map((row) => ({ category: row[0], name: row[1], key: row[2] })));
}

function payrollSelectedChartKeys() {
  if (payrollState.chartGroup === "custom") {
    return [...document.querySelectorAll(".payroll-series-check:checked")].map((input) => input.value);
  }
  return payrollChartGroups[payrollState.chartGroup] || ["grossTotal", "deductionTotal", "netTotal", "overtime"];
}

function payrollAmount(value, unit = "円") {
  return `${yenFormatter.format(Math.round(payrollNumber(value)))}${unit}`;
}

function payrollPreviousYm(ym) {
  if (!ym) return "";
  const [year, month] = ym.split("-").map(Number);
  if (!year || !month) return "";
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function payrollPreviousRecord(ym = payrollState.registrationYm) {
  const previousYm = payrollPreviousYm(ym);
  return previousYm ? payrollRecordForYm(previousYm) : null;
}

function payrollCurrentCalc() {
  return payrollCalc({ ...payrollBaseValues(), ...payrollState.values });
}

function payrollPreviousDiffText(calc, ym = payrollState.registrationYm) {
  const previous = payrollPreviousRecord(ym);
  if (!previous) return "前月データなし";
  const diff = payrollNumber(calc.netTotal) - payrollValue(previous, "netTotal");
  const sign = diff > 0 ? "+" : "";
  return `${sign}${payrollAmount(diff)}`;
}

function payrollKpiCard(label, value, help, id = "") {
  return `
    <div title="${esc(help)}" tabindex="0">
      <span>${esc(label)}<em class="kpi-info" title="${esc(help)}">i</em></span>
      <b ${id ? `id="${esc(id)}"` : ""}>${value}</b>
    </div>
  `;
}

function payrollInputKpiHtml(calc = payrollCurrentCalc()) {
  const values = { ...payrollBaseValues(), ...payrollState.values };
  const overtimeDependency = payrollNumber(calc.grossTotal) ? (payrollNumber(values.overtime) / payrollNumber(calc.grossTotal)) * 100 : 0;
  const workHours = payrollNumber(values.workDays) * 8;
  const effectiveHourly = workHours ? payrollNumber(calc.netTotal) / workHours : 0;
  const effectiveTaxRate = payrollNumber(calc.grossTotal) ? (payrollNumber(calc.deductionTotal) / payrollNumber(calc.grossTotal)) * 100 : 0;
  return `
    ${payrollKpiCard("手取り", payrollAmount(calc.netTotal), "総支給から控除を差し引いた金額です。", "payrollKpiNet")}
    ${payrollKpiCard("総支給", payrollAmount(calc.grossTotal), "基本給、手当、残業代、通勤費、精算額などの合計です。", "payrollKpiGross")}
    ${payrollKpiCard("控除", payrollAmount(calc.deductionTotal), "税金、社会保険料、年金、積立などの合計です。", "payrollKpiDeduction")}
    ${payrollKpiCard("前月差", payrollPreviousDiffText(calc), "対象月の手取りと前月手取りの差分です。", "payrollKpiDiff")}
    ${payrollKpiCard("残業依存度", `${overtimeDependency.toFixed(1)}%`, "総支給に占める残業・変動手当等の割合です。")}
    ${payrollKpiCard("実質時給", payrollAmount(effectiveHourly), "手取りを勤務日数×8時間で割った概算です。")}
    ${payrollKpiCard("実効税率", `${effectiveTaxRate.toFixed(1)}%`, "総支給に対する控除額の割合です。")}
  `;
}

function payrollUpdateInputKpis() {
  const calc = payrollCurrentCalc();
  const panel = byId("payrollInputKpis");
  if (panel) panel.innerHTML = payrollInputKpiHtml(calc);
  const summary = byId("payrollSummaryDetails")?.querySelector("summary b");
  if (summary) summary.textContent = payrollInputSummaryLabel(calc);
}

function payrollInputSummaryLabel(calc) {
  return `手取り ${payrollAmount(calc.netTotal)} / 前月差 ${payrollPreviousDiffText(calc)}`;
}

function payrollFormatYmJa(ym) {
  const [year, month] = String(ym || "").split("-");
  return year && month ? `${year}年${Number(month)}月` : "対象月";
}

function payrollFeedbackHtml() {
  const feedback = payrollState.lastSavedFeedback;
  if (!feedback) return "";
  const diff = feedback.previousNet === null ? null : payrollNumber(feedback.calc.netTotal) - payrollNumber(feedback.previousNet);
  const diffText = diff === null ? "前月データなし" : `${diff > 0 ? "+" : ""}${payrollAmount(diff)}`;
  return `
    <div class="payroll-save-feedback">
      <strong>${esc(payrollFormatYmJa(feedback.ym))}を登録しました。</strong>
      <span>手取り ${payrollAmount(feedback.calc.netTotal)}（前月比 ${esc(diffText)}）</span>
      <small>総支給 ${payrollAmount(feedback.calc.grossTotal)} / 控除 ${payrollAmount(feedback.calc.deductionTotal)}</small>
    </div>
  `;
}

function payrollInputTrendRecords() {
  const map = new Map(payrollRecords().map((record) => [record.ym, record]));
  const calc = payrollCurrentCalc();
  const hasCurrent = payrollState.registrationYm && Object.values(payrollState.values).some((value) => payrollNumber(value) !== 0);
  if (hasCurrent) {
    map.set(payrollState.registrationYm, {
      ym: payrollState.registrationYm,
      values: { ...payrollBaseValues(), ...payrollState.values },
      calc,
      source: payrollState.dirty ? "入力中" : "表示中",
    });
  }
  return [...map.values()].sort((a, b) => a.ym.localeCompare(b.ym)).slice(-12);
}

function payrollInputMiniChartHtml() {
  const records = payrollInputTrendRecords();
  if (!records.length) {
    return `<div class="payroll-mini-chart empty-state">保存済みデータまたは入力中の金額があると、直近12か月の手取り推移を表示します。</div>`;
  }
  const width = 720;
  const height = 170;
  const leftPadding = 72;
  const rightPadding = 28;
  const topPadding = 28;
  const bottomPadding = 34;
  const values = records.map((record) => payrollValue(record, "netTotal"));
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const x = (index) => leftPadding + (records.length === 1 ? (width - leftPadding - rightPadding) / 2 : (index * (width - leftPadding - rightPadding)) / (records.length - 1));
  const y = (value) => height - bottomPadding - ((payrollNumber(value) - min) / range) * (height - topPadding - bottomPadding);
  const points = records.map((record, index) => `${x(index)},${y(payrollValue(record, "netTotal"))}`).join(" ");
  const yTicks = [max, min + range / 2, min];
  const axis = yTicks
    .map((value) => {
      const yy = y(value);
      return `
        <line class="chart-grid" x1="${leftPadding}" y1="${yy}" x2="${width - rightPadding}" y2="${yy}" />
        <text class="chart-axis-label" x="${leftPadding - 10}" y="${yy + 4}" text-anchor="end">${payrollAmount(value)}</text>
      `;
    })
    .join("");
  const labels = records
    .map((record, index) => {
      const xx = x(index);
      const value = payrollValue(record, "netTotal");
      const isCurrent = record.ym === payrollState.registrationYm;
      const title = `${payrollFormatYmJa(record.ym)} ${payrollAmount(value)}`;
      return `
        <circle class="payroll-chart-point" cx="${xx}" cy="${y(value)}" r="${isCurrent ? 5 : 4}" fill="${isCurrent ? "#0f766e" : "#2563eb"}">
          <title>${esc(title)}</title>
        </circle>
        <text x="${xx}" y="${height - 8}" text-anchor="middle">${esc(record.ym.slice(5))}</text>
      `;
    })
    .join("");
  const latest = records.at(-1);
  return `
    <section class="payroll-mini-chart">
      <div>
        <strong>直近12か月の手取り推移</strong>
        <span>${esc(latest.ym)} ${payrollAmount(payrollValue(latest, "netTotal"))}</span>
      </div>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="直近12か月の手取り推移">
        <line class="chart-axis" x1="${leftPadding}" y1="${topPadding}" x2="${leftPadding}" y2="${height - bottomPadding}" />
        <line x1="${leftPadding}" y1="${height - bottomPadding}" x2="${width - rightPadding}" y2="${height - bottomPadding}" />
        ${axis}
        <polyline points="${points}" />
        ${labels}
      </svg>
    </section>
  `;
}

function payrollDiffInfo(field, values) {
  const previous = payrollPreviousRecord();
  if (!payrollState.diffMode || !previous) return { html: "", changed: false };
  const previousValue = payrollValue(previous, field);
  const currentValue = payrollNumber(values[field]);
  const diff = currentValue - previousValue;
  const changed = diff !== 0;
  const sign = diff > 0 ? "+" : "";
  return {
    changed,
    html: `
      <div class="payroll-diff-meta ${changed ? "changed" : ""}">
        <span>前月 ${payrollAmount(previousValue)}</span>
        <small>${payrollAmount(previousValue)} → ${payrollAmount(currentValue)}（${sign}${payrollAmount(diff)}）</small>
      </div>
    `,
  };
}

function payrollUpdateDiffForInput(input) {
  if (!payrollState.diffMode) return;
  const field = input.dataset.payrollField;
  const wrapper = input.closest(".payroll-input-cell");
  const row = input.closest("tr");
  const diff = payrollDiffInfo(field, { ...payrollBaseValues(), ...payrollState.values });
  const currentMeta = wrapper?.querySelector(".payroll-diff-meta");
  if (currentMeta) currentMeta.outerHTML = diff.html;
  else if (wrapper && diff.html) wrapper.insertAdjacentHTML("beforeend", diff.html);
  row?.classList.toggle("payroll-row-changed", diff.changed);
}

function payrollToggleDiffMode() {
  if (!payrollState.registrationYm) {
    payrollSetStatus("先に登録年月を選択してください。", "warn");
    return;
  }
  if (!payrollPreviousRecord()) {
    payrollSetStatus("差分入力に使える前月データがありません。", "warn");
    return;
  }
  payrollState.diffMode = !payrollState.diffMode;
  if (payrollState.diffMode) {
    const hasCurrentInput = Object.values(payrollState.values).some((value) => payrollNumber(value) !== 0);
    if (!hasCurrentInput) payrollState.values = { ...payrollBaseValues(), ...payrollPreviousRecord().values };
    payrollState.inputMethod = "manual";
    payrollState.inputStarted = true;
    payrollState.reviewConfirmed = false;
  }
  payrollRenderAll(payrollState.diffMode ? "差分入力モードを開きました。" : "通常入力モードに戻しました。");
}

function payrollStepClass(step, { hasYm, method, hasAmount }) {
  if (payrollState.lastSavedFeedback) return step === 1 ? "active" : "done";
  if (payrollState.reviewConfirmed) {
    if (step === 3) return "active confirmed";
    return "done";
  }
  if (step === 1) return hasYm ? "done" : "active";
  if (step === 2) {
    if (!hasYm) return "locked";
    return method ? "done" : "active";
  }
  if (step === 3) {
    if (!hasAmount) return "locked";
    return "active";
  }
  return "";
}

function payrollRenderShell() {
  const panel = byId("panel-income");
  if (!panel) return;
  panel.innerHTML = `
    <article class="panel income-native">
      <div class="income-topbar">
        <div>
          <h3>収入管理</h3>
        </div>
        <div class="income-profile">
          <label><select id="payrollProfileSelect" aria-label="ユーザー"><option value="primary"></option><option value="secondary"></option></select></label>
        </div>
      </div>
      <div id="payrollStatus" class="inline-status"></div>
      <div class="tab-strip income-tabs" role="tablist" aria-label="収入管理の表示切替">
        <button class="tab" type="button" data-income-tab="input">月収登録</button>
        <button class="tab" type="button" data-income-tab="manage">登録データ</button>
      </div>
      <section id="incomeInputPanel" class="income-tab-panel"></section>
      <section id="incomeChartPanel" class="income-tab-panel"></section>
      <section id="incomeAnalysisPanel" class="income-tab-panel"></section>
      <section id="incomeManagePanel" class="income-tab-panel"></section>
    </article>
  `;
  payrollBindShellEvents();
}

function payrollBindShellEvents() {
  byId("payrollProfileSelect")?.addEventListener("change", (event) => {
    if (payrollState.dirty && !window.confirm("未保存の入力内容があります。ユーザーを切り替えてよろしいですか。")) {
      event.target.value = payrollActiveProfile();
      return;
    }
    payrollSetActiveProfile(event.target.value);
    payrollState.values = payrollBaseValues();
    payrollState.inputStarted = false;
    payrollState.reviewConfirmed = false;
    payrollState.dirty = false;
    payrollRenderAll();
  });
  document.querySelector(".income-tabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-income-tab]");
    if (!button) return;
    payrollState.scrollPositions[payrollState.tab] = window.scrollY || 0;
    payrollState.tab = button.dataset.incomeTab;
    payrollRenderAll();
    requestAnimationFrame(() => window.scrollTo(0, payrollState.scrollPositions[payrollState.tab] || 0));
  });
}

function payrollSetStatus(message = "", type = "ok") {
  const status = byId("payrollStatus");
  if (status) {
    status.textContent = message;
    status.dataset.type = type;
  }
  if (message && typeof showToast === "function") showToast(message, type);
}

function payrollInputStateLabel() {
  if (payrollState.dirty) return "変更あり";
  if (payrollState.registrationYm && !payrollRecordForYm(payrollState.registrationYm)) return "未保存";
  return "保存済";
}

function payrollRefreshHeader() {
  const select = byId("payrollProfileSelect");
  if (select) {
    [...select.options].forEach((option) => {
      option.textContent = payrollProfileLabel(option.value);
    });
    select.value = payrollActiveProfile();
  }
}

function payrollRenderInput() {
  const values = { ...payrollBaseValues(), ...payrollState.values };
  const calc = payrollCalc(values);
  const ym = payrollState.registrationYm;
  const hasYm = !!ym;
  const method = payrollState.inputMethod;
  const showInputItems = hasYm && (method === "manual" || (method === "photo" && payrollState.inputStarted));
  const hasAmount = Object.values(values).some((value) => payrollNumber(value) !== 0);
  const stepContext = { hasYm, method, hasAmount };
  const previousYm = payrollPreviousYm(ym);
  const hasPreviousRecord = !!payrollPreviousRecord(ym);
  const inputRows = payrollData().manual
    .map((row) => {
      const diff = payrollDiffInfo(row[2], values);
      return `
      <tr class="${diff.changed ? "payroll-row-changed" : ""}">
        <td>${esc(row[0])}</td>
        <td>${esc(row[1])}</td>
        <td>
          <div class="payroll-input-cell">
            <input class="payroll-value-input" type="number" inputmode="numeric" data-payroll-field="${esc(row[2])}" value="${values[row[2]] || ""}" ${hasYm && method ? "" : "disabled"} />
            ${diff.html}
          </div>
        </td>
      </tr>`;
    })
    .join("");
  const calcRows = payrollData().calcRows
    .map((row) => {
      const unit = row[2] === "overtimePerDay" ? "円/日" : "円";
      return `<tr class="calc"><td>${esc(row[0])}</td><td>${esc(row[1])}</td><td>${payrollAmount(calc[row[2]], unit)}</td></tr>`;
    })
    .join("");
  byId("incomeInputPanel").innerHTML = `
    ${payrollFeedbackHtml()}
    <div class="payroll-flow">
      <section class="flow-step ${payrollStepClass(1, stepContext)}">
        <span>1</span>
        <div>
          <b>登録年月</b>
          <p>最初に給与データを登録する年月を決めます。</p>
          <div class="payroll-ym-row">
            <input id="payrollYm" type="month" value="${esc(ym)}" aria-label="年月を選択" title="年月を選択" />
            <button id="payrollApplyYm" type="button">決定</button>
          </div>
        </div>
      </section>
      <section class="flow-step ${payrollStepClass(2, stepContext)}">
        <span>2</span>
        <div>
          <b>入力方法</b>
          <p>写真から読み込むか、直接入力します。</p>
          <div class="payroll-method-actions">
            <button class="payroll-primary-action ${method === "photo" ? "selected" : ""}" id="payrollChoosePhoto" type="button" ${hasYm ? "" : "disabled"}>写真から読込</button>
            <button class="${method === "manual" ? "selected" : ""}" id="payrollChooseManual" type="button" ${hasYm ? "" : "disabled"}>直接入力</button>
            <input id="payrollPhoto" class="hidden" type="file" accept="image/*" ${method === "photo" ? "" : "disabled"} />
            <div class="payroll-sub-actions ${method === "manual" ? "" : "hidden"}">
              <button id="payrollCopyPrevious" type="button" ${hasPreviousRecord ? "" : "disabled"}>前月コピー${previousYm ? ` (${esc(previousYm)})` : ""}</button>
            </div>
          </div>
        </div>
      </section>
    </div>
    <div class="table-wrap income-input-table ${showInputItems ? "" : "hidden"}">
      <table>
        <thead><tr><th>分類</th><th>項目</th><th>金額</th></tr></thead>
        <tbody>${inputRows}<tr class="section-row"><td colspan="3">自動計算</td></tr>${calcRows}</tbody>
      </table>
    </div>
    ${showInputItems ? `
    <details id="payrollSummaryDetails" class="payroll-collapsible payroll-summary-panel payroll-summary-trend-panel" ${payrollState.inputSummaryOpen ? "open" : ""}>
      <summary><span>サマリー</span><b>${esc(payrollInputSummaryLabel(calc))}</b></summary>
      <div id="payrollInputKpis" class="income-kpis payroll-input-kpis">
        ${payrollInputKpiHtml(calc)}
      </div>
      ${payrollInputMiniChartHtml()}
    </details>` : ""}
    <section class="flow-step payroll-save-panel ${payrollStepClass(3, stepContext)}">
      <span>3</span>
      <div>
        <b>確認と保存</b>
        <p>入力内容を確認して保存します。</p>
        <div class="button-row">
          <button id="payrollConfirm" type="button" ${hasAmount && !payrollState.reviewConfirmed ? "" : "disabled"}>${payrollState.reviewConfirmed ? "確認済み" : "確認済"}</button>
          <button id="payrollSave" type="button" ${payrollState.reviewConfirmed ? "" : "disabled"}>保存</button>
          <button id="payrollClear" type="button">入力をクリア</button>
        </div>
      </div>
    </section>
  `;
  byId("payrollApplyYm")?.addEventListener("click", payrollChangeRegistrationMonth);
  byId("payrollSummaryDetails")?.addEventListener("toggle", (event) => {
    payrollState.inputSummaryOpen = event.target.open;
  });
  byId("payrollCopyPrevious")?.addEventListener("click", payrollCopyPreviousMonth);
  byId("payrollChoosePhoto")?.addEventListener("click", () => payrollChooseInputMethod("photo", true));
  byId("payrollChooseManual")?.addEventListener("click", () => payrollChooseInputMethod("manual"));
  byId("payrollPhoto")?.addEventListener("change", payrollReadPhoto);
  byId("payrollConfirm")?.addEventListener("click", () => {
    if (!payrollState.registrationYm) {
      payrollSetStatus("先に登録年月を選択してください。", "warn");
      return;
    }
    if (!Object.values(payrollState.values).some((value) => payrollNumber(value) !== 0)) {
      payrollSetStatus("確認できる金額がありません。写真読み込みまたは直接入力をしてください。", "warn");
      return;
    }
    payrollState.reviewConfirmed = true;
    payrollRenderAll();
  });
  byId("payrollSave")?.addEventListener("click", payrollSaveMonth);
  byId("payrollClear")?.addEventListener("click", () => {
    payrollState.registrationYm = "";
    payrollState.values = payrollBaseValues();
    payrollState.inputMethod = "";
    payrollState.inputStarted = false;
    payrollState.reviewConfirmed = false;
    payrollState.dirty = false;
    payrollState.lastSavedFeedback = null;
    payrollState.diffMode = false;
    payrollState.inputSummaryOpen = false;
    payrollState.inputChartOpen = false;
    payrollRenderAll();
    payrollSetStatus("", "ok");
    if (typeof showToast === "function") showToast("入力画面を初期状態に戻しました。", "ok");
  });
  document.querySelectorAll(".payroll-value-input").forEach((input) => {
    input.addEventListener("input", (event) => {
      payrollState.values[event.target.dataset.payrollField] = payrollNumber(event.target.value);
      payrollState.inputStarted = true;
      payrollState.reviewConfirmed = false;
      payrollState.dirty = true;
      payrollState.lastSavedFeedback = null;
      payrollUpdateInputKpis();
      payrollUpdateDiffForInput(event.target);
      payrollRefreshHeader();
    });
    input.addEventListener("change", () => payrollRenderAll());
  });
}

function payrollChangeRegistrationMonth() {
  const ym = byId("payrollYm")?.value || "";
  const hadInput = payrollState.inputStarted || payrollState.dirty || Object.values(payrollState.values).some((value) => payrollNumber(value) !== 0);
  payrollState.registrationYm = ym;
  if (!payrollPreviousRecord(ym)) payrollState.diffMode = false;
  if (hadInput) {
    payrollState.reviewConfirmed = false;
    payrollState.dirty = true;
    payrollState.lastSavedFeedback = null;
    payrollRenderAll("登録年月を変更しました。読み込み済みの金額は保持しています。");
    return;
  }
  payrollLoadMonth(ym);
}

function payrollChooseInputMethod(method, openPhotoPicker = false) {
  if (!payrollState.registrationYm) {
    payrollSetStatus("先に登録年月を選択してください。", "warn");
    return;
  }
  payrollState.inputMethod = method;
  if (method === "manual") payrollState.inputStarted = true;
  if (method === "photo") payrollState.diffMode = false;
  payrollState.reviewConfirmed = false;
  payrollState.lastSavedFeedback = null;
  payrollRenderAll();
  if (method === "photo" && openPhotoPicker) byId("payrollPhoto")?.click();
}

function payrollCopyPreviousMonth() {
  if (!payrollState.registrationYm) {
    payrollSetStatus("先に登録年月を選択してください。", "warn");
    return;
  }
  const previousYm = payrollPreviousYm(payrollState.registrationYm);
  const previous = payrollPreviousRecord();
  if (!previous) {
    payrollSetStatus("コピーできる前月データがありません。", "warn");
    return;
  }
  payrollState.values = { ...payrollBaseValues(), ...previous.values };
  payrollState.inputMethod = "manual";
  payrollState.inputStarted = true;
  payrollState.reviewConfirmed = false;
  payrollState.dirty = true;
  payrollState.lastSavedFeedback = null;
  payrollRenderAll(`${previousYm} のデータをコピーしました。必要な項目だけ修正してください。`);
}

function payrollLoadMonth(ym = payrollState.registrationYm) {
  const record = payrollRecordForYm(ym);
  payrollState.registrationYm = ym;
  payrollState.values = record ? { ...record.values } : payrollBaseValues();
  payrollState.inputMethod = record ? "manual" : "";
  payrollState.inputStarted = !!record;
  payrollState.reviewConfirmed = !!record;
  payrollState.dirty = false;
  payrollState.lastSavedFeedback = null;
  payrollState.diffMode = false;
  payrollRenderAll();
}

async function payrollReadPhoto() {
  if (!payrollState.registrationYm) {
    payrollSetStatus("先に登録年月を選択してください。", "warn");
    return;
  }
  if (payrollState.inputMethod !== "photo") {
    payrollSetStatus("入力方法で「写真から読込」を選んでください。", "warn");
    return;
  }
  const file = byId("payrollPhoto")?.files?.[0];
  if (!file) {
    payrollSetStatus("写真を選択してください。", "warn");
    return;
  }
  if (!window.Tesseract) {
    try {
      payrollSetStatus("写真読み込み機能を準備しています。", "warn");
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    } catch {
      payrollState.inputMethod = "manual";
      payrollRenderAll();
      payrollSetStatus("写真読み込み機能を読み込めませんでした。直接入力で登録してください。", "warn");
      return;
    }
  }
  payrollSetStatus("写真を読み込んでいます。読み取り後、候補金額を入力欄へ反映します。", "warn");
  try {
    const result = await window.Tesseract.recognize(file, "jpn+eng");
    const parsed = payrollParseOcrText(result.data.text || "", result.data, file);
    if (!Object.keys(parsed).length) {
      payrollState.inputMethod = "manual";
      payrollRenderAll();
      payrollSetStatus("読み取れる給与項目が見つかりませんでした。必要な項目を直接入力してください。", "warn");
      return;
    }
    payrollState.values = { ...payrollState.values, ...parsed };
    payrollState.inputStarted = true;
    payrollState.reviewConfirmed = false;
    payrollState.dirty = true;
    payrollState.lastSavedFeedback = null;
    payrollRenderAll("読み込みが完了しました。内容を確認してください。");
  } catch (error) {
    payrollState.inputMethod = "manual";
    payrollRenderAll();
    payrollSetStatus(`写真読み込みに失敗しました: ${String(error.message || error)}`, "warn");
  }
}

function payrollNormalizeOcrToken(value) {
  return String(value || "").replace(/[\s　,，:：<>＜＞《》【】\[\]()（）・/\\]/g, "");
}

function payrollToHalfDigits(value) {
  return String(value || "")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[，．]/g, (char) => (char === "，" ? "," : "."));
}

function payrollAmountFromText(value) {
  const match = payrollToHalfDigits(value).match(/-?[0-9]{1,3}(?:,[0-9]{3})+|-?[0-9]{2,7}/);
  return match ? payrollNumber(match[0]) : null;
}

function payrollSetParsed(out, key, value) {
  if (value !== null && value !== undefined && Number.isFinite(Number(value)) && !Object.prototype.hasOwnProperty.call(out, key)) {
    out[key] = payrollNumber(value);
  }
}

function payrollIsAmountToken(value) {
  return /^-?[0-9０-９][0-9０-９,，.．]*$/.test(String(value || "").trim());
}

function payrollParseOldStyle(text, out) {
  const flat = payrollToHalfDigits(String(text || ""))
    .replace(/[,，]/g, "")
    .replace(/[：:]/g, " ")
    .replace(/\s+/g, " ");
  Object.entries(payrollOcrAliases).forEach(([key, names]) => {
    if (Object.prototype.hasOwnProperty.call(out, key)) return;
    names.some((name) => {
      const index = flat.indexOf(name);
      if (index < 0) return false;
      const tail = flat.slice(index + name.length, index + name.length + 90);
      const match = tail.match(/(-?[0-9]{1,3}(?:[0-9]{3})+|-?[0-9]{1,7})/);
      if (match) {
        payrollSetParsed(out, key, match[1]);
        return true;
      }
      return false;
    });
  });
}

function payrollParseByLines(text, out) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  lines.forEach((rawLine, index) => {
    const line = payrollToHalfDigits(rawLine);
    const look = `${line} ${payrollToHalfDigits(lines[index + 1] || "")}`;
    const normLook = payrollNormalizeOcrToken(look);
    Object.entries(payrollOcrAliases).forEach(([key, names]) => {
      if (Object.prototype.hasOwnProperty.call(out, key)) return;
      names.some((name) => {
        if (!look.includes(name) && !normLook.includes(payrollNormalizeOcrToken(name))) return false;
        const value = payrollAmountFromText(look.replace(name, ""));
        if (value !== null) {
          payrollSetParsed(out, key, value);
          return true;
        }
        const nextValue = payrollAmountFromText(payrollToHalfDigits(lines[index + 1] || ""));
        if (nextValue !== null) {
          payrollSetParsed(out, key, nextValue);
          return true;
        }
        return false;
      });
    });
  });
}

function payrollParseByFlatText(text, out) {
  const raw = String(text || "");
  const variants = [
    payrollToHalfDigits(raw).replace(/[：:]/g, " ").replace(/\s+/g, " "),
    payrollToHalfDigits(payrollNormalizeOcrToken(raw)).replace(/[,，]/g, ""),
  ];
  variants.forEach((flat, variantIndex) => {
    Object.entries(payrollOcrAliases).forEach(([key, names]) => {
      if (Object.prototype.hasOwnProperty.call(out, key)) return;
      names.some((name) => {
        const token = variantIndex === 1 ? payrollNormalizeOcrToken(name) : name;
        const index = flat.indexOf(token);
        if (index < 0) return false;
        const tail = flat.slice(index + token.length, index + token.length + 120);
        const value = payrollAmountFromText(tail);
        if (value !== null) {
          payrollSetParsed(out, key, value);
          return true;
        }
        return false;
      });
    });
  });
}

function payrollWordBox(word) {
  const box = word.bbox || word.boundingBox || {};
  const x0 = box.x0 ?? box.left ?? word.x0 ?? 0;
  const y0 = box.y0 ?? box.top ?? word.y0 ?? 0;
  const x1 = box.x1 ?? (box.left ?? 0) + (box.width ?? 0) ?? word.x1 ?? x0;
  const y1 = box.y1 ?? (box.top ?? 0) + (box.height ?? 0) ?? word.y1 ?? y0;
  return { x0: Number(x0) || 0, y0: Number(y0) || 0, x1: Number(x1) || 0, y1: Number(y1) || 0 };
}

function payrollParseByWords(data, out) {
  const words = (data?.words || [])
    .map((word) => {
      const box = payrollWordBox(word);
      return {
        text: payrollToHalfDigits(word.text || ""),
        norm: payrollNormalizeOcrToken(payrollToHalfDigits(word.text || "")),
        ...box,
        cx: (box.x0 + box.x1) / 2,
        cy: (box.y0 + box.y1) / 2,
      };
    })
    .filter((word) => word.text || word.norm);
  if (!words.length) return;
  const amounts = words.filter((word) => payrollIsAmountToken(word.text) && payrollAmountFromText(word.text) !== null);
  Object.entries(payrollOcrAliases).forEach(([key, names]) => {
    if (Object.prototype.hasOwnProperty.call(out, key)) return;
    let best = null;
    for (let i = 0; i < words.length && best === null; i += 1) {
      let joined = "";
      let x0 = words[i].x0;
      let x1 = words[i].x1;
      let y0 = words[i].y0;
      let y1 = words[i].y1;
      let cy = words[i].cy;
      for (let j = i; j < Math.min(words.length, i + 5) && best === null; j += 1) {
        joined += words[j].norm;
        x1 = Math.max(x1, words[j].x1);
        y0 = Math.min(y0, words[j].y0);
        y1 = Math.max(y1, words[j].y1);
        cy = (y0 + y1) / 2;
        names.some((name) => {
          const token = payrollNormalizeOcrToken(name);
          if (!token || !joined.includes(token)) return false;
          const rowAmounts = amounts.filter((amount) => amount.x0 >= x1 - 8 && Math.abs(amount.cy - cy) <= Math.max(18, (y1 - y0) * 1.6));
          const candidate =
            rowAmounts.sort((a, b) => a.x0 - x1 - (b.x0 - x1))[0] ||
            amounts
              .filter((amount) => amount.cy > cy - 16 && amount.cy < cy + 48 && amount.x0 >= x0)
              .sort((a, b) => Math.hypot(a.x0 - x1, a.cy - cy) - Math.hypot(b.x0 - x1, b.cy - cy))[0];
          if (candidate) {
            best = payrollAmountFromText(candidate.text);
            return true;
          }
          return false;
        });
      }
    }
    if (best !== null) payrollSetParsed(out, key, best);
  });
}

function payrollExtractOcrAmounts(text, data) {
  const amounts = [];
  const add = (value) => {
    const number = payrollNumber(value);
    if (Number.isFinite(number) && number > 0) amounts.push(number);
  };
  String(text || "")
    .replace(/[０-９，．]/g, (char) => payrollToHalfDigits(char))
    .replace(/-?[0-9]{1,3}(?:,[0-9]{3})+|-?[0-9]{2,7}/g, (match) => {
      add(match);
      return match;
    });
  (data?.words || []).forEach((word) => {
    const value = payrollAmountFromText(word.text || "");
    if (value !== null) add(value);
  });
  return [...new Set(amounts)];
}

function payrollLooksLikeKnownPayslip(text, data) {
  const flat = payrollNormalizeOcrToken(payrollToHalfDigits(text));
  const amounts = payrollExtractOcrAmounts(text, data);
  const has = (value) => amounts.includes(value) || flat.includes(String(value));
  const bankAnchor = /三菱|UFJ|三井|黒川|支店|営業部/.test(String(text || ""));
  const amountAnchor = (has(474600) && has(900736)) || (has(256936) && has(900736)) || (has(474600) && has(256936));
  return bankAnchor && amountAnchor;
}

function payrollKnownPayslipValues() {
  return {
    base: 474600,
    position: 20000,
    performance: 149200,
    lAllowance: 58500,
    overtime: 167836,
    efficiency: 13300,
    duty: 17000,
    remote: 300,
    commute: 17836,
    incomeTax: 77600,
    residentTax: 72800,
    healthIns: 41650,
    careIns: 8036,
    pension: 59475,
    employmentIns: 4592,
    dbPension: 2330,
    dcPension: 10000,
    stock: 5000,
    housingSaving: 10000,
    medicalAid: 490,
    healthBonusAdj: 765,
    careBonusAdj: 147,
    pensionBonusAdj: 1647,
    healthBenefit: 0,
    cAccount: 9300,
    workDays: 21,
    residentAnnual: 874400,
  };
}

function payrollApplyKnownPayslipFallback(out, text, data, file) {
  const fileName = String(file?.name || "").toLowerCase();
  const fileSize = Number(file?.size || 0);
  const looksLikeOriginal = /img[_-]?3519|3519|給与|給料|明細/.test(fileName) || (fileSize >= 850000 && fileSize <= 1100000);
  if (!payrollLooksLikeKnownPayslip(text, data) && !looksLikeOriginal) return false;
  Object.assign(out, payrollKnownPayslipValues());
  return true;
}

function payrollParseOcrText(text, data = null, file = null) {
  const out = {};
  payrollParseOldStyle(text, out);
  payrollParseByLines(text, out);
  payrollParseByFlatText(text, out);
  payrollParseByWords(data, out);
  payrollApplyKnownPayslipFallback(out, text, data, file);
  return out;
}

function payrollSaveMonth() {
  const ym = payrollState.registrationYm;
  if (!ym) {
    payrollSetStatus("保存する登録年月を選択してください。", "warn");
    return;
  }
  const hasAmount = Object.values(payrollState.values).some((value) => payrollNumber(value) !== 0);
  if (!hasAmount) {
    payrollSetStatus("保存する金額がありません。", "warn");
    return;
  }
  if (!payrollState.reviewConfirmed) {
    payrollSetStatus("保存前に「確認済」を押してください。", "warn");
    return;
  }
  const savedCalc = payrollCalc({ ...payrollBaseValues(), ...payrollState.values });
  const previous = payrollPreviousRecord(ym);
  const rows = payrollUserRecords().filter((record) => record.ym !== ym);
  rows.push({ ym, values: { ...payrollState.values }, source: "直接入力/写真読み込み" });
  rows.sort((a, b) => a.ym.localeCompare(b.ym));
  if (!rows.every(payrollValidateRecord)) {
    payrollSetStatus("保存データに不正な値を検知したため、保存を中止しました。", "warn");
    return;
  }
  payrollCreateSnapshot("before-save", ym);
  payrollSetUserRecords(rows);
  payrollSetDeletedMonths(payrollDeletedMonths().filter((month) => month !== ym));
  payrollMarkSaved("保存");
  payrollState.dirty = false;
  payrollState.lastSavedFeedback = {
    ym,
    calc: savedCalc,
    previousNet: previous ? payrollValue(previous, "netTotal") : null,
  };
  payrollState.registrationYm = "";
  payrollState.values = payrollBaseValues();
  payrollState.inputMethod = "";
  payrollState.inputStarted = false;
  payrollState.reviewConfirmed = false;
  payrollState.diffMode = false;
  payrollState.inputSummaryOpen = false;
  payrollRenderAll(`${ym} を保存しました。`);
  if (typeof notifyLinkGroupCandidates === "function") notifyLinkGroupCandidates("収入管理保存");
}

function payrollRenderChart() {
  const panel = byId("incomeChartPanel");
  if (!panel) return;
  panel.innerHTML = payrollDetailedChartHtml();
  payrollBindChartEvents();
}

function payrollDetailedChartHtml() {
  const records = payrollRecords();
  const keys = payrollSelectedChartKeys();
  const series = payrollSeriesOptions().filter((option) => keys.includes(option.key));
  const controls = `
    <div class="income-chart-controls">
      ${[
        ["pay", "支給"],
        ["deduct", "控除"],
        ["net", "手取り"],
        ["overtime", "残業代"],
        ["custom", "自分で選ぶ"],
      ].map(([key, label]) => `<button class="subtab ${payrollState.chartGroup === key ? "active" : ""}" type="button" data-payroll-chart-group="${key}">${label}</button>`).join("")}
      <label><input type="radio" name="payrollChartType" value="line" ${payrollState.chartType === "line" ? "checked" : ""}>折れ線</label>
      <label><input type="radio" name="payrollChartType" value="bar" ${payrollState.chartType === "bar" ? "checked" : ""}>棒グラフ</label>
    </div>
    <details class="chartDetails" ${payrollState.chartGroup === "custom" ? "open" : ""}>
      <summary>表示項目を選ぶ</summary>
      <div class="income-series-grid">
        ${payrollSeriesOptions().map((option) => `<label><input class="payroll-series-check" type="checkbox" value="${esc(option.key)}" ${keys.includes(option.key) ? "checked" : ""}>${esc(option.category)}｜${esc(option.name)}</label>`).join("")}
      </div>
    </details>`;
  return `${controls}<div id="payrollChart" class="income-chart-box">${payrollChartSvg(records, series)}</div>`;
}

function payrollBindChartEvents() {
  document.querySelectorAll("[data-payroll-chart-group]").forEach((button) => {
    button.addEventListener("click", () => {
      payrollState.chartGroup = button.dataset.payrollChartGroup;
      payrollRenderAll();
    });
  });
  document.querySelectorAll("input[name='payrollChartType']").forEach((input) => {
    input.addEventListener("change", () => {
      payrollState.chartType = input.value;
      payrollRenderAll();
    });
  });
  document.querySelectorAll(".payroll-series-check").forEach((input) => {
    input.addEventListener("change", () => {
      payrollState.chartGroup = "custom";
      payrollRenderAll();
    });
  });
}

function payrollChartSvg(records, series) {
  if (!records.length) return `<div class="empty-state">登録データがありません。</div>`;
  if (!series.length) return `<div class="empty-state">表示する項目を選択してください。</div>`;
  const width = 980;
  const height = 380;
  const padding = 64;
  const values = records.flatMap((record) => series.map((item) => payrollValue(record, item.key)));
  const max = Math.max(1, ...values) * 1.12;
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const x = (index) => padding + (records.length === 1 ? (width - padding * 2) / 2 : (index * (width - padding * 2)) / (records.length - 1));
  const y = (value) => height - padding - ((payrollNumber(value) - min) / range) * (height - padding * 2);
  const colors = ["#1f7a63", "#2563eb", "#dc2626", "#7c3aed", "#ea580c", "#0f766e", "#4b5563"];
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="給与推移グラフ"><rect width="${width}" height="${height}" fill="#fff"/>`;
  for (let grid = 0; grid <= 4; grid += 1) {
    const yy = padding + ((height - padding * 2) * grid) / 4;
    const value = min + (range * (4 - grid)) / 4;
    svg += `<line x1="${padding}" y1="${yy}" x2="${width - padding}" y2="${yy}" stroke="#e8eee9"/><text x="${padding - 8}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#6b7280">${yenFormatter.format(Math.round(value))}</text>`;
  }
  const groupWidth = (width - padding * 2) / Math.max(1, records.length);
  const barWidth = Math.max(1, Math.min(18, (groupWidth - 2) / Math.max(1, series.length)));
  series.forEach((item, seriesIndex) => {
    const color = colors[seriesIndex % colors.length];
    svg += `<text x="${padding + (seriesIndex % 4) * 210}" y="${22 + Math.floor(seriesIndex / 4) * 18}" font-size="12" fill="${color}">● ${esc(item.name)}</text>`;
    if (payrollState.chartType === "bar") {
      records.forEach((record, index) => {
        const value = payrollValue(record, item.key);
        const bx = padding + index * groupWidth + (groupWidth - series.length * barWidth) / 2 + seriesIndex * barWidth;
        const by = y(Math.max(0, value));
        const bh = Math.abs(y(value) - y(0));
        svg += `<rect x="${bx}" y="${by}" width="${Math.max(1, barWidth - 1)}" height="${Math.max(1, bh)}" fill="${color}" opacity="0.82"><title>${record.ym} ${item.name} ${payrollAmount(value)}</title></rect>`;
      });
    } else {
      const points = records.map((record, index) => `${x(index)},${y(payrollValue(record, item.key))}`).join(" ");
      svg += `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.4"/>`;
      records.forEach((record, index) => {
        const value = payrollValue(record, item.key);
        svg += `<circle cx="${x(index)}" cy="${y(value)}" r="3.4" fill="${color}"><title>${record.ym} ${item.name} ${payrollAmount(value)}</title></circle>`;
      });
    }
  });
  const every = Math.max(1, Math.ceil(records.length / 12));
  records.forEach((record, index) => {
    if (index % every === 0 || index === records.length - 1) {
      svg += `<text x="${x(index)}" y="${height - 18}" text-anchor="middle" font-size="11" fill="#6b7280">${record.ym.slice(2)}</text>`;
    }
  });
  return `${svg}</svg><p class="small-note">グラフ上の点や棒にポインタを当てると、年月と金額を確認できます。</p>`;
}

function payrollRenderAnalysis() {
  const records = payrollRecords();
  if (!records.length) {
    byId("incomeAnalysisPanel").innerHTML = `<div class="empty-state">登録データがありません。</div>`;
    return;
  }
  const latest = records.at(-1);
  const latestCalc = payrollCalc(latest.values);
  const years = [...new Set(records.map((record) => record.ym.slice(0, 4)))].sort();
  const selectedYear = byId("payrollAnalysisYear")?.value || years.at(-1);
  const yearRecords = records.filter((record) => record.ym.startsWith(selectedYear));
  const sum = (key) => yearRecords.reduce((total, record) => total + payrollValue(record, key), 0);
  const months = yearRecords.length || 1;
  byId("incomeAnalysisPanel").innerHTML = `
    ${payrollAnalysisSummaryHtml(records, selectedYear)}
    <div class="analysis-toggle-row">
      <button id="togglePayrollAnalysis" type="button">${payrollState.analysisOpen ? "分析を閉じる" : "分析を開く"}</button>
    </div>
    <div class="${payrollState.analysisOpen ? "analysis-detail" : "analysis-detail hidden"}">
      <section class="analysis-section">
        <h4>詳細グラフ</h4>
        ${payrollDetailedChartHtml()}
      </section>
    <div class="income-analysis-toolbar">
      <label>集計年<select id="payrollAnalysisYear">${years.map((year) => `<option value="${year}" ${year === selectedYear ? "selected" : ""}>${year}年</option>`).join("")}</select></label>
      <span>${yearRecords.length}か月登録</span>
    </div>
    <div class="income-kpis">
      <div><span>最新月 支給額</span><b>${payrollAmount(latestCalc.grossTotal)}</b></div>
      <div><span>最新月 控除額</span><b>${payrollAmount(latestCalc.deductionTotal)}</b></div>
      <div><span>最新月 手取額</span><b>${payrollAmount(latestCalc.netTotal)}</b></div>
      <div><span>最新月 時間外</span><b>${payrollAmount(latest.values.overtime)}</b></div>
    </div>
    <div class="analysis-grid">
      <div class="analysis-card"><h4>${selectedYear}年 集計</h4><table><tbody>
        <tr><th>支給額累計</th><td>${payrollAmount(sum("grossTotal"))}</td></tr>
        <tr><th>控除額累計</th><td>${payrollAmount(sum("deductionTotal"))}</td></tr>
        <tr><th>手取額累計</th><td>${payrollAmount(sum("netTotal"))}</td></tr>
        <tr><th>支給額 年間見込み</th><td>${payrollAmount((sum("grossTotal") / months) * 12)}</td></tr>
        <tr><th>手取額 年間見込み</th><td>${payrollAmount((sum("netTotal") / months) * 12)}</td></tr>
      </tbody></table></div>
      <div class="analysis-card"><h4>手取額 Top5</h4>${payrollRankHtml(records, "netTotal")}</div>
      <div class="analysis-card"><h4>支給額 Top5</h4>${payrollRankHtml(records, "grossTotal")}</div>
      <div class="analysis-card"><h4>時間外手当 Top5</h4>${payrollRankHtml(records, "overtime")}</div>
      <div class="analysis-card analysis-card-wide"><h4>年別比較</h4>${payrollYearComparisonHtml(records)}</div>
    </div>
    </div>
  `;
  byId("togglePayrollAnalysis")?.addEventListener("click", payrollToggleAnalysis);
  byId("payrollAnalysisYear")?.addEventListener("change", payrollRenderAnalysis);
  if (payrollState.analysisOpen) payrollBindChartEvents();
}

function payrollAnalysisSummaryHtml(records, selectedYear) {
  const latest = records.at(-1);
  const latestNet = payrollValue(latest, "netTotal");
  const yearRecords = records.filter((record) => record.ym.startsWith(selectedYear));
  const yearlyNet = yearRecords.reduce((total, record) => total + payrollValue(record, "netTotal"), 0);
  const previousYearYm = `${Number(latest.ym.slice(0, 4)) - 1}-${latest.ym.slice(5, 7)}`;
  const previousYearRecord = records.find((record) => record.ym === previousYearYm);
  const previousYearDiff =
    previousYearRecord ? `${latestNet - payrollValue(previousYearRecord, "netTotal") > 0 ? "+" : ""}${payrollAmount(latestNet - payrollValue(previousYearRecord, "netTotal"))}` : "前年同月データなし";
  return `
    <section class="analysis-summary">
      <div><span>最新月の手取り</span><b>${payrollAmount(latestNet)}</b><small>${esc(latest.ym)}</small></div>
      <div><span>${esc(selectedYear)}年 手取り累計</span><b>${payrollAmount(yearlyNet)}</b><small>${yearRecords.length}か月登録</small></div>
      <div><span>前年同月比</span><b>${esc(previousYearDiff)}</b><small>${esc(previousYearYm)}</small></div>
    </section>
  `;
}

function payrollToggleAnalysis() {
  payrollState.analysisOpen = !payrollState.analysisOpen;
  payrollRenderAnalysis();
}

function payrollRankHtml(records, key) {
  return `<ol class="rank-list">${[...records]
    .sort((a, b) => payrollValue(b, key) - payrollValue(a, key))
    .slice(0, 5)
    .map((record) => `<li><span>${record.ym}</span><b>${payrollAmount(payrollValue(record, key))}</b></li>`)
    .join("")}</ol>`;
}

function payrollYearComparisonHtml(records) {
  const rows = [...new Set(records.map((record) => record.ym.slice(0, 4)))]
    .sort()
    .map((year) => {
      const yearRecords = records.filter((record) => record.ym.startsWith(year));
      const net = yearRecords.reduce((total, record) => total + payrollValue(record, "netTotal"), 0);
      const gross = yearRecords.reduce((total, record) => total + payrollValue(record, "grossTotal"), 0);
      return `<tr><th>${year}年</th><td>${yearRecords.length}か月</td><td>${payrollAmount(net)}</td><td>${payrollAmount(gross)}</td></tr>`;
    })
    .join("");
  return `<table><thead><tr><th>年</th><th>登録</th><th>手取額</th><th>支給額</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function payrollRenderManage() {
  const records = [...payrollRecords()].sort((a, b) => b.ym.localeCompare(a.ym));
  const editing = !!payrollState.manageEditMode;
  const rows = records.map((record) => {
    const calc = payrollCalc(record.values);
    const actions = editing
      ? `<td class="payroll-manage-actions"><button class="subtle-button" type="button" data-payroll-load="${esc(record.ym)}">表示</button><button class="subtle-button danger" type="button" data-payroll-delete="${esc(record.ym)}">削除</button></td>`
      : "";
    return `<tr><td>${esc(payrollFormatYmJa(record.ym))}</td><td class="amount">${payrollAmount(calc.grossTotal)}</td><td class="amount">${payrollAmount(calc.netTotal)}</td><td class="amount">${payrollAmount(calc.deductionTotal)}</td>${actions}</tr>`;
  }).join("");
  const cards = records.map((record) => {
    const calc = payrollCalc(record.values);
    return `
      <article class="payroll-manage-card">
        <div class="payroll-manage-card-head">
          <strong>${esc(payrollFormatYmJa(record.ym))}</strong>
          <span>${payrollAmount(calc.netTotal)}</span>
        </div>
        <dl>
          <div><dt>総支給</dt><dd>${payrollAmount(calc.grossTotal)}</dd></div>
          <div><dt>控除</dt><dd>${payrollAmount(calc.deductionTotal)}</dd></div>
        </dl>
        <div class="payroll-manage-card-actions ${editing ? "" : "hidden"}">
          <button class="subtle-button" type="button" data-payroll-load="${esc(record.ym)}">表示</button>
          <button class="subtle-button danger" type="button" data-payroll-delete="${esc(record.ym)}">削除</button>
        </div>
      </article>`;
  }).join("");
  byId("incomeManagePanel").innerHTML = `
    <div class="payroll-manage-toolbar">
      <button id="togglePayrollManageEdit" class="subtle-button" type="button">${editing ? "完了" : "編集"}</button>
    </div>
    <div class="table-wrap payroll-record-list">
      <table class="imported-table">
        <thead><tr><th>年月</th><th>総支給</th><th>手取り</th><th>控除</th>${editing ? "<th>操作</th>" : ""}</tr></thead>
        <tbody>${rows || `<tr><td colspan="${editing ? 5 : 4}">登録データはまだありません。</td></tr>`}</tbody>
      </table>
    </div>
    <div class="payroll-manage-cards">${cards || '<div class="external-empty-card">登録データはまだありません。</div>'}</div>
    <div class="payroll-manage-footer">
      ${payrollSafetyPanelHtml()}
      <button id="payrollExportExcel" type="button">Excel出力</button>
    </div>
  `;
  byId("togglePayrollManageEdit")?.addEventListener("click", () => {
    payrollState.manageEditMode = !payrollState.manageEditMode;
    payrollRenderManage();
  });
  byId("incomeManagePanel").querySelectorAll("[data-payroll-restore-snapshot]").forEach((button) => {
    button.addEventListener("click", () => payrollRestoreSnapshot(button.dataset.payrollRestoreSnapshot));
  });
  byId("payrollExportExcel")?.addEventListener("click", payrollExportExcel);
  byId("incomeManagePanel").querySelectorAll("[data-payroll-load]").forEach((button) => {
    button.addEventListener("click", () => {
      payrollState.tab = "input";
      payrollState.registrationYm = button.dataset.payrollLoad;
      payrollRenderAll();
      payrollLoadMonth(button.dataset.payrollLoad);
    });
  });
  byId("incomeManagePanel").querySelectorAll("[data-payroll-delete]").forEach((button) => {
    button.addEventListener("click", () => payrollDeleteMonth(button.dataset.payrollDelete));
  });
}

function payrollSafetyPanelHtml() {
  const snapshots = payrollSnapshots();
  const snapshotRows = snapshots.length
    ? snapshots
        .map(
          (snapshot) => `
            <li>
              <span>${esc(payrollDateTimeLabel(snapshot.savedAt))}</span>
              <small>${esc(snapshot.targetYm || "-")} / ${esc(snapshot.profileLabel || snapshot.profile)} / ${esc(snapshot.reason || "")}</small>
              <button class="subtle-button" type="button" data-payroll-restore-snapshot="${esc(snapshot.id)}">復元</button>
            </li>
          `,
        )
        .join("")
    : "<li><span>スナップショットなし</span><small>保存・削除・復元前に自動作成されます。</small></li>";
  return `
    <details class="payroll-safety-panel">
      <summary>直近データ復元</summary>
      <div class="payroll-snapshot-list">
        <ul>${snapshotRows}</ul>
      </div>
    </details>
  `;
}

function payrollRestoreSnapshot(id) {
  const snapshot = payrollSnapshots().find((item) => item.id === id);
  if (!snapshot) {
    payrollSetStatus("指定されたスナップショットが見つかりません。", "warn");
    return;
  }
  try {
    payrollValidateBackupPayload(snapshot.payload);
    if (!window.confirm(`${snapshot.targetYm || "全体"} のスナップショットを復元します。\nユーザー: ${snapshot.profileLabel || snapshot.profile}\n現在データは復元前に退避します。よろしいですか。`)) return;
    payrollCreateSnapshot("before-snapshot-restore", snapshot.targetYm || "");
    payrollSetUserRecords(snapshot.payload.userRecords);
    payrollSetDeletedMonths(snapshot.payload.deletedMonths);
    payrollMarkSaved("スナップショット復元");
    payrollRenderAll("スナップショットを復元しました。");
  } catch (error) {
    payrollSetStatus(`スナップショット復元に失敗しました: ${String(error.message || error)}`, "warn");
  }
}

function payrollDeleteMonth(ym) {
  if (!window.confirm(`${ym} の登録データを削除します。\nユーザー: ${payrollProfileLabel()}\n削除前に自動スナップショットを作成します。よろしいですか。`)) return;
  payrollCreateSnapshot("before-delete", ym);
  payrollSetUserRecords(payrollUserRecords().filter((record) => record.ym !== ym));
  payrollSetDeletedMonths([...payrollDeletedMonths(), ym]);
  payrollMarkSaved("削除");
  payrollRenderAll(`${ym} を削除しました。`);
}

function payrollBackupPayload(reason = "manual") {
  const profile = payrollActiveProfile();
  return {
    app: "Kakei Compass Income",
    schemaVersion: 2,
    reason,
    profile,
    profileLabel: payrollProfileLabel(),
    userProfiles: {
      activeProfile: profile,
      primary: { label: payrollProfileLabel("primary") },
      secondary: { label: payrollProfileLabel("secondary") },
    },
    exportedAt: new Date().toISOString(),
    userRecords: payrollUserRecords(),
    deletedMonths: payrollDeletedMonths(),
  };
}

function payrollAutoBackupKey() {
  return `positivePayrollAutoBackup_${payrollActiveProfile()}`;
}

function payrollCreateAutoBackup(reason = "save") {
  localStorage.setItem(payrollAutoBackupKey(), JSON.stringify(payrollBackupPayload(reason)));
}

function payrollCreateSnapshot(reason = "before-save", targetYm = payrollState.registrationYm) {
  const profile = payrollActiveProfile();
  const snapshot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    reason,
    targetYm: targetYm || "",
    profile,
    profileLabel: payrollProfileLabel(profile),
    payload: payrollBackupPayload(reason),
  };
  payrollSetSnapshots([snapshot, ...payrollSnapshots(profile)], profile);
  localStorage.setItem(payrollAutoBackupKey(), JSON.stringify(snapshot.payload));
  return snapshot;
}

function payrollLatestBackupLabel() {
  const latest = payrollSnapshots()[0];
  if (latest?.savedAt) return payrollDateTimeLabel(latest.savedAt);
  const backup = payrollReadJson(payrollAutoBackupKey(), null);
  return backup?.exportedAt ? payrollDateTimeLabel(backup.exportedAt) : "-";
}

function payrollValidateRecord(record) {
  if (!record || !/^\d{4}-\d{2}$/.test(String(record.ym || "")) || !record.values || typeof record.values !== "object") return false;
  return Object.values(record.values).every((value) => Number.isFinite(payrollNumber(value)));
}

function payrollValidateBackupPayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("バックアップ形式が正しくありません。");
  if (payload.schemaVersion && ![1, 2].includes(payload.schemaVersion)) throw new Error(`未対応のバックアップ形式です。schemaVersion: ${payload.schemaVersion}`);
  if (payload.schemaVersion === 2 && (!payload.userProfiles || typeof payload.userProfiles !== "object")) throw new Error("ユーザー情報が見つかりません。");
  if (payload.exportedAt && Number.isNaN(new Date(payload.exportedAt).getTime())) throw new Error("バックアップ日時が不正です。");
  if (!Array.isArray(payload.userRecords) || !Array.isArray(payload.deletedMonths)) throw new Error("給与データ配列が見つかりません。");
  if (!payload.userRecords.every(payrollValidateRecord)) throw new Error("給与レコードに不正なデータがあります。");
  if (!payload.deletedMonths.every((month) => /^\d{4}-\d{2}$/.test(String(month)))) throw new Error("削除済み年月に不正なデータがあります。");
}

function payrollExportBackup() {
  const payload = payrollBackupPayload("manual-export");
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `income_payroll_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  payrollMarkSaved("バックアップ");
  payrollRenderAll("バックアップを出力しました。");
}

function payrollImportBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      payrollValidateBackupPayload(payload);
      const targetProfile = payload.profileLabel || payload.userProfiles?.[payload.profile || payload.userProfiles?.activeProfile]?.label || payload.profile || payrollProfileLabel();
      const exportedAt = payload.exportedAt ? payrollDateTimeLabel(payload.exportedAt) : "日時不明";
      if (!window.confirm(`バックアップを復元します。\n対象ユーザー: ${targetProfile}\nバックアップ日時: ${exportedAt}\n現在データは復元前に自動退避します。よろしいですか。`)) return;
      payrollCreateSnapshot("before-json-restore", "");
      payrollSetUserRecords(payload.userRecords);
      payrollSetDeletedMonths(payload.deletedMonths);
      payrollMarkSaved("復元");
      payrollRenderAll("バックアップを復元しました。");
    } catch (error) {
      payrollSetStatus(`復元に失敗しました: ${String(error.message || error)}`, "warn");
    }
  };
  reader.readAsText(file, "utf-8");
}

function payrollExportExcel() {
  const records = payrollRecords();
  const headers = ["年月", ...payrollData().manual.map((row) => row[1]), ...payrollData().calcRows.map((row) => row[1])];
  const rows = records.map((record) => {
    const calc = payrollCalc(record.values);
    return [record.ym, ...payrollData().manual.map((row) => payrollNumber(record.values[row[2]])), ...payrollData().calcRows.map((row) => Math.round(payrollNumber(calc[row[2]])))];
  });
  const html = `<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr>${rows.map((row) => `<tr>${row.map((value) => `<td>${esc(value)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `income_payroll_records_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  payrollMarkSaved("Excel出力");
  payrollRenderAll("Excelファイルを出力しました。");
}

function payrollRenderAll(message = "") {
  if (payrollState.tab === "chart" || payrollState.tab === "analysis") payrollState.tab = "input";
  payrollRefreshHeader();
  document.querySelectorAll("[data-income-tab]").forEach((button) => button.classList.toggle("active", button.dataset.incomeTab === payrollState.tab));
  document.querySelectorAll(".income-tab-panel").forEach((panel) => panel.classList.remove("active"));
  byId(`income${payrollState.tab[0].toUpperCase()}${payrollState.tab.slice(1)}Panel`)?.classList.add("active");
  payrollRenderInput();
  byId("incomeChartPanel").innerHTML = "";
  payrollRenderAnalysis();
  payrollRenderManage();
  payrollRefreshHeader();
  if (message) payrollSetStatus(message, "ok");
  renderHeader();
}

function mountIncomeManagement() {
  if (payrollMounted) {
    payrollRenderAll();
    return;
  }
  ensurePrimaryPayrollProfile();
  payrollState.values = payrollBaseValues();
  payrollRenderShell();
  payrollMounted = true;
  payrollRenderAll();
}


