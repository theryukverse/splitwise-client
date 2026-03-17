# Splitwise Quick Client

A lightweight, mobile-friendly PWA client for Splitwise designed for lightning-fast expense creation. Supports offline caching, multiple split options (Equal, Exact, Percent, Shares, Adjustments), and quick data entry.

## 🌐 How to Use

This project is configured to run entirely via GitHub Pages.

1. Go to the hosted URL (e.g., `https://theryukverse.github.io/splitwise-client/`).
2. Get your **Splitwise API Key** from [secure.splitwise.com/apps](https://secure.splitwise.com/apps).
3. Enter your API Key into the app and click **Connect**.
4. The API Key is securely stored in your browser's `localStorage` and all API requests are made directly from your browser to Splitwise.

> **⚠️ Note on CORS:**
> The Splitwise API strictly enforces CORS policies. Because this app makes API requests directly from your browser to Splitwise, you may occasionally see CORS errors depending on your browser's strictness.

## 📱 PWA Features

This client is a fully progressive web app (PWA).
- **Add to Home Screen:** You can install this app directly to your phone's home screen for a native app-like experience.
- **Offline Caching:** Static assets are cached by a Service Worker to enable fast load times even on spotty connections.