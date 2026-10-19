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
import { checkTraverse, explainAccess, explainTraverse, classify, getUser } from "./engine/users.js";
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

export const CHALLENGE_SCENARIOS = [tc01, tc02, tc03, tc04];
export const INVESTIGATIONS = [inv01];
export const SCENARIOS = [...CHALLENGE_SCENARIOS, ...INVESTIGATIONS];
export const scenarioMaxXP = () => SCENARIOS.reduce((s, x) => s + x.xp, 0);
