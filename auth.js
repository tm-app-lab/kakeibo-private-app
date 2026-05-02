// 個人利用向けの簡易ガードです。GitHub Pages上のHTML/JSは閲覧可能なため、
// 本格的な非公開化にはサーバー側認証や認証付きホスティングが必要です。
const APP_PASSWORD = "household2026";
const AUTH_STORAGE_KEY = "household_app_auth_passed";

function householdAuthPassed() {
  return localStorage.getItem(AUTH_STORAGE_KEY) === "true";
}

function showAuthScreen() {
  document.body.classList.add("auth-locked");
  byId("authScreen")?.classList.remove("hidden");
  byId("authPassword")?.focus();
}

function showAuthenticatedApp() {
  document.body.classList.remove("auth-locked");
  byId("authScreen")?.classList.add("hidden");
  byId("authPassword").value = "";
  byId("authError").textContent = "";
  if (typeof window.startHouseholdApp === "function" && !window.householdAppStarted) {
    window.startHouseholdApp();
  }
}

function submitAuth(event) {
  event.preventDefault();
  const input = byId("authPassword");
  const error = byId("authError");
  if ((input?.value || "") === APP_PASSWORD) {
    localStorage.setItem(AUTH_STORAGE_KEY, "true");
    showAuthenticatedApp();
    return;
  }
  if (error) error.textContent = "パスワードが違います。";
  input?.select();
}

function householdLogout() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  if (typeof closeMobileNav === "function") closeMobileNav();
  showAuthScreen();
}

window.householdAuthPassed = householdAuthPassed;
window.householdLogout = householdLogout;

byId("authForm")?.addEventListener("submit", submitAuth);
byId("logoutApp")?.addEventListener("click", householdLogout);

if (householdAuthPassed()) {
  showAuthenticatedApp();
} else {
  showAuthScreen();
}
