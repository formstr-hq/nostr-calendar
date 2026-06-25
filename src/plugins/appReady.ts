import { registerPlugin } from "@capacitor/core";

type AppReadyPlugin = {
  notifyReady(): Promise<void>;
};

const appReadyPlugin = registerPlugin<AppReadyPlugin>("AppReady");

export async function notifyAppReady() {
  try {
    await appReadyPlugin.notifyReady();
  } catch {
    // Native bridge isn't available on web; route delivery can proceed normally there.
  }
}
