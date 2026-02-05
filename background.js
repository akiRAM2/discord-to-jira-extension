chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "createJiraTicket",
        title: "Create Jira Ticket",
        contexts: ["selection", "page", "link"],
        documentUrlPatterns: ["https://discord.com/*"]
    });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "createJiraTicket") {
        try {
            // まずメッセージ送信を試みる
            const response = await sendMessageToTab(tab.id, { action: "extractMessage" });
            handleResponse(response, tab.id);
        } catch (err) {
            console.warn("Initial connection failed, trying to inject script...", err);

            // 失敗したらスクリプトを注入して再試行
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["content.js"]
                });

                // 注入直後は少し待つ必要あがある場合もあるが、まずは即試行
                // content.jsの実行完了を待つのでawaitだけで十分なはずだが、
                // リスナー登録のタイミング問題があるため少し待つ
                setTimeout(async () => {
                    try {
                        // 再送信
                        const response = await sendMessageToTab(tab.id, { action: "extractMessage" });
                        handleResponse(response, tab.id);
                    } catch (retryErr) {
                        console.error("Retry failed", retryErr);
                        alertUser(tab.id, "Error: Could not communicate with page. Please reload the Discord tab.\n\n" + retryErr.message);
                    }
                }, 200);

            } catch (injectErr) {
                console.error("Injection failed", injectErr);
                alertUser(tab.id, "Error: Failed to inject script. Please reload the page.\n\n" + injectErr.message);
            }
        }
    }
});

function handleResponse(response, tabId) {
    if (response && response.error) {
        alertUser(tabId, response.error);
        return;
    }
    createJiraTicket(response, tabId);
}

function sendMessageToTab(tabId, message) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(response);
            }
        });
    });
}

async function createJiraTicket(data, tabId) {
    // 設定を読み込む
    const config = await chrome.storage.sync.get({
        jiraDomain: '',
        email: '',
        apiToken: '',
        projectKey: '',
        issueType: 'Task'
    });

    if (!config.jiraDomain || !config.email || !config.apiToken || !config.projectKey) {
        alertUser(tabId, "Please set Jira configuration in the extension options.");
        chrome.runtime.openOptionsPage();
        return;
    }

    const authString = btoa(`${config.email}:${config.apiToken}`);
    const summary = `[Discord] Message from ${data.author} in #${data.channelName}`;

    // Atlassian Document Format (ADF) の構築
    const description = {
        type: "doc",
        version: 1,
        content: [
            {
                type: "paragraph",
                content: [
                    { type: "text", text: "Extracted from Discord Message", marks: [{ type: "strong" }] }
                ]
            },
            {
                type: "bulletList",
                content: [
                    { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: `Author: ${data.author}` }] }] },
                    { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: `Server: ${data.serverName}` }] }] },
                    { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: `Channel: ${data.channelName}` }] }] },
                    { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: `Time: ${new Date(data.timestamp).toLocaleString()}` }] }] },
                    { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Link: " }, { type: "text", text: "Open Message", marks: [{ type: "link", attrs: { href: data.messageLink } }] }] }] }
                ]
            },
            {
                type: "paragraph",
                content: [] // Spacer
            },
            {
                type: "heading",
                attrs: { level: 3 },
                content: [{ type: "text", text: "Message Content" }]
            },
            {
                type: "paragraph",
                content: [
                    { type: "text", text: data.content }
                ]
            }
        ]
    };

    const body = {
        fields: {
            project: { key: config.projectKey },
            summary: summary,
            description: description,
            issuetype: { name: config.issueType }
        }
    };

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
            alertUser(tabId, `Success! Ticket created: ${result.key}`);
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

// ユーザーに通知を表示するためにスクリプトを実行
function alertUser(tabId, message) {
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (msg) => alert(msg),
        args: [message]
    });
}
