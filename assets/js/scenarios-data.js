/**
 * scenarios-data.js  (v2.12)
 * Terminal-based challenges and Investigation Mode scenarios. Unlike the 88
 * Challenges (which grade a typed octal answer), every scenario here is
 * graded by the SIMULATED STATE: the learner works in the real terminal, and
 * `checks` ask the access engine what each account can now do.
 *
 * Authoring a challenge → see "Authoring scenarios" in README.md.
 *
 * Shape (challenge):
 *   { id, kind: "challenge", xp, title, objectives[], task, hints[] (least → most revealing),
 *     build() → fresh nodes under /srv/lab/<id>, [users], [startAs], [startDir],
 *     checks[] (engine/scenario.js helpers), completion }
 * Shape (investigation): the same plus incident, evidence[], diagnoses[],
 *   hints{ evidence[], diagnosis[], remediation[], verification[] }, verify(ev), summarize(ctx).
 * Arabic text lives in scenarios-data.ar.js, keyed by id.
 */
import { FS_TREE, findNode } from "./filesystem.js";
import { checkTraverse, checkPathAccess, explainAccess, explainTraverse, classify, getUser, formatId, modeTriads } from "./engine/users.js";
import {
  file, dir, canAccess, cannotAccess, othersCannot, modeWithin, accessWithin, noWorldWriteUnder, custom,
} from "./engine/scenario.js";

const B = (id) => `/srv/lab/${id}`;

/* ------------------------------------------------------------------ tc01 */
const TC01 = B("tc01");
const tc01 = {
  id: "tc01", kind: "challenge", xp: 75,
  title: "Lock down a leaked deploy key",
  objectives: [
    "Read a file's mode and owner from ls -l and stat",
    "Explain why the group and others bits matter for a credential",
    "Apply the smallest change that protects the key without breaking its owner",
  ],
  task: "The private key deploy_key in /srv/lab/tc01 can be read by every account on the machine. Make it usable by its owner (user) only: no other account may read or modify it.",
  build: () => [
    file("deploy_key", "644", { sensitive: true, note: "Private deploy key." }),
    file("deploy_key.pub", "644", { note: "Matching public key." }),
  ],
  checks: [
    canAccess("owner-reads", "user", `${TC01}/deploy_key`, "r", { label: "The owner (user) can still read the key" }),
    othersCannot("others-read", `${TC01}/deploy_key`, "r", ["user"], { label: "No other account can read the key" }),
    othersCannot("others-write", `${TC01}/deploy_key`, "w", ["user"], { label: "No other account can modify the key" }),
    noWorldWriteUnder("no-world-write", TC01, { label: "Nothing in the lab directory is world-writable" }),
  ],
  hints: [
    "Run ls -l in the directory and compare the mode of deploy_key with the mode of deploy_key.pub.",
    "A private key only ever needs to be used by its owner. Which of the three octal digits (owner, group, others) should be zero?",
    "Owner read+write is 6; nothing for group and others is 00. Try chmod 600 deploy_key (400 also works if you never rewrite the key), then run ls -l again.",
  ],
  completion: "The group and others bits decide what every OTHER account can do. A private key is a credential, so only its owner needs access: removing every group/other bit is the least-privilege fix. 600 (or 400) does that without breaking the owner — 644 leaks the key and 777 would also let anyone replace it.",
};

/* ------------------------------------------------------------------ tc02 */
const TC02 = B("tc02");
const tc02 = {
  id: "tc02", kind: "challenge", xp: 75,
  title: "Listing works, reading doesn't",
  objectives: [
    "Tell read (r) from search/execute (x) on a directory",
    "Follow a 'Permission denied' to the exact directory that caused it",
    "Grant the missing bit without making anything writable",
  ],
  task: "Published reports live in /srv/lab/tc02/reports. As alice (su alice), ls /srv/lab/tc02/reports works but cat /srv/lab/tc02/reports/q3.txt is denied. Make q3.txt readable for alice while keeping the directory and file non-writable for everyone except the owner.",
  build: () => [
    dir("reports", "744", [
      file("q3.txt", "644", { note: "Quarterly report." }),
    ]),
  ],
  checks: [
    canAccess("alice-reads", "alice", `${TC02}/reports/q3.txt`, "r", { label: "alice can read q3.txt" }),
    othersCannot("dir-write", `${TC02}/reports`, "w", ["user"], { label: "Nobody except the owner can write to the reports directory" }),
    othersCannot("file-write", `${TC02}/reports/q3.txt`, "w", ["user"], { label: "Nobody except the owner can modify q3.txt" }),
    noWorldWriteUnder("no-world-write", TC02, { label: "Nothing in the lab directory is world-writable" }),
  ],
  hints: [
    "Switch to alice with su alice and run both commands. Read the hint line under the error: which directory does it name?",
    "On a directory, r lets you list the names inside; x (search) lets you pass through it to reach anything beneath. Compare the 'others' digit of reports with what alice needs.",
    "The others digit of reports is 4 (r--) — it needs the x bit too. As the owner, chmod 755 reports works; chmod 745 is the smallest change that adds only the missing bit.",
  ],
  completion: "Reaching a file needs x on every directory above it; r on a directory only lets you list names. Here the directory had r but no x, so ls worked while cat failed. Adding the missing x (not w) fixes it — chmod 777 would also 'work' but lets every account add, replace and delete reports.",
};

/* ------------------------------------------------------------------ tc03 */
const TC03 = B("tc03");
const tc03 = {
  id: "tc03", kind: "challenge", xp: 100,
  title: "The wrong group on a shared report",
  objectives: [
    "Compare an account's group memberships (id, groups) with a file's owning group",
    "Choose between changing the group and granting one named ACL entry",
    "Avoid widening access to accounts that don't need it",
  ],
  task: "alice needs read-only access to /srv/lab/tc03/report.txt. It is currently owned by user:user with mode 640. monitoring and www-data must stay locked out, and nobody but the owner may write to it.",
  build: () => [
    file("report.txt", "640", { sensitive: true, note: "Internal report." }),
  ],
  checks: [
    canAccess("alice-reads", "alice", `${TC03}/report.txt`, "r", { label: "alice can read report.txt" }),
    cannotAccess("alice-no-write", "alice", `${TC03}/report.txt`, "w", { label: "alice cannot modify report.txt (read-only is enough)" }),
    cannotAccess("monitoring-denied", "monitoring", `${TC03}/report.txt`, "r", { label: "monitoring still cannot read it" }),
    cannotAccess("www-denied", "www-data", `${TC03}/report.txt`, "r", { label: "www-data still cannot read it" }),
    othersCannot("others-write", `${TC03}/report.txt`, "w", ["user"], { label: "Nobody except the owner can write to it" }),
  ],
  hints: [
    "Run id alice and ls -l report.txt. Which group is the file in, and is alice a member of it?",
    "alice is not in the file's group, so the 'others' bits (---) apply to her. There are two least-privilege options: move the file to a group alice IS in, or give only alice an extra entry.",
    "Either sudo chgrp adm report.txt (alice is in adm; the mode 640 then gives the group read), or setfacl -m u:alice:r-- report.txt. Avoid chmod 644 — it also opens the file to monitoring and www-data.",
  ],
  completion: "Access is decided by the FIRST matching class: owner, named ACL user, group, then others. alice matched none of the first three. You can fix that by changing the file's group to one she belongs to (needs sudo, because 'user' isn't in adm) or by adding a single named ACL entry — both grant exactly one account read access. Widening 'others' would have fixed alice but exposed the report to everyone.",
};

/* ------------------------------------------------------------------ tc04 */
const TC04 = B("tc04");
const tc04 = {
  id: "tc04", kind: "challenge", xp: 125,
  title: "ACL on the file, but still denied",
  objectives: [
    "Read getfacl output on a file and on its directory",
    "Understand that a file ACL is not enough without search access on every parent directory",
    "Add a named ACL entry with only the bit that is missing",
  ],
  task: "The monitoring account was given read access to /srv/lab/tc04/conf/app.yml with an ACL entry, yet su monitoring then cat /srv/lab/tc04/conf/app.yml still fails. Fix it for monitoring only — nobody else may gain access, and monitoring must not be able to write or to list the directory.",
  build: () => [
    dir("conf", "750", [
      file("app.yml", "640", { sensitive: true, acl: [{ type: "user", id: "monitoring", perms: "r--" }], note: "App configuration." }),
      file("secrets.yml", "600", { sensitive: true, note: "Credentials." }),
    ]),
  ],
  checks: [
    canAccess("monitoring-reads", "monitoring", `${TC04}/conf/app.yml`, "r", { label: "monitoring can read app.yml" }),
    cannotAccess("monitoring-no-write", "monitoring", `${TC04}/conf/app.yml`, "w", { label: "monitoring cannot modify app.yml" }),
    cannotAccess("www-denied", "www-data", `${TC04}/conf/app.yml`, "r", { label: "www-data still cannot read app.yml" }),
    cannotAccess("secrets-denied", "monitoring", `${TC04}/conf/secrets.yml`, "r", { label: "monitoring still cannot read secrets.yml" }),
    noWorldWriteUnder("no-world-write", TC04, { label: "Nothing in the lab directory is world-writable" }),
    cannotAccess("no-dir-write", "monitoring", `${TC04}/conf`, "w", { label: "monitoring cannot create or delete files in the directory" }),
    cannotAccess("no-listing", "monitoring", `${TC04}/conf`, "r", { level: "advisory", label: "monitoring can reach the file but not list the directory" }),
    modeWithin("dir-not-widened", `${TC04}/conf`, "750", { level: "advisory", label: "The directory's own mode was not widened (still 750 or tighter)" }),
  ],
  hints: [
    "As monitoring, run cat /srv/lab/tc04/conf/app.yml and read the hint line: does it name the file or a directory?",
    "A file ACL only answers 'what may this account do to the file'. Reaching it needs x on every directory above. Run getfacl on both the file and /srv/lab/tc04/conf and compare.",
    "monitoring has an entry on the file but none on the directory. exit back to user, then grant only the missing bit to only that account: setfacl -m u:monitoring:--x /srv/lab/tc04/conf",
  ],
  completion: "Path access is the conjunction of search (x) on every directory above AND the right bit on the file itself. The file ACL was correct; the directory gave monitoring nothing, so traversal stopped there. A named ACL entry with --x on the directory fixes exactly that — chmod o+x on the directory would also work but lets every account traverse it, which is more permissive than necessary.",
};

/* ------------------------------------------------------------- investigation */
const I1 = B("inv01");
const FILE1 = `${I1}/app/current/public/index.html`;
const PUB1 = `${I1}/app/current/public`;
const CUR1 = `${I1}/app/current`;
const APP1 = `${I1}/app`;
const READERS = ["cat", "ls", "stat"];
const INSPECTORS = ["ls", "stat", "getfacl"];
const modeLine = (p) => { const n = findNode(FS_TREE, p); return n ? `${n.path}: mode ${n.octal}, ${n.owner}:${n.group}` : `${p}: missing`; };

const inv01 = {
  id: "inv01", kind: "investigation", xp: 200,
  title: "Incident: the site returns 403 after a deploy",
  objectives: [
    "Reproduce a failure as the affected account instead of guessing",
    "Separate what is fine (the file) from what is broken (the path to it)",
    "Fix it with the smallest change and verify as the web-server account",
  ],
  incident: "Since this morning's deploy the website returns 403 Forbidden. The web server runs as www-data and serves /srv/lab/inv01/app/current/public/index.html. The deploy script ran as 'user' with a strict umask (077). Nothing else changed. You are logged in as user with sudo.",
  startDir: I1,
  build: () => [
    file("NOTES.txt", "644", { note: "Deploy notes." }),
    dir("app", "755", [
      file("README.txt", "644"),
      dir("current", "700", [
        file("config.env", "600", { sensitive: true, note: "Secrets — must stay private." }),
        dir("public", "755", [
          file("index.html", "644"),
          file("style.css", "644"),
        ]),
      ]),
    ]),
  ],
  evidence: [
    {
      id: "reproduce", required: true, label: "Reproduce the failure as www-data",
      matches: (ev) => ev.user === "www-data" && READERS.includes(ev.cmd) && ev.paths.some((p) => p === FILE1 || p === PUB1 || p === CUR1),
      finding: () => {
        const r = checkTraverse(FILE1, "www-data");
        if (!r.ok) return explainTraverse(findNode(FS_TREE, r.at), "www-data");
        return `www-data can currently reach ${FILE1}.`;
      },
    },
    {
      id: "file-mode", required: true, label: "Check the file's own permissions",
      matches: (ev) => INSPECTORS.includes(ev.cmd) && ev.paths.some((p) => p === FILE1 || p === PUB1),
      finding: () => {
        const n = findNode(FS_TREE, FILE1);
        return n ? `${modeLine(FILE1)} — for www-data the 'others' class gives ${classify(n, "www-data").perms}.` : `${FILE1} is missing.`;
      },
    },
    {
      id: "dir-chain", required: true, label: "Check the directories above the file",
      matches: (ev) => INSPECTORS.includes(ev.cmd) && ev.paths.some((p) => p === CUR1 || p === APP1),
      finding: () => `${modeLine(CUR1)} — ${modeLine(`${CUR1}/public`)}. Every directory on the path needs x for the account that reads the file.`,
    },
  ],
  diagnoses: [
    {
      id: "file-mode", label: "index.html itself has the wrong mode",
      why: "The file's own mode is only checked after every directory above it has been passed, and its 'others' bits already allow reading.",
      explain: () => {
        const n = findNode(FS_TREE, FILE1);
        return n ? `Not the cause: ${explainAccess(n, "www-data", "r").replace(/, which lacks.*$/, "")} — the file itself already grants read.` : "The file no longer exists.";
      },
    },
    {
      id: "group", label: "www-data is missing from a group the files need",
      why: "No group is involved: every node here belongs to user:user, so www-data is always judged as 'others'.",
      explain: () => `Not the cause: www-data's groups are ${getUser("www-data").groups.join(", ")}, and every node on this path is owned by user:user, so the 'others' class decides everywhere. Group membership would only matter if a group were granted something the others class lacks.`,
    },
    {
      id: "owner", label: "index.html is owned by the wrong account",
      why: "Ownership only selects which permission class applies; it is not what blocks the request.",
      explain: () => `Not the cause: ownership of index.html (${findNode(FS_TREE, FILE1)?.owner}) only picks which permission class applies. www-data is in 'others' for it either way, and 'others' already has r. Changing the owner would not unblock the path.`,
    },
    {
      id: "dir-search", correct: true, label: "A directory above the file has no search (x) permission for www-data",
      why: "A user needs x (search) on every directory in the path. A directory without it blocks everything beneath it, whatever the file's mode says.",
      explain: () => {
        const r = checkTraverse(FILE1, "www-data");
        return r.ok
          ? "Correct: the path to the file is now searchable for www-data."
          : `Correct. ${explainTraverse(findNode(FS_TREE, r.at), "www-data")} The kernel stops at that directory, so the file's own (fine) mode is never consulted.`;
      },
    },
  ],
  hints: {
    evidence: [
      "Start by seeing the failure yourself: which account is the web server?",
      "Use su www-data, then try to read the page with cat, and read the hint line under the error.",
      "Then look at the file's mode (stat or ls -l) and at the directories above it. Compare what is fine with what is not.",
    ],
    diagnosis: [
      "Which finding in your evidence log explains why the error appears before the file's own mode matters?",
      "Look at the directory where the denial happened. Which of r, w, x does www-data lack there?",
    ],
    remediation: [
      "You need to change the directory, not the file. Who may change it?",
      "Grant only the missing bit for the web-server account. Consider which of 'everyone' or 'just www-data' needs it.",
      "chmod 711 on the directory adds search (x) for everyone without letting them list it; sudo chgrp www-data + chmod 710 or setfacl -m u:www-data:--x are tighter still. Avoid 777.",
    ],
    verification: [
      "A fix is not done until you have checked it as the account that was failing. su www-data and read the page again.",
    ],
  },
  checks: [
    canAccess("web-reads", "www-data", FILE1, "r", { label: "www-data can read index.html" }),
    cannotAccess("web-no-write", "www-data", FILE1, "w", { label: "www-data cannot modify index.html" }),
    cannotAccess("secrets-private", "www-data", `${CUR1}/config.env`, "r", { label: "config.env is still unreadable by www-data" }),
    noWorldWriteUnder("no-world-write", I1, { label: "Nothing in the scenario is world-writable" }),
    custom("keep-file", "index.html still exists", () => {
      const n = findNode(FS_TREE, FILE1);
      return { ok: !!n && !n.isDir, detail: n ? "index.html is present." : "index.html was removed." };
    }),
    accessWithin("not-broader", CUR1, "711", { level: "advisory", label: "current/ is no more permissive than 711" }),
  ],
  verify: (ev) => ev.user === "www-data" && READERS.includes(ev.cmd) && ev.paths.some((p) => p === FILE1 || p === PUB1),
  rootCause: "The deploy created current/ with mode 700 (umask 077), so www-data had no search (x) permission on that directory. The file's own mode (644) was fine all along.",
  qualityText: {
    minimal: "Your fix is minimal: it adds only the search access www-data needs and nothing else.",
    broad: "It works, but it is more permissive than necessary: the web server only needs to pass through the directory, not list it. 711, a www-data group with 710, or a --x ACL entry would have been enough.",
  },
  summarize: ({ result, attempts, hintsUsed }) => ({
    finalState: modeLine(CUR1),
    quality: result && result.advisories.length ? "broad" : "minimal",
    wrongDiagnoses: attempts.filter((a) => !a.correct).length,
    hintsUsed,
  }),
};

/* ------------------------------------------------------------------ sc01 */
/* SC-01 — Sensitive configuration file exposure (v2.13). All names, paths and contents are synthetic;
   the "password" below is a labelled placeholder, not a credential. Judged by simulated access only. */
const S1 = B("sc01");
const SC_DIR = `${S1}/orbit/config`;
const SC_CONF = `${SC_DIR}/orbit.conf`;
const SC_EXAMPLE = `${SC_DIR}/orbit.conf.example`;
const SC_UNAUTH = ["user", "monitoring", "www-data"];     // accounts that must NOT read orbit.conf
const SC_AUTH = ["deployer", "alice"];                      // deployer: read+write, alice: read-only
const SC_ACCOUNTS = ["alice", "deployer", "monitoring", "www-data"];
const SC_ALL = ["user", "alice", "deployer", "monitoring", "www-data"];   // every simulated account except root
const aclLines = (n) => (n.acl || []).map((e) => `${e.type === "user" ? "u" : "g"}:${e.id}:${e.perms}`);
/** `ls -l` (any flag set containing l) aimed at the config directory or the file, explicitly or via the cwd. */
const longListingOf = (ev, paths) => ev.cmd === "ls" && ev.args.some((a) => /^-[a-zA-Z]*l/.test(a))
  && (ev.paths.some((p) => paths.includes(p)) || (ev.paths.length === 0 && paths.includes(ev.cwd)));
const confState = () => {
  const n = findNode(FS_TREE, SC_CONF);
  if (!n) return `${SC_CONF}: missing`;
  const acl = aclLines(n);
  return `${n.path}: mode ${n.octal}, ${n.owner}:${n.group}${acl.length ? `, ACL ${acl.join(" ")} (mask ${n.aclMask})` : ", no ACL entries"}`;
};

const sc01 = {
  id: "sc01", kind: "investigation", xp: 250,
  title: "Incident: the app configuration is readable by the wrong accounts",
  objectives: [
    "Reproduce an unauthorized read instead of assuming it",
    "Read ownership, mode bits, ACL entries and group memberships as one picture",
    "Fix the exposure without locking out the accounts that legitimately need the file",
    "Prove the result from both sides: a denied account and an allowed account",
  ],
  incident: "A routine review found that the fictional Orbit application's configuration file, /srv/lab/sc01/orbit/config/orbit.conf, can be read by accounts that have no reason to see it. It holds a (synthetic) database password placeholder. You are logged in as user, an administrator with sudo. Find out what is wrong, fix it, and prove it.",
  policy: [
    "In scope: the files under /srv/lab/sc01/orbit/config and the accounts alice, deployer, monitoring, www-data and user.",
    "deployer runs Orbit: it must keep read and write access to orbit.conf.",
    "alice is the on-call engineer: she must be able to read orbit.conf, but not change it.",
    "No other account may read orbit.conf, and nobody except deployer may change it.",
    "orbit.conf.example is a public template with no secrets: it must stay readable by everyone.",
  ],
  startDir: `${S1}/orbit`,
  build: () => [
    dir("orbit", "755", [
      file("README.txt", "644", { owner: "deployer", group: "deployer", note: "Orbit (synthetic lab application). Configuration lives in config/." }),
      dir("config", "755", [
        file("orbit.conf", "644", {
          owner: "deployer", group: "deployer", sensitive: true,
          note: "# SYNTHETIC LAB DATA - not a real credential\ndb_host = db.lab.invalid\ndb_user = orbit_app\ndb_password = LAB-ONLY-PLACEHOLDER-0000\nlisten = 127.0.0.1:8080",
        }),
        file("orbit.conf.example", "644", {
          owner: "deployer", group: "deployer",
          note: "# Public template - safe to share\ndb_host = <host>\ndb_user = <user>\ndb_password = <set me>\nlisten = <address:port>",
        }),
      ], { owner: "deployer", group: "deployer" }),
    ], { owner: "deployer", group: "deployer" }),
  ],
  evidence: [
    {
      id: "reproduce", required: true, label: "Reproduce the exposure: read orbit.conf as an account that should not have access",
      matches: (ev) => ev.cmd === "cat" && SC_UNAUTH.includes(ev.user) && ev.paths.includes(SC_CONF),
      finding: (ev) => {
        const n = findNode(FS_TREE, SC_CONF);
        if (!n) return `${SC_CONF} is missing.`;
        const who = ev && ev.user ? ev.user : "this account";
        const r = checkPathAccess(SC_CONF, who, "r");
        return r.ok
          ? `${who} can read ${SC_CONF}: the ${classify(n, who).cls} class applies and grants ${classify(n, who).perms}.`
          : `${who} is currently denied: ${r.at && r.at !== SC_CONF ? explainTraverse(findNode(FS_TREE, r.at), who) : explainAccess(n, who, "r")}`;
      },
    },
    {
      id: "metadata", required: true, label: "Inspect orbit.conf's owner, group and mode (stat or ls -l)",
      matches: (ev) => (ev.cmd === "stat" && ev.paths.includes(SC_CONF)) || longListingOf(ev, [SC_DIR, SC_CONF]),
      finding: () => {
        const n = findNode(FS_TREE, SC_CONF);
        if (!n) return `${SC_CONF} is missing.`;
        const t = modeTriads(n.octal);
        return `${modeLine(SC_CONF)} — owner bits ${t.owner}, group bits ${t.group}, others bits ${t.others}. Any account that is neither ${n.owner} nor in group ${n.group} is judged by the others bits.`;
      },
    },
    {
      id: "acl", required: true, label: "Check for ACL entries on orbit.conf (getfacl)",
      matches: (ev) => ev.cmd === "getfacl" && ev.paths.includes(SC_CONF),
      finding: () => {
        const n = findNode(FS_TREE, SC_CONF);
        if (!n) return `${SC_CONF} is missing.`;
        const acl = aclLines(n);
        return acl.length
          ? `Named ACL entries on orbit.conf: ${acl.join(", ")} (mask ${n.aclMask}).`
          : "orbit.conf has no named ACL entries: its access is decided by the mode bits and ownership alone.";
      },
    },
    {
      id: "identities", required: true, label: "Look up who the relevant accounts are (id or groups for alice, deployer, monitoring or www-data)",
      matches: (ev) => (ev.cmd === "id" || ev.cmd === "groups") && ev.args.some((a) => SC_ACCOUNTS.includes(a)),
      finding: (ev) => ev.args.filter((a) => SC_ACCOUNTS.includes(a)).map((a) => formatId(a)).join(" | "),
    },
  ],
  diagnoses: [
    {
      id: "file-others", correct: true, label: "orbit.conf itself is readable by 'others' (mode 644), so accounts that are neither its owner nor in its group can read it",
      why: "Access is decided by the first matching class. monitoring, www-data and user are not deployer and not in group deployer, so the others bits apply — and they grant read.",
      explain: () => {
        const n = findNode(FS_TREE, SC_CONF);
        if (!n) return "The file no longer exists.";
        const others = modeTriads(n.octal).others;
        return others[0] === "r"
          ? `Correct. ${n.path} is mode ${n.octal} (${n.owner}:${n.group}); for an unrelated account the others bits (${others}) apply, and they include read. monitoring: ${classify(n, "monitoring").cls} → ${classify(n, "monitoring").perms}.`
          : `Correct — and the others bits are already ${others} in the current state, so that exposure has been closed. Confirm the rest of the policy before you finish.`;
      },
    },
    {
      id: "example-file", label: "orbit.conf.example is the file that leaks",
      why: "The template is meant to be world-readable and holds no secrets. The affected file is the one that contains the database password placeholder.",
      explain: () => {
        const n = findNode(FS_TREE, SC_EXAMPLE);
        return n ? `Not the cause: ${n.path} is mode ${n.octal} on purpose — it is a public template with placeholders only. Exposure of that file is not a finding.` : "The template no longer exists.";
      },
    },
    {
      id: "directory", label: "The config directory's mode (755) is what exposes the secret",
      why: "A directory only controls reaching and listing the names inside it. Who may read a file's content is decided by the file's own bits and ACL. Locking the directory would also hide the public template.",
      explain: () => {
        const d = findNode(FS_TREE, SC_DIR);
        return d ? `Not the root cause: ${d.path} is mode ${d.octal}, which only lets accounts reach and list names. The content of orbit.conf is protected (or not) by orbit.conf's own mode and ACL; fixing the directory would also take away the public template.` : "The directory no longer exists.";
      },
    },
    {
      id: "named-acl", label: "A named ACL entry on orbit.conf grants an unauthorized account access",
      why: "getfacl shows what ACL entries exist. An exposure can only come from an ACL entry if one is actually present.",
      explain: () => {
        const n = findNode(FS_TREE, SC_CONF);
        const acl = n ? aclLines(n) : [];
        return acl.length
          ? `Check getfacl again: the current ACL entries are ${acl.join(", ")}. Compare them with which accounts are meant to have access.`
          : "Not the cause: orbit.conf has no named ACL entries at all, so no ACL entry can be granting anything. The mode bits are the whole story.";
      },
    },
    {
      id: "wrong-owner", label: "orbit.conf is owned by the wrong account",
      why: "deployer, the account that runs Orbit, is the correct owner. Ownership only picks which permission class applies to an account; the exposure comes from what the others class is allowed to do.",
      explain: () => {
        const n = findNode(FS_TREE, SC_CONF);
        return n ? `Not the cause: ${n.owner} is the right owner (it runs the application and must keep read and write). Ownership only selects which class applies — changing it would not stop 'others' from reading, and could lock deployer out.` : "The file no longer exists.";
      },
    },
  ],
  hints: {
    evidence: [
      "Start from the symptom: pick one of the accounts that should NOT see the file and try to read it yourself.",
      "su monitoring, then cat the configuration file by its full path. Then look at the file's metadata and at who the other accounts are.",
      "Four things are needed: a reproduction as an unauthorized account, the file's owner/group/mode, its ACL (getfacl), and the identity of a relevant account (id or groups).",
    ],
    diagnosis: [
      "Which finding in your evidence log explains why monitoring could read the file at all?",
      "Compare each account with the file's owner and group: which permission class applied to monitoring, and what did it grant?",
    ],
    remediation: [
      "Decide the policy first: who needs read, who needs write, and who needs nothing. Write it down before you type a command.",
      "The 'others' bits must grant nothing — but check the policy: if everyone but the owner is locked out, one legitimate account loses access. Which one, and what are your ways to give it back only to her?",
      "Two least-privilege routes: put the file in a group alice belongs to and use mode 640, or keep it private and add one named ACL entry for alice. Run chmod before setfacl: a chmod made afterwards resets the ACL mask and can silently cancel your entry (check getfacl). sudo is needed because you do not own the file.",
    ],
    verification: [
      "Verification has two halves. Try reading the file as an account that must be denied, and as one that must still succeed.",
    ],
  },
  checks: [
    canAccess("deployer-reads", "deployer", SC_CONF, "r", { label: "deployer (the application account) can still read orbit.conf" }),
    canAccess("deployer-writes", "deployer", SC_CONF, "w", { label: "deployer can still modify orbit.conf" }),
    canAccess("alice-reads", "alice", SC_CONF, "r", { label: "alice (on-call) can read orbit.conf" }),
    othersCannot("only-deployer-writes", SC_CONF, "w", ["deployer"], { label: "No account except deployer can modify orbit.conf" }),
    cannotAccess("monitoring-denied", "monitoring", SC_CONF, "r", { label: "monitoring cannot read orbit.conf" }),
    cannotAccess("www-denied", "www-data", SC_CONF, "r", { label: "www-data cannot read orbit.conf" }),
    othersCannot("no-other-readers", SC_CONF, "r", SC_AUTH, { label: "No account other than deployer and alice can read orbit.conf" }),
    custom("not-world-readable", "orbit.conf is not world-readable (the others bits grant no read access)", () => {
      const n = findNode(FS_TREE, SC_CONF);
      if (!n) return { ok: false, detail: `${SC_CONF} no longer exists — removing or moving it does not fix the problem.` };
      const o = modeTriads(n.octal).others;
      return { ok: o[0] === "-", detail: o[0] === "-" ? `others bits are ${o}.` : `the others bits are still ${o}: any account added later would be able to read it. Denying today's accounts one by one does not close that.` };
    }),
    custom("template-public", "orbit.conf.example is still readable by every account (user, alice, deployer, monitoring, www-data)", () => {
      if (!findNode(FS_TREE, SC_EXAMPLE)) return { ok: false, detail: `${SC_EXAMPLE} no longer exists — the public template must stay.` };
      const blocked = SC_ALL.filter((u) => !checkPathAccess(SC_EXAMPLE, u, "r").ok);
      return { ok: blocked.length === 0, detail: blocked.length ? `${blocked.join(", ")} can no longer read the public template.` : "every account can still read the public template." };
    }),
    noWorldWriteUnder("no-world-write", S1, { label: "Nothing in the scenario is world-writable" }),
    custom("no-exec-bits", "orbit.conf carries no execute bits (a configuration file is never run)", () => {
      const n = findNode(FS_TREE, SC_CONF);
      if (!n) return { ok: false, detail: "orbit.conf is missing." };
      const t = modeTriads(n.octal);
      const x = [t.owner, t.group, t.others].some((p) => p[2] === "x");
      return { ok: !x, detail: x ? `mode ${n.octal} includes an execute bit the file does not need.` : `mode ${n.octal} has no execute bits.` };
    }, { level: "advisory" }),
  ],
  verification: [
    {
      id: "denied", label: "Read orbit.conf as an account that must be denied (su monitoring, then cat it) and see the refusal",
      matches: (ev) => ev.cmd === "cat" && ["monitoring", "www-data"].includes(ev.user) && ev.paths.includes(SC_CONF),
    },
    {
      id: "allowed", label: "Read orbit.conf as an account that must still work (su alice or su deployer, then cat it)",
      matches: (ev) => ev.cmd === "cat" && SC_AUTH.includes(ev.user) && ev.paths.includes(SC_CONF),
    },
  ],
  rootCause: "orbit.conf was created with mode 644, so its others bits granted read to every account that is neither the owner (deployer) nor in the file's group. monitoring, www-data and user were all judged by those others bits. The directory, the ACL and the ownership were not the problem.",
  qualityText: {
    minimal: "Your fix is minimal: it closes the exposure while giving access only to the accounts the policy names.",
    broad: "It satisfies the policy, but it is more permissive than necessary: a configuration file is never executed, so it should carry no execute bits. 640, or 600 plus one ACL entry for alice, is enough.",
  },
  summarize: ({ result, attempts, hintsUsed, evidence, verified }) => ({
    finalState: confState(),
    quality: result && result.advisories.length ? "broad" : "minimal",
    wrongDiagnoses: attempts.filter((a) => !a.correct).length,
    hintsUsed,
    report: {
      evidence: sc01.evidence.filter((e) => evidence && evidence[e.id]).map((e) => ({ id: e.id, command: evidence[e.id].command, finding: evidence[e.id].finding })),
      remediation: confState(),
      verification: {
        probes: sc01.verification.map((p) => ({ id: p.id, command: verified && verified[p.id] ? verified[p.id].command : "" })),
        checks: result ? result.results.map((r) => ({ id: r.id, level: r.level, ok: r.ok })) : [],
      },
    },
  }),
};

export const CHALLENGE_SCENARIOS = [tc01, tc02, tc03, tc04];
export const INVESTIGATIONS = [inv01, sc01];
export const SCENARIOS = [...CHALLENGE_SCENARIOS, ...INVESTIGATIONS];
export const scenarioMaxXP = () => SCENARIOS.reduce((s, x) => s + x.xp, 0);
