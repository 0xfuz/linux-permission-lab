/**
 * terminal-commands-data.js
 * Every command the Terminal Simulator understands, with every flag it
 * actually supports — the source for the Cheat Sheet's "All terminal
 * commands" table. Grouped the same way the terminal's own `help` text
 * groups them (nav/files, permissions, identity, system investigation), so
 * this table never says something `help` doesn't also say.
 *
 * `requires`, where set, names the access rule that gates the command —
 * gatekeeping that's actually enforced by engine/users.js, not decorative.
 */

export const TERMINAL_COMMANDS = [
  // ---------------------------- Navigation & files ----------------------------
  { id: "help", category: "nav", cmd: "help", desc: "List every available command." },
  { id: "clear", category: "nav", cmd: "clear", desc: "Clear the terminal scrollback." },
  { id: "pwd", category: "nav", cmd: "pwd", desc: "Print the current working directory." },
  { id: "ls", category: "nav", cmd: "ls / ls -a / ls -l / ls -la", desc: "List directory contents. -a includes dotfiles, -l shows mode/owner/group, -la both." },
  { id: "cd", category: "nav", cmd: "cd <dir>", desc: "Change directory. Supports ~, ~/path, relative and absolute paths.", requires: "x on every directory in the path" },
  { id: "cat", category: "nav", cmd: "cat <file>", desc: "Show a file's contents. Follows a symlink to its target automatically.", requires: "r on the file (on the target, for a symlink)" },
  { id: "tree", category: "nav", cmd: "tree [dir]", desc: "Show the directory tree from here down; marks directories you can't open." },
  { id: "stat", category: "nav", cmd: "stat <file>", desc: "Detailed mode, owner, group and ACL/sensitive flags for one file." },
  { id: "find-name", category: "nav", cmd: "find <name> / find [path] -name <pattern> [-type f|d]", desc: "Search by filename, skipping anything you can't see. -name is the real find syntax and can be scoped to a path; the bare form is a shorthand kept for convenience." },
  { id: "grep", category: "nav", cmd: "grep <term>", desc: "Search file descriptions for a keyword." },
  { id: "touch", category: "nav", cmd: "touch <file>", desc: "Create an empty file. Its mode is 666 minus your current umask.", requires: "w on the parent directory" },
  { id: "mkdir", category: "nav", cmd: "mkdir <dir>", desc: "Create a directory. Its mode is 777 minus your current umask.", requires: "w on the parent directory" },
  { id: "rm", category: "nav", cmd: "rm <file>", desc: "Remove a file. Blocked by the sticky bit unless you own the file, the directory, or you're root.", requires: "w+x on the parent directory" },
  { id: "mv", category: "nav", cmd: "mv <src> <dest>", desc: "Rename or move a file to another directory.", requires: "delete rights on the source, create rights on the destination" },
  { id: "cp", category: "nav", cmd: "cp <src> <dest>", desc: "Copy a file. The copy belongs to YOU, with a mode masked by your umask — not the original's owner or mode.", requires: "r on the source, w on the destination's parent" },
  { id: "ln", category: "nav", cmd: "ln -s <target> [link] / ln -sf …", desc: "Create a symbolic link (-f replaces an existing one). Dangling links are legal; the link's own mode is always a cosmetic 777." },
  { id: "editor", category: "nav", cmd: "nano <file> / vim <file>", desc: "Simulated notice only — this lab has no real text editor, since editing content isn't the point." },
  { id: "history", category: "nav", cmd: "history", desc: "Show the commands you've run this session." },

  // --------------------------- Permissions & ownership --------------------------
  { id: "chmod", category: "perm", cmd: "chmod <mode> <file>", desc: "Change a file's permission bits, e.g. chmod 755 script.sh.", requires: "the file's owner, or root" },
  { id: "chown", category: "perm", cmd: "chown <user> <file>", desc: "Change a file's owner.", requires: "root — even the current owner can't give a file away" },
  { id: "chgrp", category: "perm", cmd: "chgrp <group> <file>", desc: "Change a file's group.", requires: "the owner, switching only to a group they belong to — or root" },
  { id: "umask", category: "perm", cmd: "umask [-S] [mode]", desc: "Show or set the mask subtracted from 666/777 when touch/mkdir/cp create something new. -S shows it as u=/g=/o=." },
  { id: "getfacl", category: "perm", cmd: "getfacl <file>", desc: "Show extended ACL entries, the mask, and effective (mask-capped) permissions." },
  { id: "setfacl", category: "perm", cmd: "setfacl -m u:name:rwx <file> / setfacl -x u:name <file>", desc: "Add, update (-m) or remove (-x) a named user/group ACL entry. g: works the same as u: for a group.", requires: "the file's owner, or root" },

  // ----------------------------- Identity & privilege ----------------------------
  { id: "whoami", category: "identity", cmd: "whoami", desc: "Print your current username." },
  { id: "id", category: "identity", cmd: "id [user]", desc: "Print uid, gid and group membership — yours, or another account's." },
  { id: "groups", category: "identity", cmd: "groups [user]", desc: "Print group membership only." },
  { id: "su", category: "identity", cmd: "su [-] [user]", desc: "Switch user (root if none given). The - flag also moves you to that user's home directory. \"exit\" returns." },
  { id: "sudo", category: "identity", cmd: "sudo [-u user] <cmd> / sudo -i / sudo -s", desc: "Run one command as root or another user, or open a root shell with -i/-s.", requires: "membership of the sudo group, or root" },
  { id: "exit", category: "identity", cmd: "exit", desc: "Leave the current su/sudo shell and return to the previous one." },

  // --------------------------- System investigation ----------------------------
  { id: "ps", category: "sysinv", cmd: "ps / ps aux / ps -ef", desc: "Process list. Plain ps shows only your own session; aux/-ef shows everyone, command-line arguments included." },
  { id: "who", category: "sysinv", cmd: "who", desc: "Who is currently logged in, and from where." },
  { id: "w", category: "sysinv", cmd: "w", desc: "Logged-in sessions plus idle time, current command, and the load average." },
  { id: "last", category: "sysinv", cmd: "last [-n N]", desc: "Login history, most recent first; -n limits how many rows." },
  { id: "lastlog", category: "sysinv", cmd: "lastlog", desc: "Every known account's most recent login — service accounts show \"Never logged in\"." },
  { id: "uname", category: "sysinv", cmd: "uname [-a | -r | -m]", desc: "Kernel name, or with a flag: full details (-a), release (-r), architecture (-m)." },
  { id: "df", category: "sysinv", cmd: "df", desc: "Disk usage by mounted filesystem." },
  { id: "du", category: "sysinv", cmd: "du -sh <dir>", desc: "Summarized, human-readable size of a directory.", requires: "r on the directory" },
  { id: "ss", category: "sysinv", cmd: "ss -tulpn / netstat -tulpn", desc: "Listening sockets. The owning process/PID is only shown for sockets you own, or as root — real ss/netstat behave the same way." },
  { id: "systemctl", category: "sysinv", cmd: "systemctl status <svc> / systemctl list-units", desc: "One service's state, or every service at once (load/active/sub)." },
  { id: "journalctl", category: "sysinv", cmd: "journalctl [-u unit] [-n N]", desc: "The system journal, optionally filtered to one unit or tailed to N lines.", requires: "root, or the adm group" },
  { id: "dmesg", category: "sysinv", cmd: "dmesg", desc: "The kernel ring buffer.", requires: "root (kernel.dmesg_restrict) — adm membership alone isn't enough" },
  { id: "getcap", category: "sysinv", cmd: "getcap -r /", desc: "Binaries granted Linux capabilities — a SUID-bit audit misses these entirely." },
  { id: "crontab", category: "sysinv", cmd: "crontab -l [-u user]", desc: "A user's scheduled jobs. Shows your own by default.", requires: "-u naming someone else needs root" },
  { id: "sudo-l", category: "sysinv", cmd: "sudo -l", desc: "Show what you're allowed to run as root, and which rule grants it." },
  { id: "find-perm", category: "sysinv", cmd: "find [path] -perm -4000 / -2000 / -1000 / /6000 [-type f|d]", desc: "Permission-bit audit: SUID (-4000), SGID (-2000), sticky (-1000), either SUID or SGID (/6000). -type narrows to files or directories." },
];

export const TERMINAL_COMMAND_CATEGORIES = [
  { id: "nav", label: "Navigation & files" },
  { id: "perm", label: "Permissions & ownership" },
  { id: "identity", label: "Identity & privilege" },
  { id: "sysinv", label: "System investigation" },
];
