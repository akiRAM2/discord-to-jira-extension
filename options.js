const defaultTemplate = `**Extracted from Discord Message**

- Author: {author}
- Server: {server}
- Channel: {channel}
- Time: {time}
- Link: [Open Message]({link})

**Message Content**

{content}`;

const translations = {
    en: {
        pageTitle: "Jira Connection Settings",
        lblJiraDomain: "Jira Domain (e.g. atlassian.net)",
        lblEmail: "Email Address",
        lblApiToken: "API Token",
        lblProjectKey: "Project Key",
        lblIssueType: "Issue Type Name",
        lblParentKey: "Parent Key / Epic Key (Optional)",
        lblTitlePrefix: "Title Prefix (Optional)",
        lblDescTemplate: "Description Template (Markdown-ish)",
        noteApiToken: 'Create one at <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank">Atlassian Security</a>',
        noteParentKey: "Set Epic Key to link to an Epic, or Parent Key for Sub-tasks.",
        notePrefix: "Added to the beginning of the ticket title.",
        noteTemplate: "Available: {author}, {server}, {channel}, {time}, {link}, {content}<br>Supports: **Bold**, [Link]({link}), - List item",
        save: "Save Settings",
        statusSaved: "Options saved."
    },
    ja: {
        pageTitle: "Jira 連携設定",
        lblJiraDomain: "Jiraドメイン (例: company.atlassian.net)",
        lblEmail: "メールアドレス",
        lblApiToken: "APIトークン",
        lblProjectKey: "プロジェクトキー (例: SUP, DEV)",
        lblIssueType: "課題タイプ名 (例: Task, タスク)",
        lblParentKey: "親課題キー / エピックキー (任意)",
        lblTitlePrefix: "タイトル接頭辞 (任意)",
        lblDescTemplate: "説明文テンプレート (Markdown風)",
        noteApiToken: '<a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank">Atlassian Security</a> で作成できます',
        noteParentKey: "エピックに紐付ける場合はエピックのキーを入力してください (例: KAN-5)",
        notePrefix: "チケットタイトルの先頭に追加されます。",
        noteTemplate: "使用可能: {author}, {server}, {channel}, {time}, {link}, {content}<br>対応: **太字**, [リンク名]({link}), - リスト",
        save: "設定を保存",
        statusSaved: "設定を保存しました。"
    }
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);

// ラジオボタンの変更監視
document.querySelectorAll('input[name="lang"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        updateLanguage(e.target.value);
    });
});

let currentLang = 'en';

function updateLanguage(lang) {
    currentLang = lang;
    const texts = translations[lang];

    document.getElementById('pageTitle').textContent = texts.pageTitle;
    document.getElementById('lblJiraDomain').textContent = texts.lblJiraDomain;
    document.getElementById('lblEmail').textContent = texts.lblEmail;
    document.getElementById('lblApiToken').textContent = texts.lblApiToken;
    document.getElementById('lblProjectKey').textContent = texts.lblProjectKey;
    document.getElementById('lblIssueType').textContent = texts.lblIssueType;
    document.getElementById('lblParentKey').textContent = texts.lblParentKey;
    document.getElementById('lblTitlePrefix').textContent = texts.lblTitlePrefix;
    document.getElementById('lblDescTemplate').textContent = texts.lblDescTemplate;
    document.getElementById('noteApiToken').innerHTML = texts.noteApiToken;
    document.getElementById('noteParentKey').textContent = texts.noteParentKey;
    document.getElementById('notePrefix').textContent = texts.notePrefix;
    document.getElementById('noteTemplate').innerHTML = texts.noteTemplate;
    document.getElementById('save').textContent = texts.save;
}

function saveOptions() {
    const jiraDomain = document.getElementById('jiraDomain').value.replace('https://', '').replace('/', '');
    const email = document.getElementById('email').value;
    const apiToken = document.getElementById('apiToken').value;
    const projectKey = document.getElementById('projectKey').value;
    const issueType = document.getElementById('issueType').value;
    const parentKey = document.getElementById('parentKey').value;
    const titlePrefix = document.getElementById('titlePrefix').value;
    const descTemplate = document.getElementById('descTemplate').value;
    const lang = document.querySelector('input[name="lang"]:checked').value;

    // 設定変更時は Account ID のキャッシュをクリアする (再取得させるため)
    chrome.storage.sync.set(
        { jiraDomain, email, apiToken, projectKey, issueType, parentKey, titlePrefix, descTemplate, lang, accountId: '' },
        () => {
            const status = document.getElementById('status');
            status.textContent = translations[lang].statusSaved;
            status.style.display = 'block';
            setTimeout(() => {
                status.style.display = 'none';
            }, 2000);
        }
    );
}

function restoreOptions() {
    chrome.storage.sync.get(
        {
            jiraDomain: '',
            email: '',
            apiToken: '',
            projectKey: '',
            issueType: 'Task',
            parentKey: '',
            titlePrefix: '[Discord]',
            descTemplate: defaultTemplate,
            lang: 'en' // デフォルト言語
        },
        (items) => {
            document.getElementById('jiraDomain').value = items.jiraDomain;
            document.getElementById('email').value = items.email;
            document.getElementById('apiToken').value = items.apiToken;
            document.getElementById('projectKey').value = items.projectKey;
            document.getElementById('issueType').value = items.issueType;
            document.getElementById('parentKey').value = items.parentKey;
            document.getElementById('titlePrefix').value = items.titlePrefix;
            document.getElementById('descTemplate').value = items.descTemplate;

            // 言語設定の反映
            const lang = items.lang;
            document.querySelector(`input[name="lang"][value="${lang}"]`).checked = true;
            updateLanguage(lang);
        }
    );
}
