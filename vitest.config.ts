import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      // Scope coverage to the nostr-protocol modules this suite targets
      // (issue #164). UI/components are intentionally excluded.
      include: [
        "src/common/nostr.ts",
        "src/common/nip59.ts",
        "src/common/nostrRuntime/index.ts",
        "src/common/nostrRuntime/SubscriptionManager.ts",
      ],
      reporter: ["text", "text-summary"],
      // Still emit the report even if unrelated suites fail.
      reportOnFailure: true,
    },
  },
});
