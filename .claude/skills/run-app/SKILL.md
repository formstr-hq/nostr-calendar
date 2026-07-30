---
name: run-app
description: Start the nostr-calendar dev server, log in as a test user, and open the app in a browser for manual inspection or visual QA. Use when asked to run, launch, preview, or check the calendar app locally.
allowed-tools: Bash(pnpm:*), Bash(agent-browser:*), Bash(pkill:*), Bash(curl:*)
---

# run-app

Launches the nostr-calendar Vite dev server and gets a real, authenticated
view of the app open in a browser — skipping the login modal entirely via
the same legacy-key injection trick the Playwright e2e suite uses.

## 1. Start the dev server

```bash
(pnpm dev > /tmp/nostr-calendar-dev.log 2>&1 &)
sleep 3
grep -o 'http://localhost:[0-9]*' /tmp/nostr-calendar-dev.log | head -1
```

If a server is already running on 5173, skip this step — check with:
```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/
```

## 2. Get a test identity

The signer has a legacy guest-key restore path
(`src/common/signer/index.ts`, `tryLegacyRestore`) that reads
`localStorage["calendar:keys"]` and skips the login UI entirely. The e2e
suite's seeded test keys (`e2e/relay/seed/keys.ts`) work fine against the
dev server even without the seeded relay running — the signer only needs a
valid keypair, it doesn't validate against relay data to log in.

Derive the keypair for whichever test user you want (alice/bob/carol) —
don't hardcode the values, the seeds can change:

```bash
pnpm exec tsx -e "
import { TEST_KEYS } from './e2e/relay/seed/keys.ts';
console.log(JSON.stringify({ pubkey: TEST_KEYS.alice.pubkey, secret: TEST_KEYS.alice.secretHex }));
"
```

## 3. Open the app and inject auth

```bash
agent-browser open http://localhost:5173/
```

Then inject the keys from step 2 (substitute the real values) and reload:

```bash
cat <<EOF | agent-browser eval --stdin
localStorage.setItem("calendar:keys", JSON.stringify({pubkey: "<PUBKEY>", secret: "<SECRET_HEX>"}));
localStorage.setItem("calendar:userData", JSON.stringify({pubkey: "<PUBKEY>", name: "Test User"}));
location.reload();
EOF
agent-browser wait --load networkidle
```

Confirm login succeeded — the user avatar (testid `user-avatar`) should be
visible in the header instead of the sign-in modal:

```bash
agent-browser snapshot -i
```

## 4. Interact / inspect

From here, drive the app normally with `agent-browser` (snapshot, click,
screenshot, etc.) — see the `agent-browser` skill for the full command
reference.

## Cleanup

```bash
agent-browser close
pkill -f 'vite' 2>/dev/null   # only if you started the dev server yourself
```

Don't kill the dev server if it was already running before this skill was
invoked — check the log/PID before started it, and leave someone else's
server alone.
