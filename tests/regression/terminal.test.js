/**
 * tests/regression/terminal.test.js  (v2.4)
 * End-to-end: drives the real runCommand() through a tiny DOM shim and reads
 * back what the learner would see. Covers su / sudo / exit, enforcement,
 * umask and ln -s. FS_TREE is shared mutable state, so each test uses its
 * own file names and resets the shell with resetTerminalState().
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installDomShim, createContainer, outputText } from "../helpers/dom-shim.js";
import { FS_TREE, findNode } from "../../assets/js/engine/fs-model.js";

installDomShim();
const { runCommand, resetTerminalState, getTerminalState } = await import("../../assets/js/terminal.js");

/** Run commands; return only the output (prompt/echo lines removed). */
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

describe("identity: su / sudo / exit", () => {
  test("starts as user with the original id output", () => {
    assert.equal(run("whoami"), "user");
    assert.equal(run("id"), "uid=1000(user) gid=1000(user) groups=1000(user),27(sudo)");
    assert.equal(run("groups"), "user sudo");
  });
  test("su alice switches identity; exit restores user AND the old directory", () => {
    run("cd /tmp");
    run("su alice");
    assert.equal(getTerminalState().user, "alice");
    assert.equal(run("whoami"), "alice");
    assert.match(run("groups"), /alice adm/);
    run("exit");
    assert.equal(getTerminalState().user, "user");
    assert.equal(getTerminalState().cwd, "/tmp");
  });
  test("su to root recolors the prompt glyph from green (user) to red (root)", () => {
    const c = createContainer();
    runCommand("whoami", c);
    assert.match(c.children[0].innerHTML, /t-glyph-user">❯/);
    runCommand("su", c);
    const beforeSecondWhoami = c.children.length;
    runCommand("whoami", c);
    const text = outputText({ children: c.children.slice(beforeSecondWhoami) });
    assert.match(text, /root@permission-lab \/home\/user ❯ whoami/);
    assert.match(c.children[beforeSecondWhoami].innerHTML, /t-glyph-root">❯/);
  });
  test("su to an unknown user fails and changes nothing", () => {
    assert.match(run("su mallory"), /user mallory does not exist/);
    assert.equal(getTerminalState().user, "user");
  });
  test("exit at the top level doesn't crash or log you out", () => {
    assert.match(run("exit"), /top-level shell/);
    assert.equal(getTerminalState().user, "user");
  });
  test("su - goes to the target's home directory; plain su keeps the cwd", () => {
    run("su alice");
    assert.equal(getTerminalState().cwd, "/home/user");
    run("exit");
    run("su - alice");
    assert.equal(getTerminalState().cwd, "/home/alice");
  });
  test("nested su unwinds one level per exit", () => {
    run("su alice"); run("su root");
    assert.equal(getTerminalState().depth, 2);
    run("exit");
    assert.equal(getTerminalState().user, "alice");
    run("exit");
    assert.equal(getTerminalState().user, "user");
  });
  test("sudo runs ONE command as root, then you're yourself again", () => {
    assert.match(run("sudo whoami").split("\n").pop(), /^root$/);
    assert.equal(getTerminalState().user, "user");
  });
  test("sudo is refused for users outside the sudo group", () => {
    run("su alice");
    const out = run("sudo cat /etc/shadow");
    assert.match(out, /alice is not in the sudoers file/);
    assert.doesNotMatch(out, /password hashes/i, "the command must not run");
  });
  test("sudo -u runs as the named user", () => {
    assert.match(run("sudo -u alice whoami").split("\n").pop(), /^alice$/);
  });
  test("sudo su leaves you a root shell and exit unwinds cleanly (no identity leak)", () => {
    run("sudo su");
    assert.equal(getTerminalState().user, "root");
    run("exit");
    assert.equal(getTerminalState().user, "user", "the sudo restore must not clobber the new shell");
  });
  test("sudo -i opens a root shell in root's home", () => {
    run("sudo -i");
    assert.deepEqual([getTerminalState().user, getTerminalState().cwd], ["root", "/root"]);
  });
  test("sudo password hint appears once per user (credential cache)", () => {
    assert.match(run("sudo whoami"), /\[sudo\] password for user/);
    assert.doesNotMatch(run("sudo whoami"), /\[sudo\] password/);
  });
  test("id/groups accept a username", () => {
    assert.match(run("id alice"), /uid=1001\(alice\) .*4\(adm\)/);
    assert.match(run("groups alice"), /alice : alice adm/);
    assert.match(run("id nobody"), /no such user/);
  });
});

describe("enforcement", () => {
  test("user can't read /etc/shadow, and is told exactly why", () => {
    const out = run("cat /etc/shadow");
    assert.match(out, /cat: \/etc\/shadow: Permission denied/);
    assert.match(out, /others bits apply/);
  });
  test("…but sudo can, and alice (group adm) can read auth.log while user can't", () => {
    assert.match(run("sudo cat /etc/shadow").split("\n").pop(), /Holds password hashes/);
    assert.match(run("cat /var/log/auth.log"), /Permission denied/);
    run("su alice");
    assert.doesNotMatch(run("cat /var/log/auth.log"), /Permission denied/);
  });
  test("cd and ls respect directory bits", () => {
    assert.match(run("cd /root"), /Permission denied/);
    assert.equal(getTerminalState().cwd, "/home/user");
    assert.match(run("ls /root"), /Permission denied/);
    assert.match(run("cd /home/alice"), /Permission denied/, "750 alice:alice");
  });
  test("chmod only for the owner or root", () => {
    assert.match(run("chmod 600 /etc/hosts"), /Operation not permitted/);
    assert.match(run("chmod 600 notes.txt"), /changed to 600/);
    findNode(FS_TREE, "/home/user/notes.txt").octal = "644";
  });
  test("chown is root-only — even for the file's owner", () => {
    const out = run("chown alice notes.txt");
    assert.match(out, /Operation not permitted/);
    assert.match(out, /sudo chown alice notes.txt/);
    assert.equal(findNode(FS_TREE, "/home/user/notes.txt").owner, "user");
    assert.match(run("sudo chown alice notes.txt").split("\n").pop(), /changed to alice/);
    findNode(FS_TREE, "/home/user/notes.txt").owner = "user";
  });
  test("chown / chgrp reject users and groups that don't exist", () => {
    assert.match(run("sudo chown bob notes.txt"), /invalid user: 'bob'/);
    assert.match(run("sudo chgrp staff notes.txt"), /invalid group: 'staff'/);
  });
  test("chgrp: owner may only pick a group they belong to", () => {
    assert.match(run("chgrp adm notes.txt"), /Operation not permitted/);
    assert.match(run("chgrp sudo notes.txt"), /changed to sudo/);
    findNode(FS_TREE, "/home/user/notes.txt").group = "user";
  });
  test("find skips unreadable directories and says so", () => {
    const out = run("find root_notes");
    assert.doesNotMatch(out, /\/root\/root_notes\.txt/);
    assert.match(out, /'\/root': Permission denied/);
    assert.match(run("sudo find root_notes"), /\/root\/root_notes\.txt/);
  });
  test("tree marks directories it can't open", () => {
    assert.match(run("tree /"), /\[error opening dir\]/);
    assert.doesNotMatch(run("sudo tree /"), /\[error opening dir\]/);
  });
  test("rm and touch need w on the parent directory", () => {
    assert.match(run("rm /etc/hosts"), /Permission denied/);
    assert.ok(findNode(FS_TREE, "/etc/hosts"));
    assert.match(run("touch /etc/newfile_t1"), /Permission denied/);
    assert.equal(findNode(FS_TREE, "/etc/newfile_t1"), null);
  });
  test("sticky bit in /tmp: alice can't delete user's file, user can", () => {
    run("su alice");
    const out = run("rm /tmp/session_abc123");
    assert.match(out, /Operation not permitted/);
    assert.match(out, /sticky bit/);
    assert.ok(findNode(FS_TREE, "/tmp/session_abc123"));
    run("exit");
    run("touch /tmp/mine_t2");
    assert.match(run("rm /tmp/mine_t2"), /removed/);
  });
  test("a symlink never grants access its target doesn't", () => {
    const out = run("cat /tmp/current_auth_log");
    assert.match(out, /Permission denied/);
    assert.match(out, /symlink never grants access/);
    run("su alice");
    assert.doesNotMatch(run("cat /tmp/current_auth_log"), /Permission denied/);
  });
  test("ACL + directory ACL: monitoring can read app.yml, alice can't (no x on the directory)", () => {
    run("su monitoring");
    assert.doesNotMatch(run("cat /opt/app/config/app.yml"), /Permission denied/);
    run("exit"); run("su alice");
    const out = run("cat /opt/app/config/app.yml");
    assert.match(out, /Permission denied/);
    assert.match(out, /no x \(search\)/);
  });
  test("setfacl needs ownership", () => {
    assert.match(run("setfacl -m u:alice:r-- /etc/hosts"), /Operation not permitted/);
  });
  test("cp creates a copy owned by the copier, even from a root-owned source", () => {
    run("cp /etc/hosts /home/user/hosts_copy_t3");
    const n = findNode(FS_TREE, "/home/user/hosts_copy_t3");
    assert.equal(n.owner, "user");
    assert.equal(n.group, "user");
    assert.equal(n.octal, "644");
  });
  test("cp refuses an unreadable source", () => {
    assert.match(run("cp /etc/shadow /home/user/shadow_t4"), /Permission denied/);
    assert.equal(findNode(FS_TREE, "/home/user/shadow_t4"), null);
  });
  test("~ expands to the CURRENT user's home", () => {
    run("su alice");
    run("cd ~");
    assert.equal(getTerminalState().cwd, "/home/alice");
  });
});

describe("umask", () => {
  test("default is 0022; touch/mkdir follow it", () => {
    assert.equal(run("umask"), "0022");
    assert.equal(run("umask -S"), "u=rwx,g=rx,o=rx");
    run("touch u_f1"); run("mkdir u_d1");
    assert.equal(findNode(FS_TREE, "/home/user/u_f1").octal, "644");
    assert.equal(findNode(FS_TREE, "/home/user/u_d1").octal, "755");
  });
  test("umask 077 -> new file 600, new dir 700, and cp masks the source mode", () => {
    assert.match(run("umask 077"), /umask set to 0077/);
    assert.equal(run("umask"), "0077");
    run("touch u_f2"); run("mkdir u_d2"); run("cp script.sh u_cp2");
    assert.equal(findNode(FS_TREE, "/home/user/u_f2").octal, "600");
    assert.equal(findNode(FS_TREE, "/home/user/u_d2").octal, "700");
    assert.equal(findNode(FS_TREE, "/home/user/u_cp2").octal, "700", "755 & ~077");
  });
  test("accepts 4 digits; rejects garbage without changing the mask", () => {
    run("umask 0002");
    assert.equal(run("umask"), "0002");
    assert.match(run("umask 999"), /invalid octal number/);
    assert.match(run("umask abc"), /invalid octal number/);
    assert.equal(run("umask"), "0002");
  });
  test("each login shell starts at 022 and exit restores the previous umask", () => {
    run("umask 077");
    run("su alice");
    assert.equal(run("umask"), "0022");
    run("exit");
    assert.equal(run("umask"), "0077");
  });
  test("files get the creator's name and primary group", () => {
    run("su alice"); run("cd /tmp"); run("touch alice_t5");
    const n = findNode(FS_TREE, "/tmp/alice_t5");
    assert.deepEqual([n.owner, n.group], ["alice", "alice"]);
  });
});

describe("ln -s", () => {
  test("creates a symlink with cosmetic 777, owned by the creator, target stored verbatim", () => {
    const out = run("ln -s notes.txt ln_a");
    assert.match(out, /created \/home\/user\/ln_a -> notes\.txt/);
    const n = findNode(FS_TREE, "/home/user/ln_a");
    assert.equal(n.isSymlink, true);
    assert.equal(n.target, "notes.txt");
    assert.equal(n.octal, "777");
    assert.equal(n.owner, "user");
    assert.match(run("ls -l"), /lrwxrwxrwx\s+user\s+user\s+ln_a -> notes\.txt/);
  });
  test("the new link works with cat and follows chmod to the target", () => {
    run("ln -s notes.txt ln_b");
    assert.match(run("cat ln_b"), /follows .*ln_b -> .*notes\.txt/);
    run("chmod 640 ln_b");
    assert.equal(findNode(FS_TREE, "/home/user/notes.txt").octal, "640");
    assert.equal(findNode(FS_TREE, "/home/user/ln_b").octal, "777");
    findNode(FS_TREE, "/home/user/notes.txt").octal = "644";
  });
  test("a link to something you can't read doesn't let you read it", () => {
    run("ln -s /etc/shadow ln_c");
    assert.match(run("cat ln_c"), /Permission denied/);
  });
  test("dangling links are legal and flagged; relative targets resolve from the link's directory", () => {
    const out = run("ln -s nowhere.txt ln_d");
    assert.match(out, /doesn't exist/);
    assert.match(out, /relative target/);
    assert.match(run("cat ln_d"), /broken symbolic link/);
  });
  test("destination that is a directory puts the link inside, named after the target", () => {
    run("ln -s /etc/hostname /tmp");
    assert.equal(findNode(FS_TREE, "/tmp/hostname").target, "/etc/hostname");
  });
  test("refuses to clobber without -f, replaces with -f, never replaces a directory", () => {
    run("ln -s notes.txt ln_e");
    assert.match(run("ln -s script.sh ln_e"), /File exists/);
    assert.equal(findNode(FS_TREE, "/home/user/ln_e").target, "notes.txt");
    assert.match(run("ln -sf script.sh ln_e"), /replaced existing/);
    assert.equal(findNode(FS_TREE, "/home/user/ln_e").target, "script.sh");
    run("mkdir ln_dir_t6");
    assert.match(run("ln -sf notes.txt /home/user/ln_dir_t6/x"), /created/);
  });
  test("needs w on the directory it creates in", () => {
    assert.match(run("ln -s /etc/hosts /etc/ln_f"), /Permission denied/);
    assert.equal(findNode(FS_TREE, "/etc/ln_f"), null);
    assert.match(run("sudo ln -s /etc/hosts /etc/ln_f"), /created/);
    assert.equal(findNode(FS_TREE, "/etc/ln_f").owner, "root");
  });
  test("hard links and unknown flags get a clear message, bad usage gets usage", () => {
    assert.match(run("ln notes.txt x"), /hard links aren't simulated/);
    assert.match(run("ln -sx a b"), /unsupported option/);
    assert.match(run("ln -s"), /usage/);
    assert.match(run("ln -s a b c"), /usage/);
    assert.match(run("ln -s a nodir/b"), /No such file or directory/);
  });
});

describe("unchanged behavior", () => {
  test("original commands still work for the default user", () => {
    assert.match(run("pwd"), /\/home\/user/);
    assert.match(run("stat backup.sql"), /Access: \(0666/);
    assert.match(run("chmod 600 backup.sql"), /changed to 600/);
    findNode(FS_TREE, "/home/user/backup.sql").octal = "666";
    assert.match(run("getfacl /opt/app/config/app.yml"), /Permission denied/, "now enforced: root-only directory");
    assert.match(run("sudo getfacl /opt/app/config/app.yml"), /user:monitoring:r--/);
  });
  test("unknown commands (and prototype names) are 'command not found'", () => {
    assert.match(run("frobnicate"), /command not found/);
    assert.match(run("constructor"), /command not found/);
    assert.match(run("toString"), /command not found/);
  });
});
