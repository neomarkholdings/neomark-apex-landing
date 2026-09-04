import { useCallback, useEffect, useState } from "react";
import { AmoebaVisualizer } from "./components/AmoebaVisualizer";
import { CreationsVault } from "./components/CreationsVault";
import { ScanConsole } from "./components/ScanConsole";
import { InstallGatePanel } from "./components/InstallGatePanel";
import { ResidentPanel } from "./components/ResidentPanel";
import { StreamerPanel } from "./components/StreamerPanel";
import { ThreatGauge } from "./components/ThreatGauge";
import { WindowsLinePanel } from "./components/WindowsLinePanel";
import { Led, Screw, Vent } from "./components/HardwareBits";
import {
  alignWindowsLine,
  amoebaRemediate,
  getAppState,
  getImmunityLog,
  getIntercepts,
  getResident,
  getWindowsLine,
  hideToTray,
  isDesktopApp,
  pickScanFolder,
  releaseIntercept,
  runSamuraiScan,
  seedDemoLab,
  simulateDrop,
  subscribeIntercepts,
  toggleAmoebaAutoRepair,
  toggleAutostart,
  toggleLiveWatch,
  toggleStreamerMode,
} from "./lib/api";
import { bandFromScore } from "./lib/types";
import { dueToRearm, formatRearmClock } from "./lib/protection";
import type {
  AppFlags,
  Intercept,
  RepairOutcome,
  ResidentStatus,
  ScanReport,
  WindowsLineStatus,
} from "./lib/types";

const IDLE_SYNTHESIS =
  "Protection is on. Run a scan to inspect a folder. Samurai will not rewrite your creations.";

function idleEngines(liveWatch: boolean): ScanReport["engineStatuses"] {
  return [
    { name: "heuristic", available: true, summary: "Built-in file scanner" },
    {
      name: "foothold",
      available: true,
      summary: "Creator-threat hunt: disguised payloads, ransom notes, hostile autostart.",
    },
    {
      name: "gate",
      available: liveWatch,
      summary: liveWatch
        ? "Install gate armed: crack/keygen/RAT drops are held on write. Nested archives are inspected."
        : "Install gate standby. Holds are paused.",
    },
    { name: "yara", available: false, summary: "YARA is not installed" },
    { name: "clamav", available: false, summary: "ClamAV is not installed" },
    { name: "tshark", available: false, summary: "tshark is not installed" },
  ];
}

function resolveRepairPath(pending: RepairOutcome, labPath: string | null): string {
  if (!pending.path.startsWith("[STREAM-SHIELD]/")) {
    return pending.path;
  }
  const basename = pending.path.split("/").pop() ?? pending.path;
  if (!labPath) {
    return basename;
  }
  return `${labPath}/${basename}`;
}

const DISARMED_SYNTHESIS =
  "Holds are paused. Sanctuary stays locked. Protection re-arms automatically.";

function protectionLabel(
  scanning: boolean,
  liveWatch: boolean,
  band: ScanReport["band"] | "nominal",
  gateHold: boolean,
): string {
  if (scanning) {
    return "SCANNING";
  }
  if (!liveWatch) {
    return "DISARMED";
  }
  if (gateHold) {
    return "GATE HOLD";
  }
  switch (band) {
    case "nominal":
      return "PROTECTED";
    case "caution":
      return "AT RISK";
    case "critical":
      return "THREATS FOUND";
    default: {
      const exhaustive: never = band;
      return exhaustive;
    }
  }
}

export default function App() {
  const [flags, setFlags] = useState<AppFlags>({
    amoebaAutoRepair: true,
    streamerMode: false,
    liveWatch: true,
    disarmedUntil: null,
  });
  const [path, setPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [pending, setPending] = useState<RepairOutcome | null>(null);
  const [immunityCount, setImmunityCount] = useState(0);
  const [labPath, setLabPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [intercepts, setIntercepts] = useState<Intercept[]>([]);
  const [windowsLine, setWindowsLine] = useState<WindowsLineStatus | null>(null);
  const [resident, setResident] = useState<ResidentStatus | null>(null);
  const [aligning, setAligning] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const liveHeld = intercepts.some(
    (item) => item.kind === "held" || item.kind === "sanctuary_alert",
  );
  const gateHold = flags.liveWatch && liveHeld && !lastScanAt;
  const disarmed = !flags.liveWatch;
  const score =
    report?.threatScore ?? (gateHold ? 72 : disarmed ? 38 : 0);
  const band = disarmed
    ? "caution"
    : gateHold
      ? "critical"
      : (report?.band ?? bandFromScore(score));
  const synthesis =
    report?.synthesis ??
    (disarmed
      ? DISARMED_SYNTHESIS
      : gateHold
        ? "Install gate held a high-risk drop before it could run. Creations were not rewritten."
        : IDLE_SYNTHESIS);
  const rearmClock =
    disarmed && flags.disarmedUntil
      ? formatRearmClock(flags.disarmedUntil - nowMs)
      : null;

  const refreshImmunity = useCallback(async () => {
    const log = await getImmunityLog();
    setImmunityCount(log.antigens.length);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    let timer: number | undefined;
    let onVisible: (() => void) | undefined;

    async function boot(): Promise<void> {
      try {
        const lab = await seedDemoLab();
        const state = await getAppState();
        if (cancelled) {
          return;
        }
        setFlags(state);
        setLabPath(lab);
        const held = await getIntercepts();
        if (cancelled) {
          return;
        }
        setIntercepts(held);
        const line = await getWindowsLine();
        if (cancelled) {
          return;
        }
        setWindowsLine(line);
        const posture = await getResident();
        if (cancelled) {
          return;
        }
        setResident(posture);
        await refreshImmunity();
      } catch (bootError) {
        if (!cancelled) {
          setError(bootError instanceof Error ? bootError.message : String(bootError));
        }
        return;
      }
      if (cancelled) {
        return;
      }
      timer = window.setInterval(() => {
        if (document.hidden) {
          return;
        }
        void getIntercepts().then((held) => {
          if (!cancelled) {
            setIntercepts(held);
          }
        });
      }, 2000);
      const refreshWhenVisible = (): void => {
        if (document.hidden || cancelled) {
          return;
        }
        void getIntercepts().then((held) => {
          if (!cancelled) {
            setIntercepts(held);
          }
        });
        void getAppState().then((state) => {
          if (!cancelled) {
            setFlags(state);
          }
        });
      };
      onVisible = refreshWhenVisible;
      document.addEventListener("visibilitychange", refreshWhenVisible);
      unlisten = await subscribeIntercepts((item) => {
        if (!cancelled) {
          setIntercepts((current) => [item, ...current].slice(0, 40));
        }
      });
      if (!isDesktopApp()) {
        window.__SAMURAI_DEMO__ = {
          simulateDrop: async (path, innerNames) => {
            const intercept = await simulateDrop(path, innerNames);
            const held = await getIntercepts();
            if (!cancelled) {
              setIntercepts(held);
            }
            return intercept;
          },
        };
      }
    }
    void boot();
    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
      if (onVisible) {
        document.removeEventListener("visibilitychange", onVisible);
      }
      unlisten?.();
      delete window.__SAMURAI_DEMO__;
    };
  }, [refreshImmunity]);

  useEffect(() => {
    if (flags.liveWatch) {
      return;
    }
    const timer = window.setInterval(() => {
      if (document.hidden) {
        return;
      }
      const t = Date.now();
      setNowMs(t);
      if (dueToRearm(t, flags.liveWatch, flags.disarmedUntil ?? null)) {
        void getAppState().then((state) => {
          setFlags(state);
        });
      }
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [flags.liveWatch, flags.disarmedUntil]);

  const ingestReport = useCallback(
    async (next: ScanReport) => {
      setReport(next);
      setLastScanAt(new Date().toLocaleTimeString());
      const awaiting = next.autoActions.find(
        (item) => item.kind === "awaiting_confirmation",
      );
      const repaired = next.autoActions.find((item) => item.kind === "repaired");
      const abort = next.autoActions.find((item) => item.kind === "sanctuary_abort");
      setPending(awaiting ?? abort ?? repaired ?? next.autoActions[0] ?? null);
      if (next.intercepts && next.intercepts.length > 0) {
        setIntercepts((current) => [...next.intercepts!, ...current].slice(0, 40));
      }
      if (repaired) {
        setRepairing(true);
        window.setTimeout(() => setRepairing(false), 1600);
      }
      await refreshImmunity();
    },
    [refreshImmunity],
  );

  async function handleScan(): Promise<void> {
    setScanning(true);
    setError(null);
    try {
      const next = await runSamuraiScan(path);
      await ingestReport(next);
      if (next.labPath && !path.trim()) {
        setLabPath(next.labPath);
      }
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError));
    } finally {
      setScanning(false);
    }
  }

  async function handleConfirm(): Promise<void> {
    if (!pending || pending.kind !== "awaiting_confirmation") {
      return;
    }
    setRepairing(true);
    setError(null);
    try {
      const outcome = await amoebaRemediate(
        pending.restorePath || resolveRepairPath(pending, labPath),
        true,
      );
      setPending(outcome);
      if (outcome.kind === "repaired") {
        const next = await runSamuraiScan(path);
        await ingestReport(next);
      }
    } catch (repairError) {
      setError(repairError instanceof Error ? repairError.message : String(repairError));
    } finally {
      window.setTimeout(() => setRepairing(false), 900);
    }
  }

  async function handleBrowse(): Promise<void> {
    setError(null);
    const picked = await pickScanFolder();
    if (picked) {
      setPath(picked);
      return;
    }
    if (!isDesktopApp()) {
      setError(
        "Folder picker is in the desktop app. Type a folder path here, or run npm run desktop.",
      );
    }
  }

  async function handleAmoebaToggle(): Promise<void> {
    const value = await toggleAmoebaAutoRepair();
    setFlags((current) => ({ ...current, amoebaAutoRepair: value }));
  }

  async function handleStreamerToggle(): Promise<void> {
    const value = await toggleStreamerMode();
    setFlags((current) => ({ ...current, streamerMode: value }));
  }

  async function handleLiveWatchToggle(): Promise<void> {
    await toggleLiveWatch();
    setFlags(await getAppState());
    setNowMs(Date.now());
  }

  async function handleRelease(): Promise<void> {
    const latest = intercepts[0];
    if (!latest || latest.kind !== "held" || !latest.holdPath) {
      return;
    }
    setError(null);
    try {
      await releaseIntercept(latest.holdPath, latest.originalPath);
      setIntercepts(await getIntercepts());
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : String(releaseError));
    }
  }

  async function handleAlign(): Promise<void> {
    setAligning(true);
    setError(null);
    try {
      await alignWindowsLine();
      setWindowsLine(await getWindowsLine());
    } catch (alignError) {
      setError(alignError instanceof Error ? alignError.message : String(alignError));
    } finally {
      setAligning(false);
    }
  }

  async function handleAutostartToggle(): Promise<void> {
    setError(null);
    try {
      await toggleAutostart();
      setResident(await getResident());
    } catch (bootError) {
      setError(bootError instanceof Error ? bootError.message : String(bootError));
    }
  }

  async function handleSit(): Promise<void> {
    setError(null);
    try {
      await hideToTray();
    } catch (sitError) {
      setError(sitError instanceof Error ? sitError.message : String(sitError));
    }
  }

  return (
    <div className="stage">
      <div className="chassis">
        <Screw className="absolute left-3 top-3" />
        <Screw className="absolute right-3 top-3" />
        <Screw className="absolute bottom-3 left-3" />
        <Screw className="absolute bottom-3 right-3" />

        <div className="chassis-face">
          <header className="masthead">
            <div className="brand-plate">
              <p className="serial-stamp">MODEL SRX-01 · UNIT 侍-07</p>
              <p className="font-display text-[10px] tracking-[0.32em] text-silver/70">
                RONIN SOFTWORX
              </p>
              <h1 className="font-display text-2xl tracking-[0.18em] text-chrome">
                SAMURAI <span className="text-blood-hot">サムライ</span>
              </h1>
            </div>
            <div
              className={`protect-pill ${
                scanning ? "is-scanning" : disarmed ? "disarmed" : band
              }`}
            >
              <Led on silver={!scanning && !disarmed && band === "nominal"} />
              <span className="font-display text-[10px] tracking-[0.18em]">
                {protectionLabel(scanning, flags.liveWatch, band, gateHold)}
              </span>
            </div>
            <div className="status-lcd lcd-face">
              <p className="relative font-display text-[9px] tracking-[0.2em] text-silver/55">
                TELEMETRY
              </p>
              <p className="relative font-readout text-[11px] tracking-[0.12em] text-silver/80">
                SIGNATURES {immunityCount.toString().padStart(2, "0")}
                {lastScanAt ? ` · LAST SCAN ${lastScanAt}` : " · NO SCAN YET"}
              </p>
            </div>
          </header>
          <div className="blood-rule" aria-hidden="true" />

          <div className="av-grid">
            <div className="stack">
              <ThreatGauge
                score={score}
                band={band}
                synthesis={synthesis}
                scanning={scanning}
                liveWatch={flags.liveWatch}
                rearmClock={rearmClock}
                onToggle={() => {
                  void handleLiveWatchToggle();
                }}
              />
              <AmoebaVisualizer
                repairing={repairing}
                autoRepair={flags.amoebaAutoRepair}
                onToggle={() => {
                  void handleAmoebaToggle();
                }}
              />
              <InstallGatePanel
                liveWatch={flags.liveWatch}
                intercepts={intercepts}
                rearmClock={rearmClock}
                onToggle={() => {
                  void handleLiveWatchToggle();
                }}
                onRelease={() => {
                  void handleRelease();
                }}
              />
              <ResidentPanel
                status={resident}
                onToggleAutostart={() => {
                  void handleAutostartToggle();
                }}
                onSit={() => {
                  void handleSit();
                }}
              />
              <WindowsLinePanel
                status={windowsLine}
                aligning={aligning}
                onAlign={() => {
                  void handleAlign();
                }}
              />
              <StreamerPanel
                streamerMode={flags.streamerMode}
                onToggle={() => {
                  void handleStreamerToggle();
                }}
              />
            </div>

            <div className="stack">
              <ScanConsole
                path={path}
                onPathChange={setPath}
                onBrowse={() => {
                  void handleBrowse();
                }}
                onScan={() => {
                  void handleScan();
                }}
                onRestore={() => {
                  void handleConfirm();
                }}
                scanning={scanning}
                pending={pending}
                findings={report?.findings ?? []}
                actions={report?.autoActions ?? []}
                engines={report?.engineStatuses ?? idleEngines(flags.liveWatch)}
                scannedFiles={report?.scannedFiles ?? 0}
                hasScanned={Boolean(lastScanAt)}
                intercepts={intercepts}
              />
              <CreationsVault />
            </div>
          </div>

          {error ? (
            <p className="lcd-face critical relative z-[1] mt-3 rounded-[10px] px-3 py-2 font-readout text-sm">
              {error}
            </p>
          ) : null}

          <footer className="chassis-foot">
            <Vent slots={6} />
            <p>NEOMARK HOLDINGS LLC · SANCTUARY LINE ARMED</p>
            <Vent slots={6} />
          </footer>
        </div>
      </div>
    </div>
  );
}
