# E2E Test Architecture — Nostr Calendar

## Overview

End-to-end tests cover the full user journey in a real browser against a real local Nostr relay. Tests are structured as user flows, not feature checklists. Auth is a one-time setup step, not a focus of testing.

**Web: Playwright** — native WebSocket interception, service-worker control, headless CI.  
**Native: Maestro** — drives the Capacitor WebView APK on Android.  
**Relay: strfry in Docker** — a complete, real Nostr relay running locally. Not a mock.

---

## Directory Structure

```
e2e/
├── ARCHITECTURE.md         ← this file
├── web/
│   ├── playwright.config.ts
│   ├── global-setup.ts     ← start relay, seed events
│   ├── global-teardown.ts  ← stop relay
│   ├── fixtures/
│   │   ├── index.ts        ← exports the extended `test` with custom fixtures
│   │   ├── auth.fixture.ts ← authedPage fixture (logs in via ncryptsec UI)
│   │   └── relay.fixture.ts← testRelay fixture (already started by globalSetup)
│   └── tests/
│       ├── onboarding.spec.ts       ← first-time user: login → events load
│       ├── returning-user.spec.ts   ← auto-login on reload
│       ├── calendar-views.spec.ts   ← day / week / month navigation
│       ├── event-crud.spec.ts       ← create, edit, delete, duplicate
│       ├── private-events.spec.ts   ← NIP-59 encrypted events
│       ├── rsvp.spec.ts             ← accept / decline / maybe
│       ├── invitations.spec.ts      ← notification panel, respond flow
│       ├── recurring.spec.ts        ← recurring events across views
│       ├── scheduling.spec.ts       ← scheduling pages, booking flow
│       ├── calendar-lists.spec.ts   ← create list, filter by list
│       ├── ics.spec.ts              ← import/export .ics
│       └── relay-management.spec.ts ← add/remove relays, failure states
├── native/
│   └── flows/              ← Maestro YAML flows
└── relay/
    ├── docker-compose.yml  ← strfry container
    ├── strfry.conf         ← strfry config (ephemeral, in-memory or tmpfs)
    └── seed/
        ├── seed.ts         ← script: publishes deterministic events to relay
        └── keys.ts         ← fixed test keypairs (ALICE, BOB, CAROL)
```

---

## The Local Relay (strfry)

`strfry` is a complete Nostr relay implementation that speaks the full protocol: `REQ`, `EVENT`, `EOSE`, `OK`, `CLOSE`, NIP-09 deletions, NIP-40 expiration, NIP-42 auth. It runs in Docker during tests. The app connects to it instead of `wss://relay.damus.io`.

### docker-compose.yml

```yaml
# e2e/relay/docker-compose.yml
services:
  strfry:
    image: ghcr.io/hoytech/strfry:latest
    ports:
      - "7777:7777"
    volumes:
      - ./strfry.conf:/etc/strfry.conf:ro
      # Use tmpfs so each test run starts with a clean slate
      - type: tmpfs
        target: /app/strfry-db
    command: relay
```

### strfry.conf (minimal)

```toml
# e2e/relay/strfry.conf
db = "/app/strfry-db"

[relay]
bind = "0.0.0.0"
port = 7777
nofiles = 0

[relay.info]
name = "nostr-calendar-test-relay"
description = "ephemeral test relay"

[relay.negentropy]
enabled = true
```

The tmpfs mount means every `docker compose up` starts with an empty relay. The seed script then populates it with the known test corpus.

---

## Pointing the App at the Local Relay

The app's default relays are hardcoded in `src/common/nostr.ts`. On web, the relay store starts empty and the app falls back to those defaults. Tests need to override this.

### Code change required (one-time)

Add a `VITE_TEST_RELAY` env var check in `src/common/nostr.ts`:

```ts
// src/common/nostr.ts  (add near the top)
export const DEFAULT_RELAYS = import.meta.env.VITE_TEST_RELAY
  ? [import.meta.env.VITE_TEST_RELAY]
  : [
      "wss://relay.damus.io/",
      "wss://relay.primal.net/",
      // ...rest of defaults
    ];
```

Then create `e2e/.env.test`:

```
VITE_TEST_RELAY=ws://localhost:7777
```

Playwright is launched with `dotenv` loading this file (see `playwright.config.ts` below). The app uses only the local relay during all E2E runs. No WebSocket mocking needed for the happy path.

`page.routeWebSocket` is reserved for failure injection only in the current architecture — see the [WebWorker caveat](#webworker-usage) below for why container control is preferred over this.

---

## Test Keys & Seed Data

### e2e/relay/keys.ts

Fixed keypairs derived from constant seeds. Always the same pubkeys across runs, so `naddr` values are deterministic and can be hardcoded in selectors.

```ts
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { bytesToHex } from "@noble/hashes/utils";

// Fixed seeds — never change these, they make event IDs deterministic
const SEEDS = {
  alice: "aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0000aaaa0001",
  bob:   "bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000bbbb0000bbbb0002",
  carol: "cccc0000cccc0000cccc0000cccc0000cccc0000cccc0000cccc0000cccc0003",
};

export const TEST_KEYS = Object.fromEntries(
  Object.entries(SEEDS).map(([name, hexSeed]) => {
    const seckey = Uint8Array.from(Buffer.from(hexSeed, "hex"));
    const pubkey = getPublicKey(seckey);
    const nsec = nip19.nsecEncode(seckey);
    const npub = nip19.npubEncode(pubkey);
    return [name, { seckey, pubkey, nsec, npub }];
  })
) as Record<"alice" | "bob" | "carol", { seckey: Uint8Array; pubkey: string; nsec: string; npub: string }>;
```

### e2e/relay/seed.ts

Publishes a deterministic event corpus to the relay. Run once in `global-setup.ts` before any tests.

```ts
// Events published by seed.ts:
//  1. Public calendar event by Alice (2 days from today)
//  2. Public recurring weekly event by Alice (every Monday)
//  3. Private NIP-59 gift-wrapped event by Alice → Bob
//  4. RSVP: Bob accepted Alice's public event
//  5. Scheduling page published by Alice
//  6. Calendar list published by Alice
```

The seed script uses `nostr-tools` directly — no app code. It publishes to `ws://localhost:7777` and waits for `OK` responses before returning.

---

## Playwright Configuration

```ts
// e2e/web/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.test") });

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,

  // Screenshot, trace, and video on failure
  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },

  projects: [
    // Chromium is the PR gate
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Firefox and WebKit run nightly only (see CI section)
  ],

  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",

  // Start the Vite dev server in test mode
  webServer: {
    command: "pnpm dev --mode test",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_TEST_RELAY: process.env.VITE_TEST_RELAY ?? "ws://localhost:7777",
    },
  },

  reporter: [
    ["html", { outputFolder: "../../playwright-report" }],
    ["list"],
  ],
});
```

### global-setup.ts

```ts
// e2e/web/global-setup.ts
import { execSync, spawn } from "child_process";
import { chromium } from "@playwright/test";
import { seedRelay } from "../relay/seed";
import { TEST_KEYS } from "../relay/keys";
import path from "path";

let relayProcess: ReturnType<typeof spawn>;

export default async function globalSetup() {
  // 1. Start the relay
  execSync("docker compose up -d", {
    cwd: path.resolve(__dirname, "../relay"),
    stdio: "inherit",
  });

  // Wait for relay to be ready
  await waitForRelay("ws://localhost:7777");

  // 2. Seed deterministic events
  await seedRelay("ws://localhost:7777");

  // 3. Create auth storageState for Alice (returning-user fixture)
  //    Launch a headless browser, log in once, save browser storage to disk.
  //    All authed tests restore this state instead of going through login.
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("http://localhost:5173");

  // Open login modal (if not already showing)
  const loginModal = page.getByTestId("login-modal");
  if (!(await loginModal.isVisible())) {
    await page.getByTestId("header-login-button").click();
  }

  // Local key tab → paste Alice's nsec → submit
  await page.getByTestId("login-tab-localkey").click();
  await page.getByTestId("login-input-nsec").fill(TEST_KEYS.alice.nsec);
  await page.getByTestId("login-submit").click();

  // Wait for login to complete (modal closes, user avatar appears)
  await page.getByTestId("user-avatar").waitFor({ state: "visible" });

  // Save full browser storage (localStorage + sessionStorage + cookies)
  await context.storageState({ path: "e2e/.auth/alice.json" });

  await browser.close();
}
```

### global-teardown.ts

```ts
// e2e/web/global-teardown.ts
import { execSync } from "child_process";
import path from "path";

export default async function globalTeardown() {
  execSync("docker compose down", {
    cwd: path.resolve(__dirname, "../relay"),
    stdio: "inherit",
  });
}
```

---

## Auth Fixtures

The key insight: **most tests skip the login flow entirely.** Playwright's `storageState` restores a browser's localStorage/session from a saved JSON file. `globalSetup` logs in once and saves the state. Every `authedPage` fixture restores it.

```ts
// e2e/web/fixtures/index.ts
import { test as base, expect } from "@playwright/test";

type Fixtures = {
  authedPage: Page;  // Alice, already logged in via storageState
};

export const test = base.extend<Fixtures>({
  authedPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: "e2e/.auth/alice.json",
    });
    const page = await context.newPage();
    await page.goto("/");
    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
```

Tests import `{ test, expect }` from `../fixtures` instead of `@playwright/test`. The `authedPage` fixture provides a page already authenticated as Alice — no login modal, events loaded, calendar ready.

---

## Test Flow Pattern

Every spec follows this shape:

```ts
// e2e/web/tests/event-crud.spec.ts
import { test, expect } from "../fixtures";

// authedPage = logged-in page with seeded events already loaded
test("create a public event and see it in the day grid", async ({ authedPage: page }) => {
  // Navigate to a known date
  await page.goto("/d/2026/6/25");

  // Create event
  await page.getByTestId("event-create-button").click();
  await page.getByTestId("event-form-title").fill("Team Standup");
  // ... fill start/end ...
  await page.getByTestId("event-form-save").click();

  // Assert it appears in the grid
  await expect(page.getByText("Team Standup")).toBeVisible();
});
```

The **first-time user flow** is the one exception — it explicitly clears storage:

```ts
// e2e/web/tests/onboarding.spec.ts
import { test as base, expect } from "@playwright/test"; // NOT the authed fixture

test("first-time user: login and see calendar", async ({ page }) => {
  // Fresh context, no storageState
  await page.goto("/");

  // Login modal should appear automatically
  await expect(page.getByTestId("login-modal")).toBeVisible();

  await page.getByTestId("login-tab-localkey").click();
  await page.getByTestId("login-input-nsec").fill(TEST_KEYS.alice.nsec);
  await page.getByTestId("login-submit").click();

  // Modal closes, calendar renders
  await expect(page.getByTestId("login-modal")).not.toBeVisible();
  await expect(page.getByTestId("calendar-grid")).toBeVisible();

  // Seeded event appears (relay fetched successfully)
  await expect(page.getByTestId(`event-card-${SEEDED_EVENT_NADDR}`)).toBeVisible();
});

test("returning user: auto-login on reload", async ({ browser }) => {
  // Start with Alice's saved storage state
  const context = await browser.newContext({
    storageState: "e2e/.auth/alice.json",
  });
  const page = await context.newPage();
  await page.goto("/");

  // No login modal — should be silently authenticated
  await expect(page.getByTestId("login-modal")).not.toBeVisible();
  await expect(page.getByTestId("user-avatar")).toBeVisible();
  await expect(page.getByTestId("calendar-grid")).toBeVisible();
});
```

---

## data-testid Convention

The app currently has **zero** `data-testid` attributes. They need to be added as part of implementing each test. The convention:

- Format: `domain-element[-qualifier]` in kebab-case
- For lists with dynamic items: append the domain ID — `event-card-${naddr}`, `relay-status-${url}`
- Testids are a contract — renaming one requires updating the test in the same PR

Core testids needed for Phase 1:

| Component | testid |
|---|---|
| LoginModal | `login-modal` |
| Login tab (local key) | `login-tab-localkey` |
| nsec input | `login-input-nsec` |
| Login submit button | `login-submit` |
| User avatar (authed indicator) | `user-avatar` |
| Header login button | `header-login-button` |
| Calendar grid container | `calendar-grid` |
| Individual event card | `event-card-${naddr}` |
| Create event button | `event-create-button` |
| Event form title field | `event-form-title` |
| Event form save button | `event-form-save` |

Add testids only to elements a test needs to find or assert — never on layout-only divs.

---

## Failure Artifacts

Playwright captures on any test failure (configured in `playwright.config.ts`):

- **Screenshot** — the page state at moment of failure
- **Trace file** — step-by-step replay, open with `npx playwright show-trace trace.zip`
- **Video** — full test run recording

On CI (GitHub Actions), these are uploaded as job artifacts and linked in the PR. Locally they go to `playwright-report/`.

---

## Running Tests

```bash
# Start relay separately (optional — globalSetup does this automatically)
cd e2e/relay && docker compose up -d

# Run all web E2E tests
pnpm playwright test --config e2e/web/playwright.config.ts

# Run a single spec
pnpm playwright test e2e/web/tests/onboarding.spec.ts

# Run with headed browser (for debugging)
pnpm playwright test --headed

# Open last HTML report
pnpm playwright show-report

# Show trace from a failure
npx playwright show-trace e2e/web/test-results/.../trace.zip
```

Add to `package.json`:

```json
"scripts": {
  "test:e2e": "playwright test --config e2e/web/playwright.config.ts",
  "test:e2e:ui": "playwright test --config e2e/web/playwright.config.ts --ui",
  "test:e2e:report": "playwright show-report"
}
```

---

## CI (GitHub Actions)

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  pull_request:
  push:
    branches: [main]

jobs:
  e2e-web:
    runs-on: ubuntu-latest
    container:
      image: mcr.microsoft.com/playwright:v1.48.0-jammy

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
        working-directory: nostr-calendar

      - name: Start relay
        run: docker compose up -d
        working-directory: nostr-calendar/e2e/relay

      - name: Run E2E tests
        run: pnpm test:e2e
        working-directory: nostr-calendar
        env:
          VITE_TEST_RELAY: ws://localhost:7777
          CI: true

      - name: Upload failure artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: nostr-calendar/playwright-report/
          retention-days: 7
```

Note: the Playwright Docker image includes Chromium. The relay runs as a Docker service in the same job. No separate service container declaration needed when using `docker compose` directly.

---

## Playwright vs Unified Maestro

The architecture uses two tools (Playwright for web, Maestro for native). The alternative — using Maestro alone for all platforms — is a valid choice and worth understanding as the app evolves.

### Pros of unified Maestro

**True write-once cross-platform.** The same YAML flow runs on web, Android, and iOS. With the shared `data-testid` / accessibility ID contract, a flow written once covers all three surfaces.

**Single toolchain.** One thing to learn, one thing to maintain, one thing to debug. Contributors don't need to know both Playwright's API and Maestro's YAML.

**Simpler auth handling across platforms.** Playwright's `storageState` only works on web. For native you already need a different auth strategy. Maestro handles both in the same flow, avoiding the impedance mismatch.

**Maestro Cloud as a unified CI target.** Web, Android, and iOS all run on Maestro Cloud without managing Linux runners, Android emulators, and macOS runners separately.

**The WebSocket interception argument for Playwright has weakened.** Once the relay pool moves to a WebWorker, `page.routeWebSocket` stops working for failure injection (see [WebWorker Usage](#webworker-usage)). The main technical differentiator Playwright had for this app is already eroding.

### Cons of unified Maestro

**No `storageState` — every flow pays the login cost.** Playwright's `storageState` restores saved browser storage so every test starts already authenticated. Maestro has no equivalent — you either re-run login steps at the top of every flow (slow) or inject localStorage via `runScript` before each flow (fragile and verbose).

**YAML expressiveness ceiling.** Playwright tests are TypeScript — full language power for setup, data seeding, assertions, and complex conditions. Maestro YAML has basic conditionals and `repeat` but no real loops, no data manipulation, and no ability to compute values like `naddr` and compare them against selectors. Any logic beyond "tap this, assert that" requires `runScript` (inline JavaScript), which partially defeats the simplicity argument.

**No `globalSetup` equivalent.** Playwright's `globalSetup` hook is where the relay starts, events are seeded, and `storageState` is created — all in one TypeScript file with full async control. In Maestro this becomes shell scripts run before the flows, with no built-in way to share computed values (like seeded event naddrs) back into the flows.

**Maestro web is less mature.** Maestro's native support is excellent. Its web support uses Chrome DevTools Protocol under the hood but exposes a much smaller surface — no service worker control, no network request interception, no multi-context support. For PWA offline behaviour and service worker caching, this is a gap.

**Worse debugging on web.** Playwright's trace viewer gives step-by-step replay with DOM snapshots, network log, console output, and timing in one file. Maestro gives per-step screenshots and a video. For diagnosing a failed web test, the trace viewer is significantly more useful.

### When to switch to unified Maestro

Switch if the app goes **fully native** — Playwright becomes irrelevant for native and unified Maestro pays off clearly. If a web version is maintained alongside native apps, keep the split: Playwright's debugging and `storageState` justify the two-toolchain cost.

---

## Extending to iOS

The architecture extends to iOS with minimal changes.

**What works unchanged:** Maestro supports iOS simulators with the same YAML syntax. Since Capacitor renders the entire app as a WebView on both platforms, all `data-testid` selectors and flow logic work on iOS without modification. Most Maestro flows can target Android and iOS from the same YAML file.

**Directory structure:** add an `ios/` subfolder under `e2e/native/flows/` for iOS-specific overrides. Shared flows stay at the top level.

```
e2e/native/
└── flows/
    ├── onboarding.yaml         ← runs on both platforms
    ├── event-crud.yaml         ← runs on both platforms
    ├── android/
    │   ├── device-calendar.yaml   ← Android-only (CalendarContract)
    │   └── nip55-signer.yaml      ← Android-only (Amber)
    └── ios/
        └── notifications.yaml     ← iOS-specific permission dialog steps
```

**What differs on iOS:**

- **CI runners** — iOS simulation requires macOS (`macos-latest` on GitHub Actions), which costs ~10× more than Linux. Run iOS native tests on a separate schedule (nightly / pre-release) rather than as a PR gate.

- **System permission dialogs** — iOS notification and calendar permission dialogs look different from Android's. Steps that grant permissions may need iOS-specific Maestro subflows using `runFlow` conditionals.

- **Device calendar** — the custom `deviceCalendar` Capacitor plugin returns `isAvailable() = false` on iOS (not yet implemented, per `src/plugins/deviceCalendar.ts`). Device calendar flows are Android-only until the iOS plugin is built.

- **NIP-55 Android signer (Amber)** — has no iOS equivalent. That flow is Android-only.

The relay, seed data, web Playwright tests, and `data-testid` convention need no changes for iOS.

---

## WebWorker Usage

The app is moving toward heavy WebWorker usage (offloading the Nostr relay pool and potentially other data processing to background threads). This has no impact on most of the architecture but breaks one specific mechanism.

**UI-level tests are unaffected.** Playwright and Maestro both observe rendered output. They don't care whether an event arrived via a worker `postMessage`, a direct WebSocket, or a service worker. If the calendar grid renders the event, the test passes.

**`page.routeWebSocket` does not intercept WebSockets opened inside a WebWorker.** Workers run in a separate JavaScript context that Playwright cannot reach into. This means the failure injection approach — simulating relay down or `OK: false` via `routeWebSocket` — does not work once the relay pool moves to a worker.

**Use relay container control for failure injection instead:**

```ts
import { execSync } from "child_process";
import path from "path";

const relayDir = path.resolve(__dirname, "../relay");

export function stopRelay() {
  execSync("docker compose stop strfry", { cwd: relayDir });
}

export function startRelay() {
  execSync("docker compose start strfry", { cwd: relayDir });
}
```

```ts
// e2e/web/tests/relay-management.spec.ts
test("shows disconnected state when relay is unreachable", async ({ authedPage: page }) => {
  stopRelay();
  await page.reload();
  await expect(page.getByTestId("relay-status-offline")).toBeVisible();
  startRelay();
});
```

This is coarser than per-message `routeWebSocket` interception — you can't inject a single `OK: false` for one event — but it works regardless of where the WebSocket lives and covers the meaningful failure states: relay unreachable, relay comes back online.

**One additional implication:** WebWorker errors don't propagate to `page.on('pageerror')` automatically. Silent worker crashes won't surface as test failures unless the UI reflects them. The app should expose worker error states visually (connection status, error toast) — those become the assertions for error scenarios.

---

## Moving to Fully Native UI

If the app moves from Capacitor WebView to a fully native UI (React Native, or native Kotlin/Swift), the architecture adapts as follows.

**Maestro's advantage increases.** The main ergonomic benefit Maestro has today over Appium is avoiding WebView context switching. That concern disappears in a fully native app, which means Appium's gap with Maestro closes — but Maestro's simplicity (YAML flows, no server, no build instrumentation) remains. For a fully native app Maestro is still the right choice for black-box flow testing.

**`data-testid` is replaced by accessibility IDs.** HTML data attributes don't exist in native UI. The equivalent is:
- iOS: `accessibilityIdentifier` (set in SwiftUI/UIKit)
- Android: `contentDescription` (or `testTag` in Compose)
- React Native: `testID` prop (maps to `accessibilityIdentifier` on iOS, `content-desc` on Android)

Maestro selects on these natively. The naming convention (`domain-element-qualifier`) stays the same — only the attribute name changes. The principle of stable semantic IDs over text or position is unchanged.

**Playwright's scope shrinks to the web version only.** If a web/PWA version of the app is maintained alongside native, Playwright continues to cover it unchanged. If the web version is dropped entirely, Playwright has no role.

**Detox becomes worth evaluating for React Native specifically.** Detox is gray-box — it hooks into the React Native runtime and can assert on internal state, not just rendered output. For complex animation or async state scenarios it has an edge over Maestro. However Maestro's lower setup cost and cross-platform YAML still makes it the better default; reach for Detox only if Maestro's black-box approach proves insufficient.

**The relay, seed data, and CI strategy need no changes** for a native migration — the backend contract (Nostr relay protocol) is identical regardless of frontend rendering technology.

---

## What Is NOT Tested Here

- Nostr cryptography (NIP-44, NIP-59 gift-wrap math) → unit tests in `src/`
- RRULE expansion correctness → `src/utils/repeatingEventsHelper.test.ts`
- Store reducer logic → existing Vitest tests in `src/stores/`
- Signer implementations (NIP-07/46/49 crypto) → `@formstr/signer` package tests

E2E tests only verify that the app renders the *result* of those operations correctly — "a recurring event appears on the right days in the grid." The math is tested separately.
