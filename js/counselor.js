// 상담사 화면: present가 로그인해 문을 열고 닫고, 초대 링크를 만들고, 손님과 이야기한다.
import {
  connect,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  ref,
  get,
  update,
  push,
  onValue,
  onChildAdded,
  query,
  limitToLast,
  serverTimestamp,
} from './firebase.js';
import { COPY } from './copy.js';
import { mountChat } from './chat.js';
import { mountTable } from './tarot.js';
import { DECK_SIZE, SPREADS } from './cards.js';

const { auth, db } = connect('counselor');
const $ = (id) => document.getElementById(id);
const T = COPY.counselor;

const state = {
  user: null,
  role: 'unknown', // unknown, ok, denied
  door: null,
  roomId: null,
  guest: false,
  confirmEnd: false,
  notice: '',
  online: true,
  everOnline: false,
};

let stopMeta = null;
let stopMessages = null;
let stopTable = null;
let stopDeck = null;
let tableNow = null; // rooms/{방}/table의 지금 값
let deckNow = null; // private/{방}/deck: 섞인 순서. 상담사만 읽을 수 있다.
let watchers = [];
let confirmTimer = 0;
let ready = false; // 로그인 상태를 처음 확인하기 전에는 아무 화면도 보이지 않는다.

const chat = mountChat($('chat'), {
  me: 'c',
  onSend: (text) =>
    push(ref(db, `rooms/${state.roomId}/messages`), { from: 'c', text, at: serverTimestamp() }),
});

// 0 이상 n 미만의 치우침 없는 난수.
function randomBelow(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

// 78장을 섞고 장마다 정·역방향을 정한다(반반).
function newDeck() {
  const order = Array.from({ length: DECK_SIZE }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { order, reversed: order.map(() => randomBelow(2) === 1) };
}

const tableView = mountTable($('table'), {
  role: 'c',
  // 섞기: 새 순서는 상담사만 읽는 자리에 두고, 탁자는 비운다(고른 카드와 펼친 카드가 사라진다).
  onShuffle: (spread) =>
    update(ref(db), {
      [`private/${state.roomId}/deck`]: newDeck(),
      [`rooms/${state.roomId}/table`]: {
        spread,
        deal: ((tableNow && tableNow.deal) || 0) + 1,
        dealtAt: serverTimestamp(),
      },
    }),
  onSpread: (spread) => update(ref(db), { [`rooms/${state.roomId}/table/spread`]: spread }),
  // 펼치기: 손님이 고른 위치의 카드를 탁자에 올리고, 대화에도 기록을 남긴다.
  onReveal: (slot) => {
    const picks = (tableNow && tableNow.picks) || {};
    const pos = picks[slot];
    if (pos === undefined || pos === null || !deckNow) throw new Error('no pick');
    const card = deckNow.order[Number(pos)];
    const reversed = deckNow.reversed[Number(pos)] === true;
    const spread = tableNow.spread === 1 ? 1 : 3;
    const key = push(ref(db, `rooms/${state.roomId}/messages`)).key;
    return update(ref(db), {
      [`rooms/${state.roomId}/table/reveals/${slot}`]: { card, reversed },
      [`rooms/${state.roomId}/messages/${key}`]: {
        from: 'c',
        card,
        reversed,
        label: SPREADS[spread][slot],
        at: serverTimestamp(),
      },
    });
  },
});

// 추측할 수 없는 방 이름을 만든다(128비트).
function newRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function inviteLink(id) {
  return `${new URL('./', location.href).href}#${id}`;
}

function show(viewId) {
  for (const id of ['login-view', 'denied-view', 'console-view', 'room-view']) {
    $(id).hidden = id !== viewId;
  }
}

function render() {
  if (!ready) return show('');
  if (!state.user) return show('login-view');
  if (state.role === 'denied') return show('denied-view');

  if (state.roomId && state.guest) {
    show('room-view');
    $('end').textContent = state.confirmEnd ? T.endConfirm : T.end;
    $('conn').hidden = state.online || !state.everOnline;
    return;
  }

  show('console-view');
  const checking = state.role === 'unknown' || state.door === null;
  const open = state.door === true;
  const waiting = open && !!state.roomId;

  $('door-svg').classList.toggle('lit', open);
  $('console-title').textContent = checking
    ? T.checking
    : !open
      ? T.closedTitle
      : waiting
        ? T.waitingTitle
        : T.openTitle;
  $('console-lead').textContent = checking
    ? ''
    : !open
      ? T.closedLead
      : waiting
        ? T.waitingLead
        : T.openLead;

  $('open-door').hidden = checking || open;
  $('make-invite').hidden = checking || !open || waiting;
  $('invite-box').hidden = !waiting;
  if (waiting) $('invite-link').value = inviteLink(state.roomId);
  $('cancel-invite').hidden = !waiting;
  $('close-door').hidden = checking || !open;

  $('notice').hidden = !state.notice;
  $('notice').textContent = state.notice;
}

function stopRoom() {
  for (const stop of [stopMeta, stopMessages, stopTable, stopDeck]) if (stop) stop();
  stopMeta = stopMessages = stopTable = stopDeck = null;
  tableNow = deckNow = null;
  state.guest = false;
  state.confirmEnd = false;
  chat.clear();
  tableView.reset();
}

function watchRoom(id) {
  stopRoom();
  state.roomId = id;
  if (!id) return;
  stopMeta = onValue(ref(db, `rooms/${id}/meta`), (snap) => {
    const seated = !!(snap.val() && snap.val().guest);
    if (seated && !state.guest) chat.system(COPY.chat.seated);
    state.guest = seated;
    render();
    if (seated) chat.focus();
  });
  stopMessages = onChildAdded(query(ref(db, `rooms/${id}/messages`), limitToLast(200)), (snap) =>
    chat.add(snap.val())
  );
  stopTable = onValue(ref(db, `rooms/${id}/table`), (snap) => {
    tableNow = snap.val();
    tableView.update(tableNow);
  });
  stopDeck = onValue(ref(db, `private/${id}/deck`), (snap) => {
    deckNow = snap.val();
  });
}

function startWatching() {
  watchers.push(
    onValue(ref(db, 'door/open'), (snap) => {
      state.door = snap.val() === true;
      render();
    }),
    onValue(ref(db, 'private/current/roomId'), (snap) => {
      const id = snap.val() || null;
      if (id !== state.roomId) watchRoom(id);
      render();
    }),
    onValue(ref(db, '.info/connected'), (snap) => {
      state.online = snap.val() === true;
      if (state.online) state.everOnline = true;
      render();
    })
  );
}

function stopWatching() {
  watchers.forEach((stop) => stop());
  watchers = [];
  stopRoom();
  state.roomId = null;
  state.door = null;
}

// 단추를 눌러 DB를 바꾸는 일은 모두 이 함수를 거친다.
async function act(button, changes) {
  state.notice = '';
  button.disabled = true;
  try {
    await update(ref(db), changes);
  } catch (err) {
    state.notice = T.failed;
  }
  button.disabled = false;
  render();
}

// 문을 열거나 닫을 때마다 남아 있던 방과 초대를 모두 지운다.
$('open-door').addEventListener('click', (e) =>
  act(e.currentTarget, {
    rooms: null,
    private: null,
    door: { open: true, changedAt: serverTimestamp() },
  })
);
$('close-door').addEventListener('click', (e) =>
  act(e.currentTarget, {
    rooms: null,
    private: null,
    door: { open: false, changedAt: serverTimestamp() },
  })
);
$('make-invite').addEventListener('click', (e) => {
  const id = newRoomId();
  act(e.currentTarget, {
    [`rooms/${id}/meta`]: { createdAt: serverTimestamp() },
    'private/current': { roomId: id, createdAt: serverTimestamp() },
  });
});
$('cancel-invite').addEventListener('click', (e) => {
  if (!state.roomId) return;
  act(e.currentTarget, {
    [`rooms/${state.roomId}`]: null,
    [`private/${state.roomId}`]: null,
    'private/current': null,
  });
});

$('end').addEventListener('click', (e) => {
  if (!state.roomId) return;
  if (!state.confirmEnd) {
    state.confirmEnd = true;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      state.confirmEnd = false;
      render();
    }, 4000);
    return render();
  }
  clearTimeout(confirmTimer);
  act(e.currentTarget, {
    [`rooms/${state.roomId}`]: null,
    [`private/${state.roomId}`]: null,
    'private/current': null,
  });
});

$('copy').addEventListener('click', async () => {
  const input = $('invite-link');
  try {
    await navigator.clipboard.writeText(input.value);
    $('copy').textContent = T.copied;
    setTimeout(() => {
      $('copy').textContent = T.copy;
    }, 2000);
  } catch (err) {
    input.select();
    state.notice = T.copyFailed;
    render();
  }
});

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = $('login');
  button.disabled = true;
  $('login-error').hidden = true;
  try {
    await signInWithEmailAndPassword(auth, $('email').value.trim(), $('password').value);
    $('password').value = '';
  } catch (err) {
    $('login-error').hidden = false;
  }
  button.disabled = false;
});

for (const id of ['logout', 'logout-denied']) {
  $(id).addEventListener('click', () => signOut(auth));
}

onAuthStateChanged(auth, async (user) => {
  ready = true;
  stopWatching();
  state.user = user;
  state.role = 'unknown';
  state.notice = '';
  render();
  if (!user) return;
  // 상담사만 읽을 수 있는 자리를 읽어 보아 present 계정인지 확인한다.
  try {
    await get(ref(db, 'private/current'));
    if (auth.currentUser !== user) return;
    state.role = 'ok';
    startWatching();
  } catch (err) {
    if (auth.currentUser !== user) return;
    if (/permission/i.test(`${err && err.code} ${err && err.message}`)) state.role = 'denied';
    else state.notice = T.failed;
  }
  render();
});

render();
