// 데이터 규칙 시험. 진짜 DB가 아니라 내 컴퓨터의 Firebase 에뮬레이터에서 돈다.
//
// 1) npx firebase-tools emulators:start --only auth,database --project night-counsel
// 2) node rules/test/rules-test.mjs
//
// 규칙을 바꾸면 이 시험을 다시 돌린다. 한 줄이라도 "실패"가 나오면 올리지 않는다.
import { readFile } from 'node:fs/promises';

const AUTH = 'http://127.0.0.1:9099';
const DB = 'http://127.0.0.1:9000';
const NS = 'night-counsel-default-rtdb';
const PROJECT = 'night-counsel';
const OWNER = { Authorization: 'Bearer owner' };
const COUNSELOR_UID = 'test-present-uid';
const NOW = { '.sv': 'timestamp' };

async function post(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return res.json();
}

// who: 로그인 토큰(문자열), 'owner'(규칙을 건너뛰는 관리자), null(로그인 안 함)
async function db(method, path, who, body) {
  const url = new URL(`${DB}/${path}.json`);
  url.searchParams.set('ns', NS);
  if (who && who !== 'owner') url.searchParams.set('auth', who);
  const res = await fetch(url, {
    method,
    headers: who === 'owner' ? OWNER : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
}

let failed = 0;
function check(name, result, expectOk) {
  const pass = result.ok === expectOk;
  if (!pass) failed++;
  console.log(`${pass ? '통과' : '실패'}  ${name}${pass ? '' : `  (응답 ${result.status})`}`);
}
const allowed = (name, r) => check(name, r, true);
const denied = (name, r) => check(name, r, false);

// --- 준비: 규칙을 올리고, 계정을 만든다 ---
// 규칙 파일에 적힌 상담사 UID를 시험용 UID로 바꿔서 올린다.
const source = await readFile(new URL('../database.rules.json', import.meta.url), 'utf8');
const written = source.match(/auth\.uid === '([^']+)'/);
if (!written) throw new Error('규칙에서 상담사 UID 자리를 찾지 못했습니다.');
const rules = source.replaceAll(`'${written[1]}'`, `'${COUNSELOR_UID}'`);
const put = await fetch(`${DB}/.settings/rules.json?ns=${NS}`, { method: 'PUT', headers: OWNER, body: rules });
if (!put.ok) throw new Error(`규칙을 올리지 못했습니다: ${await put.text()}`);

await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE', headers: OWNER });
await db('PUT', '', 'owner', null);

await post(
  `${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts`,
  { localId: COUNSELOR_UID, email: 'present@example.com', password: 'test-password' },
  OWNER
);
const signIn = (email, password) =>
  post(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test`, {
    email,
    password,
    returnSecureToken: true,
  });
const anonymous = () =>
  post(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test`, { returnSecureToken: true });

const present = await signIn('present@example.com', 'test-password');
if (present.localId !== COUNSELOR_UID) throw new Error('상담사 계정을 만들지 못했습니다.');
const guest = await anonymous();
const stranger = await anonymous();
// 누구나 이메일 계정을 새로 만들 수 있다. 그런 계정이 상담사 권한을 얻으면 안 된다.
const impostor = await post(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test`, {
  email: 'impostor@example.com',
  password: 'another-password',
  returnSecureToken: true,
});

const P = present.idToken;
const G = guest.idToken;
const S = stranger.idToken;
const I = impostor.idToken;
const ROOM = 'room_ABCDEFGHIJKLMNOP';
const msg = (from, text = '안녕하세요') => ({ from, text, at: NOW });

// --- 문 ---
allowed('문 상태는 로그인 없이 읽을 수 있다', await db('GET', 'door', null));
denied('로그인 없이 문을 열 수 없다', await db('PUT', 'door', null, { open: true }));
denied('손님은 문을 열 수 없다', await db('PUT', 'door', G, { open: true }));
denied('새로 가입한 이메일 계정은 문을 열 수 없다', await db('PUT', 'door', I, { open: true }));
denied('문 상태에 엉뚱한 값을 넣을 수 없다', await db('PUT', 'door', P, { open: 'yes' }));
denied('문 자리에 다른 항목을 넣을 수 없다', await db('PUT', 'door', P, { open: true, memo: 'x' }));

// --- 문이 닫힌 동안 ---
allowed('상담사는 방을 만들 수 있다', await db('PUT', `rooms/${ROOM}/meta`, P, { createdAt: NOW }));
allowed('상담사는 자기 자리를 쓸 수 있다', await db('PUT', 'private/current', P, { roomId: ROOM }));
denied('문이 닫혀 있으면 손님이 앉을 수 없다', await db('PUT', `rooms/${ROOM}/meta/guest`, G, guest.localId));

allowed('상담사는 문을 열 수 있다', await db('PUT', 'door', P, { open: true, changedAt: NOW }));

// --- 손님이 앉기 전 ---
denied('로그인 없이 방을 읽을 수 없다', await db('GET', `rooms/${ROOM}/meta`, null));
allowed('링크를 가진 사람은 빈 방의 상태를 읽을 수 있다', await db('GET', `rooms/${ROOM}/meta`, G));
denied('손님은 방 목록을 읽을 수 없다', await db('GET', 'rooms', G));
denied('손님은 상담사의 자리를 읽을 수 없다', await db('GET', 'private', G));
denied('새로 가입한 이메일 계정은 상담사의 자리를 읽을 수 없다', await db('GET', 'private', I));
denied('앉기 전에는 대화를 읽을 수 없다', await db('GET', `rooms/${ROOM}/messages`, G));
denied('앉기 전에는 글을 쓸 수 없다', await db('POST', `rooms/${ROOM}/messages`, G, msg('g')));
denied('없는 방에는 앉을 수 없다', await db('PUT', 'rooms/room_NOSUCHROOM12345/meta/guest', G, guest.localId));
denied('남의 이름으로 앉을 수 없다', await db('PUT', `rooms/${ROOM}/meta/guest`, G, stranger.localId));
denied('손님은 방을 통째로 고칠 수 없다', await db('PUT', `rooms/${ROOM}/meta`, G, { createdAt: 1, guest: guest.localId }));

// --- 손님이 앉는다 ---
allowed('손님은 빈 방에 앉을 수 있다', await db('PUT', `rooms/${ROOM}/meta/guest`, G, guest.localId));
denied('이미 손님이 있는 방에는 다른 사람이 앉을 수 없다', await db('PUT', `rooms/${ROOM}/meta/guest`, S, stranger.localId));
denied('손님이 자리를 다른 사람에게 넘길 수 없다', await db('PUT', `rooms/${ROOM}/meta/guest`, G, stranger.localId));
denied('손님이 자리를 지울 수 없다', await db('DELETE', `rooms/${ROOM}/meta/guest`, G));
denied('다른 사람은 손님이 앉은 방의 상태를 읽을 수 없다', await db('GET', `rooms/${ROOM}/meta`, S));

// --- 대화 ---
const sent = await db('POST', `rooms/${ROOM}/messages`, G, msg('g'));
allowed('손님은 글을 보낼 수 있다', sent);
allowed('상담사는 글을 보낼 수 있다', await db('POST', `rooms/${ROOM}/messages`, P, msg('c')));
allowed('손님은 대화를 읽을 수 있다', await db('GET', `rooms/${ROOM}/messages`, G));
allowed('상담사는 대화를 읽을 수 있다', await db('GET', `rooms/${ROOM}/messages`, P));
denied('다른 사람은 대화를 읽을 수 없다', await db('GET', `rooms/${ROOM}/messages`, S));
denied('새로 가입한 이메일 계정은 대화를 읽을 수 없다', await db('GET', `rooms/${ROOM}/messages`, I));
denied('로그인 없이 대화를 읽을 수 없다', await db('GET', `rooms/${ROOM}/messages`, null));
denied('다른 사람은 글을 쓸 수 없다', await db('POST', `rooms/${ROOM}/messages`, S, msg('g')));
denied('손님은 상담사인 척 글을 쓸 수 없다', await db('POST', `rooms/${ROOM}/messages`, G, msg('c')));
denied('빈 글은 보낼 수 없다', await db('POST', `rooms/${ROOM}/messages`, G, msg('g', '')));
denied('1000자가 넘는 글은 보낼 수 없다', await db('POST', `rooms/${ROOM}/messages`, G, msg('g', '가'.repeat(1001))));
allowed('1000자 글은 보낼 수 있다', await db('POST', `rooms/${ROOM}/messages`, G, msg('g', '가'.repeat(1000))));
denied('보낸 시각을 지어낼 수 없다', await db('POST', `rooms/${ROOM}/messages`, G, { from: 'g', text: 'x', at: 1 }));
denied('글에 다른 항목을 붙일 수 없다', await db('POST', `rooms/${ROOM}/messages`, G, { ...msg('g'), extra: 1 }));
denied('보낸 글을 고칠 수 없다', await db('PUT', `rooms/${ROOM}/messages/${sent.body?.name}/text`, G, '고친 글'));
denied('보낸 글을 지울 수 없다', await db('DELETE', `rooms/${ROOM}/messages/${sent.body?.name}`, G));
denied('손님은 대화를 통째로 지울 수 없다', await db('DELETE', `rooms/${ROOM}/messages`, G));
denied('손님은 방을 지울 수 없다', await db('DELETE', `rooms/${ROOM}`, G));
denied('방에 다른 항목을 넣을 수 없다', await db('PUT', `rooms/${ROOM}/extra`, P, { a: 1 }));

// --- 상담을 마친다 ---
allowed('상담사는 방을 지울 수 있다', await db('DELETE', `rooms/${ROOM}`, P));
const after = await db('GET', `rooms/${ROOM}`, 'owner');
check('마친 뒤에는 그 방의 데이터가 남지 않는다', { ok: after.body === null, status: after.status }, true);
denied('마친 뒤에는 손님이 대화를 읽을 수 없다', await db('GET', `rooms/${ROOM}/messages`, G));
denied('마친 뒤에는 손님이 글을 쓸 수 없다', await db('POST', `rooms/${ROOM}/messages`, G, msg('g')));
denied('마친 방에는 다시 앉을 수 없다', await db('PUT', `rooms/${ROOM}/meta/guest`, G, guest.localId));

console.log(failed ? `\n실패 ${failed}건` : '\n모두 통과');
process.exit(failed ? 1 : 0);
