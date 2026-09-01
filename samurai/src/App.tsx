import { useCallback, useEffect, useState } from "react";
import { AmoebaVisualizer } from "./components/AmoebaVisualizer";
import { CreationsVault } from "./components/CreationsVault";
import { ScanConsole } from "./components/ScanConsole";
import { SpectrumRadar } from "./components/SpectrumRadar";
import { StreamerPanel } from "./components/StreamerPanel";
import { ThreatGauge } from "./components/ThreatGauge";
import { JellyButton } from "./components/JellyButton";
import { Screw } from "./components/HardwareBits";
import {
  amoebaRemediate,
  getAppState,
  getImmunityLog,
  runSamuraiScan,
  seedDemoLab,
  toggleAmoebaAutoRepair,
  toggleStreamerMode,
} from "./lib/api";
import { bandFromScore } from "./lib/types";
import type { AppFlags, RepairOutcome, ScanReport } from "./lib/types";

const IDLE_SYNTHESIS =
  "Blade sheathed. Arm a sweep and Samurai will hunt malware without rewriting your creations.";

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

export default function App() {
  const [flags, setFlags] = useState<AppFlags>({
    amoebaAutoRepair: true,
    streamerMode: false,
  });
  const [path, setPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [pending, setPending] = useState<RepairOutcome | null>(null);
  const [immunityCount, setImmunityCount] = useState(0);
  const [labPath, setLabPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"samurai" | "amoeba" | "shield">("samurai");

  const score = report?.threatScore ?? 4;
  const band = report?.band ?? bandFromScore(score);
  const synthesis = report?.synthesis ?? IDLE_SYNTHESIS;

  const refreshImmunity = useCallback(async () => {
    const log = await getImmunityLog();
    setImmunityCount(log.antigens.length);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot(): Promise<void> {
      try {
        const [state, lab] = await Promise.all([getAppState(), seedDemoLab()]);
        if (cancelled) {
          return;
        }
        setFlags(state);
        setLabPath(lab);
        await refreshImmunity();
      } catch (bootError) {
        if (!cancelled) {
          setError(bootError instanceof Error ? bootError.message : String(bootError));
        }
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [refreshImmunity]);

  const ingestReport = useCallback(
    async (next: ScanReport) => {
      setReport(next);
      const awaiting = next.autoActions.find(
        (item) => item.kind === "awaiting_confirmation",
      );
      const repaired = next.autoActions.find((item) => item.kind === "repaired");
      const abort = next.autoActions.find((item) => item.kind === "sanctuary_abort");
      setPending(awaiting ?? abort ?? repaired ?? next.autoActions[0] ?? null);
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
    setTab("samurai");
    try {
      const next = await runSamuraiScan(path);
      await ingestReport(next);
      if (next.labPath) {
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
    setTab("amoeba");
    try {
      const outcome = await amoebaRemediate(resolveRepairPath(pending, labPath), true);
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

  async function handleAmoebaToggle(): Promise<void> {
    const value = await toggleAmoebaAutoRepair();
    setFlags((current) => ({ ...current, amoebaAutoRepair: value }));
    setTab("amoeba");
  }

  async function handleStreamerToggle(): Promise<void> {
    const value = await toggleStreamerMode();
    setFlags((current) => ({ ...current, streamerMode: value }));
    setTab("shield");
  }

  return (
    <div className="stage">
      <div className="scanlines" />
      <div className="device">
        <div className="honeycomb-grip grip-left hidden xl:block" aria-hidden="true" />

        <div className="device-shell">
          <Screw className="absolute left-6 top-6" />
          <Screw className="absolute right-8 top-7" />
          <Screw className="absolute bottom-6 left-7" />
          <Screw className="absolute bottom-7 right-10" />

          <header className="relative mb-3 flex flex-wrap items-center justify-between gap-3 px-4 pt-1">
            <div>
              <p className="font-display text-[10px] tracking-[0.42em] text-blood-deep">
                RONIN SOFTWORX · ロニンソフトワークス
              </p>
              <h1 className="brand-mark font-display text-3xl text-chrome">
                SAMURAI <span className="text-blood-hot">サムライ</span>
              </h1>
              <p className="mt-1 max-w-xl font-readout text-[11px] tracking-wide text-steel">
                Protects creations. Destroys malware. Never rewrites your files.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {Array.from({ length: 5 }, (_, index) => (
                <span
                  key={index}
                  className={`capsule-led ${index < 4 ? "on" : ""}`}
                />
              ))}
            </div>
          </header>

          <div className="mb-3 flex gap-1 px-3">
            {(
              [
                { id: "samurai", en: "SAMURAI", jp: "サムライ" },
                { id: "amoeba", en: "AMOEBA", jp: "アメーバ" },
                { id: "shield", en: "SHIELD", jp: "シールド" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`tab-bevel px-6 py-2 font-display text-[10px] tracking-[0.22em] ${
                  tab === item.id ? "active text-chrome" : "text-silver/70"
                }`}
                onClick={() => setTab(item.id)}
              >
                {item.en} // {item.jp}
              </button>
            ))}
          </div>

          <div className="crt-well relative rounded-[28px] p-4">
            <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_280px]">
              <div
                className={
                  tab === "amoeba" ? "rounded-[28px] ring-2 ring-blood/70" : ""
                }
              >
                <AmoebaVisualizer
                  repairing={repairing}
                  autoRepair={flags.amoebaAutoRepair}
                  onToggle={() => {
                    void handleAmoebaToggle();
                  }}
                />
              </div>
              <div
                className={
                  tab === "samurai" ? "rounded-[28px] ring-2 ring-blood/70" : ""
                }
              >
                <ThreatGauge
                  score={score}
                  band={band}
                  synthesis={synthesis}
                  scanning={scanning}
                />
              </div>
              <div
                className={
                  tab === "shield" ? "rounded-[28px] ring-2 ring-blood/70" : ""
                }
              >
                <StreamerPanel
                  streamerMode={flags.streamerMode}
                  onToggle={() => {
                    void handleStreamerToggle();
                  }}
                />
              </div>
            </div>

            <div className="mt-4">
              <SpectrumRadar score={score} scanning={scanning} />
            </div>

            <div className="mt-4">
              <ScanConsole
                path={path}
                onPathChange={setPath}
                pending={pending}
                findings={report?.findings ?? []}
                engines={report?.engineStatuses ?? []}
                labPath={labPath}
              />
            </div>

            <div className="mt-4">
              <CreationsVault />
            </div>

            <div className="mt-5 flex justify-center gap-8 xl:hidden">
              <JellyButton
                label="SCAN"
                kana="斬"
                pressed={scanning}
                onClick={() => {
                  void handleScan();
                }}
              />
              <JellyButton
                label="RESTORE"
                kana="治"
                silver
                disabled={!pending || pending.kind !== "awaiting_confirmation"}
                onClick={() => {
                  void handleConfirm();
                }}
              />
            </div>

            {error ? (
              <p className="lcd-face critical mt-4 rounded-xl px-4 py-3 font-readout text-sm">
                {error}
              </p>
            ) : null}

            <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1 pt-2 text-[10px] tracking-[0.14em] text-silver/55">
              <p className="font-readout">
                SYSTEM // システム · IMMUNITY {immunityCount.toString().padStart(2, "0")} ·
                NEOMARK HOLDINGS LLC
              </p>
              <p className="font-readout">
                YARA · CLAMAV · TSHARK · HEURISTIC — read-only until Amoeba restores
              </p>
            </footer>
          </div>
        </div>

        <div className="thumb-rail hidden xl:flex">
          <JellyButton
            label="SCAN"
            kana="斬"
            pressed={scanning}
            onClick={() => {
              void handleScan();
            }}
          />
          <JellyButton
            label="RESTORE"
            kana="治"
            silver
            disabled={!pending || pending.kind !== "awaiting_confirmation"}
            onClick={() => {
              void handleConfirm();
            }}
          />
        </div>

        <div className="honeycomb-grip grip-right hidden xl:block" aria-hidden="true" />
      </div>
    </div>
  );
}
