export function trayTooltip(held: number, armed: boolean): string {
  if (!armed) {
    return "Samurai · disarmed";
  }
  if (held <= 0) {
    return "Samurai · at rest";
  }
  if (held === 1) {
    return "Samurai · held a drop";
  }
  return `Samurai · held ${held} drops`;
}

export function shouldRaiseConsoleOnHold(): boolean {
  return false;
}

export const PREVIEW_RESIDENT_SUMMARY =
  "Resident tray is the desktop app. Close the window or press SIT to stay in the taskbar. Holds do not pop the console, toast, or steal focus. Click the tray when you are ready.";
