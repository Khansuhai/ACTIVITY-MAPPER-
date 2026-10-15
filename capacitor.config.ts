import type { CapacitorConfig } from '@capacitor/cli';

// The Android app wraps the same web build (dist/) in a native shell that adds background GPS,
// the camera and the share sheet. Nothing is uploaded: the app works on files on the phone.
const config: CapacitorConfig = {
  appId: 'org.openflyover.app',
  appName: 'OpenFlyover',
  webDir: 'dist',
  android: {
    // Keeps the web view's GPS callbacks and timers running while recording in the background.
    useLegacyBridge: true,
  },
};

export default config;
