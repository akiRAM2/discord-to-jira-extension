let lastClickedElement = null;

// 右クリックされた要素を記録しておく
document.addEventListener("contextmenu", (event) => {
    lastClickedElement = event.target;
}, true);

// Background scriptからのリクエストを待機
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractMessage") {
        const data = extractMessageInfo(lastClickedElement);
        sendResponse(data);
    }
});

function extractMessageInfo(target) {
    if (!target) return { error: "No element selected" };

    // メッセージコンテナを探す (role="article" または特定クラス)
    const messageElement = target.closest('[role="article"], [class*="message-"]');
    if (!messageElement) return { error: "Could not find message element. Please right-click directly on the message text." };

    // --- 1. メッセージ内容 ---
    // contentクラスを持つ要素、あるいは単純にinnerText
    const contentElement = messageElement.querySelector('[id^="message-content-"], [class*="messageContent-"]');
    const content = contentElement ? contentElement.innerText : messageElement.innerText;

    // --- 2. 投稿者 ---
    // header内のusername
    let author = "Unknown User";

    // パターンA: メッセージ要素内の h3 > span[class*="username"]
    const authorElement = messageElement.querySelector('h3 [class*="username"]');
    if (authorElement) {
        author = authorElement.innerText;
    }

    // パターンB: DOM IDからの逆引き (message-content-ID -> message-username-ID)
    if (author === "Unknown User" && contentElement && contentElement.id) {
        // id="message-content-123456789" -> "message-username-123456789"
        const msgId = contentElement.id.split('-').pop();
        if (msgId) {
            const usernameHeader = document.getElementById(`message-username-${msgId}`);
            if (usernameHeader) author = usernameHeader.innerText;
        }
    }

    // --- 3. 時刻 ---
    const timeElement = messageElement.querySelector('time');
    const timestamp = timeElement ? timeElement.getAttribute("datetime") : new Date().toISOString();

    // --- 4. サーバー名とチャンネル名 ---

    // 優先: タイトルから取得 (最も信頼性が高い)
    // フォーマット: "(1) #channel | Server | Discord"
    let pageTitle = document.title;
    // 通知バッジ削除
    pageTitle = pageTitle.replace(/^[\(\●].*?[\)\s]\s?/, "").trim();

    let serverName = "Unknown Server";
    let channelName = "Unknown Channel";

    // Web版Discordのタイトルは通常 "Channel | Server | Discord"
    if (pageTitle.includes(" | ")) {
        const parts = pageTitle.split(" | ");

        if (parts.length >= 3) {
            channelName = parts[0];
            serverName = parts[1];
        } else if (parts.length === 2) {
            channelName = parts[0];
            serverName = "Direct Message / Other";
        }
    }

    // DOMフォールバック
    if (serverName === "Unknown Server") {
        const serverHeader = document.querySelector('nav header h1');
        if (serverHeader) {
            serverName = serverHeader.innerText;
        }
    }

    if (channelName === "Unknown Channel" || channelName.includes("Unknown")) {
        const channelHeader = document.querySelector('h3[class*="title-"]');
        if (channelHeader) {
            channelName = channelHeader.innerText;
        }
    }

    // --- 5. メッセージリンク ---
    // メッセージIDの取得を試みる (id="chat-messages-...")
    // URLから取得するのが確実
    const urlParts = window.location.href.split('/');
    // [..., channels, GuildID, ChannelID]
    // メッセージIDはDOMから取得する必要がある
    let messageId = null;
    // id="message-content-123456789" のような形式を探す
    if (contentElement && contentElement.id) {
        messageId = contentElement.id.split('-').pop();
    } else if (messageElement.id) {
        // message-123456...
        messageId = messageElement.id.split('-').pop();
    }

    let messageLink = window.location.href;
    if (messageId && !window.location.href.endsWith(messageId)) {
        // 現在のURLがチャンネルまでなら、メッセージIDを付与
        messageLink = `${window.location.href}/${messageId}`;
    }

    const result = {
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
