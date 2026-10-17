'use strict';

// ═══════════════════════════════════════════════════════════
//  State
// ═══════════════════════════════════════════════════════════
let currentAdmin = null;

// ═══════════════════════════════════════════════════════════
//  Collection Helpers
// ═══════════════════════════════════════════════════════════
async function getCollection(name) {
    const snap = await db.collection(name).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
async function getUsers()    { return await getCollection('users');    }
async function getCourses()  { return await getCollection('courses');  }
async function getBooks()    { return await getCollection('books');    }
async function getTeachers() { return await getCollection('teachers'); }
async function getExams()    { return await getCollection('exams');    }
async function getBundles()  { return await getCollection('bundles');  }

// ═══════════════════════════════════════════════════════════
//  🌙 Dark Mode
// ═══════════════════════════════════════════════════════════
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode') ? 'true' : 'false');
    updateDarkModeButtons();
}
function updateDarkModeButtons() {
    const isDark = document.body.classList.contains('dark-mode');
    document.querySelectorAll('.btn-dark-mode').forEach(btn => btn.textContent = isDark ? '☀️' : '🌙');
}
function loadDarkModePreference() {
    if (localStorage.getItem('darkMode') === 'true') document.body.classList.add('dark-mode');
    updateDarkModeButtons();
}

// ═══════════════════════════════════════════════════════════
//  📝 قوائم الصفوف
// ═══════════════════════════════════════════════════════════
function initGrades() {
    const grades = ['الأول ابتدائي','الثاني ابتدائي','الثالث ابتدائي','الرابع ابتدائي','الخامس ابتدائي','السادس ابتدائي','الأول إعدادي','الثاني إعدادي','الثالث إعدادي','الأول ثانوي','الثاني ثانوي','الثالث ثانوي'];
    ['bundleGrade', 'bookGrade', 'examGrade', 'courseGrade'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        grades.forEach(g => {
            const opt = document.createElement('option');
            opt.value = 'الصف ' + g;
            opt.textContent = 'الصف ' + g;
            select.appendChild(opt);
        });
    });
}

// ═══════════════════════════════════════════════════════════
//  🔐 Auth Guard
// ═══════════════════════════════════════════════════════════
auth.onAuthStateChanged(async (fbUser) => {
    if (!fbUser) { window.location.href = 'index.html'; return; }
    try {
        const doc = await db.collection('users').doc(fbUser.uid).get();
        if (!doc.exists || doc.data().role !== 'admin' || !doc.data().active) {
            alert('⛔ ليس لديك صلاحية الوصول لهذه الصفحة.');
            await auth.signOut();
            window.location.href = 'index.html';
            return;
        }
        currentAdmin = { id: doc.id, ...doc.data() };
        document.getElementById('adminNameDisplay').textContent = currentAdmin.name + ' 👑';
        document.getElementById('loadingOverlay').style.display = 'none';
        initAdminPanel();
    } catch (err) {
        console.error(err);
        await auth.signOut();
        window.location.href = 'index.html';
    }
});

async function logout() {
    try { await auth.signOut(); } catch(e) {}
    window.location.href = 'index.html';
}

// ═══════════════════════════════════════════════════════════
//  👥 الطلاب
// ═══════════════════════════════════════════════════════════
async function loadStudentsTable() {
    const allUsers = await getUsers();
    const students = allUsers.filter(u => u.role === 'student');
    const tbody = document.getElementById('studentsTableBody');

    const searchInput = document.getElementById('studentSearchInput');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    let displayStudents = students;
    if (query) {
        displayStudents = students.filter(u => {
            const name = (u.name || '').toLowerCase();
            const phone = (u.phone || '').toLowerCase();
            const parentPhone = (u.parentPhone || '').toLowerCase();
            return name.includes(query) || phone.includes(query) || parentPhone.includes(query);
        });
    }

    const countEl = document.getElementById('searchResultsCount');
    if (countEl) {
        countEl.textContent = query ? `📊 عدد النتائج: ${displayStudents.length} من ${students.length}` : `📊 إجمالي الطلاب: ${students.length}`;
    }

    if (!students.length) {
        tbody.innerHTML = '<tr><td colspan="5"><div class="alert alert-info" style="margin:10px 0;">📭 لا يوجد طلاب مسجلون حتى الآن.</div></td></tr>';
        return;
    }
    if (!displayStudents.length) {
        tbody.innerHTML = '<tr><td colspan="5"><div class="alert alert-warning" style="margin:10px 0;">🔍 لا توجد نتائج مطابقة للبحث.</div></td></tr>';
        return;
    }

    tbody.innerHTML = displayStudents.map((u, idx) => {
        return `
        <tr>
            <td>${idx+1}</td>
            <td>${esc(u.name)}</td>
            <td>${esc(u.grade || 'غير محدد')}</td>
            <td style="color:${u.active ? 'green' : 'red'}">${u.active ? '✅ مفعل' : '⏳ معلق'}</td>
            <td style="white-space: nowrap;">
                <button type="button" data-action="show-student-details" data-student-id="${attr(u.id)}" class="btn-card btn-details" style="font-size:11px; padding:6px 12px;">📋</button>
                <button type="button" data-action="toggle-student" data-student-id="${attr(u.id)}" class="btn-card ${u.active ? 'btn-danger' : 'btn-success'}" style="margin-right:5px; font-size:11px; padding:6px 12px;">${u.active ? 'إلغاء' : 'تفعيل'}</button>
                <button type="button" data-action="delete-student" data-student-id="${attr(u.id)}" class="btn-card btn-delete" style="margin-right:5px; font-size:11px; padding:6px 12px;">🗑️</button>
            </td>
        </tr>
        `;
    }).join('');
}

async function showStudentDetails(id) {
    const snap = await db.collection('users').doc(id).get();
    if (!snap.exists) { alert('الطالب غير موجود.'); return; }
    const u = { id: snap.id, ...snap.data() };

    // ✅ حساب الإحصائيات لحظياً من examAttempts
    let stats = { avg: 0, solved: 0, total: 0, pending: 0 };
    try {
        const attemptsSnap = await db.collection('examAttempts')
            .where('studentId', '==', id)
            .get();

        const attempts = attemptsSnap.docs.map(d => d.data());
        const graded = attempts.filter(a => a.pending !== true);
        const pendingCount = attempts.filter(a => a.pending === true).length;

        stats.solved = graded.length;
        stats.pending = pendingCount;
        stats.avg = graded.length
            ? Math.round(graded.reduce((sum, a) => sum + (Number(a.score) || 0), 0) / graded.length)
            : 0;
        stats.total = attempts.reduce((sum, a) => sum + (Number(a.answersCount) || 0), 0);
    } catch (err) {
        console.warn('تعذر حساب الإحصائيات:', err);
    }

    const initial = esc((u.name || '؟').charAt(0));
    const isOutside = u.isOutside ? 'نعم 🌍 (صفارة)' : 'لا 🇪🇬';
    const stageText = u.stage === 'primary' ? 'ابتدائي أزهري' :
                      u.stage === 'preparatory' ? 'إعدادي أزهري' :
                      u.stage === 'secondary' ? 'ثانوي أزهري' : (u.stage || 'غير محدد');

    const gradesMap = {
        'ابتدائي': ['الأول ابتدائي','الثاني ابتدائي','الثالث ابتدائي','الرابع ابتدائي','الخامس ابتدائي','السادس ابتدائي'],
        'إعدادي': ['الأول إعدادي','الثاني إعدادي','الثالث إعدادي'],
        'ثانوي': ['الأول ثانوي','الثاني ثانوي','الثالث ثانوي']
    };

    let gradeOptionsHTML = '';
    for (const [stage, grades] of Object.entries(gradesMap)) {
        gradeOptionsHTML += `<optgroup label="📚 ${stage}">`;
        grades.forEach(g => {
            const val = 'الصف ' + g;
            const selected = (u.grade === val) ? 'selected' : '';
            gradeOptionsHTML += `<option value="${esc(val)}" ${selected}>${esc(val)}</option>`;
        });
        gradeOptionsHTML += `</optgroup>`;
    }

    document.getElementById('studentDetailsContent').innerHTML = `
        <div style="width:70px; height:70px; border-radius:50%; background:linear-gradient(135deg, #3b0a0a, #d4af37); color:#fff; display:flex; align-items:center; justify-content:center; font-size:28px; font-weight:900; margin:0 auto 18px; border:3px solid #d4af37;">${initial}</div>
        <div class="detail-row"><span>👤 الاسم</span><strong>${esc(u.name) || '—'}</strong></div>
        <div class="detail-row"><span>📧 البريد</span><span dir="ltr">${esc(u.email) || '—'}</span></div>
        <div class="detail-row"><span>📞 رقم الطالب</span><span dir="ltr">${esc(u.phone) || '—'}</span></div>
        <div class="detail-row"><span>👨‍👦 رقم ولي الأمر</span><span dir="ltr">${esc(u.parentPhone) || '—'}</span></div>
        <div class="detail-row"><span>📍 المحافظة</span><strong>${esc(u.governorate) || '—'}</strong></div>
        <div class="detail-row"><span>🏘️ المركز</span><strong>${esc(u.center) || '—'}</strong></div>
        <div class="detail-row"><span>🌍 صفارة</span><strong>${isOutside}</strong></div>
        <div class="detail-row"><span>🎓 المرحلة</span><strong>${esc(stageText)}</strong></div>
        <div class="detail-row"><span>📚 الصف</span><strong id="currentGradeDisplay">${esc(u.grade) || '—'}</strong></div>
        <div class="detail-row"><span>📊 الحالة</span><strong style="color:${u.active ? 'green' : 'red'}">${u.active ? '✅ مفعل' : '⏳ معلق'}</strong></div>
        <div class="detail-row"><span>📈 متوسط الدرجات</span><strong>${stats.avg}%</strong></div>
        <div class="detail-row"><span>✅ اختبارات محلولة</span><strong>${stats.solved}</strong></div>
        <div class="detail-row" style="border-bottom:none;"><span>⏳ اختبارات قيد التصحيح</span><strong>${stats.pending}</strong></div>

        <!-- ═══ قسم تغيير الصف ═══ -->
        <div class="change-grade-wrapper">
            <button type="button" class="btn-change-grade-reveal" data-action="reveal-grade-change">
                🔄 تغيير الصف وتصفير البيانات
            </button>

            <div class="change-grade-section" id="changeGradeSection">
                <label class="change-grade-label">🎓 اختر الصف الجديد:</label>
                <div class="change-grade-row">
                    <select id="changeGradeSelect" class="change-grade-select">
                        <option value="">— اختر الصف الجديد —</option>
                        ${gradeOptionsHTML}
                    </select>
                    <button type="button" class="btn-submit change-grade-btn" data-action="change-student-grade" data-student-id="${attr(u.id)}">
                        💾 حفظ
                    </button>
                    <button type="button" class="btn-card change-grade-cancel" data-action="cancel-grade-change">
                        ✕ إلغاء
                    </button>
                </div>
                <div class="change-grade-hint" style="background: rgba(168, 60, 60, 0.08); padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(168, 60, 60, 0.25); margin-top: 12px;">
                    <strong style="color: #a83c3c; display: block; margin-bottom: 8px;">⚠️ تحذير هام جداً:</strong>
                    <ul style="list-style: none; padding: 0; margin: 0; font-size: 11.5px; line-height: 1.9; color: #666;">
                        <li>🗑️ <strong>هيتم حذف:</strong> كل محاولات الاختبارات + كل الدرجات + كل النتائج</li>
                        <li>📊 <strong>هيتم تصفير:</strong> متوسط الدرجات + عدد الاختبارات المحلولة</li>
                        <li>✅ <strong>هيفضل محفوظ:</strong> بيانات الحساب (الاسم، الإيميل، التليفون)</li>
                        <li>⚠️ <strong>هذا الإجراء لا يمكن التراجع عنه!</strong></li>
                    </ul>
                    <p style="margin-top: 10px; font-size: 11px; color: #8a6f1d; font-weight: 700;">الطالب هيبقى كأنه طالب جديد تماماً في الصف الجديد.</p>
                </div>
            </div>
        </div>
    `;
    document.getElementById('studentDetailsModal').style.display = 'flex';
}

function closeStudentModal() {
    document.getElementById('studentDetailsModal').style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════
   🔄 تغيير صف الطالب + تصفير كل حاجة
   ═══════════════════════════════════════════════════════════ */

function revealGradeChange() {
    const section = document.getElementById('changeGradeSection');
    const btn = document.querySelector('.btn-change-grade-reveal');
    if (section) {
        section.style.display = 'block';
        setTimeout(() => {
            section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }
    if (btn) btn.style.display = 'none';
}

function cancelGradeChange() {
    const section = document.getElementById('changeGradeSection');
    const btn = document.querySelector('.btn-change-grade-reveal');
    const select = document.getElementById('changeGradeSelect');
    if (section) section.style.display = 'none';
    if (btn) btn.style.display = 'inline-flex';
    if (select) select.value = '';
}

async function changeStudentGrade(studentId) {
    const selectEl = document.getElementById('changeGradeSelect');
    if (!selectEl) return;
    const newGrade = selectEl.value;

    if (!newGrade) {
        alert('⚠️ اختر الصف الجديد أولاً.');
        selectEl.focus();
        return;
    }

    try {
        const userRef = db.collection('users').doc(studentId);
        const snap = await userRef.get();
        if (!snap.exists) {
            alert('❌ الطالب غير موجود.');
            return;
        }

        const studentData = snap.data();
        const oldGrade = studentData.grade || 'غير محدد';
        const studentName = studentData.name || 'طالب';

        if (newGrade === oldGrade) {
            alert('⚠️ الطالب في نفس الصف بالفعل. اختر صفاً آخر.');
            return;
        }

        const confirmMsg =
            `⚠️⚠️ تحذير هام ⚠️⚠️\n\n` +
            `أنت على وشك تغيير صف الطالب وإعادة تعيين كل بياناته:\n\n` +
            `👤 الطالب: ${studentName}\n` +
            `📚 من: ${oldGrade}\n` +
            `📚 إلى: ${newGrade}\n\n` +
            `🗑️ سيتم حذف الآتي نهائياً:\n` +
            `• كل محاولات الاختبارات\n` +
            `• كل النتائج والدرجات\n` +
            `• كل الاختبارات المُكتملة\n` +
            `• متوسط الدرجات\n\n` +
            `✅ سيتم الاحتفاظ بـ:\n` +
            `• بيانات الحساب (اسم، إيميل، تليفون)\n` +
            `• حالة الحساب (مفعّل/معلّق)\n\n` +
            `⚠️ هذا الإجراء لا يمكن التراجع عنه!\n\n` +
            `هل أنت متأكد تماماً؟`;

        // ✅ showConfirm بدل confirm
        const firstConfirm = await showConfirm(confirmMsg, {
            title: '⚠️ تغيير صف الطالب',
            icon: '🔄',
            okText: 'متابعة',
            cancelText: 'إلغاء',
            danger: true
        });
        if (!firstConfirm) return;

        const doubleConfirm = await showConfirm(
            `🔒 تأكيد نهائي\n\n` +
            `اضغط "تأكيد" لحذف كل بيانات "${studentName}" وتحويله لصف "${newGrade}"`,
            {
                title: '🔒 تأكيد نهائي',
                icon: '⚠️',
                okText: 'تأكيد نهائي',
                cancelText: 'رجوع',
                danger: true
            }
        );
        if (!doubleConfirm) return;

        const btn = document.querySelector('[data-action="change-student-grade"]');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ جاري المعالجة...';
        }

        let attemptsDeleted = 0;
        try {
            const attemptsSnap = await db.collection('examAttempts')
                .where('studentId', '==', studentId)
                .get();

            if (!attemptsSnap.empty) {
                const allDocs = attemptsSnap.docs;
                let batch = db.batch();
                let inBatch = 0;

                for (const doc of allDocs) {
                    batch.delete(doc.ref);
                    inBatch++;
                    attemptsDeleted++;

                    if (inBatch >= 400) {
                        await batch.commit();
                        batch = db.batch();
                        inBatch = 0;
                    }
                }
                if (inBatch > 0) await batch.commit();
            }
        } catch (err) {
            console.warn('⚠️ فشل حذف بعض المحاولات:', err);
        }

        let completedDeleted = 0;
        try {
            const completedSnap = await userRef.collection('completedExams').get();
            if (!completedSnap.empty) {
                const allDocs = completedSnap.docs;
                let batch = db.batch();
                let inBatch = 0;

                for (const doc of allDocs) {
                    batch.delete(doc.ref);
                    inBatch++;
                    completedDeleted++;

                    if (inBatch >= 400) {
                        await batch.commit();
                        batch = db.batch();
                        inBatch = 0;
                    }
                }
                if (inBatch > 0) await batch.commit();
            }
        } catch (err) {
            console.warn('⚠️ فشل حذف completedExams:', err);
        }

        await userRef.update({
            grade: newGrade,
            attempts: {
                avg: 0,
                solved: 0,
                total: 0,
                pending: 0
            },
            gradeChangedAt: firebase.firestore.FieldValue.serverTimestamp(),
            gradeChangedBy: currentAdmin ? currentAdmin.name : 'أدمن',
            previousGrade: oldGrade,
            resetCount: firebase.firestore.FieldValue.increment(1)
        });

        const successMsg =
            `✅ تم تغيير الصف بنجاح!\n\n` +
            `👤 ${studentName}\n` +
            `📚 الصف الجديد: ${newGrade}\n\n` +
            `📊 ملخص العملية:\n` +
            `🗑️ محاولات محذوفة: ${attemptsDeleted}\n` +
            `🗑️ اختبارات مكتملة محذوفة: ${completedDeleted}\n` +
            `📈 الدرجات: 0%\n\n` +
            `✨ الطالب الآن في حالة "طالب جديد" بالكامل.`;

        alert(successMsg);

        closeStudentModal();
        loadStudentsTable();

    } catch (err) {
        console.error('❌ خطأ في تغيير الصف:', err);
        let errMsg = '❌ حدث خطأ أثناء التغيير.';
        if (err.code === 'permission-denied') {
            errMsg = '❌ صلاحيات Firestore تمنع التعديل.\n\nتأكد من إعدادات Rules.';
        } else if (err.code === 'not-found') {
            errMsg = '❌ الطالب غير موجود.';
        } else if (err.code === 'resource-exhausted') {
            errMsg = '⏳ عدد العمليات كبير جداً. انتظر دقيقة وحاول تاني.';
        } else if (err.message) {
            errMsg = '❌ ' + err.message;
        }
        alert(errMsg);

        const btn = document.querySelector('[data-action="change-student-grade"]');
        if (btn) {
            btn.disabled = false;
            btn.textContent = '💾 حفظ';
        }
    }
}

async function toggleStudent(id) {
    try {
        const ref = db.collection('users').doc(id);
        const snap = await ref.get();
        if (!snap.exists) { alert('الطالب غير موجود.'); return; }
        const newActive = !snap.data().active;
        await ref.update({ active: newActive });
        alert(newActive ? '✅ تم تفعيل الطالب' : '❌ تم إلغاء التفعيل');
        loadStudentsTable();
    } catch (err) { console.error(err); alert('❌ حدث خطأ.'); }
}

async function deleteStudent(id) {
    const ok = await showConfirm('⚠️ هل أنت متأكد من حذف هذا الطالب نهائياً؟\n\nسيتم حذف كل درجاته وبياناته من المنصة.', {
        title: 'حذف طالب',
        icon: '🗑️',
        okText: 'حذف',
        cancelText: 'إلغاء',
        danger: true
    });
    if (!ok) return;

    try {
        const userRef = db.collection('users').doc(id);

        // 1. حذف محاولات الاختبارات (examAttempts)
        const attemptsSnap = await db.collection('examAttempts').where('studentId', '==', id).get();
        if (!attemptsSnap.empty) {
            let batch = db.batch();
            let count = 0;
            attemptsSnap.forEach(doc => {
                batch.delete(doc.ref);
                count++;
                if (count === 400) { batch.commit(); batch = db.batch(); count = 0; }
            });
            if (count > 0) await batch.commit();
        }

        // 2. حذف الـ Subcollections (completedExams, watchedVideos)
        const completedSnap = await userRef.collection('completedExams').get();
        const watchedSnap = await userRef.collection('watchedVideos').get();

        let batch2 = db.batch();
        completedSnap.forEach(doc => batch2.delete(doc.ref));
        watchedSnap.forEach(doc => batch2.delete(doc.ref));
        await batch2.commit();

        // 3. حذف المستخدم نفسه
        await userRef.delete();

        alert('✅ تم حذف الطالب وكل بياناته المرتبطة بنجاح.');
        loadStudentsTable();
    } catch (err) { 
        console.error(err); 
        alert('❌ حدث خطأ أثناء الحذف.'); 
    }
}

// ═══════════════════════════════════════════════════════════
//  📦 الحزم
// ═══════════════════════════════════════════════════════════
async function loadBundlesTable() {
    const bundles = await getBundles();
    const tbody = document.getElementById('bundlesTableBody');
    tbody.innerHTML = bundles.length ? bundles.map((b, idx) => `
        <tr>
            <td>${idx+1}</td>
            <td><strong>${esc(b.title)}</strong></td>
            <td>${esc(b.grade)}</td>
            <td>${(b.items || []).length} عنصر</td>
            <td><button type="button" data-action="delete-bundle" data-bundle-id="${attr(b.id)}" class="btn-card btn-danger">🗑️</button></td>
        </tr>
    `).join('') : '<tr><td colspan="5">لا توجد وحدات.</td></tr>';
}

async function deleteBundle(id) {
    const ok = await showConfirm('⚠️ هل أنت متأكد من حذف هذه الوحدة؟', {
        title: 'حذف وحدة',
        icon: '🗑️',
        okText: 'حذف',
        cancelText: 'إلغاء',
        danger: true
    });
    if (!ok) return;

    try {
        await db.collection('bundles').doc(id).delete();
        loadBundlesTable();
        populateBundleSelects();
    } catch (err) { console.error(err); }
}

async function populateBundleSelects() {
    const bundles = await getBundles();
    const sel = document.getElementById('itemBundleSelect');
    sel.innerHTML = '<option value="">اختر وحدة</option>';
    bundles.forEach(b => {
        const o = document.createElement('option');
        o.value = b.id; o.textContent = b.title;
        sel.appendChild(o);
    });
    const exams = await getExams();
    const selExam = document.getElementById('itemExamSelect');
    selExam.innerHTML = '<option value="">اختر اختبار</option>';
    exams.forEach(e => {
        const o = document.createElement('option');
        o.value = e.id; o.textContent = e.title;
        selExam.appendChild(o);
    });
    const courses = await getCourses();
    const books = await getBooks();
    const selP = document.getElementById('platformItemSelect');
    selP.innerHTML = '<option value="">اختر عنصراً من المنصة</option>';
    courses.forEach(c => {
        const o = document.createElement('option');
        o.value = JSON.stringify({ source: 'course', id: c.id });
        o.textContent = '🎬 ' + c.title;
        selP.appendChild(o);
    });
    books.forEach(b => {
        const o = document.createElement('option');
        o.value = JSON.stringify({ source: 'book', id: b.id });
        o.textContent = '📄 ' + b.title;
        selP.appendChild(o);
    });
}

function toggleItemFields() {
    const type = document.getElementById('itemType').value;
    document.getElementById('sourceFields').style.display = (type === 'exam') ? 'none' : 'block';
    document.getElementById('examFields').style.display = (type === 'exam') ? 'block' : 'none';
    if (type !== 'exam') toggleSourceFields();
}
function toggleSourceFields() {
    const t = document.getElementById('sourceType').value;
    document.getElementById('manualFields').style.display = (t === 'platform') ? 'none' : 'block';
    document.getElementById('platformFields').style.display = (t === 'platform') ? 'block' : 'none';
}

async function appendItemToBundle(bundleId, newItem) {
    const ref = db.collection('bundles').doc(bundleId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('bundle not found');
    const currentItems = snap.data().items || [];
    await ref.update({ items: [...currentItems, newItem] });
}

// ═══════════════════════════════════════════════════════════
//  🖼️ Image compression
// ═══════════════════════════════════════════════════════════
async function imageToBase64Compressed(file, maxWidth = 400, quality = 0.8) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            reject(new Error('الملف ليس صورة صالحة'));
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round((maxWidth / width) * height);
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const base64 = canvas.toDataURL('image/jpeg', quality);
                if (base64.length > 700000) {
                    const lowerQuality = Math.max(0.4, quality - 0.2);
                    const retry = canvas.toDataURL('image/jpeg', lowerQuality);
                    if (retry.length > 700000) {
                        reject(new Error('⚠️ الصورة كبيرة جداً حتى بعد الضغط. جرب صورة أصغر.'));
                    } else {
                        resolve(retry);
                    }
                } else {
                    resolve(base64);
                }
            };
            img.onerror = () => reject(new Error('فشل قراءة الصورة'));
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function previewTeacherImage(input) {
    const previewBox = document.getElementById('teacherImagePreview');
    const previewImg = document.getElementById('teacherPreviewImg');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImg.src = e.target.result;
            previewBox.classList.add('active');
        };
        reader.readAsDataURL(input.files[0]);
    } else {
        previewBox.classList.remove('active');
        previewImg.src = '';
    }
}

// ═══════════════════════════════════════════════════════════
//  📝 النماذج
// ═══════════════════════════════════════════════════════════
function setupForms() {
    document.getElementById('addBundleForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const title = document.getElementById('bundleTitle').value.trim();
        const grade = document.getElementById('bundleGrade').value;
        if (!title || !grade) { alert('املأ الحقول'); return; }
        try {
            await db.collection('bundles').add({ title, grade, items: [] });
            document.getElementById('bundleAddMsg').innerHTML = '<div class="alert alert-success">✅ تم إنشاء الوحدة!</div>';
            this.reset();
            loadBundlesTable();
            populateBundleSelects();
        } catch (err) { console.error(err); }
    });

    document.getElementById('addItemForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const bundleId = document.getElementById('itemBundleSelect').value;
        const type = document.getElementById('itemType').value;
        const msgDiv = document.getElementById('itemAddMsg');
        const submitBtn = e.target.querySelector('button[type="submit"]');

        if (!bundleId) { alert('اختر وحدة أولاً'); return; }
        submitBtn.disabled = true;
        submitBtn.textContent = 'جاري المعالجة...';

        try {
            if (type === 'exam') {
                const examId = document.getElementById('itemExamSelect').value;
                const title = document.getElementById('examItemTitle').value.trim();
                if (!examId || !title) { alert('املأ بيانات الاختبار'); return; }
                await appendItemToBundle(bundleId, { type: 'exam', title, examId });
                msgDiv.innerHTML = '<div class="alert alert-success">✅ تمت الإضافة!</div>';
                document.getElementById('examItemTitle').value = '';
                loadBundlesTable();
                return;
            }

            const sourceType = document.getElementById('sourceType').value;
            let title = '', link = '', itemType = type;

            if (sourceType === 'platform') {
                const pv = document.getElementById('platformItemSelect').value;
                if (!pv) { alert('اختر عنصراً'); return; }
                const po = JSON.parse(pv);
                if (po.source === 'course') {
                    const s = (await getCourses()).find(c => c.id === po.id);
                    if (!s) return;
                    title = s.title; link = s.link; itemType = 'video';
                } else {
                    const s = (await getBooks()).find(b => b.id === po.id);
                    if (!s) return;
                    title = s.title; link = s.link; itemType = 'pdf';
                }
                await appendItemToBundle(bundleId, { type: itemType, title, link });
            } else {
                title = document.getElementById('itemTitle').value.trim();
                link = document.getElementById('itemLink').value.trim();
                if (!title || !link) { alert('املأ العنوان والرابط'); return; }
                await appendItemToBundle(bundleId, { type: itemType, title, link });
            }
            msgDiv.innerHTML = '<div class="alert alert-success">✅ تمت الإضافة!</div>';
            document.getElementById('itemTitle').value = '';
            document.getElementById('itemLink').value = '';
            loadBundlesTable();
        } catch (err) {
            console.error(err);
            msgDiv.innerHTML = '<div class="alert alert-warning">❌ خطأ: ' + esc(err.message || 'حدث خطأ') + '</div>';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'إضافة العنصر للوحدة';
        }
    });

    document.getElementById('addCourseForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const title = document.getElementById('courseTitle').value.trim();
        const grade = document.getElementById('courseGrade').value;
        const link = document.getElementById('courseLink').value.trim();
        const showInHome = document.getElementById('courseShowInHome').checked;
        const msgDiv = document.getElementById('courseAddMsg');

        if (!title || !grade || !link) { alert('املأ جميع الحقول'); return; }
        try {
            await db.collection('courses').add({ title, grade, link, showInHome });
            msgDiv.innerHTML = '<div class="alert alert-success">✅ تمت الإضافة!</div>';
            this.reset();
            document.getElementById('courseShowInHome').checked = false;
            loadCoursesTable();
            populateBundleSelects();
        } catch (err) {
            console.error(err);
            msgDiv.innerHTML = '<div class="alert alert-warning">❌ خطأ: ' + esc(err.message) + '</div>';
        }
    });

    document.getElementById('addBookForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const title = document.getElementById('bookTitle').value.trim();
        const grade = document.getElementById('bookGrade').value;
        const link = document.getElementById('bookLink').value.trim();
        const showInHome = document.getElementById('bookShowInHome').checked;
        const msgDiv = document.getElementById('bookAddMsg');

        if (!title || !grade || !link) { alert('املأ جميع الحقول'); return; }
        try {
            await db.collection('books').add({ title, grade, link, showInHome });
            msgDiv.innerHTML = '<div class="alert alert-success">✅ تمت الإضافة!</div>';
            this.reset();
            document.getElementById('bookShowInHome').checked = false;
            loadBooksTable();
            populateBundleSelects();
        } catch (err) {
            console.error(err);
            msgDiv.innerHTML = '<div class="alert alert-warning">❌ خطأ: ' + esc(err.message) + '</div>';
        }
    });

    document.getElementById('addTeacherForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const name = document.getElementById('teacherName').value.trim();
        const specialty = document.getElementById('teacherSpecialty').value.trim();
        const imageUrl = document.getElementById('teacherImage').value.trim();
        const f = document.getElementById('teacherImageFile');
        const msgDiv = document.getElementById('teacherAddMsg');
        const submitBtn = e.target.querySelector('button[type="submit"]');

        if (!name) { alert('ادخل الاسم'); return; }
        submitBtn.disabled = true;
        submitBtn.textContent = 'جاري المعالجة...';

        try {
            const initialChar = esc(name.charAt(0));
            let finalImage = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 220"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3b0a0a"/><stop offset="100%" stop-color="#1a0404"/></linearGradient></defs><rect width="170" height="220" rx="16" fill="url(#g)"/><circle cx="85" cy="90" r="45" fill="rgba(212,175,55,0.12)" stroke="#d4af37" stroke-width="1.5"/><text x="85" y="112" font-size="60" text-anchor="middle" fill="#d4af37" font-family="Arial,sans-serif" font-weight="bold">' + initialChar + '</text><text x="85" y="190" font-size="12" text-anchor="middle" fill="#c9a961" font-family="Arial,sans-serif">نُورُ الأَزْهَرِ</text></svg>'
            );

            if (f.files.length > 0) {
                finalImage = await imageToBase64Compressed(f.files[0], 400, 0.8);
                msgDiv.innerHTML = '<div class="alert alert-info">📸 تم ضغط الصورة وحفظها. جاري الإضافة...</div>';
            } else if (imageUrl) {
                finalImage = imageUrl;
            }

            await db.collection('teachers').add({ name, specialty, image: finalImage });
            msgDiv.innerHTML = '<div class="alert alert-success">✅ تمت الإضافة!</div>';
            this.reset();
            document.getElementById('teacherImagePreview').classList.remove('active');
            loadTeachersTable();
        } catch (err) {
            console.error(err);
            msgDiv.innerHTML = '<div class="alert alert-warning">❌ ' + esc(err.message || 'حدث خطأ') + '</div>';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'إضافة المدرس';
        }
    });
}

// ═══════════════════════════════════════════════════════════
//  📝 الاختبارات
// ═══════════════════════════════════════════════════════════
function generateQuestionBoxes() {
    const count = parseInt(document.getElementById('examQuestionCount').value);
    const title = document.getElementById('examTitle').value.trim();
    const grade = document.getElementById('examGrade').value;
    if (!title || !grade) { alert('أدخل العنوان واختر الصف'); return; }
    if (!count || count < 1 || count > 50) { alert('أدخل عدد 1-50'); return; }

    let html = '<h4 style="color:#3b0a0a; margin:18px 0; border-top:1px dashed #ddd; padding-top:18px;">الأسئلة:</h4>';
    for (let i = 0; i < count; i++) {
        html += buildQuestionBoxHTML(i, 'mcq');
    }
    document.getElementById('questionsContainer').innerHTML = html;
    document.getElementById('saveExamBtn').style.display = 'block';
    document.getElementById('examAddMsg').innerHTML = '<div class="alert alert-success">✅ تم توليد ' + count + ' أسئلة. اختار نوع كل سؤال من فوقه.</div>';
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function buildQuestionBoxHTML(index, type) {
    return `
        <div class="question-box-generator" data-qtype="${type}">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
                <h4 style="font-size:15px; margin:0;">السؤال ${index + 1}</h4>
                <div style="display:flex; align-items:center; gap:6px; background:#fff9e6; padding:6px 12px; border-radius:12px; border:1px solid #eadacc;">
                    <label style="font-size:12px; font-weight:700; color:#3b0a0a; margin:0;">نوع السؤال:</label>
                    <select class="q-type-select" style="padding:6px 10px; border:2px solid #eadacc; border-radius:10px; font-size:12px; font-family:'Cairo', sans-serif; background:#fff; cursor:pointer;">
                        <option value="mcq" ${type === 'mcq' ? 'selected' : ''}>🔤 اختيار من متعدد</option>
                        <option value="truefalse" ${type === 'truefalse' ? 'selected' : ''}>✅ صح / غلط</option>
                    </select>
                </div>
            </div>
            <input type="text" class="q-text-input" placeholder="نص السؤال" style="width:100%; padding:10px; border:2px solid #ddd; border-radius:12px; margin-bottom:10px;">
            <div class="options-container">
                ${getOptionsFieldsHTML(type)}
            </div>
            <div style="margin-top:10px;">
                <label style="font-size:13px; font-weight:700; color:#3b0a0a;">الإجابة الصحيحة:</label>
                <select class="correct-select" style="padding:8px; border-radius:12px; border:2px solid #ddd; width:100%;">
                    ${getCorrectOptionsHTML(type)}
                </select>
            </div>
            <div style="margin-top:10px;">
                <label style="font-size:13px; font-weight:700; color:#3b0a0a;">📝 ملاحظة (اختياري):</label>
                <input type="text" class="q-note-input" placeholder="مثال: راجع الفصل الثاني" style="width:100%; padding:10px; border:2px dashed #d4af37; border-radius:12px; margin-top:5px; background:#fffdf5;">
            </div>
        </div>`;
}

function getOptionsFieldsHTML(type) {
    if (type === 'truefalse') {
        return `
            <input type="hidden" class="opt-input" value="صح">
            <input type="hidden" class="opt-input" value="غلط">
            <div style="background:linear-gradient(135deg, #f0f8ff 0%, #e6f2ff 100%); border:2px dashed #6ca0dc; border-radius:12px; padding:14px; text-align:center; color:#1e5a8a; font-weight:800; font-size:13px;">
                ✅ الخيارات ثابتة: <strong>صح</strong> / <strong>غلط</strong>
            </div>`;
    }
    return `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <input type="text" class="opt-input" placeholder="الخيار 1" style="padding:10px; border:2px solid #ddd; border-radius:12px;">
            <input type="text" class="opt-input" placeholder="الخيار 2" style="padding:10px; border:2px solid #ddd; border-radius:12px;">
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
            <input type="text" class="opt-input" placeholder="الخيار 3" style="padding:10px; border:2px solid #ddd; border-radius:12px;">
            <input type="text" class="opt-input" placeholder="الخيار 4" style="padding:10px; border:2px solid #ddd; border-radius:12px;">
        </div>`;
}

function getCorrectOptionsHTML(type) {
    if (type === 'truefalse') {
        return `
            <option value="1">✅ صح</option>
            <option value="2">❌ غلط</option>`;
    }
    return `
        <option value="1">الخيار 1</option>
        <option value="2">الخيار 2</option>
        <option value="3">الخيار 3</option>
        <option value="4">الخيار 4</option>`;
}

function changeQuestionType(selectEl) {
    const box = selectEl.closest('.question-box-generator');
    if (!box) return;
    const newType = selectEl.value;
    const oldType = box.getAttribute('data-qtype') || 'mcq';
    if (newType === oldType) return;

    const currentQText = box.querySelector('.q-text-input')?.value || '';
    const currentNote = box.querySelector('.q-note-input')?.value || '';

    box.setAttribute('data-qtype', newType);

    const optionsContainer = box.querySelector('.options-container');
    if (optionsContainer) optionsContainer.innerHTML = getOptionsFieldsHTML(newType);

    const correctSelect = box.querySelector('.correct-select');
    if (correctSelect) {
        correctSelect.innerHTML = getCorrectOptionsHTML(newType);
        correctSelect.value = '1';
    }

    const qTextEl = box.querySelector('.q-text-input');
    const noteEl = box.querySelector('.q-note-input');
    if (qTextEl) qTextEl.value = currentQText;
    if (noteEl) noteEl.value = currentNote;
}

async function saveFullExam() {
    const title = document.getElementById('examTitle').value.trim();
    const grade = document.getElementById('examGrade').value;
    const oneTimeOnly = document.getElementById('examOneTimeOnly').checked;
    const boxes = document.querySelectorAll('.question-box-generator');
    if (!boxes.length) { alert('قم بتوليد الأسئلة أولاً'); return; }
    if (!title || !grade) { alert('أدخل العنوان واختر الصف'); return; }
    if (title.length > 200) { alert('⚠️ عنوان الاختبار يجب أن يكون أقل من 200 حرف.'); return; }

    const questionsPublic = [];
    const answersPrivate  = [];
    const seenQuestions = new Set();

    for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        const q = box.querySelector('.q-text-input').value.trim();
        const opts = Array.from(box.querySelectorAll('.opt-input')).map(x => x.value.trim());
        const correct = parseInt(box.querySelector('.correct-select').value) - 1;
        const qNoteEl = box.querySelector('.q-note-input');
        const qNote = qNoteEl ? qNoteEl.value.trim() : '';
        const qType = box.getAttribute('data-qtype') || 'mcq';

        if (!q) { alert('⚠️ السؤال رقم ' + (i + 1) + ' فاضي.'); return; }
        if (q.length < 3) { alert('⚠️ نص السؤال رقم ' + (i + 1) + ' قصير جداً.'); return; }
        if (q.length > 500) { alert('⚠️ نص السؤال رقم ' + (i + 1) + ' طويل جداً (الحد الأقصى 500 حرف).'); return; }
        if (seenQuestions.has(q)) { alert('⚠️ السؤال رقم ' + (i + 1) + ' مكرر مع سؤال سابق.'); return; }
        seenQuestions.add(q);

        if (opts.length < 2) { alert('⚠️ السؤال رقم ' + (i + 1) + ' محتاج على الأقل خيارين.'); return; }
        if (opts.some(o => !o)) { alert('⚠️ فيه خيار فاضي في السؤال رقم ' + (i + 1) + '.'); return; }
        if (opts.some(o => o.length > 200)) { alert('⚠️ أحد الخيارات في السؤال رقم ' + (i + 1) + ' طويل جداً.'); return; }

        const uniqueOpts = new Set(opts);
        if (uniqueOpts.size !== opts.length) {
            alert('⚠️ فيه خيارات مكررة في السؤال رقم ' + (i + 1) + '.');
            return;
        }

        if (isNaN(correct) || correct < 0 || correct >= opts.length) {
            alert('⚠️ الإجابة الصحيحة في السؤال رقم ' + (i + 1) + ' غير صحيحة.');
            return;
        }

        const questionObj = { q, options: opts, type: qType };
        if (qNote) {
            if (qNote.length > 300) {
                alert('⚠️ ملاحظة السؤال رقم ' + (i + 1) + ' طويلة جداً (الحد الأقصى 300 حرف).');
                return;
            }
            questionObj.note = qNote;
        }

        questionsPublic.push(questionObj);
        answersPrivate.push(correct);
    }

    try {
        const newDocRef = db.collection('exams').doc();

        await newDocRef.set({
            title, grade, oneTimeOnly,
            questions: questionsPublic
        });

        await newDocRef.collection('_private').doc('key').set({
            answers: answersPrivate
        });

        document.getElementById('questionsContainer').innerHTML = '';
        document.getElementById('saveExamBtn').style.display = 'none';
        document.getElementById('examAddMsg').innerHTML =
            '<div class="alert alert-success">✅ تم إنشاء الاختبار بأمان!</div>';
        alert('✅ تم إنشاء الاختبار بنجاح!');
        document.getElementById('examSetupForm').reset();
        populateBundleSelects();
        loadExamsTable();
        window.scrollTo(0, 0);
    } catch (err) {
        console.error(err);
        alert('❌ خطأ في الحفظ: ' + (err.message || ''));
    }
}

// ═══════════════════════════════════════════════════════════
//  📋 الجداول
// ═══════════════════════════════════════════════════════════

async function loadCoursesTable() {
    const tbody = document.getElementById('coursesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#888;">⏳ جاري التحميل...</td></tr>';

    try {
        const [courses, bundles] = await Promise.all([
            getCourses(),
            getBundles()
        ]);

        const rows = [];

        courses.forEach((c, idx) => {
            rows.push(`
                <tr>
                    <td>${idx + 1}</td>
                    <td>
                        <strong>${esc(c.title)}</strong>
                        <div style="margin-top:6px;">
                            <span style="background:#2a7a2a; color:#fff; padding:3px 10px; border-radius:50px; font-size:10px; font-weight:700;">📹 محاضرة مستقلة</span>
                            ${c.showInHome ? '<span style="background:#d4af37; color:#3b0a0a; padding:3px 10px; border-radius:50px; font-size:10px; font-weight:700; margin-right:4px;">🌐 في الرئيسية</span>' : ''}
                        </div>
                    </td>
                    <td>${esc(c.grade)}</td>
                    <td>${c.link ? '<span style="color:#2a7a2a; font-weight:700;">✓ موجود</span>' : '<span style="color:#a00;">✗ لا يوجد</span>'}</td>
                    <td>
                        <button type="button" data-action="delete-course" data-course-id="${attr(c.id)}" class="btn-card btn-danger" title="حذف المحاضرة">🗑️</button>
                    </td>
                </tr>
            `);
        });

        bundles.forEach(b => {
            (b.items || []).forEach((item, itemIdx) => {
                if (item.type !== 'video') return;
                rows.push(`
                    <tr>
                        <td>
                            <span style="background:#1e5a8a; color:#fff; padding:4px 10px; border-radius:8px; font-size:11px; font-weight:700;">📦</span>
                        </td>
                        <td>
                            <strong>${esc(item.title)}</strong>
                            <div style="margin-top:6px;">
                                <span style="background:#1e5a8a; color:#fff; padding:3px 10px; border-radius:50px; font-size:10px; font-weight:700;">📦 من حزمة: ${esc(b.title)}</span>
                            </div>
                        </td>
                        <td>${esc(b.grade)}</td>
                        <td>${item.link ? '<span style="color:#2a7a2a; font-weight:700;">✓ موجود</span>' : '<span style="color:#a00;">✗ لا يوجد</span>'}</td>
                        <td>
                            <button type="button" data-action="delete-bundle-video" data-bundle-id="${attr(b.id)}" data-item-index="${itemIdx}" data-video-title="${attr(item.title)}" class="btn-card btn-delete" title="حذف الفيديو من الحزمة">🗑️</button>
                        </td>
                    </tr>
                `);
            });
        });

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#888;">📭 لا توجد محاضرات — أضف محاضرة أو فيديو داخل حزمة</td></tr>';
            return;
        }

        tbody.innerHTML = rows.join('');

    } catch (err) {
        console.error('خطأ في تحميل المحاضرات:', err);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#a00;">❌ حدث خطأ أثناء التحميل</td></tr>';
    }
}

async function deleteCourse(id) {
    const ok = await showConfirm('حذف هذه المحاضرة؟', {
        title: 'حذف محاضرة',
        icon: '🗑️',
        okText: 'حذف',
        cancelText: 'إلغاء',
        danger: true
    });
    if (!ok) return;

    try { await db.collection('courses').doc(id).delete(); loadCoursesTable(); populateBundleSelects(); }
    catch (err) { console.error(err); }
}

async function deleteBundleVideo(bundleId, itemIndex, videoTitle) {
    const ok = await showConfirm(
        `⚠️ هل أنت متأكد من حذف الفيديو "${videoTitle}" من الحزمة؟\n\nالحزمة نفسها هتفضل موجودة.`,
        {
            title: 'حذف فيديو',
            icon: '🎬',
            okText: 'حذف',
            cancelText: 'إلغاء',
            danger: true
        }
    );
    if (!ok) return;

    try {
        const ref = db.collection('bundles').doc(bundleId);
        const snap = await ref.get();
        if (!snap.exists) {
            alert('❌ الحزمة غير موجودة.');
            return;
        }

        const data = snap.data();
        const items = data.items || [];

        if (itemIndex < 0 || itemIndex >= items.length) {
            alert('❌ الفيديو غير موجود في الحزمة.');
            return;
        }

        const newItems = items.filter((_, i) => i !== itemIndex);

        await ref.update({ items: newItems });

        alert(`✅ تم حذف الفيديو "${videoTitle}" من الحزمة.`);
        loadCoursesTable();
        loadBundlesTable();

    } catch (err) {
        console.error('❌ خطأ في حذف الفيديو:', err);
        alert('❌ حدث خطأ: ' + (err.message || ''));
    }
}

async function loadBooksTable() {
    const books = await getBooks();
    const tbody = document.getElementById('booksTableBody');
    tbody.innerHTML = books.length ? books.map((b, idx) => `
        <tr>
            <td>${idx+1}</td>
            <td><strong>${esc(b.title)}</strong></td>
            <td>${esc(b.grade)}</td>
            <td>${b.link ? 'موجود' : 'لا يوجد'}</td>
            <td><button type="button" data-action="delete-book" data-book-id="${attr(b.id)}" class="btn-card btn-danger">🗑️</button></td>
        </tr>
    `).join('') : '<tr><td colspan="5">لا توجد كتب</td></tr>';
}

async function deleteBook(id) {
    const ok = await showConfirm('حذف هذا الكتاب؟', {
        title: 'حذف كتاب',
        icon: '📚',
        okText: 'حذف',
        cancelText: 'إلغاء',
        danger: true
    });
    if (!ok) return;

    try { await db.collection('books').doc(id).delete(); loadBooksTable(); populateBundleSelects(); }
    catch (err) { console.error(err); }
}

async function loadTeachersTable() {
    const teachers = await getTeachers();
    const tbody = document.getElementById('teachersTableBody');
    tbody.innerHTML = teachers.length ? teachers.map((t, idx) => `
        <tr>
            <td>${idx+1}</td>
            <td>${esc(t.name)}</td>
            <td>${t.image
                ? `<img src="${esc(safeUrl(t.image))}" style="width:50px;height:65px;border-radius:8px;object-fit:cover;border:2px solid #d4af37;background:#f8f6f2;">`
                : '<span style="color:#999;font-size:11px;">لا توجد</span>'}</td>
            <td><button type="button" data-action="delete-teacher" data-teacher-id="${attr(t.id)}" class="btn-card btn-danger">🗑️</button></td>
        </tr>
    `).join('') : '<tr><td colspan="4">لا يوجد مدرسين</td></tr>';
}

async function deleteTeacher(id) {
    const ok = await showConfirm('حذف هذا المدرس؟', {
        title: 'حذف مدرس',
        icon: '👨‍🏫',
        okText: 'حذف',
        cancelText: 'إلغاء',
        danger: true
    });
    if (!ok) return;

    try { await db.collection('teachers').doc(id).delete(); loadTeachersTable(); }
    catch (err) { console.error(err); }
}

async function loadExamsTable() {
    const exams = await getExams();
    const tbody = document.getElementById('examsTableBody');
    if (!exams.length) {
        tbody.innerHTML = '<tr><td colspan="6"><div class="alert alert-info">📭 لا توجد اختبارات.</div></td></tr>';
        return;
    }
    tbody.innerHTML = exams.map((exam, idx) => `
        <tr>
            <td>${idx+1}</td>
            <td><strong>${esc(exam.title)}</strong></td>
            <td>${esc(exam.grade)}</td>
            <td>${exam.questions ? exam.questions.length : 0}</td>
            <td>${exam.oneTimeOnly ? '<span style="background:#d4af37; color:#3b0a0a; padding:5px 12px; border-radius:50px; font-weight:700; font-size:11px;">🔒 مرة واحدة</span>' : '<span style="background:#2a7a2a; color:#fff; padding:5px 12px; border-radius:50px; font-weight:700; font-size:11px;">🔓 دائم</span>'}</td>
            <td><button type="button" data-action="delete-exam" data-exam-id="${attr(exam.id)}" data-exam-title="${attr(exam.title)}" class="btn-card btn-delete" title="حذف الاختبار وكل محاولات الطلاب">🗑️</button></td>
        </tr>
    `).join('');
}

async function deleteExamAndAttempts(examId, examTitle) {
    const ok = await showConfirm(
        `⚠️ هل أنت متأكد من حذف الاختبار "${examTitle}"؟\n\nسيتم حذف كل محاولات الطلاب المرتبطة به أيضاً.`,
        {
            title: 'حذف اختبار',
            icon: '📝',
            okText: 'حذف الكل',
            cancelText: 'إلغاء',
            danger: true
        }
    );
    if (!ok) return;

    try {
        const attemptsSnap = await db.collection('examAttempts').where('examId', '==', examId).get();

        let deletedCount = 0;
        if (!attemptsSnap.empty) {
            let batch = db.batch();
            let inBatch = 0;
            for (const doc of attemptsSnap.docs) {
                batch.delete(doc.ref);
                inBatch++;
                deletedCount++;
                if (inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
            }
            if (inBatch > 0) await batch.commit();
        }

        // ✅ حذف الـ _private subcollection الأول
        try {
            await db.collection('exams').doc(examId).collection('_private').doc('key').delete();
        } catch(e) { console.warn('_private cleanup:', e); }

        await db.collection('exams').doc(examId).delete();

        alert(`✅ تم حذف الاختبار و ${deletedCount} محاولة طالب مرتبطة به.`);
        loadExamsTable();
        populateBundleSelects();
    } catch (err) {
        console.error(err);
        alert('❌ حدث خطأ أثناء الحذف: ' + err.message);
    }
}

// ═══════════════════════════════════════════════════════════
//  🧭 التنقل
// ═══════════════════════════════════════════════════════════
function showTab(tabId, btnEl) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.admin-tabs button').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
    if (target) target.classList.add('active');
    if (btnEl) btnEl.classList.add('active');

    if (tabId === 'students') loadStudentsTable();
    if (tabId === 'bundles') loadBundlesTable();
    if (tabId === 'courses') loadCoursesTable();
    if (tabId === 'books') loadBooksTable();
    if (tabId === 'teachers') loadTeachersTable();
    if (tabId === 'exams') loadExamsTable();
    if (tabId === 'addBundle') populateBundleSelects();
}

// ═══════════════════════════════════════════════════════════
//  🎯 Event Delegation
// ═══════════════════════════════════════════════════════════
function handleActionClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;

    const action = el.dataset.action;

    switch (action) {
        case 'toggle-dark': e.preventDefault(); toggleDarkMode(); break;
        case 'open-home': e.preventDefault(); window.location.href = 'index.html'; break;
        case 'logout': e.preventDefault(); logout(); break;
        case 'show-tab': e.preventDefault(); showTab(el.dataset.tab, el); break;
        case 'clear-search':
            e.preventDefault();
            document.getElementById('studentSearchInput').value = '';
            loadStudentsTable();
            break;
        case 'show-student-details': e.preventDefault(); showStudentDetails(el.dataset.studentId); break;
        case 'toggle-student': e.preventDefault(); toggleStudent(el.dataset.studentId); break;
        case 'delete-student': e.preventDefault(); deleteStudent(el.dataset.studentId); break;
        case 'close-student-modal': e.preventDefault(); closeStudentModal(); break;

        case 'reveal-grade-change':
            e.preventDefault();
            revealGradeChange();
            break;
        case 'cancel-grade-change':
            e.preventDefault();
            cancelGradeChange();
            break;
        case 'change-student-grade':
            e.preventDefault();
            changeStudentGrade(el.dataset.studentId);
            break;

        case 'delete-bundle': e.preventDefault(); deleteBundle(el.dataset.bundleId); break;
        case 'delete-course': e.preventDefault(); deleteCourse(el.dataset.courseId); break;
        case 'delete-bundle-video':
            e.preventDefault();
            deleteBundleVideo(
                el.dataset.bundleId,
                parseInt(el.dataset.itemIndex, 10),
                el.dataset.videoTitle
            );
            break;
        case 'delete-book': e.preventDefault(); deleteBook(el.dataset.bookId); break;
        case 'delete-teacher': e.preventDefault(); deleteTeacher(el.dataset.teacherId); break;
        case 'delete-exam': e.preventDefault(); deleteExamAndAttempts(el.dataset.examId, el.dataset.examTitle); break;
        case 'generate-questions': e.preventDefault(); generateQuestionBoxes(); break;
        case 'save-exam': e.preventDefault(); saveFullExam(); break;
    }
}

// ═══════════════════════════════════════════════════════════
//  🎯 Static Listeners
// ═══════════════════════════════════════════════════════════
function attachStaticListeners() {
    const searchInput = document.getElementById('studentSearchInput');
    if (searchInput) {
        let timer;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => loadStudentsTable(), 250);
        });
    }

    const itemType = document.getElementById('itemType');
    if (itemType) itemType.addEventListener('change', toggleItemFields);

    const sourceType = document.getElementById('sourceType');
    if (sourceType) sourceType.addEventListener('change', toggleSourceFields);

    const teacherImageFile = document.getElementById('teacherImageFile');
    if (teacherImageFile) teacherImageFile.addEventListener('change', function() { previewTeacherImage(this); });

    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('q-type-select')) {
            changeQuestionType(e.target);
        }
    });

    const studentDetailsModal = document.getElementById('studentDetailsModal');
    if (studentDetailsModal) {
        studentDetailsModal.addEventListener('click', (e) => {
            if (e.target === studentDetailsModal) closeStudentModal();
        });
    }
}

// ═══════════════════════════════════════════════════════════
//  🚀 Init
// ═══════════════════════════════════════════════════════════
function initAdminPanel() {
    loadDarkModePreference();
    initGrades();
    loadStudentsTable();
    loadBundlesTable();
    loadCoursesTable();
    loadBooksTable();
    loadTeachersTable();
    loadExamsTable();
    populateBundleSelects();
    setupForms();
    toggleItemFields();
    attachStaticListeners();

    document.addEventListener('click', handleActionClick);
}
