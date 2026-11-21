// 상담 한 번의 처음과 끝에 두 화면이 함께 쓰는 것: 상담 길이, 남은 시간, 자리 지킴.
import { ref, set, onValue, onDisconnect } from './firebase.js';
import { COPY } from './copy.js';

// 상담 한 번의 길이(분). 시간이 지나도 자동으로 끊지 않고 알려 주기만 한다.
export const SESSION_MINUTES = 30;

// 상대가 자리를 비웠다는 안내는 이만큼 이어질 때만 보인다(새로고침처럼 잠깐 끊긴 것은 넘어간다).
export const AWAY_DELAY_MS = 3000;

// 서버 시계. 두 기기의 시계가 달라도 남은 시간이 같게 보인다.
export function serverClock(db) {
  let offset = 0;
  onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
    offset = Number(snap.val()) || 0;
  });
  return () => Date.now() + offset;
}

// 남은 시간 표시. el: 보이는 글자, say: 화면 낭독기에 알릴 자리(5분 전과 끝났을 때만 알린다).
export function mountClock(el, say) {
  const T = COPY.session;
  let lastStage = '';
  return (startedAt, now) => {
    if (!startedAt) {
      el.hidden = true;
      lastStage = '';
      return;
    }
    const left = Math.ceil((startedAt + SESSION_MINUTES * 60000 - now) / 60000);
    const stage = left <= 0 ? 'over' : left <= 5 ? 'soon' : 'calm';
    el.hidden = false;
    el.textContent =
      stage === 'over'
        ? T.over
        : stage === 'soon'
          ? T.soon(left)
          : T.left(Math.min(left, SESSION_MINUTES));
    el.classList.toggle('warm', stage !== 'calm');
    if (stage !== lastStage) {
      if (lastStage && stage !== 'calm') say.textContent = el.textContent;
      lastStage = stage;
    }
  };
}

// 자리 지킴: 내가 방에 있는 동안 rooms/{방}/presence/{who}를 'here'로 두고,
// 연결이 끊기면 서버가 대신 'away'로 바꾸게 맡겨 둔다. who: 'g'(손님) 또는 'c'(상담사).
export function keepSeat(db, roomId, who) {
  const mine = ref(db, `rooms/${roomId}/presence/${who}`);
  let connected = false;
  let stopped = false;

  function mark() {
    if (stopped || !connected) return;
    onDisconnect(mine)
      .set('away')
      .then(() => {
        if (!stopped) return set(mine, 'here');
      })
      .catch(() => {}); // 방이 이미 지워졌으면 규칙이 막는다. 화면은 방 상태 감시가 바꾼다.
  }

  const stopConn = onValue(ref(db, '.info/connected'), (snap) => {
    connected = snap.val() === true;
    mark();
  });
  // 같은 사람이 탭을 두 개 열었다가 하나를 닫으면 'away'가 된다. 남은 탭이 다시 'here'로 고친다.
  const stopMine = onValue(
    mine,
    (snap) => {
      if (snap.val() === 'left') stopped = true;
      else if (snap.val() !== 'here') mark();
    },
    () => {}
  );

  async function release(value) {
    stopped = true;
    stopConn();
    stopMine();
    try {
      await onDisconnect(mine).cancel();
      if (value) await set(mine, value);
    } catch (err) {
      if (value === 'left') throw err;
    }
  }

  return {
    // 방을 지우기 전에 부른다. 맡겨 둔 'away'를 거두어, 지운 방에 다시 쓰이지 않게 한다.
    stop: () => release(null),
    // 자리를 비운다(로그아웃).
    away: () => release('away'),
    // 손님이 먼저 나간다. 한 번 나가면 되돌릴 수 없다.
    leave: () => release('left'),
  };
}
