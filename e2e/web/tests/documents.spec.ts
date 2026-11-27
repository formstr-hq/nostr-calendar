import { SimplePool } from "nostr-tools/pool";
import { test, expect, navigate } from "../fixtures/index.js";
import {
  createEventViaDialog,
  openEventEditor,
  openEventModal,
} from "../helpers.js";
import { publishEvent, testRelayUrl } from "../../relay/seed/publish.js";
import { TEST_KEYS } from "../../relay/seed/keys.js";
import { nip19, nip44 } from "nostr-tools";

for (const mobile of [false, true]) {
  test(`document picker, forms regression, persistence and removal (${mobile ? "mobile" : "desktop"})`, async ({
    authedPage: page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const prefix = `Docs ${Date.now()} ${mobile}`;
    const date = mobile ? "2027-04-15" : "2027-04-14";
    const key = TEST_KEYS.alice;
    const ids = [`${prefix}-1`, `${prefix}-2`];
    for (const [i, id] of ids.entries())
      await publishEvent(testRelayUrl(), key, {
        kind: 33457,
        tags: [["d", id]],
        content: nip44.encrypt(
          `# ${prefix} ${i + 1}`,
          nip44.getConversationKey(key.secretBytes, key.pubkey),
        ),
      });
    await createEventViaDialog(page, {
      date,
      title: prefix,
      calendarName: `Attachment calendar ${Date.now()}-${mobile}`,
      configure: async (dialog) => {
        await dialog.getByRole("button", { name: /Attachments/ }).click();
        await expect(
          dialog.getByRole("button", { name: "My Forms" }),
        ).toBeVisible();
        await dialog.getByRole("button", { name: "My Docs" }).click();
        const picker = page.getByRole("dialog", {
          name: "My Docs",
          exact: true,
        });
        await picker.getByLabel("Search documents").fill(prefix);
        await picker
          .getByRole("checkbox", {
            name: `${prefix} 1 · Personal`,
            exact: true,
          })
          .check({ timeout: 60000 });
        await picker
          .getByRole("checkbox", {
            name: `${prefix} 2 · Personal`,
            exact: true,
          })
          .check();
        await picker.getByRole("button", { name: "Add selected" }).click();
        await expect(
          dialog.getByText(`${prefix} 1`, { exact: true }),
        ).toBeVisible();
        await expect(dialog.getByLabel("Paste document URL")).toHaveCount(0);
        await dialog.getByRole("button", { name: "My Docs" }).click();
        await picker.getByLabel("Search documents").fill(prefix);
        await expect(
          picker.getByRole("checkbox", {
            name: `${prefix} 1 · Personal`,
            exact: true,
          }),
        ).toBeDisabled();
        await picker.getByRole("button", { name: "Cancel" }).click();
      },
    });
    // Desktop event dialogs and mobile sheets share the same editor state.
    if (mobile) await page.setViewportSize({ width: 1280, height: 900 });
    await navigate(page, `/d/${date.replaceAll("-", "/")}`);
    let detail = await openEventModal(page, prefix);
    await expect(
      detail.getByRole("link", { name: "Open in Pages" }),
    ).toHaveCount(2);
    await expect(
      detail.getByText(`${prefix} 1`, { exact: true }),
    ).toBeVisible();
    await detail.getByRole("button", { name: /^close$/i }).click();
    await expect(detail).not.toBeVisible();
    await openEventEditor(page, prefix);
    const editor = page;
    await editor
      .getByText(`${prefix} 1`, { exact: true })
      .locator("..")
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await editor.getByRole("button", { name: "Save Event" }).click();
    await expect(page.getByTestId("event-title")).not.toBeVisible();
    await navigate(page, `/d/${date.replaceAll("-", "/")}`);
    detail = await openEventModal(page, prefix);
    await expect(
      detail.getByRole("link", { name: "Open in Pages" }),
    ).toHaveCount(1);
    await expect(
      detail.getByText(`${prefix} 2`, { exact: true }),
    ).toBeVisible();
  });
}

test("creates an encrypted Pages document, attaches it and preserves forms after reload", async ({
  authedPage: page,
}) => {
  const title = `Create document event ${Date.now()}`;
  const docTitle = `New agenda ${Date.now()}`;
  const form = nip19.naddrEncode({
    kind: 30168,
    pubkey: TEST_KEYS.alice.pubkey,
    identifier: "existing-form",
  });
  await createEventViaDialog(page, {
    date: "2027-04-16",
    title,
    calendarName: `Creation calendar ${Date.now()}`,
    configure: async (dialog) => {
      await dialog.getByRole("button", { name: /Attachments/ }).click();
      await expect(dialog.getByLabel("Paste document URL")).toHaveCount(0);
      await dialog.getByPlaceholder("Paste form URL").fill(form);
      await dialog.getByRole("button", { name: "Add", exact: true }).click();
      await dialog
        .getByRole("button", { name: "Create document", exact: true })
        .click();
      const create = page.getByRole("dialog", {
        name: "Create document",
        exact: true,
      });
      await expect(
        create.getByRole("button", { name: "Create and attach" }),
      ).toBeDisabled();
      await create.getByLabel("Document title").fill(docTitle);
      await create.getByLabel("Content (optional)").fill("Private agenda body");
      await create.getByRole("button", { name: "Create and attach" }).click();
      await expect(create).not.toBeVisible({ timeout: 30000 });
      await expect(dialog.getByText(docTitle, { exact: true })).toBeVisible();
      // My Docs reads and decrypts the newly published Pages event, not editor state.
      await dialog.getByRole("button", { name: "My Docs" }).click();
      const picker = page.getByRole("dialog", { name: "My Docs", exact: true });
      await picker.getByLabel("Search documents").fill(docTitle);
      await expect(
        picker.getByRole("checkbox", {
          name: `${docTitle} · Personal`,
          exact: true,
        }),
      ).toBeDisabled({ timeout: 30000 });
      await picker.getByRole("button", { name: "Cancel" }).click();
    },
  });
  await navigate(page, "/d/2027/04/16");
  const detail = await openEventModal(page, title);
  const href = await detail
    .getByRole("link", { name: "Open in Pages" })
    .getAttribute("href");
  expect(href).toMatch(/^https:\/\/pages\.formstr\.app\/doc\/naddr1/);
  expect(href).not.toContain("#");
  const pointer = nip19.decode(new URL(href!).pathname.split("/").pop()!);
  if (pointer.type !== "naddr") throw new Error("Expected a document address");
  const pool = new SimplePool();
  try {
    const rows = await pool.querySync([testRelayUrl()], {
      kinds: [33457],
      authors: [pointer.data.pubkey],
      "#d": [pointer.data.identifier],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].tags).toEqual([["d", pointer.data.identifier]]);
    expect(rows[0].content).not.toContain(docTitle);
    expect(
      nip44.decrypt(
        rows[0].content,
        nip44.getConversationKey(
          TEST_KEYS.alice.secretBytes,
          TEST_KEYS.alice.pubkey,
        ),
      ),
    ).toBe(`# ${docTitle}\n\nPrivate agenda body`);
  } finally {
    pool.close([testRelayUrl()]);
  }

  await expect(detail.getByText(docTitle, { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: /^close$/i }).click();
  await expect(detail).not.toBeVisible();
  await openEventEditor(page, title);
  await expect(page.getByText(form, { exact: true })).toBeVisible();
  await expect(page.getByText(docTitle, { exact: true })).toBeVisible();
});
