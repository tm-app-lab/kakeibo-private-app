// storage.js

const yenFormatter = new Intl.NumberFormat("ja-JP", {
  maximumFractionDigits: 0,
});

const STORAGE_KEY = "household-maintenance-master-v3";
const OPTION_STORAGE_KEY = "household-maintenance-options-v2";
const CANDIDATE_STATUS_KEY = "household-maintenance-candidate-status-v2";
const IMPORT_STORAGE_KEY = "household-maintenance-imported-rows-v1";
const MASTER_UPDATED_KEY = "household-maintenance-master-updated-at-v1";
const HOUSEHOLD_SNAPSHOT_KEY = "household-maintenance-snapshots-v1";
const LINK_GROUPS_KEY = "household-maintenance-link-groups-v1";
const FULL_BACKUP_SCHEMA_VERSION = 1;
const FULL_BACKUP_AUTO_RESTORE_KEY = "household-maintenance-full-backup-before-restore-v1";

let data = null;
let master = [];
let optionLists = {};
let candidateStatus = {};
let importedRows = [];
let linkGroups = [];
let sortState = { key: "status", direction: "asc" };
let columnFilters = {};
let selectedId = null;
let editingId = null;
let editDraft = null;
let pendingCandidate = null;
let pendingUpdateCandidate = null;
let pendingUpdateAction = "amount";
let masterViewMode = "cards";
let selectedExpensePerson = "";
let candidateFilters = {
  source: "all",
  confidence: "all",
  status: "all",
  changedOnly: false,
};
let highlightedExternalKey = null;
let returnExternalKey = null;
let returnExternalMonth = null;
let returnExternalTab = null;
let importEditMode = false;
let appMode = "summary";

function readObjectStorage(key, fallback = {}) {
  const value = readJsonStorage(key, fallback);
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function readArrayStorage(key, fallback = []) {
  const value = readJsonStorage(key, fallback);
  return Array.isArray(value) ? value : fallback;
}

function loadMaster() {
  const defaults = buildDefaultMaster();
  const saved = readObjectStorage(STORAGE_KEY, {});
  master = defaults.map((item) => {
    const merged = normalizeJudgmentFlags({ ...item, ...(saved[item.id] || {}) });
    merged.alignmentId = alignmentId(merged);
    merged.amountHistory ||= [];
    merged.externalAliases = externalAliases(merged);
    merged.incomeLinks ||= [];
    merged.paymentMonths ||= [];
    merged.bimonthlyPattern ||= "even";
    return merged;
  });
  for (const item of Object.values(saved)) {
    if (item.source === "manual" && !master.some((entry) => entry.id === item.id)) {
      const normalized = normalizeJudgmentFlags(item);
      master.unshift({ ...normalized, alignmentId: alignmentId(normalized), amountHistory: normalized.amountHistory || [], externalAliases: externalAliases(normalized), incomeLinks: normalized.incomeLinks || [], paymentMonths: normalized.paymentMonths || [], bimonthlyPattern: normalized.bimonthlyPattern || "even" });
    }
  }
  selectedId ||= master[0]?.id || null;
}

function saveMaster() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(master.map((item) => [item.id, item]))));
  localStorage.setItem(MASTER_UPDATED_KEY, new Date().toISOString());
}


function loadOptions() {
  const saved = readObjectStorage(OPTION_STORAGE_KEY, {});
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
    frequency: ["monthly", "yearly", "bimonthly", "semiannual"],
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
  candidateStatus = readObjectStorage(CANDIDATE_STATUS_KEY, {});
}

function saveCandidateStatus() {
  localStorage.setItem(CANDIDATE_STATUS_KEY, JSON.stringify(candidateStatus));
}

function seededImportedRows() {
  const normalizeMonth = (value) => String(value || "").slice(0, 7).replace("/", "-");
  const moneyForwardRows = (data.moneyForward?.transactions || data.moneyForward?.rows || []).map((row) => ({
    ...row,
    sourceType: "moneyforward",
    month: row.month || normalizeMonth(row.date),
    absAmount: row.absAmount ?? Math.abs(Number(row.amount || 0)),
  }));
  const rakutenRows = (data.rakutenCard?.rows || []).map((row) => ({
    ...row,
    sourceType: "rakuten",
    month: row.month || normalizeMonth(row.date || row.useDate),
    amount: Number(row.amount || row.useAmount || 0),
  }));
  return [...moneyForwardRows, ...rakutenRows].filter((row) => row.month && (row.content || row.date || row.amount));
}

function normalizeStoredImportedRows(rows = []) {
  const normalizeMonth = (value) => String(value || "").slice(0, 7).replace("/", "-");
  return rows
    .map((row) => {
      const sourceType = row.sourceType || (row.paymentMethod || row.paymentAmount || row.user ? "rakuten" : "moneyforward");
      const month = row.month || normalizeMonth(row.date || row.useDate);
      return {
        ...row,
        sourceType,
        month,
        absAmount: row.absAmount ?? Math.abs(Number(row.amount || row.paymentAmount || 0)),
      };
    })
    .filter((row) => row.month && (row.content || row.date || row.amount || row.paymentAmount));
}

function loadImportedRows() {
  const saved = readArrayStorage(IMPORT_STORAGE_KEY, []);
  importedRows = normalizeStoredImportedRows(saved.length ? saved : seededImportedRows());
}

function saveImportedRows() {
  localStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify(importedRows));
}

function loadLinkGroups() {
  linkGroups = readArrayStorage(LINK_GROUPS_KEY, []);
}

function saveLinkGroups() {
  localStorage.setItem(LINK_GROUPS_KEY, JSON.stringify(linkGroups));
}

function createHouseholdSnapshot(reason = "before-update-candidate", meta = {}) {
  const snapshots = readJsonStorage(HOUSEHOLD_SNAPSHOT_KEY, []);
  const snapshot = {
    id: `household-snapshot-${Date.now()}`,
    reason,
    createdAt: new Date().toISOString(),
    meta,
    master: Object.fromEntries(master.map((item) => [item.id, item])),
    candidateStatus: { ...candidateStatus },
    importedRows: [...importedRows],
    masterUpdatedAt: localStorage.getItem(MASTER_UPDATED_KEY) || "",
  };
  writeJsonStorage(HOUSEHOLD_SNAPSHOT_KEY, [snapshot, ...(Array.isArray(snapshots) ? snapshots : [])].slice(0, 5));
  return snapshot.id;
}

function readJsonStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function payrollBackupProfile(profile) {
  const suffix = profile === "secondary" ? "_secondary" : "";
  const profileNameKey = profile === "secondary" ? "positivePayrollProfileName_secondary" : "positivePayrollProfileName_primary";
  const lastSavedKey = profile === "secondary" ? "positivePayrollLastSaved_secondary" : "positivePayrollLastSaved_primary";
  return {
    profileName: localStorage.getItem(profileNameKey) || "",
    lastSaved: readJsonStorage(lastSavedKey, null),
    userRecords: readJsonStorage(`payrollUserRecords${suffix}`, []),
    deletedMonths: readJsonStorage(`payrollDeletedMonths${suffix}`, []),
  };
}

function createFullBackupPayload() {
  return {
    schemaVersion: FULL_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: "Kakei Compass",
    household: {
      master: readJsonStorage(STORAGE_KEY, {}),
      candidateStatus: readJsonStorage(CANDIDATE_STATUS_KEY, {}),
      masterUpdatedAt: localStorage.getItem(MASTER_UPDATED_KEY) || "",
      linkGroups: readJsonStorage(LINK_GROUPS_KEY, []),
    },
    imports: {
      rows: readJsonStorage(IMPORT_STORAGE_KEY, []),
    },
    payroll: {
      activeProfile: localStorage.getItem("positivePayrollActiveProfile") || "primary",
      profiles: {
        primary: payrollBackupProfile("primary"),
        secondary: payrollBackupProfile("secondary"),
      },
    },
    settings: {
      householdOptions: readJsonStorage(OPTION_STORAGE_KEY, {}),
    },
  };
}

function downloadJson(payload, fileName) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function exportFullBackup() {
  const payload = createFullBackupPayload();
  const date = payload.exportedAt.slice(0, 10).replaceAll("-", "");
  downloadJson(payload, `household-maintenance-full-backup-${date}.json`);
  if (typeof showToast === "function") showToast("バックアップを出力しました。", "ok");
}

function validateFullBackupPayload(payload) {
  if (!payload || typeof payload !== "object") throw new Error("バックアップファイルの形式が正しくありません。");
  if (payload.schemaVersion !== FULL_BACKUP_SCHEMA_VERSION) {
    throw new Error(`対応していないバックアップ形式です。schemaVersion: ${payload.schemaVersion ?? "不明"}`);
  }
  if (!payload.household || !payload.imports || !payload.payroll || !payload.settings) {
    throw new Error("バックアップファイルに必要なデータが不足しています。");
  }
}

function writePayrollProfileBackup(profile, profileData = {}) {
  const suffix = profile === "secondary" ? "_secondary" : "";
  const profileNameKey = profile === "secondary" ? "positivePayrollProfileName_secondary" : "positivePayrollProfileName_primary";
  const lastSavedKey = profile === "secondary" ? "positivePayrollLastSaved_secondary" : "positivePayrollLastSaved_primary";
  if (profileData.profileName) localStorage.setItem(profileNameKey, profileData.profileName);
  else localStorage.removeItem(profileNameKey);
  if (profileData.lastSaved) writeJsonStorage(lastSavedKey, profileData.lastSaved);
  else localStorage.removeItem(lastSavedKey);
  writeJsonStorage(`payrollUserRecords${suffix}`, Array.isArray(profileData.userRecords) ? profileData.userRecords : []);
  writeJsonStorage(`payrollDeletedMonths${suffix}`, Array.isArray(profileData.deletedMonths) ? profileData.deletedMonths : []);
}

function refreshAfterFullRestore() {
  selectedId = null;
  editingId = null;
  editDraft = null;
  pendingCandidate = null;
  highlightedExternalKey = null;
  returnExternalKey = null;
  returnExternalMonth = null;
  returnExternalTab = null;
  importEditMode = false;
  loadMaster();
  loadOptions();
  loadCandidateStatus();
  loadImportedRows();
  loadLinkGroups();
  if (typeof payrollState !== "undefined") {
    payrollState.values = payrollBaseValues();
    payrollState.inputStarted = false;
    payrollState.reviewConfirmed = false;
    payrollState.dirty = false;
  }
  rerender();
  if (appMode === "income") mountIncomeManagement();
}

function restoreFullBackupPayload(payload) {
  validateFullBackupPayload(payload);
  localStorage.setItem(
    FULL_BACKUP_AUTO_RESTORE_KEY,
    JSON.stringify({ ...createFullBackupPayload(), backupReason: "before-full-restore", backedUpAt: new Date().toISOString() }),
  );
  writeJsonStorage(STORAGE_KEY, payload.household.master || {});
  writeJsonStorage(CANDIDATE_STATUS_KEY, payload.household.candidateStatus || {});
  writeJsonStorage(LINK_GROUPS_KEY, Array.isArray(payload.household.linkGroups) ? payload.household.linkGroups : []);
  if (payload.household.masterUpdatedAt) localStorage.setItem(MASTER_UPDATED_KEY, payload.household.masterUpdatedAt);
  else localStorage.removeItem(MASTER_UPDATED_KEY);
  writeJsonStorage(IMPORT_STORAGE_KEY, Array.isArray(payload.imports.rows) ? payload.imports.rows : []);
  writeJsonStorage(OPTION_STORAGE_KEY, payload.settings.householdOptions || {});
  localStorage.setItem("positivePayrollActiveProfile", payload.payroll.activeProfile === "secondary" ? "secondary" : "primary");
  writePayrollProfileBackup("primary", payload.payroll.profiles?.primary || {});
  writePayrollProfileBackup("secondary", payload.payroll.profiles?.secondary || {});
  refreshAfterFullRestore();
}

function importFullBackupFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      validateFullBackupPayload(payload);
      const ok = window.confirm("全体バックアップを復元します。現在のデータは復元前に自動退避されます。実行してよろしいですか？");
      if (!ok) return;
      restoreFullBackupPayload(payload);
      if (typeof showToast === "function") showToast("バックアップを復元しました。", "ok");
    } catch (error) {
      if (typeof showToast === "function") showToast(error.message || "バックアップを復元できませんでした。既存データは変更していません。", "warn");
      else window.alert(error.message || "バックアップを復元できませんでした。既存データは変更していません。");
    }
  };
  reader.readAsText(file);
}
