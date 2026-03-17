# Splitwise Quick Client

A lightweight, mobile-friendly PWA client for Splitwise designed for lightning-fast expense creation. Supports offline caching, multiple split options (Equal, Exact, Percent, Shares, Adjustments), and quick data entry.

## 🚀 Live App

The app is deployed and ready to use on your phone or desktop:
👉 **[https://splitwise-ryuk.vercel.app](https://splitwise-ryuk.vercel.app/)**

### How to Use
1. Get your **Splitwise API Key** from [secure.splitwise.com/apps](https://secure.splitwise.com/apps).
2. Go to the live app link and enter your API Key.
3. Your key is securely stored in your browser's local storage and is only used to communicate with the Splitwise API.

### Add to Home Screen (PWA)
For the best experience on mobile:
- **iOS (Safari):** Tap the Share button at the bottom, then scroll down and tap "Add to Home Screen".
- **Android (Chrome):** Tap the 3-dot menu in the top right, then tap "Add to Home screen" or "Install app".

---

## 💻 Local Development

If you want to run the project locally or make modifications:

### Prerequisites
- [Node.js](https://nodejs.org/) installed on your machine.

### Installation
1. Clone the repository to your machine.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the local Express server:
   ```bash
   npm start
   ```
4. Open your browser and go to `http://localhost:3000`.

*Note: The local Express server is used to proxy requests to the Splitwise API to bypass browser CORS restrictions.*