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
        lblParentKey: "Parent Key Presets (Optional)",
        lblTitlePrefix: "Title Prefix Presets (Optional)",
        lblEpicPrefixMapping: "Prefix → Epic Mapping (Optional)",
        lblDueDateOffset: "Due Date Offset (Days)",
        lblDescTemplate: "Description Template (Markdown-ish)",
        noteApiToken: '<a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank">Atlassian Security</a>',
        noteParentKey: "One key per line. If multiple, you can select one when creating.",
        notePrefix: "One prefix per line. You can select one when creating a ticket.",
        noteDueDateOffset: "Days to add to Start Date for Due Date. (Default: 2)",
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
        lblParentKey: "親課題キー / プリセット (任意)",
        lblTitlePrefix: "タイトル接頭辞 / プリセット (任意)",
        lblEpicPrefixMapping: "接頭辞 → エピック マッピング (任意)",
        lblDueDateOffset: "期限までの日数 (開始日基準)",
        lblDescTemplate: "説明文テンプレート (Markdown風)",
        noteApiToken: '<a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank">Atlassian Security</a> で作成できます',
        noteParentKey: "1行に1つ入力。複数ある場合は作成時に選択できます。",
        notePrefix: "1行に1つ入力。作成時に選択できます。",
        noteDueDateOffset: "開始日の何日後を期限にするか設定します。(デフォルト: 2)",
        noteTemplate: "使用可能: {author}, {server}, {channel}, {time}, {link}, {content}<br>対応: **太字**, [リンク名]({link}), - リスト",
        save: "設定を保存",
        statusSaved: "設定を保存しました。"
    }
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);

// Parent Key と Title Prefix の変更を監視して、マッピング UI を更新
document.getElementById('parentKey').addEventListener('input', updateMappingUI);
document.getElementById('titlePrefix').addEventListener('input', updateMappingUI);

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
    document.getElementById('lblEpicPrefixMapping').textContent = texts.lblEpicPrefixMapping;
    document.getElementById('lblDueDateOffset').textContent = texts.lblDueDateOffset;
    document.getElementById('lblDescTemplate').textContent = texts.lblDescTemplate;
    document.getElementById('noteApiToken').innerHTML = texts.noteApiToken;
    document.getElementById('noteParentKey').textContent = texts.noteParentKey;
    document.getElementById('notePrefix').textContent = texts.notePrefix;
    document.getElementById('noteDueDateOffset').textContent = texts.noteDueDateOffset;
    document.getElementById('noteTemplate').innerHTML = texts.noteTemplate;
    document.getElementById('save').textContent = texts.save;

    // マッピング UI を再生成（言語変更を反映）
    updateMappingUI();
}

function saveOptions() {
    const jiraDomain = document.getElementById('jiraDomain').value.replace('https://', '').replace('/', '');
    const email = document.getElementById('email').value;
    const apiToken = document.getElementById('apiToken').value;
    const projectKey = document.getElementById('projectKey').value;
    const issueType = document.getElementById('issueType').value;
    const parentKey = document.getElementById('parentKey').value;
    const titlePrefix = document.getElementById('titlePrefix').value;
    const dueDateOffset = parseInt(document.getElementById('dueDateOffset').value, 10) || 0;
    const descTemplate = document.getElementById('descTemplate').value;
    const lang = document.querySelector('input[name="lang"]:checked').value;

    // Prefix → Epic マッピングをドロップダウンから収集
    const mappingLines = [];
    const selects = document.querySelectorAll('#epicPrefixMappingContainer select');
    selects.forEach(select => {
        const prefix = select.dataset.prefix;
        const epicKey = select.value;
        if (prefix && epicKey) {
            mappingLines.push(`${prefix}:${epicKey}`);
        }
    });
    const epicPrefixMapping = mappingLines.join('\n');

    // 設定変更時は Account ID のキャッシュをクリアする (再取得させるため)
    chrome.storage.sync.set(
        { jiraDomain, email, apiToken, projectKey, issueType, parentKey, titlePrefix, epicPrefixMapping, dueDateOffset, descTemplate, lang, accountId: '' },
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
            epicPrefixMapping: '',
            dueDateOffset: 2,
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
            document.getElementById('dueDateOffset').value = items.dueDateOffset !== undefined ? items.dueDateOffset : 2;
            document.getElementById('descTemplate').value = items.descTemplate;

            // 言語設定の反映
            const lang = items.lang;
            document.querySelector(`input[name="lang"][value="${lang}"]`).checked = true;
            updateLanguage(lang);

            // マッピング UI を初期化
            updateMappingUI();
        }
    );
}

// Epic → Prefix マッピング UI を動的に生成
function updateMappingUI() {
    const parentKeyText = document.getElementById('parentKey').value;
    const titlePrefixText = document.getElementById('titlePrefix').value;
    const container = document.getElementById('epicPrefixMappingContainer');

    // 既存のマッピングを取得
    const existingMapping = {};
    chrome.storage.sync.get({ epicPrefixMapping: '' }, (items) => {
        if (items.epicPrefixMapping) {
            items.epicPrefixMapping.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && trimmed.includes(':')) {
                    const [epic, prefix] = trimmed.split(':').map(s => s.trim());
                    if (epic && prefix) {
                        existingMapping[epic] = prefix;
                    }
                }
            });
        }

        // Parent Keys と Prefixes を配列化
        const parentKeys = parentKeyText.split('\n').map(k => k.trim()).filter(k => k.length > 0);
        const prefixes = titlePrefixText.split('\n').map(p => p.trim()).filter(p => p.length > 0);

        // コンテナをクリア
        container.innerHTML = '';

        // 説明文
        const note = document.createElement('div');
        note.className = 'note';
        note.style.margin = '0 0 10px 0';
        note.id = 'noteEpicMapping';
        note.textContent = currentLang === 'ja'
            ? '各接頭辞に対応するエピックを選択してください。'
            : 'Select the corresponding epic for each prefix.';
        container.appendChild(note);

        if (prefixes.length === 0) {
            const emptyNote = document.createElement('div');
            emptyNote.className = 'note';
            emptyNote.style.margin = '0';
            emptyNote.style.fontStyle = 'italic';
            emptyNote.textContent = currentLang === 'ja'
                ? '上記の「タイトル接頭辞 / プリセット」にプレフィックスを入力してください。'
                : 'Please add title prefixes above first.';
            container.appendChild(emptyNote);
            return;
        }

        if (parentKeys.length === 0) {
            const emptyNote = document.createElement('div');
            emptyNote.className = 'note';
            emptyNote.style.margin = '0';
            emptyNote.style.fontStyle = 'italic';
            emptyNote.textContent = currentLang === 'ja'
                ? '上記の「親課題キー / プリセット」にエピックを入力してください。'
                : 'Please add parent keys above first.';
            container.appendChild(emptyNote);
            return;
        }

        // 各 Prefix に対してドロップダウンを生成
        prefixes.forEach(prefix => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '10px';

            const label = document.createElement('span');
            label.textContent = prefix;
            label.style.fontWeight = 'bold';
            label.style.minWidth = '120px';
            label.style.fontSize = '12px';

            const arrow = document.createElement('span');
            arrow.textContent = '→';
            arrow.style.color = '#666';

            const select = document.createElement('select');
            select.style.padding = '4px 8px';
            select.style.border = '1px solid #ccc';
            select.style.borderRadius = '4px';
            select.style.fontSize = '12px';
            select.style.flex = '1';
            select.dataset.prefix = prefix;

            // "None" オプション
            const noneOption = document.createElement('option');
            noneOption.value = '';
            noneOption.textContent = currentLang === 'ja' ? 'なし' : 'None';
            select.appendChild(noneOption);

            // Parent Key オプション
            parentKeys.forEach(key => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = key;
                if (existingMapping[prefix] === key) {
                    option.selected = true;
                }
                select.appendChild(option);
            });

            row.appendChild(label);
            row.appendChild(arrow);
            row.appendChild(select);
            container.appendChild(row);
        });
    });
}
