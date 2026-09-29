// Content script for www.youtube.com. Adds a "Copy transcript" button under the video and copies
// the transcript by opening YouTube's own transcript panel, reading its lines and closing it again.
// YouTube blocks direct requests to its caption APIs from outside the player, so the panel is the
// reliable source.
(() => {
  // YouTube serves two transcript UIs: the classic "Transcript" panel and the newer "In this video"
  // panel. Both live in an engagement panel, so the selectors below cover each of them.
  const PANEL = 'ytd-engagement-panel-section-list-renderer';
  const LEGACY_PANEL = `${PANEL}[target-id="engagement-panel-searchable-transcript"]`;
  const SEGMENT = 'ytd-transcript-segment-renderer, transcript-segment-view-model';
  const SEGMENT_TEXT = '.segment-text, .ytAttributedStringHost';
  const SEGMENT_TIME = '.segment-timestamp, .ytwTranscriptSegmentViewModelTimestamp';
  const SHOW_TRANSCRIPT_BUTTON = 'ytd-video-description-transcript-section-renderer button';
  const BUTTON_HOST = 'ytd-watch-metadata #actions-inner #menu ytd-menu-renderer';
  const EXPANDED = 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';
  const HIDDEN = 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN';
  const BUTTON_ID = 'ytc-copy-transcript';
  const LABEL = 'Copy transcript';
  const INSTANCE = String(Math.random());

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function waitFor(check, timeout) {
    const end = Date.now() + timeout;
    for (;;) {
      const value = check();
      if (value || Date.now() > end) return value;
      await sleep(100);
    }
  }

  // Long transcripts render in chunks, so wait until the line count stops growing.
  async function waitForSegments(panel) {
    const end = Date.now() + 15000;
    let count = 0;
    let stableSince = Date.now();
    while (Date.now() < end) {
      const now = panel.querySelectorAll(SEGMENT).length;
      if (now !== count) {
        count = now;
        stableSince = Date.now();
      } else if (count && Date.now() - stableSince >= 400) {
        break;
      }
      await sleep(100);
    }
  }

  function readLines(panel, withTimestamps) {
    const lines = [];
    for (const segment of panel.querySelectorAll(SEGMENT)) {
      const text = segment.querySelector(SEGMENT_TEXT)?.textContent.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const time = segment.querySelector(SEGMENT_TIME)?.textContent.trim();
      lines.push(withTimestamps && time ? `[${time}] ${text}` : text);
    }
    return lines;
  }

  const expandedPanels = () =>
    [...document.querySelectorAll(PANEL)].filter((panel) => panel.getAttribute('visibility') === EXPANDED);

  const findTranscriptPanel = () => expandedPanels().find((panel) => panel.querySelector(SEGMENT)) || null;

  async function getTranscriptLines(withTimestamps) {
    if (location.pathname !== '/watch') throw new Error('Open a video first.');

    // Read the panel as is when it is already open, otherwise open it and close it again afterwards.
    let panel = findTranscriptPanel();
    const alreadyOpen = new Set(expandedPanels());
    if (!panel) {
      const showButton = document.querySelector(SHOW_TRANSCRIPT_BUTTON);
      const legacyPanel = document.querySelector(LEGACY_PANEL);
      if (!showButton && !legacyPanel) throw new Error('This video has no transcript.');
      if (showButton) {
        showButton.click();
        panel = await waitFor(findTranscriptPanel, 8000);
      }
      if (!panel && legacyPanel) {
        legacyPanel.setAttribute('visibility', EXPANDED);
        panel = await waitFor(findTranscriptPanel, 8000);
      }
    }

    try {
      if (!panel) throw new Error('The transcript did not load. Try again in a moment.');
      await waitForSegments(panel);
      const lines = readLines(panel, withTimestamps);
      if (!lines.length) throw new Error('This video has no transcript.');
      return lines;
    } finally {
      for (const opened of expandedPanels()) {
        if (!alreadyOpen.has(opened)) opened.setAttribute('visibility', HIDDEN);
      }
    }
  }

  async function writeClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // The page is not focused (toolbar click), so let the extension write it instead.
    }
    const result = await chrome.runtime.sendMessage({ type: 'write-clipboard', text });
    if (!result?.ok) throw new Error(result?.error || 'Could not write to the clipboard.');
  }

  let busy = false;

  async function copyTranscript(withTimestamps) {
    if (busy) return;
    busy = true;
    setButtonLabel('Copying…', true);
    try {
      const lines = await getTranscriptLines(withTimestamps);
      await writeClipboard(withTimestamps ? lines.join('\n') : lines.join(' '));
      showToast(`Transcript copied (${lines.length} lines${withTimestamps ? ', with timestamps' : ''})`);
      setButtonLabel('Copied', true);
      await sleep(1500);
    } catch (error) {
      showToast(error?.message || String(error), true);
    } finally {
      busy = false;
      setButtonLabel(LABEL, false);
    }
  }

  function setButtonLabel(text, disabled) {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;
    button.querySelector('span').textContent = text;
    button.disabled = disabled;
  }

  let toastTimer;

  function showToast(text, isError = false) {
    let toast = document.getElementById('ytc-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ytc-toast';
      toast.setAttribute('role', 'status');
      document.body.append(toast);
    }
    toast.textContent = text;
    toast.classList.toggle('ytc-error', isError);
    toast.classList.add('ytc-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('ytc-show'), isError ? 4000 : 2500);
  }

  function createButton() {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.dataset.instance = INSTANCE;
    button.title = 'Copy the full transcript. Shift+click to include timestamps.';

    const svgNs = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(svgNs, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('d', 'M8 3h10a2 2 0 0 1 2 2v12h-2V5H8V3zM5 7h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm0 2v10h9V9H5z');
    icon.append(path);

    const label = document.createElement('span');
    label.textContent = LABEL;
    button.append(icon, label);
    button.addEventListener('click', (event) => copyTranscript(event.shiftKey));
    return button;
  }

  // YouTube is a single page app that re-renders the watch page on navigation, so check regularly
  // that the button is still in place. After the extension is reloaded, the old copy of this script
  // loses its connection and stops, and the new copy replaces its button.
  function ensureButton() {
    if (!chrome.runtime?.id) {
      clearInterval(ensureTimer);
      return;
    }
    const host = document.querySelector(BUTTON_HOST);
    const existing = document.getElementById(BUTTON_ID);
    if (existing?.dataset.instance === INSTANCE && existing.parentElement === host) return;
    existing?.remove();
    if (host && location.pathname === '/watch') host.prepend(createButton());
  }

  const ensureTimer = setInterval(ensureButton, 1000);
  document.addEventListener('yt-navigate-finish', ensureButton);
  ensureButton();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'copy-transcript') return;
    sendResponse({ ok: true });
    copyTranscript(false);
  });
})();
