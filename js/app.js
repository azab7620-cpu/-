'use strict';

// ═══════════════════════════════════════════════════════════
//  📋 نص قانوني
// ═══════════════════════════════════════════════════════════
const LEGAL_TEXT = {
    privacy: `<h3>سياسة الخصوصية</h3>
        <p>نحترم خصوصية طلابنا وأولياء أمورهم، ونوضح هنا باختصار كيف نتعامل مع بياناتكم.</p>
        <h5>البيانات التي نجمعها</h5>
        <ul><li>الاسم والبريد الإلكتروني وأرقام الهاتف (الطالب وولي الأمر).</li><li>المحافظة والمركز والمرحلة والصف الدراسي.</li><li>نتائج الاختبارات ونشاط الطالب داخل المنصة.</li></ul>
        <h5>كيف نستخدمها</h5>
        <p>نستخدم البيانات لتفعيل الحساب، وعرض المحتوى المناسب لصف الطالب، وتصحيح الاختبارات، والتواصل عند الحاجة. لا نبيع بياناتكم لأي طرف.</p>
        <h5>التواصل</h5>
        <p>لأي استفسار أو طلب حذف بيانات تواصل معنا عبر الدعم الفني.</p>`,
    terms: `<h3>شروط الاستخدام</h3>
        <p>باستخدامك المنصة فإنك توافق على الشروط التالية:</p>
        <ul><li>الحساب شخصي ولا يجوز مشاركته مع الآخرين.</li><li>المحتوى (فيديوهات وكتب واختبارات) مخصص للاستخدام الشخصي ولا يجوز نسخه أو إعادة نشره.</li><li>يمنع محاولة الغش أو العبث بالاختبارات أو بالمنصة.</li><li>يحق للإدارة إيقاف أي حساب يخالف هذه الشروط.</li><li>قد نقوم بتحديث المحتوى والشروط من وقت لآخر.</li></ul>`
};

// ═══════════════════════════════════════════════════════════
//  State
// ═══════════════════════════════════════════════════════════
let currentUser = null;
let currentExam = null;
let currentBundle = null;
let currentQIndex = 0;
let answers = [];
let examInProgress = false;
let currentAttemptUnsub = null;
let ignoreAuthChange = false;

// ═══════════════════════════════════════════════════════════
//  نسيت كلمة المرور + Legal
// ═══════════════════════════════════════════════════════════
async function resetPassword() {
    const email = document.getElementById('loginEmailOrPhone').value.trim();
    if (!email) { showToast('اكتب بريدك الإلكتروني أولاً ثم اضغط "نسيت كلمة المرور".', 'warn'); return; }
    try {
        await auth.sendPasswordResetEmail(email);
        showToast('✅ لو البريد مسجل عندنا، هيوصلك رابط لإعادة تعيين كلمة المرور.');
    } catch (err) {
        if (err.code === 'auth/invalid-email') showToast('❌ البريد الإلكتروني غير صحيح.');
        else if (err.code === 'auth/too-many-requests') showToast('محاولات كثيرة، حاول لاحقاً.', 'warn');
        else showToast('✅ لو البريد مسجل عندنا، هيوصلك رابط لإعادة تعيين كلمة المرور.');
    }
}

function openLegal(kind) {
    document.getElementById('legalContent').innerHTML = LEGAL_TEXT[kind] || '';
    document.getElementById('legalModal').style.display = 'flex';
}
function closeLegal() {
    document.getElementById('legalModal').style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
//  Dark Mode
// ═══════════════════════════════════════════════════════════
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode') ? 'true' : 'false');
    updateDarkModeButtons();
}
function updateDarkModeButtons() {
    const isDark = document.body.classList.contains('dark-mode');
    document.querySelectorAll('.btn-icon').forEach(btn => {
        if (btn.querySelector && btn.querySelector('span')) return;
        btn.textContent = isDark ? '☀️' : '🌙';
    });
}
function loadDarkModePreference() {
    if (localStorage.getItem('darkMode') === 'true') document.body.classList.add('dark-mode');
    updateDarkModeButtons();
}

// ═══════════════════════════════════════════════════════════
//  Navigation
// ═══════════════════════════════════════════════════════════
function setActiveNav(el) {
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    if (el) el.classList.add('active');
}
function showNavLinks() {
    const navLinks = document.getElementById('navLinks');
    if (navLinks) navLinks.style.display = 'flex';
}
function hideNavLinks() {
    const navLinks = document.getElementById('navLinks');
    if (navLinks) navLinks.style.display = 'none';
}
function scrollToSection(sectionId) {
    if (document.getElementById('homeSection').style.display === 'none') showHome();
    setTimeout(() => {
        const section = document.getElementById(sectionId);
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

function showHome() {
    document.getElementById('homeSection').style.display = 'block';
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('studentDashboard').classList.remove('active');
    document.getElementById('courseDetailView').classList.remove('active');
    document.getElementById('examPage').classList.remove('active');
    document.querySelector('header').style.display = 'block';
    document.querySelector('footer').style.display = 'block';
    document.querySelector('.support-float-btn').style.display = 'flex';
    showNavLinks();
    setActiveNav(document.querySelector('.nav-links a[data-nav="home"]'));
    renderTeachers(); renderCourses(); renderBooks();
    window.scrollTo(0, 0);
}

function showAuthPage(mode) {
    document.getElementById('homeSection').style.display = 'none';
    document.getElementById('authSection').style.display = 'block';
    document.getElementById('studentDashboard').classList.remove('active');
    document.getElementById('courseDetailView').classList.remove('active');
    document.getElementById('examPage').classList.remove('active');
    hideNavLinks();
    switchAuthView(mode);
    window.scrollTo(0, 0);
}

function switchAuthView(mode) {
    document.getElementById('registerFormContainer').style.display = (mode === 'register') ? 'block' : 'none';
    document.getElementById('loginFormContainer').style.display = (mode === 'login') ? 'block' : 'none';
}

function togglePassword(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.type = (el.type === 'password') ? 'text' : 'password';
}

function toggleCenterField() {
    const isOutside = document.getElementById('regIsOutside').checked;
    document.getElementById('regCenterContainer').style.display = isOutside ? 'none' : 'block';
}

// ═══════════════════════════════════════════════════════════
//  Render Teachers / Courses / Books
// ═══════════════════════════════════════════════════════════
async function getTeachersPublic() {
    const snap = await db.collection('teachers').get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function buildTeacherCardHTML(t, i) {
    const imgHTML = t.image
        ? `<img src="${esc(safeUrl(t.image))}" alt="${esc(t.name)}">`
        : `<div class="avatar-placeholder">👨‍🏫</div>`;
    return `
        <div class="teacher-card animate-scale" style="animation-delay:${i*0.1}s;">
            ${imgHTML}
            <h4>${esc(t.name)}</h4>
            <p>${esc(t.specialty || 'مدرس')}</p>
            <button type="button" class="btn-card" data-action="show-auth" data-mode="login">شوف الكورسات</button>
        </div>
    `;
}

async function renderTeachers() {
    const grid = document.getElementById('teachersGrid');
    if (!grid) return;

    const cached = localStorage.getItem('cache_teachers');
    if (cached) {
        try {
            const teachers = JSON.parse(cached);
            if (teachers.length) {
                grid.innerHTML = teachers.map((t, i) => buildTeacherCardHTML(t, i)).join('');
            }
        } catch(e) {}
    }

    try {
        const teachers = await getTeachersPublic();
        localStorage.setItem('cache_teachers', JSON.stringify(teachers));
        grid.innerHTML = teachers.length
            ? teachers.map((t, i) => buildTeacherCardHTML(t, i)).join('')
            : '<p>لا يوجد مدرسون.</p>';
    } catch(e) {
        console.error('renderTeachers:', e);
        if (!cached) grid.innerHTML = '<p>لا يوجد مدرسون.</p>';
    }
}

async function renderCourses() {
    const grid = document.getElementById('coursesGrid');
    if (!grid) return;

    const cached = localStorage.getItem('cache_courses');
    if (cached) {
        try {
            const homeCourses = JSON.parse(cached);
            if (homeCourses.length) {
                grid.innerHTML = homeCourses.map((c, i) => `
                    <div class="card animate-scale" style="animation-delay:${i*0.1}s;">
                        <h4>${esc(c.title)}</h4>
                        <p><strong>الصف:</strong> ${esc(c.grade)}</p>
                        <a href="${esc(safeUrl(c.link))}" target="_blank" rel="noopener noreferrer" class="btn-card">مشاهدة</a>
                    </div>
                `).join('');
            }
        } catch(e) {}
    }

    try {
        const snap = await db.collection('courses').where('showInHome', '==', true).get();
        const homeCourses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        localStorage.setItem('cache_courses', JSON.stringify(homeCourses));
        grid.innerHTML = homeCourses.length ? homeCourses.map((c, i) => `
            <div class="card animate-scale" style="animation-delay:${i*0.1}s;">
                <h4>${esc(c.title)}</h4>
                <p><strong>الصف:</strong> ${esc(c.grade)}</p>
                <a href="${esc(safeUrl(c.link))}" target="_blank" rel="noopener noreferrer" class="btn-card">مشاهدة</a>
            </div>
        `).join('') : '<p style="color:#888;">لا توجد محاضرات عامة حالياً.</p>';
    } catch(e) {
        console.error('renderCourses:', e);
        if (!cached) grid.innerHTML = '<p style="color:#888;">لا توجد محاضرات عامة حالياً.</p>';
    }
}

async function renderBooks() {
    const grid = document.getElementById('booksGrid');
    if (!grid) return;

    const cached = localStorage.getItem('cache_books');
    if (cached) {
        try {
            const homeBooks = JSON.parse(cached);
            if (homeBooks.length) {
                grid.innerHTML = homeBooks.map((b, i) => `
                    <div class="card animate-scale" style="animation-delay:${i*0.1}s;">
                        <div style="font-size:40px; margin-bottom:12px;">📖</div>
                        <h4>${esc(b.title)}</h4>
                        <p><strong>الصف:</strong> ${esc(b.grade)}</p>
                        <a href="${esc(safeUrl(b.link))}" target="_blank" rel="noopener noreferrer" class="btn-card">تحميل</a>
                    </div>
                `).join('');
            }
        } catch(e) {}
    }

    try {
        const snap = await db.collection('books').where('showInHome', '==', true).get();
        const homeBooks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        localStorage.setItem('cache_books', JSON.stringify(homeBooks));
        grid.innerHTML = homeBooks.length ? homeBooks.map((b, i) => `
            <div class="card animate-scale" style="animation-delay:${i*0.1}s;">
                <div style="font-size:40px; margin-bottom:12px;">📖</div>
                <h4>${esc(b.title)}</h4>
                <p><strong>الصف:</strong> ${esc(b.grade)}</p>
                <a href="${esc(safeUrl(b.link))}" target="_blank" rel="noopener noreferrer" class="btn-card">تحميل</a>
            </div>
        `).join('') : '<p style="color:#888;">لا توجد كتب عامة حالياً.</p>';
    } catch(e) {
        console.error('renderBooks:', e);
        if (!cached) grid.innerHTML = '<p style="color:#888;">لا توجد كتب عامة حالياً.</p>';
    }
}

// ═══════════════════════════════════════════════════════════
//  Student Dashboard
// ═══════════════════════════════════════════════════════════

function calculateBundleProgress(bundle, user) {
    if (!bundle.items || bundle.items.length === 0) return 0;
    const totalItems = bundle.items.length;
    let completedItems = 0;

    const watched = user.watchedVideos || [];
    const completedExams = user.completedExams || [];

    bundle.items.forEach((item, idx) => {
        if (item.type === 'exam' && completedExams.includes(item.examId)) {
            completedItems++;
        }
        else if (item.type === 'video') {
            const key = `${bundle.id}__${idx}`;
            if (watched.includes(key)) completedItems++;
        }
    });

    return Math.round((completedItems / totalItems) * 100);
}

function switchStudentTab(tabName, btnElement) {
    document.querySelectorAll('.student-tab-content').forEach(el => el.style.display = 'none');
    const target = document.getElementById('tab-' + tabName);
    if (target) target.style.display = 'block';
    document.querySelectorAll('.dashboard-tabs button').forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');

    if (tabName === 'grades' && currentUser) {
        loadStudentGrades(currentUser.id);
    }
}

async function fetchStudentAttempts(userId) {
    try {
        const snap = await db.collection('examAttempts').where('studentId', '==', userId).get();
        const attempts = snap.docs.map(d => d.data());
        const solved = attempts.filter(a => a.pending !== true).length;
        const graded = attempts.filter(a => a.pending !== true);
        const avg = graded.length
            ? Math.round(graded.reduce((sum, a) => sum + (Number(a.score) || 0), 0) / graded.length)
            : 0;
        const total = attempts.reduce((sum, a) => sum + (Number(a.answersCount) || 0), 0);
        return { avg, solved, total, pending: 0 };
    } catch (err) {
        console.error('خطأ في جلب المحاولات:', err);
        return { avg: 0, solved: 0, total: 0, pending: 0 };
    }
}

async function fetchCompletedExamIds(userId) {
    try {
        const snap = await db.collection('users').doc(userId).collection('completedExams').get();
        return snap.docs.map(d => d.id);
    } catch (err) {
        console.error('خطأ في جلب الاختبارات المكتملة:', err);
        return [];
    }
}

async function fetchWatchedVideos(userId) {
    try {
        const snap = await db.collection('users').doc(userId).collection('watchedVideos').get();
        return snap.docs.map(d => d.id);
    } catch (err) {
        console.error('خطأ في جلب الفيديوهات المشاهدة:', err);
        return [];
    }
}

async function markVideoAsWatched(bundleId, itemIndex) {
    if (!currentUser) return;
    const videoKey = `${bundleId}__${itemIndex}`;

    if ((currentUser.watchedVideos || []).includes(videoKey)) return;

    try {
        await db.collection('users').doc(currentUser.id)
            .collection('watchedVideos').doc(videoKey)
            .set({
                bundleId: bundleId,
                itemIndex: itemIndex,
                watchedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        if (!currentUser.watchedVideos) currentUser.watchedVideos = [];
        currentUser.watchedVideos.push(videoKey);
    } catch (err) {
        console.error('تعذر تسجيل المشاهدة:', err);
    }
}

async function loadStudentGrades(userId) {
    const container = document.getElementById('gradesList');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; color:#888; padding:30px;">⏳ جاري التحميل...</p>';

    try {
        const snap = await db.collection('examAttempts').where('studentId', '==', userId).get();

        if (snap.empty) {
            container.innerHTML = `
                <div style="text-align:center; padding:50px 20px; color:#888;">
                    <div style="font-size:60px; margin-bottom:15px; opacity:0.5;">📝</div>
                    <h3 style="color:#666; margin-bottom:10px;">لم تخض أي اختبار بعد</h3>
                    <p style="font-size:13px;">لما تسلم أي اختبار، هتلاقي نتيجته هنا.</p>
                </div>
            `;
            return;
        }

        const attempts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        attempts.sort((a, b) => {
            const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
        });

        container.innerHTML = attempts.map((att) => {
            const isPending = att.pending === true;
            const score = Number(att.score) || 0;
            const isPassed = score >= 50;

            let badgeHtml = '';
            if (isPending) {
                badgeHtml = `<span style="background:#fff3cd; color:#856404; padding:6px 14px; border-radius:50px; font-weight:700; font-size:12px;">⏳ جاري التصحيح</span>`;
            } else {
                badgeHtml = `<span style="background:${isPassed ? '#d4edda' : '#f8d7da'}; color:${isPassed ? '#155724' : '#721c24'}; padding:6px 14px; border-radius:50px; font-weight:800; font-size:12px;">${isPassed ? '✅ ناجح' : '❌ راسب'} — ${score}%</span>`;
            }

            return `
                <div class="exam-item" style="display:block; padding:18px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
                        <div style="flex:1; min-width:200px;">
                            <div class="exam-name" style="font-size:15px; margin-bottom:6px;">📝 ${esc(att.examTitle || 'اختبار')}</div>
                            <div style="font-size:12px; color:#888;">
                                ${att.answersCount || 0} سؤال
                                ${att.oneTimeOnly ? ' • 🔒 مرة واحدة' : ''}
                            </div>
                        </div>
                        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                            ${badgeHtml}
                            <button type="button" class="btn-start-exam" data-action="show-attempt" data-attempt-id="${attr(att.id)}" style="padding:8px 20px; font-size:12px;">
                                👁️ عرض النتيجة
                            </button>
                        </div>
                    </div>
                    <div id="attempt-result-${attr(att.id)}" style="display:none; margin-top:15px;"></div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('خطأ في تحميل الدرجات:', err);
        container.innerHTML = '<p style="text-align:center; color:#a00; padding:30px;">❌ حدث خطأ أثناء التحميل.</p>';
    }
}

// ═══════════════════════════════════════════════════════════
//  عرض نتيجة المحاولة
// ═══════════════════════════════════════════════════════════
async function showAttemptResult(attemptId) {
    const resultDiv = document.getElementById('attempt-result-' + attemptId);
    if (!resultDiv) return;

    if (resultDiv.style.display === 'block') {
        resultDiv.style.display = 'none';
        return;
    }

    resultDiv.innerHTML = '<p style="text-align:center; color:#888; padding:15px;">⏳ جاري التحميل...</p>';
    resultDiv.style.display = 'block';

    try {
        const snap = await db.collection('examAttempts').doc(attemptId).get();
        if (!snap.exists) {
            resultDiv.innerHTML = '<p style="color:#a00; padding:15px;">❌ المحاولة غير موجودة.</p>';
            return;
        }
        const att = snap.data();

        if (att.pending === true) {
            resultDiv.innerHTML = `
                <div style="background:#fff3cd; border:2px dashed #ffc107; padding:15px; border-radius:14px; text-align:center; color:#856404;">
                    ⏳ الاختبار قيد التصحيح حالياً... هتظهر النتيجة خلال ثواني.
                </div>
            `;
            return;
        }

        let examDoc = null;
        try {
            const examSnap = await db.collection('exams').doc(att.examId).get();
            if (examSnap.exists) examDoc = examSnap.data();
        } catch (e) {
            console.warn('تعذر جلب بيانات الاختبار:', e);
        }

        const score = Number(att.score) || 0;
        const correct = Number(att.correctCount) || 0;
        const wrong = Number(att.wrongCount) || 0;
        const unanswered = Number(att.unanswered) || 0;
        const total = Number(att.totalQuestions) || (correct + wrong + unanswered);

        const statsHtml = `
            <div class="stats-grid">
                <div class="stat-card"><div class="value">${total}</div><div class="label">عدد الأسئلة</div></div>
                <div class="stat-card"><div class="value">${score}%</div><div class="label">النسبة</div></div>
                <div class="stat-card"><div class="value">${correct}</div><div class="label">إجابات صحيحة</div></div>
                <div class="stat-card"><div class="value">${wrong}</div><div class="label">إجابات خاطئة</div></div>
            </div>
        `;

        let answersReviewHtml = '';
        if (examDoc && Array.isArray(examDoc.questions) && Array.isArray(att.studentAnswers)) {
            const correctAnswersArr = att.correctAnswers || [];

            examDoc.questions.forEach((q, idx) => {
                const userAnswerIndex = att.studentAnswers[idx];
                const correctAnswerIndex = correctAnswersArr[idx];
                const isUserCorrect = userAnswerIndex === correctAnswerIndex;
                const isUserAnswered = userAnswerIndex !== null && userAnswerIndex !== undefined;

                let cardClass = 'unanswered';
                let statusBadge = '<span class="status-badge unanswered">⚪ بدون إجابة</span>';
                if (isUserCorrect) {
                    cardClass = 'correct';
                    statusBadge = '<span class="status-badge correct">✅ إجابة صحيحة</span>';
                } else if (isUserAnswered) {
                    cardClass = 'wrong';
                    statusBadge = '<span class="status-badge wrong">❌ إجابة خاطئة</span>';
                }

                let optionsHtml = '';
                (q.options || []).forEach((optText, optIdx) => {
                    let optionClass = 'option-row';
                    let icon = '⚪';
                    if (optIdx === correctAnswerIndex) { optionClass += ' correct'; icon = '✅'; }
                    else if (optIdx === userAnswerIndex) { optionClass += ' wrong'; icon = '❌'; }
                    optionsHtml += `<div class="${optionClass}"><span style="font-size:16px;">${icon}</span><span>${esc(optText)}</span></div>`;
                });

                const noteHtml = q.note ? `
                    <div class="note-box">
                        <span class="note-icon">📝</span>
                        <div><strong style="display:block; margin-bottom:6px; color:#b8935a;">ملاحظة:</strong>${esc(q.note)}</div>
                    </div>
                ` : '';

                answersReviewHtml += `
                    <div class="question-card ${cardClass}">
                        <div class="question-header">
                            <span class="q-number">السؤال ${idx + 1}</span>
                            <div>${statusBadge}</div>
                        </div>
                        <div class="question-text">${esc(q.q)}</div>
                        <div>${optionsHtml}</div>
                        ${noteHtml}
                    </div>
                `;
            });
        } else {
            answersReviewHtml = '<p style="text-align:center; color:#888; padding:20px;">⚠️ لا يمكن عرض تفاصيل الإجابات (بيانات الاختبار غير متوفرة).</p>';
        }

        resultDiv.innerHTML = `
            <div class="exam-result-light">
                ${statsHtml}
                <div class="answers-header"><span>الإجابات</span></div>
                <div class="answers-list">${answersReviewHtml}</div>
                <div class="result-footer">
                    📅 ${att.gradedAt ? new Date(att.gradedAt.toDate()).toLocaleString('ar-EG') : '—'}
                </div>
            </div>
        `;
    } catch (err) {
        console.error('خطأ في عرض النتيجة:', err);
        resultDiv.innerHTML = '<p style="color:#a00; padding:15px;">❌ حدث خطأ أثناء تحميل النتيجة.</p>';
    }
}

async function loadStudentDashboard(user) {
    currentUser = user;
    document.getElementById('studentNameDash').textContent = user.name || '';
    document.getElementById('studentGradeDash').textContent = user.grade || '';

    // ─── جلب البيانات بالتوازي ───
    const stats = await fetchStudentAttempts(user.id);
    currentUser.attempts = stats;

    const [completed, watched] = await Promise.all([
        fetchCompletedExamIds(user.id),
        fetchWatchedVideos(user.id)
    ]);
    currentUser.completedExams = completed;
    currentUser.watchedVideos = watched;

    let exams = [];
    let bundles = [];

    try {
        const examsSnap = await db.collection('exams').where('grade', '==', user.grade).get();
        exams = examsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const bundlesSnap = await db.collection('bundles').where('grade', '==', user.grade).get();
        bundles = bundlesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) {
        console.error('خطأ في تحميل exams/bundles:', e);
    }

    // ═══════════════════════════════════════════════════════
    //  📚 كورساتي: الحزم فقط
    // ═══════════════════════════════════════════════════════
    const coursesGrid = document.getElementById('studentCoursesGrid');
    const allCards = [];

    bundles.forEach((b, idx) => {
        const progress = calculateBundleProgress(b, user);
        allCards.push(`
            <div class="course-card animate-scale" style="animation-delay:${idx*0.05}s;">
                <div class="course-card-img">📚</div>
                <div class="course-card-body">
                    <h3>${esc(b.title)}</h3>
                    <p>${esc(b.grade)} • ${(b.items || []).length} عنصر</p>
                    <div class="progress-container"><div class="progress-fill" style="width: ${progress}%;"></div></div>
                    <span class="progress-text">${progress}% مكتمل</span>
                    <button type="button" class="btn-continue" data-action="open-bundle" data-bundle-id="${attr(b.id)}">كمل التعلم 🚀</button>
                </div>
            </div>
        `);
    });

    coursesGrid.innerHTML = allCards.length
        ? allCards.join('')
        : '<p style="color:#888; text-align:center; grid-column:1/-1;">لا توجد كورسات متاحة لصفك حالياً.</p>';

    // ─── الاختبارات ───
    const studentExamsList = document.getElementById('studentExamsList');
    if (exams.length) {
        studentExamsList.innerHTML = exams.map(ex => {
            const isOneTime = ex.oneTimeOnly === true;
            const alreadyTaken = isOneTime && completed.includes(ex.id);
            if (alreadyTaken) {
                return `
                    <div class="exam-item" style="opacity:0.7; background:rgba(42,122,42,0.05);">
                        <span class="exam-name">📝 ${esc(ex.title)} 🔒</span>
                        <span style="background:#d4edda; color:#155724; padding:8px 16px; border-radius:50px; font-weight:800; font-size:12px;">✅ تم التسليم</span>
                    </div>`;
            }
            return `
                <div class="exam-item">
                    <span class="exam-name">📝 ${esc(ex.title)} ${isOneTime ? '🔒' : ''}</span>
                    <button type="button" class="btn-start-exam" data-action="start-exam" data-exam-id="${attr(ex.id)}">ابدأ الاختبار</button>
                </div>`;
        }).join('');
    } else {
        studentExamsList.innerHTML = '<p style="color:#888;">لا توجد اختبارات لصفك بعد.</p>';
    }

    // ─── المدرسون ───
    const teachers = await getTeachersPublic();
    document.getElementById('studentTeachersGrid').innerHTML = teachers.length
        ? teachers.map(t => `
            <div class="teacher-card">
                ${t.image ? `<img src="${esc(safeUrl(t.image))}" alt="${esc(t.name)}">` : `<div class="avatar-placeholder">👨‍🏫</div>`}
                <h5>${esc(t.name)}</h5>
                <p>${esc(t.specialty || '')}</p>
            </div>
        `).join('')
        : '<p style="color:#888; text-align:center; grid-column:1/-1;">لا يوجد مدرسون بعد.</p>';
}

// ═══════════════════════════════════════════════════════════
//  Bundle
// ═══════════════════════════════════════════════════════════
async function openBundle(bundleId) {
    const bundleSnap = await db.collection('bundles').doc(bundleId).get();
    if (!bundleSnap.exists) return;
    const bundle = { id: bundleSnap.id, ...bundleSnap.data() };

    const [completed, watched] = await Promise.all([
        fetchCompletedExamIds(currentUser.id),
        fetchWatchedVideos(currentUser.id)
    ]);
    currentUser.completedExams = completed;
    currentUser.watchedVideos = watched;

    currentBundle = bundle;
    const progress = calculateBundleProgress(bundle, currentUser);

    document.getElementById('detailCourseTitle').textContent = bundle.title;
    document.getElementById('detailCourseSub').textContent = bundle.grade || '';
    document.getElementById('detailProgressFill').style.width = progress + '%';
    document.getElementById('detailProgressText').textContent = progress + '%';

    const unitsContainer = document.getElementById('unitsContainer');
    if (bundle.items && bundle.items.length > 0) {
        unitsContainer.innerHTML = `
            <details class="unit-bundle" open>
                <summary>
                    <div style="display:flex; align-items:center;">
                        <div class="unit-number">1</div>
                        <div>محتوى الكورس</div>
                    </div>
                    <span>▼</span>
                </summary>
                <div class="unit-content">
                    ${bundle.items.map((item, _idx) => {
                        if (item.type === 'exam') {
                            const alreadyTaken = completed.includes(item.examId);
                            if (alreadyTaken) {
                                return `<div class="unit-item">
                                    <span class="unit-item-title">📝 ${esc(item.title)} 🔒</span>
                                    <span style="background:#d4edda; color:#155724; padding:6px 14px; border-radius:50px; font-weight:800; font-size:12px;">✅ تم التسليم</span>
                                </div>`;
                            }
                            return `<div class="unit-item">
                                <span class="unit-item-title">📝 ${esc(item.title)}</span>
                                <button type="button" class="btn-item-action exam" data-action="start-exam" data-exam-id="${attr(item.examId)}">ابدأ الاختبار</button>
                            </div>`;
                        } else if (item.type === 'video') {
                            const watchedKey = `${bundle.id}__${_idx}`;
                            const isWatched = (currentUser.watchedVideos || []).includes(watchedKey);
                            return `<div class="unit-item">
                                <span class="unit-item-title">${isWatched ? '✅' : '🎬'} ${esc(item.title)}</span>
                                <button type="button" class="btn-item-action" data-action="open-video"
                                        data-link="${attr(item.link || '')}"
                                        data-title="${attr(item.title || '')}"
                                        data-bundle-id="${attr(bundle.id)}"
                                        data-item-index="${_idx}"
                                        style="border:none;">${isWatched ? 'شوهد ✓' : 'مشاهدة'}</button>
                            </div>`;
                        } else {
                            return `<div class="unit-item">
                                <span class="unit-item-title">📄 ${esc(item.title)}</span>
                                <a href="${esc(safeUrl(item.link))}" target="_blank" rel="noopener noreferrer" class="btn-item-action">تحميل</a>
                            </div>`;
                        }
                    }).join('')}
                </div>
            </details>
        `;
    } else {
        unitsContainer.innerHTML = '<p style="text-align:center; color:#888;">لا يوجد محتوى مضاف لهذا الكورس بعد.</p>';
    }

    document.getElementById('studentDashboard').classList.remove('active');
    document.getElementById('courseDetailView').classList.add('active');
    hideNavLinks();
    window.scrollTo(0, 0);
}

function backToDashboard() {
    document.getElementById('courseDetailView').classList.remove('active');
    document.getElementById('studentDashboard').classList.add('active');
    loadStudentDashboard(currentUser);
    window.scrollTo(0, 0);
}

// ═══════════════════════════════════════════════════════════
//  Video Modal
// ═══════════════════════════════════════════════════════════
function getEmbedUrl(url) {
    if (!url) return { embed: '', type: '' };
    const u = String(url).trim();
    if (!/^https:\/\//i.test(u)) return { embed: '', type: '' };

    if (u.includes('drive.google.com')) {
        let id = '';
        if (u.includes('/file/d/')) id = u.split('/file/d/')[1].split('/')[0];
        else if (u.includes('id=')) id = u.split('id=')[1].split('&')[0];
        if (id && /^[A-Za-z0-9_-]+$/.test(id)) {
            return { embed: `https://drive.google.com/file/d/${id}/preview`, type: 'drive' };
        }
    }

    let ytId = '';
    if (u.includes('youtube.com/watch')) ytId = u.split('v=')[1]?.split('&')[0];
    else if (u.includes('youtu.be/')) ytId = u.split('youtu.be/')[1]?.split('?')[0];
    else if (u.includes('youtube.com/embed/')) ytId = u.split('youtube.com/embed/')[1]?.split('?')[0];
    else if (u.includes('youtube.com/shorts/')) ytId = u.split('youtube.com/shorts/')[1]?.split('?')[0];

    if (ytId && /^[A-Za-z0-9_-]+$/.test(ytId)) {
        const params = new URLSearchParams({
            modestbranding: '1', rel: '0', iv_load_policy: '3',
            fs: '1', playsinline: '1', controls: '1', color: 'white'
        });
        return { embed: `https://www.youtube-nocookie.com/embed/${ytId}?${params.toString()}`, type: 'youtube' };
    }

    return { embed: '', type: '' };
}

function openVideoModal(link, title) {
    const result = getEmbedUrl(link);
    if (!result.embed) { alert('رابط الفيديو غير صالح.'); return; }

    document.getElementById('videoModalTitle').textContent = '📺 ' + title;
    document.getElementById('videoIframe').src = result.embed;

    const wrapper = document.getElementById('videoIframeWrapper');
    wrapper.classList.remove('is-youtube');
    if (result.type === 'youtube') wrapper.classList.add('is-youtube');

    const wm = document.getElementById('videoWatermark');
    if (wm) {
        wm.style.animation = 'none';
        wm.style.opacity = '1';
        wm.style.visibility = 'visible';
        void wm.offsetWidth;
        wm.style.animation = 'fadeOutWatermark 1.5s ease 3s forwards';
    }

    document.getElementById('videoModal').style.display = 'flex';
}

function closeVideoModal() {
    document.getElementById('videoIframe').src = '';
    document.getElementById('videoModal').style.display = 'none';
}

// ═══════════════════════════════════════════════════════════
//  🔒 Exam
// ═══════════════════════════════════════════════════════════
async function startExam(examId) {
    if (!currentUser) return;
    if (examInProgress) return;
    examInProgress = true;

    try {
        const completed = await fetchCompletedExamIds(currentUser.id);
        currentUser.completedExams = completed;

        const examSnap = await db.collection('exams').doc(examId).get();
        if (!examSnap.exists) { examInProgress = false; return; }
        const ex = { id: examSnap.id, ...examSnap.data() };

        if (ex.oneTimeOnly && completed.includes(examId)) {
            alert('🔒 لقد قمت بتسليم هذا الاختبار مسبقاً، لا يمكن إعادته.');
            examInProgress = false;
            return;
        }
        currentExam = ex;
        if (!currentExam.questions || currentExam.questions.length === 0) {
            alert('هذا الاختبار لا يحتوي على أسئلة بعد.');
            examInProgress = false;
            return;
        }
        currentQIndex = 0;
        answers = new Array(currentExam.questions.length).fill(null);

        document.getElementById('studentDashboard').classList.remove('active');
        document.getElementById('courseDetailView').classList.remove('active');
        document.getElementById('examPage').classList.add('active');
        hideNavLinks();

        document.getElementById('examTitleHeader').textContent = currentExam.title + (currentExam.oneTimeOnly ? ' 🔒' : '');
        renderQuestion();
        window.scrollTo(0, 0);
    } catch (err) {
        console.error('خطأ في بدء الاختبار:', err);
        examInProgress = false;
        alert('حدث خطأ أثناء بدء الاختبار. حاول مرة أخرى.');
    }
}

function renderQuestion() {
    const q = currentExam.questions[currentQIndex];
    const qTextEl = document.getElementById('qTextDisplay');
    qTextEl.innerHTML = esc(q.q);

    const oldNote = document.getElementById('qNoteDisplay');
    if (oldNote) oldNote.remove();

    document.getElementById('examProgressText').textContent = `السؤال ${currentQIndex + 1} من ${currentExam.questions.length}`;
    document.getElementById('progressFill').style.width = ((currentQIndex + 1) / currentExam.questions.length) * 100 + '%';

    let navHTML = '';
    currentExam.questions.forEach((_, i) => {
        navHTML += `<button type="button" class="q-btn ${i === currentQIndex ? 'current' : ''} ${answers[i] !== null ? 'answered' : ''}" data-action="goto-question" data-index="${i}">${i + 1}</button>`;
    });
    document.getElementById('questionNav').innerHTML = navHTML;

    let optionsHTML = '';
    q.options.forEach((opt, i) => {
        const isChecked = answers[currentQIndex] === i;
        optionsHTML += `
            <li class="option-item ${isChecked ? 'selected' : ''}" data-action="select-option" data-index="${i}" role="button" tabindex="0">
                <input type="radio" name="q_opt" ${isChecked ? 'checked' : ''} readonly>
                <span>${esc(opt)}</span>
            </li>`;
    });
    document.getElementById('optionsList').innerHTML = optionsHTML;

    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
        if (currentQIndex === currentExam.questions.length - 1) {
            const answeredCount = answers.filter(a => a !== null).length;
            nextBtn.textContent = `✅ تسليم الاختبار (${answeredCount}/${currentExam.questions.length})`;
            nextBtn.style.background = '#8a6f1d';
            nextBtn.style.color = '#fff';
        } else {
            nextBtn.textContent = 'التالي';
            nextBtn.style.background = 'linear-gradient(135deg, #3b0a0a, #1a0404)';
            nextBtn.style.color = '#c9a961';
        }
    }

    const prevBtn = document.getElementById('prevBtn');
    if (prevBtn) prevBtn.style.visibility = currentQIndex === 0 ? 'hidden' : 'visible';
}

function selectOption(optIndex) { answers[currentQIndex] = optIndex; renderQuestion(); }
function goToQuestion(index) { currentQIndex = index; renderQuestion(); }
function prevQuestion() { if (currentQIndex > 0) { currentQIndex--; renderQuestion(); } }

async function handleNextOrFinish() {
    if (currentQIndex < currentExam.questions.length - 1) {
        currentQIndex++;
        renderQuestion();
    } else {
        const answeredCount = answers.filter(a => a !== null).length;
        let proceed = false;

        // ✅ showConfirm بدل confirm
        if (answeredCount < currentExam.questions.length) {
            const remaining = currentExam.questions.length - answeredCount;
            proceed = await showConfirm(
                `⚠️ لم تجب على ${remaining} سؤال.\n\nهل تريد تسليم الاختبار الآن؟`,
                {
                    title: 'تنبيه',
                    icon: '⚠️',
                    okText: 'تسليم',
                    cancelText: 'رجوع',
                    danger: true
                }
            );
        } else {
            proceed = await showConfirm('هل أنت متأكد من تسليم الاختبار؟', {
                title: 'تسليم الاختبار',
                icon: '📝',
                okText: 'تسليم',
                cancelText: 'رجوع'
            });
        }

        if (!proceed) return;
        finishExam();
    }
}

async function finishExam() {
    if (!examInProgress) return;

    if (currentAttemptUnsub) {
        try { currentAttemptUnsub(); } catch(e) {}
        currentAttemptUnsub = null;
    }

    try {
        const attemptRef = await db.collection('examAttempts').add({
            studentId: currentUser.id,
            examId: currentExam.id,
            examTitle: currentExam.title,
            grade: currentUser.grade,
            studentAnswers: answers,
            answersCount: currentExam.questions.length,
            pending: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        try {
            fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ attemptId: attemptRef.id })
            }).catch(err => console.warn('⚠️ فشل الإشعار الفوري:', err));
        } catch (notifyErr) {
            console.warn('⚠️ خطأ في إرسال الإشعار:', notifyErr);
        }

        document.getElementById('questionNav').style.display = 'none';
        document.getElementById('qTextDisplay').style.display = 'none';
        document.getElementById('optionsList').style.display = 'none';
        document.querySelector('.nav-btns').style.display = 'none';

        const qNote = document.getElementById('qNoteDisplay');
        if (qNote) qNote.remove();

        document.getElementById('resultBox').style.display = 'block';

        const exitBtn = document.getElementById('exitExamBtn');
        if (exitBtn) exitBtn.style.display = 'none';

        document.getElementById('resultTitle').textContent = '⏳ جاري التصحيح';
        document.getElementById('resultDetails').innerHTML = `
            <div style="text-align:center; padding:20px 0;">
                <div id="countdownNumber" style="font-size:80px; font-weight:900; color:#b8935a; line-height:1; animation: pulseCountdown 1s ease infinite;">3</div>
                <p style="color:#666; font-size:14px; margin-top:15px;">جاري حساب نتيجتك...</p>
            </div>
        `;
        document.getElementById('reviewAnswers').innerHTML = '';

        let countdownValue = 3;
        let resultData = null;
        let resultReceived = false;
        let countdownDone = false;

        const showResult = (data) => {
            if (!data) return;
            const scorePct = Number(data.score) || 0;

            document.getElementById('resultTitle').textContent =
                scorePct >= 50 ? '🎉 مبروك، نجحت!' : '😔 حاول مرة أخرى';

            document.getElementById('resultDetails').innerHTML = `
                <p>الإجابات الصحيحة: <strong style="color:#2a7a2a;">${data.correctCount || 0}</strong></p>
                <p>الإجابات الخاطئة: <strong style="color:#a00;">${data.wrongCount || 0}</strong></p>
                <p>بدون إجابة: <strong style="color:#888;">${data.unanswered || 0}</strong></p>
                <p>نسبة النجاح: <strong style="color:#b8935a; font-size:22px;">${scorePct}%</strong></p>
                ${currentExam.oneTimeOnly ? '<p style="margin-top:10px; color:#8b0000; font-weight:800;">🔒 هذا الاختبار لمرة واحدة.</p>' : ''}
            `;
            document.getElementById('reviewAnswers').innerHTML = '';
            if (exitBtn) exitBtn.style.display = 'inline-block';
        };

        const countdownInterval = setInterval(() => {
            countdownValue--;
            const el = document.getElementById('countdownNumber');
            if (countdownValue > 0) {
                if (el) {
                    el.textContent = countdownValue;
                    el.style.animation = 'none';
                    void el.offsetWidth;
                    el.style.animation = 'pulseCountdown 1s ease infinite';
                }
            } else {
                clearInterval(countdownInterval);
                countdownDone = true;
                if (resultReceived && resultData) {
                    showResult(resultData);
                } else {
                    document.getElementById('resultDetails').innerHTML = `
                        <div style="text-align:center; padding:20px 0;">
                            <div style="font-size:45px; margin-bottom:10px;">⏳</div>
                            <p style="color:#666; font-size:14px;">لحظات قليلة فقط...</p>
                        </div>
                    `;
                }
            }
        }, 1000);

        currentAttemptUnsub = attemptRef.onSnapshot(snap => {
            if (!snap.exists) return;
            const data = snap.data();
            if (data.pending === false) {
                resultReceived = true;
                resultData = data;
                if (countdownDone) showResult(data);
                if (currentAttemptUnsub) { try { currentAttemptUnsub(); } catch(e) {} currentAttemptUnsub = null; }

                // ✅✨ نسجل إن الاختبار خلص — للاختبارات "مرة واحدة" بس
                if (currentExam && currentExam.oneTimeOnly && currentUser) {
                    db.collection('users').doc(currentUser.id)
                      .collection('completedExams').doc(currentExam.id)
                      .set({
                          attemptId: attemptRef.id,
                          completedAt: firebase.firestore.FieldValue.serverTimestamp()
                      })
                      .then(() => {
                          if (!currentUser.completedExams) currentUser.completedExams = [];
                          if (!currentUser.completedExams.includes(currentExam.id)) {
                              currentUser.completedExams.push(currentExam.id);
                          }
                      })
                      .catch(err => console.warn('⚠️ تعذر تسجيل الاختبار المكتمل:', err));
                }
            }
        });
    } catch (err) {
        console.error('خطأ في التسليم:', err);
        alert('⚠️ حدث خطأ في التسليم، حاول مرة أخرى.');
        examInProgress = false;
    }
}

function exitExam() {
    if (currentAttemptUnsub) { try { currentAttemptUnsub(); } catch(e) {} currentAttemptUnsub = null; }
    examInProgress = false;
    document.getElementById('examPage').classList.remove('active');
    document.getElementById('studentDashboard').classList.add('active');
    document.getElementById('questionNav').style.display = '';
    document.getElementById('qTextDisplay').style.display = '';
    document.getElementById('optionsList').style.display = '';
    document.querySelector('.nav-btns').style.display = '';
    const exitBtn = document.getElementById('exitExamBtn');
    if (exitBtn) exitBtn.style.display = 'none';
    const qNote = document.getElementById('qNoteDisplay');
    if (qNote) qNote.remove();
    document.getElementById('resultBox').style.display = 'none';
    loadStudentDashboard(currentUser);
    window.scrollTo(0, 0);
}

// ═══════════════════════════════════════════════════════════
//  Logout
// ═══════════════════════════════════════════════════════════
async function logout() {
    if (currentAttemptUnsub) { try { currentAttemptUnsub(); } catch(e) {} currentAttemptUnsub = null; }
    try { await auth.signOut(); } catch(e) { console.error(e); }
    currentUser = null;
    document.getElementById('navButtons').style.display = 'flex';
    document.getElementById('navUser').style.display = 'none';
    document.getElementById('studentDashboard').classList.remove('active');
    document.getElementById('courseDetailView').classList.remove('active');
    document.getElementById('examPage').classList.remove('active');
    document.getElementById('homeSection').style.display = 'block';
    document.getElementById('authSection').style.display = 'none';
    showNavLinks();
    window.scrollTo(0, 0);
}

// ═══════════════════════════════════════════════════════════
//  🎯 Event Delegation
// ═══════════════════════════════════════════════════════════
function handleActionClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;

    const action = el.dataset.action;

    if (el.tagName === 'A' && el.getAttribute('href') === '#') {
        e.preventDefault();
    }

    switch (action) {
        case 'show-home': e.preventDefault(); showHome(); break;
        case 'show-auth': e.preventDefault(); showAuthPage(el.dataset.mode); break;
        case 'switch-auth': e.preventDefault(); switchAuthView(el.dataset.mode); break;
        case 'scroll-to': e.preventDefault(); setActiveNav(el); scrollToSection(el.dataset.target); break;
        case 'toggle-dark': e.preventDefault(); toggleDarkMode(); break;
        case 'toggle-password': e.preventDefault(); togglePassword(el.dataset.inputId); break;
        case 'reset-password': e.preventDefault(); resetPassword(); break;
        case 'open-legal': e.preventDefault(); openLegal(el.dataset.kind); break;
        case 'close-legal': e.preventDefault(); closeLegal(); break;
        case 'close-video': e.preventDefault(); closeVideoModal(); break;
        case 'logout': e.preventDefault(); logout(); break;
        case 'switch-tab': e.preventDefault(); switchStudentTab(el.dataset.tab, el); break;
        case 'open-bundle': e.preventDefault(); openBundle(el.dataset.bundleId); break;
        case 'back-to-dashboard': e.preventDefault(); backToDashboard(); break;
        case 'start-exam': e.preventDefault(); startExam(el.dataset.examId); break;

        case 'open-video':
            e.preventDefault();
            openVideoModal(el.dataset.link, el.dataset.title);
            if (el.dataset.bundleId && el.dataset.itemIndex !== undefined && el.dataset.itemIndex !== '') {
                const bundleId = el.dataset.bundleId;
                const itemIdx = parseInt(el.dataset.itemIndex, 10);
                markVideoAsWatched(bundleId, itemIdx).then(() => {
                    if (currentBundle && currentBundle.id === bundleId) {
                        const newProgress = calculateBundleProgress(currentBundle, currentUser);
                        const fill = document.getElementById('detailProgressFill');
                        const text = document.getElementById('detailProgressText');
                        if (fill) fill.style.width = newProgress + '%';
                        if (text) text.textContent = newProgress + '%';
                        setTimeout(() => openBundle(bundleId), 300);
                    }
                });
            }
            break;

        case 'show-attempt': e.preventDefault(); showAttemptResult(el.dataset.attemptId); break;
        case 'prev-question': e.preventDefault(); prevQuestion(); break;
        case 'next-question': e.preventDefault(); handleNextOrFinish(); break;
        case 'exit-exam': e.preventDefault(); exitExam(); break;
        case 'goto-question': e.preventDefault(); goToQuestion(parseInt(el.dataset.index, 10)); break;
        case 'select-option': e.preventDefault(); selectOption(parseInt(el.dataset.index, 10)); break;
    }
}

// ═══════════════════════════════════════════════════════════
//  🎯 Static Listeners
// ═══════════════════════════════════════════════════════════
function attachStaticListeners() {
    const logoArea = document.getElementById('logoArea');
    if (logoArea) {
        logoArea.addEventListener('click', showHome);
        logoArea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showHome(); }
        });
    }

    const regIsOutside = document.getElementById('regIsOutside');
    if (regIsOutside) regIsOutside.addEventListener('change', toggleCenterField);

    const legalModal = document.getElementById('legalModal');
    if (legalModal) {
        legalModal.addEventListener('click', (e) => {
            if (e.target === legalModal) closeLegal();
        });
    }

    const devLogo = document.getElementById('devLogo');
    if (devLogo) {
        devLogo.addEventListener('error', function() {
            this.onerror = null;
            this.src = 'data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 45 45%27%3E%3Crect width=%2745%27 height=%2745%27 fill=%27%233b0a0a%27/%3E%3Ctext x=%2722.5%27 y=%2730%27 font-size=%2722%27 text-anchor=%27middle%27 fill=%27%23d4af37%27 font-family=%27sans-serif%27%3ER%3C/text%3E%3C/svg%3E';
        }, { once: true });
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) registerForm.addEventListener('submit', handleRegisterSubmit);

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit);

    const stageSelect = document.getElementById('regStage');
    const gradeSelect = document.getElementById('regGrade');
    const gradesMap = {
        primary: ['الأول ابتدائي','الثاني ابتدائي','الثالث ابتدائي','الرابع ابتدائي','الخامس ابتدائي','السادس ابتدائي'],
        preparatory: ['الأول إعدادي','الثاني إعدادي','الثالث إعدادي'],
        secondary: ['الأول ثانوي','الثاني ثانوي','الثالث ثانوي']
    };
    if (stageSelect && gradeSelect) {
        stageSelect.addEventListener('change', function() {
            const val = this.value;
            gradeSelect.innerHTML = '<option value="" disabled selected>اختر الصف</option>';
            if (val && gradesMap[val]) {
                gradesMap[val].forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = 'الصف ' + g;
                    opt.textContent = 'الصف ' + g;
                    gradeSelect.appendChild(opt);
                });
            }
        });
    }
}

// ═══════════════════════════════════════════════════════════
//  Register Handler
// ═══════════════════════════════════════════════════════════
async function handleRegisterSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('regSubmitBtn');
    const name        = document.getElementById('regName').value.trim();
    const email       = document.getElementById('regEmail').value.trim();
    const phone       = document.getElementById('regPhone').value.trim();
    const parentPhone = document.getElementById('regParentPhone').value.trim();
    const governorate = document.getElementById('regGovernorate').value;
    const isOutside   = document.getElementById('regIsOutside').checked;
    const center      = isOutside ? '' : document.getElementById('regCenter').value.trim();
    const stage       = document.getElementById('regStage').value;
    const grade       = document.getElementById('regGrade').value;
    const password    = document.getElementById('regPass').value;
    const confirm     = document.getElementById('regConfirmPass').value;

    // ═══════════════════════════════════════════════════════
    //  ✅ التحققات (Validation)
    // ═══════════════════════════════════════════════════════
    if (password !== confirm) { alert('كلمتا المرور غير متطابقتين.'); return; }
    if (!name || !email || !phone || !grade || !password) { alert('املأ جميع الحقول المطلوبة.'); return; }
    if (password.length < 8) { alert('كلمة المرور يجب أن تكون 8 أحرف على الأقل.'); return; }
    if (name.length < 2 || name.length > 100) { alert('⚠️ الاسم يجب أن يكون بين حرفين و100 حرف.'); return; }
    if (!isValidEgyptPhone(phone)) { alert('⚠️ رقم الهاتف يجب أن يكون 11 رقم ويبدأ بـ 01.'); return; }
    if (parentPhone && !isValidEgyptPhone(parentPhone)) { alert('⚠️ رقم ولي الأمر يجب أن يكون 11 رقم ويبدأ بـ 01.'); return; }
    if (!governorate) { alert('⚠️ اختر المحافظة.'); return; }
    if (!stage) { alert('⚠️ اختر المرحلة.'); return; }

    // ✅ المركز إجباري لو مش صفارة
    if (!isOutside && !center) {
        alert('⚠️ اكتب اسم المركز، أو فعّل خيار "أدرس خارج مصر (صفارة)".');
        const centerInput = document.getElementById('regCenter');
        if (centerInput) centerInput.focus();
        return;
    }
    if (center && center.length > 100) {
        alert('⚠️ اسم المركز يجب أن يكون أقل من 100 حرف.');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'جاري إنشاء الحساب...';

    let accountCreated = false;
    let dataSaved = false;

    try {
        ignoreAuthChange = true;
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        accountCreated = true;

        await db.collection('users').doc(cred.user.uid).set({
            id: cred.user.uid,
            name, email, phone, parentPhone, governorate, center,
            isOutside, stage, grade,
            role: 'student',
            active: false,
            attempts: { avg: 0, solved: 0, total: 0, pending: 0 },
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        dataSaved = true;

        alert('✅ تم إنشاء الحساب بنجاح!\n\n📌 يرجى انتظار تفعيل حسابك من الإدارة.\n\n⏳ بعد التفعيل، هتقدر تسجل دخولك عادي.');
        switchAuthView('login');
        document.getElementById('registerForm').reset();
    } catch (err) {
        console.error('❌ Registration error:', err.code, err.message);

        if (err.code === 'auth/email-already-in-use')        alert('البريد الإلكتروني مستخدم بالفعل.');
        else if (err.code === 'auth/invalid-email')          alert('البريد الإلكتروني غير صحيح.');
        else if (err.code === 'auth/weak-password')          alert('كلمة المرور ضعيفة جداً.');
        else if (err.code === 'auth/too-many-requests')      alert('محاولات كثيرة، حاول لاحقاً.');
        else if (err.code === 'auth/network-request-failed') alert('تعذّر الاتصال، تحقق من الإنترنت.');
        else if (err.code === 'auth/operation-not-allowed')  alert('❌ تسجيل Email/Password غير مفعّل في Firebase.');
        else if (err.code === 'permission-denied' || (err.message && err.message.toLowerCase().includes('permission')))
            alert('❌ صلاحيات Firestore تمنع الحفظ.');
        else                                                  alert('حدث خطأ: ' + (err.code || err.message || 'غير معروف'));

        if (accountCreated && !dataSaved) {
            alert('⚠️ تم إنشاء الحساب لكن لم يتم حفظ بياناتك في قاعدة البيانات.\nيرجى التواصل مع الإدارة.');
        }
    } finally {
        // ✅ signOut في finally عشان المستخدم مايفضلش مسجل دخول
        if (accountCreated) {
            try {
                await auth.signOut();
            } catch (signOutErr) {
                console.warn('⚠️ signOut failed:', signOutErr);
            }
        }
        ignoreAuthChange = false;
        btn.disabled = false;
        btn.textContent = 'إنشاء الحساب ←';
    }
}

// ═══════════════════════════════════════════════════════════
//  Login Handler
// ═══════════════════════════════════════════════════════════
async function handleLoginSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('loginSubmitBtn');
    const email    = document.getElementById('loginEmailOrPhone').value.trim();
    const password = document.getElementById('loginPass').value;
    btn.disabled = true;
    btn.textContent = 'جاري تسجيل الدخول...';

    try {
        await auth.signInWithEmailAndPassword(email, password);
        // ✅ تم تسجيل الدخول — الـ Auth Observer هيكمل باقي الفحوصات
    } catch (err) {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            alert('❌ البريد الإلكتروني أو كلمة المرور غير صحيحة.');
        } else if (err.code === 'auth/invalid-email') {
            alert('البريد الإلكتروني غير صحيح.');
        } else if (err.code === 'auth/too-many-requests') {
            alert('محاولات كثيرة، حاول لاحقاً.');
        } else if (err.code === 'auth/network-request-failed') {
            alert('تعذّر الاتصال، تحقق من الإنترنت.');
        } else {
            alert('حدث خطأ، حاول مرة أخرى.');
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'تسجيل الدخول ←';
    }
}

// ═══════════════════════════════════════════════════════════
//  Auth State Observer
// ═══════════════════════════════════════════════════════════
function setupAuthObserver() {
    auth.onAuthStateChanged(async (fbUser) => {
        if (ignoreAuthChange) return;
        if (!fbUser) return;
        try {
            const doc = await db.collection('users').doc(fbUser.uid).get();
            if (!doc.exists) {
                alert('⚠️ لا يوجد ملف مستخدم مرتبط بهذا الحساب. تواصل مع الإدارة.');
                await auth.signOut();
                return;
            }
            const user = { id: doc.id, ...doc.data() };
            if (!user.active) {
                alert('⏳ حسابك غير مفعّل. تواصل مع الإدارة للتفعيل.');
                await auth.signOut();
                return;
            }
            currentUser = user;
            document.getElementById('authSection').style.display = 'none';
            document.getElementById('homeSection').style.display = 'none';
            document.getElementById('navButtons').style.display = 'none';
            document.getElementById('navUser').style.display = 'flex';
            document.getElementById('userNameDisplay').textContent = user.name + ' 👋';
            hideNavLinks();

            if (user.role === 'admin') {
                document.getElementById('adminLinkBtn').style.display = 'inline-block';
                window.location.href = 'admin.html';
            } else {
                document.getElementById('adminLinkBtn').style.display = 'none';
                document.getElementById('studentDashboard').classList.add('active');
                loadStudentDashboard(user);
            }
            window.scrollTo(0, 0);
        } catch (err) {
            console.error('خطأ في تحميل بيانات المستخدم:', err);
        }
    });
}

// ═══════════════════════════════════════════════════════════
//  🚀 Init
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
    loadDarkModePreference();
    renderTeachers();
    renderCourses();
    renderBooks();
    attachStaticListeners();
    toggleCenterField();
    setupAuthObserver();

    document.addEventListener('click', handleActionClick);

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = e.target.closest('[data-action]');
        if (!el) return;
        if (el.tagName === 'A' || el.tagName === 'BUTTON') return;
        e.preventDefault();
        el.click();
    });
});
