// 손님 화면: 문의 상태를 보여 주고, 초대 링크로 들어온 손님을 상담실에 앉힌다.
import {
  connect,
  onAuthStateChanged,
  signInAnonymously,
  ref,
  set,
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
import { mountSite } from './site.js';
import {
  SESSION_MINUTES,
  AWAY_DELAY_MS,
  serverClock,
  mountClock,
  keepSeat,
  keepTyping,
} from './session.js';

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
  reading: false, // 이용 약속을 읽는 중
  seatKnown: false, // 내가 먼저 나간 방인지 확인했다
  left: false, // 내가 먼저 나갔다
  peer: null, // present의 자리: null(아직 안 옴), 'here', 'away'
  peerAwayAt: 0,
  startedAt: null,
  erasing: false, // 상담이 끝나 지워지는 연출을 보여 주는 중
  confirmLeave: false,
  leaveError: false,
};

let stopMessages = null;
let stopTable = null;
let stopSeats = null;
let seat = null;
let typing = null;
let wasMine = false;
let leaving = false; // 먼저 나가기를 눌러 서버의 확인을 기다리는 중
let confirmTimer = 0;

const serverNow = serverClock(db);
const showClock = mountClock($('clock'), $('clock-say'));
const calm = matchMedia('(prefers-reduced-motion: reduce)');
const ERASE_MS = 2200;

// 대문의 메뉴와 맨 아래 정보. 초대 링크로 들어온 손님에게는 보이지 않는다.
const site = mountSite();
site.show(state.room === 'none');

const chat = mountChat($('chat'), {
  me: 'g',
  onSend: (text) =>
    push(ref(db, `rooms/${roomId}/messages`), { from: 'g', text, at: serverTimestamp() }),
  onTyping: (on) => typing && typing.set(on),
});

// 손님은 뒷면만 보이는 카드의 위치를 고른다. 그 자리에 어떤 카드가 있는지는 받지 않는다.
const table = mountTable($('table'), {
  role: 'g',
  onPick: (slot, pos) =>
    update(ref(db, `rooms/${roomId}/table`), {
      [`picks/${slot}`]: String(pos),
      [`taken/${pos}`]: String(slot),
    }),
});

function startMessages() {
  if (stopMessages) return;
  chat.clear();
  chat.system(COPY.chat.seated);
  chat.intro();
  typing = keepTyping(db, roomId, 'g', (on) => chat.peerTyping(on));
  stopTable = onValue(
    ref(db, `rooms/${roomId}/table`),
    (snap) => table.update(snap.val()),
    () => {}
  );
  stopMessages = onChildAdded(
    query(ref(db, `rooms/${roomId}/messages`), limitToLast(200)),
    (snap) => chat.add(snap.val()),
    () => {} // 상담이 끝나 읽을 수 없게 된 경우. 방 상태 감시가 화면을 바꾼다.
  );
}

function stopListening() {
  for (const stop of [stopMessages, stopTable, stopSeats]) if (stop) stop();
  stopMessages = stopTable = stopSeats = null;
  if (seat) seat.stop();
  if (typing) typing.stop();
  seat = typing = null;
}

function clearRoom() {
  chat.clear();
  table.reset();
  state.startedAt = null;
  state.peer = null;
}

// 두 사람의 자리를 지켜본다. 내가 먼저 나간 방이 아니면 대화를 잇고 내 자리를 지킨다.
function watchSeats() {
  if (stopSeats) return;
  stopSeats = onValue(
    ref(db, `rooms/${roomId}/presence`),
    (snap) => {
      const seats = snap.val() || {};
      state.seatKnown = true;
      state.left = seats.g === 'left';
      const peer = seats.c || null;
      if (peer === 'away' && state.peer !== 'away') {
        state.peerAwayAt = Date.now();
        setTimeout(render, AWAY_DELAY_MS);
      }
      state.peer = peer;
      if (!state.left && !leaving) {
        startMessages();
        if (!seat) {
          seat = keepSeat(db, roomId, 'g');
          render();
          chat.focus();
          return;
        }
      }
      render();
    },
    () => {
      // 자리 표시를 읽지 못해도(규칙이 아직 옛것일 때) 상담은 이어 간다. 방이 지워진 경우는 방 상태 감시가 맡는다.
      if (state.room !== 'mine' || state.seatKnown) return;
      state.seatKnown = true;
      state.peer = 'here';
      startMessages();
      render();
    }
  );
}

// 상담이 끝났다: 대화와 카드가 지워지는 모습을 잠깐 보여 주고 마침 인사로 넘어간다.
function finish() {
  const wasInRoom = state.room === 'mine' && state.seatKnown && !state.left;
  stopListening();
  state.room = 'ended';
  if (!wasInRoom || calm.matches) {
    clearRoom();
    return;
  }
  state.erasing = true;
  setTimeout(() => {
    state.erasing = false;
    clearRoom();
    render();
  }, ERASE_MS);
}

function renderRoom() {
  $('room-view').classList.toggle('erasing', state.erasing);
  $('conn').hidden = state.erasing || state.online || !state.everOnline;
  $('leave').hidden = state.erasing;
  $('leave').textContent = state.confirmLeave ? COPY.session.leaveConfirm : COPY.session.leave;

  const peer = $('peer');
  let text = '';
  if (state.erasing) text = COPY.session.erasing;
  else if (state.leaveError) text = COPY.session.leaveFailed;
  else if (!state.peer) text = COPY.session.g.waiting;
  else if (state.peer === 'away' && Date.now() - state.peerAwayAt >= AWAY_DELAY_MS - 100)
    text = COPY.session.g.away;
  peer.hidden = !text;
  peer.textContent = text;

  // 좁은 화면에서 단추가 다음 줄로 밀리지 않도록, 나가기를 확인하는 동안에는 남은 시간을 잠시 숨긴다.
  showClock(state.erasing || state.confirmLeave ? null : state.startedAt, serverNow());
}

function render() {
  const inRoom = state.erasing || (state.room === 'mine' && state.seatKnown && !state.left);
  const reading = !inRoom && state.reading && state.room === 'invited' && state.door === true;
  // 초대 링크 없이 온 사람에게는 대문을 보인다(연결이 안 될 때만 문 화면에서 알린다).
  const atHome = state.room === 'none' && !state.failed;
  $('room-view').hidden = !inRoom;
  $('promise-view').hidden = !reading;
  $('home-view').hidden = !atHome;
  $('door-view').hidden = inRoom || reading || atHome;
  site.show(atHome);
  document.documentElement.classList.toggle('lit', atHome && state.door === true);
  document.documentElement.classList.remove('pre-home', 'pre-door');
  if (atHome) return renderHome();
  if (inRoom) return renderRoom();
  if (reading) {
    $('sit').disabled = !$('agree').checked;
    $('sit-note').hidden = !state.sitError;
    return;
  }

  let key;
  if (state.failed) key = 'failed';
  else if (state.room === 'ended') key = 'ended';
  else if (state.room === 'mine') key = state.left ? 'left' : 'checking';
  else if (state.door === null) key = 'loading';
  else if (state.door === false) key = 'closed';
  else if (state.room === 'none') key = 'open';
  else if (state.room === 'checking') key = 'checking';
  else if (state.room === 'invited') key = 'invited';
  else key = 'invalid';

  const text = COPY.door[key];
  $('door-title').textContent = text.title;
  $('door-lead').textContent = text.lead;
  $('door-pic').classList.toggle('lit', state.door === true && key !== 'failed');

  const action = $('door-action');
  action.hidden = !text.action;
  if (text.action) action.textContent = text.action;
}

// 대문: 지금 문 상태를 글과 불빛으로 알린다.
function renderHome() {
  const key = state.door === null ? 'loading' : state.door ? 'open' : 'closed';
  for (const el of document.querySelectorAll('.js-state')) el.textContent = COPY.home.state[key];
  for (const el of document.querySelectorAll('.js-note')) el.textContent = COPY.home.note[key];
  site.arrive();
}

// 이용 약속 화면의 글자를 채운다.
(function fillPromise() {
  const P = COPY.promise;
  $('promise-title').textContent = P.title;
  $('promise-list').replaceChildren(
    ...P.items.map((item) => {
      const li = document.createElement('li');
      li.textContent = typeof item === 'function' ? item(SESSION_MINUTES) : item;
      return li;
    })
  );
  $('agree-text').textContent = P.agree;
  $('sit').textContent = P.sit;
  $('promise-back').textContent = P.back;
  $('sit-note').textContent = COPY.door.sitFailed;
})();

// 문 앞에서 약속 화면으로, 약속 화면에서 자리로.
$('door-action').addEventListener('click', () => {
  if (state.room !== 'invited') return;
  state.reading = true;
  render();
  $('promise-title').focus();
});

$('promise-back').addEventListener('click', () => {
  state.reading = false;
  render();
});

$('agree').addEventListener('change', render);

// 약속을 읽었다는 확인은 이 화면에서만 쓰고 어디에도 저장하지 않는다.
$('sit').addEventListener('click', async () => {
  if (state.room !== 'invited' || !state.uid || !$('agree').checked) return;
  $('sit').disabled = true;
  state.sitError = false;
  try {
    await set(ref(db, `rooms/${roomId}/meta/guest`), state.uid);
  } catch (err) {
    state.sitError = true;
  }
  render();
});

// 먼저 나가기: 두 번 눌러야 나간다. 대화는 present가 상담을 마칠 때 지워진다.
$('leave').addEventListener('click', async () => {
  if (!seat) return;
  if (!state.confirmLeave) {
    state.confirmLeave = true;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      state.confirmLeave = false;
      render();
    }, 4000);
    return render();
  }
  clearTimeout(confirmTimer);
  state.confirmLeave = false;
  state.leaveError = false;
  const mine = seat;
  seat = null;
  leaving = true;
  try {
    await mine.leave();
    for (const stop of [stopMessages, stopTable]) if (stop) stop();
    stopMessages = stopTable = null;
    if (typing) typing.stop();
    typing = null;
    state.left = true;
    clearRoom();
  } catch (err) {
    state.leaveError = true;
    seat = keepSeat(db, roomId, 'g');
  }
  leaving = false;
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
        if (wasMine) finish();
        else state.room = 'invalid';
      } else if (meta.guest === state.uid) {
        wasMine = true;
        state.room = 'mine';
        state.reading = false;
        state.startedAt = typeof meta.startedAt === 'number' ? meta.startedAt : null;
        watchSeats();
      } else if (!meta.guest) {
        state.room = 'invited';
      } else {
        state.room = 'invalid';
      }
      render();
    },
    () => {
      // 읽기가 거절됐다: 다른 사람이 이미 앉은 방이다.
      if (wasMine) finish();
      else state.room = 'invalid';
      render();
    }
  );
}

// 남은 시간은 분 단위로만 보이므로 가끔만 다시 그린다.
setInterval(() => {
  if (!$('room-view').hidden) renderRoom();
}, 10000);

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
