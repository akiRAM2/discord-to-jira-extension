document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);

function saveOptions() {
    const jiraDomain = document.getElementById('jiraDomain').value.replace('https://', '').replace('/', '');
    const email = document.getElementById('email').value;
    const apiToken = document.getElementById('apiToken').value;
    const projectKey = document.getElementById('projectKey').value;
    const issueType = document.getElementById('issueType').value;

    chrome.storage.sync.set(
        { jiraDomain, email, apiToken, projectKey, issueType },
        () => {
            const status = document.getElementById('status');
            status.style.display = 'block';
            setTimeout(() => {
                status.style.display = 'none';
            }, 2000);
        }
    );
}

function restoreOptions() {
    chrome.storage.sync.get(
        { jiraDomain: '', email: '', apiToken: '', projectKey: '', issueType: 'Task' },
        (items) => {
            document.getElementById('jiraDomain').value = items.jiraDomain;
            document.getElementById('email').value = items.email;
            document.getElementById('apiToken').value = items.apiToken;
            document.getElementById('projectKey').value = items.projectKey;
            document.getElementById('issueType').value = items.issueType;
        }
    );
}
