// app.js
// 全体の初期化と、収入管理 / 支出管理の表示切替だけを担当します。

const appScrollPositions = { income: 0, expense: 0 };

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

  if (byId("navTitle")) byId("navTitle").textContent = modeText.title;
  if (byId("navCopy")) byId("navCopy").textContent = modeText.copy;
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



