Here's the current README.md for the project. 
# Consumer Network Program Overview

## 🎯 Overview
A membership-based consumer discount network that connects consumers (members) with local vendors.  
The network operates on a tiered membership and vendor model, providing varying discounts and promotional opportunities.

---

## 🪪 Membership Types (Annual Fee)

| Membership Tier | Fee (THB/year) | Upgradeable via Network Program? | Discount Access |
|-----------------|----------------|----------------------------------|-----------------|
| Gold            | 1,000          | ✅ Yes                           | Entry-level     |
| Platinum        | —              | ✅ Yes (via network program)      | Mid-tier        |
| Black           | 4,000          | ✅ Yes or purchase directly       | Highest         |

- Membership progression: **Gold → Platinum → Black** via the Membership Network Program.  
- Direct purchase of **Black membership** is available for those not interested in progressing through the network.

---

## 🏪 Vendor Types

| Vendor Tier | Discounts Offered (Gold / Platinum / Black) | Promotions Allowed        | Fees to Join |
|-------------|---------------------------------------------|---------------------------|--------------|
| Sapphire    | 2.5% / 5% / 10%                             | 1 per quarter (free)      | None         |
| Diamond     | 5% / 10% / 20%                              | 1 per month (free)        | None         |

- Vendors do **not** pay to join the network.  
- All discounts are passed **directly to members** — no commission or cut taken by the network.  
- Vendors can submit artwork for promotions; extra promotions available at cost price.

---

## 📢 Promotions Summary

| Vendor Tier | Free Promotion Frequency | Channels Used                        | Optional Extra Promotions |
|-------------|---------------------------|--------------------------------------|---------------------------|
| Sapphire    | Quarterly (every 3 months)| Email to members, social media       | Available at cost         |
| Diamond     | Monthly                   | Email + social media (greater reach) | Available at cost         |

---

## 🤝 Vendor Network Program (B2B)
- Vendors can sell **wholesale products** to other vendors within the network.  
- Allows for **B2B transactions and promotions** to be managed by the network team.  
- The network assists with setting up these internal wholesale offers.  

---

## 📈 Membership Network Program
- Pathway for **Gold members** to upgrade to **Platinum or Black** without purchasing higher tiers directly.  
- Involves **activities or achievements** (details TBD) that promote community engagement and growth.  
- Designed to incentivize **loyalty and participation** in the ecosystem.  

---

## 🔁 Discount Summary Table

| Vendor Type | Gold Discount | Platinum Discount | Black Discount |
|-------------|--------------|-------------------|----------------|
| Sapphire    | 2.5%         | 5%                | 10%            |
| Diamond     | 5%           | 10%               | 20%            |

---

## 📱 React Native Boilerplate Setup

This repository now includes the starter code for a React Native application that uses [OneSignal](https://onesignal.com/) for push notifications.

### Prerequisites
- [Node.js](https://nodejs.org/) 18 LTS or newer
- [Yarn](https://classic.yarnpkg.com/) or npm
- Android Studio and/or Xcode for native builds
- A OneSignal account with an application ID

### Getting started
1. Install dependencies
   ```bash
   yarn install
   # or
   npm install
   ```
2. Update the placeholder ID in `src/notifications/OneSignalProvider.js` with your OneSignal app ID.
3. Run the Metro bundler
   ```bash
   yarn start
   ```
4. Launch a platform target (in another terminal)
   ```bash
   yarn android
   # or
   yarn ios
   ```

The app initializes OneSignal on start, requests notification permissions, and ensures foreground notifications display by default. Customize the UI in `src/App.js` and expand notification handling in `src/notifications/OneSignalProvider.js` as you build out the project.---

## Mobile App Authentication

The React Native app now ships with a modular login flow connected to WordPress:

- **Password login**: Uses the WordPress JWT endpoint (`/wp-json/jwt-auth/v1/token`).
- **PIN login**: Stores a salted hash locally so returning users can unlock without credentials.
- **Biometric login**: Leverages native biometrics (Face ID / Touch ID / etc.) as a fast path once a session exists.
- **Account actions**: "Forgot password" and "Register" links point to the WordPress site and can be customised.

### Configuration

Update `src/config/authConfig.ts` with the correct URLs for your WordPress deployment before building the app.

### Installation Notes

After pulling these changes run `npm install` (or `yarn install`) to add the new native modules:

- `@react-native-async-storage/async-storage`
- `crypto-js`
- `react-native-biometrics`

Remember to run the native linking steps required by React Native for any newly added native modules.
