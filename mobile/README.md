# NeuroCare Mobile Application (Capacitor Wrapper)

This directory contains the Capacitor mobile container configuration for NeuroCare.
NeuroCare follows a **Single Codebase Architecture**:
- The primary React + TypeScript frontend in `/web` serves web, PWA, Android, and iOS.
- Platform capabilities (camera, microphone, storage, notifications, network) are abstracted behind `/web/src/platform/`.
- Capacitor packages the `/web/dist` build into native Android and iOS apps.

## Prerequisites
- Android Studio (for Android build)
- Xcode (for iOS build, on macOS)
- Node.js >= 18

## Building for Android / iOS
```bash
# 1. Build the shared web application
cd ../web
npm run build

# 2. Sync web assets with mobile platforms
npx cap sync

# 3. Open in native IDE
npx cap open android
# or
npx cap open ios
```
