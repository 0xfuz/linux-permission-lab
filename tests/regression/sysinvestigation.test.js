/**
 * tests/regression/sysinvestigation.test.js  (v2.5)
 * End-to-end: the new system-investigation commands (ps, who/w, last/lastlog,
 * uname, df/du, ss/netstat, systemctl, journalctl, dmesg, getcap, crontab -l,
 * sudo -l) and the `find -perm` SUID/SGID audit, driven through the real
 * runCommand() via the DOM shim, exactly like tests/regression/terminal.test.js.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installDomShim, createContainer, outputText } from "../helpers/dom-shim.js";

installDomShim();
const { runCommand, resetTerminalState } = await import("../../assets/js/terminal.js");

function run(...cmds) {
  const c = createContainer();
  const outs = cmds.map((cmd) => {
    const before = c.children.length;
    runCommand(cmd, c);
    return outputText({ children: c.children.slice(before + 1) });
  });
  return outs.length === 1 ? outs[0] : outs;
}

beforeEach(() => resetTerminalState());

describe("ps", () => {
  test("plain ps shows only the current user's own session", () => {
    const out = run("ps");
    assert.doesNotMatch(out, /root/);
    assert.match(out, /-bash/);
  });
  test("ps aux shows every user and flags the CLI-secret leak", () => {
    const out = run("ps aux");
    assert.match(out, /root\s+2140/);
    assert.match(out, /--password Spring2024!/);
    assert.match(out, /visible here to every local user/);
  });
  test("ps -ef is accepted as an alias for the full table", () => {
    assert.match(run("ps -ef"), /metrics-agent --token/);
  });
});

describe("who / w", () => {
  test("who lists the three logged-in accounts", () => {
    const out = run("who");
    assert.match(out, /user\s+pts\/0/);
    assert.match(out, /alice\s+pts\/1/);
    assert.match(out, /root\s+pts\/2/);
  });
  test("w adds the load-average header and flags direct root SSH login", () => {
    const out = run("w");
    assert.match(out, /load average/);
    assert.match(out, /root has an active interactive session/);
  });
});

describe("last / lastlog", () => {
  test("last shows history, most recent first, with 'still logged in'", () => {
    const out = run("last");
    assert.match(out, /root.*still logged in/);
    assert.match(out, /reboot/);
  });
  test("last -n limits the row count", () => {
    const full = run("last").split("\n").length;
    const limited = run("last -n 2").split("\n").length;
    assert.ok(limited < full);
    assert.equal(limited, 2);
  });
  test("lastlog shows every known account, service accounts as 'Never logged in'", () => {
    const out = run("lastlog");
    assert.match(out, /monitoring\s+\*\*Never logged in\*\*/);
    assert.match(out, /www-data\s+\*\*Never logged in\*\*/);
    assert.match(out, /alice\s+pts\/1/);
  });
});

describe("uname / df / du", () => {
  test("uname -a includes hostname, kernel release and OS", () => {
    const out = run("uname -a");
    assert.match(out, /permission-lab/);
    assert.match(out, /Ubuntu/);
  });
  test("uname with no flags just prints the kernel name", () => {
    assert.equal(run("uname"), "Linux");
  });
  test("df lists mounts and flags the nearly-full /var/log", () => {
    const out = run("df");
    assert.match(out, /\/var\/log/);
    assert.match(out, /almost full/);
  });
  test("du -sh respects read permission, same as ls", () => {
    assert.match(run("du -sh /root"), /Permission denied/);
    assert.match(run("du -sh /etc"), /K\t\/etc|M\t\/etc/);
  });
  test("du on a path that doesn't exist fails cleanly", () => {
    assert.match(run("du -sh /nope"), /No such file or directory/);
  });
});

describe("ss / netstat", () => {
  test("as a regular user, process/PID is redacted for sockets you don't own", () => {
    const out = run("ss -tulpn");
    assert.match(out, /0\.0\.0\.0:22\s+-/);
    assert.match(out, /only shown for sockets you own/);
  });
  test("as root, every socket shows its owning process", () => {
    const out = run("sudo ss -tulpn");
    assert.match(out, /sshd/);
    assert.doesNotMatch(out, /only shown for sockets you own/);
  });
  test("flags the world-exposed Redis port but not the loopback-only MySQL one", () => {
    const out = run("ss -tulpn");
    assert.match(out, /Redis bound to ALL interfaces/);
    assert.match(out, /MySQL correctly bound to loopback/);
  });
  test("netstat is an alias for the same view", () => {
    assert.equal(run("netstat -tulpn"), run("ss -tulpn"));
  });
});

describe("systemctl", () => {
  test("status shows an active unit and a failed one distinctly", () => {
    assert.match(run("systemctl status nginx"), /Active: active \(running\)/);
    assert.match(run("systemctl status unattended-upgrades"), /Active: failed \(failed\)/);
  });
  test("accepts the bare service name or the full unit name", () => {
    assert.equal(run("systemctl status cron"), run("systemctl status cron.service"));
  });
  test("unknown unit is a clear error", () => {
    assert.match(run("systemctl status not-a-real-service"), /could not be found/);
  });
  test("list-units shows every service, including the disabled fail2ban", () => {
    const out = run("systemctl list-units");
    assert.match(out, /fail2ban\.service\s+loaded\s+inactive/);
  });
});

describe("journalctl / dmesg — gated like /var/log/auth.log", () => {
  test("a plain user (not in adm) is refused", () => {
    const out = run("journalctl");
    assert.match(out, /Failed to acquire journal access/);
    assert.match(out, /'adm' group/);
  });
  test("alice (adm) and root can both read it", () => {
    run("su alice");
    assert.doesNotMatch(run("journalctl -n 1"), /Failed to acquire/);
    run("exit");
    assert.doesNotMatch(run("sudo journalctl -n 1"), /Failed to acquire/);
  });
  test("-u filters to one unit's events", () => {
    const out = run("sudo journalctl -u cron");
    assert.match(out, /cron\.service/);
    assert.doesNotMatch(out, /sshd\.service/);
  });
  test("dmesg is root-only even for adm members, citing dmesg_restrict", () => {
    run("su alice");
    const out = run("dmesg");
    assert.match(out, /Operation not permitted/);
    assert.match(out, /dmesg_restrict/);
    run("exit");
    assert.match(run("sudo dmesg"), /segfault/);
  });
});

describe("getcap", () => {
  test("lists all three capability entries and flags the SUID-blind-spot one", () => {
    const out = run("getcap -r /");
    assert.match(out, /python3\.11 cap_setuid/);
    assert.match(out, /NOT expected/);
    assert.match(out, /invisible to a `find -perm -4000` SUID sweep/);
  });
});

describe("crontab -l", () => {
  test("shows the current user's own schedule", () => {
    const out = run("crontab -l");
    assert.match(out, /sync_notes\.sh/);
    assert.doesNotMatch(out, /personal cron schedule/, "only the raw line, not the prose explanation");
  });
  test("a user with no crontab gets a clean message", () => {
    run("su monitoring");
    assert.match(run("crontab -l"), /no crontab for monitoring/);
  });
  test("-u is root-only; a non-root user is refused with the real reasoning", () => {
    const out = run("crontab -u alice -l");
    assert.match(out, /must be root/);
    run("su alice");
    assert.match(run("crontab -l"), /nightly_build\.sh/);
  });
  test("root can list any known user's crontab via -u, including one with none (root's)", () => {
    assert.match(run("sudo crontab -u alice -l"), /nightly_build\.sh/);
    assert.match(run("sudo crontab -u root -l"), /no crontab for root/);
  });
  test("unknown user is an error", () => {
    assert.match(run("sudo crontab -u ghost -l"), /unknown/);
  });
});

describe("sudo -l", () => {
  test("a sudo-group member sees the ALL:ALL grant and why", () => {
    const out = run("sudo -l");
    assert.match(out, /\(ALL : ALL\) ALL/);
    assert.match(out, /'user' is in: user, sudo/);
  });
  test("a non-sudoer gets the real 'not in the sudoers file' line, not a crash", () => {
    run("su alice");
    assert.match(run("sudo -l"), /alice may not run sudo/);
  });
});

describe("find -perm (SUID/SGID audit)", () => {
  test("-4000 finds every SUID binary and nothing else, as root", () => {
    const out = run("sudo find / -perm -4000");
    assert.match(out, /4755\s+\/usr\/bin\/sudo/);
    assert.match(out, /4755\s+\/usr\/bin\/su/);
    assert.match(out, /4750\s+\/usr\/sbin\/useradd/);
    assert.doesNotMatch(out, /\/usr\/local\/bin\/deploy\.sh/, "750, no SUID bit");
  });
  test("-2000 (SGID) and /6000 (either) behave like real find", () => {
    const sgid = run("sudo find / -perm -2000");
    assert.match(sgid, /\/opt\/app\/shared/);
    const either = run("sudo find / -perm /6000");
    assert.match(either, /\/usr\/bin\/sudo/);
    assert.match(either, /\/opt\/app\/shared/);
  });
  test("-type d / -type f narrow the match", () => {
    const dirsOnly = run("sudo find / -perm -2000 -type f");
    assert.doesNotMatch(dirsOnly, /\/opt\/app\/shared$/m);
  });
  test("a plain user doesn't see SUID binaries behind directories they can't enter, and gets told why", () => {
    const out = run("find / -perm -4000");
    assert.match(out, /Permission denied/);
  });
  test("an invalid mode is a usage error, not a silent empty result", () => {
    assert.match(run("find / -perm 9999"), /usage: find/);
  });
  test("plain `find <name>` is completely unaffected by the new -perm branch", () => {
    assert.match(run("find shadow"), /\/etc\/shadow/);
  });
});

describe("find -name (real find syntax)", () => {
  test("finds the same matches as the bare shorthand, scoped to the given path", () => {
    const out = run("sudo find / -name shadow");
    assert.match(out, /\/etc\/shadow/);
    assert.match(out, /\/etc\/gshadow/);
  });
  test("a path argument narrows the search, same as -perm does", () => {
    const narrow = run("sudo find /home -name shadow");
    assert.doesNotMatch(narrow, /\/etc\/shadow/);
    const wide = run("sudo find /etc -name shadow");
    assert.match(wide, /\/etc\/shadow/);
  });
  test("-type f / -type d narrow the match, same as -perm's -type", () => {
    const filesOnly = run("sudo find /etc -name shadow -type d");
    assert.doesNotMatch(filesOnly, /\/etc\/shadow/);
  });
  test("respects visibility — a plain user doesn't see into directories they can't enter", () => {
    const out = run("find /root -name root_notes");
    assert.match(out, /Permission denied/);
  });
  test("missing pattern is a usage error", () => {
    assert.match(run("find / -name"), /usage: find/);
  });
  test("bad path is a clean error, not a crash", () => {
    assert.match(run("find /nope -name shadow"), /No such file or directory/);
  });
});
