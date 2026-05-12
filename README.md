# LinkedIn Div Copier (Chrome Extension)

A simple Chrome extension that adds a floating **Copy Div** button to LinkedIn
pages. Clicking the button copies the outer HTML of every element matching:

```
div._83309bd4._6e63fa0b.d343d86c
```

(including all of its children) to your clipboard.

The extension only loads on `linkedin.com`.

## Files

- `manifest.json` — Manifest V3 configuration
- `content.js` — Injects the button and handles copying
- `content.css` — Styles the floating button
- `icon16.png`, `icon48.png`, `icon128.png` — Toolbar icons

## How to install (unpacked)

1. Download/extract the `linkedin-copy-extension` folder.
2. Open Chrome and go to `chrome://extensions`.
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and select the `linkedin-copy-extension` folder.
5. Visit any page on `https://www.linkedin.com/`. You should see a blue
   **📋 Copy Div** button in the bottom-right corner.
6. Click it — the matching div's HTML is now in your clipboard.

## Behaviour notes

- If no matching div is on the page, the button briefly shows
  **❌ Not found**.
- If multiple matching divs exist, all of their HTML is concatenated
  (separated by a blank line) and copied. The button shows the count.
- LinkedIn is a SPA, so the button is re-injected automatically if the page
  re-renders and removes it.
- Uses the async Clipboard API with a `document.execCommand('copy')` fallback.

## Customising the selector

If LinkedIn changes those class names, edit the `TARGET_SELECTOR` constant
near the top of `content.js`.
