// app.js
// 全体の初期化と、収入管理 / 支出管理の表示切替だけを担当します。

const appScrollPositions = { summary: 0, income: 0, expense: 0, analysis: 0 };
let unifiedAnalysisIncomeProfile = "all";

function bindMediaQueryChange(query, handler) {
  const media = window.matchMedia(query);
  if (typeof media.addEventListener === "function") media.addEventListener("change", handler);
  else if (typeof media.addListener === "function") media.addListener(handler);
}

function bindAppModeEvents() {
  document.querySelectorAll("[data-app-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.appMode;
      closeMobileNav();
      requestAnimationFrame(() => switchAppMode(nextMode));
    });
  });
  byId("mobileNavToggle")?.addEventListener("click", toggleMobileNav);
  byId("mobileNavBackdrop")?.addEventListener("click", closeMobileNav);
  bindMobileNavSwipe();
  bindPullToRefresh();
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMobileNav();
  });
  bindMediaQueryChange("(min-width: 769px)", closeMobileNav);
  bindMediaQueryChange("(max-width: 768px)", () => {
    if (typeof appMode === "string" && appMode === "expense" && typeof renderMaster === "function") renderMaster();
  });
}

function toggleMobileNav() {
  if (document.body.classList.contains("mobile-nav-open")) closeMobileNav();
  else openMobileNav();
}

function openMobileNav() {
  document.body.classList.add("mobile-nav-open");
  byId("mobileNavToggle")?.setAttribute("aria-expanded", "true");
  byId("mobileNavToggle")?.setAttribute("aria-label", "メニューを閉じる");
  byId("mobileNavBackdrop")?.classList.remove("hidden");
}

function closeMobileNav() {
  document.body.classList.remove("mobile-nav-open");
  byId("mobileNavToggle")?.setAttribute("aria-expanded", "false");
  byId("mobileNavToggle")?.setAttribute("aria-label", "メニューを開く");
  byId("mobileNavBackdrop")?.classList.add("hidden");
}

function overallMetricsForApp() {
  if (typeof expenseSummaryMetrics === "function") return expenseSummaryMetrics();
  return { ym: "", income: 0, expense: 0, saving: 0, surplus: 0, housingRatio: 0, savingRatio: 0, health: "-", pendingCount: 0, attentionCount: 0 };
}

function appMetricCard(label, value, note = "") {
  return `<div class="summary-card"><span>${esc(label)}</span><strong>${esc(value)}</strong>${note ? `<small>${esc(note)}</small>` : ""}</div>`;
}

function renderSummaryPanel() {
  const panel = byId("panel-summary");
  if (!panel) return;
  const metrics = overallMetricsForApp();
  const ym = metrics.ym || "-";
  const healthClass = metrics.health === "赤字" ? "danger" : metrics.health === "警戒" ? "attention" : "reflected";
  panel.innerHTML = `
    <article class="panel income-native unified-summary-panel">
      <div class="income-topbar"><div><h3>サマリー</h3><p>収入と支出から家計全体の現在地を確認します。</p></div></div>
      <section class="summary-health-card">
        <span>家計判定：<strong class="judgment-result ${healthClass}">${esc(metrics.health)}</strong></span>
        <p>${esc(typeof expenseHealthComment === "function" ? expenseHealthComment(metrics.health) : "収入と支出の登録状況を確認してください。")}</p>
      </section>
      <section class="analysis-summary">
        ${appMetricCard("世帯収入", yen(metrics.income), `最新月 ${ym}`)}
        ${appMetricCard("支出合計", yen(metrics.expense))}
        ${appMetricCard("貯蓄・投資", yen(metrics.saving))}
        ${appMetricCard("月次余力", yen(metrics.surplus), metrics.health)}
        ${appMetricCard("貯蓄率", percent(metrics.savingRatio))}
        ${appMetricCard("住宅ローン比率", percent(metrics.housingRatio))}
      </section>
    </article>`;
}

function payrollRecordsForAnalysisProfile(profile) {
  if (typeof payrollRecords !== "function" || typeof payrollSetActiveProfile !== "function" || typeof payrollActiveProfile !== "function") return [];
  const current = payrollActiveProfile();
  const readOne = (target) => {
    payrollSetActiveProfile(target);
    try { return payrollRecords().map((record) => ({ ...record, values: { ...record.values } })); }
    finally { payrollSetActiveProfile(current); }
  };
  if (profile !== "all") return readOne(profile);
  const merged = new Map();
  ["primary", "secondary"].forEach((target) => {
    readOne(target).forEach((record) => {
      if (!merged.has(record.ym)) merged.set(record.ym, { ym: record.ym, values: {} });
      const dest = merged.get(record.ym).values;
      Object.entries(record.values || {}).forEach(([key, value]) => {
        dest[key] = (Number(dest[key] || 0) + Number(value || 0));
      });
    });
  });
  return [...merged.values()].sort((a, b) => a.ym.localeCompare(b.ym));
}

function unifiedIncomeAnalysisHtml() {
  const records = payrollRecordsForAnalysisProfile(unifiedAnalysisIncomeProfile);
  const groupLabels = { pay: "支給", deduct: "控除", net: "手取り", overtime: "残業代", custom: "自分で選ぶ" };
  const groupKeys = {
    pay: ["base", "position", "workPay", "performance", "annualTotal", "lAllowance", "overtime", "efficiency", "duty", "remote", "commute", "grossTotal"],
    deduct: ["incomeTax", "residentTax", "healthIns", "careIns", "pension", "employmentIns", "deductionTotal"],
    net: ["netTotal"],
    overtime: ["overtime"],
  };
  const allOptions = typeof payrollSeriesOptions === "function" ? payrollSeriesOptions() : [];
  const checked = [...document.querySelectorAll(".unified-series-check:checked")].map((input) => input.value);
  const keys = payrollState.chartGroup === "custom" ? checked : groupKeys[payrollState.chartGroup] || ["netTotal"];
  const series = allOptions.filter((option) => keys.includes(option.key));
  const profileOptions = [
    ["all", "すべて"],
    ["primary", typeof payrollProfileLabel === "function" ? payrollProfileLabel("primary") : "ユーザー1"],
    ["secondary", typeof payrollProfileLabel === "function" ? payrollProfileLabel("secondary") : "ユーザー2"],
  ];
  return `
    <div class="income-analysis-toolbar unified-income-toolbar">
      <label>対象ユーザー<select id="unifiedIncomeProfile">${profileOptions.map(([value, label]) => `<option value="${value}" ${unifiedAnalysisIncomeProfile === value ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
      <label class="mobile-chart-select">表示項目<select id="unifiedIncomeChartGroup">${Object.entries(groupLabels).map(([key, label]) => `<option value="${key}" ${payrollState.chartGroup === key ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>
    </div>
    <div class="income-chart-controls unified-chart-tabs">
      ${Object.entries(groupLabels).map(([key, label]) => `<button class="subtab ${payrollState.chartGroup === key ? "active" : ""}" type="button" data-unified-chart-group="${key}">${esc(label)}</button>`).join("")}
    </div>
    <details class="chartDetails" ${payrollState.chartGroup === "custom" ? "open" : ""}>
      <summary>表示項目を選ぶ</summary>
      <div class="income-series-grid">${allOptions.map((option) => `<label><input class="unified-series-check" type="checkbox" value="${esc(option.key)}" ${keys.includes(option.key) ? "checked" : ""}>${esc(option.category)}｜${esc(option.name)}</label>`).join("")}</div>
    </details>
    <div class="income-chart-box">${typeof payrollChartSvg === "function" ? payrollChartSvg(records, series) : '<div class="empty-state">表示できるグラフがありません。</div>'}</div>`;
}

function appHasUnsavedEdits() {
  if (typeof editingId !== "undefined" && editingId) return true;
  if (typeof payrollState !== "undefined" && payrollState?.dirty) return true;
  return false;
}

function refreshAllViews({ silent = false } = {}) {
  if (appHasUnsavedEdits()) {
    if (!silent && typeof showToast === "function") showToast("編集中の内容があるため、更新を見送りました。", "warn");
    return false;
  }
  if (typeof loadMaster === "function") loadMaster();
  if (typeof loadOptions === "function") loadOptions();
  if (typeof loadCandidateStatus === "function") loadCandidateStatus();
  if (typeof loadImportedRows === "function") loadImportedRows();
  if (typeof loadLinkGroups === "function") loadLinkGroups();
  if (typeof invalidateMaintenanceCandidateCache === "function") invalidateMaintenanceCandidateCache();
  renderHeader();
  if (appMode === "summary") renderSummaryPanel();
  if (appMode === "income" && typeof mountIncomeManagement === "function") mountIncomeManagement();
  if (appMode === "expense" && typeof renderExpenseVisible === "function") renderExpenseVisible();
  if (appMode === "analysis") renderUnifiedAnalysis();
  if (typeof renderSettings === "function" && !byId("settingsModal")?.classList.contains("hidden")) renderSettings();
  if (typeof renderHelp === "function" && !byId("helpModal")?.classList.contains("hidden")) renderHelp();
  if (!silent && typeof showToast === "function") showToast("最新状態に更新しました。", "ok");
  return true;
}

function renderUnifiedAnalysis() {
  const panel = byId("panel-analysis");
  if (!panel) return;
  const review = typeof reviewTopItems === "function" ? reviewTopItems().slice(0, 5) : [];
  const expenseTables =
    typeof analysisTable === "function" && typeof enabledItems === "function" && typeof sumBy === "function" && typeof compactTopRows === "function"
      ? `<div class="analysis-grid expense-analysis-grid">
          ${analysisTable("カテゴリ別支出", compactTopRows(sumBy(enabledItems().filter((item) => item.flow === "expense"), (item) => item.category, (item) => item.monthlyAmount)))}
          ${analysisTable("固定/変動", compactTopRows(sumBy(enabledItems().filter((item) => item.flow === "expense"), (item) => displayValue("nature", item.nature), (item) => item.monthlyAmount)))}
        </div>`
      : "";
  panel.innerHTML = `
    <article class="panel income-native unified-analysis-panel">
      <div class="income-topbar"><div><h3>分析</h3><p>収入・支出・見直し候補を横断して確認します。</p></div></div>
      <section class="analysis-card analysis-card-wide">
        <h4>収入</h4>
        ${unifiedIncomeAnalysisHtml()}
      </section>
      <section class="analysis-card analysis-card-wide">
        <h4>支出</h4>
        ${expenseTables || '<div class="empty-state">支出データがありません。</div>'}
      </section>
      <section class="analysis-card analysis-card-wide">
        <div class="analysis-card-head"><h4>見直し候補</h4></div>
        <div class="review-card-list">
          ${review.length ? review.map((row, index) => `<article class="review-candidate-card"><span class="review-rank">${index + 1}</span><div><strong>${esc(row.item.name || "名称未設定")}</strong><b>${yen(row.item.monthlyAmount)}</b><small>${esc(row.reasons.join("・"))}</small><em>${esc(displayValue("nature", row.item.nature))} / ${row.item.reducible ? "削減可能" : "削減困難"}</em></div></article>`).join("") : '<div class="empty-state">優先的に見直す候補はありません。</div>'}
        </div>
      </section>
    </article>`;
  panel.querySelector("#unifiedIncomeProfile")?.addEventListener("change", (event) => {
    unifiedAnalysisIncomeProfile = event.target.value || "all";
    renderUnifiedAnalysis();
  });
  panel.querySelector("#unifiedIncomeChartGroup")?.addEventListener("change", (event) => {
    payrollState.chartGroup = event.target.value;
    renderUnifiedAnalysis();
  });
  panel.querySelectorAll("[data-unified-chart-group]").forEach((button) => {
    button.addEventListener("click", () => {
      payrollState.chartGroup = button.dataset.unifiedChartGroup;
      renderUnifiedAnalysis();
    });
  });
  panel.querySelectorAll(".unified-series-check").forEach((input) => {
    input.addEventListener("change", () => {
      payrollState.chartGroup = "custom";
      renderUnifiedAnalysis();
    });
  });
}
function bindPullToRefresh() {
  let startY = 0;
  let startX = 0;
  let pulling = false;
  let refreshing = false;
  let startScrollTop = 0;
  let lastRefreshAt = 0;
  const isMobile = () => window.matchMedia("(max-width: 768px)").matches;
  const isFormControl = (target) => Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  const scrollParent = (target) => {
    const nav = target.closest(".nav");
    if (nav && document.body.classList.contains("mobile-nav-open")) return nav;
    const modal = target.closest(".modal-card, .detail-panel, .help-body, .settings-content");
    if (modal) return modal;
    return document.scrollingElement || document.documentElement;
  };
  const scrollTopOf = (element) => element === document.scrollingElement || element === document.documentElement
    ? (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0)
    : element.scrollTop;
  const runRefresh = () => {
    const now = Date.now();
    if (refreshing || now - lastRefreshAt < 1200) return;
    refreshing = true;
    lastRefreshAt = now;
    requestAnimationFrame(() => {
      refreshAllViews();
      setTimeout(() => { refreshing = false; }, 700);
    });
  };
  window.addEventListener("touchstart", (event) => {
    if (!isMobile() || event.touches.length !== 1 || isFormControl(event.target)) return;
    const parent = scrollParent(event.target);
    startScrollTop = scrollTopOf(parent);
    if (startScrollTop > 2) return;
    const touch = event.touches[0];
    startY = touch.clientY;
    startX = touch.clientX;
    pulling = true;
  }, { passive: true });
  window.addEventListener("touchmove", (event) => {
    if (!pulling) return;
    const touch = event.touches[0];
    const dy = touch.clientY - startY;
    const dx = Math.abs(touch.clientX - startX);
    if (startScrollTop <= 2 && dy > 110 && dx < 50) {
      pulling = false;
      runRefresh();
    }
  }, { passive: true });
  window.addEventListener("touchend", (event) => {
    if (!pulling) return;
    pulling = false;
    const touch = event.changedTouches[0];
    const dy = touch.clientY - startY;
    const dx = Math.abs(touch.clientX - startX);
    if (startScrollTop <= 2 && dy > 90 && dx < 50) runRefresh();
  }, { passive: true });
  window.addEventListener("touchcancel", () => { pulling = false; }, { passive: true });
}

function bindMobileNavSwipe() {
  let startX = 0;
  let startY = 0;
  let tracking = false;
  const isInteractive = (target) => Boolean(target.closest("input, textarea, select, button, a, [contenteditable='true']"));
  window.addEventListener("touchstart", (event) => {
    if (!window.matchMedia("(max-width: 768px)").matches || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const navOpen = document.body.classList.contains("mobile-nav-open");
    if (!navOpen && touch.clientX > 24) return;
    if (isInteractive(event.target) && !navOpen) return;
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = true;
  }, { passive: true });
  window.addEventListener("touchend", (event) => {
    if (!tracking) return;
    tracking = false;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (Math.abs(dy) > 50 || Math.abs(dx) < 70) return;
    if (dx > 0 && startX <= 24) openMobileNav();
    if (dx < 0 && document.body.classList.contains("mobile-nav-open")) closeMobileNav();
  }, { passive: true });
}

function switchAppMode(mode) {
  if (typeof appMode === "string") appScrollPositions[appMode] = window.scrollY || 0;
  appMode = ["summary", "income", "expense", "analysis"].includes(mode) ? mode : "summary";
  const modeText = {
    summary: {
      title: "サマリー",
      copy: "家計全体の現在地を確認します。",
    },
    income: {
      title: "収入管理",
      copy: "月収登録と登録データを扱います。",
    },
    expense: {
      title: "支出管理",
      copy: "支出項目を整え、外部データを参照します。",
    },
    analysis: {
      title: "分析",
      copy: "収入と支出を横断して確認します。",
    },
  }[appMode];

  if (byId("navTitle")) byId("navTitle").textContent = modeText.title;
  if (byId("navCopy")) byId("navCopy").textContent = modeText.copy;
  document.querySelectorAll("[data-app-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.appMode === appMode);
  });
  document.querySelectorAll(".expense-view").forEach((element) => {
    element.classList.toggle("hidden", appMode !== "expense");
  });
  byId("panel-summary")?.classList.toggle("hidden", appMode !== "summary");
  byId("panel-analysis")?.classList.toggle("hidden", appMode !== "analysis");
  byId("panel-income")?.classList.toggle("hidden", appMode !== "income");
  renderHeader();
  if (appMode === "summary") renderSummaryPanel();
  if (appMode === "income") mountIncomeManagement();
  if (appMode === "expense") renderExpenseVisible();
  if (appMode === "analysis") renderUnifiedAnalysis();
  requestAnimationFrame(() => window.scrollTo(0, appScrollPositions[appMode] || 0));
}

function init() {
  if (window.householdAppStarted) return;
  window.householdAppStarted = true;
  data = window.HOUSEHOLD_DATA;
  if (!data) throw new Error("家計データを読み込めませんでした。");
  migrateLegacyStorage();

  loadMaster();
  loadOptions();
  loadCandidateStatus();
  loadImportedRows();
  loadLinkGroups();

  bindAppModeEvents();
  bindCommonUiEvents();
  bindHouseholdEvents();
  bindImportEvents();

  switchAppMode("summary");
  rerender();
}

window.startHouseholdApp = init;
if (typeof window.householdAuthPassed === "function" && window.householdAuthPassed()) {
  init();
}






