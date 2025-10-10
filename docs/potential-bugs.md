# Potential Bug Backlog

The following issues were identified while reviewing the codebase. Each item includes a
summary, probable impact, and references to the relevant implementation for quicker
triage.

## 1. Token login queue logging references an out-of-scope ref
- **Location:** `TokenLoginProvider` → `hydrateTokenLogin` (`src/providers/TokenLoginProvider.tsx`)
- **What happens:** The debug log inside `hydrateTokenLogin` references `queueRef`, but that
  ref only exists inside the `useHydrationQueue` hook. When the log executes, it throws a
  `ReferenceError`, which prevents the promise from resolving and stops the token-login
  WebView from ever opening.
- **Impact:** Token-login hydration can break entirely, blocking any flow that relies on
  WordPress cookie hydration after password/PIN login failures.
- **Reference:** `src/providers/TokenLoginProvider.tsx` lines 86-104.

## 2. Vendor scan screen closes over `vendorId` before it is defined
- **Location:** `VendorScanScreen` → `handleValidation` (`src/screens/VendorScanScreen.tsx`)
- **What happens:** The `useCallback` dependency array references `vendorId`, but that `const`
  is declared later in the component. At render time React tries to evaluate the dependency
  and immediately hits the temporal dead-zone, throwing `ReferenceError: Cannot access
  'vendorId' before initialization.` The scan/lookup UI therefore crashes on load.
- **Impact:** Vendor scanning cannot render, blocking vendors from validating members or
  recording transactions.
- **Reference:** `src/screens/VendorScanScreen.tsx` lines 53-157.

## 3. Activity monitor sanitizer can recurse forever on self-referential arrays
- **Location:** `sanitizeValue` helper (`src/services/activityMonitorService.ts`)
- **What happens:** Objects are tracked in a `WeakSet` to break circular references, but arrays
  are not added to the `seen` set. A payload like `const a: any[] = []; a.push(a);` will cause
  `sanitizeValue` to recurse indefinitely and eventually overflow the stack, preventing the log
  from being sent.
- **Impact:** A malicious or simply complex log payload can freeze the logging queue and cause
  silent loss of telemetry.
- **Reference:** `src/services/activityMonitorService.ts` lines 88-141.

## 4. WordPress cookie “sync” always wipes stored cookies
- **Location:** `syncWordPressCookiesFromResponse` (`src/services/wordpressCookieService.ts`)
- **What happens:** The helper never inspects the `Response` object. Instead it immediately
  calls `persistCookieHeader(null)`, clearing the cached cookie header on every network call.
  We therefore never persist or reuse cookie sessions, defeating the purpose of the helper and
  breaking any flow that relies on WooCommerce cookies.
- **Impact:** Users are forced to re-authenticate via token flows for any request that expects
  WordPress cookies, and subsequent cookie-based endpoints are likely to fail.
- **Reference:** `src/services/wordpressCookieService.ts` lines 138-143.

## 5. PIN salt generation relies on `Math.random`
- **Location:** `generateSalt` (`src/utils/hash.ts`)
- **What happens:** The salt for stored PIN hashes is created with `Math.random`, which is not
  cryptographically secure. Attackers can brute-force the salt space far more easily than
  intended, weakening the security of stored PINs.
- **Impact:** Increases the risk of offline attacks succeeding against leaked AsyncStorage
  data.
- **Reference:** `src/utils/hash.ts` lines 5-14.

