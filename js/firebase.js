// Firebase 연결. SDK 버전과 프로젝트 설정은 이 파일에서만 정한다.
// 아래 설정값은 프로젝트를 구분하는 식별자이고 비밀 값이 아니다.
// 누가 무엇을 읽고 쓸 수 있는지는 rules/database.rules.json이 정한다.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import {
  getAuth,
  connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import {
  getDatabase,
  connectDatabaseEmulator,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';

export {
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
export {
  ref,
  get,
  set,
  update,
  push,
  onValue,
  onChildAdded,
  query,
  limitToLast,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBpU6oxN-OPzDghgIcGIbmoixZpeo8Vs1s',
  authDomain: 'night-counsel.firebaseapp.com',
  databaseURL: 'https://night-counsel-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'night-counsel',
  storageBucket: 'night-counsel.firebasestorage.app',
  messagingSenderId: '33117110038',
  appId: '1:33117110038:web:0185ee34aaf52eeba79a37',
};

// 내 컴퓨터에서 열면(localhost) 진짜 DB 대신 시험용 에뮬레이터에 붙는다.
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

// name: 'guest' 또는 'counselor'. 이름이 다르면 로그인 상태를 따로 기억하므로
// 같은 브라우저에서 손님 화면과 상담사 화면을 함께 열어도 서로 섞이지 않는다.
export function connect(name) {
  const app = initializeApp(firebaseConfig, name);
  const auth = getAuth(app);
  const db = getDatabase(app);
  if (isLocal) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(db, '127.0.0.1', 9000);
  }
  return { auth, db };
}
