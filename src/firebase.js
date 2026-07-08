/**
 * Firebase Client SDK Config
 * Dùng chung project với firebase-rbac-test:
 * gen-lang-client-0478781203
 */
import { initializeApp } from 'firebase/app';
import { getAuth }      from 'firebase/auth';
import { getDatabase }  from 'firebase/database';

const firebaseConfig = {
    apiKey:            'AIzaSyCLvFT1grTuPy3lCFXCvRq9PsYJrMFYxO8',
    authDomain:        'gen-lang-client-0478781203.firebaseapp.com',
    databaseURL:       'https://gen-lang-client-0478781203-default-rtdb.firebaseio.com',
    projectId:         'gen-lang-client-0478781203',
    storageBucket:     'gen-lang-client-0478781203.firebasestorage.app',
    messagingSenderId: '731507099541',
    appId:             '1:731507099541:web:94f6d4b4d7a038e397d89c',
    measurementId:     'G-CRN5N2SBFC',
};

const app = initializeApp(firebaseConfig);

export const auth     = getAuth(app);
export const database = getDatabase(app);

export default app;
