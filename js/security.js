// ═══════════════════════════════════════════════════════════
//  🔒 دوال الأمان — XSS Protection Helpers
//  استخدم esc() لكل نص، attr() لكل قيمة، safeUrl() لكل URL
// ═══════════════════════════════════════════════════════════

function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"'`=\/]/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '`': '&#96;',
        '=': '&#61;',
        '/': '&#47;'
    })[m]);
}

function attr(s) {
    return esc(s);
}

function safeUrl(u) {
    if (!u) return '#';
    const s = String(u).trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (/^mailto:/i.test(s)) return s;
    if (/^tel:/i.test(s)) return s;
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml)/i.test(s)) return s;
    if (s.startsWith('/')) return s;
    return '#';
}

function getGradeDocId(grade) {
    if (!grade) return 'unknown';
    return 'g_' + encodeURIComponent(grade)
        .replace(/%/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .substring(0, 60);
}

function getBroadcastDocId(adminId, grade) {
    if (!adminId || !grade) return 'unknown';
    const safeAdminId = String(adminId).substring(0, 20).replace(/[^a-zA-Z0-9]/g, '');
    const safeGrade = encodeURIComponent(grade)
        .replace(/%/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .substring(0, 40);
    return 'b_' + safeAdminId + '_' + safeGrade;
}

function isValidEgyptPhone(phone) {
    if (!phone) return true;
    return /^01[0-9]{9}$/.test(String(phone).trim());
}

// ═══════════════════════════════════════════════════════════
//  Toast: يستبدل alert()
// ═══════════════════════════════════════════════════════════
function showToast(message, type) {
    const host = document.getElementById('toastHost');
    if (!host) return;
    const msg = String(message || '');
    if (!type) {
        if (/^\s*(✅|🎉)/.test(msg)) type = 'success';
        else if (/^\s*(❌|⛔)/.test(msg)) type = 'error';
        else type = 'warn';
    }
    const icons = { success: '#i-check', error: '#i-alert', warn: '#i-info' };
    const clean = msg.replace(/^\s*(✅|🎉|❌|⛔|⚠️|⏳|🔒|😔)\s*/, '');
    const el = document.createElement('div');
    el.className = 'toast ' + type;

    const ico = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ico.setAttribute('class', 'ico toast-ico');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', icons[type]);
    ico.appendChild(use);

    const text = document.createElement('div');
    text.className = 'toast-msg';
    text.textContent = clean;

    const x = document.createElement('button');
    x.className = 'toast-x';
    x.setAttribute('aria-label', 'إغلاق');
    x.textContent = '✕';

    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
    x.addEventListener('click', close);
    el.append(ico, text, x);
    host.appendChild(el);
    setTimeout(close, type === 'error' ? 6500 : 4500);
}

window.alert = function(m) { showToast(m); };

// ═══════════════════════════════════════════════════════════
//  ❓ showConfirm — بديل native confirm() بشكل جميل
//
//  الاستخدام البسيط:
//    const ok = await showConfirm('هل أنت متأكد؟');
//    if (!ok) return;
//
//  الاستخدام مع خيارات:
//    const ok = await showConfirm('نص الرسالة', {
//        title: 'عنوان',
//        icon: '🗑️',
//        okText: 'حذف',
//        cancelText: 'إلغاء',
//        danger: true   // يخلي زر التأكيد أحمر
//    });
// ═══════════════════════════════════════════════════════════
function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const msgEl = document.getElementById('confirmMessage');
        const titleEl = document.getElementById('confirmTitle');
        const iconEl = document.getElementById('confirmIcon');
        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');

        // Fallback لو الـ modal مش موجود في الصفحة
        if (!modal || !msgEl || !titleEl || !iconEl || !okBtn || !cancelBtn) {
            console.warn('⚠️ Confirm Modal not found — using native confirm()');
            resolve(window.confirm(message));
            return;
        }

        // تعيين النصوص (textContent للأمان من XSS)
        titleEl.textContent = options.title || 'تأكيد';
        iconEl.textContent = options.icon || '⚠️';
        okBtn.textContent = options.okText || 'تأكيد';
        cancelBtn.textContent = options.cancelText || 'إلغاء';
        msgEl.textContent = String(message || '');

        // تغيير شكل زر التأكيد لو danger
        if (options.danger) {
            okBtn.style.background = 'linear-gradient(135deg, #c00, #800)';
            okBtn.style.color = '#fff';
            okBtn.style.borderColor = 'transparent';
        } else {
            okBtn.style.background = '';
            okBtn.style.color = '';
            okBtn.style.borderColor = '';
        }

        // إظهار الـ modal
        modal.classList.add('active');
        modal.style.display = 'flex';

        // الحماية من تسريب الـ listeners
        const cleanup = () => {
            modal.classList.remove('active');
            modal.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onEsc);
        };

        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };
        const onBackdrop = (e) => { if (e.target === modal) onCancel(); };
        const onEsc = (e) => { if (e.key === 'Escape') onCancel(); };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onEsc);

        // تركيز زر التأكيد للوصول السريع بـ Enter
        setTimeout(() => okBtn.focus(), 100);
    });
}
