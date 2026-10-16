// ═══════════════════════════════════════════════════════════
//  ⚙️ الإعدادات + Firebase Init + App Check
// ═══════════════════════════════════════════════════════════

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwVlc4SxawsFDIojc8lc3ybK3XBrf57M6PT-JytVnEJGdSw2vSLyDmdOd3Hy1dPt9Wj/exec';

const firebaseConfig = {
    apiKey: "AIzaSyD0dYnN3dkORPsmJxzsHNHViMbVBL-93_o",
    authDomain: "test1-d8ecb.firebaseapp.com",
    projectId: "test1-d8ecb",
    storageBucket: "test1-d8ecb.firebasestorage.app",
    messagingSenderId: "1059423288453",
    appId: "1:1059423288453:web:b6f1d02b1b530c5bfb3dec"
};

firebase.initializeApp(firebaseConfig);

try {
    const appCheck = firebase.appCheck();
    const SITE_KEY = '6LdFfxestAAAAAB3W4cnUYQbVMe1ribUigtWSq_0K';
    let activated = false;

    // ✅ الشكل الجديد الموصى به (v9+)
    if (firebase.appCheck && firebase.appCheck.ReCaptchaV3Provider) {
        try {
            const provider = new firebase.appCheck.ReCaptchaV3Provider(SITE_KEY);
            appCheck.activate(provider, true);
            activated = true;
            console.log('✅ App Check (reCAPTCHA v3 Provider) مُفعّل');
        } catch (providerErr) {
            console.warn('⚠️ فشل الشكل الجديد، سنجرب الشكل القديم:', providerErr);
        }
    }

    // 🔄 Fallback للشكل القديم (في حال SDK قديم)
    if (!activated) {
        appCheck.activate(SITE_KEY, true);
        console.log('✅ App Check (Legacy API) مُفعّل');
    }
} catch (e) {
    console.warn('⚠️ فشل تفعيل App Check بالكامل:', e);
}

const db = firebase.firestore();
const auth = firebase.auth();
