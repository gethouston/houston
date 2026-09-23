/**
 * Real-VM smoke test for `vm` mode. Needs /dev/kvm and GONDOLIN_GUEST_DIR, so
 * it runs inside a pool pod, not in CI:
 *
 *   kubectl exec <pool-pod> -- sh -c \
 *     'cd /app/packages/runtime && node --import tsx spike/code-vm-smoke.ts'
 *
 * Prints one JSON line per check and exits 1 on the first failure.
 */
import { bootGondolinVm } from "../src/code-vm/gondolin";
import { TurnCodeVm } from "../src/code-vm/turn-code-vm";
import type { RunRequest } from "../src/code-vm/types";

const signal = () => AbortSignal.timeout(180_000);
const py = (code: string, timeoutMs?: number): RunRequest => ({
  language: "python",
  code,
  ...(timeoutMs ? { timeoutMs } : {}),
});

async function check(name: string, body: () => Promise<unknown>) {
  const started = Date.now();
  try {
    const detail = await body();
    console.log(
      JSON.stringify({
        check: name,
        ok: true,
        ms: Date.now() - started,
        detail,
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({ check: name, ok: false, error: String(error) }),
    );
    process.exit(1);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const vm = new TurnCodeVm(bootGondolinVm);
vm.warm();

await check("xlsx artifact", async () => {
  const r = await vm.run(
    py(
      "import pandas as pd\npd.DataFrame({'a':[1,2]}).to_excel('out.xlsx', index=False)\nprint('done')",
    ),
    signal(),
  );
  assert(r.exitCode === 0, r.stderr);
  assert(
    r.artifacts.some((a) => a.path === "out.xlsx"),
    "no out.xlsx",
  );
  return { durationMs: r.durationMs };
});

await check("no network", async () => {
  const r = await vm.run(
    {
      language: "bash",
      code: "ls /sys/class/net; wget -q -T 3 -O- http://169.254.169.254/ && echo REACHED; wget -q -T 3 -O- https://example.com && echo REACHED; true",
    },
    signal(),
  );
  assert(!r.stdout.includes("REACHED"), `egress reached: ${r.stdout}`);
  assert(r.stdout.trim() === "lo", `interfaces: ${r.stdout}`);
});

await check("ten calls in one VM", async () => {
  const ms: number[] = [];
  for (let i = 0; i < 10; i++) {
    const started = Date.now();
    const r = await vm.run(
      { language: "bash", code: "echo $((6*7))" },
      signal(),
    );
    assert(r.stdout.trim() === "42", r.stderr);
    ms.push(Date.now() - started);
  }
  ms.sort((a, b) => a - b);
  return { p50: ms[5], max: ms[9] };
});

await check("leftover background processes are reaped", async () => {
  const r = await vm.run(
    { language: "bash", code: "sleep 1000 & echo started" },
    signal(),
  );
  assert(r.stdout.trim() === "started" && !r.timedOut, JSON.stringify(r));
  const next = await vm.run(
    { language: "bash", code: "pgrep -x sleep && echo SLEEP; true" },
    signal(),
  );
  assert(!next.stdout.includes("SLEEP"), `survivor: ${next.stdout}`);
  return { durationMs: r.durationMs };
});

await check("timeout replaces the VM", async () => {
  const hung = await vm.run(py("while True: pass", 2_000), signal());
  assert(hung.timedOut, "did not time out");
  const next = await vm.run(
    { language: "bash", code: "cut -d. -f1 /proc/uptime" },
    signal(),
  );
  assert(Number(next.stdout) < 30, `uptime ${next.stdout}: not a fresh VM`);
});

await vm.run(
  {
    language: "bash",
    code: "echo leak > /root/marker; nohup sleep 1000 >/dev/null 2>&1 &",
  },
  signal(),
);
await vm.close();

await check("next turn sees no residue", async () => {
  const next = new TurnCodeVm(bootGondolinVm);
  try {
    const r = await next.run(
      {
        language: "bash",
        code: "test -e /root/marker && echo MARKER; pgrep -x sleep && echo SLEEP; true",
      },
      signal(),
    );
    assert(!/MARKER|SLEEP/.test(r.stdout), `residue: ${r.stdout}`);
  } finally {
    await next.close();
  }
});
