chrome.runtime.onInstalled.addListener(() => {
	chrome.storage.sync.get({ enabled: false }, (res) => {
		chrome.storage.sync.set({ enabled: !!res.enabled });
	});
});
