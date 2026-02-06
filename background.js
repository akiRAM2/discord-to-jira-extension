// background.js

// インストール時に初期設定を保存
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "createJiraTicket",
        title: "Create Jira Ticket",
        contexts: ["all"] // テキスト選択外でも使えるように変更
    });
});

// コンテキストメニューがクリックされた時の処理
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "createJiraTicket") {

        // 設定からPrefixとParentKey(Presets)と詳細設定を取得してContent Scriptに渡す
        chrome.storage.sync.get({ titlePrefix: '[Discord]', parentKey: '', lang: 'en' }, (items) => {
            const titlePrefix = items.titlePrefix;
            const parentKeyPresets = items.parentKey;
            const lang = items.lang;

            // Content scriptにメッセージを送ってデータ抽出を依頼
            chrome.tabs.sendMessage(tab.id, {
                action: "extractMessage",
                titlePrefix: titlePrefix,
                parentKeyPresets: parentKeyPresets,
                lang: lang
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                    alertUser(tab.id, "Please reload the page and try again.");
                    return;
                }

                if (response && response.error) {
                    // キャンセル等の明示的なエラー以外はアラート
                    if (response.error !== "User cancelled") {
                        alertUser(tab.id, response.error);
                    }
                } else if (response) {
                    createJiraTicket(response, tab.id);
                }
            });
        });
    }
});

const defaultTemplate = `**Extracted from Discord Message**

- Author: {author}
- Server: {server}
- Channel: {channel}
- Time: {time}
- Link: [Open Message]({link})

**Message Content**

{content}`;

async function createJiraTicket(data, tabId) {
    // 設定を読み込む
    const config = await chrome.storage.sync.get({
        jiraDomain: '',
        email: '',
        apiToken: '',
        projectKey: '',
        issueType: 'Task',
        parentKey: '',
        accountId: '',
        descTemplate: defaultTemplate
    });

    if (!config.jiraDomain || !config.email || !config.apiToken || !config.projectKey) {
        alertUser(tabId, "Please set Jira configuration in the extension options.");
        chrome.runtime.openOptionsPage();
        return;
    }

    const authString = btoa(`${config.email}:${config.apiToken}`);

    // Account IDが未取得の場合、myself APIから取得を試みる
    if (!config.accountId) {
        try {
            console.log("Fetching Jira Account ID...");
            const myselfUrl = `https://${config.jiraDomain}/rest/api/3/myself`;
            const userResponse = await fetch(myselfUrl, {
                method: "GET",
                headers: {
                    "Authorization": `Basic ${authString}`,
                    "Accept": "application/json"
                }
            });

            if (userResponse.ok) {
                const userData = await userResponse.json();
                config.accountId = userData.accountId;
                // 取得したIDを保存しておく（次回以降のため）
                await chrome.storage.sync.set({ accountId: config.accountId });
                console.log("Account ID fetched and saved:", config.accountId);
            } else {
                console.warn("Failed to fetch user info:", userResponse.status);
            }
        } catch (e) {
            console.warn("Error fetching user info:", e);
        }
    }

    const summary = data.summary || `[Discord] Message from ${data.author} in #${data.channelName}`;

    // テンプレートを使用して ADF (Description) を生成
    const description = parseTemplateToADF(config.descTemplate, data);

    const body = {
        fields: {
            project: { key: config.projectKey },
            summary: summary,
            description: description,
            issuetype: { name: config.issueType }
        }
    };

    // 親課題(Epic/Parent)が設定されている場合に追加
    // ユーザーが選択したキー(data.parentKey)を優先、なければ設定のデフォルトを使う
    const targetParentKey = data.parentKey || config.parentKey;

    // 改行などが含まれている場合があるので整形 (最初の1行目の有効な文字列を使うなど)
    // ここでは単純にトリムして空文字チェック
    if (targetParentKey && targetParentKey.trim().length > 0) {
        // 設定値が複数行（プリセット）のまま来てしまった場合のフォールバック（最初の1つを使うなど）
        // ただし通常はdata.parentKeyで単一の値が来ているはず。
        // config.parentKeyが複数行の場合は、data.parentKeyが指定されていない＝モーダルキャンセル or スキップ？
        // ここでは単純な単一キーであることを期待してセット
        const cleanParentKey = targetParentKey.split('\n')[0].trim();
        if (cleanParentKey) {
            body.fields.parent = { key: cleanParentKey };
        }
    }

    // 担当者が取得できている場合、設定する
    if (config.accountId) {
        body.fields.assignee = { id: config.accountId };
    }

    try {
        const url = `https://${config.jiraDomain}/rest/api/3/issue`;
        console.log("Sending request to Jira:", url, body);

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Basic ${authString}`,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(body)
        });

        if (response.status === 201) {
            const result = await response.json();
            console.log("Jira Response Success:", result);

            // チケットのURLを生成して新しいタブで開く
            const issueKey = result.key;
            const browseUrl = `https://${config.jiraDomain}/browse/${issueKey}`;

            chrome.tabs.create({ url: browseUrl });
        } else {

            const errorText = await response.text();
            console.error("Jira API Error", errorText);
            console.error("Sent Body:", JSON.stringify(body, null, 2));

            let errorMessage = `Failed to create ticket. Status: ${response.status}`;
            try {
                const errorJson = JSON.parse(errorText);
                if (errorJson.errors) {
                    const details = Object.entries(errorJson.errors)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join("\n");
                    errorMessage += `\n\nDetails:\n${details}`;
                } else if (errorJson.errorMessages && errorJson.errorMessages.length > 0) {
                    errorMessage += `\n\nMessages:\n${errorJson.errorMessages.join("\n")}`;
                } else {
                    errorMessage += `\n\nResponse: ${errorText}`;
                }
            } catch (e) {
                errorMessage += `\n\nResponse: ${errorText.substring(0, 100)}...`;
            }

            alertUser(tabId, errorMessage);
        }
    } catch (error) {
        console.error("Fetch Error", error);
        alertUser(tabId, "Network error occurred.");
    }
}

// シンプルなMarkdown風テンプレートパーサー
function parseTemplateToADF(template, data) {
    // プレースホルダーの置換
    let text = template
        .replace(/{author}/g, data.author)
        .replace(/{server}/g, data.serverName)
        .replace(/{channel}/g, data.channelName)
        .replace(/{time}/g, new Date(data.timestamp).toLocaleString())
        .replace(/{link}/g, data.messageLink)
        .replace(/{content}/g, data.content);

    const doc = {
        type: "doc",
        version: 1,
        content: []
    };

    // 行ごとに分割して処理
    const lines = text.split('\n');
    let currentList = null;

    for (let line of lines) {
        const trimmed = line.trim();

        if (trimmed.length === 0) {
            // 空行はリストの終了または段落区切り
            if (currentList) {
                doc.content.push(currentList);
                currentList = null;
            }
            // 空の段落を追加してスペーサーとする
            doc.content.push({ type: "paragraph", content: [] });
            continue;
        }

        // リストアイテム (- Item)
        if (trimmed.startsWith('- ')) {
            if (!currentList) {
                currentList = { type: "bulletList", content: [] };
            }
            const contentText = trimmed.substring(2);
            currentList.content.push({
                type: "listItem",
                content: [{
                    type: "paragraph",
                    content: parseInlineFormatting(contentText)
                }]
            });
        } else {
            // 通常の段落 (リスト終了)
            if (currentList) {
                doc.content.push(currentList);
                currentList = null;
            }

            doc.content.push({
                type: "paragraph",
                content: parseInlineFormatting(line)
            });
        }
    }

    if (currentList) {
        doc.content.push(currentList);
    }

    // コンテンツが空にならないように調整
    if (doc.content.length === 0) {
        doc.content.push({ type: "paragraph", content: [{ type: "text", text: " " }] });
    }

    return doc;
}

// インラインフォーマット解析 (太字とリンクのみ対応)
function parseInlineFormatting(text) {
    const contents = [];

    // 簡易的なパース処理: **Bold** と [Link](url) を処理
    // 正規表現で分割: (\*\*.*?\*\*|\[.*?\]\(.*?\))
    const parts = text.split(/(\*\*.*?\*\*|\[.*?\]\(.*?\))/g);

    for (const part of parts) {
        if (!part) continue;

        if (part.startsWith('**') && part.endsWith('**')) {
            // Bold
            contents.push({
                type: "text",
                text: part.slice(2, -2),
                marks: [{ type: "strong" }]
            });
        } else if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
            // Link
            const match = part.match(/\[(.*?)\]\((.*?)\)/);
            if (match) {
                contents.push({
                    type: "text",
                    text: match[1],
                    marks: [{ type: "link", attrs: { href: match[2] } }]
                });
            } else {
                contents.push({ type: "text", text: part });
            }
        } else {
            // Normal text
            contents.push({ type: "text", text: part });
        }
    }

    return contents.length > 0 ? contents : [{ type: "text", text: " " }]; // 空文字対策
}

// ユーザーに通知を表示するためにスクリプトを実行
function alertUser(tabId, message) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (msg) => { alert(msg); },
        args: [message]
    });
}
