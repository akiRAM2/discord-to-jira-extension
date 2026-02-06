# Discord to Jira Chrome Extension

Discordのメッセージからコンテキストメニュー経由で直接Jiraチケットを作成できるChrome拡張機能です。

## 特徴
- **簡単作成**: Discordのメッセージを右クリックするだけでJiraのチケット作成画面へ。
- **情報抽出**: メッセージの内容、投稿者、日時、サーバー名、チャンネル名を自動抽出。
- **テンプレート機能**: デスクリプションのフォーマットをMarkdown風テンプレートで自由にカスタマイズ可能。
- **自動アサイン**: 設定したユーザー（自分自身）をチケットの担当者として自動設定。
- **多言語対応**: 日本語と英語に対応。
- **親課題連携**: Epicや親課題へのリンクも設定可能。

## インストール方法
1. このリポジトリをクローンまたはダウンロードします。
2. Chromeブラウザを開き、アドレスバーに `chrome://extensions/` と入力します。
3. 右上の「デベロッパーモード」をONにします。
4. 「パッケージ化されていない拡張機能を読み込む」をクリックし、このフォルダを選択します。

## 設定方法
インストール後、拡張機能のアイコンをクリックしてオプション画面を開き、以下の情報を設定してください。

- **Jira Domain**: ご利用のJiraのドメイン (例: `your-company.atlassian.net`)
- **Email Address**: Jiraアカウントのメールアドレス
- **API Token**: [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens) で生成したAPIトークン
- **Project Key**: チケットを作成するプロジェクトのキー (例: `DEV`)
- **Issue Type**: 作成する課題タイプ (例: `Task`)
- **Parent Key (Option)**: 親課題（Epicなど）に紐付ける場合は入力
- **Description Template**: チケット本文のフォーマット設定

## ライセンス
このプロジェクトは [MIT License](LICENSE) の元で公開されています。

## クレジット
この拡張機能は AI アシスタントと akiRAM によって実装されました。

