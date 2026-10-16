'use strict';

// ═══════════════════════════════════════════════════════════
//  State
// ═══════════════════════════════════════════════════════════
let currentAdmin = null;
let currentBroadcastDocId = null;

let liveLocalStream = null;
let isLiveActive = false;
let adminCamEnabled = true;
let adminMicEnabled = true;
let peerConnections = {};
let studentStreams = {};
let studentsUnsubscribe = null;
let studentDocUnsubscribes = {};
let adminFacingMode = 'user';
let adminCurrentCamName = 'Front 1';
let adminCamerasCache = [];

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

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
    ['bundleGrade', 'bookGrade', 'examGrade', 'courseGrade', 'liveGrade'].forEach(id => {
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
    if (isLiveActive) await stopLiveStream();
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

    let perms = {};
    if (isLiveActive && currentBroadcastDocId) {
        try {
            const permsSnap = await db.collection('liveStreams').doc(currentBroadcastDocId).collection('students').get();
            permsSnap.forEach(d => { perms[d.id] = d.data(); });
        } catch(e) { console.warn(e); }
    }

    tbody.innerHTML = displayStudents.map((u, idx) => {
        const studentPerms = perms[u.id] || {};
        const camAllowed = studentPerms.cameraAllowed === true;
        const micAllowed = studentPerms.micAllowed === true;

        let liveBtns = '';
        if (isLiveActive) {
            liveBtns = `
                <button type="button" data-action="toggle-student-cam" data-student-id="${attr(u.id)}" data-allowed="${!camAllowed}" class="btn-card ${camAllowed ? 'btn-success' : 'btn-cam-off'}" style="margin-right:5px; font-size:11px; padding:6px 12px;" title="صلاحية الكاميرا">
                    ${camAllowed ? '📷 ✓' : '📷 ✗'}
                </button>
                <button type="button" data-action="toggle-student-mic" data-student-id="${attr(u.id)}" data-allowed="${!micAllowed}" class="btn-card ${micAllowed ? 'btn-success' : 'btn-mic-off'}" style="margin-right:5px; font-size:11px; padding:6px 12px;" title="صلاحية المايك">
                    ${micAllowed ? '🎤 ✓' : '🎤 ✗'}
                </button>
            `;
        }

        return `
        <tr>
            <td>${idx+1}</td>
            <td>${esc(u.name)}</td>
            <td>${esc(u.grade || 'غير محدد')}</td>
            <td style="color:${u.active ? 'green' : 'red'}">${u.active ? '✅ مفعل' : '⏳ معلق'}</td>
            <td style="white-space: nowrap;">
                ${liveBtns}
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

    const initial = esc((u.name || '؟').charAt(0));
    const isOutside = u.isOutside ? 'نعم 🌍 (صفارة)' : 'لا 🇪🇬';
    const stageText = u.stage === 'primary' ? 'ابتدائي أزهري' :
                      u.stage === 'preparatory' ? 'إعدادي أزهري' :
                      u.stage === 'secondary' ? 'ثانوي أزهري' : (u.stage || 'غير محدد');

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
        <div class="detail-row"><span>📚 الصف</span><strong>${esc(u.grade) || '—'}</strong></div>
        <div class="detail-row"><span>📊 الحالة</span><strong style="color:${u.active ? 'green' : 'red'}">${u.active ? '✅ مفعل' : '⏳ معلق'}</strong></div>
        <div class="detail-row"><span>📈 متوسط الدرجات</span><strong>${u.attempts ? (u.attempts.avg || 0) : 0}%</strong></div>
        <div class="detail-row" style="border-bottom:none;"><span>✅ اختبارات محلولة</span><strong>${u.attempts ? (u.attempts.solved || 0) : 0}</strong></div>
    `;
    document.getElementById('studentDetailsModal').style.display = 'flex';
}

function closeStudentModal() {
    document.getElementById('studentDetailsModal').style.display = 'none';
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
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا الطالب نهائياً؟')) return;
    try {
        await db.collection('users').doc(id).delete();
        alert('✅ تم حذف الطالب.');
        loadStudentsTable();
    } catch (err) { console.error(err); alert('❌ حدث خطأ.'); }
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
    if (!confirm('⚠️ هل أنت متأكد من حذف هذه الوحدة؟')) return;
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

    document.getElementById('liveStreamForm').addEventListener('submit', startLiveStream);
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

    const questionsPublic = [];
    const answersPrivate  = [];

    for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        const q = box.querySelector('.q-text-input').value.trim();
        const opts = Array.from(box.querySelectorAll('.opt-input')).map(x => x.value.trim());
        const correct = parseInt(box.querySelector('.correct-select').value) - 1;
        const qNoteEl = box.querySelector('.q-note-input');
        const qNote = qNoteEl ? qNoteEl.value.trim() : '';
        const qType = box.getAttribute('data-qtype') || 'mcq';

        if (!q || opts.includes('')) { alert('يرجى ملء السؤال رقم ' + (i + 1)); return; }

        const questionObj = { q, options: opts, type: qType };
        if (qNote) questionObj.note = qNote;

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
    const courses = await getCourses();
    const tbody = document.getElementById('coursesTableBody');
    tbody.innerHTML = courses.length ? courses.map((c, idx) => `
        <tr>
            <td>${idx+1}</td>
            <td><strong>${esc(c.title)}</strong></td>
            <td>${esc(c.grade)}</td>
            <td>${c.link ? 'موجود' : 'لا يوجد'}</td>
            <td><button type="button" data-action="delete-course" data-course-id="${attr(c.id)}" class="btn-card btn-danger">🗑️</button></td>
        </tr>
    `).join('') : '<tr><td colspan="5">لا توجد محاضرات</td></tr>';
}

async function deleteCourse(id) {
    if (!confirm('حذف هذه المحاضرة؟')) return;
    try { await db.collection('courses').doc(id).delete(); loadCoursesTable(); populateBundleSelects(); }
    catch (err) { console.error(err); }
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
    if (!confirm('حذف هذا الكتاب؟')) return;
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
    if (!confirm('حذف هذا المدرس؟')) return;
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
    if (!confirm(`⚠️ هل أنت متأكد من حذف الاختبار "${examTitle}"؟\n\nسيتم حذف كل محاولات الطلاب المرتبطة به أيضاً.`)) return;

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
    if (tabId === 'liveStream') {
        loadLiveStreamStatus();
        refreshMyStreamsCount();
    }
}

// ═══════════════════════════════════════════════════════════
//  🔴 البث المباشر
// ═══════════════════════════════════════════════════════════
async function getLiveStream() {
    const source = document.getElementById('liveSource').value;

    if (source === 'screen') {
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
            throw new Error('screen_not_supported');
        }
        return await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: 15 },
            audio: true
        });
    }

    return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: adminFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
    });
}

async function getAdminCamerasList() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter(d => d.kind === 'videoinput');
        if (cams.length === 0) return [];

        let frontCount = 0, backCount = 0, otherCount = 0;
        const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        const result = cams.map((cam, idx) => {
            const rawLabel = (cam.label || '').toLowerCase();
            let facing = 'unknown';
            let name = '';

            if (rawLabel.includes('front') || rawLabel.includes('user') || rawLabel.includes('facetime') || rawLabel.includes('face')) {
                frontCount++; facing = 'front'; name = 'Front ' + frontCount;
            } else if (rawLabel.includes('back') || rawLabel.includes('rear') || rawLabel.includes('environment') || rawLabel.includes('world')) {
                backCount++; facing = 'back'; name = 'Back ' + backCount;
            } else {
                if (isMobile) {
                    if (idx === 0 && frontCount === 0) { frontCount++; facing = 'front'; name = 'Front ' + frontCount; }
                    else { backCount++; facing = 'back'; name = 'Back ' + backCount; }
                } else {
                    otherCount++; facing = 'unknown'; name = 'Camera ' + otherCount;
                }
            }

            return { deviceId: cam.deviceId, rawLabel: cam.label || '', facing, name };
        });

        adminCamerasCache = result;
        return result;
    } catch(e) {
        console.error('enumerateDevices error:', e);
        return [];
    }
}

async function loadAdminCamerasList() { await getAdminCamerasList(); }

async function shouldShowSwitchCameraBtn() {
    const cams = await getAdminCamerasList();
    if (cams.length >= 2) return true;
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
    return false;
}

async function detectCurrentAdminCamName(track) {
    if (!track) return 'Front 1';
    const settings = track.getSettings();
    const currentId = settings.deviceId;

    if (!adminCamerasCache || adminCamerasCache.length === 0) await getAdminCamerasList();

    const found = adminCamerasCache.find(c => c.deviceId === currentId);
    if (found) return found.name;

    const facing = settings.facingMode || adminFacingMode;
    if (facing === 'environment') return 'Back 1';
    if (facing === 'user') return 'Front 1';
    return 'Camera 1';
}

async function switchAdminCamera() {
    if (!liveLocalStream) return;

    const oldVideoTrack = liveLocalStream.getVideoTracks()[0];
    if (!oldVideoTrack) return;

    const cams = await getAdminCamerasList();
    if (cams.length < 2) { alert('⚠️ لا توجد كاميرا أخرى للتبديل.'); return; }

    const currentId = oldVideoTrack.getSettings().deviceId;
    let currentIdx = cams.findIndex(c => c.deviceId === currentId);
    if (currentIdx === -1) currentIdx = 0;

    const nextIdx = (currentIdx + 1) % cams.length;
    const nextCam = cams[nextIdx];

    const switchBtn = document.getElementById('btnSwitchCam');
    if (switchBtn) switchBtn.innerHTML = '<span>⏳</span> <span>جاري التبديل...</span>';

    let newVideoTrack = null;

    try {
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: nextCam.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        newVideoTrack = newStream.getVideoTracks()[0];
    } catch(e) {
        console.warn('deviceId failed, trying facingMode:', e);
        try {
            const newFacing = adminFacingMode === 'user' ? 'environment' : 'user';
            const newStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: newFacing }, width: 1280, height: 720 },
                audio: false
            });
            newVideoTrack = newStream.getVideoTracks()[0];
            adminFacingMode = newFacing;
        } catch(e2) {
            console.error('All switch attempts failed:', e2);
            alert('⚠️ تعذّر تبديل الكاميرا.');
            if (switchBtn) switchBtn.innerHTML = '<span>🔄</span> <span>' + adminCurrentCamName + '</span>';
            return;
        }
    }

    if (!newVideoTrack) return;
    newVideoTrack.enabled = adminCamEnabled;

    for (const studentId of Object.keys(peerConnections)) {
        const pc = peerConnections[studentId];
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) { try { await sender.replaceTrack(newVideoTrack); } catch(e) { console.warn(e); } }
    }

    liveLocalStream.removeTrack(oldVideoTrack);
    oldVideoTrack.stop();
    liveLocalStream.addTrack(newVideoTrack);

    const preview = document.getElementById('localPreview');
    if (preview) preview.srcObject = liveLocalStream;

    adminCurrentCamName = await detectCurrentAdminCamName(newVideoTrack);

    if (switchBtn) {
        switchBtn.innerHTML = '<span>🔄</span> <span>✅ ' + adminCurrentCamName + '</span>';
        setTimeout(() => {
            switchBtn.innerHTML = '<span>🔄</span> <span>' + adminCurrentCamName + '</span>';
        }, 1200);
    }
}

async function startLiveStream(e) {
    e.preventDefault();
    const title = document.getElementById('liveTitle').value.trim();
    const grade = document.getElementById('liveGrade').value;
    const msg = document.getElementById('liveStreamMsg');
    const startBtn = document.getElementById('startLiveBtn');

    if (!title || !grade) {
        msg.innerHTML = '<div class="alert alert-warning">⚠️ املأ العنوان والصف.</div>';
        return;
    }

    startBtn.disabled = true;
    startBtn.textContent = 'جاري التحضير...';
    msg.innerHTML = '';

    const gradeDocId = getBroadcastDocId(currentAdmin.id, grade);

    try {
        const myActiveStreams = await db.collection('liveStreams')
            .where('adminId', '==', currentAdmin.id)
            .where('isLive', '==', true)
            .get();

        if (myActiveStreams.size >= 10) {
            msg.innerHTML = '<div class="alert alert-warning">⚠️ لديك 10 بثوث نشطة بالفعل. أوقف واحد منهم أولاً.</div>';
            startBtn.disabled = false;
            startBtn.textContent = '🔴 بدء البث';
            return;
        }
    } catch(e) { console.warn('Rate limit check:', e); }

    try {
        liveLocalStream = await getLiveStream();

        if (document.getElementById('liveSource').value === 'camera') {
            try {
                const settings = liveLocalStream.getVideoTracks()[0]?.getSettings();
                if (settings && settings.facingMode) adminFacingMode = settings.facingMode;
            } catch(e) {}
        }

        adminCamEnabled = liveLocalStream.getVideoTracks().length > 0;
        adminMicEnabled = liveLocalStream.getAudioTracks().length > 0;

        document.getElementById('localPreview').srcObject = liveLocalStream;
        document.getElementById('localPreviewContainer').style.display = 'block';

        currentBroadcastDocId = gradeDocId;

        try {
            const oldSnap = await db.collection('liveStreams').doc(gradeDocId).collection('students').get();
            const batch = db.batch();
            oldSnap.forEach(d => batch.delete(d.ref));
            await batch.commit();
        } catch(e) { console.warn('Cleanup error:', e); }

        await db.collection('liveStreams').doc(gradeDocId).set({
            isLive: true,
            title, grade,
            startedAt: firebase.firestore.FieldValue.serverTimestamp(),
            adminId: currentAdmin.id,
            adminName: currentAdmin.name,
            settings: { allowAllCameras: false, allowAllMics: false }
        });

        isLiveActive = true;
        msg.innerHTML = '<div class="alert alert-success">✅ البث بدأ! في انتظار الطلاب...</div>';
        startBtn.style.display = 'none';
        document.getElementById('stopLiveBtn').style.display = 'inline-block';
        document.getElementById('liveToolbar').style.display = 'flex';
        document.getElementById('permissionPanel').style.display = 'block';
        document.getElementById('studentStreamsContainer').style.display = 'block';

        updateAdminCamBtn();
        updateAdminMicBtn();

        const sourceNow = document.getElementById('liveSource').value;
        if (sourceNow === 'camera') {
            const showSwitch = await shouldShowSwitchCameraBtn();
            const switchBtn = document.getElementById('btnSwitchCam');
            if (switchBtn) {
                const videoTrack = liveLocalStream.getVideoTracks()[0];
                adminCurrentCamName = await detectCurrentAdminCamName(videoTrack);
                switchBtn.style.display = showSwitch ? 'inline-flex' : 'none';
                switchBtn.innerHTML = '<span>🔄</span> <span>' + adminCurrentCamName + '</span>';
            }
        } else {
            const switchBtn = document.getElementById('btnSwitchCam');
            if (switchBtn) switchBtn.style.display = 'none';
        }

        document.getElementById('liveStreamStatusBox').innerHTML = `
            <div style="background:#d4edda; color:#155724; border:2px solid #2a7a2a; padding:15px; border-radius:16px; display:flex; align-items:center; gap:10px;">
                <span class="live-badge"><span class="live-dot"></span> LIVE</span>
                <span><strong>${esc(title)}</strong> — ${esc(grade)}</span>
            </div>
        `;

        studentsUnsubscribe = db.collection('liveStreams').doc(gradeDocId).collection('students')
            .onSnapshot(snap => {
                snap.docChanges().forEach(change => {
                    if (change.type === 'added') createPeerForStudent(change.doc.id, change.doc.data());
                });
            });

        liveLocalStream.getVideoTracks()[0]?.addEventListener('ended', () => stopLiveStream());

        refreshMyStreamsCount();
    } catch (err) {
        console.error(err);
        let errorMsg = '❌ تعذّر الوصول للكاميرا/الشاشة.';
        if (err.message === 'screen_not_supported') errorMsg = '⚠️ مشاركة الشاشة غير مدعومة على هذا الجهاز/المتصفح. اختر "📷 كاميرا" بدلاً منها.';
        else if (err.name === 'NotAllowedError') errorMsg = '⚠️ تم رفض الصلاحية. يرجى السماح بالوصول للكاميرا/الميكروفون.';
        else if (err.name === 'NotFoundError') errorMsg = '⚠️ لم يتم العثور على كاميرا أو ميكروفون.';
        else if (err.name === 'NotReadableError') errorMsg = '⚠️ الكاميرا مستخدمة من تطبيق آخر. أغلق التطبيقات الأخرى وحاول مرة أخرى.';

        msg.innerHTML = '<div class="alert alert-warning">' + errorMsg + '</div>';
        startBtn.disabled = false;
        startBtn.textContent = '🔴 بدء البث';
    }
}

async function createPeerForStudent(studentId, studentData) {
    if (peerConnections[studentId]) return;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnections[studentId] = pc;

    liveLocalStream.getTracks().forEach(track => pc.addTrack(track, liveLocalStream));

    pc.ontrack = (event) => addStudentStream(studentId, event.streams[0]);

    pc.onicecandidate = async (event) => {
        if (event.candidate) {
            try {
                await db.collection('liveStreams').doc(currentBroadcastDocId)
                    .collection('students').doc(studentId)
                    .set({ adminCandidates: firebase.firestore.FieldValue.arrayUnion(event.candidate.toJSON()) }, { merge: true });
            } catch(e) { console.warn('ICE send error:', e); }
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
            setTimeout(() => { if (pc.connectionState === 'failed') cleanupPeer(studentId); }, 5000);
        }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await db.collection('liveStreams').doc(currentBroadcastDocId)
        .collection('students').doc(studentId)
        .set({
            offer: { type: offer.type, sdp: offer.sdp },
            adminId: currentAdmin.id,
            adminCandidates: []
        }, { merge: true });

    const unsub = db.collection('liveStreams').doc(currentBroadcastDocId)
        .collection('students').doc(studentId)
        .onSnapshot(async (snap) => {
            if (!snap.exists) return;
            const data = snap.data();

            if (data.answer && !pc.currentRemoteDescription) {
                try { await pc.setRemoteDescription(new RTCSessionDescription(data.answer)); } catch(e) { console.warn('setRemote error:', e); }
            }

            if (data.studentCandidates && pc.remoteDescription) {
                for (const c of data.studentCandidates) {
                    try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch(e) {}
                }
            }
        });

    studentDocUnsubscribes[studentId] = unsub;
    updateViewerCount();
}

function cleanupPeer(studentId) {
    if (peerConnections[studentId]) { try { peerConnections[studentId].close(); } catch(e) {} delete peerConnections[studentId]; }
    if (studentDocUnsubscribes[studentId]) { try { studentDocUnsubscribes[studentId](); } catch(e) {} delete studentDocUnsubscribes[studentId]; }
    removeStudentStream(studentId);
    updateViewerCount();
}

function updateViewerCount() {
    const el = document.getElementById('viewerCount');
    if (el) el.textContent = Object.keys(peerConnections).length;
}

function toggleAdminCamera() {
    if (!liveLocalStream) return;
    const videoTrack = liveLocalStream.getVideoTracks()[0];
    if (!videoTrack) return;
    adminCamEnabled = !adminCamEnabled;
    videoTrack.enabled = adminCamEnabled;
    updateAdminCamBtn();
}

function toggleAdminMic() {
    if (!liveLocalStream) return;
    const audioTrack = liveLocalStream.getAudioTracks()[0];
    if (!audioTrack) return;
    adminMicEnabled = !adminMicEnabled;
    audioTrack.enabled = adminMicEnabled;
    updateAdminMicBtn();
}

function updateAdminCamBtn() {
    const btn = document.getElementById('btnAdminCam');
    if (!btn) return;
    if (adminCamEnabled) { btn.className = 'neutral'; btn.innerHTML = '<span>📷</span> <span>إيقاف الكاميرا</span>'; }
    else { btn.className = 'inactive'; btn.innerHTML = '<span>📷</span> <span>تشغيل الكاميرا</span>'; }
}

function updateAdminMicBtn() {
    const btn = document.getElementById('btnAdminMic');
    if (!btn) return;
    if (adminMicEnabled) { btn.className = 'neutral'; btn.innerHTML = '<span>🎤</span> <span>إيقاف المايك</span>'; }
    else { btn.className = 'inactive'; btn.innerHTML = '<span>🎤</span> <span>تشغيل المايك</span>'; }
}

async function stopLiveStream() {
    const msg = document.getElementById('liveStreamMsg');

    Object.keys(peerConnections).forEach(id => cleanupPeer(id));

    if (studentsUnsubscribe) { try { studentsUnsubscribe(); } catch(e) {} studentsUnsubscribe = null; }

    if (liveLocalStream) { liveLocalStream.getTracks().forEach(t => t.stop()); liveLocalStream = null; }

    const docId = currentBroadcastDocId || 'current';

    try {
        const studentsSnap = await db.collection('liveStreams').doc(docId).collection('students').get();
        const batch = db.batch();
        studentsSnap.forEach(d => batch.delete(d.ref));
        await batch.commit();
    } catch(e) { console.warn(e); }

    try {
        await db.collection('liveStreams').doc(docId).update({
            isLive: false,
            stoppedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch(e) { console.error(e); }

    currentBroadcastDocId = null;
    isLiveActive = false;

    document.getElementById('localPreviewContainer').style.display = 'none';
    document.getElementById('liveToolbar').style.display = 'none';
    document.getElementById('permissionPanel').style.display = 'none';
    document.getElementById('studentStreamsContainer').style.display = 'none';
    document.getElementById('startLiveBtn').style.display = 'inline-block';
    document.getElementById('startLiveBtn').disabled = false;
    document.getElementById('startLiveBtn').textContent = '🔴 بدء البث';
    document.getElementById('stopLiveBtn').style.display = 'none';
    document.getElementById('liveStreamStatusBox').innerHTML = '<div style="text-align:center; padding:15px; color:#888;">⏸️ لا يوجد بث نشط</div>';
    if (msg) msg.innerHTML = '<div class="alert alert-warning">⏹️ تم إيقاف البث.</div>';

    const switchBtn = document.getElementById('btnSwitchCam');
    if (switchBtn) { switchBtn.style.display = 'none'; switchBtn.innerHTML = '<span>🔄</span> <span>Front 1</span>'; }

    adminFacingMode = 'user';
    adminCurrentCamName = 'Front 1';
    adminCamerasCache = [];

    loadStudentsTable();
    loadLiveStreamStatus();
    refreshMyStreamsCount();
}

function addStudentStream(studentId, stream) {
    const grid = document.getElementById('studentStreamsGrid');
    let card = document.getElementById('student-stream-' + studentId);

    if (!card) {
        card = document.createElement('div');
        card.id = 'student-stream-' + studentId;
        card.className = 'student-stream-card';
        card.innerHTML = '<video autoplay playsinline muted></video><div class="student-name">👤 طالب</div>';
        grid.appendChild(card);
    }

    const video = card.querySelector('video');
    video.srcObject = stream;
    video.play().catch(e => console.warn(e));

    studentStreams[studentId] = { videoEl: video };

    findStudentNameById(studentId).then(name => {
        if (name) card.querySelector('.student-name').textContent = '👤 ' + name;
    });
}

async function findStudentNameById(uid) {
    try {
        const snap = await db.collection('users').doc(uid).get();
        if (snap.exists) return snap.data().name;
    } catch(e) {}
    return null;
}

function removeStudentStream(studentId) {
    const card = document.getElementById('student-stream-' + studentId);
    if (card) card.remove();
    delete studentStreams[studentId];
}

async function saveGlobalPermissions() {
    if (!isLiveActive || !currentBroadcastDocId) return;
    const allowAllCameras = document.getElementById('permAllCameras').checked;
    const allowAllMics = document.getElementById('permAllMics').checked;
    try {
        await db.collection('liveStreams').doc(currentBroadcastDocId).update({
            'settings.allowAllCameras': allowAllCameras,
            'settings.allowAllMics': allowAllMics
        });
    } catch(err) { console.error(err); }
}

async function toggleStudentCamera(studentId, allowed) {
    if (!isLiveActive || !currentBroadcastDocId) return;
    try {
        await db.collection('liveStreams').doc(currentBroadcastDocId).collection('students').doc(studentId).set({ cameraAllowed: allowed }, { merge: true });
        loadStudentsTable();
    } catch(err) { console.error(err); }
}

async function toggleStudentMic(studentId, allowed) {
    if (!isLiveActive || !currentBroadcastDocId) return;
    try {
        await db.collection('liveStreams').doc(currentBroadcastDocId).collection('students').doc(studentId).set({ micAllowed: allowed }, { merge: true });
        loadStudentsTable();
    } catch(err) { console.error(err); }
}

async function loadLiveStreamStatus() {
    try {
        const snap = await db.collection('liveStreams').where('isLive', '==', true).get();
        const box = document.getElementById('liveStreamStatusBox');
        if (!box) return;

        const activeStreams = snap.docs;

        if (activeStreams.length === 0) {
            box.innerHTML = '<div style="text-align:center; padding:15px; color:#888;">⏸️ لا يوجد بث نشط حالياً</div>';
            return;
        }

        box.innerHTML = activeStreams.map(d => {
            const data = d.data();
            const isMine = data.adminId === (currentAdmin ? currentAdmin.id : '');
            return `
                <div style="background:${isMine ? '#d4edda' : '#fff3cd'}; color:${isMine ? '#155724' : '#856404'}; border:2px solid ${isMine ? '#2a7a2a' : '#d4af37'}; padding:15px; border-radius:16px; margin-bottom:10px;">
                    <strong>🔴 بث نشط:</strong> ${esc(data.title || 'بدون عنوان')} — ${esc(data.grade || '')}
                    <br><small>👤 ${esc(data.adminName || 'أدمن')} ${isMine ? '(أنت)' : ''}</small>
                </div>
            `;
        }).join('');
    } catch(e) { console.error(e); }
}

async function refreshMyStreamsCount() {
    if (!currentAdmin) return;
    try {
        const snap = await db.collection('liveStreams').where('adminId', '==', currentAdmin.id).where('isLive', '==', true).get();
        const mine = snap.docs;
        const badge = document.getElementById('myStreamsCount');
        if (badge) {
            badge.textContent = mine.length;
            badge.style.background = mine.length > 0 ? '#ffd966' : '#fff';
            badge.style.color = '#144266';
        }
    } catch(e) { console.warn('refreshMyStreamsCount:', e); }
}

async function showMyStreamsModal() {
    if (!currentAdmin) return;
    const modal = document.getElementById('myStreamsModal');
    const content = document.getElementById('myStreamsContent');
    if (!modal || !content) return;

    modal.style.display = 'flex';
    content.innerHTML = '<div style="text-align:center; padding:30px; color:#888;">⏳ جاري التحميل...</div>';

    try {
        const snap = await db.collection('liveStreams').where('adminId', '==', currentAdmin.id).where('isLive', '==', true).get();
        const mine = snap.docs;

        if (mine.length === 0) {
            content.innerHTML = `
                <div style="text-align:center; padding:30px 20px; color:#888;">
                    <div style="font-size:50px; margin-bottom:12px; opacity:0.5;">📭</div>
                    <h3 style="color:#666; margin-bottom:8px;">لا يوجد لديك بثوث نشطة</h3>
                    <p style="font-size:12px;">لما تبدأ بث جديد هيظهر هنا تلقائياً.</p>
                </div>
            `;
            return;
        }

        content.innerHTML = mine.map(doc => {
            const data = doc.data();
            const isCurrentSession = (doc.id === currentBroadcastDocId);
            const startedAt = data.startedAt && data.startedAt.toDate ? data.startedAt.toDate() : null;
            const startedText = startedAt ? startedAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—';

            return `
                <div style="background:${isCurrentSession ? '#e6f7e6' : '#f8f9fa'}; border:2px solid ${isCurrentSession ? '#2a7a2a' : '#dee2e6'}; padding:16px; border-radius:16px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; align-items:start; gap:12px; flex-wrap:wrap;">
                        <div style="flex:1; min-width:200px;">
                            <div style="font-weight:900; color:#3b0a0a; font-size:15px; margin-bottom:6px;">📝 ${esc(data.title || 'بدون عنوان')}</div>
                            <div style="font-size:12px; color:#555; margin-bottom:4px;">🎓 ${esc(data.grade || '—')}</div>
                            <div style="font-size:11px; color:#888;">
                                ⏰ بدأ: ${startedText}
                                ${isCurrentSession ? ' • <strong style="color:#2a7a2a;">🔴 الجلسة الحالية</strong>' : ' • <em style="color:#a00;">من جلسة أخرى</em>'}
                            </div>
                        </div>
                        <button type="button" data-action="stop-my-stream" data-doc-id="${attr(doc.id)}" data-current-session="${isCurrentSession}" style="background:linear-gradient(135deg, #c00 0%, #800 100%); color:#fff; border:none; padding:10px 20px; border-radius:50px; font-weight:800; font-size:12px; cursor:pointer; box-shadow:0 4px 12px rgba(170,0,0,0.3); white-space:nowrap; font-family:'Cairo', sans-serif;">
                            ⏹️ إيقاف البث
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch(e) {
        console.error(e);
        content.innerHTML = '<div style="text-align:center; padding:30px; color:#a00;">❌ حدث خطأ أثناء التحميل: ' + esc(e.message) + '</div>';
    }
}

function closeMyStreamsModal() {
    const modal = document.getElementById('myStreamsModal');
    if (modal) modal.style.display = 'none';
}

async function stopMyStreamFromList(docId, isCurrentSession) {
    if (!currentAdmin) return;

    const confirmMsg = isCurrentSession
        ? `⚠️ هل أنت متأكد من إيقاف بثك الحالي؟\n\nسيتم فصل كل الطلاب المتصلين.`
        : `⚠️ ده بث من جلسة تانية (أو متبقي في السيرفر).\n\nهل تريد إيقافه؟`;

    if (!confirm(confirmMsg)) return;

    try {
        const docRef = db.collection('liveStreams').doc(docId);

        const stSnap = await docRef.collection('students').get();
        if (!stSnap.empty) {
            const batch = db.batch();
            stSnap.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }

        await docRef.update({
            isLive: false,
            stoppedAt: firebase.firestore.FieldValue.serverTimestamp(),
            stoppedBy: currentAdmin.name + ' (من قائمة بثوثي)'
        });

        if (isCurrentSession) {
            Object.keys(peerConnections).forEach(id => { try { cleanupPeer(id); } catch(e) {} });

            if (studentsUnsubscribe) { try { studentsUnsubscribe(); } catch(e) {} studentsUnsubscribe = null; }

            if (liveLocalStream) { liveLocalStream.getTracks().forEach(t => t.stop()); liveLocalStream = null; }

            currentBroadcastDocId = null;
            isLiveActive = false;

            document.getElementById('localPreviewContainer').style.display = 'none';
            document.getElementById('liveToolbar').style.display = 'none';
            document.getElementById('permissionPanel').style.display = 'none';
            document.getElementById('studentStreamsContainer').style.display = 'none';

            const startBtn = document.getElementById('startLiveBtn');
            if (startBtn) { startBtn.style.display = 'inline-block'; startBtn.disabled = false; startBtn.textContent = '🔴 بدء البث'; }
            document.getElementById('stopLiveBtn').style.display = 'none';

            const switchBtn = document.getElementById('btnSwitchCam');
            if (switchBtn) { switchBtn.style.display = 'none'; switchBtn.innerHTML = '<span>🔄</span> <span>Front 1</span>'; }

            adminFacingMode = 'user';
            adminCurrentCamName = 'Front 1';
            adminCamerasCache = [];
        }

        alert('✅ تم إيقاف البث بنجاح.');

        refreshMyStreamsCount();
        showMyStreamsModal();
        loadLiveStreamStatus();
        loadStudentsTable();
    } catch(e) {
        console.error(e);
        alert('❌ حدث خطأ: ' + e.message);
    }
}

async function checkMyExistingStream() {
    if (!currentAdmin) return;
    try {
        const snap = await db.collection('liveStreams').where('adminId', '==', currentAdmin.id).where('isLive', '==', true).get();
        const myStreams = snap.docs;

        if (myStreams.length === 0) return;

        const count = myStreams.length;
        const choice = confirm(
            `⚠️ لديك ${count} بث نشط من جلسة سابقة:\n\n` +
            `هل تريد إيقافها كلها الآن؟\n` +
            `(اضغط Cancel لو عايز تسيبها — بس الكاميرا مش هتشتغل تلقائياً)`
        );

        if (choice) {
            for (const stream of myStreams) {
                const stSnap = await stream.ref.collection('students').get();
                if (!stSnap.empty) {
                    const batch = db.batch();
                    stSnap.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }
                await stream.ref.update({ isLive: false, stoppedAt: firebase.firestore.FieldValue.serverTimestamp() });
            }
            alert('✅ تم إيقاف كل البثوث القديمة.');
            loadLiveStreamStatus();
            refreshMyStreamsCount();
        }
    } catch(e) { console.warn('checkMyExistingStream:', e); }
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
        case 'toggle-student-cam':
            e.preventDefault();
            toggleStudentCamera(el.dataset.studentId, el.dataset.allowed === 'true');
            break;
        case 'toggle-student-mic':
            e.preventDefault();
            toggleStudentMic(el.dataset.studentId, el.dataset.allowed === 'true');
            break;
        case 'close-student-modal': e.preventDefault(); closeStudentModal(); break;
        case 'delete-bundle': e.preventDefault(); deleteBundle(el.dataset.bundleId); break;
        case 'delete-course': e.preventDefault(); deleteCourse(el.dataset.courseId); break;
        case 'delete-book': e.preventDefault(); deleteBook(el.dataset.bookId); break;
        case 'delete-teacher': e.preventDefault(); deleteTeacher(el.dataset.teacherId); break;
        case 'delete-exam': e.preventDefault(); deleteExamAndAttempts(el.dataset.examId, el.dataset.examTitle); break;
        case 'generate-questions': e.preventDefault(); generateQuestionBoxes(); break;
        case 'save-exam': e.preventDefault(); saveFullExam(); break;
        case 'toggle-admin-cam': e.preventDefault(); toggleAdminCamera(); break;
        case 'toggle-admin-mic': e.preventDefault(); toggleAdminMic(); break;
        case 'switch-admin-cam': e.preventDefault(); switchAdminCamera(); break;
        case 'stop-live-stream': e.preventDefault(); stopLiveStream(); break;
        case 'show-my-streams-modal': e.preventDefault(); showMyStreamsModal(); break;
        case 'close-my-streams-modal': e.preventDefault(); closeMyStreamsModal(); break;
        case 'stop-my-stream':
            e.preventDefault();
            stopMyStreamFromList(el.dataset.docId, el.dataset.currentSession === 'true');
            break;
    }
}

// ═══════════════════════════════════════════════════════════
//  🎯 Static Listeners
// ═══════════════════════════════════════════════════════════
function attachStaticListeners() {
    // Search input
    const searchInput = document.getElementById('studentSearchInput');
    if (searchInput) {
        let timer;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => loadStudentsTable(), 250);
        });
    }

    // Item type / source type
    const itemType = document.getElementById('itemType');
    if (itemType) itemType.addEventListener('change', toggleItemFields);

    const sourceType = document.getElementById('sourceType');
    if (sourceType) sourceType.addEventListener('change', toggleSourceFields);

    // Teacher image preview
    const teacherImageFile = document.getElementById('teacherImageFile');
    if (teacherImageFile) teacherImageFile.addEventListener('change', function() { previewTeacherImage(this); });

    // Permission toggles
    const permAllCameras = document.getElementById('permAllCameras');
    if (permAllCameras) permAllCameras.addEventListener('change', saveGlobalPermissions);

    const permAllMics = document.getElementById('permAllMics');
    if (permAllMics) permAllMics.addEventListener('change', saveGlobalPermissions);

    // Question type change delegation
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('q-type-select')) {
            changeQuestionType(e.target);
        }
    });

    // Modal click outside
    const studentDetailsModal = document.getElementById('studentDetailsModal');
    if (studentDetailsModal) {
        studentDetailsModal.addEventListener('click', (e) => {
            if (e.target === studentDetailsModal) closeStudentModal();
        });
    }
    const myStreamsModal = document.getElementById('myStreamsModal');
    if (myStreamsModal) {
        myStreamsModal.addEventListener('click', (e) => {
            if (e.target === myStreamsModal) closeMyStreamsModal();
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
    loadLiveStreamStatus();
    attachStaticListeners();

    const sourceSelect = document.getElementById('liveSource');
    if (sourceSelect) {
        const screenOpt = sourceSelect.querySelector('option[value="screen"]');
        const supportsDisplay = navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';
        if (screenOpt && !supportsDisplay) {
            screenOpt.disabled = true;
            screenOpt.textContent = '🖥️ مشاركة الشاشة (غير مدعومة على هذا الجهاز)';
        }
    }

    loadAdminCamerasList();
    setTimeout(() => checkMyExistingStream(), 500);

    refreshMyStreamsCount();
    setInterval(refreshMyStreamsCount, 5000);

    // Central event delegation
    document.addEventListener('click', handleActionClick);
}