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
    appCheck.activate('6LdFfxestAAAAAB3W4cnUYQbVMe1ribUigtWSq_0K', true);
    console.log('✅ App Check (reCAPTCHA v3) مُفعّل');
} catch (e) {
    console.warn('⚠️ فشل تفعيل App Check:', e);
}

const db = firebase.firestore();
const auth = firebase.auth();