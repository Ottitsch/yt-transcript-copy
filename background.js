// Service worker: keeps the toolbar button enabled on YouTube only, forwards toolbar clicks and
// the keyboard shortcut to the content script, and writes to the clipboard through an offscreen
// document when the page itself is not allowed to (for example because it is not focused).

function limitActionToYouTube() {
  chrome.action.disable();
  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([
      {
        conditions: [new chrome.declarativeContent.PageStateMatcher({ pageUrl: { hostEquals: 'www.youtube.com' } })],
        actions: [new chrome.declarativeContent.ShowAction()],
      },
    ]);
  });
}

chrome.runtime.onInstalled.addListener(limitActionToYouTube);
chrome.runtime.onStartup.addListener(limitActionToYouTube);

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url?.startsWith('https://www.youtube.com/')) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'copy-transcript' });
  } catch {
    // The tab was opened before the extension was installed or reloaded, so inject it now.
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'copy-transcript' });
  }
});

let clipboardQueue = Promise.resolve();

function writeClipboard(text) {
  const job = clipboardQueue.then(async () => {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['CLIPBOARD'],
        justification: 'Copy the video transcript to the clipboard',
      });
    }
    try {
      return await chrome.runtime.sendMessage({ target: 'offscreen', text });
    } finally {
      await chrome.offscreen.closeDocument();
    }
  });
  clipboardQueue = job.catch(() => {});
  return job;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'write-clipboard') return;
  writeClipboard(message.text).then(
    (result) => sendResponse(result),
    (error) => sendResponse({ ok: false, error: String(error?.message || error) }),
  );
  return true;
});
