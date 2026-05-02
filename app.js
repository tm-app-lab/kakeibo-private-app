// app.js
// 全体の初期化と、収入管理 / 支出管理の表示切替だけを担当します。

const appScrollPositions = { income: 0, expense: 0 };

function bindAppModeEvents() {
  document.querySelectorAll("[data-app-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      switchAppMode(button.dataset.appMode);
      closeMobileNav();
    });
  });
  byId("mobileNavToggle")?.addEventListener("click", toggleMobileNav);
  byId("mobileNavBackdrop")?.addEventListener("click", closeMobileNav);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMobileNav();
  });
  window.matchMedia("(min-width: 769px)").addEventListener("change", closeMobileNav);
  window.matchMedia("(max-width: 768px)").addEventListener("change", () => {
    if (typeof appMode === "string" && appMode === "expense" && typeof renderMaster === "function") renderMaster();
  });
}

function toggleMobileNav() {
  document.body.classList.toggle("mobile-nav-open");
  const open = document.body.classList.contains("mobile-nav-open");
  byId("mobileNavToggle")?.setAttribute("aria-expanded", open ? "true" : "false");
  byId("mobileNavToggle")?.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
  byId("mobileNavBackdrop")?.classList.toggle("hidden", !open);
}

function closeMobileNav() {
  document.body.classList.remove("mobile-nav-open");
  byId("mobileNavToggle")?.setAttribute("aria-expanded", "false");
  byId("mobileNavToggle")?.setAttribute("aria-label", "メニューを開く");
  byId("mobileNavBackdrop")?.classList.add("hidden");
}

function switchAppMode(mode) {
  if (typeof appMode === "string") appScrollPositions[appMode] = window.scrollY || 0;
  appMode = mode === "expense" ? "expense" : "income";
  const modeText = {
    income: {
      title: "収入管理",
      copy: "収入と支出を管理し、家計全体の状況を確認します。",
    },
    expense: {
      title: "支出管理",
      copy: "支出項目を整え、外部データを参照します。",
    },
  }[appMode];

  byId("navTitle").textContent = modeText.title;
  byId("navCopy").textContent = modeText.copy;
  document.querySelectorAll("[data-app-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.appMode === appMode);
  });
  document.querySelectorAll(".expense-view").forEach((element) => {
    element.classList.toggle("hidden", appMode !== "expense");
  });
  byId("panel-income")?.classList.toggle("hidden", appMode !== "income");
  renderHeader();
  if (appMode === "income") mountIncomeManagement();
  if (appMode === "expense") renderExpenseVisible();
  requestAnimationFrame(() => window.scrollTo(0, appScrollPositions[appMode] || 0));
}

function init() {
  if (window.householdAppStarted) return;
  window.householdAppStarted = true;
  data = window.HOUSEHOLD_DATA;
  if (!data) throw new Error("家計データを読み込めませんでした。");

  loadMaster();
  loadOptions();
  loadCandidateStatus();
  loadImportedRows();
  loadLinkGroups();

  bindAppModeEvents();
  bindCommonUiEvents();
  bindHouseholdEvents();
  bindImportEvents();

  switchAppMode("income");
  rerender();
}

window.startHouseholdApp = init;
if (typeof window.householdAuthPassed === "function" && window.householdAuthPassed()) {
  init();
}



