let lastClickedElement = null;

// 右クリックされた要素を記録しておく
document.addEventListener("contextmenu", (event) => {
    lastClickedElement = event.target;
}, true);

// Background scriptからのリクエストを待機
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractMessage") {
        // 設定されたPrefixを受け取る (無ければデフォルト)
        const titlePrefix = request.titlePrefix !== undefined ? request.titlePrefix : "[Discord]";
        const data = extractMessageInfo(lastClickedElement, titlePrefix);
        sendResponse(data);
    }
});

function extractMessageInfo(target, titlePrefix) {
    if (!target) return { error: "No element selected" };

    // メッセージコンテナを探す
    const messageElement = target.closest('[role="article"], [class*="message-"]');
    if (!messageElement) return { error: "Could not find message element. Please right-click directly on the message text." };

    // --- 1. メッセージ内容 ---
    const contentElement = messageElement.querySelector('[id^="message-content-"], [class*="messageContent-"]');
    const content = contentElement ? contentElement.innerText : messageElement.innerText;

    // --- 2. 投稿者 ---
    let author = "Unknown User";
    const authorElement = messageElement.querySelector('h3 [class*="username"]');
    if (authorElement) {
        author = authorElement.innerText;
    }
    if (author === "Unknown User" && contentElement && contentElement.id) {
        const msgId = contentElement.id.split('-').pop();
        if (msgId) {
            const usernameHeader = document.getElementById(`message-username-${msgId}`);
            if (usernameHeader) author = usernameHeader.innerText;
        }
    }

    // --- 3. 時刻 ---
    const timeElement = messageElement.querySelector('time');
    const timestamp = timeElement ? timeElement.getAttribute("datetime") : new Date().toISOString();

    // --- 4. サーバー名とチャンネル名 (タイトル優先ロジック) ---

    let serverName = "";
    let channelName = "";

    // A. ウィンドウタイトルから取得 (最優先)
    let pageTitle = document.title;
    // 通知バッジ "(1) " や "● " を削除
    pageTitle = pageTitle.replace(/^[\(\●].*?[\)\s]\s?/, "").trim();

    if (pageTitle.includes(" | ")) {
        // Web版: Channel | Server | Discord
        const parts = pageTitle.split(" | ");
        if (parts.length >= 3) {
            channelName = parts[0].trim();
            serverName = parts[1].trim();
        } else if (parts.length === 2) {
            // Channel | Discord (通常DMなど)
            channelName = parts[0].trim();
            serverName = "Direct Message / Other";
        }
    } else if (pageTitle.includes(" - ")) {
        // アプリ版などパターン違い: Channel - Server
        // ただし "Discord - Channel" の場合もあるので注意が必要だが、
        // 一般的なブラウザ版を想定
        const parts = pageTitle.split(" - ");
        if (parts.length >= 2) {
            // 末尾が "Discord" ならそれは無視
            if (parts[parts.length - 1].trim() === "Discord") {
                parts.pop();
            }
            if (parts.length >= 2) {
                channelName = parts[0].trim();
                serverName = parts[1].trim();
            } else if (parts.length === 1) {
                channelName = parts[0].trim();
            }
        }
    }

    // B. DOMから取得 (タイトルの解析に失敗した場合、または情報が不足している場合のバックアップ)
    if (!serverName || !channelName || serverName === "Discord" || channelName === "Discord") {

        let domServer = "";
        let domChannel = "";

        const serverElement = document.querySelector('nav header h1');
        if (serverElement) domServer = serverElement.innerText.trim();

        const channelElement = document.querySelector('[class*="chatContent-"] [class*="title-"] h3, [data-cy="channel-name"], h3[class*="title-"]');
        if (channelElement) domChannel = channelElement.innerText.trim();

        // 空欄がある場合のみDOMの情報で埋める
        if (!serverName || serverName === "Discord") serverName = domServer || "Unknown Server";
        if (!channelName || channelName === "Discord") channelName = domChannel || "Unknown Channel";

        // サイドバーの選択されているサーバーアイコンから取得 ("Server Name" in aria-label)
        if (serverName === "Unknown Server") {
            // Side bar guild icon selectors (attempt to find selected guild item)
            // wrapper-3kah-n selected-1Drb7Z -> child with aria-label
            const selectedGiven = document.querySelector('nav[class*="guilds-"] [class*="selected-"] [aria-label], [data-list-item-id^="guildsnav_"][class*="selected"]');
            if (selectedGiven && selectedGiven.getAttribute("aria-label")) {
                serverName = selectedGiven.getAttribute("aria-label");
            }
        }
    }

    // C. 最終健全性チェック (Final Sanity Check)
    // それでもなお "Discord" が入っていたり、逆転している場合の補正

    // "Discord" という名称は除去
    if (serverName.toLowerCase() === "discord") serverName = "Unknown Server";
    if (channelName.toLowerCase() === "discord") channelName = "Unknown Channel";

    // サーバー名が "#" で始まっているなら、それはチャンネル名の可能性大
    if (serverName.startsWith("#")) {
        // もしチャンネル名が不明なら、サーバー名をチャンネル名に移動
        if (channelName === "Unknown Channel" || !channelName) {
            channelName = serverName;
            serverName = "Unknown Server";
        }
    }

    // --- 5. メッセージリンク ---
    const urlParts = window.location.href.split('/');
    let messageId = null;
    if (contentElement && contentElement.id) {
        messageId = contentElement.id.split('-').pop();
    } else if (messageElement.id) {
        messageId = messageElement.id.split('-').pop();
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

    if (titlePrefix) {
        defaultSummary = `${titlePrefix} ${defaultSummary}`;
    }

    const summary = prompt("Jiraチケットのタイトルを入力してください:", defaultSummary);

    if (summary === null) {
        return { error: "User cancelled the ticket creation." };
    }

    const result = {
        summary: summary,
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
