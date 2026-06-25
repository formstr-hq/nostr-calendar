import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.formstr.calendar",
  appName: "Calendar by Form*",
  webDir: "dist",
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_notification",
    },
  },
};

export default config;
