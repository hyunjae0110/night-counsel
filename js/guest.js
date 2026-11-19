// 손님 화면: 문의 상태를 보여 주고, 초대 링크로 들어온 손님을 상담실에 앉힌다.
import {
  connect,
  onAuthStateChanged,
  signInAnonymously,
  ref,
  set,
  push,
  onValue,
  onChildAdded,
  query,
  limitToLast,
  serverTimestamp,
} from './firebase.js';
import { COPY } from './copy.js';
import { mountChat } from './chat.js';

const { auth, db } = connect('guest');
const $ = (id) => document.getElementById(id);

// 초대 링크는 주소 끝의 # 뒤에 방 이름을 담는다. # 뒤는 서버로 전송되지 않는다.
const roomId = (() => {
  const h = location.hash.slice(1);
  return /^[A-Za-z0-9_-]{16,40}$/.test(h) ? h : null;
})();
window.addEventListener('hashchange', () => location.reload());

const state = {
  uid: null,
  door: null, // null: 아직 모름, true: 열림, false: 닫힘
  room: roomId ? 'checking' : 'none', // none, checking, invited, mine, invalid, ended
  failed: false,
  sitError: false,
  online: true,
  everOnline: false,
};

let stopMessages = null;
let wasMine = false;

const chat = mountChat($('chat'), {
  me: 'g',
  onSend: (text) =>
    push(ref(db, `rooms/${roomId}/messages`), { from: 'g', text, at: serverTimestamp() }),
});

function startMessages() {
  if (stopMessages) return;
  chat.clear();
  chat.system(COPY.chat.seated);
  stopMessages = onChildAdded(
    query(ref(db, `rooms/${roomId}/messages`), limitToLast(200)),
    (snap) => chat.add(snap.val()),
    () => {} // 상담이 끝나 읽을 수 없게 된 경우. 방 상태 감시가 화면을 바꾼다.
  );
}

function endSession() {
  if (stopMessages) stopMessages();
  stopMessages = null;
  chat.clear();
}

function render() {
  const inRoom = state.room === 'mine';
  $('room-view').hidden = !inRoom;
  $('door-view').hidden = inRoom;
  if (inRoom) {
    $('conn').hidden = state.online || !state.everOnline;
    return;
  }

  let key;
  if (state.failed) key = 'failed';
  else if (state.room === 'ended') key = 'ended';
  else if (state.door === null) key = 'loading';
  else if (state.door === false) key = 'closed';
  else if (state.room === 'none') key = 'open';
  else if (state.room === 'checking') key = 'checking';
  else if (state.room === 'invited') key = 'invited';
  else key = 'invalid';

  const text = COPY.door[key];
  $('door-title').textContent = text.title;
  $('door-lead').textContent = text.lead;
  $('door-svg').classList.toggle('lit', state.door === true && key !== 'failed');

  const action = $('door-action');
  action.hidden = !text.action;
  if (text.action) action.textContent = text.action;

  const note = $('door-note');
  note.hidden = !(state.sitError && key === 'invited');
  note.textContent = COPY.door.sitFailed;
}

$('door-action').addEventListener('click', async () => {
  if (state.room !== 'invited' || !state.uid) return;
  $('door-action').disabled = true;
  state.sitError = false;
  try {
    await set(ref(db, `rooms/${roomId}/meta/guest`), state.uid);
  } catch (err) {
    state.sitError = true;
  }
  $('door-action').disabled = false;
  render();
});

// 문 상태는 로그인 없이도 읽을 수 있다.
onValue(
  ref(db, 'door/open'),
  (snap) => {
    state.door = snap.val() === true;
    render();
  },
  () => {
    state.failed = true;
    render();
  }
);

onValue(ref(db, '.info/connected'), (snap) => {
  state.online = snap.val() === true;
  if (state.online) state.everOnline = true;
  render();
});

function watchRoom() {
  onValue(
    ref(db, `rooms/${roomId}/meta`),
    (snap) => {
      const meta = snap.val();
      if (!meta) {
        // 방이 없다: 내가 앉아 있었다면 상담이 끝난 것이고, 아니면 쓸 수 없는 링크다.
        if (wasMine) endSession();
        state.room = wasMine ? 'ended' : 'invalid';
      } else if (meta.guest === state.uid) {
        wasMine = true;
        state.room = 'mine';
        startMessages();
      } else if (!meta.guest) {
        state.room = 'invited';
      } else {
        state.room = 'invalid';
      }
      render();
      if (state.room === 'mine') chat.focus();
    },
    () => {
      // 읽기가 거절됐다: 다른 사람이 이미 앉은 방이다.
      if (wasMine) endSession();
      state.room = wasMine ? 'ended' : 'invalid';
      render();
    }
  );
}

let watching = false;
onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth).catch(() => {
      state.failed = true;
      render();
    });
    return;
  }
  state.uid = user.uid;
  if (roomId && !watching) {
    watching = true;
    watchRoom();
  }
  render();
});

render();
