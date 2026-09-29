// Offscreen document: the one extension context where execCommand('copy') works without a focused page.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;
  const textarea = document.getElementById('clip');
  textarea.value = message.text;
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.value = '';
  sendResponse(ok ? { ok } : { ok, error: 'The browser refused to write to the clipboard.' });
});
