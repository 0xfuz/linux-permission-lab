/**
 * labs-data.js
 * Pure data for the Interactive Labs module (new in v2.1) — 11 guided,
 * multi-step walkthroughs. Each step is either an "answer" step (type an
 * octal mode, graded like a Challenge) or an "info" step (read and
 * acknowledge a finding before continuing) — narrative labs are built by
 * chaining several of these together.
 */

function lab(id, title, difficulty, xp, summary, steps) {
  return { id, title, difficulty, xp, summary, steps };
}
function answerStep(prompt, target, hint) {
  return { type: "answer", prompt, target, hint };
}
function infoStep(prompt, note) {
  return { type: "info", prompt, note };
}

export const LABS = [
  lab("lab1", "Secure an SSH Private Key", "Beginner", 75,
    "Walk through recognizing and fixing an over-permissive SSH key from scratch.",
    [
      infoStep("You've just run `ls -l ~/.ssh/id_ed25519` and see `-rw-r--r--`. Before fixing anything: is this a problem, and why?",
        "Yes — 644 means your group and every other user on the machine can read your private key. SSH clients will often refuse to use a key this permissive, and rightly so."),
      answerStep("Set the correct octal mode for a private key so only you can read or write it.", "600",
        "Owner read+write, nothing else — no group, no others."),
      infoStep("Run `ls -l` again in your head: rw-------. Confirm that matches 600 before moving on.",
        "600 = rw------- exactly. If SSH still refuses the key after this fix, check that the containing ~/.ssh directory is also not overly permissive (it should be 700)."),
    ]),

  lab("lab2", "Fix an Insecure Web Directory", "Beginner", 75,
    "Diagnose and correct a classic misconfigured web-servable directory holding a secrets file.",
    [
      infoStep("A directory /var/www/html/app is set to 777 and contains config.php with database credentials, also at 644. What's the biggest immediate risk?",
        "The directory being 777 means any local user can add, replace, or delete files the web server serves — including replacing config.php with malicious code."),
      answerStep("Fix the directory itself first: owner (web server) full control, group read/execute, others read/execute — no world write.", "755",
        "This is the standard safe mode for a directory web content lives in."),
      answerStep("Now fix config.php: it holds credentials, so the web server's group should read it, but others get nothing.", "640",
        "Owner read/write, group read-only, others nothing — tighter than the directory around it, since it holds secrets."),
    ]),

  lab("lab3", "Repair Wrong Permissions", "Beginner", 75,
    "Practice recognizing several files with permissions that don't match their purpose, and correcting each.",
    [
      answerStep("A shell script meant to be run by everyone but edited only by you is currently 644 (no execute). Fix it.", "755",
        "You need to add execute for group and others, while keeping full control for yourself."),
      answerStep("A personal notes file is currently 777 — way too open. Bring it back to a sane owner-write, world-read default.", "644",
        "Remove write access from group and others; there's no reason for either to be able to modify your notes."),
      answerStep("A credentials file was created at the default 644. Fix it to the correct 'secrets' mode.", "600",
        "Any file holding credentials should drop straight to owner-only, no exceptions."),
    ]),

  lab("lab4", "Protect Configuration Files", "Intermediate", 100,
    "Work through three configuration files with different sensitivity levels and get each one right.",
    [
      answerStep("A public-facing nginx.conf with no secrets in it — anyone should be able to read it, only you should edit it.", "644",
        "Standard public config mode — no reason to restrict read access here."),
      answerStep("An application config holding an API key, read by a service account in your group, invisible to everyone else.", "640",
        "Owner read/write, group read-only, others nothing."),
      answerStep("A systemd unit file with an embedded plaintext database password in an Environment= line.", "640",
        "Same reasoning as the API key config — anything embedding a real secret needs to drop below the usual 644 default."),
    ]),

  lab("lab5", "Harden a Linux Server", "Intermediate", 100,
    "A broader sweep across several files typically found on a freshly provisioned server.",
    [
      infoStep("You start a hardening pass with `find / -perm -o+w -type f` and `find / -perm -4000`. What are you specifically hunting for?",
        "World-writable files (anyone can modify them) and SUID binaries (run with elevated owner privilege) — the two highest-value categories to review on any server."),
      answerStep("You find /etc/motd (the login banner) at 666. It should just be a normal world-readable, owner-writable text file.", "644",
        "No reason for a login banner to be writable by anyone but the admin maintaining it."),
      answerStep("You find a custom health-check script at /usr/local/bin/healthcheck.sh sitting at 777. It should be runnable by everyone, editable only by you.", "755",
        "Standard shared-script mode: remove write access from group and others, keep read+execute."),
      infoStep("Finally, you find /etc/shadow at 644 — clearly wrong. What should it be, and why is this one especially urgent?",
        "It should be 640 (owner root, group shadow, no others) — 644 would let every local user read every account's password hash, making offline password cracking trivial."),
    ]),

  lab("lab6", "Detect Dangerous Permissions", "Intermediate", 100,
    "Practice spotting dangerous combinations rather than just fixing single files in isolation.",
    [
      infoStep("You find a binary at 6777 — SUID, SGID, and world-writable all at once. Rank why this is dangerous, worst factor first.",
        "World-writable is the entry point (anyone can replace the binary's contents); SUID+SGID is what makes the replacement dangerous (it then runs with elevated owner and group privilege for whoever runs it next)."),
      answerStep("Fix that binary to a safe, standard shared-executable mode with no special privilege at all.", "755",
        "Remove all three special bits and the world-write access — back to a plain 755."),
      infoStep("You also find a directory at 777 with no sticky bit, shared by multiple users. What's the specific danger, separate from the 777 itself?",
        "Without sticky, any user can delete or rename any other user's files inside — the write access being shared is the point, but deletion protection needs the sticky bit specifically."),
      answerStep("Fix that shared directory so it keeps working for everyone but stops users deleting each other's files.", "1777",
        "Keep the 777 base (everyone still needs full access) and add the sticky bit: 1 + 777 = 1777."),
    ]),

  lab("lab7", "Find World-Writable Files", "Advanced", 150,
    "Practice the audit workflow for locating and triaging world-writable files across a filesystem.",
    [
      infoStep("Which single find command lists every world-writable regular file on the system?", "`find / -perm -o+w -type f` — the -o+w matches files where the others category has write set, and -type f excludes directories (which are handled separately)."),
      infoStep("Your scan turns up /tmp/upload_tmp at 666, owned by a regular user. Is this automatically a critical finding?",
        "Context matters: a single user's own temp file at 666 inside the already-sticky /tmp is lower risk than, say, a world-writable file in /etc or /usr — the fix is the same (remove world-write) but the urgency differs."),
      answerStep("Fix /tmp/upload_tmp so only its owner can read and write it.", "600",
        "There's no legitimate reason for a personal temp upload to be readable or writable by anyone else."),
      answerStep("Your scan also turns up a hidden script, .hidden_script.sh, at 777 inside /tmp — both world-writable AND world-executable. Fix it to owner-only full control.", "700",
        "World-writable plus world-executable on a script is a critical finding — anyone could replace its contents and then anyone could run the replacement."),
    ]),

  lab("lab8", "Understand SUID", "Advanced", 150,
    "Build up the reasoning behind SUID from first principles using a realistic tool.",
    [
      infoStep("A diagnostic tool needs to open a raw network socket, which normally requires root. The tool should still be runnable by any regular user. What single mechanism solves this?",
        "SUID: the binary runs with its owner's (root's) privileges regardless of who invokes it, so an unprivileged user can trigger the one privileged action the tool needs."),
      answerStep("Set the mode: owner rwx, group and others r-x, plus SUID so it runs as root.", "4755",
        "Base 755, plus SUID's leading 4: 4 + 755 = 4755."),
      infoStep("Now imagine that tool also happened to be world-writable. Walk through the exploit path in your head before continuing.",
        "Any local user could overwrite the binary with arbitrary code; the next time anyone (or a scheduled job) runs it, that code executes as root — full privilege escalation from a single missing permission fix."),
      answerStep("Demonstrate the fix: same tool, but with world-write access removed, keeping SUID since the privilege is still genuinely needed.", "4755",
        "The target doesn't change from the previous step — the lesson is that 4755 was correct all along, and the vulnerability only existed when someone (mistakenly) added world-write on top of it."),
    ]),

  lab("lab9", "Sticky Bit Simulation", "Advanced", 150,
    "Simulate building /tmp from scratch, one permission decision at a time.",
    [
      infoStep("You're building a shared scratch directory from nothing. First requirement: every user on the system must be able to create files in it. What base mode achieves that?",
        "777 — full read/write/execute for owner, group and others is the only triad combination that lets every user write into the directory."),
      answerStep("Set that base mode now.", "777", "Owner, group and others all need rwx."),
      infoStep("Second requirement: users must not be able to delete or rename each other's files, even though everyone can write. What single bit adds this protection?",
        "The sticky bit — it restricts deletion/rename to a file's own owner, the directory's owner, or root, regardless of the directory's write permissions."),
      answerStep("Apply the sticky bit on top of the 777 base to complete the /tmp-style configuration.", "1777",
        "1 (sticky) + 777 = 1777 — this is /tmp's actual real-world mode."),
    ]),

  lab("lab10", "Permission Audit", "Expert", 200,
    "A capstone audit combining everything from the previous nine labs into one multi-file review.",
    [
      infoStep("You're handed a server and told to do a permissions audit. What are the first two find commands you run, and why those two first?",
        "`find / -perm -o+w -type f` (world-writable files) and `find / -perm -4000` (SUID binaries) — together they catch the two highest-value categories of real-world exposure before you even look at anything else."),
      answerStep("First finding: /usr/local/bin/legacy-root-tool is SUID root AND world-writable — the worst realistic combination. Fix it completely.", "755",
        "Remove both the SUID bit and world-write access — back to a plain, safe 755."),
      answerStep("Second finding: /etc/shadow is sitting at 644 instead of its correct mode. Fix it.", "640",
        "Owner root read/write, shadow group read-only, others nothing."),
      answerStep("Third finding: a shared team upload directory is 777 with no sticky bit. Fix it so uploads still work but users can't delete each other's files.", "1777",
        "Keep the 777 base for full shared write access, add sticky (1) on top: 1777."),
      infoStep("You write up your findings. What's the one-sentence summary that ties all three fixes together?",
        "Every fix in this audit removed access that had drifted beyond what was actually needed — the recurring discipline of a permissions audit is asking 'does this specific role really need this specific bit' for every file you touch."),
    ]),

  lab("lab11", "Grant Access Without Groups (ACL)", "Advanced", 150,
    "Use ACLs to give one extra account exactly the access it needs — and see how removing an ACL entry can quietly change another one's effective permission.",
    [
      infoStep("A new monitoring service account needs read access to /opt/app/config/app.yml, which holds API keys. Adding it to the file's owning group would also hand it whatever else that group can touch. What's the more precise tool for a single-account, single-file grant?",
        "An ACL entry via setfacl. It grants exactly one account exactly the permission it needs on exactly this file, without restructuring group membership or affecting anyone else."),
      answerStep("Before touching ACLs at all, the base mode still has to be right on its own: owner read/write, group read-only, others nothing.", "640",
        "Owner rw-, group r--, others --- = 640. The ACL is additive on top of this, not a replacement for getting the base bits right."),
      infoStep("You run `setfacl -m u:monitoring:r-- app.yml`. What happens to the file's ACL mask, and does monitoring end up with the read access you intended?",
        "The mask auto-recalculates to the union of the owning group's permission (r--) and monitoring's new entry (r--), landing on r--. Monitoring's effective permission is the intersection of its own r-- and that r-- mask — also r--, exactly as intended, with nothing silently capped."),
      infoStep("Weeks earlier, a contractor was temporarily granted `u:contractor:rwx` on this same file for a one-off task, which had widened the mask to rwx. Today someone runs `setfacl -x u:contractor app.yml` to clean it up. What should you check afterward, and why?",
        "Re-run getfacl on the file. Removing any named entry triggers a mask recalculation across everyone remaining — here it drops back to r-- (group r-- union monitoring r--), which still leaves monitoring fine, but that's exactly the kind of side effect worth confirming rather than assuming."),
      answerStep("A second file in the same review: a shared deploy script needs execute access for the ops team lead specifically, without changing the script's group. Set the correct base mode first — owner full control, group read+execute, others nothing.", "750",
        "Owner rwx, group r-x, others --- = 750. The ops lead's individual execute grant would then be layered on top with its own setfacl -m entry, same pattern as monitoring above."),
    ]),
];
