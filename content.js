let lastClickedElement = null;

const defaultPreviewTemplate = `**Extracted from Discord Message**

- Author: {author}
- Server: {server}
- Channel: {channel}
- Time: {time}
- Link: [Open Message]({link})

**Message Content**

{content}`;

function cleanDiscordName(value) {
    if (!value) return "";
    return value
        .replace(/\s+/g, " ")
        .replace(/^#\s*/, "")
        .replace(/^Text channel\s+/i, "")
        .replace(/^Voice channel\s+/i, "")
        .replace(/^テキストチャンネル\s*/, "")
        .replace(/^ボイスチャンネル\s*/, "")
        .replace(/\s+\(\d+\)$/, "")
        .trim();
}

function getReadableText(element) {
    if (!element) return "";
    return cleanDiscordName(
        element.getAttribute("aria-label") ||
        element.getAttribute("title") ||
        element.textContent ||
        element.innerText ||
        ""
    );
}

function firstReadableFromSelectors(selectors) {
    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
            const text = getReadableText(element);
            if (text && text.toLowerCase() !== "discord") return text;
        }
    }
    return "";
}

function getChannelNameFromDom() {
    const fromHeader = firstReadableFromSelectors([
        '[data-cy="channel-name"]',
        'section[aria-label*="Channel"] h1',
        'section[aria-label*="チャンネル"] h1',
        'main h1',
        'h1[class*="title"]',
        '[class*="channelName"]'
    ]);
    if (fromHeader) return fromHeader;

    return firstReadableFromSelectors([
        '[class*="modeSelected"] a[aria-label]',
        '[class*="modeSelected"] [aria-label]',
        '[aria-current="page"][aria-label]',
        '[data-list-item-id^="channels___"] a[aria-label]',
        '[data-list-item-id^="channels___"][aria-label]'
    ]);
}

function getServerNameFromDom() {
    return firstReadableFromSelectors([
        'nav [data-list-item-id^="guildsnav___"][aria-label]',
        'nav [data-list-item-id^="guildsnav___"] [aria-label]',
        'nav [class*="selected"] a[aria-label]',
        'nav [class*="selected"] [aria-label]'
    ]);
}

// 右クリックされた要素を記録しておく
document.addEventListener("contextmenu", (event) => {
    lastClickedElement = event.target;
}, true);

// Background scriptからのリクエストを待機
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractMessage") {
        // 非同期処理を開始するためにPromise chainを使うか、即時return trueする
        (async () => {
            try {
                // 設定されたPrefixPresetsを受け取る (無ければデフォルト)
                // request.titlePrefix は現在、複数行の文字列（Presets）として渡ってくる
                const titlePrefixPresetsStr = request.titlePrefix !== undefined ? request.titlePrefix : "[Discord]";
                const parentKeyPresetsStr = request.parentKeyPresets || "";
                const epicPrefixMappingStr = request.epicPrefixMapping || "";
                const descTemplate = request.descTemplate || defaultPreviewTemplate;
                const lang = request.lang || "ja";

                // ここではPrefixを付与せず、生の抽出データだけ取得する
                const data = extractMessageInfo(lastClickedElement);

                if (data.error) {
                    sendResponse(data);
                    return;
                }

                // Presetsを配列化
                const validParentKeys = parentKeyPresetsStr
                    .split('\n')
                    .map(k => k.trim())
                    .filter(k => k.length > 0);

                const validPrefixes = titlePrefixPresetsStr
                    .split('\n')
                    .map(k => k.trim())
                    .filter(k => k.length > 0);

                // モーダル表示
                const userInput = await openTicketModal(data.defaultSummary, validParentKeys, validPrefixes, epicPrefixMappingStr, lang, descTemplate, data);

                // データを更新
                data.summary = userInput.summary;
                data.parentKey = userInput.parentKey;
                data.selectedPrefix = userInput.selectedPrefix;

                sendResponse(data);
            } catch (err) {
                // キャンセルの場合など
                if (err === "cancelled") {
                    sendResponse({ error: "User cancelled" });
                } else {
                    console.error(err);
                    sendResponse({ error: err.toString() });
                }
            }
        })();

        return true; // Indicates we will respond asynchronously
    }
});

function extractMessageInfo(target) {
    if (!target) return { error: "No element selected" };

    // message-content (テキスト本文付近) を直接クリックしたか確認
    // これが最も確実
    let contentElement = target.closest('[id^="message-content-"]');
    let messageElement = null;

    if (contentElement) {
        // コンテンツが見つかれば、その親のメッセージ行（行全体）を探す
        // 通常は親または祖先に chat-messages-{ID} や role="article" がある
        messageElement = contentElement.closest('[id^="chat-messages-"], [role="article"]');
    } else {
        // テキスト外（余白やヘッダーなど）をクリックした場合
        messageElement = target.closest('[id^="chat-messages-"], [role="article"]');

        if (messageElement) {
            // 行全体からコンテンツを探す
            // ★ ここで "一個上の発言" になるリスクがあるため、
            // messageElement 内に 複数の message-content がないか、あるいは
            // closest の取り方が広すぎないか注意
            // 基本的に chat-messages-ID は1つのメッセージに対応すると仮定
            contentElement = messageElement.querySelector('[id^="message-content-"], [class*="messageContent-"]');
        } else {
            // 最後の手段: class="message-" を探す (誤検知リスクあり)
            const fallback = target.closest('[class*="message-"]');
            if (fallback) {
                messageElement = fallback;
                contentElement = messageElement.querySelector('[id^="message-content-"], [class*="messageContent-"]');
            }
        }
    }

    if (!messageElement && !contentElement) {
        return { error: "Could not find message element. Please right-click directly on the message text." };
    }

    // ハイライト対象 (行全体があれば行、なければコンテンツのみ)
    const targetEl = messageElement || contentElement;

    // ★ ユーザーにどのメッセージが選択されたか視覚的に通知する (フラッシュエフェクト)
    if (targetEl) {
        const originalTransition = targetEl.style.transition;
        const originalBg = targetEl.style.backgroundColor;
        targetEl.style.transition = "background-color 0.3s ease";
        targetEl.style.backgroundColor = "rgba(255, 255, 0, 0.3)"; // 薄い黄色
        setTimeout(() => {
            targetEl.style.backgroundColor = originalBg;
            setTimeout(() => {
                targetEl.style.transition = originalTransition;
            }, 300);
        }, 1000);
    }

    // --- 1. メッセージ内容 ---
    const content = contentElement ? contentElement.innerText : (targetEl ? targetEl.innerText : "");

    // --- 2. 投稿者 ---
    let author = "Unknown User";
    // messageElement (行) が取得できている場合はそこの header を探す
    // もし coalesced message (続きの発言) の場合、header が省略されている可能性がある
    if (messageElement) {
        const authorElement = messageElement.querySelector('h3 [class*="username"]');
        if (authorElement) {
            author = authorElement.innerText;
        }
    }

    // Fallback: 近くの username ヘッダーを探す、あるいは ID から逆引き
    if (author === "Unknown User" && contentElement && contentElement.id) {
        const msgId = contentElement.id.split('-').pop();
        if (msgId) {
            const usernameHeader = document.getElementById(`message-username-${msgId}`);
            if (usernameHeader) author = usernameHeader.innerText;
        }
    }

    // --- 3. 時刻 ---
    // messageElement 内の time か、なければコンテンツ付近
    let timeElement = null;
    if (messageElement) timeElement = messageElement.querySelector('time');
    // Coalesced の場合、時刻は hover しないと出ない or DOM 上は存在するが見えない？
    // 通常は time 要素があるはず
    const timestamp = timeElement ? timeElement.getAttribute("datetime") : new Date().toISOString();

    // --- 4. サーバー名とチャンネル名 (タイトル優先ロジック) ---

    let serverName = "";
    let channelName = "";

    // A. ウィンドウタイトルから取得 (最優先)
    let pageTitle = document.title;
    // 通知バッジ "(1) " や "● " を削除
    pageTitle = pageTitle.replace(/^[\(\●].*?[\)\s]\s?/, "").trim();

    // Debug: タイトル確認
    // console.log("Current Page Title:", pageTitle);

    if (pageTitle.includes(" | ")) {
        // Web版: Channel | Server | Discord
        // 例: "general | MyServer | Discord"
        const parts = pageTitle.split(" | ");
        if (parts.length >= 3) {
            channelName = cleanDiscordName(parts[0]);
            serverName = cleanDiscordName(parts[1]);
        } else if (parts.length === 2) {
            // Channel | Discord (通常DMなど)
            channelName = cleanDiscordName(parts[0]);
            serverName = ""; // DM等はサーバー名なし
        }
    } else if (pageTitle.includes(" - ")) {
        // 例: "general - MyServer"
        const parts = pageTitle.split(" - ");
        // 末尾が "Discord" なら削除
        if (parts[parts.length - 1].trim() === "Discord") {
            parts.pop();
        }

        if (parts.length >= 2) {
            channelName = cleanDiscordName(parts[0]);
            serverName = cleanDiscordName(parts[1]);
        } else if (parts.length === 1) {
            channelName = cleanDiscordName(parts[0]);
            serverName = "";
        }
    }

    // B. DOMから取得 (バックアップ)
    if (!channelName) channelName = getChannelNameFromDom();
    if (!serverName) serverName = getServerNameFromDom();

    // C. クリーニング
    serverName = cleanDiscordName(serverName);
    channelName = cleanDiscordName(channelName);
    if (serverName.toLowerCase() === "discord") serverName = "";
    if (channelName.toLowerCase() === "discord") channelName = "";

    // サーバー名が "#" で始まるならチャンネル名の可能性 (入れ替えは危険なので、単にサーバー名を空にする)
    if (serverName.startsWith("#")) {
        if (!channelName) channelName = serverName;
        serverName = "";
    }

    // Fallback logic was handled in previous block or simplified.
    // If unknown, just leave empty.


    // --- 5. メッセージリンク ---
    const urlParts = window.location.href.split('/');
    let messageId = null;
    if (contentElement && contentElement.id) {
        messageId = contentElement.id.split('-').pop();
    } else if (messageElement && messageElement.id) {
        // chat-messages-{ID} 形式の場合
        // ID が chat-messages-12345... となっているか確認
        if (messageElement.id.includes('chat-messages-')) {
            messageId = messageElement.id.replace('chat-messages-', '');
        } else {
            messageId = messageElement.id.split('-').pop();
        }
    }

    let messageLink = window.location.href;
    if (messageId && !window.location.href.endsWith(messageId)) {
        messageLink = `${window.location.href}/${messageId}`;
    }

    // デフォルトのタイトルを生成
    const selection = window.getSelection().toString().trim();
    let defaultSummary = "";

    // チャンネル名の多重#を防ぐ
    const displayChannelName = channelName.startsWith('#') ? channelName : `#${channelName}`;

    if (selection) {
        const sanitizedSelection = selection.replace(/[\r\n]+/g, " ");
        defaultSummary = `${sanitizedSelection} (${author}) in ${displayChannelName}`;
    } else {
        defaultSummary = `Message from ${author} in ${displayChannelName}`;
    }

    // Prefix付与はここでは行わなくなった (Modalで行う)

    const result = {
        defaultSummary: defaultSummary, // promptではなくmodal用に保持する
        content,
        author,
        timestamp,
        serverName,
        channelName,
        messageLink
    };

    console.log("[Discord-Jira] Extracted Data:", result);
    return result;
}

// --- Modal UI ---

function ensureJiraTicketModalStyles() {
    if (document.getElementById('jira-ext-modal-styles')) return;

    const style = document.createElement('style');
    style.id = 'jira-ext-modal-styles';
    style.textContent = `
        #jira-ext-modal-overlay {
            position: fixed;
            inset: 0;
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: rgba(11, 18, 32, 0.62);
            backdrop-filter: blur(8px);
            color: #172033;
            font-family: Arial, "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif;
            font-size: 14px;
        }

        #jira-ext-modal-overlay * {
            box-sizing: border-box;
        }

        .jira-ext-modal {
            width: min(860px, 96vw);
            max-height: min(760px, 92vh);
            overflow: hidden;
            border: 1px solid #d7deea;
            border-radius: 10px;
            background: #f6f8fc;
            box-shadow: 0 28px 80px rgba(0, 0, 0, 0.34);
            display: grid;
            grid-template-rows: auto minmax(0, 1fr) auto;
        }

        .jira-ext-modal-header {
            padding: 20px 22px 16px;
            border-bottom: 1px solid #e5ebf5;
            background: #ffffff;
        }

        .jira-ext-modal-title {
            margin: 0;
            font-size: 20px;
            line-height: 1.25;
            letter-spacing: 0;
        }

        .jira-ext-modal-subtitle {
            margin: 6px 0 0;
            color: #647184;
            font-size: 12px;
            line-height: 1.5;
        }

        .jira-ext-modal-body {
            overflow-y: auto;
            padding: 18px 22px 20px;
            display: flex;
            flex-direction: column;
            gap: 18px;
        }

        .jira-ext-field {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .jira-ext-field-label {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            color: #172033;
            font-size: 12px;
            font-weight: 800;
        }

        .jira-ext-badge {
            padding: 4px 8px;
            border-radius: 999px;
            background: #edf4ff;
            color: #0052cc;
            font-size: 10px;
            font-weight: 800;
            line-height: 1;
        }

        .jira-ext-title-input {
            width: 100%;
            min-height: 46px;
            padding: 11px 12px;
            border: 1px solid #cfd8e6;
            border-radius: 8px;
            background: #ffffff;
            color: #172033;
            font: inherit;
            font-size: 15px;
            transition: border-color 120ms ease, box-shadow 120ms ease;
        }

        .jira-ext-title-input:focus {
            border-color: #0052cc;
            outline: none;
            box-shadow: 0 0 0 3px rgba(0, 82, 204, 0.14);
        }

        .jira-ext-choice-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .jira-ext-pill,
        .jira-ext-parent-option {
            position: relative;
            cursor: pointer;
        }

        .jira-ext-pill input,
        .jira-ext-parent-option input {
            position: absolute;
            opacity: 0;
            pointer-events: none;
        }

        .jira-ext-pill span {
            display: inline-flex;
            align-items: center;
            min-height: 34px;
            padding: 8px 11px;
            border: 1px solid #cfd8e6;
            border-radius: 999px;
            background: #ffffff;
            color: #25324a;
            font-size: 12px;
            font-weight: 700;
            transition: border-color 120ms ease, background-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
        }

        .jira-ext-pill input:checked + span {
            border-color: #0052cc;
            background: #edf4ff;
            color: #0052cc;
            box-shadow: 0 0 0 2px rgba(0, 82, 204, 0.12);
        }

        .jira-ext-pill small {
            margin-left: 6px;
            color: #5f6b7a;
            font-size: 10px;
            font-weight: 700;
        }

        .jira-ext-parent-list {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            max-height: 220px;
            overflow-y: auto;
            padding: 10px;
            border: 1px solid #e5ebf5;
            border-radius: 8px;
            background: #ffffff;
        }

        .jira-ext-parent-option span {
            display: flex;
            align-items: center;
            min-height: 38px;
            padding: 9px 10px;
            border: 1px solid #d7deea;
            border-radius: 8px;
            background: #f9fbff;
            color: #25324a;
            font-size: 12px;
            font-weight: 700;
            overflow-wrap: anywhere;
            transition: border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
        }

        .jira-ext-parent-option input:checked + span {
            border-color: #0052cc;
            background: #edf4ff;
            box-shadow: 0 0 0 2px rgba(0, 82, 204, 0.12);
        }

        .jira-ext-parent-option.is-flashed span {
            background: #e7f7ee;
            border-color: #32a467;
        }

        .jira-ext-preview-grid {
            display: grid;
            grid-template-columns: 1fr 1.2fr;
            gap: 12px;
        }

        .jira-ext-preview-card {
            min-width: 0;
            border: 1px solid #d7deea;
            border-radius: 8px;
            background: #ffffff;
            overflow: hidden;
        }

        .jira-ext-preview-title {
            padding: 10px 12px;
            border-bottom: 1px solid #e5ebf5;
            background: #f9fbff;
            color: #25324a;
            font-size: 12px;
            font-weight: 800;
        }

        .jira-ext-preview-content {
            margin: 0;
            padding: 12px;
            color: #25324a;
            font: 12px/1.5 Consolas, "Courier New", monospace;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            max-height: 190px;
            overflow: auto;
        }

        .jira-ext-modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            padding: 16px 22px;
            border-top: 1px solid #e5ebf5;
            background: #ffffff;
        }

        .jira-ext-btn {
            min-width: 118px;
            border: 0;
            border-radius: 8px;
            padding: 10px 14px;
            cursor: pointer;
            font: inherit;
            font-size: 13px;
            font-weight: 800;
        }

        .jira-ext-btn-secondary {
            background: #edf1f7;
            color: #25324a;
        }

        .jira-ext-btn-primary {
            background: #0052cc;
            color: #ffffff;
            box-shadow: 0 10px 20px rgba(0, 82, 204, 0.24);
        }

        .jira-ext-btn-primary:hover {
            background: #0065ff;
        }

        @media (max-width: 680px) {
            #jira-ext-modal-overlay {
                padding: 12px;
            }

            .jira-ext-parent-list {
                grid-template-columns: 1fr;
            }

            .jira-ext-preview-grid {
                grid-template-columns: 1fr;
            }

            .jira-ext-modal-footer {
                flex-direction: column-reverse;
            }

            .jira-ext-btn {
                width: 100%;
            }
        }
    `;
    document.head.appendChild(style);
}

function buildPreviewText(template, data) {
    return template
        .replace(/{author}/g, data.author || '')
        .replace(/{server}/g, data.serverName || '')
        .replace(/{channel}/g, data.channelName || '')
        .replace(/{time}/g, data.timestamp ? new Date(data.timestamp).toLocaleString() : '')
        .replace(/{link}/g, data.messageLink || '')
        .replace(/{content}/g, data.content || '');
}

function openTicketModal(defaultSummary, parentKeys, prefixPresets, epicPrefixMappingStr = '', lang = 'ja', descTemplate = defaultPreviewTemplate, previewData = {}) {
    // Prefix → Epic マッピングをパース
    const prefixEpicMap = {};
    if (epicPrefixMappingStr) {
        epicPrefixMappingStr.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && trimmed.includes(':')) {
                const [prefix, epic] = trimmed.split(':').map(s => s.trim());
                if (prefix && epic) {
                    prefixEpicMap[prefix] = epic;
                }
            }
        });
    }

    const texts = {
        en: {
            header: "Create Jira Ticket",
            subtitle: "Review the title and routing before sending this Discord message to Jira.",
            prefixLabel: "Prefix (Optional)",
            titleLabel: "Ticket Title",
            previewLabel: "Preview",
            titlePreview: "Issue Title",
            bodyPreview: "Description",
            parentLabel: "Parent Issue / Epic (Optional)",
            selectable: "Selectable",
            none: "None",
            cancel: "Cancel",
            create: "Create Ticket",
            alertTitle: "Title is required"
        },
        ja: {
            header: "Jiraチケットを作成",
            subtitle: "タイトルと紐付け先を確認してから、DiscordメッセージをJiraに送ります。",
            prefixLabel: "接頭辞を選ぶ (任意)",
            titleLabel: "チケットタイトル",
            previewLabel: "プレビュー",
            titlePreview: "課題タイトル",
            bodyPreview: "本文",
            parentLabel: "親課題 / エピック (任意)",
            selectable: "選択可",
            none: "なし",
            cancel: "キャンセル",
            create: "チケット作成",
            alertTitle: "タイトルは必須です"
        }
    };
    const t = texts[lang] || texts.en;
    ensureJiraTicketModalStyles();

    return new Promise((resolve, reject) => {
        // 既存のモーダルがあれば削除
        const existing = document.getElementById('jira-ext-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'jira-ext-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'jira-ext-modal';
        overlay.appendChild(modal);

        const modalHeader = document.createElement('div');
        modalHeader.className = 'jira-ext-modal-header';
        const header = document.createElement('h2');
        header.className = 'jira-ext-modal-title';
        header.textContent = t.header;
        const subtitle = document.createElement('p');
        subtitle.className = 'jira-ext-modal-subtitle';
        subtitle.textContent = t.subtitle;
        modalHeader.appendChild(header);
        modalHeader.appendChild(subtitle);
        modal.appendChild(modalHeader);

        const modalBody = document.createElement('div');
        modalBody.className = 'jira-ext-modal-body';
        modal.appendChild(modalBody);

        const makeField = (labelText, badgeText = '') => {
            const field = document.createElement('div');
            field.className = 'jira-ext-field';
            const label = document.createElement('div');
            label.className = 'jira-ext-field-label';
            const text = document.createElement('span');
            text.textContent = labelText;
            label.appendChild(text);
            if (badgeText) {
                const badge = document.createElement('span');
                badge.className = 'jira-ext-badge';
                badge.textContent = badgeText;
                label.appendChild(badge);
            }
            field.appendChild(label);
            return field;
        };
        let updateTitlePreview = () => {};

        // --- Prefix Selection ---
        if (prefixPresets && prefixPresets.length > 0) {
            const prefixField = makeField(t.prefixLabel, t.selectable);
            const prefixContainer = document.createElement('div');
            prefixContainer.className = 'jira-ext-choice-grid';

            // "None"
            const pNoneLabel = document.createElement('label');
            pNoneLabel.className = 'jira-ext-pill';

            const pNoneRadio = document.createElement('input');
            pNoneRadio.type = 'radio';
            pNoneRadio.name = 'jiraTitlePrefix';
            pNoneRadio.value = '';
            // Default to None? or First? 
            // Previous logic was "always apply". Now "selectable".
            // Let's default to the first one for convenience, as users likely want a prefix if they set them.
            pNoneRadio.checked = false;
            pNoneRadio.addEventListener('change', () => updateTitlePreview());

            const pNoneText = document.createElement('span');
            pNoneText.textContent = t.none;
            pNoneLabel.appendChild(pNoneRadio);
            pNoneLabel.appendChild(pNoneText);
            prefixContainer.appendChild(pNoneLabel);

            prefixPresets.forEach((p, idx) => {
                const pLabel = document.createElement('label');
                pLabel.className = 'jira-ext-pill';

                const pRadio = document.createElement('input');
                pRadio.type = 'radio';
                pRadio.name = 'jiraTitlePrefix';
                pRadio.value = p;

                if (idx === 0) pRadio.checked = true; // Default to first

                // Prefix 選択時に対応する Epic を自動選択
                pRadio.addEventListener('change', () => {
                    updateTitlePreview();
                    if (pRadio.checked && prefixEpicMap[p]) {
                        const targetEpic = prefixEpicMap[p];
                        const epicRadios = modal.querySelectorAll('input[name="jiraParentKey"]');
                        epicRadios.forEach(er => {
                            if (er.value === targetEpic) {
                                er.checked = true;
                                er.parentElement.classList.add('is-flashed');
                                setTimeout(() => { er.parentElement.classList.remove('is-flashed'); }, 600);
                            }
                        });
                    }
                });

                const pText = document.createElement('span');
                pText.textContent = p;

                pLabel.appendChild(pRadio);
                pLabel.appendChild(pText);

                // 紐付けがある場合、ヒントを表示
                if (prefixEpicMap[p]) {
                    const small = document.createElement('small');
                    small.textContent = `→ ${prefixEpicMap[p]}`;
                    pText.appendChild(small);
                }

                prefixContainer.appendChild(pLabel);
            });
            prefixField.appendChild(prefixContainer);
            modalBody.appendChild(prefixField);
        }

        // Title Input
        const titleField = makeField(t.titleLabel);

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.value = defaultSummary;
        titleInput.className = 'jira-ext-title-input';
        titleField.appendChild(titleInput);
        modalBody.appendChild(titleField);

        const previewField = makeField(t.previewLabel);
        const previewGrid = document.createElement('div');
        previewGrid.className = 'jira-ext-preview-grid';

        const titlePreviewCard = document.createElement('div');
        titlePreviewCard.className = 'jira-ext-preview-card';
        const titlePreviewLabel = document.createElement('div');
        titlePreviewLabel.className = 'jira-ext-preview-title';
        titlePreviewLabel.textContent = t.titlePreview;
        const titlePreview = document.createElement('pre');
        titlePreview.className = 'jira-ext-preview-content';
        titlePreviewCard.appendChild(titlePreviewLabel);
        titlePreviewCard.appendChild(titlePreview);

        const bodyPreviewCard = document.createElement('div');
        bodyPreviewCard.className = 'jira-ext-preview-card';
        const bodyPreviewLabel = document.createElement('div');
        bodyPreviewLabel.className = 'jira-ext-preview-title';
        bodyPreviewLabel.textContent = t.bodyPreview;
        const bodyPreview = document.createElement('pre');
        bodyPreview.className = 'jira-ext-preview-content';
        bodyPreview.textContent = buildPreviewText(descTemplate, previewData);
        bodyPreviewCard.appendChild(bodyPreviewLabel);
        bodyPreviewCard.appendChild(bodyPreview);

        previewGrid.appendChild(titlePreviewCard);
        previewGrid.appendChild(bodyPreviewCard);
        previewField.appendChild(previewGrid);
        modalBody.appendChild(previewField);

        updateTitlePreview = () => {
            const checkedPrefix = modal.querySelector('input[name="jiraTitlePrefix"]:checked');
            const prefix = checkedPrefix && checkedPrefix.value ? `${checkedPrefix.value} ` : '';
            titlePreview.textContent = `${prefix}${titleInput.value}`;
        };
        titleInput.addEventListener('input', updateTitlePreview);

        // Parent Key Selection (If available)
        let selectedParent = null;

        // プリセットがあればラジオボタンを表示
        if (parentKeys && parentKeys.length > 0) {
            const parentField = makeField(t.parentLabel, t.selectable);

            const radioContainer = document.createElement('div');
            radioContainer.className = 'jira-ext-parent-list';

            // "None" option
            const noneLabel = document.createElement('label');
            noneLabel.className = 'jira-ext-parent-option';
            const noneRadio = document.createElement('input');
            noneRadio.type = 'radio';
            noneRadio.name = 'jiraParentKey';
            noneRadio.value = '';
            noneRadio.checked = false;
            const noneText = document.createElement('span');
            noneText.textContent = t.none;
            noneLabel.appendChild(noneRadio);
            noneLabel.appendChild(noneText);
            radioContainer.appendChild(noneLabel);

            parentKeys.forEach((key, index) => {
                const label = document.createElement('label');
                label.className = 'jira-ext-parent-option';

                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = 'jiraParentKey';
                radio.value = key;
                radio.checked = index === 0;
                const text = document.createElement('span');
                text.textContent = key;

                label.appendChild(radio);
                label.appendChild(text);
                radioContainer.appendChild(label);
            });

            parentField.appendChild(radioContainer);
            modalBody.appendChild(parentField);
        }

        // Buttons
        const btnContainer = document.createElement('div');
        btnContainer.className = 'jira-ext-modal-footer';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = t.cancel;
        cancelBtn.className = 'jira-ext-btn jira-ext-btn-secondary';
        cancelBtn.onclick = () => {
            overlay.remove();
            reject('cancelled');
        };

        const createBtn = document.createElement('button');
        createBtn.textContent = t.create;
        createBtn.className = 'jira-ext-btn jira-ext-btn-primary';
        createBtn.onclick = () => {
            const finalSummary = titleInput.value;
            if (!finalSummary) {
                alert(t.alertTitle);
                return;
            }

            // Get selected parent
            const checkedRadio = modal.querySelector('input[name="jiraParentKey"]:checked');
            const finalParent = checkedRadio ? checkedRadio.value : '';

            // Get selected prefix
            const checkedPrefix = modal.querySelector('input[name="jiraTitlePrefix"]:checked');
            const finalPrefix = checkedPrefix ? checkedPrefix.value : '';

            overlay.remove();
            resolve({
                summary: finalSummary,
                parentKey: finalParent,
                selectedPrefix: finalPrefix
            });
        };

        btnContainer.appendChild(cancelBtn);
        btnContainer.appendChild(createBtn);
        modal.appendChild(btnContainer);

        // Esc key to close
        const escListener = (e) => {
            if (e.key === "Escape") {
                document.removeEventListener('keydown', escListener);
                overlay.remove();
                reject('cancelled');
            }
        };
        document.addEventListener('keydown', escListener);

        updateTitlePreview();
        document.body.appendChild(overlay);
        titleInput.focus();
    });
}
