# YouTube Transcript Copier

A small Chrome extension that copies the full transcript of a YouTube video to your clipboard in one click. It only runs on `www.youtube.com`.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the repository folder.
4. Reload any YouTube tabs that were already open.

## Use

Open a video and use any of these:

| Action | Result |
| --- | --- |
| Click **Copy transcript** next to the Like button | Copies the transcript as one block of text |
| **Shift** + click the button | Copies it with one line per caption and `[m:ss]` timestamps |
| Click the toolbar icon | Same as clicking the button |
| **Alt+Shift+C** | Same as clicking the button (change it at `chrome://extensions/shortcuts`) |

A short message at the bottom of the page confirms how many lines were copied. The toolbar icon is greyed out on every site except YouTube.

The transcript language is whatever YouTube's transcript panel shows. To copy a different language, open the transcript panel yourself, pick the language there and copy again. An open panel is read as is and left open.

## How it works

YouTube now rejects direct requests to its caption endpoints unless they come from its own player, so the extension uses YouTube's transcript panel instead. It opens the panel in the background, waits for every line to load, reads the text, closes the panel again and writes the result to the clipboard. Both the classic transcript panel and the newer "In this video" panel are supported.

If the page is not focused (for example after clicking the toolbar icon), the clipboard write goes through an offscreen extension document instead.

## Permissions

| Permission | Why |
| --- | --- |
| `https://www.youtube.com/*` | Run on YouTube and nowhere else |
| `clipboardWrite`, `offscreen` | Write the transcript to the clipboard |
| `declarativeContent` | Enable the toolbar icon on YouTube only |
| `scripting` | Add the button to YouTube tabs that were open before the extension was installed |

Nothing is sent anywhere. The extension has no network code.

## Limitations

YouTube changes its page structure from time to time. If copying stops working, the selectors at the top of `content.js` are the place to look.
