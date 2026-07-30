import type { IntlShape } from "react-intl";
import { ICalendarEvent } from "../../../utils/types";

export function getEventDisplayTitle(
  event: ICalendarEvent,
  intl: IntlShape,
  maxDescLength = 20,
): string {
  const title = event.title?.trim();
  if (title) {
    return title;
  }

  const description = event.description?.trim() ?? "";
  if (description) {
    return description.length > maxDescLength
      ? `${description.substring(0, maxDescLength)}...`
      : description;
  }

  return intl.formatMessage({ id: "event.untitled" });
}
