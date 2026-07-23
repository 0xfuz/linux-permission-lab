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

/** Merge an Arabic overlay (keyed by id) onto an English array when locale is 'ar'. */
export function localize(items, overlay) {
  if (locale !== "ar" || !overlay) return items;
  return items.map((item) => (overlay[item.id] ? { ...item, ...overlay[item.id] } : item));
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

const DICT = {
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
    "hero.authorBadge": "Created with ❤ by",

    "home.whatsInside": "What's inside",
    "home.heading": "A full curriculum, not just a calculator",
    "home.feature.sim.title": "Permission Simulator",
    "home.feature.sim.desc": "Toggle owner, group and others like LED switches and watch symbolic, octal, binary and the chmod command update instantly.",
    "home.feature.fs.title": "Fake Filesystem",
    "home.feature.fs.desc": "59 realistic files across /etc, /var, /opt, /usr, /tmp, /home and /root — click through real-world permission mistakes.",
    "home.feature.term.title": "Terminal Simulator",
    "home.feature.term.desc": "20+ simulated commands — ls, chmod, chown, find, grep, tree, stat and more — over a safe, fake shell.",
    "home.feature.learn.title": "19 Learning Cards",
    "home.feature.learn.desc": "Every core topic — chmod, chown, umask, ACLs, special bits and more — with diagrams, examples, and warnings.",
    "home.feature.labs.title": "10 Interactive Labs",
    "home.feature.labs.desc": "Guided, multi-step walkthroughs — from securing an SSH key to a full capstone permission audit.",
    "home.feature.challenges.title": "80 Challenges",
    "home.feature.challenges.desc": "Twenty each across Beginner, Intermediate, Advanced and Expert — earn XP and level up as you go.",
    "home.feature.quiz.title": "100-Question Quiz",
    "home.feature.quiz.desc": "Multiple-choice rounds across every topic, with instant explanations and lifetime accuracy tracking.",
    "home.feature.security.title": "Security Analyzer",
    "home.feature.security.desc": "Every permission state is graded Safe, Warning or Critical with a plain-language explanation of why.",
    "home.feature.xp.title": "XP, Levels & Achievements",
    "home.feature.xp.desc": "12 unlockable achievements, level progression, and a printable certificate once you clear the curriculum.",
    "home.footerNote": "Linux Permission Lab v2.2 · Educational simulation, no real shell execution",

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
    "term.desc": "A simulated shell over the same fake filesystem. Try ls -la, tree, find shadow, stat backup.sql, or chmod 600 backup.sql. Type help for the full command list.",

    "learn.eyebrow": "Module 09 · New", "learn.title": "Learn",
    "learn.desc": "19 reference topics covering the full permission model — each with a diagram, an example, command references, tips and warnings.",
    "learn.searchPlaceholder": "Search topics, e.g. SUID or umask",
    "learn.expandAll": "Expand all", "learn.collapseAll": "Collapse all",
    "learn.example": "Example", "learn.commands": "Command examples", "learn.tips": "Tips", "learn.warnings": "Warnings",

    "labs.eyebrow": "Module 10 · New", "labs.title": "Interactive Labs",
    "labs.desc": "Ten guided, multi-step walkthroughs — each mixes short explanations with graded checkpoints, from a first SSH key fix to a full capstone audit.",
    "labs.startLab": "Start lab", "labs.review": "Review", "labs.steps": "steps",
    "labs.showHint": "Show hint", "labs.checkAnswer": "Check answer", "labs.continue": "Continue", "labs.finishLab": "Finish lab", "labs.done": "Done",
    "labs.explanation": "Explanation", "labs.correct": "Correct.", "labs.incorrect": "Not quite — try again, or reveal the hint.",

    "ch.eyebrow": "Module 07", "ch.title": "Challenges",
    "ch.desc": "80 labs across four tiers — Beginner, Intermediate, Advanced and Expert. Type the octal mode that solves each scenario and earn XP.",
    "ch.random": "🎲 Random challenge", "ch.attempt": "Attempt", "ch.review": "Review", "ch.target": "target",
    "ch.tier.All": "All", "ch.tier.Beginner": "Beginner", "ch.tier.Intermediate": "Intermediate", "ch.tier.Advanced": "Advanced", "ch.tier.Expert": "Expert",
    "ch.scenario": "Scenario", "ch.yourAnswer": "Your answer — octal mode", "ch.showHint": "Show hint", "ch.checkAnswer": "Check answer",
    "ch.whyWorks": "Why this works", "ch.empty": "No challenges in this tier.",

    "quiz.eyebrow": "Module 08 · New", "quiz.title": "Quiz",
    "quiz.desc": "100 multiple-choice questions across every topic. Rounds are 10 questions — filter by topic or mix them all.",
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
    "cheat.commonCommands": "Common Linux commands", "cheat.colCommand": "Command", "cheat.colDoes": "What it does",
    "cheat.troubleshooting": "Permission troubleshooting", "cheat.bestPractices": "Best practices",

    "progress.eyebrow": "Module 12 · New", "progress.title": "Progress",
    "progress.desc": "Your XP, level, and stats across Challenges, Labs and Quiz — plus achievements and a certificate once you clear the curriculum.",
    "progress.level": "Level", "progress.totalXP": "total XP", "progress.xpToNext": "XP to level",
    "progress.challengesCompleted": "Challenges completed", "progress.labsCompleted": "Labs completed",
    "progress.roundsPlayed": "Quiz rounds played", "progress.quizAccuracy": "Quiz accuracy", "progress.bestQuizRound": "Best quiz round",
    "progress.achievements": "Achievements", "progress.certificate": "Certificate of Completion",
    "progress.certLocked": "Locked — complete all 80 challenges and all 10 labs to unlock your certificate. Currently at",
    "progress.certUnlockedLine1": "This certifies the completion of every challenge and interactive lab in the curriculum —",
    "progress.certUnlockedLine2": "80/80 challenges · 10/10 labs · awarded by your own browser's local progress, not a registrar.",
    "progress.printCert": "Print certificate", "progress.earned": "Earned", "progress.locked": "Locked",

    "about.eyebrow": "About", "about.title": "What this is, and isn't",
    "about.p1": "Linux Permission Lab is a browser-based teaching tool for the Linux permission model — the owner/group/others triad, octal and symbolic notation, ownership, ACLs, and the SUID/SGID/sticky special bits.",
    "about.p2": "It includes a permission simulator, a fake filesystem, a simulated terminal, 19 learning topics, 10 guided labs, 80 challenges, and a 100-question quiz. Everything is simulated — nothing here touches a real file, shell, or system.",
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

    "ach.first-steps.title": "First chmod", "ach.first-steps.desc": "Complete your first challenge.",
    "ach.linux-apprentice.title": "Linux Apprentice", "ach.linux-apprentice.desc": "Complete every Beginner challenge.",
    "ach.challenge-hunter.title": "Challenge Hunter", "ach.challenge-hunter.desc": "Complete 10 or more challenges.",
    "ach.permission-master.title": "Permission Master", "ach.permission-master.desc": "Complete all 80 challenges.",
    "ach.suid-explorer.title": "SUID Explorer", "ach.suid-explorer.desc": "Complete 5 or more SUID-related challenges.",
    "ach.special-bits-master.title": "Special Bits Master", "ach.special-bits-master.desc": "Complete every Expert-tier challenge.",
    "ach.quiz-rookie.title": "Quiz Rookie", "ach.quiz-rookie.desc": "Complete your first quiz round.",
    "ach.perfect-score.title": "Perfect Score", "ach.perfect-score.desc": "Score 100% on a 10-question quiz round.",
    "ach.quiz-whiz.title": "Binary Expert", "ach.quiz-whiz.desc": "Answer 50 quiz questions correctly (lifetime).",
    "ach.lab-graduate.title": "Lab Graduate", "ach.lab-graduate.desc": "Complete all 10 interactive labs.",
    "ach.well-rounded.title": "Well Rounded", "ach.well-rounded.desc": "Complete a challenge, a quiz round, and a lab.",
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
    "hero.authorBadge": "صُنع بحب ❤ بواسطة",

    "home.whatsInside": "ما الذي يحتويه المشروع",
    "home.heading": "منهج تعليمي متكامل، وليس مجرد حاسبة",
    "home.feature.sim.title": "محاكي الصلاحيات",
    "home.feature.sim.desc": "بدّل بين المالك والمجموعة والآخرين مثل مفاتيح إضاءة، وشاهد الصيغة الرمزية والثُمانية والثنائية وأمر chmod تتحدث فورًا.",
    "home.feature.fs.title": "نظام ملفات وهمي",
    "home.feature.fs.desc": "59 ملفًا واقعيًا عبر /etc و/var و/opt و/usr و/tmp و/home و/root — تصفّح أخطاء الصلاحيات الشائعة في الواقع.",
    "home.feature.term.title": "محاكي الطرفية",
    "home.feature.term.desc": "أكثر من 20 أمرًا محاكى — ls و chmod و chown و find و grep و tree و stat وغيرها — على واجهة آمنة وهمية.",
    "home.feature.learn.title": "19 بطاقة تعليمية",
    "home.feature.learn.desc": "كل موضوع أساسي — chmod و chown و umask وقوائم ACL والبتات الخاصة وغيرها — مع رسوم توضيحية وأمثلة وتحذيرات.",
    "home.feature.labs.title": "10 مختبرات تفاعلية",
    "home.feature.labs.desc": "خطوات إرشادية متعددة المراحل — من تأمين مفتاح SSH إلى تدقيق شامل ختامي للصلاحيات.",
    "home.feature.challenges.title": "80 تحديًا",
    "home.feature.challenges.desc": "عشرون تحديًا في كل مستوى: مبتدئ، متوسط، متقدم، وخبير — اكسب نقاط الخبرة وارتقِ بمستواك.",
    "home.feature.quiz.title": "اختبار من 100 سؤال",
    "home.feature.quiz.desc": "جولات اختيار من متعدد عبر جميع المواضيع، مع تفسيرات فورية وتتبّع لدقة إجاباتك على المدى الطويل.",
    "home.feature.security.title": "محلل الأمان",
    "home.feature.security.desc": "كل حالة صلاحيات تُصنَّف آمنة أو تحذيرية أو حرجة مع شرح مبسّط لسبب ذلك.",
    "home.feature.xp.title": "نقاط الخبرة والمستويات والإنجازات",
    "home.feature.xp.desc": "12 إنجازًا قابلًا للفتح، وتطوّر بالمستوى، وشهادة قابلة للطباعة بعد إتمام المنهج كاملًا.",
    "home.footerNote": "مختبر صلاحيات لينكس v2.2 · محاكاة تعليمية، بدون تنفيذ أوامر حقيقية",

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
    "term.desc": "واجهة طرفية محاكاة فوق نفس نظام الملفات الوهمي. جرّب ls -la أو tree أو find shadow أو stat backup.sql أو chmod 600 backup.sql. اكتب help لعرض كل الأوامر.",

    "learn.eyebrow": "الوحدة 09 · جديد", "learn.title": "تعلّم",
    "learn.desc": "19 موضوعًا مرجعيًا يغطي نموذج الصلاحيات بالكامل — لكل موضوع رسم توضيحي ومثال وأوامر مرجعية ونصائح وتحذيرات.",
    "learn.searchPlaceholder": "ابحث في المواضيع، مثل SUID أو umask",
    "learn.expandAll": "توسيع الكل", "learn.collapseAll": "طيّ الكل",
    "learn.example": "مثال", "learn.commands": "أمثلة الأوامر", "learn.tips": "نصائح", "learn.warnings": "تحذيرات",

    "labs.eyebrow": "الوحدة 10 · جديد", "labs.title": "مختبرات تفاعلية",
    "labs.desc": "عشرة مسارات إرشادية متعددة الخطوات — كل مسار يمزج شروحات مختصرة مع نقاط تحقق مُقيَّمة، من إصلاح أول مفتاح SSH إلى تدقيق ختامي شامل.",
    "labs.startLab": "ابدأ المختبر", "labs.review": "مراجعة", "labs.steps": "خطوات",
    "labs.showHint": "إظهار تلميح", "labs.checkAnswer": "تحقق من الإجابة", "labs.continue": "متابعة", "labs.finishLab": "إنهاء المختبر", "labs.done": "تم",
    "labs.explanation": "الشرح", "labs.correct": "إجابة صحيحة.", "labs.incorrect": "ليست صحيحة تمامًا — حاول مجددًا أو اطّلع على التلميح.",

    "ch.eyebrow": "الوحدة 07", "ch.title": "التحديات",
    "ch.desc": "80 تحديًا عبر أربعة مستويات: مبتدئ، متوسط، متقدم، وخبير. اكتب الصيغة الثُمانية التي تحل كل سيناريو واكسب نقاط الخبرة.",
    "ch.random": "🎲 تحدٍّ عشوائي", "ch.attempt": "حاول", "ch.review": "مراجعة", "ch.target": "الهدف",
    "ch.tier.All": "الكل", "ch.tier.Beginner": "مبتدئ", "ch.tier.Intermediate": "متوسط", "ch.tier.Advanced": "متقدم", "ch.tier.Expert": "خبير",
    "ch.scenario": "السيناريو", "ch.yourAnswer": "إجابتك — الصيغة الثُمانية", "ch.showHint": "إظهار تلميح", "ch.checkAnswer": "تحقق من الإجابة",
    "ch.whyWorks": "لماذا هذا صحيح", "ch.empty": "لا توجد تحديات في هذا المستوى.",

    "quiz.eyebrow": "الوحدة 08 · جديد", "quiz.title": "الاختبار",
    "quiz.desc": "100 سؤال اختيار من متعدد عبر جميع المواضيع. كل جولة 10 أسئلة — صفِّها حسب الموضوع أو اخلطها جميعًا.",
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
    "cheat.commonCommands": "أوامر لينكس الشائعة", "cheat.colCommand": "الأمر", "cheat.colDoes": "ماذا يفعل",
    "cheat.troubleshooting": "استكشاف أخطاء الصلاحيات", "cheat.bestPractices": "أفضل الممارسات",

    "progress.eyebrow": "الوحدة 12 · جديد", "progress.title": "التقدّم",
    "progress.desc": "نقاط خبرتك ومستواك وإحصاءاتك عبر التحديات والمختبرات والاختبار — بالإضافة إلى الإنجازات وشهادة بعد إتمام المنهج.",
    "progress.level": "المستوى", "progress.totalXP": "إجمالي نقاط الخبرة", "progress.xpToNext": "نقطة خبرة للمستوى",
    "progress.challengesCompleted": "التحديات المكتملة", "progress.labsCompleted": "المختبرات المكتملة",
    "progress.roundsPlayed": "جولات الاختبار الملعوبة", "progress.quizAccuracy": "دقة الاختبار", "progress.bestQuizRound": "أفضل جولة اختبار",
    "progress.achievements": "الإنجازات", "progress.certificate": "شهادة الإتمام",
    "progress.certLocked": "مقفلة — أكمل جميع التحديات الثمانين وكل المختبرات العشرة لفتح شهادتك. نسبة التقدّم الحالية:",
    "progress.certUnlockedLine1": "تشهد هذه الوثيقة بإتمام جميع التحديات والمختبرات التفاعلية في المنهج —",
    "progress.certUnlockedLine2": "80/80 تحديًا · 10/10 مختبرات · مُنحت بناءً على تقدّمك المحلي في متصفحك، وليست جهة اعتماد رسمية.",
    "progress.printCert": "طباعة الشهادة", "progress.earned": "مكتسَب", "progress.locked": "مقفل",

    "about.eyebrow": "حول المشروع", "about.title": "ما هو هذا المشروع، وما ليس هو",
    "about.p1": "مختبر صلاحيات لينكس أداة تعليمية تعمل داخل المتصفح لشرح نموذج صلاحيات لينكس: ثلاثية المالك والمجموعة والآخرين، والصيغتان الثُمانية والرمزية، والملكية، وقوائم ACL، وبتات SUID و SGID واللزوجة الخاصة.",
    "about.p2": "يضم المشروع محاكي صلاحيات، ونظام ملفات وهمي، وطرفية محاكاة، و19 موضوعًا تعليميًا، و10 مختبرات إرشادية، و80 تحديًا، واختبارًا من 100 سؤال. كل شيء مُحاكى — لا شيء هنا يلمس ملفًا أو نظامًا حقيقيًا.",
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

    "ach.first-steps.title": "أول أمر chmod", "ach.first-steps.desc": "أكمل تحديك الأول.",
    "ach.linux-apprentice.title": "متدرّب لينكس", "ach.linux-apprentice.desc": "أكمل كل تحديات المستوى المبتدئ.",
    "ach.challenge-hunter.title": "صائد التحديات", "ach.challenge-hunter.desc": "أكمل 10 تحديات أو أكثر.",
    "ach.permission-master.title": "خبير الصلاحيات", "ach.permission-master.desc": "أكمل جميع التحديات الثمانين.",
    "ach.suid-explorer.title": "مستكشف SUID", "ach.suid-explorer.desc": "أكمل 5 تحديات أو أكثر متعلقة بـ SUID.",
    "ach.special-bits-master.title": "خبير البتات الخاصة", "ach.special-bits-master.desc": "أكمل كل تحديات مستوى الخبير.",
    "ach.quiz-rookie.title": "مبتدئ الاختبار", "ach.quiz-rookie.desc": "أكمل أول جولة اختبار لك.",
    "ach.perfect-score.title": "نتيجة كاملة", "ach.perfect-score.desc": "احصل على 100% في جولة اختبار من 10 أسئلة.",
    "ach.quiz-whiz.title": "خبير الثنائي", "ach.quiz-whiz.desc": "أجب بشكل صحيح على 50 سؤال اختبار (إجمالي).",
    "ach.lab-graduate.title": "خريج المختبرات", "ach.lab-graduate.desc": "أكمل كل المختبرات التفاعلية العشرة.",
    "ach.well-rounded.title": "متكامل", "ach.well-rounded.desc": "أكمل تحديًا وجولة اختبار ومختبرًا واحدًا.",
    "ach.permission-legend.title": "أسطورة الصلاحيات", "ach.permission-legend.desc": "احصل على كل الإنجازات الأخرى.",
  },
};
