import { registerPlugin } from "@capacitor/core";
import { isNative } from "../utils/platform";

type KeyBackupPlugin = {
  copyText(options: { text: string }): Promise<void>;
  saveFile(options: {
    text: string;
    fileName: string;
    mimeType: string;
  }): Promise<{ uri: string }>;
};

const keyBackupPlugin = registerPlugin<KeyBackupPlugin>("KeyBackup");

/**
 * Android WebViews do not consistently expose navigator.clipboard. Keep the
 * browser implementation as a fallback, but use the native clipboard in the
 * Capacitor app.
 */
export async function copyKeyBackup(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard is unavailable");
}

export async function saveKeyBackup(text: string): Promise<boolean> {
  return saveTextFile(text, "key.txt", "text/plain");
}

export async function saveTextFile(
  text: string,
  fileName: string,
  mimeType: string,
): Promise<boolean> {
  if (!isNative) return false;

  await keyBackupPlugin.saveFile({ text, fileName, mimeType });
  return true;
}
