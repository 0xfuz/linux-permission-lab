/**
 * tests/engine/sysinfo.test.js
 * engine/sysinfo.js — static system-investigation data plus the few pure
 * filters built on it. Mostly data-integrity checks (every array shape is
 * right, the planted findings are internally consistent) plus the two real
 * functions: filterJournal and buildLastlog.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SYSTEM_INFO, PROCESSES, myProcesses, SERVICES, SOCKETS, CAPABILITIES, DISK_USAGE,
  LOGIN_SESSIONS, LOGIN_HISTORY, buildLastlog, filterJournal, dmesgLines, authLogLines, syslogLines,
} from "../../assets/js/engine/sysinfo.js";

describe("data integrity", () => {
  test("every process has a non-empty user, positive pid, and a command", () => {
    for (const p of PROCESSES) {
      assert.ok(p.user && p.user.length, "missing user");
      assert.ok(Number.isInteger(p.pid) && p.pid > 0, `bad pid for ${p.cmd}`);
      assert.ok(p.cmd && p.cmd.length, "missing cmd");
    }
  });
  test("pids are unique", () => {
    const pids = PROCESSES.map((p) => p.pid);
    assert.equal(new Set(pids).size, pids.length);
  });
  test("the two planted CLI-secret leaks exist and share the same style of mistake", () => {
    const backup = PROCESSES.find((p) => p.pid === 2140);
    const metrics = PROCESSES.find((p) => p.pid === 1402);
    assert.match(backup.cmd, /--password\s+\S+/);
    assert.match(metrics.cmd, /--token\s+\S+/);
  });
  test("services have a known active state", () => {
    for (const s of SERVICES) assert.ok(["active", "inactive", "failed"].includes(s.active), s.name);
    assert.ok(SERVICES.some((s) => s.active === "failed"), "at least one failed unit for systemctl to flag");
  });
  test("sockets: every LISTEN entry has a local address with a port", () => {
    for (const s of SOCKETS) assert.match(s.local, /:\d+$/, s.local);
  });
  test("capabilities: the planted python3.11 finding is flagged as unexpected, the others aren't", () => {
    const py = CAPABILITIES.find((c) => c.path.includes("python3.11"));
    assert.match(py.caps, /cap_setuid/);
    assert.match(py.note, /NOT expected/);
    const ping = CAPABILITIES.find((c) => c.path.includes("ping"));
    assert.match(ping.note, /Expected/);
  });
  test("disk usage rows all have a mount point and a use percentage", () => {
    for (const d of DISK_USAGE) { assert.ok(d.on.startsWith("/")); assert.match(d.usePct, /^\d+%$/); }
  });
  test("login sessions and history reference only known-shape fields", () => {
    for (const s of LOGIN_SESSIONS) { assert.ok(s.user); assert.ok(s.tty); assert.ok(s.from); }
    assert.ok(LOGIN_HISTORY.some((h) => h.still === true), "at least one still-logged-in row");
    assert.ok(LOGIN_HISTORY.some((h) => h.user === "reboot"), "a reboot row, like real `last`");
  });
});

describe("myProcesses (plain `ps`, no flags)", () => {
  test("only returns rows for the given user, plus the invoked command itself", () => {
    const rows = myProcesses("alice", "ps");
    assert.ok(rows.every((r) => r.user === "alice"));
    assert.ok(rows.some((r) => r.cmd === "ps"));
  });
  test("is deterministic for the same user (stable pid for the synthetic row)", () => {
    const a = myProcesses("user", "ps");
    const b = myProcesses("user", "ps");
    assert.equal(a[a.length - 1].pid, b[b.length - 1].pid);
  });
});

describe("journal filters", () => {
  test("no filter returns the full timeline", () => {
    assert.equal(filterJournal({}).length, filterJournal().length);
  });
  test("-u filters by unit, case-insensitively, by substring", () => {
    const rows = filterJournal({ unit: "SSHD" });
    assert.ok(rows.length > 0);
    assert.ok(rows.every((e) => e.unit.toLowerCase().includes("sshd")));
  });
  test("-n tails the LAST n entries, preserving order", () => {
    const all = filterJournal({});
    const tail = filterJournal({ lines: 3 });
    assert.deepEqual(tail, all.slice(-3));
  });
  test("dmesg/auth/syslog views partition the same timeline by source", () => {
    assert.ok(dmesgLines().every((e) => e.source === "kernel"));
    assert.ok(authLogLines().every((e) => e.source === "auth"));
    assert.ok(syslogLines().every((e) => e.source === "syslog" || e.source === "cron"));
    assert.ok(dmesgLines().length > 0 && authLogLines().length > 0 && syslogLines().length > 0);
  });
});

describe("buildLastlog", () => {
  test("a user with history gets their most recent entry; a service account gets 'never'", () => {
    const rows = buildLastlog(["user", "monitoring"]);
    const user = rows.find((r) => r.user === "user");
    const monitoring = rows.find((r) => r.user === "monitoring");
    assert.ok(user.when && !user.never);
    assert.equal(monitoring.never, true);
  });
});
