# lasersell-extension

[![Chrome Web Store Version](https://img.shields.io/chrome-web-store/v/llablajedejfnhljgakfahpiibmbkpbl?logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/lasersell/llablajedejfnhljgakfahpiibmbkpbl)
[![Chrome Web Store Users](https://img.shields.io/chrome-web-store/users/llablajedejfnhljgakfahpiibmbkpbl?logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/lasersell/llablajedejfnhljgakfahpiibmbkpbl)

Chrome Extension for LaserSell.

[![Install from Chrome Web Store](https://img.shields.io/badge/Install_from-Chrome_Web_Store-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/lasersell/llablajedejfnhljgakfahpiibmbkpbl)

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
