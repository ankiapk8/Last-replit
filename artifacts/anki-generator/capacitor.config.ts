import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.ankigen.mobile",
  appName: "AnkiGen",
  webDir: "dist/public",
  android: {
    allowMixedContent: false,
  },
};

export default config;
