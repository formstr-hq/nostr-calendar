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
    const pointer = nip19.naddrEncode({
      kind: 33457,
      pubkey: key.pubkey,
      identifier: ids[0],
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
        await dialog.getByLabel("Paste document URL").fill(pointer);
        await dialog
          .getByRole("button", { name: "Add", exact: true })
          .last()
          .click();
        await expect(
          dialog.getByText("This document is already attached."),
        ).toBeVisible();
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

test("existing share links require authorization, preserve only view capability, and coexist with forms", async ({
  authedPage: page,
}) => {
  const { encodeNKeys } = await import("../../../src/utils/documentKeys");
  const owner = TEST_KEYS.bob;
  const id = `manual-doc-${Date.now()}`;
  const title = `Manual capability ${Date.now()}`;
  const viewKey = TEST_KEYS.carol;
  await publishEvent(testRelayUrl(), owner, {
    kind: 33457,
    tags: [["d", id]],
    content: nip44.encrypt(
      "# Shared agenda",
      nip44.getConversationKey(viewKey.secretBytes, viewKey.pubkey),
    ),
  });
  const naddr = nip19.naddrEncode({
    kind: 33457,
    pubkey: owner.pubkey,
    identifier: id,
  });
  const form = nip19.naddrEncode({
    kind: 30168,
    pubkey: owner.pubkey,
    identifier: "existing-form",
  });
  const url = `https://pages.formstr.app/doc/${naddr}#${encodeNKeys({ viewKey: viewKey.secretHex, editKey: owner.secretHex })}`;
  await createEventViaDialog(page, {
    date: "2027-04-16",
    title,
    calendarName: `Manual calendar ${Date.now()}`,
    configure: async (dialog) => {
      await dialog.getByRole("button", { name: /Attachments/ }).click();
      await dialog.getByPlaceholder("Paste form URL").fill(form);
      await dialog
        .getByRole("button", { name: "Add", exact: true })
        .first()
        .click();
      await dialog.getByLabel("Paste document URL").fill("javascript:alert(1)");
      await dialog
        .getByRole("button", { name: "Add", exact: true })
        .last()
        .click();
      await expect(
        dialog.getByText(/Enter a valid Pages document URL/),
      ).toBeVisible();
      await dialog.getByLabel("Paste document URL").fill(url);
      await dialog
        .getByRole("button", { name: "Add", exact: true })
        .last()
        .click();
      await expect(
        dialog.getByText(/Share links require a private event/),
      ).toBeVisible();
      await dialog
        .getByRole("checkbox", { name: /I authorize sharing/ })
        .check();
      await dialog
        .getByRole("button", { name: "Add", exact: true })
        .last()
        .click();
      await expect(
        dialog.getByText("Shared agenda", { exact: true }),
      ).toBeVisible({ timeout: 30000 });
    },
  });
  await navigate(page, "/d/2027/04/16");
  const detail = await openEventModal(page, title);
  await expect(
    detail.getByRole("link", { name: "Open in Pages" }),
  ).toHaveAttribute(
    "href",
    `https://pages.formstr.app/doc/${naddr}#${encodeNKeys({ viewKey: viewKey.secretHex })}`,
  );
  await detail.getByRole("button", { name: /^close$/i }).click();
  await expect(detail).not.toBeVisible();
  await openEventEditor(page, title);
  await expect(page.getByText(form, { exact: true })).toBeVisible();
  await expect(page.getByText("Shared agenda", { exact: true })).toBeVisible();
});
