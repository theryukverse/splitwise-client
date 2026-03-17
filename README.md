# Splitwise Quick Client

A lightweight, mobile-friendly PWA client for Splitwise designed for lightning-fast expense creation. Supports offline caching, multiple split options (Equal, Exact, Percent, Shares, Adjustments), and quick data entry.

## 🚀 Getting Started (Local Development)

This app uses a simple Express server to proxy requests to the Splitwise API. This completely bypasses any CORS (Cross-Origin Resource Sharing) restrictions enforced by Splitwise.

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

---

## 🌐 Deploying to Vercel (For Full Mobile Access)

If you want to use this app anywhere on your phone (without your laptop running), the easiest and best free host is **Vercel**. 

Vercel natively supports running both the static frontend (the PWA) and the Node.js backend (`server.js`) together. The repository already contains the required `vercel.json` configuration file.

### Steps to Deploy

1. **Push your code to GitHub:**
   Make sure all your latest code is pushed to your GitHub repository.

2. **Deploy on Vercel:**
   - Go to [Vercel.com](https://vercel.com/) and sign up / log in with your GitHub account.
   - Click **Add New** > **Project**.
   - Select your `splitwise-client` GitHub repository and click **Import**.
   - Leave all the default settings as they are and click **Deploy**.

3. **Use the App!**
   - Vercel will give you a live URL (e.g. `https://splitwise-client.vercel.app`).
   - Open that link on your phone.
   - Enter your Splitwise API Key.
   - **Add to Home Screen:** Tap your browser's share button and select "Add to Home Screen" to install it as a fully native-feeling app!