# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: booking.spec.ts >> booker requests a slot and the host approves it
- Location: e2e/web/tests/booking.spec.ts:59:1

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: locator.click: Target page, context or browser has been closed
Call log:
  - waiting for getByRole('button', { name: /^(Monday|Tuesday|Wednesday|Thursday|Friday),/ }).and(locator(':enabled')).first()

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic:
    - progressbar
    - generic: Some features may be unavailable while the app is loading…
  - generic [ref=e3]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - generic [ref=e8]: A
          - heading "Alice" [level=6] [ref=e9]
        - heading "Approve Flow msatm8ik" [level=4] [ref=e10]
      - generic [ref=e11]:
        - generic [ref=e12]:
          - generic [ref=e13]:
            - button "previous month" [ref=e14] [cursor=pointer]:
              - img [ref=e15]
            - heading "September 2026" [level=6] [ref=e17]
            - button "next month" [active] [ref=e18] [cursor=pointer]:
              - img [ref=e19]
          - generic [ref=e21]:
            - generic [ref=e22]:
              - generic [ref=e23]: S
              - generic [ref=e24]: M
              - generic [ref=e25]: T
              - generic [ref=e26]: W
              - generic [ref=e27]: T
              - generic [ref=e28]: F
              - generic [ref=e29]: S
            - generic [ref=e30]:
              - button "Sunday, August 30" [disabled]: "30"
              - button "Monday, August 31" [disabled]: "31"
              - button "Tuesday, September 1" [disabled]: "1"
              - button "Wednesday, September 2" [disabled]: "2"
              - button "Thursday, September 3" [disabled]: "3"
              - button "Friday, September 4" [disabled]: "4"
              - button "Saturday, September 5" [disabled]: "5"
              - button "Sunday, September 6" [disabled]: "6"
              - button "Monday, September 7" [disabled]: "7"
              - button "Tuesday, September 8" [disabled]: "8"
              - button "Wednesday, September 9" [disabled]: "9"
              - button "Thursday, September 10" [disabled]: "10"
              - button "Friday, September 11" [disabled]: "11"
              - button "Saturday, September 12" [disabled]: "12"
              - button "Sunday, September 13" [disabled]: "13"
              - button "Monday, September 14" [disabled]: "14"
              - button "Tuesday, September 15" [disabled]: "15"
              - button "Wednesday, September 16" [disabled]: "16"
              - button "Thursday, September 17" [disabled]: "17"
              - button "Friday, September 18" [disabled]: "18"
              - button "Saturday, September 19" [disabled]: "19"
              - button "Sunday, September 20" [disabled]: "20"
              - button "Monday, September 21" [disabled]: "21"
              - button "Tuesday, September 22" [disabled]: "22"
              - button "Wednesday, September 23" [disabled]: "23"
              - button "Thursday, September 24" [disabled]: "24"
              - button "Friday, September 25" [disabled]: "25"
              - button "Saturday, September 26" [disabled]: "26"
              - button "Sunday, September 27" [disabled]: "27"
              - button "Monday, September 28" [disabled]: "28"
              - button "Tuesday, September 29" [disabled]: "29"
              - button "Wednesday, September 30" [disabled]: "30"
              - button "Thursday, October 1" [disabled]: "1"
              - button "Friday, October 2" [disabled]: "2"
              - button "Saturday, October 3" [disabled]: "3"
            - generic [ref=e31]: Dates with a dot have open times.
        - generic [ref=e32]:
          - generic [ref=e33]:
            - text: BOOK A TIME
            - heading "Pick a time that works" [level=5] [ref=e34]
          - generic [ref=e35]:
            - heading "Tuesday, September 1" [level=6] [ref=e36]
            - generic [ref=e37]: 0 open
          - paragraph [ref=e39]: No available times on this day.
    - contentinfo [ref=e40]: Shown in your timezone (UTC+0) · 20:25 for the host.
```

# Test source

```ts
  177 |  * Opens an event's view modal from the calendar grid and clicks through to
  178 |  * the edit page, waiting for the form to be loaded with the event's title.
  179 |  */
  180 | export async function openEventEditor(page: Page, title: string): Promise<void> {
  181 |   const dialog = await openEventModal(page, title);
  182 |   await dialog.getByRole("button", { name: "More options" }).click();
  183 |   await page.getByRole("menuitem", { name: "Edit Event" }).click();
  184 |   await expect(page.getByTestId("event-title")).toHaveValue(title);
  185 | }
  186 | 
  187 | /**
  188 |  * Types a full date-time into one of the MUI picker fields on the event form.
  189 |  * `fieldLabel` is the picker label ("Start time" / "End time") and `value`
  190 |  * must be formatted as "MM/DD/YYYY hh:mm AM|PM".
  191 |  */
  192 | export async function fillDateTimeField(
  193 |   page: Page,
  194 |   fieldLabel: string,
  195 |   value: string,
  196 | ): Promise<void> {
  197 |   const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}) (AM|PM)$/);
  198 |   if (!match) {
  199 |     throw new Error(`Expected "MM/DD/YYYY hh:mm AM|PM", got "${value}"`);
  200 |   }
  201 |   const [, month, day, year, hours, minutes, meridiem] = match;
  202 | 
  203 |   const field = page.getByRole("group", { name: fieldLabel });
  204 |   // The redesigned MUI field exposes separate text inputs for its date and
  205 |   // time sections. Filling those inputs is stable across localized month
  206 |   // labels, unlike asserting against the group text content.
  207 |   const inputs = field.getByRole("textbox");
  208 |   await inputs.nth(0).fill(`${month}/${day}/${year}`);
  209 |   await inputs.nth(1).fill(`${hours}:${minutes} ${meridiem}`);
  210 | }
  211 | 
  212 | /**
  213 |  * Navigates to the bookings page via the persistent sidebar's "View
  214 |  * Bookings" link. Mounting the sidebar is what starts the booking-request
  215 |  * relay subscriptions, so this is the realistic path to a live /bookings
  216 |  * view.
  217 |  */
  218 | export async function openBookingsViaSidebar(page: Page): Promise<void> {
  219 |   await page.getByRole("button", { name: "View Bookings" }).click();
  220 |   await page.waitForURL("**/bookings");
  221 | }
  222 | 
  223 | /**
  224 |  * Creates a booking (scheduling) page with default availability and returns
  225 |  * its public share URL (includes the viewKey query parameter).
  226 |  */
  227 | export async function createBookingPage(
  228 |   page: Page,
  229 |   title: string,
  230 | ): Promise<string> {
  231 |   await navigate(page, "/bookings");
  232 |   await page.getByRole("button", { name: "New Page" }).click();
  233 |   await page.waitForURL("**/schedule/create");
  234 | 
  235 |   // The label text is "Title *" (required marker), so match the accessible
  236 |   // name via role instead of getByLabel.
  237 |   await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  238 |   await page.getByRole("button", { name: "Create page" }).click();
  239 | 
  240 |   // Saving now moves straight to the editor. The success snackbar is
  241 |   // transient, so wait for the durable share link instead.
  242 |   const pageUrlField = page.getByLabel("booking page link");
  243 |   await expect(pageUrlField).toHaveValue(/\/schedule\/naddr.*viewKey=/, {
  244 |     timeout: 20_000,
  245 |   });
  246 |   const pageUrl = await pageUrlField.inputValue();
  247 |   expect(pageUrl).toContain("/schedule/naddr");
  248 |   return pageUrl;
  249 | }
  250 | 
  251 | /**
  252 |  * As Bob, opens a booking link, picks the first available slot of next month
  253 |  * (always fully in the future) and submits a booking request.
  254 |  */
  255 | export async function bookFirstSlot(
  256 |   page: Page,
  257 |   pageUrl: string,
  258 |   meetingTitle: string,
  259 |   calendarName: string,
  260 | ): Promise<void> {
  261 |   await navigate(page, pageUrl, TEST_KEYS.bob);
  262 |   await expect(page.getByTestId("booking-timezone-footer")).toHaveText(
  263 |     /^Shown in your timezone \(UTC(?:[+-]\d{1,2}(?::\d{2})?)?\) · \d{2}:\d{2} for the host\.$/,
  264 |   );
  265 |   await expect(
  266 |     page.getByText("Times are shown in your local timezone"),
  267 |   ).toHaveCount(0);
  268 |   await page.getByRole("button", { name: "next month" }).click();
  269 | 
  270 |   // Advancing the month preserves the selected day-of-month. It can now land
  271 |   // on a weekend (with no default availability), so explicitly choose an
  272 |   // enabled weekday before looking for time slots.
  273 |   const availableDay = page
  274 |     .getByRole("button", { name: /^(Monday|Tuesday|Wednesday|Thursday|Friday),/ })
  275 |     .and(page.locator(":enabled"))
  276 |     .first();
> 277 |   await availableDay.click();
      |                      ^ Error: locator.click: Target page, context or browser has been closed
  278 | 
  279 |   // Slot buttons are labelled with their start time, e.g. "09:00 AM".
  280 |   const slots = page
  281 |     .getByRole("button", { name: /\d{1,2}:\d{2}/ })
  282 |     .and(page.locator(":enabled"));
  283 |   await expect(slots.first()).toBeVisible({ timeout: 15_000 });
  284 |   await slots.first().click();
  285 | 
  286 |   const dialog = page.getByRole("dialog", { name: "Confirm Booking" });
  287 |   await dialog.waitFor({ state: "visible" });
  288 |   await dialog.getByLabel("Meeting title").fill(meetingTitle);
  289 |   await createCalendarViaSelect(page, dialog, calendarName);
  290 |   await dialog.getByRole("button", { name: "Request Booking" }).click();
  291 |   // Submitting redirects directly to the inbox; there is no longer a
  292 |   // success snackbar on the public booking page.
  293 |   await page.waitForURL("**/bookings", { timeout: 20_000 });
  294 | }
  295 | 
```