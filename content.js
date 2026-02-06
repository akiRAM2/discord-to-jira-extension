let lastClickedElement = null;

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
                // 設定されたPrefixを受け取る (無ければデフォルト)
                const titlePrefix = request.titlePrefix !== undefined ? request.titlePrefix : "[Discord]";
                const parentKeyPresetsStr = request.parentKeyPresets || "";
                const lang = request.lang || "en";

                const data = extractMessageInfo(lastClickedElement, titlePrefix);

                if (data.error) {
                    sendResponse(data);
                    return;
                }

                // ユーザー入力モーダルを表示して Summary と ParentKey を決定
                const validParentKeys = parentKeyPresetsStr
                    .split('\n')
                    .map(k => k.trim())
                    .filter(k => k.length > 0);

                const userInput = await openTicketModal(data.defaultSummary, validParentKeys, lang);

                // データを更新
                data.summary = userInput.summary;
                data.parentKey = userInput.parentKey;

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
            channelName = parts[0].trim();
            serverName = parts[1].trim();
        } else if (parts.length === 2) {
            // Channel | Discord (通常DMなど)
            channelName = parts[0].trim();
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
            channelName = parts[0].trim();
            serverName = parts[1].trim();
        } else if (parts.length === 1) {
            channelName = parts[0].trim();
            serverName = "";
        }
    }

    // B. DOMから取得 (バックアップ)
    if (!serverName && !channelName) {
        // 左サイドバーの選択済みサーバーアイコンの aria-label を探す
        // nav[aria-label*="Servers"] > ul > li > div[class*="selected"] ...
        // 構造が複雑なので、単純に "selected" クラスを持つ要素の aria-label か、ツールチップを探す

        // 1. 直近のDOMヘッダー (画面上部)
        const headerTitle = document.querySelector('nav h1, h1[class*="title"]');
        if (headerTitle) {
            // ヘッダーはサーバー名かチャンネル名の場合があるが、通常はサーバー名が表示されているか？
            // 最近のUIだとナビゲーションバーにサーバー名がある
            // しかし信頼性は低い
        }

        // 2. サイドバーの選択 (home以外)
        const selectedGuild = document.querySelector('nav [class*="tree-"] [class*="selected-"] a[aria-label], nav [class*="wrapper-"] [class*="selected-"] [aria-label]');
        if (selectedGuild) {
            serverName = selectedGuild.getAttribute("aria-label");
        }

        const channelHeader = document.querySelector('[data-cy="channel-name"]');
        if (channelHeader) {
            channelName = channelHeader.innerText;
        }
    }

    // C. クリーニング
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

function openTicketModal(defaultSummary, parentKeys, lang = 'en') {
    const texts = {
        en: {
            header: "Create Jira Ticket",
            titleLabel: "Ticket Title",
            parentLabel: "Parent Issue / Epic (Optional)",
            none: "None",
            cancel: "Cancel",
            create: "Create Ticket",
            alertTitle: "Title is required"
        },
        ja: {
            header: "Jiraチケットを作成",
            titleLabel: "チケットタイトル",
            parentLabel: "親課題 / エピック (任意)",
            none: "なし",
            cancel: "キャンセル",
            create: "チケット作成",
            alertTitle: "タイトルは必須です"
        }
    };
    const t = texts[lang] || texts.en;

    return new Promise((resolve, reject) => {
        // 既存のモーダルがあれば削除
        const existing = document.getElementById('jira-ext-modal-overlay');
        if (existing) existing.remove();

        // 1. Create Overlay
        const overlay = document.createElement('div');
        overlay.id = 'jira-ext-modal-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: '999999',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: '14px',
            fontFamily: 'sans-serif',
            color: '#333'
        });

        // 2. Create Modal Box
        const modal = document.createElement('div');
        Object.assign(modal.style, {
            backgroundColor: '#fff',
            padding: '20px',
            borderRadius: '8px',
            width: '400px',
            maxWidth: '90%',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px'
        });
        overlay.appendChild(modal);

        // Header
        const header = document.createElement('h2');
        header.textContent = t.header;
        header.style.margin = '0 0 5px 0';
        header.style.fontSize = '18px';
        modal.appendChild(header);

        // Title Input
        const titleLabel = document.createElement('label');
        titleLabel.textContent = t.titleLabel;
        titleLabel.style.fontWeight = 'bold';
        titleLabel.style.fontSize = '12px';
        modal.appendChild(titleLabel);

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.value = defaultSummary;
        Object.assign(titleInput.style, {
            padding: '8px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            width: '100%',
            boxSizing: 'border-box'
        });
        modal.appendChild(titleInput);

        // Parent Key Selection (If available)
        let selectedParent = null;

        // プリセットがあればラジオボタンを表示
        if (parentKeys && parentKeys.length > 0) {
            const parentLabel = document.createElement('label');
            parentLabel.textContent = t.parentLabel;
            parentLabel.style.fontWeight = 'bold';
            parentLabel.style.fontSize = '12px';
            parentLabel.style.marginTop = '5px';
            modal.appendChild(parentLabel);

            const radioContainer = document.createElement('div');
            Object.assign(radioContainer.style, {
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                maxHeight: '150px',
                overflowY: 'auto',
                border: '1px solid #eee',
                padding: '8px',
                borderRadius: '4px'
            });

            // "None" option
            const noneLabel = document.createElement('label');
            noneLabel.style.display = 'flex';
            noneLabel.style.alignItems = 'center';
            noneLabel.style.gap = '5px';
            const noneRadio = document.createElement('input');
            noneRadio.type = 'radio';
            noneRadio.name = 'jiraParentKey';
            noneRadio.value = '';
            noneRadio.checked = true; // Default
            noneLabel.appendChild(noneRadio);
            noneLabel.appendChild(document.createTextNode(t.none));
            radioContainer.appendChild(noneLabel);

            parentKeys.forEach((key, index) => {
                const label = document.createElement('label');
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.gap = '5px';
                label.style.cursor = 'pointer';

                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = 'jiraParentKey';
                radio.value = key;

                // もし1つしかなければデフォルト選択にする？ 
                // いや、Noneをデフォルトでいいか、あるいは一番上を選択？
                // ユーザー要望的に「選べるようにしたい」なのでNoneデフォルトが無難だが、
                // 必須の場合もあるかもしれない。一旦Noneデフォルト。

                label.appendChild(radio);
                label.appendChild(document.createTextNode(key));
                radioContainer.appendChild(label);
            });

            modal.appendChild(radioContainer);
        }

        // Buttons
        const btnContainer = document.createElement('div');
        Object.assign(btnContainer.style, {
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '10px'
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = t.cancel;
        Object.assign(cancelBtn.style, {
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#eee',
            cursor: 'pointer',
            color: '#333'
        });
        cancelBtn.onclick = () => {
            overlay.remove();
            reject('cancelled');
        };

        const createBtn = document.createElement('button');
        createBtn.textContent = t.create;
        Object.assign(createBtn.style, {
            padding: '8px 16px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#0052CC',
            color: '#white',
            cursor: 'pointer',
            fontWeight: 'bold',
            color: '#fff'
        });
        createBtn.onclick = () => {
            const finalSummary = titleInput.value;
            if (!finalSummary) {
                alert(t.alertTitle);
                return;
            }

            // Get selected parent
            const checkedRadio = modal.querySelector('input[name="jiraParentKey"]:checked');
            const finalParent = checkedRadio ? checkedRadio.value : '';

            overlay.remove();
            resolve({
                summary: finalSummary,
                parentKey: finalParent
            });
        };

        btnContainer.appendChild(cancelBtn);
        btnContainer.appendChild(createBtn);
        modal.appendChild(btnContainer);

        // Close on outside click
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.remove();
                reject('cancelled');
            }
        };

        // Esc key to close
        const escListener = (e) => {
            if (e.key === "Escape") {
                document.removeEventListener('keydown', escListener);
                overlay.remove();
                reject('cancelled');
            }
        };
        document.addEventListener('keydown', escListener);

        document.body.appendChild(overlay);
        titleInput.focus();
    });
}
