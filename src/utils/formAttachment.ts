import { FormstrSDK } from "@formstr/sdk";
import type { IFormAttachment } from "./types";

const formRequestCache = new Map<string, Promise<unknown>>();

function getAttachmentCacheKey(attachment: IFormAttachment) {
  return `${attachment.naddr}::${attachment.viewKey ?? ""}`;
}

export function fetchAttachedForm<T>(
  attachment: IFormAttachment,
  sdk: FormstrSDK = new FormstrSDK(),
): Promise<T> {
  return (
    attachment.viewKey
      ? sdk.fetchFormWithViewKey(attachment.naddr, attachment.viewKey)
      : sdk.fetchForm(attachment.naddr)
  ) as Promise<T>;
}

export function fetchAttachedFormCached<T>(
  attachment: IFormAttachment,
): Promise<T> {
  const cacheKey = getAttachmentCacheKey(attachment);
  const cachedRequest = formRequestCache.get(cacheKey);
  if (cachedRequest) {
    return cachedRequest as Promise<T>;
  }

  const request = fetchAttachedForm<T>(attachment).catch((error) => {
    formRequestCache.delete(cacheKey);
    throw error;
  });

  formRequestCache.set(cacheKey, request);
  return request;
}
