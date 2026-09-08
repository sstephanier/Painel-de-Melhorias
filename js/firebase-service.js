import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc,
  onSnapshot, writeBatch, serverTimestamp, query, where
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

let app = null;
let db = null;
let auth = null;

if (isFirebaseConfigured()) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  auth.useDeviceLanguage();
}

export function firebaseAvailable(){ return Boolean(app && db && auth); }
export function currentUser(){ return auth?.currentUser || null; }

export function observeAuth(callback){
  if(!auth){ callback(null); return ()=>{}; }
  return onAuthStateChanged(auth, callback);
}

export async function loginGoogle(){
  if(!auth) throw new Error("Firebase ainda não foi configurado.");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt:"select_account" });
  return signInWithPopup(auth, provider);
}

export async function logoutGoogle(){
  if(auth) await signOut(auth);
}

function requireDb(){
  if(!db) throw new Error("Firebase/Firestore não configurado.");
  if(!auth?.currentUser) throw new Error("Faça login com Google para acessar o banco.");
  return db;
}

function normalizeAreas(profile){
  return Array.isArray(profile?.areas) ? profile.areas.filter(Boolean) : [];
}

function scopedCollectionQuery(database, collectionName, profile){
  const ref = collection(database, collectionName);
  const areas = normalizeAreas(profile);
  if(profile?.role === "admin" || areas.includes("*")) return ref;
  if(!areas.length) return query(ref, where("frente", "==", "__SEM_ACESSO__"));
  if(areas.length === 1) return query(ref, where("frente", "==", areas[0]));
  return query(ref, where("frente", "in", areas.slice(0, 30)));
}

/* ============================================================
   PERFIL E PERMISSÕES
   usuarios/{uid}
   role: viewer | editor | admin
   areas: ["*"] ou ["Engenharia", "Manufatura", ...]
============================================================ */
export async function ensureUserProfile(){
  const database = requireDb();
  const user = auth.currentUser;
  const ref = doc(database, "usuarios", user.uid);
  const snap = await getDoc(ref);
  if(snap.exists()) return { id:snap.id, ...snap.data() };

  // Primeiro acesso: somente leitura e acesso geral.
  // Depois o administrador pode restringir as áreas ou promover para editor/admin.
  await setDoc(ref, {
    email: (user.email || "").toLowerCase(),
    nome: user.displayName || "",
    foto: user.photoURL || "",
    role: "viewer",
    areas: ["*"],
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  });
  const created = await getDoc(ref);
  return { id:created.id, ...created.data() };
}

export function subscribeUserProfile(uid, onData, onError){
  const database = requireDb();
  return onSnapshot(doc(database, "usuarios", uid), snap => {
    onData(snap.exists() ? { id:snap.id, ...snap.data() } : null);
  }, onError);
}

export function subscribeUsuarios(onData, onError){
  const database = requireDb();
  return onSnapshot(collection(database, "usuarios"), snap => {
    const rows = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    rows.sort((a,b)=>(a.email||"").localeCompare(b.email||"", "pt-BR"));
    onData(rows);
  }, onError);
}

export async function updateUserAccess(uid, { role, areas, active }){
  const database = requireDb();
  await setDoc(doc(database, "usuarios", uid), {
    role,
    areas: Array.isArray(areas) && areas.length ? areas : [],
    active: Boolean(active),
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.email || auth.currentUser.uid
  }, { merge:true });
}

export async function touchCurrentUserLogin(){
  const database = requireDb();
  const user = auth.currentUser;
  if(!user) return;
  await setDoc(doc(database, "usuarios", user.uid), {
    email:(user.email||"").toLowerCase(),
    nome:user.displayName||"",
    foto:user.photoURL||"",
    lastLoginAt:serverTimestamp()
  }, { merge:true });
}

/* ============================================================
   DADOS DO PAINEL
============================================================ */
export function subscribeProcessos(profile, onData, onError){
  const database = requireDb();
  const source = scopedCollectionQuery(database, "processos", profile);
  return onSnapshot(source, snap => {
    onData(snap.docs.map(d => ({ id:d.id, ...d.data() })));
  }, onError);
}

export function subscribeAcompanhamentos(profile, onData, onError){
  const database = requireDb();
  const source = scopedCollectionQuery(database, "acompanhamentos", profile);
  return onSnapshot(source, snap => {
    onData(snap.docs.map(d => ({ id:d.id, ...d.data() })));
  }, onError);
}

export function subscribeParametros(onData, onError){
  const database = requireDb();
  return onSnapshot(doc(database, "meta", "parametros"), snap => {
    onData(snap.exists() ? snap.data() : {});
  }, onError);
}

export async function saveParametros(body){
  const database = requireDb();
  await setDoc(doc(database, "meta", "parametros"), {
    ...body,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.email || auth.currentUser.uid
  }, { merge:true });
}

export async function addProcesso(body){
  const database = requireDb();
  return addDoc(collection(database, "processos"), {
    ...body,
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser.email || auth.currentUser.uid,
    updatedAt: serverTimestamp()
  });
}

export async function setProcesso(id, body){
  const database = requireDb();
  return setDoc(doc(database, "processos", id), {
    ...body,
    updatedAt: serverTimestamp(),
    updatedBy: auth.currentUser.email || auth.currentUser.uid
  }, { merge:true });
}

export async function removeProcesso(id){
  const database = requireDb();
  const q = query(collection(database, "acompanhamentos"), where("processoId", "==", id));
  const snap = await getDocs(q);
  const batch = writeBatch(database);
  snap.docs.forEach(d => batch.delete(d.ref));
  batch.delete(doc(database, "processos", id));
  return batch.commit();
}

export async function addAcompanhamento(body){
  const database = requireDb();
  return addDoc(collection(database, "acompanhamentos"), {
    ...body,
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser.email || auth.currentUser.uid
  });
}

export async function ensureDemoSeed(processos, acompanhamentos){
  const database = requireDb();
  const seedRef = doc(database, "meta", "seed");
  const seedSnap = await getDoc(seedRef);
  if(seedSnap.exists()) return false;

  const batch = writeBatch(database);
  processos.forEach(p => {
    const { id, ...data } = p;
    batch.set(doc(database, "processos", id), { ...data, seeded:true });
  });
  acompanhamentos.forEach(t => {
    const { id, ...data } = t;
    const proc = processos.find(p=>p.id===data.processoId);
    batch.set(doc(database, "acompanhamentos", id), { ...data, frente:proc?.frente || "", seeded:true });
  });
  batch.set(seedRef, { seeded:true, seededAt:serverTimestamp() });
  await batch.commit();
  return true;
}
