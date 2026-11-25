import { describe, expect, it } from "vitest";
import { isInstalled, isIos, needsHomeScreenInstall, type Device } from "./platform";

const device = (overrides: Partial<Device>): Device => ({
  userAgent: "",
  platform: "",
  maxTouchPoints: 0,
  standalone: false,
  displayModeStandalone: false,
  hasNotifications: false,
  ...overrides,
});

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const iphoneTab = device({ userAgent: IPHONE_SAFARI, platform: "iPhone", maxTouchPoints: 5 });
// An iPad asks for the desktop site by default and so claims to be a Mac.
const ipadTab = device({ userAgent: MAC_SAFARI, platform: "MacIntel", maxTouchPoints: 5 });

describe("home-screen install hint", () => {
  it("is needed on an iPhone or iPad in a browser tab", () => {
    expect(needsHomeScreenInstall(iphoneTab)).toBe(true);
    expect(needsHomeScreenInstall(ipadTab)).toBe(true);
    expect(needsHomeScreenInstall({ ...iphoneTab, userAgent: IPHONE_CHROME })).toBe(true);
  });

  it("is not needed once the app runs from the home screen", () => {
    expect(needsHomeScreenInstall({ ...iphoneTab, standalone: true, hasNotifications: true })).toBe(
      false,
    );
    expect(needsHomeScreenInstall({ ...iphoneTab, displayModeStandalone: true })).toBe(false);
  });

  it("is not needed if the tab can do notifications after all", () => {
    expect(needsHomeScreenInstall({ ...iphoneTab, hasNotifications: true })).toBe(false);
  });

  it("never applies to anything that isn't iOS", () => {
    const others = [
      device({ userAgent: ANDROID_CHROME, platform: "Linux armv81", maxTouchPoints: 5 }),
      device({ userAgent: WINDOWS_CHROME, platform: "Win32" }),
      // A touch-screen Windows laptop.
      device({ userAgent: WINDOWS_CHROME, platform: "Win32", maxTouchPoints: 10 }),
      device({ userAgent: MAC_SAFARI, platform: "MacIntel" }),
      // Any of them with notifications missing (e.g. an in-app browser) still gets no hint.
      device({ userAgent: ANDROID_CHROME, platform: "Linux armv81", hasNotifications: false }),
    ];

    for (const other of others) {
      expect(isIos(other)).toBe(false);
      expect(needsHomeScreenInstall(other)).toBe(false);
    }
  });

  it("recognises an installed app either way a browser reports it", () => {
    expect(isInstalled(device({ standalone: true }))).toBe(true);
    expect(isInstalled(device({ displayModeStandalone: true }))).toBe(true);
    expect(isInstalled(device({}))).toBe(false);
  });
});
