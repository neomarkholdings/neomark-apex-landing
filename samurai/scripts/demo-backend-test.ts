import { demoInvoke } from "../src/lib/demoBackend.ts";
import { isSanctuaryPath, SANCTUARY_ABORT } from "../src/lib/sanctuary.ts";
import type { AppFlags, ImmunityDb, RepairOutcome, ScanReport } from "../src/lib/types.ts";

let failed = 0;
let passed = 0;

function check(condition: unknown, message: string): void {
  if (condition) {
    passed += 1;
    console.log(`ok ${passed + failed} ${message}`);
    return;
  }
  failed += 1;
  console.error(`not ok ${passed + failed} ${message}`);
}

async function resetConsole(): Promise<void> {
  await demoInvoke("seed_demo_lab");
  const flags = await demoInvoke<AppFlags>("get_app_state");
  if (!flags.amoebaAutoRepair) {
    await demoInvoke("toggle_amoeba_auto_repair");
  }
  if (flags.streamerMode) {
    await demoInvoke("toggle_streamer_mode");
  }
}

async function run(): Promise<void> {
  check(isSanctuaryPath("/Users/ronin/Music/session.aiff"), "sanctuary blocks /Music");
  check(
    isSanctuaryPath("/home/ronin/Studio-Projects/ep1/vocal.wav"),
    "sanctuary blocks /Studio-Projects",
  );
  check(isSanctuaryPath("/var/lib/Neomark/holdings.bin"), "sanctuary blocks neomark");
  check(isSanctuaryPath("/home/streamer/RETROBLAZED/mix.wav"), "sanctuary blocks retroblazed");
  check(
    !isSanctuaryPath("/tmp/samurai-lab/tainted.txt"),
    "sanctuary allows the demo lab host file",
  );

  await resetConsole();

  const autoScan = await demoInvoke<ScanReport>("run_samurai_scan", { targetPath: null });
  check(
    autoScan.autoActions.some((item) => item.kind === "repaired"),
    "AUTO scan restores the self-test antigen",
  );
  check(
    autoScan.findings.some((item) => item.path?.endsWith("tainted.txt")),
    "AUTO scan reports the host file",
  );
  const afterAuto = await demoInvoke<ImmunityDb>("get_immunity_log");
  check(afterAuto.antigens.length === 1, "AUTO repair presents one antigen signature");

  const secondAuto = await demoInvoke<ScanReport>("run_samurai_scan", { targetPath: null });
  check(secondAuto.findings.length === 0, "second AUTO scan stays clean");
  check(secondAuto.autoActions.length === 0, "second AUTO scan does not remediate again");
  check(secondAuto.synthesis.includes("sterile"), "clean sweep synthesis mentions sterile chassis");
  const afterSecond = await demoInvoke<ImmunityDb>("get_immunity_log");
  check(afterSecond.antigens.length === 1, "clean rescan does not duplicate signatures");

  await resetConsole();
  await demoInvoke("toggle_amoeba_auto_repair");
  const askScan = await demoInvoke<ScanReport>("run_samurai_scan", { targetPath: null });
  check(
    askScan.autoActions.some((item) => item.kind === "awaiting_confirmation"),
    "ASK scan stages phagocytosis instead of rewriting",
  );
  const beforeConfirm = await demoInvoke<ImmunityDb>("get_immunity_log");
  check(beforeConfirm.antigens.length === 0, "ASK hold does not present an antigen yet");

  const restored = await demoInvoke<RepairOutcome>("amoeba_remediate", {
    path: "/tmp/samurai-lab/tainted.txt",
    confirmed: true,
  });
  check(restored.kind === "repaired", "confirmed ASK restore completes phagocytosis");

  const afterAsk = await demoInvoke<ScanReport>("run_samurai_scan", { targetPath: null });
  check(afterAsk.findings.length === 0, "scan after ASK restore stays clean");
  check(
    (await demoInvoke<ImmunityDb>("get_immunity_log")).antigens.length === 1,
    "ASK restore presents one antigen signature",
  );

  await resetConsole();
  await demoInvoke("toggle_streamer_mode");
  const shielded = await demoInvoke<ScanReport>("run_samurai_scan", { targetPath: null });
  check(
    shielded.findings.every(
      (item) => !item.path || item.path.startsWith("[STREAM-SHIELD]/"),
    ),
    "streamer shield redacts finding paths",
  );
  check(
    shielded.findings.some((item) => item.path === "[STREAM-SHIELD]/tainted.txt"),
    "streamer shield keeps the file basename",
  );
  check(
    shielded.engineStatuses.some(
      (engine) => engine.name === "tshark" && engine.summary.includes("Streamer shield"),
    ),
    "streamer shield suppresses tshark telemetry",
  );
  check(
    shielded.synthesis.includes("streamer shield"),
    "streamer synthesis notes the shield",
  );

  const markers = ["/Music", "/Studio-Projects", "neomark", "retroblazed"];
  for (const marker of markers) {
    const report = await demoInvoke<ScanReport>("run_samurai_scan", {
      targetPath: marker === "neomark" || marker === "retroblazed" ? `/tmp/${marker}/track.wav` : marker,
    });
    check(
      report.autoActions.some(
        (item) => item.kind === "sanctuary_abort" && item.message === SANCTUARY_ABORT,
      ),
      `scan of ${marker} aborts with the exact sanctuary payload`,
    );
    check(report.findings.length === 0, `scan of ${marker} does not rewrite creations`);
  }

  const unrelated = await demoInvoke<ScanReport>("run_samurai_scan", {
    targetPath: "/tmp/downloads/invoice.pdf",
  });
  check(
    !unrelated.autoActions.some((item) => item.kind === "sanctuary_abort"),
    "unrelated paths are allowed to scan",
  );
  check(unrelated.findings.length === 0, "unrelated empty targets do not invent an antigen");

  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

await run();
