// What the app needs to know about the device it runs on. One question so far: is this
// an iPhone or iPad looking at the site in a browser tab? iOS delivers web push only to a
// site that was added to the home screen and opened from there, so in a tab there is no
// notification support at all and the app has to explain the detour instead.

export type Device = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  // navigator.standalone, which only iOS Safari defines.
  standalone: boolean;
  // Whether the display-mode: standalone media query matches.
  displayModeStandalone: boolean;
  hasNotifications: boolean;
};

// iPadOS reports itself as a Mac, but no Mac has a touch screen.
export const isIos = ({ userAgent, platform, maxTouchPoints }: Device): boolean =>
  /iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);

export const isInstalled = ({ standalone, displayModeStandalone }: Device): boolean =>
  standalone || displayModeStandalone;

// True only on iOS, in a browser tab, with notifications unavailable. Every other device
// gets false, so nothing built on this changes anything for them. The notification check
// keeps it false if Apple ever lets a plain tab receive push.
export const needsHomeScreenInstall = (device: Device): boolean =>
  isIos(device) && !isInstalled(device) && !device.hasNotifications;

export const currentDevice = (): Device => ({
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  maxTouchPoints: navigator.maxTouchPoints ?? 0,
  standalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
  displayModeStandalone:
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches,
  hasNotifications: typeof Notification !== "undefined",
});
