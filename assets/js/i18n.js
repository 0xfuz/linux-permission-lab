/**
 * i18n.js
 * New — bilingual support (English / Arabic). Owns the active locale,
 * the UI-string dictionary, RTL layout switching, and the static-DOM
 * translation pass (elements marked `data-i18n="key"`). Feature modules
 * that render their own DOM call `t(key)` directly instead of relying on
 * the static pass; modules with large parallel datasets (Learn, Labs,
 * Challenges, Quiz, achievements, filesystem notes) import a matching
 * `*.ar.js` overlay keyed by id and merge it in when the locale is 'ar'.
 */

import { loadState, saveState } from "./utils.js";

let locale = loadState().locale || "en";
const listeners = new Set();

export function getLocale() {
  return locale;
}

export function isRTL() {
  return locale === "ar";
}

export function onLocaleChanged(cb) {
  listeners.add(cb);
}

export function setLocale(next) {
  if (next !== "en" && next !== "ar") return;
  locale = next;
  saveState({ locale });
  document.documentElement.setAttribute("lang", locale === "ar" ? "ar" : "en");
  document.documentElement.setAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  applyStaticTranslations();
  listeners.forEach((cb) => { try { cb(locale); } catch { /* ignore a broken listener */ } });
}

/** Translate a UI-string key. Falls back to English, then to the key itself. */
export function t(key) {
  const dict = DICT[locale] || DICT.en;
  return dict[key] ?? DICT.en[key] ?? key;
}

/**
 * Merge an Arabic overlay (keyed by id) onto an English array when locale is 'ar'.
 * Every other content type (Learn, Challenges, Quiz) is flat and this plain
 * shallow merge is all they need. Pass `nestedArrayKey` (e.g. "steps") for
 * content shaped like Labs, where the overlay itself needs to merge a
 * nested array element-by-element rather than being spread wholesale —
 * without it, an overlay's partial `steps` overrides would clobber the
 * rest of each step instead of merging into it.
 */
export function localize(items, overlay, { nestedArrayKey } = {}) {
  if (locale !== "ar" || !overlay) return items;
  return items.map((item) => {
    const ov = overlay[item.id];
    if (!ov) return item;
    if (nestedArrayKey && Array.isArray(item[nestedArrayKey]) && Array.isArray(ov[nestedArrayKey])) {
      const merged = item[nestedArrayKey].map((entry, i) => ({ ...entry, ...(ov[nestedArrayKey][i] || {}) }));
      return { ...item, ...ov, [nestedArrayKey]: merged };
    }
    return { ...item, ...ov };
  });
}

export function applyStaticTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    node.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.setAttribute("placeholder", t(node.getAttribute("data-i18n-placeholder")));
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((node) => {
    node.setAttribute("aria-label", t(node.getAttribute("data-i18n-aria")));
  });
}

export const DICT = {
  en: {
    "nav.home": "Home", "nav.simulator": "Simulator", "nav.calculator": "Calculator", "nav.terminal": "Terminal",
    "nav.learn": "Learn", "nav.labs": "Labs", "nav.challenges": "Challenges", "nav.quiz": "Quiz",
    "nav.cheatsheet": "Cheat Sheet", "nav.progress": "Progress", "nav.about": "About",
    "brand.tagline": "chmod, visually",
    "lang.toggle": "العربية",
    "theme.dark": "Dark mode", "theme.light": "Light mode",
    "xp.label": "Lab progress",

    "hero.badge": "Runs entirely in your browser — no login, no backend",
    "hero.title1": "Linux", "hero.title2": "Permission", "hero.title3": "Lab",
    "hero.sub": "An interactive playground for understanding Linux file permissions — flip real permission bits, watch chmod update live, break into a fake filesystem, and prove it in hands-on challenges.",
    "hero.startLab": "Start Lab", "hero.docs": "Documentation",
    "hero.scroll": "Scroll",
    "hero.authorBadge": "Created by",

    "home.whatsInside": "What's inside",
    "home.heading": "A full curriculum, not just a calculator",
    "home.feature.sim.title": "Permission Simulator",
    "home.feature.sim.desc": "Toggle owner, group and others like LED switches and watch symbolic, octal, binary and the chmod command update instantly.",
    "home.feature.fs.title": "Fake Filesystem",
    "home.feature.fs.desc": "62 realistic files plus 2 symlinks across /etc, /var, /opt, /usr, /tmp, /home and /root — click through real-world permission mistakes.",
    "home.feature.term.title": "Terminal Simulator",
    "home.feature.term.desc": "47 simulated commands — ls, chmod, su, sudo, umask, ln -s, plus system investigation like ps, journalctl, ss and getcap — with real permission enforcement over a safe, fake shell.",
    "home.feature.learn.title": "21 Learning Cards",
    "home.feature.learn.desc": "Every core topic — chmod, chown, umask, ACLs, special bits and more — with diagrams, examples, and warnings.",
    "home.feature.labs.title": "11 Interactive Labs",
    "home.feature.labs.desc": "Guided, multi-step walkthroughs — from securing an SSH key to a full capstone permission audit.",
    "home.feature.challenges.title": "88 Challenges",
    "home.feature.challenges.desc": "Twenty each across Beginner, Intermediate, Advanced and Expert — earn XP and level up as you go.",
    "home.feature.quiz.title": "113-Question Quiz",
    "home.feature.quiz.desc": "Multiple-choice rounds across every topic, with instant explanations and lifetime accuracy tracking.",
    "home.feature.security.title": "Security Analyzer",
    "home.feature.security.desc": "Every permission state is graded Safe, Warning or Critical with a plain-language explanation of why.",
    "home.feature.xp.title": "XP, Levels & Achievements",
    "home.feature.xp.desc": "12 unlockable achievements, level progression, and a printable certificate once you clear the curriculum.",
    "home.footerNote": "Linux Permission Lab v2.3 · Educational simulation, no real shell execution",

    "hero.stats.topics": "Learn topics",
    "hero.stats.quiz": "Quiz questions",

    "home.how.eyebrow": "How it works",
    "home.how.heading": "Three steps, in order",
    "home.how.step1.title": "Learn",
    "home.how.step1.desc": "Work through 21 topic cards — diagrams, examples, tips and warnings for every core concept.",
    "home.how.step2.title": "Practice",
    "home.how.step2.desc": "Apply it in 11 guided Labs and 88 tiered Challenges against a realistic fake filesystem.",
    "home.how.step3.title": "Prove it",
    "home.how.step3.desc": "Clear the 113-question Quiz, unlock every achievement, and print a certificate once it's done.",

    "footer.tagline": "A browser-only playground for the Linux permission model. No backend, no login, no build step.",
    "footer.col.product": "Product",
    "footer.col.learn": "Learn",
    "footer.col.project": "Project",
    "footer.sourceLink": "Source on GitHub",
    "footer.licenseLink": "MIT License",
    "footer.topicsLink": "21 topics",

    "sim.eyebrow": "Module 01 · 02 · 05 · 06", "sim.title": "Permission Simulator",
    "sim.desc": "Pick a file from the fake filesystem, or build permissions from scratch. Every toggle updates the live output and the security analysis below.",
    "sim.fsPanel": "Fake filesystem", "sim.editor": "Permission editor", "sim.reset": "Reset",
    "sim.owner": "Owner", "sim.group": "Group", "sim.others": "Others", "sim.special": "Special Bits", "sim.advanced": "advanced",
    "sim.read": "Read", "sim.write": "Write", "sim.execute": "Execute",
    "sim.liveOutput": "Live output", "sim.symbolic": "Symbolic", "sim.octal": "Octal", "sim.binary": "Binary",
    "sim.copy": "Copy", "sim.securityAnalysis": "Security analysis", "sim.bitsExplained": "Special bits explained",
    "sim.suidLabel": "SUID", "sim.sgidLabel": "SGID", "sim.stickyLabel": "Sticky",
    "sec.safe": "Safe", "sec.warning": "Warning", "sec.critical": "Critical",

    "calc.eyebrow": "Module 04", "calc.title": "Permission Calculator",
    "calc.desc": "Type an octal mode or a symbolic string — both directions convert automatically.",
    "calc.octalInput": "Octal input", "calc.symbolicInput": "Symbolic input", "calc.presets": "Quick presets",
    "calc.result": "Result", "calc.copyChmod": "Copy as chmod command",

    "term.eyebrow": "Module 03", "term.title": "Terminal Simulator",
    "term.desc": "A simulated shell over the same fake filesystem. Permissions are enforced — try cat /etc/shadow, then su alice, sudo, umask 077 or ln -s. New: investigate the box with ps aux, journalctl, ss -tulpn, getcap -r / or find / -perm -4000. Type help for the full command list.",
    "sc.title": "Hands-on scenarios",
    "sc.desc": "State-checked challenges and a guided investigation. Work in the terminal above — your fix is judged by what each account can actually do afterwards, not by which command you typed. Opening a scenario loads its files under /srv/lab and moves your shell there.",
    "sc.kind.challenge": "Challenge",
    "sc.kind.investigation": "Investigation",
    "sc.list": "Choose a scenario",
    "sc.open": "Open",
    "sc.review": "Review",
    "sc.back": "Back to list",
    "sc.objectives": "Learning objectives",
    "sc.task": "Task",
    "sc.criteria": "Success criteria",
    "sc.incident": "Incident",
    "sc.check": "Check my work",
    "sc.reset": "Reset scenario",
    "sc.start": "Start investigation",
    "sc.close": "Close scenario",
    "sc.hint": "Show next hint",
    "sc.hints": "Hints",
    "sc.hintCount": "hints shown",
    "sc.noMoreHints": "No more hints for this step.",
    "sc.attempts": "Attempts",
    "sc.required": "required",
    "sc.advisory": "advisory",
    "sc.pass": "Pass",
    "sc.fail": "Not yet",
    "sc.passed": "Solved! All required checks pass.",
    "sc.notYet": "Not solved yet — some required checks still fail.",
    "sc.advisoryNote": "It works, but this is more permissive than necessary:",
    "sc.whyWorks": "Why this works",
    "sc.xp": "XP",
    "sc.done": "Completed",
    "sc.reset.done": "Scenario reset to its original state.",
    "sc.loaded": "Scenario loaded. Your shell is now in",
    "sc.phase.briefing": "Briefing",
    "sc.phase.evidence": "Evidence",
    "sc.phase.diagnosis": "Diagnosis",
    "sc.phase.remediation": "Fix",
    "sc.phase.verification": "Verify",
    "sc.phase.complete": "Done",
    "sc.phases": "Investigation steps",
    "sc.phase.current": "current step",
    "sc.evidence": "Evidence log",
    "sc.evidence.pending": "Not collected yet",
    "sc.evidence.finding": "Finding",
    "sc.evidence.hint": "Run commands in the terminal. Each item ticks off when you inspect the right thing.",
    "sc.diagnosis": "Diagnosis",
    "sc.diagnosis.locked": "Collect all the evidence first. Still missing:",
    "sc.diagnosis.pick": "What is the root cause?",
    "sc.diagnosis.submit": "Submit diagnosis",
    "sc.diagnosis.none": "Select a diagnosis first.",
    "sc.diagnosis.correct": "Correct diagnosis.",
    "sc.diagnosis.wrong": "Not the root cause.",
    "sc.diagnosis.live": "From the simulation:",
    "sc.fix": "Apply and check the fix",
    "sc.fix.desc": "Fix it in the terminal, then check. The check evaluates the simulated state, not the command you used.",
    "sc.fix.check": "Check my fix",
    "sc.fix.ok": "The state is fixed. One step left: verify it.",
    "sc.fix.notyet": "The state is still broken:",
    "sc.verify": "Verify",
    "sc.verify.desc": "Re-run a check as the account that was failing (su www-data, then read the page) to confirm the fix from its point of view.",
    "sc.verify.reopened": "The state no longer passes — the fix was undone. Fix it again.",
    "sc.summary": "What happened",
    "sc.summary.final": "Final state",
    "sc.summary.wrong": "Wrong diagnoses",
    "sc.summary.hints": "Hints used",
    "sc.resolved": "Investigation resolved.",

    "learn.eyebrow": "Module 09 · New", "learn.title": "Learn",
    "learn.desc": "21 reference topics covering the full permission model — each with a diagram, an example, command references, tips and warnings.",
    "learn.searchPlaceholder": "Search topics, e.g. SUID or umask",
    "learn.expandAll": "Expand all", "learn.collapseAll": "Collapse all",
    "learn.example": "Example", "learn.commands": "Command examples", "learn.tips": "Tips", "learn.warnings": "Warnings",
    "learn.readLabel": "Read",

    "labs.eyebrow": "Module 10 · New", "labs.title": "Interactive Labs",
    "labs.desc": "Eleven guided, multi-step walkthroughs — each mixes short explanations with graded checkpoints, from a first SSH key fix to a full capstone audit.",
    "labs.startLab": "Start lab", "labs.review": "Review", "labs.steps": "steps",
    "labs.showHint": "Show hint", "labs.checkAnswer": "Check answer", "labs.continue": "Continue", "labs.finishLab": "Finish lab", "labs.done": "Done",
    "labs.explanation": "Explanation", "labs.correct": "Correct.", "labs.incorrect": "Not quite — try again, or reveal the hint.",

    "ch.eyebrow": "Module 07", "ch.title": "Challenges",
    "ch.desc": "88 labs across four tiers — Beginner, Intermediate, Advanced and Expert. Type the octal mode that solves each scenario and earn XP.",
    "ch.random": "🎲 Random challenge", "ch.attempt": "Attempt", "ch.review": "Review", "ch.target": "target",
    "ch.tier.All": "All", "ch.tier.Beginner": "Beginner", "ch.tier.Intermediate": "Intermediate", "ch.tier.Advanced": "Advanced", "ch.tier.Expert": "Expert",
    "ch.scenario": "Scenario", "ch.yourAnswer": "Your answer — octal mode", "ch.showHint": "Show hint", "ch.checkAnswer": "Check answer",
    "ch.notQuite": "Not quite — try again, or reveal a hint.",
    "ch.whyWorks": "Why this works", "ch.empty": "No challenges in this tier.",

    "quiz.eyebrow": "Module 08 · New", "quiz.title": "Quiz",
    "quiz.desc": "113 multiple-choice questions across every topic. Rounds are 10 questions — filter by topic or mix them all.",
    "quiz.question": "Question", "quiz.score": "Score", "quiz.correct": "Correct", "quiz.notQuite": "Not quite",
    "quiz.nextQuestion": "Next question", "quiz.seeResults": "See results", "quiz.roundComplete": "Round complete",
    "quiz.perfect": "Perfect score — nice work.", "quiz.solid": "Solid round. Review the topics you missed in the Learn module.",
    "quiz.revisit": "Worth a revisit — try the Learn module for the topics that tripped you up.",
    "quiz.roundsPlayed": "Rounds played", "quiz.bestRound": "Best round score", "quiz.lifetimeAccuracy": "Lifetime accuracy",
    "quiz.startAnother": "Start another round",

    "cheat.eyebrow": "Module 11", "cheat.title": "Cheat Sheet",
    "cheat.desc": "The permission modes you'll actually use, in one reference table.",
    "cheat.searchPlaceholder": "Search modes, e.g. 600 or ssh key",
    "cheat.colOctal": "Octal", "cheat.colSymbolic": "Symbolic", "cheat.colWhen": "When to use it",
    "cheat.readingDigits": "Reading the digits", "cheat.binaryRef": "Binary reference", "cheat.specialBits": "Special bits",
    "cheat.allCommands": "All terminal commands", "cheat.allCommandsDesc": "Every command the Terminal Simulator understands, with every flag it actually supports — the same list \"help\" prints inside the terminal. The search box above filters this table too.",
    "cheat.colCommand": "Command", "cheat.colDoes": "What it does", "cheat.colRequires": "Requires",
    "cheat.troubleshooting": "Permission troubleshooting", "cheat.bestPractices": "Best practices",

    "progress.eyebrow": "Module 12 · New", "progress.title": "Progress",
    "progress.desc": "Your XP, level, and stats across Challenges, Labs and Quiz — plus achievements and a certificate once you clear the curriculum.",
    "progress.level": "Level", "progress.totalXP": "total XP", "progress.xpToNext": "XP to level",
    "progress.challengesCompleted": "Challenges completed", "progress.labsCompleted": "Labs completed",
    "progress.roundsPlayed": "Quiz rounds played", "progress.quizAccuracy": "Quiz accuracy", "progress.bestQuizRound": "Best quiz round",
    "progress.achievements": "Achievements", "progress.certificate": "Certificate of Completion",
    "progress.dangerZone": "Reset progress", "progress.resetDesc": "Clears Challenges, Labs, Quiz and read-topic progress on this device — XP, level and achievements included, since they're all computed from the same data. Your language and theme are kept. This can't be undone.",
    "progress.resetBtn": "Reset all progress", "progress.resetConfirm": "Reset all progress? This clears Challenges, Labs, Quiz and read-topic history on this device and can't be undone.",
    "progress.resetDone": "Progress reset. XP, level and achievements are back to zero.",
    "progress.certLocked": "Locked — complete all 88 challenges and all 11 labs to unlock your certificate. Currently at",
    "progress.certUnlockedLine1": "This certifies the completion of every challenge and interactive lab in the curriculum —",
    "progress.certUnlockedLine2": "88/88 challenges · 11/11 labs · awarded by your own browser's local progress, not a registrar.",
    "progress.printCert": "Print certificate", "progress.earned": "Earned", "progress.locked": "Locked",
    "progress.share.title": "Share your progress",
    "progress.share.desc": "Copy a one-line summary to share, or download a JSON snapshot of your XP, completion and achievements — everything stays local until you choose to share it.",
    "progress.share.copyBtn": "Copy summary", "progress.share.downloadBtn": "Download JSON",
    "progress.share.exportSuccess": "Progress exported as JSON", "progress.share.exportError": "Couldn't generate the export — try again",
    "path.title": "Your Path", "path.desc": "A suggested order through the whole lab: read every topic, then prove it in Labs, Challenges and a Quiz round.",
    "path.continue": "Continue:", "path.quizDone": "Played", "path.quizTodo": "Not played yet",
    "path.allDone": "Path complete — every topic read, every Lab and Challenge done, and a Quiz round played.",

    "about.eyebrow": "About", "about.title": "What this is, and isn't",
    "about.p1": "Linux Permission Lab is a browser-based teaching tool for the Linux permission model — the owner/group/others triad, octal and symbolic notation, ownership, ACLs, and the SUID/SGID/sticky special bits.",
    "about.p2": "It includes a permission simulator, a fake filesystem, a simulated terminal, 21 learning topics, 11 guided labs, 88 challenges, and a 113-question quiz. Everything is simulated — nothing here touches a real file, shell, or system.",
    "about.p4": "This project focuses on defensive understanding of permissions and does not include or endorse any offensive or exploitation tooling.",
    "about.missionTitle": "Educational mission",
    "about.mission": "Most people learn chmod by copy-pasting a number they half-understand. This project exists to close that gap — to make the permission model something you can see change in real time, break safely, and rebuild from first principles, whether that's flipping a single bit in the Simulator or working through the Expert-tier capstone audit.",
    "about.ossTitle": "Open-source philosophy",
    "about.oss": "The whole project is MIT-licensed and dependency-free by design — no build step, no bundler, no framework lock-in. Anyone should be able to read every line of source, fork it, and deploy their own copy to GitHub Pages in minutes.",
    "about.roadmapTitle": "Roadmap",
    "about.authorTitle": "About the author",
    "about.authorLine": "Linux Permission Lab is created and maintained by",

    "toast.copied": "Copied to clipboard", "toast.copyFailed": "Couldn't copy — select and copy manually",
    "toast.noMoreHints": "No more hints for this one — you've got this.",

    "topic.All": "All", "topic.Permissions": "Permissions", "topic.chmod": "chmod", "topic.Octal": "Octal",
    "topic.Binary": "Binary", "topic.SUID": "SUID", "topic.SGID": "SGID", "topic.Sticky Bit": "Sticky Bit",
    "topic.Security": "Security", "topic.umask": "umask", "topic.ACL": "ACL", "topic.chown": "chown",
    "topic.Symlinks": "Symlinks", "topic.chattr": "chattr", "topic.su-vs-sudo": "su vs sudo",

    "ach.first-steps.title": "First chmod", "ach.first-steps.desc": "Complete your first challenge.",
    "ach.linux-apprentice.title": "Linux Apprentice", "ach.linux-apprentice.desc": "Complete every Beginner challenge.",
    "ach.challenge-hunter.title": "Challenge Hunter", "ach.challenge-hunter.desc": "Complete 10 or more challenges.",
    "ach.permission-master.title": "Permission Master", "ach.permission-master.desc": "Complete all 88 challenges.",
    "ach.suid-explorer.title": "SUID Explorer", "ach.suid-explorer.desc": "Complete 5 or more SUID-related challenges.",
    "ach.special-bits-master.title": "Special Bits Master", "ach.special-bits-master.desc": "Complete every Expert-tier challenge.",
    "ach.quiz-rookie.title": "Quiz Rookie", "ach.quiz-rookie.desc": "Complete your first quiz round.",
    "ach.perfect-score.title": "Perfect Score", "ach.perfect-score.desc": "Score 100% on a 10-question quiz round.",
    "ach.quiz-whiz.title": "Binary Expert", "ach.quiz-whiz.desc": "Answer 50 quiz questions correctly (lifetime).",
    "ach.lab-graduate.title": "Lab Graduate", "ach.lab-graduate.desc": "Complete all 10 interactive labs.",
    "ach.well-rounded.title": "Well Rounded", "ach.well-rounded.desc": "Complete a challenge, a quiz round, and a lab.",
    "ach.path-complete.title": "Path Complete", "ach.path-complete.desc": "Read every Learn topic and finish every Lab, Challenge and at least one Quiz round.",
    "ach.permission-legend.title": "Permission Legend", "ach.permission-legend.desc": "Earn every other achievement.",
  },

  ar: {
    "nav.home": "الرئيسية", "nav.simulator": "المحاكي", "nav.calculator": "الحاسبة", "nav.terminal": "الطرفية",
    "nav.learn": "تعلّم", "nav.labs": "المختبرات", "nav.challenges": "التحديات", "nav.quiz": "الاختبار",
    "nav.cheatsheet": "المرجع السريع", "nav.progress": "التقدّم", "nav.about": "حول المشروع",
    "brand.tagline": "صلاحيات لينكس، بصريًا",
    "lang.toggle": "English",
    "theme.dark": "الوضع الداكن", "theme.light": "الوضع الفاتح",
    "xp.label": "تقدّم المختبر",

    "hero.badge": "يعمل بالكامل داخل متصفحك — بدون تسجيل دخول وبدون خادم",
    "hero.title1": "مختبر", "hero.title2": "صلاحيات", "hero.title3": "لينكس",
    "hero.sub": "ساحة تفاعلية لفهم صلاحيات ملفات لينكس — بدّل بتات الصلاحيات الحقيقية، وشاهد أمر chmod يتحدث لحظيًا، واستكشف نظام ملفات وهميًا، وأثبت فهمك من خلال تحديات عملية.",
    "hero.startLab": "ابدأ المختبر", "hero.docs": "التوثيق",
    "hero.scroll": "مرّر للأسفل",
    "hero.authorBadge": "صُنع بواسطة",

    "home.whatsInside": "ما الذي يحتويه المشروع",
    "home.heading": "منهج تعليمي متكامل، وليس مجرد حاسبة",
    "home.feature.sim.title": "محاكي الصلاحيات",
    "home.feature.sim.desc": "بدّل بين المالك والمجموعة والآخرين مثل مفاتيح إضاءة، وشاهد الصيغة الرمزية والثُمانية والثنائية وأمر chmod تتحدث فورًا.",
    "home.feature.fs.title": "نظام ملفات وهمي",
    "home.feature.fs.desc": "62 ملفًا واقعيًا بالإضافة إلى رابطين رمزيين عبر /etc و/var و/opt و/usr و/tmp و/home و/root — تصفّح أخطاء الصلاحيات الشائعة في الواقع.",
    "home.feature.term.title": "محاكي الطرفية",
    "home.feature.term.desc": "47 أمرًا محاكى — ls و chmod و su و sudo و umask و ln -s، بالإضافة لأوامر فحص النظام مثل ps و journalctl و ss و getcap — مع تطبيق فعلي للصلاحيات على واجهة آمنة وهمية.",
    "home.feature.learn.title": "21 بطاقة تعليمية",
    "home.feature.learn.desc": "كل موضوع أساسي — chmod و chown و umask وقوائم ACL والبتات الخاصة وغيرها — مع رسوم توضيحية وأمثلة وتحذيرات.",
    "home.feature.labs.title": "11 مختبرًا تفاعليًا",
    "home.feature.labs.desc": "خطوات إرشادية متعددة المراحل — من تأمين مفتاح SSH إلى تدقيق شامل ختامي للصلاحيات.",
    "home.feature.challenges.title": "88 تحديًا",
    "home.feature.challenges.desc": "عشرون تحديًا في كل مستوى: مبتدئ، متوسط، متقدم، وخبير — اكسب نقاط الخبرة وارتقِ بمستواك.",
    "home.feature.quiz.title": "اختبار من 113 سؤالاً",
    "home.feature.quiz.desc": "جولات اختيار من متعدد عبر جميع المواضيع، مع تفسيرات فورية وتتبّع لدقة إجاباتك على المدى الطويل.",
    "home.feature.security.title": "محلل الأمان",
    "home.feature.security.desc": "كل حالة صلاحيات تُصنَّف آمنة أو تحذيرية أو حرجة مع شرح مبسّط لسبب ذلك.",
    "home.feature.xp.title": "نقاط الخبرة والمستويات والإنجازات",
    "home.feature.xp.desc": "12 إنجازًا قابلًا للفتح، وتطوّر بالمستوى، وشهادة قابلة للطباعة بعد إتمام المنهج كاملًا.",
    "home.footerNote": "مختبر صلاحيات لينكس v2.3 · محاكاة تعليمية، بدون تنفيذ أوامر حقيقية",

    "hero.stats.topics": "مواضيع تعليمية",
    "hero.stats.quiz": "أسئلة الاختبار",

    "home.how.eyebrow": "كيف يعمل المشروع",
    "home.how.heading": "ثلاث خطوات، بالترتيب",
    "home.how.step1.title": "تعلّم",
    "home.how.step1.desc": "تصفّح 21 بطاقة موضوعية — رسوم توضيحية وأمثلة ونصائح وتحذيرات لكل مفهوم أساسي.",
    "home.how.step2.title": "تدرّب",
    "home.how.step2.desc": "طبّق ما تعلمته في 11 مختبرًا إرشاديًا و88 تحديًا متدرجًا على نظام ملفات وهمي واقعي.",
    "home.how.step3.title": "أثبت فهمك",
    "home.how.step3.desc": "أنهِ اختبار الـ113 سؤالاً، وافتح كل الإنجازات، واطبع شهادتك بعد إكمال المنهج.",

    "footer.tagline": "ساحة تفاعلية داخل المتصفح فقط لفهم نظام صلاحيات لينكس. بدون خادم، بدون تسجيل دخول، بدون خطوة بناء.",
    "footer.col.product": "المنتج",
    "footer.col.learn": "تعلّم",
    "footer.col.project": "المشروع",
    "footer.sourceLink": "الكود المصدري على GitHub",
    "footer.licenseLink": "رخصة MIT",
    "footer.topicsLink": "21 موضوعًا",

    "sim.eyebrow": "الوحدة 01 · 02 · 05 · 06", "sim.title": "محاكي الصلاحيات",
    "sim.desc": "اختر ملفًا من نظام الملفات الوهمي، أو ابنِ الصلاحيات من الصفر. كل تبديل يحدّث المخرجات الحية وتحليل الأمان أدناه فورًا.",
    "sim.fsPanel": "نظام الملفات الوهمي", "sim.editor": "محرر الصلاحيات", "sim.reset": "إعادة تعيين",
    "sim.owner": "المالك", "sim.group": "المجموعة", "sim.others": "الآخرون", "sim.special": "البتات الخاصة", "sim.advanced": "متقدّم",
    "sim.read": "قراءة", "sim.write": "كتابة", "sim.execute": "تنفيذ",
    "sim.liveOutput": "المخرجات الحية", "sim.symbolic": "رمزي", "sim.octal": "ثُماني", "sim.binary": "ثنائي",
    "sim.copy": "نسخ", "sim.securityAnalysis": "تحليل الأمان", "sim.bitsExplained": "شرح البتات الخاصة",
    "sim.suidLabel": "SUID", "sim.sgidLabel": "SGID", "sim.stickyLabel": "اللزوجة",
    "sec.safe": "آمن", "sec.warning": "تحذير", "sec.critical": "حرج",

    "calc.eyebrow": "الوحدة 04", "calc.title": "حاسبة الصلاحيات",
    "calc.desc": "اكتب صيغة ثُمانية أو سلسلة رمزية — يتم التحويل تلقائيًا في كلا الاتجاهين.",
    "calc.octalInput": "إدخال ثُماني", "calc.symbolicInput": "إدخال رمزي", "calc.presets": "قيم جاهزة",
    "calc.result": "النتيجة", "calc.copyChmod": "نسخ كأمر chmod",

    "term.eyebrow": "الوحدة 03", "term.title": "محاكي الطرفية",
    "term.desc": "واجهة طرفية محاكاة فوق نفس نظام الملفات الوهمي. الصلاحيات هنا تُطبَّق فعليًا — جرّب cat /etc/shadow ثم su alice أو sudo أو umask 077 أو ln -s. جديد: افحص النظام بـ ps aux و journalctl و ss -tulpn و getcap -r / أو find / -perm -4000. اكتب help لعرض كل الأوامر.",
    "sc.title": "سيناريوهات عملية",
    "sc.desc": "تحديات تُقيَّم بحالة النظام الفعلية، وتحقيق موجَّه. اعمل في الطرفية أعلاه — يُحكم على إصلاحك بما يستطيع كل حساب فعله بعده، لا بالأمر الذي كتبته. فتح السيناريو يحمّل ملفاته تحت /srv/lab وينقل الطرفية إليه.",
    "sc.kind.challenge": "تحدٍّ",
    "sc.kind.investigation": "تحقيق",
    "sc.list": "اختر سيناريو",
    "sc.open": "افتح",
    "sc.review": "مراجعة",
    "sc.back": "العودة إلى القائمة",
    "sc.objectives": "أهداف التعلّم",
    "sc.task": "المهمة",
    "sc.criteria": "معايير النجاح",
    "sc.incident": "الحادثة",
    "sc.check": "افحص عملي",
    "sc.reset": "إعادة ضبط السيناريو",
    "sc.start": "ابدأ التحقيق",
    "sc.close": "إغلاق السيناريو",
    "sc.hint": "أظهر التلميح التالي",
    "sc.hints": "التلميحات",
    "sc.hintCount": "تلميحات ظاهرة",
    "sc.noMoreHints": "لا مزيد من التلميحات لهذه الخطوة.",
    "sc.attempts": "المحاولات",
    "sc.required": "إلزامي",
    "sc.advisory": "إرشادي",
    "sc.pass": "نجاح",
    "sc.fail": "لم يتحقق بعد",
    "sc.passed": "أحسنت! جميع الشروط الإلزامية متحققة.",
    "sc.notYet": "لم يُحل بعد — ما زالت بعض الشروط الإلزامية غير متحققة.",
    "sc.advisoryNote": "الحل يعمل لكنه أكثر تساهلًا من اللازم:",
    "sc.whyWorks": "لماذا يعمل هذا",
    "sc.xp": "نقطة خبرة",
    "sc.done": "مكتمل",
    "sc.reset.done": "أُعيد السيناريو إلى حالته الأصلية.",
    "sc.loaded": "تم تحميل السيناريو. الطرفية الآن في",
    "sc.phase.briefing": "الإحاطة",
    "sc.phase.evidence": "الأدلة",
    "sc.phase.diagnosis": "التشخيص",
    "sc.phase.remediation": "الإصلاح",
    "sc.phase.verification": "التحقق",
    "sc.phase.complete": "تم",
    "sc.phases": "خطوات التحقيق",
    "sc.phase.current": "الخطوة الحالية",
    "sc.evidence": "سجل الأدلة",
    "sc.evidence.pending": "لم يُجمع بعد",
    "sc.evidence.finding": "النتيجة",
    "sc.evidence.hint": "نفّذ أوامر في الطرفية. يُعلَّم كل بند عندما تفحص الشيء الصحيح.",
    "sc.diagnosis": "التشخيص",
    "sc.diagnosis.locked": "اجمع كل الأدلة أولًا. ما زال ينقص:",
    "sc.diagnosis.pick": "ما السبب الجذري؟",
    "sc.diagnosis.submit": "أرسل التشخيص",
    "sc.diagnosis.none": "اختر تشخيصًا أولًا.",
    "sc.diagnosis.correct": "تشخيص صحيح.",
    "sc.diagnosis.wrong": "ليس هذا هو السبب الجذري.",
    "sc.diagnosis.live": "من المحاكاة:",
    "sc.fix": "طبّق الإصلاح وافحصه",
    "sc.fix.desc": "أصلح المشكلة في الطرفية ثم افحص. يقيّم الفحص حالة النظام المحاكى لا الأمر الذي استخدمته.",
    "sc.fix.check": "افحص إصلاحي",
    "sc.fix.ok": "الحالة سليمة الآن. بقيت خطوة: التحقق.",
    "sc.fix.notyet": "الحالة ما زالت معطوبة:",
    "sc.verify": "التحقق",
    "sc.verify.desc": "أعد فحصًا بصفة الحساب الذي كان يفشل (su www-data ثم اقرأ الصفحة) لتتأكد من الإصلاح من وجهة نظره.",
    "sc.verify.reopened": "لم تعد الحالة سليمة — تم التراجع عن الإصلاح. أصلحها مجددًا.",
    "sc.summary": "ما الذي حدث",
    "sc.summary.final": "الحالة النهائية",
    "sc.summary.wrong": "تشخيصات خاطئة",
    "sc.summary.hints": "التلميحات المستخدمة",
    "sc.resolved": "تم حل التحقيق.",

    "learn.eyebrow": "الوحدة 09 · جديد", "learn.title": "تعلّم",
    "learn.desc": "21 موضوعًا مرجعيًا يغطي نموذج الصلاحيات بالكامل — لكل موضوع رسم توضيحي ومثال وأوامر مرجعية ونصائح وتحذيرات.",
    "learn.searchPlaceholder": "ابحث في المواضيع، مثل SUID أو umask",
    "learn.expandAll": "توسيع الكل", "learn.collapseAll": "طيّ الكل",
    "learn.example": "مثال", "learn.commands": "أمثلة الأوامر", "learn.tips": "نصائح", "learn.warnings": "تحذيرات",
    "learn.readLabel": "مقروء",

    "labs.eyebrow": "الوحدة 10 · جديد", "labs.title": "مختبرات تفاعلية",
    "labs.desc": "أحد عشر مسارًا إرشاديًا متعدد الخطوات — كل مسار يمزج شروحات مختصرة مع نقاط تحقق مُقيَّمة، من إصلاح أول مفتاح SSH إلى تدقيق ختامي شامل.",
    "labs.startLab": "ابدأ المختبر", "labs.review": "مراجعة", "labs.steps": "خطوات",
    "labs.showHint": "إظهار تلميح", "labs.checkAnswer": "تحقق من الإجابة", "labs.continue": "متابعة", "labs.finishLab": "إنهاء المختبر", "labs.done": "تم",
    "labs.explanation": "الشرح", "labs.correct": "إجابة صحيحة.", "labs.incorrect": "ليست صحيحة تمامًا — حاول مجددًا أو اطّلع على التلميح.",

    "ch.eyebrow": "الوحدة 07", "ch.title": "التحديات",
    "ch.desc": "88 تحديًا عبر أربعة مستويات: مبتدئ، متوسط، متقدم، وخبير. اكتب الصيغة الثُمانية التي تحل كل سيناريو واكسب نقاط الخبرة.",
    "ch.random": "🎲 تحدٍّ عشوائي", "ch.attempt": "حاول", "ch.review": "مراجعة", "ch.target": "الهدف",
    "ch.tier.All": "الكل", "ch.tier.Beginner": "مبتدئ", "ch.tier.Intermediate": "متوسط", "ch.tier.Advanced": "متقدم", "ch.tier.Expert": "خبير",
    "ch.scenario": "السيناريو", "ch.yourAnswer": "إجابتك — الصيغة الثُمانية", "ch.showHint": "إظهار تلميح", "ch.checkAnswer": "تحقق من الإجابة",
    "ch.notQuite": "ليست صحيحة تمامًا — حاول مجددًا أو اطّلع على تلميح.",
    "ch.whyWorks": "لماذا هذا صحيح", "ch.empty": "لا توجد تحديات في هذا المستوى.",

    "quiz.eyebrow": "الوحدة 08 · جديد", "quiz.title": "الاختبار",
    "quiz.desc": "113 سؤال اختيار من متعدد عبر جميع المواضيع. كل جولة 10 أسئلة — صفِّها حسب الموضوع أو اخلطها جميعًا.",
    "quiz.question": "سؤال", "quiz.score": "النتيجة", "quiz.correct": "إجابة صحيحة", "quiz.notQuite": "ليست صحيحة تمامًا",
    "quiz.nextQuestion": "السؤال التالي", "quiz.seeResults": "عرض النتائج", "quiz.roundComplete": "انتهت الجولة",
    "quiz.perfect": "نتيجة كاملة — عمل رائع.", "quiz.solid": "جولة جيدة. راجع المواضيع التي أخطأت فيها من خلال وحدة تعلّم.",
    "quiz.revisit": "تستحق المراجعة — جرّب وحدة تعلّم للمواضيع التي واجهت صعوبة فيها.",
    "quiz.roundsPlayed": "الجولات الملعوبة", "quiz.bestRound": "أفضل نتيجة جولة", "quiz.lifetimeAccuracy": "الدقة الكلية",
    "quiz.startAnother": "ابدأ جولة أخرى",

    "cheat.eyebrow": "الوحدة 11", "cheat.title": "المرجع السريع",
    "cheat.desc": "الصيغ التي ستستخدمها فعليًا، في جدول مرجعي واحد.",
    "cheat.searchPlaceholder": "ابحث عن صيغة، مثل 600 أو مفتاح ssh",
    "cheat.colOctal": "ثُماني", "cheat.colSymbolic": "رمزي", "cheat.colWhen": "متى تستخدمها",
    "cheat.readingDigits": "قراءة الأرقام", "cheat.binaryRef": "المرجع الثنائي", "cheat.specialBits": "البتات الخاصة",
    "cheat.allCommands": "كل أوامر الطرفية", "cheat.allCommandsDesc": "كل أمر تفهمه محاكاة الطرفية، مع كل خيار يدعمه فعليًا — نفس القائمة اللي يطبعها \"help\" داخل الطرفية. مربع البحث أعلاه يفلتر هذا الجدول أيضًا.",
    "cheat.colCommand": "الأمر", "cheat.colDoes": "ماذا يفعل", "cheat.colRequires": "يتطلب",
    "cheat.troubleshooting": "استكشاف أخطاء الصلاحيات", "cheat.bestPractices": "أفضل الممارسات",

    "progress.eyebrow": "الوحدة 12 · جديد", "progress.title": "التقدّم",
    "progress.desc": "نقاط خبرتك ومستواك وإحصاءاتك عبر التحديات والمختبرات والاختبار — بالإضافة إلى الإنجازات وشهادة بعد إتمام المنهج.",
    "progress.level": "المستوى", "progress.totalXP": "إجمالي نقاط الخبرة", "progress.xpToNext": "نقطة خبرة للمستوى",
    "progress.challengesCompleted": "التحديات المكتملة", "progress.labsCompleted": "المختبرات المكتملة",
    "progress.roundsPlayed": "جولات الاختبار الملعوبة", "progress.quizAccuracy": "دقة الاختبار", "progress.bestQuizRound": "أفضل جولة اختبار",
    "progress.achievements": "الإنجازات", "progress.certificate": "شهادة الإتمام",
    "progress.dangerZone": "تصفير التقدّم", "progress.resetDesc": "يمسح تقدّم التحديات واللابات والكويز والمواضيع المقروءة بهذا الجهاز — بما فيها XP والمستوى والإنجازات، لأنها كلها محسوبة من نفس البيانات. لغتك والوضع (فاتح/غامق) يبقون كما هم. ما يمكن التراجع عن هذا.",
    "progress.resetBtn": "صفّر كل التقدّم", "progress.resetConfirm": "تصفير كل التقدّم؟ هذا يمسح تاريخ التحديات واللابات والكويز والمواضيع المقروءة بهذا الجهاز وما يمكن التراجع عنه.",
    "progress.resetDone": "تم تصفير التقدّم. XP والمستوى والإنجازات رجعوا للصفر.",
    "progress.certLocked": "مقفلة — أكمل جميع الـ88 تحديًا وكل الـ11 مختبرًا لفتح شهادتك. نسبة التقدّم الحالية:",
    "progress.certUnlockedLine1": "تشهد هذه الوثيقة بإتمام جميع التحديات والمختبرات التفاعلية في المنهج —",
    "progress.certUnlockedLine2": "88/88 تحديًا · 11/11 مختبرًا · مُنحت بناءً على تقدّمك المحلي في متصفحك، وليست جهة اعتماد رسمية.",
    "progress.printCert": "طباعة الشهادة", "progress.earned": "مكتسَب", "progress.locked": "مقفل",
    "progress.share.title": "شارك تقدّمك",
    "progress.share.desc": "انسخ ملخّصًا من سطر واحد لمشاركته، أو نزّل لقطة JSON لنقاط خبرتك ونسبة إتمامك وإنجازاتك — يبقى كل شيء محليًا في متصفحك حتى تختار مشاركته.",
    "progress.share.copyBtn": "نسخ الملخّص", "progress.share.downloadBtn": "تنزيل JSON",
    "progress.share.exportSuccess": "تم تصدير التقدّم بصيغة JSON", "progress.share.exportError": "تعذّر إنشاء ملف التصدير — حاول مجددًا",
    "path.title": "مسارك", "path.desc": "ترتيب مقترح لخوض المختبر بالكامل: اقرأ كل موضوع، ثم أثبت فهمك في المختبرات والتحديات وجولة اختبار.",
    "path.continue": "التالي:", "path.quizDone": "تم اللعب", "path.quizTodo": "لم تُلعب بعد",
    "path.allDone": "اكتمل المسار — قرأت كل موضوع، وأنهيت كل مختبر وتحدٍّ، ولعبت جولة اختبار.",

    "about.eyebrow": "حول المشروع", "about.title": "ما هو هذا المشروع، وما ليس هو",
    "about.p1": "مختبر صلاحيات لينكس أداة تعليمية تعمل داخل المتصفح لشرح نموذج صلاحيات لينكس: ثلاثية المالك والمجموعة والآخرين، والصيغتان الثُمانية والرمزية، والملكية، وقوائم ACL، وبتات SUID و SGID واللزوجة الخاصة.",
    "about.p2": "يضم المشروع محاكي صلاحيات، ونظام ملفات وهمي، وطرفية محاكاة، و21 موضوعًا تعليميًا، و11 مختبرًا إرشاديًا، و88 تحديًا، واختبارًا من 113 سؤالاً. كل شيء مُحاكى — لا شيء هنا يلمس ملفًا أو نظامًا حقيقيًا.",
    "about.p4": "يركّز هذا المشروع على الفهم الدفاعي للصلاحيات، ولا يتضمن أو يروّج لأي أدوات هجومية أو استغلالية.",
    "about.missionTitle": "الرسالة التعليمية",
    "about.mission": "يتعلم معظم الناس أمر chmod بنسخ رقم لا يفهمونه تمامًا. يهدف هذا المشروع لسد تلك الفجوة — بجعل نموذج الصلاحيات شيئًا يمكنك رؤيته يتغيّر لحظيًا، وكسره بأمان، وإعادة بنائه من الأساس، سواء كان ذلك بتبديل بتة واحدة في المحاكي أو بإتمام تدقيق مستوى الخبير الختامي.",
    "about.ossTitle": "فلسفة المصدر المفتوح",
    "about.oss": "المشروع بأكمله مرخّص بموجب MIT وخالٍ من أي اعتماديات بالتصميم — بدون خطوة بناء، وبدون حزمة تجميع، وبدون ارتباط بإطار عمل معيّن. يمكن لأي شخص قراءة كل سطر من الشيفرة المصدرية، ونسخ المشروع، ونشر نسخته الخاصة على GitHub Pages خلال دقائق.",
    "about.roadmapTitle": "خارطة الطريق",
    "about.authorTitle": "حول المطوّر",
    "about.authorLine": "مختبر صلاحيات لينكس من إنشاء وصيانة",

    "toast.copied": "تم النسخ إلى الحافظة", "toast.copyFailed": "تعذّر النسخ — حدّد النص وانسخه يدويًا",
    "toast.noMoreHints": "لا مزيد من التلميحات لهذا التحدي — يمكنك حله بنفسك.",

    "topic.All": "الكل", "topic.Permissions": "الصلاحيات", "topic.chmod": "chmod", "topic.Octal": "الثُماني",
    "topic.Binary": "الثنائي", "topic.SUID": "SUID", "topic.SGID": "SGID", "topic.Sticky Bit": "بت اللزوجة",
    "topic.Security": "الأمان", "topic.umask": "umask", "topic.ACL": "ACL", "topic.chown": "chown",
    "topic.Symlinks": "الروابط الرمزية", "topic.chattr": "chattr", "topic.su-vs-sudo": "su مقابل sudo",

    "ach.first-steps.title": "أول أمر chmod", "ach.first-steps.desc": "أكمل تحديك الأول.",
    "ach.linux-apprentice.title": "متدرّب لينكس", "ach.linux-apprentice.desc": "أكمل كل تحديات المستوى المبتدئ.",
    "ach.challenge-hunter.title": "صائد التحديات", "ach.challenge-hunter.desc": "أكمل 10 تحديات أو أكثر.",
    "ach.permission-master.title": "خبير الصلاحيات", "ach.permission-master.desc": "أكمل جميع الـ88 تحديًا.",
    "ach.suid-explorer.title": "مستكشف SUID", "ach.suid-explorer.desc": "أكمل 5 تحديات أو أكثر متعلقة بـ SUID.",
    "ach.special-bits-master.title": "خبير البتات الخاصة", "ach.special-bits-master.desc": "أكمل كل تحديات مستوى الخبير.",
    "ach.quiz-rookie.title": "مبتدئ الاختبار", "ach.quiz-rookie.desc": "أكمل أول جولة اختبار لك.",
    "ach.perfect-score.title": "نتيجة كاملة", "ach.perfect-score.desc": "احصل على 100% في جولة اختبار من 10 أسئلة.",
    "ach.quiz-whiz.title": "خبير الثنائي", "ach.quiz-whiz.desc": "أجب بشكل صحيح على 50 سؤال اختبار (إجمالي).",
    "ach.lab-graduate.title": "خريج المختبرات", "ach.lab-graduate.desc": "أكمل كل المختبرات التفاعلية العشرة.",
    "ach.well-rounded.title": "متكامل", "ach.well-rounded.desc": "أكمل تحديًا وجولة اختبار ومختبرًا واحدًا.",
    "ach.path-complete.title": "المسار مكتمل", "ach.path-complete.desc": "اقرأ كل مواضيع التعلّم وأنهِ كل مختبر وتحدٍّ وجولة اختبار واحدة على الأقل.",
    "ach.permission-legend.title": "أسطورة الصلاحيات", "ach.permission-legend.desc": "احصل على كل الإنجازات الأخرى.",
  },
};
