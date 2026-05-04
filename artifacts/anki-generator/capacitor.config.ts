import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.replit.ankigen",
  appName: "AnkiGen",
  webDir: "dist/public",
  android: {
    allowMixedContent: false,
  },
};

export default config;
