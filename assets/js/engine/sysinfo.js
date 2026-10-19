/**
 * engine/sysinfo.js  (v2.5)
 * Pure, DOM-free "the rest of the box" — the system state a Linux admin or
 * blue-team analyst checks that ISN'T a file on disk: running processes,
 * logged-in sessions, systemd units, listening sockets, the journal, and
 * disk usage. Everything here is static fixture data plus small pure
 * filters; terminal.js turns it into HTML the same way it does for the
 * filesystem (escapeHTML at every interpolation site).
 *
 * This module intentionally does NOT import filesystem.js or users.js at
 * its top level beyond what's listed below — keeping it a leaf module
 * avoids any import-cycle risk with engine/users.js (which imports
 * filesystem.js). sudo -l and crontab -l are deliberately NOT modeled here:
 * sudo -l is just a view over engine/users.js's existing canSudo() rule, and
 * crontab -l is just a view over the per-user crontab FILES already in the
 * tree (/var/spool/cron/crontabs/<user>) — see terminal.js. Duplicating that
 * state here would let the two views drift out of sync.
 *
 * Two command-line leaks are planted on purpose (ps aux and the world-readable
 * /etc/cron.d/backup-job both reveal the SAME backup password) — a realistic,
 * very common real-world finding: secrets passed as CLI arguments are visible
 * to every local user, via two independent enumeration techniques. Nothing
 * here is wired up as an actual escalation path yet — this release is
 * enumeration/investigation only, by design.
 */

/* ------------------------------- identity -------------------------------- */

export const SYSTEM_INFO = {
  hostname: "permission-lab",
  kernel: "Linux",
  release: "6.8.0-45-generic",
  version: "#45-Ubuntu SMP PREEMPT_DYNAMIC Mon Jun 2 12:00:00 UTC 2026",
  machine: "x86_64",
  os: "Ubuntu 24.04.2 LTS",
  uptime: "up 14 days, 3 hours, 52 minutes",
  loadAvg: "0.08, 0.12, 0.09",
};

/* ------------------------------- processes -------------------------------- */

/**
 * `ps aux`-style table. One entry (pid 2140) intentionally leaks a backup
 * password on its command line — a classic, very common real-world mistake:
 * any local user can read another user's full command line via /proc or ps,
 * secrets included. A second entry (pid 2141) leaks a monitoring API token
 * the same way, so a learner sees the pattern twice, not as a one-off.
 */
export const PROCESSES = [
  { pid: 1, user: "root", cpu: "0.0", mem: "0.1", vsz: 169000, rss: 11800, tty: "?", stat: "Ss", start: "Sep27", time: "0:12", cmd: "/sbin/init" },
  { pid: 598, user: "root", cpu: "0.0", mem: "0.2", vsz: 15950, rss: 9200, tty: "?", stat: "Ss", start: "Sep27", time: "0:04", cmd: "/usr/sbin/sshd -D" },
  { pid: 611, user: "root", cpu: "0.0", mem: "0.1", vsz: 9200, rss: 3400, tty: "?", stat: "Ss", start: "Sep27", time: "0:00", cmd: "/usr/sbin/cron -f" },
  { pid: 614, user: "root", cpu: "0.0", mem: "0.2", vsz: 223100, rss: 8700, tty: "?", stat: "Ssl", start: "Sep27", time: "0:21", cmd: "/usr/sbin/rsyslogd -n" },
  { pid: 619, user: "root", cpu: "0.0", mem: "0.1", vsz: 70300, rss: 5100, tty: "?", stat: "Ss", start: "Sep27", time: "0:02", cmd: "/usr/sbin/auditd" },
  { pid: 820, user: "root", cpu: "0.0", mem: "0.3", vsz: 55600, rss: 3600, tty: "?", stat: "Ss", start: "Sep27", time: "0:00", cmd: "nginx: master process /usr/sbin/nginx" },
  { pid: 821, user: "www-data", cpu: "0.0", mem: "0.4", vsz: 56200, rss: 4800, tty: "?", stat: "S", start: "Sep27", time: "0:03", cmd: "nginx: worker process" },
  { pid: 822, user: "www-data", cpu: "0.0", mem: "0.4", vsz: 56200, rss: 4800, tty: "?", stat: "S", start: "Sep27", time: "0:03", cmd: "nginx: worker process" },
  { pid: 1104, user: "deployer", cpu: "0.1", mem: "0.6", vsz: 412300, rss: 18200, tty: "?", stat: "Sl", start: "Sep27", time: "3:10", cmd: "/usr/bin/python3 /opt/app/bin/agent.py --config /opt/app/config/app.yml" },
  { pid: 1402, user: "monitoring", cpu: "0.0", mem: "0.3", vsz: 98500, rss: 7600, tty: "?", stat: "Sl", start: "Sep27", time: "1:47", cmd: "/usr/local/bin/metrics-agent --token 8f3e2b9c1a7d4f60 --interval 30" },
  { pid: 2001, user: "user", cpu: "0.0", mem: "0.2", vsz: 8400, rss: 5200, tty: "pts/0", stat: "Ss", start: "09:14", time: "0:00", cmd: "-bash" },
  { pid: 2050, user: "alice", cpu: "0.0", mem: "0.2", vsz: 8400, rss: 5300, tty: "pts/1", stat: "Ss", start: "09:20", time: "0:00", cmd: "-bash" },
  { pid: 2140, user: "root", cpu: "0.0", mem: "0.1", vsz: 6100, rss: 2200, tty: "?", stat: "S", start: "03:30", time: "0:00",
    cmd: "/bin/bash /opt/app/bin/nightly_backup.sh --db app_db --user backup_svc --password Spring2024!" },
];

/** Real `ps` (no flags) only shows processes attached to the CURRENT session. */
export const myProcesses = (user, cmdName) => [
  ...PROCESSES.filter((p) => p.user === user && p.tty !== "?"),
  { pid: 9000 + Math.abs(hashStr(user)) % 900, user, cpu: "0.0", mem: "0.0", vsz: 7200, rss: 1100,
    tty: PROCESSES.find((p) => p.user === user && p.tty !== "?")?.tty || "pts/9", stat: "R+", start: "now", time: "0:00", cmd: cmdName },
];
function hashStr(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

/* ------------------------------ systemd units ------------------------------ */

export const SERVICES = [
  { name: "ssh.service", load: "loaded", active: "active", sub: "running", desc: "OpenBSD Secure Shell server" },
  { name: "cron.service", load: "loaded", active: "active", sub: "running", desc: "Regular background program processing daemon" },
  { name: "rsyslog.service", load: "loaded", active: "active", sub: "running", desc: "System Logging Service" },
  { name: "nginx.service", load: "loaded", active: "active", sub: "running", desc: "A high performance web server" },
  { name: "auditd.service", load: "loaded", active: "active", sub: "running", desc: "Security Auditing Service" },
  { name: "app-agent.service", load: "loaded", active: "active", sub: "running", desc: "Internal application agent (deployer)" },
  { name: "metrics-agent.service", load: "loaded", active: "active", sub: "running", desc: "Monitoring metrics exporter" },
  { name: "fail2ban.service", load: "loaded", active: "inactive", sub: "dead", desc: "Fail2Ban Service — brute-force ban daemon (installed, never enabled)" },
  { name: "unattended-upgrades.service", load: "loaded", active: "failed", sub: "failed", desc: "Unattended Upgrades Shutdown — last run failed, security patches are stale" },
];

/* -------------------------------- sockets --------------------------------- */

/**
 * `ss -tulpn` style. `restricted` marks a socket whose owning process a
 * non-root, non-owning viewer would NOT get PID/program details for — real
 * `ss`/`netstat` show "-" there without root, which this module models via
 * visibleSocketOwner() rather than baking the redaction into the data.
 */
export const SOCKETS = [
  { proto: "tcp", local: "0.0.0.0:22", state: "LISTEN", program: "sshd", pid: 598, owner: "root" },
  { proto: "tcp", local: "0.0.0.0:80", state: "LISTEN", program: "nginx", pid: 820, owner: "root" },
  { proto: "tcp", local: "127.0.0.1:3306", state: "LISTEN", program: "mysqld", pid: 1500, owner: "root",
    note: "MySQL correctly bound to loopback only — not reachable from the network." },
  { proto: "tcp", local: "0.0.0.0:6379", state: "LISTEN", program: "redis-server", pid: 1620, owner: "root",
    note: "Redis bound to ALL interfaces with no auth configured — should be 127.0.0.1 unless clustered behind a firewall." },
  { proto: "tcp", local: "0.0.0.0:9100", state: "LISTEN", program: "metrics-agent", pid: 1402, owner: "monitoring" },
  { proto: "udp", local: "0.0.0.0:68", state: "UNCONN", program: "dhclient", pid: 480, owner: "root" },
];

/* ---------------------------- log / journal events -------------------------- */

/**
 * One timeline, several views. `source` says which real-world file/subsystem
 * an event would appear in: "auth" -> /var/log/auth.log, "syslog" -> /var/log/syslog,
 * "kernel" -> dmesg, "cron" -> cron run lines (syslog + journalctl -u cron).
 * `unit` is what `journalctl -u <unit>` filters on. journalctl with no -u
 * shows everything (that's what journald actually aggregates).
 */
export const LOG_EVENTS = [
  { ts: "Oct 09 03:00:01", source: "cron", unit: "cron.service", msg: "(root) CMD (/opt/app/bin/nightly_backup.sh --db app_db --user backup_svc --password Spring2024!)" },
  { ts: "Oct 09 03:00:04", source: "syslog", unit: "nightly_backup", msg: "nightly_backup.sh: dump of app_db completed, 842MB written to /home/user/backup.sql" },
  { ts: "Oct 09 06:25:01", source: "cron", unit: "cron.service", msg: "(root) CMD (test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily ))" },
  { ts: "Oct 09 08:58:11", source: "auth", unit: "sshd.service", msg: "Failed password for invalid user admin from 203.0.113.44 port 51022 ssh2" },
  { ts: "Oct 09 08:58:14", source: "auth", unit: "sshd.service", msg: "Failed password for invalid user admin from 203.0.113.44 port 51030 ssh2" },
  { ts: "Oct 09 08:58:17", source: "auth", unit: "sshd.service", msg: "Failed password for root from 203.0.113.44 port 51044 ssh2" },
  { ts: "Oct 09 08:58:21", source: "auth", unit: "sshd.service", msg: "Failed password for root from 203.0.113.44 port 51050 ssh2" },
  { ts: "Oct 09 08:58:26", source: "auth", unit: "sshd.service", msg: "Failed password for root from 203.0.113.44 port 51061 ssh2" },
  { ts: "Oct 09 08:58:30", source: "auth", unit: "sshd.service", msg: "pam_unix(sshd:auth): check pass; 5 failed login attempts from 203.0.113.44 — consider fail2ban (currently inactive)" },
  { ts: "Oct 09 09:14:02", source: "auth", unit: "sshd.service", msg: "Accepted password for user from 198.51.100.7 port 55210 ssh2" },
  { ts: "Oct 09 09:14:02", source: "auth", unit: "systemd-logind", msg: "New session 41 of user user." },
  { ts: "Oct 09 09:20:47", source: "auth", unit: "sshd.service", msg: "Accepted publickey for alice from 198.51.100.9 port 55302 ssh2: RSA SHA256:3f9a..." },
  { ts: "Oct 09 09:21:03", source: "auth", unit: "sudo", msg: "   user : TTY=pts/0 ; PWD=/home/user ; USER=root ; COMMAND=/usr/bin/whoami" },
  { ts: "Oct 09 09:31:55", source: "auth", unit: "sshd.service", msg: "Accepted password for root from 198.51.100.20 port 55390 ssh2", note: "root logging in directly over SSH — best practice is to disable PermitRootLogin and require sudo from a named account instead." },
  { ts: "Oct 09 09:40:12", source: "syslog", unit: "metrics-agent.service", msg: "metrics-agent: scrape OK (14 targets, 212ms)" },
  { ts: "Oct 09 10:02:00", source: "syslog", unit: "unattended-upgrades.service", msg: "Unattended-upgrade failed: could not reach security.ubuntu.com (dns resolution failure)" },
  { ts: "Oct 09 10:15:30", source: "kernel", unit: "kernel", msg: "[14724.829384] nginx[821]: segfault at 0 ip 00007f2a3c0012b1 sp 00007fff2b3a9c40 error 4" },
  { ts: "Oct 09 10:15:31", source: "syslog", unit: "nginx.service", msg: "nginx worker process 821 exited on signal 11, respawning" },
  { ts: "Oct 09 10:30:00", source: "kernel", unit: "kernel", msg: "[15650.210552] audit: type=1400 apparmor=\"STATUS\" operation=\"profile_load\" profile=\"unconfined\" name=\"/usr/sbin/nginx\"" },
];

/* ------------------------------ login sessions ----------------------------- */

/** `who` / `w` — currently logged in. */
export const LOGIN_SESSIONS = [
  { user: "user", tty: "pts/0", from: "198.51.100.7", loginAt: "09:14", idle: "0.00s", what: "-bash" },
  { user: "alice", tty: "pts/1", from: "198.51.100.9", loginAt: "09:20", idle: "2:10", what: "-bash" },
  { user: "root", tty: "pts/2", from: "198.51.100.20", loginAt: "09:31", idle: "0.00s", what: "-bash",
    note: "root has an active interactive session over SSH — see the auth log note on the same login." },
];

/** `last` — historical login records, most recent first. */
export const LOGIN_HISTORY = [
  { user: "root", tty: "pts/2", from: "198.51.100.20", start: "Oct 09 09:31", still: true },
  { user: "alice", tty: "pts/1", from: "198.51.100.9", start: "Oct 09 09:20", still: true },
  { user: "user", tty: "pts/0", from: "198.51.100.7", start: "Oct 09 09:14", still: true },
  { user: "user", tty: "pts/0", from: "198.51.100.7", start: "Oct 08 17:02", duration: "01:14" },
  { user: "alice", tty: "pts/1", from: "198.51.100.9", start: "Oct 07 11:40", duration: "00:38" },
  { user: "reboot", tty: "system boot", from: "6.8.0-45-generic", start: "Sep 27 07:58", duration: "14+02:10" },
  { user: "deployer", tty: "pts/3", from: "203.0.113.9", start: "Sep 26 22:05", duration: "00:04" },
];

/** `lastlog` — one row per known account (service accounts never log in interactively). */
export function buildLastlog(userNames) {
  const latestFor = (name) => LOGIN_HISTORY.find((h) => h.user === name);
  return userNames.map((name) => {
    const hit = latestFor(name);
    return hit ? { user: name, tty: hit.tty, from: hit.from, when: hit.start } : { user: name, never: true };
  });
}

/* ------------------------------ capabilities ------------------------------- */

/**
 * `getcap -r /` — Linux capabilities, the modern alternative to the SUID bit:
 * a binary can be granted ONE specific root-ish privilege instead of full
 * root. The teaching point: an audit that only runs `find / -perm -4000`
 * (SUID) misses every one of these — capabilities live in extended file
 * attributes, not the permission bits, so they need their own check.
 * cap_net_raw/cap_net_bind_service below are normal, expected hardening
 * (the modern replacement for SUID ping / SUID webservers). The python3.11
 * entry is the planted misconfiguration: a general-purpose interpreter with
 * cap_setuid+eip can set its OWN uid to 0 from inside any script it runs —
 * equivalent to full root, on a binary nobody thinks to lock down because
 * it "isn't SUID".
 */
export const CAPABILITIES = [
  { path: "/usr/bin/ping", caps: "cap_net_raw=ep", note: "Expected — lets ping open raw ICMP sockets without being SUID root." },
  { path: "/opt/app/bin/health-check", caps: "cap_net_bind_service=ep", note: "Expected — lets the health-check listener bind port 443 without running as root." },
  { path: "/usr/bin/python3.11", caps: "cap_setuid+eip",
    note: "NOT expected. cap_setuid lets this binary set its process uid to 0 — functionally equivalent to SUID root, but invisible to a `find -perm -4000` SUID sweep and easy to miss because 'it's just the interpreter'. Anyone who can run python3.11 can call os.setuid(0) and be root." },
];

/* -------------------------------- disk usage ------------------------------- */

export const DISK_USAGE = [
  { fs: "/dev/sda1", size: "20G", used: "11G", avail: "8.2G", usePct: "58%", on: "/" },
  { fs: "/dev/sda2", size: "97G", used: "61G", avail: "31G", usePct: "67%", on: "/home" },
  { fs: "tmpfs", size: "1.9G", used: "1.1M", avail: "1.9G", usePct: "1%", on: "/run" },
  { fs: "/dev/sdb1", size: "200G", used: "188G", avail: "2.1G", usePct: "99%", on: "/var/log",
    note: "/var/log is almost full — on a real box this risks silently dropping new audit/auth events." },
];

/* --------------------------------- filters --------------------------------- */

/** journalctl's matching rules: -u <unit> (substring, case-insensitive), -n <N> tail. */
export function filterJournal({ unit, lines } = {}) {
  let rows = LOG_EVENTS;
  if (unit) rows = rows.filter((e) => e.unit.toLowerCase().includes(String(unit).toLowerCase()));
  if (lines) rows = rows.slice(-Math.abs(Number(lines)));
  return rows;
}

export const dmesgLines = () => LOG_EVENTS.filter((e) => e.source === "kernel");
export const authLogLines = () => LOG_EVENTS.filter((e) => e.source === "auth");
export const syslogLines = () => LOG_EVENTS.filter((e) => e.source === "syslog" || e.source === "cron");
