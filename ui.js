// ui.js

function byId(id) {
  return document.getElementById(id);
}

function yen(value) {
  return `${yenFormatter.format(Math.round(Number(value || 0)))}円`;
}

function costText(item) {
  const amount = Number(item?.monthlyAmount || 0);
  const labels = { monthly: "/月", yearly: "/年", bimonthly: "/回", semiannual: "/回" };
  return `<span class="amount-stack"><b>${yen(amount)}${labels[item?.frequency] || "/月"}</b><small>${yen(annualizedCost(item))}/年</small></span>`;
}

function annualizedCost(item) {
  const amount = Number(item?.monthlyAmount || 0);
  if (item?.frequency === "yearly") return amount;
  if (item?.frequency === "bimonthly") return amount * 6;
  if (item?.frequency === "semiannual") return amount * 2;
  return amount * 12;
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
    frequency: { monthly: "毎月", yearly: "毎年", bimonthly: "隔月", semiannual: "半年" },
  };
  return maps[field]?.[value] || value || "-";
}

function optionValue(field, label) {
  const maps = {
    status: { "通常": "normal", "編集中": "editing" },
    nature: { "固定": "fixed", "変動": "variable" },
    flow: { "支出": "expense", "貯蓄・投資": "saving", "貯蓄": "saving" },
    frequency: { "毎月": "monthly", "毎年": "yearly", "年払い": "yearly", "隔月": "bimonthly", "半年": "semiannual", "半年払い": "semiannual" },
  };
  return maps[field]?.[label] || label;
}


function rerender() {
  renderHeader();
  if (appMode === "expense") renderExpenseVisible();
  renderHelp();
}

function activeExpenseTab() {
  return document.querySelector(".expense-view .tab.active")?.dataset.tab || "master";
}

function renderExpenseVisible() {
  const tab = activeExpenseTab();
  if (tab === "summary") renderExpenseSummary();
  if (tab === "master") renderMaster();
  if (tab === "candidates") renderUpdateCandidates();
  if (tab === "import") renderImport();
  if (tab === "expense-analysis") renderExpenseAnalysis();
  if (tab === "expense-data") renderExpenseData();
}

function renderHeader() {
  if (appMode === "income") byId("navUpdatedLabel").textContent = payrollLastSavedDateLabel();
  else byId("navUpdatedLabel").textContent = lastUpdatedLabel();
  renderHouseholdBalanceCard();
}

function lastUpdatedLabel() {
  const value = localStorage.getItem(MASTER_UPDATED_KEY);
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function previousMonthYm(date = new Date()) {
  const target = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
}

function payrollRecordsForProfile(profile) {
  const suffix = profile === "secondary" ? "_secondary" : "";
  const deleted = new Set(readJsonStorage(`payrollDeletedMonths${suffix}`, []));
  const map = new Map();
  if (profile === "primary" && typeof payrollData === "function" && typeof payrollNormalizeRecord === "function") {
    payrollData().initialRecords.map(payrollNormalizeRecord).forEach((record) => {
      if (!deleted.has(record.ym)) map.set(record.ym, record);
    });
  }
  readJsonStorage(`payrollUserRecords${suffix}`, []).forEach((record) => {
    if (!deleted.has(record.ym) && typeof payrollNormalizeRecord === "function") map.set(record.ym, payrollNormalizeRecord(record));
  });
  return [...map.values()].sort((a, b) => a.ym.localeCompare(b.ym));
}

function monthlyEquivalentCost(item) {
  const amount = Number(item?.monthlyAmount || 0);
  if (item?.frequency === "yearly") return amount / 12;
  if (item?.frequency === "bimonthly") return amount / 2;
  if (item?.frequency === "semiannual") return amount / 6;
  return amount;
}

function isDeductedPayment(item) {
  return normalize(item?.payment || "").includes(normalize("天引き"));
}

function householdBalanceMetrics() {
  const ym = previousMonthYm();
  const profiles = ["primary", "secondary"];
  const incomeByPerson = profiles.map((profile) => {
    const record = payrollRecordsForProfile(profile).find((row) => row.ym === ym);
    const label = typeof payrollProfileLabel === "function" ? payrollProfileLabel(profile) : profile;
    const net = record && typeof payrollValue === "function" ? payrollValue(record, "netTotal") : 0;
    const commute = record && typeof payrollValue === "function" ? payrollValue(record, "commute") : 0;
    return { profile, label, income: Math.max(0, net - commute) };
  });
  const expenseItems = (master || []).filter((item) => {
    if (item.enabled === false) return false;
    if (item.flow !== "expense") return false;
    // 天引きは給与の手取り額にすでに反映済みなので、ここで再度控除すると二重計上になります。
    if (isDeductedPayment(item)) return false;
    return true;
  });
  const expense = expenseItems.reduce((sum, item) => sum + monthlyEquivalentCost(item), 0);
  const income = incomeByPerson.reduce((sum, row) => sum + row.income, 0);
  const balance = income - expense;
  const status = balance < 0 ? "赤字" : balance < income * 0.08 ? "警戒" : "健全";
  const expensesByPerson = new Map();
  expenseItems.forEach((item) => expensesByPerson.set(item.person || "", (expensesByPerson.get(item.person || "") || 0) + monthlyEquivalentCost(item)));
  const users = incomeByPerson
    .filter((row) => row.income > 0)
    .map((row) => ({ label: row.label, balance: row.income - (expensesByPerson.get(row.label) || 0) }));
  return { ym, income, expense, balance, status, users };
}

function renderHouseholdBalanceCard() {
  const card = byId("householdBalanceCard");
  if (!card) return;
  const metrics = householdBalanceMetrics();
  const [year, month] = metrics.ym.split("-");
  card.className = `nav-balance-card ${metrics.status === "赤字" ? "danger" : metrics.status === "警戒" ? "warn" : "good"}`;
  card.innerHTML = `
    <div class="nav-balance-head"><span>当月収支 <small>(${year}年${Number(month)}月)</small></span></div>
    <div class="nav-balance-main"><strong>${metrics.balance >= 0 ? "+" : ""}${yen(metrics.balance)}</strong><b>${esc(metrics.status)}</b></div>
    ${metrics.users.length ? `<ul>${metrics.users.map((row) => `<li><span>${esc(row.label)}</span><em>${row.balance >= 0 ? "+" : ""}${yen(row.balance)}</em></li>`).join("")}</ul>` : ""}
  `;
}

function renderHelp() {
  const sections = [
    ["help-purpose", "アプリの目的"],
    ["help-flow", "全体の使い方"],
    ["help-initial", "初期設定"],
    ["help-income", "収入管理"],
    ["help-expense", "支出管理"],
    ["help-external", "外部データ"],
    ["help-candidates", "更新候補"],
    ["help-links", "紐づけ管理"],
    ["help-analysis", "分析"],
    ["help-balance", "家計サマリー"],
    ["help-data", "データ管理"],
    ["help-backup", "バックアップ / 復元"],
    ["help-examples", "よくある使い方"],
    ["help-notes", "注意点"],
  ];
  byId("helpContent").innerHTML = `
    <aside class="help-toc" aria-label="ヘルプ目次">
      <h4>目次</h4>
      <nav class="help-toc-list">
        ${sections.map(([id, label], index) => `<button type="button" class="help-toc-link${index === 0 ? " active" : ""}" data-help-target="${id}">${index + 1}. ${label}</button>`).join("")}
      </nav>
    </aside>
    <div id="helpBody" class="help-body" tabindex="0">
      <section id="help-purpose" class="help-section">
        <h4>1. アプリの目的</h4>
        <p class="help-lead">このアプリは、家計を細かく記録するための家計簿ではありません。収入に対して支出設計が適切か、どこを見直すべきかを判断するための道具です。</p>
        <div class="help-grid">
          <div><h5>目的</h5><p>収入・支出・外部データを統合し、世帯として無理のない支出水準かを確認します。</p></div>
          <div><h5>できること</h5><ul><li>当月収支と健全性を確認できます。</li><li>支出項目の最新化候補を確認できます。</li><li>収入天引き、支出項目、外部明細を紐づけて判断できます。</li></ul></div>
        </div>
        <h5>操作手順</h5>
        <ol><li>左メニューの当月収支で全体感を確認します。</li><li>収入管理で給与データを登録します。</li><li>支出管理で支出設計を整えます。</li><li>外部データを取り込み、更新候補を確認します。</li></ol>
        <div class="help-note"><strong>注意点</strong><span>外部データは補完・確認用です。取り込んだだけで支出項目を自動上書きすることはありません。</span></div>
        <p class="help-miss"><strong>よくあるミス：</strong>家計簿のように毎月すべての明細を分類しようとすること。目的は「支出設計の判断」です。</p>
      </section>

      <section id="help-flow" class="help-section">
        <h4>2. 全体の使い方（全体フロー）</h4>
        <h5>目的</h5><p>毎月の作業を短くし、判断に必要な情報だけを更新します。</p>
        <h5>できること</h5><ul><li>収入、支出、外部データ、更新候補を順番に確認できます。</li><li>迷った場合は左メニューのヘルプからいつでも戻れます。</li></ul>
        <h5>操作手順</h5><ol><li>収入管理で対象月の給与を保存します。</li><li>外部データでMoneyForwardまたは楽天カードCSVを取り込みます。</li><li>支出管理の更新候補で差額を確認します。</li><li>必要な候補だけ確認モーダルから反映します。</li><li>サマリーと分析で支出設計の健全性を確認します。</li></ol>
        <div class="help-note"><strong>注意点</strong><span>「反映する」「復元」「初期値へ戻す」など、データに影響する操作は内容を確認してから実行してください。</span></div>
        <p class="help-miss"><strong>よくあるミス：</strong>CSVを取り込んだだけで支出項目が更新されたと思い込むこと。更新は必ず候補確認後です。</p>
      </section>

      <section id="help-initial" class="help-section">
        <h4>3. 初期設定</h4>
        <h5>目的</h5><p>ユーザー名、支出種別、紐づけ、バックアップを整え、普段の入力を短くします。</p>
        <h5>できること</h5><ul><li>収入管理のユーザー表示名を変更できます。</li><li>支出種別を編集できます。</li><li>収入・支出・外部データの紐づけグループを作れます。</li><li>全体バックアップと復元を実行できます。</li></ul>
        <h5>操作手順</h5><ol><li>左メニュー下部の設定を開きます。</li><li>収入表示名でユーザーを選び、名称を編集して保存します。</li><li>支出種別で分類名を整えます。</li><li>必要に応じて紐づけ管理で関連項目をまとめます。</li><li>作業前後にバックアップを保存します。</li></ol>
        <div class="help-note"><strong>注意点</strong><span>支出種別は分析に使う大分類です。細かい説明は支出項目の内容や詳細に入れてください。</span></div>
        <p class="help-miss"><strong>よくあるミス：</strong>支払者や支払方法を設定画面で探すこと。現在の設定画面は支出種別の編集に絞っています。</p>
      </section>

      <section id="help-income" class="help-section">
        <h4>4. 収入管理</h4>
        <h5>目的</h5><p>毎月の給与データを短時間で登録し、手取り・控除・前月差を確認します。</p>
        <h5>できること</h5><ul><li>写真から読込、前月コピー、手入力、差分入力を使えます。</li><li>入力中にKPIとサマリーが更新されます。</li><li>確認済にしてから保存できます。</li><li>分析とデータ管理で過去データを確認できます。</li></ul>
        <h5>操作手順</h5><ol><li>収入管理を開き、右上でユーザーを選びます。</li><li>入力タブで登録年月を選びます。</li><li>写真から読込、前月コピー、手入力、差分入力のいずれかで入力します。</li><li>金額を確認し、確認済を押します。</li><li>保存します。保存後に登録完了と前月比が表示されます。</li></ol>
        <div class="help-keywords"><span>前月コピー</span><span>写真読み込み</span><span>差分入力</span><span>サマリー</span></div>
        <div class="help-note"><strong>注意点</strong><span>写真を選択すると自動で読込を開始します。読込できない場合でも手入力と保存は使えます。</span></div>
        <p class="help-miss"><strong>よくあるミス：</strong>登録年月を変更した後、入力内容を確認せず保存すること。保存前にKPIと明細を見てください。</p>
      </section>

      <section id="help-expense" class="help-section">
        <h4>5. 支出管理</h4>
        <h5>目的</h5><p>支出項目を網羅し、世帯収入に対して無理のない支出設計かを判断します。</p>
        <h5>できること</h5><ul><li>入力タブでカード表示とリスト表示を切り替えられます。</li><li>支払者を「すべて」または個別に切り替えられます。</li><li>支出種別、固定/変動、必須/任意、削減可能かを設定できます。</li><li>毎月、毎年、隔月、半年の支払い時期に対応します。</li></ul>
        <h5>操作手順</h5><ol><li>支出管理の入力タブを開きます。</li><li>支払者を選びます。全体を見る場合は「すべて」を選びます。</li><li>カードまたはリストから項目を選びます。</li><li>詳細カードで編集を押し、必要項目を変更します。</li><li>保存します。金額変更は履歴として残ります。</li></ol>
        <div class="help-note"><strong>注意点</strong><span>支払者が「すべて」のまま新規作成する場合は、対象支払者を確認してください。</span></div>
        <p class="help-miss"><strong>よくあるミス：</strong>「固定/変動」と「必須/任意」を同じ意味で使うこと。固定費でも削減可能なもの、任意でも継続したいものがあります。</p>
      </section>

      <section id="help-external" class="help-section">
        <h4>6. 外部データ</h4>
        <h5>目的</h5><p>MoneyForwardと楽天カードのCSVを取り込み、支出項目の確認材料として使います。</p>
        <h5>できること</h5><ul><li>複数CSVをまとめて取り込めます。</li><li>MoneyForwardと楽天カードをタブで切り替えられます。</li><li>年月選択と前月・翌月ボタンで明細を移動できます。</li><li>明細の編集、削除、詳細確認ができます。</li></ul>
        <h5>操作手順</h5><ol><li>支出管理の外部データタブを開きます。</li><li>CSVを選択します。形式は自動判定されます。</li><li>MoneyForwardまたは楽天カードを選びます。</li><li>年月を選び、明細を確認します。</li><li>必要なら編集モードで明細を整理します。</li></ol>
        <div class="help-note"><strong>注意点</strong><span>同じ月のCSVを再取り込みした場合は二重登録を避ける処理を行いますが、取り込み後は件数と金額を確認してください。</span></div>
        <p class="help-miss"><strong>よくあるミス：</strong>MoneyForwardの楽天カード引落と、楽天カード明細を二重に支出として扱うこと。紐づけや更新候補で確認してください。</p>
      </section>

      <section id="help-candidates" class="help-section">
        <h4>7. 更新候補</h4>
        <h5>目的</h5><p>外部データや収入管理から、支出項目の金額変更が必要そうなものを確認します。</p>
        <h5>できること</h5><ul><li>現在額、候補額、差額、差額率、信頼度、根拠を確認できます。</li><li>反映、保留、無視を選べます。</li><li>反映時は確認モーダルを挟み、履歴を残します。</li></ul>
        <h5>操作手順</h5><ol><li>支出管理の更新候補タブを開きます。</li><li>未確認、差額あり、信頼度、データ元で絞り込みます。</li><li>根拠を確認します。</li><li>変更する場合は反映するを押します。</li><li>確認モーダルで変更前後を見て、反映します。</li></ol>
        <div class="help-note"><strong>注意点</strong><span>候補は提案です。自動上書きは行いません。信頼度が高くても内容を確認してください。</span></div>
        <p class="help-miss"><strong>よくあるミス：</strong>一時的な支出や返品を月額支出として反映してしまうこと。</p>
      </section>

      <section id="help-links" class="help-section">
        <h4>8. 紐づけ管理</h4>
        <h5>目的</h5><p>収入項目、支出項目、外部データが同じ実体を表す場合に、関係をまとめて管理します。</p>
        <h5>できること</h5><ul><li>収入項目A + 収入項目B = 支出項目C = 外部データD のようにグループ化できます。</li><li>保存済みグループを再編集できます。</li><li>外部データ項目は重複をまとめた候補から選べます。</li><li>紐づけ由来の変更候補を更新候補に出せます。</li></ul>
        <h5>操作手順</h5><ol><li>設定を開き、紐づけ管理へ移動します。</li><li>グループ名を入力します。</li><li>収入、支出、外部データの各エリアへ項目を追加します。</li><li>保存します。</li><li>変更が検知されたら更新候補で確認します。</li></ol>
        <div class="help-note"><strong>注意点</strong><span>紐づけは関連付けです。支出項目の金額を変更するには、更新候補でユーザー確認が必要です。</span></div>
        <p class="help-miss"><strong>よくあるミス：</strong>収入天引き項目を支出側でも差し引き、二重計上すること。</p>
      </section>

      <section id="help-analysis" class="help-section">
        <h4>9. 分析</h4>
        <h5>目的</h5><p>支出設計のどこを見るべきか、どこに見直し余地があるかを確認します。</p>
        <h5>できること</h5><ul><li>収入管理では支給、控除、手取り、残業代などを確認できます。</li><li>支出管理では支出合計、必須支出、任意支出、削減可能額を確認できます。</li><li>見直し候補Top5、カテゴリ別、支払者別、固定/変動、支出/貯蓄/投資を確認できます。</li><li>設計額と外部実績の差額を確認できます。</li></ul>
        <h5>操作手順</h5><ol><li>収入管理または支出管理の分析タブを開きます。</li><li>最上段の要点を確認します。</li><li>見直し候補Top5を確認します。</li><li>必要に応じて入力タブまたは更新候補タブへ移動します。</li></ol>
        <div class="help-note"><strong>注意点</strong><span>分析は判断材料です。金額は自動変更されません。</span></div>
        <p class="help-miss"><strong>よくあるミス：</strong>変動費の一時的な増加をすぐ固定費として扱うこと。</p>
      </section>

      <section id="help-balance" class="help-section">
        <h4>10. 家計サマリー（左メニュー）</h4>
        <h5>目的</h5><p>収入管理と支出管理を横断し、対象月の実質的な家計収支をすぐ確認します。</p>
        <h5>できること</h5><ul><li>当月収支、黒字・赤字・警戒の状態、対象月を確認できます。</li><li>可能な場合はユーザー別の収支も確認できます。</li></ul>
        <h5>計算の考え方</h5><ul><li>対象月は現在月の1か月前です。</li><li>収入は全ユーザーの手取りから通勤交通費を除いた金額です。</li><li>支出は有効な支出項目のうち、天引きではない支出を月額換算して合計します。</li><li>天引き項目は手取りに反映済みのため、二重計上を避けて除外します。</li></ul>
        <h5>操作手順</h5><ol><li>左メニューの当月収支を確認します。</li><li>警戒または赤字の場合は支出管理の分析を開きます。</li><li>更新候補や支出入力で見直す項目を確認します。</li></ol>
        <p class="help-miss"><strong>よくあるミス：</strong>貯蓄・投資や天引き項目を当月収支に重ねて入れてしまうこと。</p>
      </section>

      <section id="help-data" class="help-section">
        <h4>11. データ管理</h4>
        <h5>目的</h5><p>登録済みデータを確認し、必要に応じて出力や履歴確認を行います。</p>
        <h5>できること</h5><ul><li>収入管理では登録月データの確認、Excel出力、直近データ復元ができます。</li><li>支出管理では支出項目の簡易一覧、更新履歴、CSVエクスポートを確認できます。</li><li>バックアップと復元は設定内のバックアップに集約しています。</li></ul>
        <h5>操作手順</h5><ol><li>収入管理または支出管理のデータ管理タブを開きます。</li><li>一覧を確認します。新しい月が上に表示されます。</li><li>必要に応じて出力または履歴確認を行います。</li></ol>
        <div class="help-note"><strong>注意点</strong><span>月データ削除や復元は対象を確認してから実行してください。</span></div>
        <p class="help-miss"><strong>よくあるミス：</strong>データ管理タブで全体バックアップを探すこと。全体バックアップは設定にあります。</p>
      </section>

      <section id="help-backup" class="help-section">
        <h4>12. バックアップ / 復元</h4>
        <h5>目的</h5><p>誤操作や復元ミスに備え、現在のデータを戻せる状態にします。</p>
        <h5>できること</h5><ul><li>収入、支出、外部取り込み、設定を1つのJSONとしてバックアップできます。</li><li>復元前に現在データを自動退避します。</li><li>不正なバックアップJSONは既存データを壊さず拒否します。</li><li>保存や反映前にスナップショットを残します。</li></ul>
        <h5>操作手順</h5><ol><li>設定を開きます。</li><li>バックアップを押してJSONを保存します。</li><li>復元する場合は復元を押し、対象ファイルを選びます。</li><li>確認内容を読んでから実行します。</li></ol>
        <div class="help-note"><strong>注意点</strong><span>ブラウザのlocalStorageに保存しているため、ブラウザデータ削除の前には必ずバックアップしてください。</span></div>
        <p class="help-miss"><strong>よくあるミス：</strong>古いバックアップで現在のデータを上書きすること。復元前に日付を確認してください。</p>
      </section>

      <section id="help-examples" class="help-section">
        <h4>13. よくある使い方（実例）</h4>
        <h5>目的</h5><p>毎月の実務で迷わないよう、代表的な操作パターンを確認します。</p>
        <div class="help-example">
          <h5>毎月の給与を登録する</h5>
          <ol><li>収入管理を開きます。</li><li>登録年月を選びます。</li><li>写真から読込または前月コピーを使います。</li><li>差分だけ直します。</li><li>確認済を押して保存します。</li></ol>
        </div>
        <div class="help-example">
          <h5>支出項目を最新化する</h5>
          <ol><li>外部データでCSVを取り込みます。</li><li>更新候補を開きます。</li><li>差額と根拠を確認します。</li><li>必要な候補だけ反映します。</li></ol>
        </div>
        <div class="help-example">
          <h5>家計が苦しい原因を見る</h5>
          <ol><li>左メニューの当月収支を確認します。</li><li>支出管理の分析を開きます。</li><li>削減可能額と見直し候補Top5を確認します。</li><li>入力タブで対象項目を編集します。</li></ol>
        </div>
        <p class="help-miss"><strong>よくあるミス：</strong>先に細かい明細を触りすぎること。まずサマリー、次に候補、最後に詳細の順で見ると早いです。</p>
      </section>

      <section id="help-notes" class="help-section">
        <h4>14. 注意点</h4>
        <h5>目的</h5><p>データ事故や判断ミスを避けるための重要ポイントです。</p>
        <h5>できること</h5><ul><li>自動上書きを避け、確認してから反映できます。</li><li>天引き項目の二重計上に注意できます。</li><li>バックアップとスナップショットで復旧できます。</li></ul>
        <h5>操作手順</h5><ol><li>大きな変更前にバックアップします。</li><li>更新候補の根拠を見ます。</li><li>確認モーダルで変更前後を見ます。</li><li>反映後はサマリーと履歴を確認します。</li></ol>
        <div class="help-note help-warning"><strong>注意点</strong><span>収入データや外部データは、支出項目更新の根拠として参照します。反映操作で更新されるのは支出項目の費用だけです。</span></div>
        <p class="help-miss"><strong>よくあるミス：</strong>支出設計を完璧に作ろうとして止まること。まず大きな固定費と天引き項目から整えるのが効果的です。</p>
      </section>
    </div>
  `;

  const body = byId("helpBody");
  const links = [...byId("helpContent").querySelectorAll("[data-help-target]")];
  const helpSections = sections.map(([id]) => byId(id)).filter(Boolean);
  const setActiveHelpLink = () => {
    if (!body || !helpSections.length) return;
    const current = helpSections.reduce((active, section) => {
      return section.offsetTop - body.scrollTop <= 80 ? section : active;
    }, helpSections[0]);
    links.forEach((link) => link.classList.toggle("active", link.dataset.helpTarget === current.id));
  };
  links.forEach((link) => {
    link.addEventListener("click", () => {
      const target = byId(link.dataset.helpTarget);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      links.forEach((item) => item.classList.toggle("active", item === link));
    });
  });
  if (body) {
    body.addEventListener("scroll", setActiveHelpLink, { passive: true });
    setActiveHelpLink();
  }
}


function renderSettings() {
  const profile = byId("payrollSettingsProfile");
  if (profile && typeof payrollProfileLabel === "function") {
    [...profile.options].forEach((option) => {
      option.textContent = `${payrollProfileLabel(option.value)}（${option.value === "secondary" ? "ユーザー2" : "ユーザー1"}）`;
    });
    profile.value = typeof payrollActiveProfile === "function" ? payrollActiveProfile() : "primary";
  }
  const name = byId("payrollProfileName");
  if (name) name.value = typeof payrollProfileLabel === "function" ? payrollProfileLabel(profile?.value) : "";
  byId("categoryOptions").value = (optionLists.category || []).join("\n");
  renderLinkGroupSettings();
}

let editingLinkGroupId = null;
let linkGroupDraft = { income: [], expense: [], external: [] };

function linkMemberLabel(member) {
  if (!member) return "";
  if (member.type === "income") return member.label || member.key || "収入項目";
  if (member.type === "expense") return member.label || member.id || "支出項目";
  return member.label || member.key || "外部データ";
}

function renderMemberChips(targetId, members, type) {
  const target = byId(targetId);
  if (!target) return;
  target.innerHTML = members.length
    ? members.map((member, index) => `<span class="link-chip">${esc(linkMemberLabel(member))}<button type="button" data-remove-link-member="${type}:${index}" aria-label="削除">×</button></span>`).join("")
    : '<span class="muted-text">未選択</span>';
}

function renderEquationPreview() {
  const group = (members, empty) => members.length
    ? members.map((member) => `<span class="link-chip">${esc(linkMemberLabel(member))}</span>`).join('<b class="link-plus">＋</b>')
    : `<span class="link-empty">${empty}</span>`;
  byId("linkEquationPreview").innerHTML = `
    <div class="link-equation-group">${group(linkGroupDraft.income, "収入項目")}</div>
    <b class="link-equal">＝</b>
    <div class="link-equation-group">${group(linkGroupDraft.expense, "支出項目")}</div>
    <b class="link-equal">＝</b>
    <div class="link-equation-group">${group(linkGroupDraft.external, "外部データ")}</div>
  `;
  renderMemberChips("linkIncomeChips", linkGroupDraft.income, "income");
  renderMemberChips("linkExpenseChips", linkGroupDraft.expense, "expense");
  renderMemberChips("linkExternalChips", linkGroupDraft.external, "external");
}

function externalLinkOptions() {
  const source = byId("linkGroupExternalSource")?.value || "moneyforward";
  const query = normalize(byId("linkGroupExternalSearch")?.value || "");
  const groups = new Map();
  importedRows
    .filter((row) => row.sourceType === source)
    .filter((row) => {
      const text = normalize([row.content, row.major, row.middle, row.user, row.month, row.date].join(" "));
      return !query || text.includes(query);
    })
    .forEach((row) => {
      const name = String(row.content || "").trim();
      if (!name) return;
      const key = `${source}:${normalize(name)}`;
      const current = groups.get(key) || { key, source, name, rows: [], latestMonth: "", total: 0 };
      current.rows.push(row);
      const ym = row.month || String(row.date || "").slice(0, 7) || "";
      if (ym > current.latestMonth) current.latestMonth = ym;
      groups.set(key, current);
    });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      total: group.rows
        .filter((row) => !group.latestMonth || (row.month || String(row.date || "").slice(0, 7)) === group.latestMonth)
        .reduce((sum, row) => sum + Math.abs(numberValue(row.paymentAmount ?? row.amount ?? row.total ?? 0)), 0),
    }))
    .sort((a, b) => String(b.latestMonth || "").localeCompare(String(a.latestMonth || "")) || a.name.localeCompare(b.name, "ja"))
    .slice(0, 80);
}

function renderExternalLinkOptions() {
  const select = byId("linkGroupExternalItem");
  if (!select) return;
  const options = externalLinkOptions();
  select.innerHTML = options.length
    ? options.map((group) => `<option value="${esc(group.key)}">${esc(group.name || "名称未設定")}</option>`).join("")
    : '<option value="">候補なし</option>';
  renderExternalLinkMeta();
}

function renderExternalLinkMeta() {
  const meta = byId("linkGroupExternalMeta");
  if (!meta) return;
  const selected = byId("linkGroupExternalItem")?.value || "";
  const group = externalLinkOptions().find((entry) => entry.key === selected);
  meta.innerHTML = group
    ? `<span>${esc(group.latestMonth || "-")}</span><span>${yen(group.total)}</span><span>${group.rows.length}件</span>`
    : '<span>外部データ候補を選択してください。</span>';
}

function renderLinkGroupSettings() {
  const list = byId("linkGroupList");
  if (!list) return;
  const incomeSelect = byId("linkGroupIncome");
  const expenseSelect = byId("linkGroupExpense");
  incomeSelect.innerHTML = '<option value="">選択しない</option>' + (typeof payrollExpenseLinks !== "undefined" ? payrollExpenseLinks : [])
    .map((link) => `<option value="${esc(link.key)}">${esc(link.label)}</option>`)
    .join("");
  expenseSelect.innerHTML = '<option value="">選択しない</option>' + master
    .filter((item) => item.enabled !== false)
    .map((item) => `<option value="${esc(item.id)}">${esc(item.name || "名称未設定")} / ${esc(item.person || "")}</option>`)
    .join("");
  renderExternalLinkOptions();
  renderEquationPreview();
  list.innerHTML = linkGroups.length
    ? linkGroups.map((group) => `
        <div class="link-group-row">
          <span><b>${esc(group.name || "名称未設定")}</b><small>${esc(group.description || "")}</small></span>
          <div class="link-group-formula">${renderSavedLinkFormula(group.members || [])}</div>
          <button type="button" data-edit-link-group="${esc(group.id)}">編集</button>
          <button type="button" data-delete-link-group="${esc(group.id)}">削除</button>
        </div>
      `).join("")
    : '<div class="empty-state compact">紐づけグループはまだありません。</div>';
}

function renderSavedLinkFormula(members) {
  const types = {
    income: members.filter((member) => member.type === "income"),
    expense: members.filter((member) => member.type === "expense"),
    external: members.filter((member) => member.type === "external"),
  };
  const group = (list, empty) => list.length ? list.map((member) => `<span>${esc(linkMemberLabel(member))}</span>`).join("<b>＋</b>") : `<span>${empty}</span>`;
  return `${group(types.income, "収入")} <b>＝</b> ${group(types.expense, "支出")} <b>＝</b> ${group(types.external, "外部")}`;
}

function addDraftMember(type) {
  if (type === "income") {
    const key = byId("linkGroupIncome")?.value || "";
    const link = (typeof payrollExpenseLinks !== "undefined" ? payrollExpenseLinks : []).find((entry) => entry.key === key);
    if (link && !linkGroupDraft.income.some((member) => member.key === link.key)) linkGroupDraft.income.push({ type: "income", key: link.key, label: link.label, profile: typeof payrollActiveProfile === "function" ? payrollActiveProfile() : "primary" });
  }
  if (type === "expense") {
    const id = byId("linkGroupExpense")?.value || "";
    const item = master.find((entry) => entry.id === id);
    if (item && !linkGroupDraft.expense.some((member) => member.id === item.id)) linkGroupDraft.expense.push({ type: "expense", id: item.id, label: item.name || "名称未設定" });
  }
  if (type === "external") {
    const key = byId("linkGroupExternalItem")?.value || "";
    const group = externalLinkOptions().find((entry) => entry.key === key);
    if (group && !linkGroupDraft.external.some((member) => member.key === key)) {
      linkGroupDraft.external.push({ type: "external", source: group.source, key, label: group.name || "名称未設定", matchRule: "normalized-name", amount: group.total, ym: group.latestMonth || "", count: group.rows.length });
    }
  }
  renderEquationPreview();
}

function removeDraftMember(token) {
  const [type, indexText] = String(token || "").split(":");
  const index = Number(indexText);
  if (Array.isArray(linkGroupDraft[type])) linkGroupDraft[type].splice(index, 1);
  renderEquationPreview();
}

function clearLinkDraft() {
  editingLinkGroupId = null;
  linkGroupDraft = { income: [], expense: [], external: [] };
  ["linkGroupName", "linkGroupDescription", "linkGroupExternalSearch"].forEach((id) => {
    if (byId(id)) byId(id).value = "";
  });
  renderLinkGroupSettings();
}

function editLinkGroup(id) {
  const group = linkGroups.find((entry) => entry.id === id);
  if (!group) return;
  editingLinkGroupId = id;
  byId("linkGroupName").value = group.name || "";
  byId("linkGroupDescription").value = group.description || "";
  linkGroupDraft = {
    income: (group.members || []).filter((member) => member.type === "income").map((member) => ({ ...member })),
    expense: (group.members || []).filter((member) => member.type === "expense").map((member) => ({ ...member })),
    external: (group.members || []).filter((member) => member.type === "external").map((member) => ({ ...member })),
  };
  renderEquationPreview();
}

function addLinkGroupFromSettings() {
  const name = String(byId("linkGroupName")?.value || "").trim();
  if (!name) {
    showToast("紐づけグループ名を入力してください。", "warn");
    return;
  }
  const members = [...linkGroupDraft.income, ...linkGroupDraft.expense, ...linkGroupDraft.external];
  if (!members.length) {
    showToast("収入・支出・外部データのいずれかを選んでください。", "warn");
    return;
  }
  const now = new Date().toISOString();
  const existing = linkGroups.find((group) => group.id === editingLinkGroupId);
  const payload = {
    id: editingLinkGroupId || `link-${Date.now()}`,
    name,
    description: String(byId("linkGroupDescription")?.value || "").trim(),
    members,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  if (existing) Object.assign(existing, payload);
  else linkGroups.unshift(payload);
  saveLinkGroups();
  clearLinkDraft();
  showToast("紐づけグループを保存しました。", "ok");
}

function deleteLinkGroup(id) {
  const group = linkGroups.find((entry) => entry.id === id);
  if (!group || !window.confirm(`「${group.name}」を削除しますか？`)) return;
  linkGroups = linkGroups.filter((entry) => entry.id !== id);
  saveLinkGroups();
  renderLinkGroupSettings();
  showToast("紐づけグループを削除しました。", "ok");
}

function refreshPayrollSettingsName() {
  const profile = byId("payrollSettingsProfile")?.value || "primary";
  const name = byId("payrollProfileName");
  if (name && typeof payrollProfileLabel === "function") name.value = payrollProfileLabel(profile);
}

function showToast(message = "", type = "ok") {
  if (!message) return;
  const host = byId("toastHost");
  if (!host) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type === "warn" ? "warn" : "ok"}`;
  toast.textContent = message;
  host.appendChild(toast);
  window.setTimeout(() => toast.classList.add("leaving"), 3200);
  window.setTimeout(() => toast.remove(), 3800);
}

function saveSettings() {
  const read = (id) => byId(id).value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  optionLists.category = read("categoryOptions");
  saveOptions();
  byId("settingsModal").classList.add("hidden");
  showToast("支出種別を保存しました。", "ok");
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
  if (target === "summary" && typeof renderExpenseSummary === "function") renderExpenseSummary();
  if (target === "master" && typeof renderMaster === "function") renderMaster();
  if (target === "candidates" && typeof renderUpdateCandidates === "function") renderUpdateCandidates();
  if (target === "import" && typeof renderImport === "function") renderImport();
  if (target === "expense-analysis" && typeof renderExpenseAnalysis === "function") renderExpenseAnalysis();
  if (target === "expense-data" && typeof renderExpenseData === "function") renderExpenseData();
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

function bindCommonUiEvents() {
  document.querySelector(".tab-strip").addEventListener("click", switchTab);
  byId("openSettings").addEventListener("click", () => {
    renderSettings();
    const settingsProfile = byId("payrollSettingsProfile");
    if (settingsProfile) {
      settingsProfile.value = typeof payrollActiveProfile === "function" ? payrollActiveProfile() : "primary";
      refreshPayrollSettingsName();
    }
    byId("settingsModal").classList.remove("hidden");
    if (typeof closeMobileNav === "function") closeMobileNav();
  });
  byId("openHelp").addEventListener("click", () => {
    renderHelp();
    byId("helpModal").classList.remove("hidden");
    if (typeof closeMobileNav === "function") closeMobileNav();
  });
  byId("closeSettings").addEventListener("click", () => byId("settingsModal").classList.add("hidden"));
  byId("closeHelp").addEventListener("click", () => byId("helpModal").classList.add("hidden"));
  byId("saveListOptions").addEventListener("click", saveSettings);
  byId("addLinkIncome").addEventListener("click", () => addDraftMember("income"));
  byId("addLinkExpense").addEventListener("click", () => addDraftMember("expense"));
  byId("addLinkExternal").addEventListener("click", () => addDraftMember("external"));
  byId("clearLinkDraft").addEventListener("click", clearLinkDraft);
  byId("linkGroupExternalSource").addEventListener("change", renderExternalLinkOptions);
  byId("linkGroupExternalSearch").addEventListener("input", renderExternalLinkOptions);
  byId("linkGroupExternalItem").addEventListener("change", renderExternalLinkMeta);
  byId("addLinkGroup").addEventListener("click", addLinkGroupFromSettings);
  byId("linkGroupList").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-link-group]");
    if (edit) {
      editLinkGroup(edit.dataset.editLinkGroup);
      return;
    }
    const button = event.target.closest("[data-delete-link-group]");
    if (button) deleteLinkGroup(button.dataset.deleteLinkGroup);
  });
  byId("settingsModal").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-link-member]");
    if (remove) removeDraftMember(remove.dataset.removeLinkMember);
  });
  byId("payrollSettingsProfile")?.addEventListener("change", refreshPayrollSettingsName);
  byId("payrollSaveProfileName").addEventListener("click", () => {
    const profile = byId("payrollSettingsProfile")?.value || (typeof payrollActiveProfile === "function" ? payrollActiveProfile() : "primary");
    const value = String(byId("payrollProfileName")?.value || "").trim();
    if (typeof payrollProfileNameKey !== "function") return;
    if (value) localStorage.setItem(payrollProfileNameKey(profile), value);
    else localStorage.removeItem(payrollProfileNameKey(profile));
    if (typeof payrollMarkSaved === "function") payrollMarkSaved("ユーザー名更新");
    renderHeader();
    renderSettings();
    if (appMode === "income" && typeof payrollRenderAll === "function") payrollRenderAll("ユーザー名を更新しました。");
    else showToast("表示名を更新しました。", "ok");
  });
  byId("exportFullBackup").addEventListener("click", exportFullBackup);
  byId("importFullBackup").addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) importFullBackupFile(file);
    event.target.value = "";
  });
}
