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