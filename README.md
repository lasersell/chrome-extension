# lasersell-extension

Chrome Extension for LaserSell.

## Build

```bash
npm ci
npm run build
```

Load the extension in Chrome (Developer Mode → Load unpacked) and select `dist/`.
For Chrome Web Store uploads, zip the `dist/` output (not the repo root).

## Pairing

1. Start LaserSell and copy the pairing code from stdout.
2. Click the toolbar icon to open the pairing popup, enter the code, and click **Connect**.
3. After pairing, clicking the icon opens the Side Panel dashboard.
4. Use **Disconnect** to clear stored tokens and re-pair.

## Legal

Copyright Xen LLC. All rights reserved.
