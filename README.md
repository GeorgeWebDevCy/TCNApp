

# Consumer Network Program Overview

## 📚 Table of Contents

- [🎯 Overview](#-overview)
- [🪪 Membership Types (Annual Fee)](#-membership-types-annual-fee)
- [🏪 Vendor Types](#-vendor-types)
- [📢 Promotions Summary](#-promotions-summary)
- [🤝 Vendor Network Program (B2B)](#-vendor-network-program-b2b)
- [📈 Membership Network Program](#-membership-network-program)
- [🔁 Discount Summary Table](#-discount-summary-table)
- [📱 React Native Boilerplate Setup](#-react-native-boilerplate-setup)
- [🔔 Push Notification Setup](#-push-notification-setup)
- [Mobile App Authentication](#mobile-app-authentication)
- [🧭 Application Structure](#-application-structure)
- [🔐 Authentication Flow Details](#-authentication-flow-details)
- [🧪 Testing](#-testing)
- [🛠️ Configuration Checklist](#-configuration-checklist)
- [📲 Key Screens & Components](#-key-screens--components)
- [🧠 Supporting Services & Hooks](#-supporting-services--hooks)
- [🗄️ Persisted Storage Keys](#-persisted-storage-keys)
- [🛡️ WordPress Backend Requirements](#-wordpress-backend-requirements)
- [🔗 Related Repositories](#-related-repositories)
- [⚙️ Development Scripts & Tooling](#-development-scripts--tooling)

## 🎯 Overview

A membership-based consumer discount network that connects consumers (members) with local vendors.  
The network operates on a tiered membership and vendor model, providing varying discounts and promotional opportunities.

---

## 🪪 Membership Types (Annual Fee)

| Membership Tier | Fee (THB/year) | Upgradeable via Network Program? | Discount Access |
| --------------- | -------------- | -------------------------------- | --------------- |
| Blue            | Free           | ✅ Base tier                     | App entry       |
| Gold            | 500            | ✅ Yes                           | Entry-level     |
| Platinum        | 1,200          | ✅ Yes (via network program)     | Mid-tier        |
| Black           | 2,000          | ✅ Yes or purchase directly      | Highest         |

- Membership progression: **Blue → Gold → Platinum → Black** via the Membership Network Program.
- Direct purchase of **Black membership** is available for those not interested in progressing through the network.
- **Blue membership** is free—download the app to get started and explore vendors.

---

## 🏪 Vendor Types

| Vendor Tier | Discounts Offered (Gold / Platinum / Black) | Promotions Allowed   | Fees to Join |
| ----------- | ------------------------------------------- | -------------------- | ------------ |
| Sapphire    | 2.5% / 5% / 10%                             | 1 per quarter (free) | None         |
| Diamond     | 5% / 10% / 20%                              | 1 per month (free)   | None         |

- Vendors do **not** pay to join the network.
- All discounts are passed **directly to members** — no commission or cut taken by the network.
- Vendors can submit artwork for promotions; extra promotions available at cost price.

---

## 📢 Promotions Summary

| Vendor Tier | Free Promotion Frequency   | Channels Used                        | Optional Extra Promotions |
| ----------- | -------------------------- | ------------------------------------ | ------------------------- |
| Sapphire    | Quarterly (every 3 months) | Email to members, social media       | Available at cost         |
| Diamond     | Monthly                    | Email + social media (greater reach) | Available at cost         |

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
| ----------- | ------------- | ----------------- | -------------- |
| Sapphire    | 2.5%          | 5%                | 10%            |
| Diamond     | 5%            | 10%               | 20%            |

---

## 📱 React Native Boilerplate Setup

This repository now includes the starter code for a React Native application that integrates with [OneSignal](https://onesignal.com/) for push notifications out of the box.

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
2. Copy `.env.example` to `.env` and ensure `ONESIGNAL_APP_ID` is set to `7f9b580a-7f43-4a23-8e4d-d9e3f65d2445` (or the ID for your target OneSignal app).
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

The application bootstraps the `OneSignalProvider`, initializes the SDK during startup, requests notification permissions, and listens for foreground/background events so promotions and renewal reminders surface consistently.

## 🔔 Push Notification Setup

1. **Configure the SDK**
   - Provide your OneSignal application ID via the `ONESIGNAL_APP_ID` environment variable (see `.env.example`).
   - Optionally adjust the tag keys if you need to align with an existing messaging strategy.
2. **Android**
   - The project already includes the OneSignal React Native package and native dependency; after updating the config, rebuild the app (for example, `npm run android`) so Gradle regenerates the required resources.
   - Ensure the `POST_NOTIFICATIONS` permission remains in `android/app/src/main/AndroidManifest.xml` for Android 13+.
3. **iOS**
   - Run `npx pod-install` (or open the workspace in Xcode and install pods) after changing dependencies to pull in the OneSignal XCFramework.
   - Update the push notification usage description in `Info.plist` if your compliance requirements call for a custom message.
4. **In-app wiring**
   - Authenticated members are automatically logged into OneSignal and tagged with their membership tier, preferred language, and marketing/reminder opt-in preferences.
   - Foreground notifications surface in-app banners while background taps deep-link into the vendor or membership experiences.
   - The dashboard exposes toggles that persist to AsyncStorage so users can mute marketing pushes without leaving the app.

---

## Mobile App Authentication

The React Native app now ships with a modular login flow connected to the **TCN Platform** WordPress plugin, which bundles the network marketing engine and Password Login REST API into a single deployable package.

- **Password login**: Uses the [`/wp-json/gn/v1/login` endpoint](docs/wordpress/tcn-platform-plugin.md#-password-login-api-endpoints) exposed by the plugin's Password Login API module to validate credentials over REST. Enable HTTPS and configure the allowed origin so devices can authenticate without browser fallbacks. The WordPress plugin deliberately **does not** persist usernames or passwords, so mobile clients must keep encrypted credentials (or another secure re-auth mechanism) available if they need to call `/gn/v1/login` again after a token expires or is revoked.
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
- `react-native-onesignal`

Remember to run the native linking steps required by React Native for any newly added native modules.

---

## 🧭 Application Structure

Key parts of the React Native application live under the `src/` directory:

- `contexts/`: Contains the `AuthContext`, which bootstraps persisted sessions, exposes authentication actions, and keeps track of the current user and lock state.
- `screens/`: Holds UI screens such as `LoginScreen` (tabbed password/PIN login with biometric quick actions) and `HomeScreen` (simple authenticated landing view).
- `components/`: Shared presentation components like `WordPressLoginForm`, `PinLoginForm`, `BiometricLoginButton`, and `LoginHeader` used to compose the login experience.
- `services/`: Business-logic utilities for WordPress authentication via the GN Password Login API plugin, PIN hashing/storage, and biometric prompts.
- `hooks/`: Reusable hooks including `useAuthAvailability`, which reports whether PIN or biometric login options are available on the device.
- `utils/`: Helper functions such as hashing utilities used by the PIN service.
- `types/`: TypeScript interfaces and enums representing authentication state, users, and service contracts.

The top-level `App.tsx` wraps the UI with `SafeAreaProvider` and `AuthProvider`, ensuring authentication state is available throughout the component tree before deciding whether to render the login or home experience.

---

## 🔐 Authentication Flow Details

- **Session Bootstrapping**: `AuthProvider` restores persisted tokens via `ensureValidSession` on launch, fetching fresh profile data if needed and respecting the session lock flag saved in AsyncStorage. When the stored bearer token no longer validates, the client should silently retry `/gn/v1/login` with the cached credentials to mint a new `api_token`, or fall back to the JWT `/jwt-auth/v1/token` + `/jwt-auth/v1/token/refresh` flow if refresh tokens are preferred.
- **Password Login**: `loginWithPassword` posts credentials to the GN Password Login API endpoint, persists the returned WordPress user profile, and clears any existing session lock.
- **PIN Login**: `pinService` securely stores a salted PIN hash. Users can create, reset, and verify PINs directly from the login screen.
- **Biometrics**: `biometricService` wraps `react-native-biometrics` to check sensor availability and trigger prompts. Errors surface in the login UI for graceful fallbacks.
- **Session Locking**: Logging out sets a persisted lock flag instead of clearing tokens, allowing PIN or biometric re-entry without re-entering credentials. Full logout/expiry clears tokens via `clearSession`.

These flows are orchestrated in `LoginScreen.tsx`, which coordinates UI state (active tab, recent auth attempt, inline errors) and deep-links to WordPress for registration or password recovery.

---

## 🧪 Testing

- Unit tests are located in `__tests__/`.
- Run `npm test` (or `yarn test`) to execute the Jest suite. Coverage now includes:
  - Rendering smoke tests for the root `App` component.
  - Snapshot coverage for `HomeScreen`, including notification preferences.
  - Behavioural tests for the `OneSignalProvider` to confirm initialization, listener registration, and preference-driven suppression of marketing pushes.

---

## 🛠️ Configuration Checklist

Before building, update the placeholders in `src/config/authConfig.ts`:

1. Replace `baseUrl` with your WordPress site's root URL.
2. Confirm the GN Password Login API (`/wp-json/gn/v1/login`) and profile endpoint paths match your WordPress setup.
3. Update the registration and password reset links to match your deployment.
4. Optionally customize the AsyncStorage keys if you need to namespace multiple environments.

Ensure the `.env` file contains the correct OneSignal and Stripe settings before building:

- `STRIPE_PUBLISHABLE_KEY` is safe for the mobile client and required for initializing the React Native Stripe SDK.
- Keep `STRIPE_SECRET_KEY` in the `.env` file (or another secure store) for local testing only—never bundle it into production builds or commit it to version control.

For PIN storage and biometrics to work correctly, ensure the listed native dependencies are linked and the necessary platform permissions (e.g., Face ID usage description on iOS) are set in your native project files.

---

## 📲 Key Screens & Components

- **`LoginScreen.tsx`** (under `src/screens/`): hosts the tabbed password/PIN login experience, surfaces recent auth errors, and links to WordPress for registration and password resets. It also wires in biometric shortcuts so users with an existing session can authenticate quickly.【F:src/screens/LoginScreen.tsx†L1-L206】
- **`HomeScreen.tsx`** (under `src/screens/`): authenticated dashboard that now surfaces in-app notification banners, exposes notification preference toggles backed by AsyncStorage, and still offers quick access to membership benefits and logout controls.【F:src/screens/HomeScreen.tsx†L1-L236】
- **`WordPressLoginForm.tsx`** and **`PinLoginForm.tsx`** (under `src/components/`): reusable forms that emit submit events to the context. The PIN form supports creation/reset flows with 4+ digit enforcement and inline validation feedback.【F:src/components/WordPressLoginForm.tsx†L1-L161】【F:src/components/PinLoginForm.tsx†L1-L170】
- **`BiometricLoginButton.tsx`** and **`LoginHeader.tsx`**: presentation components that encapsulate native biometric triggers and shared branding for the login experience.【F:src/components/BiometricLoginButton.tsx†L1-L118】【F:src/components/LoginHeader.tsx†L1-L73】
- **`PostLoginDiagnosticsScreen.tsx`**: runs the "Verifying your connection" flow after successful password login and surfaces actionable errors when the backend fails to issue tokens or accept protected requests. See [docs/support/post-login-diagnostics.md](docs/support/post-login-diagnostics.md) for a troubleshooting guide covering each check.【F:src/screens/PostLoginDiagnosticsScreen.tsx†L301-L610】【F:docs/support/post-login-diagnostics.md†L1-L61】

---

## 🧠 Supporting Services & Hooks

- **`AuthContext.tsx`** (under `src/contexts/`): centralizes authentication state with a reducer that handles bootstrapping, locking/unlocking, and success/error transitions. It exposes helpers to initiate password, PIN, and biometric login flows that are used throughout the UI.【F:src/contexts/AuthContext.tsx†L1-L246】
- **`wordpressAuthService.ts`**: integrates with the GN Password Login API plugin for password authentication, handles optional profile hydration, and manages session persistence plus session-lock semantics for PIN/biometric unlock flows.【F:src/services/wordpressAuthService.ts†L1-L220】
- **`pinService.ts`**: stores salted hashes for device-level PIN unlocks, using utilities from `src/utils/hash.ts` to generate secure digests.【F:src/services/pinService.ts†L1-L149】【F:src/utils/hash.ts†L1-L64】
- **`biometricService.ts`**: wraps `react-native-biometrics` to check sensor availability and request authentication, returning structured results consumed by the context and UI.【F:src/services/biometricService.ts†L1-L90】
- **`useAuthAvailability.ts`**: reports which quick-login methods are currently enabled (existing PIN, biometric sensor availability) so the login screen can conditionally render shortcuts.【F:src/hooks/useAuthAvailability.ts†L1-L81】

---

## 🗄️ Persisted Storage Keys

- Configure storage keys in `src/config/authConfig.ts` to match your environment or namespace requirements. Keys exist for persisted WordPress credentials (token placeholders), cached user profiles, and the session lock flag, alongside PIN hash and salt entries.【F:src/config/authConfig.ts†L1-L22】
- `wordpressAuthService.ts` and `pinService.ts` both rely on these constants when reading or writing to AsyncStorage, so keep them in sync if you change the keys.【F:src/services/wordpressAuthService.ts†L63-L111】【F:src/services/pinService.ts†L21-L66】

---

- Install and configure the [TCN Platform WordPress plugin](docs/wordpress/tcn-platform-plugin.md), which now packages both the membership/MLM engine and the Password Login REST API consumed by the mobile client. The plugin seeds WooCommerce membership products, exposes `tcn-mlm/v1/*` endpoints for genealogy and commissions, and keeps bearer-token authentication aligned with the mobile flows.【F:src/config/authConfig.ts†L1-L17】【F:src/services/wordpressAuthService.ts†L1-L220】
- Keep WooCommerce active and confirm the plugin's **Membership & MLM** module remains enabled so membership catalogue data stays in sync with the app.
- Configure the plugin's **Password Login API** module (allowed origin, HTTPS enforcement, optional dev HTTP override) to match the environments your devices use.
- Ensure `/wp-json/wp/v2/users/me` remains accessible for profile hydration when tokens are available and grant members permission to upload avatars, matching the plugin's Activity Log guidance.【F:src/services/wordpressAuthService.ts†L29-L61】
- Ensure CORS and HTTPS are enabled so the React Native app can reach the WordPress API from devices and simulators.

---

## 🔗 Related Repositories

- [TCN Platform WordPress Plugin](docs/wordpress/tcn-platform-plugin.md): Unified membership/MLM and Password Login API package that powers the WooCommerce backend consumed by this app.

---

## ⚙️ Development Scripts & Tooling

- **Node version**: The project expects Node.js 20 or newer as declared in `package.json`.
- **Scripts**: use `npm run android` / `ios` for native builds, `npm run start` for Metro, `npm run test` for Jest, and `npm run lint` for ESLint checks.【F:package.json†L1-L28】
- **Testing**: Jest is configured in `__tests__/App.test.tsx` to validate the root `App` component renders; expand this directory with additional coverage as needed.【F:**tests**/App.test.tsx†L1-L24】
