// ============================================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyDwInweUhckLx83CyxfFm00_UFiPvgjn60",
  authDomain: "painel-gertec.firebaseapp.com",
  projectId: "painel-gertec",
  storageBucket: "painel-gertec.firebasestorage.app",
  messagingSenderId: "873194632039",
  appId: "1:873194632039:web:f409a82dd6d73b7ffe75c2"
};

// false = banco começa vazio
// true = insere dados de demonstração uma única vez
export const SEED_DEMO_DATA = false;

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    !firebaseConfig.apiKey.includes("COLE_") &&
    !firebaseConfig.projectId.includes("SEU_")
  );
}