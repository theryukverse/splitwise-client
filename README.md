# Splitwise Quick Client

A lightweight, mobile-friendly PWA client for Splitwise designed for lightning-fast expense creation. Supports offline caching, multiple split options (Equal, Exact, Percent, Shares, Adjustments), and quick data entry.

## 🚀 Getting Started (Local Development)

This app uses a simple Express server to proxy requests to the Splitwise API. This is the **recommended** way to run the app because it completely bypasses any CORS (Cross-Origin Resource Sharing) restrictions enforced by Splitwise.

### Prerequisites
- [Node.js](https://nodejs.org/) installed on your machine.
- Your Splitwise API Key (get it from [secure.splitwise.com/apps](https://secure.splitwise.com/apps)).

### Installation
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open your browser and go to `http://localhost:3000`. You can also access it on your phone if you are on the same WiFi network (the terminal will print the network URL).

## 🌐 Deploying to GitHub Pages

GitHub Pages serves static files, so it cannot run the Node.js/Express `server.js` backend. To support hosting entirely on GitHub Pages, the app has been updated to detect if it's running online and attempt **direct requests** to the Splitwise API.

### Steps to Deploy
1. **Commit your code:**
   ```bash
   git add .
   git commit -m "Initial commit for Splitwise Client"
   ```
2. **Push to a new GitHub repository:**
   Create a new repository on GitHub, then run:
   ```bash
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```
3. **Enable GitHub Pages:**
   - Go to your repository **Settings** -> **Pages**.
   - Under **Source**, choose **GitHub Actions** and set up a static HTML workflow targeting the `public/` directory (or you can serve the `public/` folder directly from the `gh-pages` branch).

> **⚠️ Important Note on CORS:**
> The Splitwise API strictly enforces CORS policies. When making API requests directly from a browser on a domain like `username.github.io` to `secure.splitwise.com`, the requests **might be blocked** by your browser.
> 
> If you experience connection errors on GitHub Pages due to CORS, you will need to host the app using a platform that supports a Node.js backend proxy (like **Vercel**, **Render**, or **Heroku**) using the provided `server.js` file.
