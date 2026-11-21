// 손님 화면과 상담사 화면이 함께 쓰는 대화창.
import { COPY } from './copy.js';
import { CARDS } from './cards.js';

export const MAX_MESSAGE = 1000;
const SEND_GAP_MS = 500;

// root: 대화창이 들어갈 자리. me: 'g'(손님) 또는 'c'(상담사).
// onSend(text): 글을 보낼 때 부르는 함수. 실패하면 오류를 던져야 한다.
// onTyping(on): 쓰기 시작하거나 멈출 때 부른다. 글의 내용은 넘기지 않는다.
// onNotice(text): 정해 둔 안내를 보낼 때 부른다. 이 함수를 준 화면(상담사)에만 「안내 보내기」가 생긴다.
const TYPING_IDLE_MS = 4000;
const CALL_NUMBERS = ['109', '1388', '119', '112'];

export function mountChat(root, { me, onSend, onTyping, onNotice }) {
  root.textContent = '';

  const log = document.createElement('div');
  log.className = 'log';
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');

  const empty = document.createElement('p');
  empty.className = 'sys';
  empty.textContent = COPY.chat.empty;
  log.append(empty);

  const notice = document.createElement('p');
  notice.className = 'chat-notice';
  notice.hidden = true;

  const form = document.createElement('form');
  form.className = 'composer';
  const inputId = `chat-input-${me}`;
  const label = document.createElement('label');
  label.className = 'sr';
  label.htmlFor = inputId;
  label.textContent = COPY.chat.inputLabel;
  const input = document.createElement('textarea');
  input.id = inputId;
  input.rows = 1;
  input.maxLength = MAX_MESSAGE;
  input.placeholder = me === 'g' ? COPY.chat.guestPlaceholder : COPY.chat.counselorPlaceholder;
  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'main';
  button.textContent = COPY.chat.send;
  form.append(label, input, button);

  // 상대가 쓰는 중이라는 표시. 조용히 보이기만 하고 소리 내어 읽지 않는다.
  const typing = document.createElement('p');
  typing.className = 'typing';
  typing.hidden = true;
  typing.textContent = COPY.chat.typing[me === 'g' ? 'c' : 'g'];

  root.append(log, typing, notice);

  // 정해 둔 안내 고르기(상담사 화면)
  let closePanel = () => {};
  if (onNotice) {
    const panel = document.createElement('div');
    panel.className = 'notice-panel';
    panel.hidden = true;
    const title = document.createElement('p');
    title.className = 'notice-title';
    title.textContent = COPY.chat.noticeTitle;
    const list = document.createElement('div');
    list.className = 'notice-list';
    const preview = document.createElement('p');
    preview.className = 'notice-preview';
    preview.hidden = true;
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'main';
    confirm.textContent = COPY.chat.noticeSend;
    confirm.hidden = true;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'quiet';
    close.textContent = COPY.chat.noticeClose;
    const foot = document.createElement('div');
    foot.className = 'notice-foot';
    foot.append(confirm, close);
    let chosen = null;
    const choose = (item, button) => {
      chosen = item;
      for (const b of list.children) b.setAttribute('aria-pressed', String(b === button));
      preview.textContent = item ? item.text : '';
      preview.hidden = confirm.hidden = !item;
    };
    for (const item of COPY.notices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      const hint = document.createElement('small');
      hint.textContent = COPY.chat.noticeHint(item.key);
      b.append(item.name, ' ', hint);
      b.addEventListener('click', () => choose(item, b));
      list.append(b);
    }
    panel.append(title, list, preview, foot);
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'notice-open';
    open.textContent = COPY.chat.noticeOpen;
    open.setAttribute('aria-expanded', 'false');
    closePanel = () => {
      panel.hidden = true;
      open.setAttribute('aria-expanded', 'false');
      choose(null, null);
    };
    open.addEventListener('click', () => {
      if (!panel.hidden) return closePanel();
      panel.hidden = false;
      open.setAttribute('aria-expanded', 'true');
    });
    close.addEventListener('click', closePanel);
    confirm.addEventListener('click', async () => {
      if (!chosen) return;
      confirm.disabled = true;
      await sendNotice(chosen);
      confirm.disabled = false;
      closePanel();
    });
    const bar = document.createElement('div');
    bar.className = 'notice-bar';
    bar.append(open);
    root.append(panel, bar);
  }

  root.append(form);

  let lastSent = 0;
  let sending = false;
  let amTyping = false;
  let typingTimer = 0;

  function setTyping(on) {
    clearTimeout(typingTimer);
    if (on) typingTimer = setTimeout(() => setTyping(false), TYPING_IDLE_MS);
    if (on === amTyping) return;
    amTyping = on;
    if (onTyping) Promise.resolve(onTyping(on)).catch(() => {});
  }
  input.addEventListener('input', () => setTyping(input.value.trim() !== ''));

  async function sendNotice(item) {
    notice.hidden = true;
    try {
      await onNotice(item.text);
      return true;
    } catch (err) {
      notice.textContent = COPY.chat.sendFailed;
      notice.hidden = false;
      return false;
    }
  }

  async function submit() {
    const text = input.value.trim();
    if (!text || sending || Date.now() - lastSent < SEND_GAP_MS) return;
    sending = true;
    notice.hidden = true;
    try {
      // 상담사가 /이름만 적어 보내면 그 이름의 정해 둔 안내가 나간다. 없는 이름이면 아무것도 보내지 않는다.
      const command = onNotice && /^\/(\S+)$/.exec(text);
      if (command) {
        const item = COPY.notices.find((n) => n.key === command[1]);
        if (!item) {
          notice.textContent = COPY.chat.noticeUnknown;
          notice.hidden = false;
          return;
        }
        if (!(await sendNotice(item))) return;
      } else {
        await onSend(text.slice(0, MAX_MESSAGE));
      }
      input.value = '';
      lastSent = Date.now();
      setTyping(false);
    } catch (err) {
      notice.textContent = COPY.chat.sendFailed;
      notice.hidden = false;
    } finally {
      sending = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  // Enter로 보내고 Shift+Enter로 줄을 바꾼다. 한글 조합 중에는 보내지 않는다.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });

  function scrollDown() {
    log.scrollTop = log.scrollHeight;
  }

  return {
    // msg: { from: 'c' | 'g', text } 또는 펼친 카드의 기록 { from: 'c', card, reversed, label }
    add(msg) {
      empty.remove();
      if (typeof msg.card === 'number') {
        const card = CARDS[msg.card];
        const line = document.createElement('p');
        line.className = 'cardline';
        const name = document.createElement('b');
        name.textContent = card ? card.name : '';
        line.append(
          `${String(msg.label ?? '')} · `,
          name,
          ` ${msg.reversed ? COPY.tarot.reversed : COPY.tarot.upright}`
        );
        log.append(line);
        scrollDown();
        return;
      }
      if (msg.kind === 'notice') {
        const text = String(msg.text ?? '');
        const box = document.createElement('div');
        box.className = 'notice-card';
        const label = document.createElement('span');
        label.className = 'by';
        label.textContent = COPY.chat.noticeLabel;
        const body = document.createElement('p');
        body.textContent = text;
        box.append(label, body);
        // 안내에 적힌 상담 전화는 눌러서 바로 걸 수 있게 한다.
        const numbers = [...new Set(text.match(/[0-9]+/g) || [])].filter((n) => CALL_NUMBERS.includes(n));
        if (numbers.length) {
          const calls = document.createElement('div');
          calls.className = 'calls';
          for (const n of numbers) {
            const a = document.createElement('a');
            a.href = `tel:${n}`;
            a.textContent = COPY.chat.call(n);
            calls.append(a);
          }
          box.append(calls);
        }
        log.append(box);
        scrollDown();
        return;
      }
      const row = document.createElement('div');
      row.className = `msg ${msg.from === me ? 'me' : 'you'}${msg.from === 'c' ? ' cn' : ''}`;
      const by = document.createElement('span');
      by.className = 'by';
      by.textContent = msg.from === 'c' ? COPY.counselorName : COPY.guestName;
      const body = document.createElement('p');
      body.textContent = String(msg.text ?? '');
      row.append(by, body);
      log.append(row);
      scrollDown();
    },
    // 상담실에 들어왔을 때 맨 위에 보이는 안내(채팅 규칙과 미성년자 안내).
    intro() {
      empty.remove();
      const box = document.createElement('div');
      box.className = 'notice-card intro';
      const label = document.createElement('span');
      label.className = 'by';
      label.textContent = COPY.chat.noticeLabel;
      const list = document.createElement('ul');
      for (const line of COPY.chat.intro) {
        const li = document.createElement('li');
        li.textContent = line;
        list.append(li);
      }
      box.append(label, list);
      log.append(box);
      scrollDown();
    },
    system(text) {
      empty.remove();
      const p = document.createElement('p');
      p.className = 'sys';
      p.textContent = text;
      log.append(p);
      scrollDown();
    },
    clear() {
      log.textContent = '';
      log.append(empty);
      input.value = '';
      notice.hidden = true;
      typing.hidden = true;
      clearTimeout(typingTimer);
      amTyping = false;
      closePanel();
    },
    // 상대가 쓰는 중인지 보여 준다.
    peerTyping(on) {
      typing.hidden = !on;
      if (on) scrollDown();
    },
    focus() {
      input.focus();
    },
  };
}
