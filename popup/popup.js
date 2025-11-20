document.addEventListener('DOMContentLoaded', async () => {
	const toggle = document.getElementById('toggle');
	const res = await chrome.storage.sync.get({ enabled: false });
	toggle.checked = !!res.enabled;

	async function sendMessageWithRetry(tabId, message, retries = 4, delay = 600) {
		for (let i = 0; i < retries; i++) {
			try {
				await chrome.tabs.sendMessage(tabId, message);
				return true;
			} catch (e) {
				if (i === retries - 1) {
					try {
						await chrome.scripting.executeScript({
							target: { tabId },
							files: ['content_scripts/anti-shorts.js'],
						});
						await chrome.scripting.insertCSS({
							target: { tabId },
							files: ['content_scripts/anti-shorts.css'],
						});
						await chrome.tabs.sendMessage(tabId, message);
						return true;
					} catch (err) {
						console.warn('再注入に失敗', err);
						return false;
					}
				}
				await new Promise((r) => setTimeout(r, delay));
			}
		}
		return false;
	}

	toggle.addEventListener('change', async () => {
		const newState = toggle.checked;
		await chrome.storage.sync.set({ enabled: newState });

		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		if (!tab || !tab.url || !tab.url.includes('youtube.com')) return;
		await sendMessageWithRetry(tab.id, {
			action: newState ? 'enable' : 'disable',
			userInitiated: true,
		});
	});
});
