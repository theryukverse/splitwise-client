# Splitwise Quick Client

A lightweight, mobile-friendly PWA client for Splitwise designed for lightning-fast expense creation. Supports offline caching, multiple split options (Equal, Exact, Percent, Shares, Adjustments), and quick data entry.

## 🌐 How to Use

This project is configured to run entirely via GitHub Pages.

1. Go to the hosted URL (e.g., `https://yourusername.github.io/splitwise-client/`).
2. Get your **Splitwise API Key** from [secure.splitwise.com/apps](https://secure.splitwise.com/apps).
3. Enter your API Key into the app and click **Connect**.
4. The API Key is securely stored in your browser's `localStorage` and all API requests are made directly from your browser to Splitwise.

> **⚠️ Note on CORS:**
> The Splitwise API strictly enforces CORS policies. Because this app makes API requests directly from your browser to Splitwise, you may occasionally see CORS errors depending on your browser's strictness.

## 📱 PWA Features

This client is a fully progressive web app (PWA).
- **Add to Home Screen:** You can install this app directly to your phone's home screen for a native app-like experience.
- **Offline Caching:** Static assets are cached by a Service Worker to enable fast load times even on spotty connections.

## 🚀 Deployment (GitHub Pages)

To host your own version of this app using GitHub Pages via Actions:

1. **Push your code** to a GitHub repository.
2. Go to **Settings** > **Pages**.
3. Under **Source**, select **GitHub Actions**.
4. Create a new workflow (e.g., `.github/workflows/static.yml`) with the following `.yaml` content. 
   
   *Make sure you target the `./public` folder in the upload step so the site serves correctly!*

   ```yaml
   name: Deploy static content to Pages

   on:
     push:
       branches: ["main"]
     workflow_dispatch:

   permissions:
     contents: read
     pages: write
     id-token: write

   concurrency:
     group: "pages"
     cancel-in-progress: false

   jobs:
     deploy:
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       runs-on: ubuntu-latest
       steps:
         - name: Checkout
           uses: actions/checkout@v4
         - name: Setup Pages
           uses: actions/configure-pages@v5
         - name: Upload artifact
           uses: actions/upload-pages-artifact@v3
           with:
             path: './public' # <-- IMPORTANT: Upload the public folder
         - name: Deploy to GitHub Pages
           id: deployment
           uses: actions/deploy-pages@v4
   ```

5. **Fix Paths for Subdirectory Hosting:**
   If your app is hosted at `https://yourusername.github.io/splitwise-client/`, you must update the asset links in `public/index.html` and `public/sw.js` to be **relative** (remove the leading slash). 

   For example, in `index.html`:
   ```html
   <link rel="stylesheet" href="styles.css"> <!-- instead of /styles.css -->
   <script src="app.js"></script> <!-- instead of /app.js -->
   <link rel="manifest" href="manifest.json"> <!-- instead of /manifest.json -->
   ```
   And in `sw.js`:
   ```javascript
   const ASSETS = [
     './',
     './index.html',
     './styles.css',
     './app.js',
     './manifest.json',
   ];
   ```
