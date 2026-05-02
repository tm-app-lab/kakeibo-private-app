# 家計管理アプリ GitHub Pages公開用

このフォルダの中身だけをGitHub Pagesへアップロードしてください。

## アップロードするもの

- `index.html`
- `auth.js`
- `app.js`
- `ui.js`
- `storage.js`
- `household.js`
- `payroll.js`
- `import.js`
- `import-utils.js`
- `styles.css`
- `manifest.webmanifest`
- `app-icon.svg`
- `README.md`
- `data/household-data.js`
- `data/payroll-data.js`

## アップロードしないもの

- `node_modules/`
- `archive/`
- `scripts/`
- `tests/`
- `.cmd` ファイル
- Pythonスクリプト
- Excelファイル
- CSV元データ
- 旧HTML、旧JS、旧給与単体アプリ

## 注意

`data` フォルダは必ずアップロードしてください。

特に以下の2ファイルがないと、アプリは起動できません。

- `data/household-data.js`
- `data/payroll-data.js`

## 簡易ログイン

パスワードは `auth.js` の `APP_PASSWORD` で変更できます。

この認証は個人利用向けの簡易ガードです。GitHub Pages上のHTML/JavaScriptは閲覧可能なため、完全なセキュリティではありません。本格的に非公開化する場合は、サーバー側認証や認証付きホスティングを使ってください。

## iPhoneで使う場合

1. SafariでGitHub PagesのURLを開きます。
2. 共有ボタンを押します。
3. 「ホーム画面に追加」を選びます。
4. ホーム画面のアイコンから起動します。

## ログイン状態をリセットする方法

ログイン画面をもう一度表示したい場合は、ブラウザの開発者ツールConsoleで以下を実行してください。

```js
resetHouseholdLoginOnly()
location.reload()
```

この操作で削除されるのは認証済みフラグ `household_app_auth_passed` だけです。収入・支出・外部データなどの家計データは削除されません。
