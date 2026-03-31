import { initializeApp, type FirebaseApp } from "firebase/app";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBYJcFhkeBKw9dRKfiQlyFlxET3kEBZ3gE",
  authDomain: "dubbie-studio.firebaseapp.com",
  projectId: "dubbie-studio",
  storageBucket: "dubbie-studio.appspot.com",
  messagingSenderId: "167219761986",
  appId: "1:167219761986:web:cd12d446fad0534dee6edb",
};

let _app: FirebaseApp | null = null;
let _storage: FirebaseStorage | null = null;

function getApp(): FirebaseApp {
  if (!_app) {
    _app = initializeApp(firebaseConfig);
  }
  return _app;
}

function getFirebaseStorage(): FirebaseStorage {
  if (!_storage) {
    _storage = getStorage(getApp());
  }
  return _storage;
}

// Lazy getters — won't crash at import time
export { getApp as app, getFirebaseStorage as storage };
