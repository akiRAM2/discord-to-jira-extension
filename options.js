const defaultTemplate = `**Extracted from Discord Message**

- Author: {author}
- Server: {server}
- Channel: {channel}
- Time: {time}
- Link: [Open Message]({link})

**Message Content**

{content}`;

const defaultTitleTemplate = `{message} ({author}) in #{channel} ,{server}`;

const translations = {
    en: {
        pageTitle: "Jira Connection Settings",
        pageNote: "Set the Jira destination first, then tune how tickets are created from Discord messages.",
        sectionConnection: "Connection",
        sectionConnectionNote: "Required settings for creating issues in Jira.",
        sectionTicket: "Ticket Defaults",
        sectionTicketNote: "These values decide where the Discord message becomes a Jira issue.",
        sectionRouting: "Creation Dialog Choices",
        sectionRoutingNote: "Add one item per line. These choices appear when you create a ticket.",
        sectionTemplate: "Ticket Templates",
        sectionTemplateNote: "Customize the Jira title and description generated from the selected Discord message.",
        guideTitle: "Setup Flow",
        guideText: "Complete the required Jira connection fields first. Optional presets make daily ticket creation faster.",
        guideStepConnection: "Connect Jira",
        guideStepConnectionText: "Domain, email, and API token are required.",
        guideStepTicket: "Choose defaults",
        guideStepTicketText: "Set the project, issue type, and due date offset.",
        guideStepPresets: "Add presets",
        guideStepPresetsText: "Prefixes and parent keys appear in the create dialog.",
        lblJiraDomain: "Jira Domain (e.g. atlassian.net)",
        lblEmail: "Email Address",
        lblApiToken: "API Token",
        lblProjectKey: "Project Key",
        lblIssueType: "Issue Type Name",
        lblEpicPrefixMapping: "Prefix → Epic Mapping (Optional)",
        lblDueDateOffset: "Due Date Offset (Days)",
        lblTitleTemplate: "Title Template",
        lblDescTemplate: "Description Template (Markdown-ish)",
        noteApiToken: '<a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank">Atlassian Security</a>',
        noteEpicMapping: "One mapping per line. Format: [Prefix]:PARENT-123. Prefixes and parent keys are generated from this list.",
        noteDueDateOffset: "Days to add to Start Date for Due Date. (Default: 2)",
        noteTitleTemplate: "Default: {message} ({author}) in #{channel} ,{server}. Available: {summary}, {author}, {server}, {channel}, {time}, {link}, {content}, {selection}, {message}",
        noteTemplate: "Available: {author}, {server}, {channel}, {time}, {link}, {content}<br>Supports: **Bold**, [Link]({link}), - List item",
        addMappingRow: "+ Add row",
        removeMappingRow: "Remove row",
        badgeRequired: "Required",
        badgeOptional: "Optional",
        save: "Save Settings",
        statusSaved: "Options saved."
    },
    ja: {
        pageTitle: "Jira 連携設定",
        pageNote: "まずJiraの接続先を設定し、そのあとDiscordメッセージから作るチケットの内容を調整します。",
        sectionConnection: "接続設定",
        sectionConnectionNote: "Jiraに課題を作成するために必要な設定です。",
        sectionTicket: "チケットの初期値",
        sectionTicketNote: "DiscordメッセージをどのJira課題として作るかを決めます。",
        sectionRouting: "作成時の選択肢",
        sectionRoutingNote: "1行に1つずつ入力します。チケット作成時のダイアログに表示されます。",
        sectionTemplate: "チケットテンプレート",
        sectionTemplateNote: "選択したDiscordメッセージから生成するJiraタイトルと本文を調整できます。",
        guideTitle: "設定の流れ",
        guideText: "まず必須のJira接続情報を入れます。任意のプリセットを使うと、日々のチケット作成がかなり楽になります。",
        guideStepConnection: "Jiraに接続",
        guideStepConnectionText: "ドメイン、メールアドレス、APIトークンが必要です。",
        guideStepTicket: "初期値を決める",
        guideStepTicketText: "プロジェクト、課題タイプ、期限までの日数を設定します。",
        guideStepPresets: "選択肢を追加",
        guideStepPresetsText: "接頭辞や親課題キーが作成ダイアログに表示されます。",
        lblJiraDomain: "Jiraドメイン (例: company.atlassian.net)",
        lblEmail: "メールアドレス",
        lblApiToken: "APIトークン",
        lblProjectKey: "プロジェクトキー (例: SUP, DEV)",
        lblIssueType: "課題タイプ名 (例: Task, タスク)",
        lblEpicPrefixMapping: "接頭辞 → エピック マッピング (任意)",
        lblDueDateOffset: "期限までの日数 (開始日基準)",
        lblTitleTemplate: "タイトルテンプレート",
        lblDescTemplate: "説明文テンプレート (Markdown風)",
        noteApiToken: '<a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank">Atlassian Security</a> で作成できます',
        noteEpicMapping: "1行に1つ入力します。形式: [接頭辞]:親課題キー。ここから作成時の接頭辞と親課題を自動生成します。",
        noteDueDateOffset: "開始日の何日後を期限にするか設定します。(デフォルト: 2)",
        noteTitleTemplate: "デフォルト: {message} ({author}) in #{channel} ,{server}。使用可能: {summary}, {author}, {server}, {channel}, {time}, {link}, {content}, {selection}, {message}",
        noteTemplate: "使用可能: {author}, {server}, {channel}, {time}, {link}, {content}<br>対応: **太字**, [リンク名]({link}), - リスト",
        addMappingRow: "+ 行を追加",
        removeMappingRow: "行を削除",
        badgeRequired: "必須",
        badgeOptional: "任意",
        save: "設定を保存",
        statusSaved: "設定を保存しました。"
    }
};

const optionStorage = (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync)
    ? chrome.storage.sync
    : {
        get(defaults, callback) {
            callback(defaults);
        },
        set(_items, callback) {
            if (callback) callback();
        }
    };

function normalizeMappingText(text) {
    return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && line.includes(':'))
        .map(line => {
            const [prefix, ...epicParts] = line.split(':');
            const epic = epicParts.join(':').trim();
            return `${prefix.trim()}:${epic}`;
        })
        .filter(line => {
            const [prefix, epic] = line.split(':').map(part => part.trim());
            return prefix && epic;
        })
        .join('\n');
}

function derivePresetsFromMapping(mappingText) {
    const prefixes = [];
    const parentKeys = [];

    mappingText.split('\n').forEach(line => {
        const [prefix, ...epicParts] = line.split(':');
        const cleanPrefix = (prefix || '').trim();
        const cleanEpic = epicParts.join(':').trim();
        if (cleanPrefix && cleanEpic) {
            if (!prefixes.includes(cleanPrefix)) prefixes.push(cleanPrefix);
            if (!parentKeys.includes(cleanEpic)) parentKeys.push(cleanEpic);
        }
    });

    return {
        titlePrefix: prefixes.join('\n'),
        parentKey: parentKeys.join('\n')
    };
}

function migrateLegacyMapping(items) {
    if (items.epicPrefixMapping) return normalizeMappingText(items.epicPrefixMapping);

    const prefixes = (items.titlePrefix || '')
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean);
    const parentKeys = (items.parentKey || '')
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean);

    if (prefixes.length === 0 || parentKeys.length === 0) return '';

    return prefixes
        .map((prefix, index) => `${prefix}:${parentKeys[index] || parentKeys[0]}`)
        .join('\n');
}

function parseMappingRows(mappingText) {
    return normalizeMappingText(mappingText)
        .split('\n')
        .filter(Boolean)
        .map(line => {
            const [prefix, ...epicParts] = line.split(':');
            return {
                prefix: prefix.trim(),
                epic: epicParts.join(':').trim()
            };
        });
}

function addMappingRow(prefix = '', epic = '') {
    const container = document.getElementById('epicPrefixMappingRows');
    const row = document.createElement('div');
    row.className = 'mapping-row';

    const prefixInput = document.createElement('input');
    prefixInput.type = 'text';
    prefixInput.className = 'mapping-prefix-input';
    prefixInput.placeholder = '例: [Discord]';
    prefixInput.value = prefix;

    const arrow = document.createElement('span');
    arrow.className = 'mapping-arrow';
    arrow.textContent = '→';

    const epicInput = document.createElement('input');
    epicInput.type = 'text';
    epicInput.className = 'mapping-epic-input';
    epicInput.placeholder = '例: TASK-001';
    epicInput.value = epic;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'mapping-remove';
    removeButton.textContent = '×';
    removeButton.title = translations[currentLang].removeMappingRow;
    removeButton.setAttribute('aria-label', translations[currentLang].removeMappingRow);
    removeButton.addEventListener('click', () => {
        row.remove();
        if (container.querySelectorAll('.mapping-row').length === 0) {
            addMappingRow();
        }
        syncMappingTextareaFromRows();
    });

    [prefixInput, epicInput].forEach(input => {
        input.addEventListener('input', syncMappingTextareaFromRows);
    });

    row.appendChild(prefixInput);
    row.appendChild(arrow);
    row.appendChild(epicInput);
    row.appendChild(removeButton);
    container.appendChild(row);
    syncMappingTextareaFromRows();
}

function renderMappingRows(mappingText) {
    const container = document.getElementById('epicPrefixMappingRows');
    container.innerHTML = '';

    const rows = parseMappingRows(mappingText);
    if (rows.length === 0) {
        addMappingRow();
        return;
    }

    rows.forEach(row => addMappingRow(row.prefix, row.epic));
}

function getMappingTextFromRows() {
    return Array.from(document.querySelectorAll('#epicPrefixMappingRows .mapping-row'))
        .map(row => {
            const prefix = row.querySelector('.mapping-prefix-input').value.trim();
            const epic = row.querySelector('.mapping-epic-input').value.trim();
            return prefix && epic ? `${prefix}:${epic}` : '';
        })
        .filter(Boolean)
        .join('\n');
}

function syncMappingTextareaFromRows() {
    document.getElementById('epicPrefixMapping').value = getMappingTextFromRows();
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('addMappingRow').addEventListener('click', () => addMappingRow());

let currentLang = 'ja';

// ラジオボタンの変更監視
document.querySelectorAll('input[name="lang"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        updateLanguage(e.target.value);
    });
});

function updateLanguage(lang) {
    currentLang = lang;
    const texts = translations[lang];

    document.getElementById('pageTitle').textContent = texts.pageTitle;
    document.getElementById('pageNote').textContent = texts.pageNote;
    document.getElementById('sectionConnection').textContent = texts.sectionConnection;
    document.getElementById('sectionConnectionNote').textContent = texts.sectionConnectionNote;
    document.getElementById('sectionTicket').textContent = texts.sectionTicket;
    document.getElementById('sectionTicketNote').textContent = texts.sectionTicketNote;
    document.getElementById('sectionRouting').textContent = texts.sectionRouting;
    document.getElementById('sectionRoutingNote').textContent = texts.sectionRoutingNote;
    document.getElementById('sectionTemplate').textContent = texts.sectionTemplate;
    document.getElementById('sectionTemplateNote').textContent = texts.sectionTemplateNote;
    document.getElementById('guideTitle').textContent = texts.guideTitle;
    document.getElementById('guideText').textContent = texts.guideText;
    document.getElementById('guideStepConnection').textContent = texts.guideStepConnection;
    document.getElementById('guideStepConnectionText').textContent = texts.guideStepConnectionText;
    document.getElementById('guideStepTicket').textContent = texts.guideStepTicket;
    document.getElementById('guideStepTicketText').textContent = texts.guideStepTicketText;
    document.getElementById('guideStepPresets').textContent = texts.guideStepPresets;
    document.getElementById('guideStepPresetsText').textContent = texts.guideStepPresetsText;
    document.getElementById('lblJiraDomain').textContent = texts.lblJiraDomain;
    document.getElementById('lblEmail').textContent = texts.lblEmail;
    document.getElementById('lblApiToken').textContent = texts.lblApiToken;
    document.getElementById('lblProjectKey').textContent = texts.lblProjectKey;
    document.getElementById('lblIssueType').textContent = texts.lblIssueType;
    document.getElementById('lblEpicPrefixMapping').textContent = texts.lblEpicPrefixMapping;
    document.getElementById('lblDueDateOffset').textContent = texts.lblDueDateOffset;
    document.getElementById('lblTitleTemplate').textContent = texts.lblTitleTemplate;
    document.getElementById('lblDescTemplate').textContent = texts.lblDescTemplate;
    document.getElementById('noteApiToken').innerHTML = texts.noteApiToken;
    document.getElementById('noteEpicMapping').textContent = texts.noteEpicMapping;
    document.getElementById('noteDueDateOffset').textContent = texts.noteDueDateOffset;
    document.getElementById('noteTitleTemplate').textContent = texts.noteTitleTemplate;
    document.getElementById('noteTemplate').innerHTML = texts.noteTemplate;
    document.getElementById('addMappingRow').textContent = texts.addMappingRow;
    document.getElementById('save').textContent = texts.save;
    document.querySelectorAll('[data-badge="required"]').forEach(badge => {
        badge.textContent = texts.badgeRequired;
    });
    document.querySelectorAll('[data-badge="optional"]').forEach(badge => {
        badge.textContent = texts.badgeOptional;
    });
    document.querySelectorAll('.mapping-remove').forEach(button => {
        button.title = texts.removeMappingRow;
        button.setAttribute('aria-label', texts.removeMappingRow);
    });

}

function saveOptions() {
    const jiraDomain = document.getElementById('jiraDomain').value.replace('https://', '').replace('/', '');
    const email = document.getElementById('email').value;
    const apiToken = document.getElementById('apiToken').value;
    const projectKey = document.getElementById('projectKey').value;
    const issueType = document.getElementById('issueType').value;
    syncMappingTextareaFromRows();
    const epicPrefixMapping = normalizeMappingText(document.getElementById('epicPrefixMapping').value);
    const { parentKey, titlePrefix } = derivePresetsFromMapping(epicPrefixMapping);
    const dueDateOffset = parseInt(document.getElementById('dueDateOffset').value, 10) || 0;
    const titleTemplate = document.getElementById('titleTemplate').value;
    const descTemplate = document.getElementById('descTemplate').value;
    const lang = document.querySelector('input[name="lang"]:checked').value;

    // 設定変更時は Account ID のキャッシュをクリアする (再取得させるため)
    optionStorage.set(
        { jiraDomain, email, apiToken, projectKey, issueType, parentKey, titlePrefix, epicPrefixMapping, dueDateOffset, titleTemplate, descTemplate, lang, accountId: '' },
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
    optionStorage.get(
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
            titleTemplate: defaultTitleTemplate,
            descTemplate: defaultTemplate,
            lang: 'ja' // デフォルト言語
        },
        (items) => {
            document.getElementById('jiraDomain').value = items.jiraDomain;
            document.getElementById('email').value = items.email;
            document.getElementById('apiToken').value = items.apiToken;
            document.getElementById('projectKey').value = items.projectKey;
            document.getElementById('issueType').value = items.issueType;
            const mappingText = migrateLegacyMapping(items);
            document.getElementById('epicPrefixMapping').value = mappingText;
            renderMappingRows(mappingText);
            document.getElementById('dueDateOffset').value = items.dueDateOffset !== undefined ? items.dueDateOffset : 2;
            const titleTemplate = !items.titleTemplate ||
                items.titleTemplate.trim() === '{summary}' ||
                items.titleTemplate.trim() === 'Message from {author} in {channel}'
                ? defaultTitleTemplate
                : items.titleTemplate;
            document.getElementById('titleTemplate').value = titleTemplate;
            document.getElementById('descTemplate').value = items.descTemplate;

            // 言語設定の反映
            const lang = translations[items.lang] ? items.lang : 'ja';
            document.querySelector(`input[name="lang"][value="${lang}"]`).checked = true;
            updateLanguage(lang);

        }
    );
}
