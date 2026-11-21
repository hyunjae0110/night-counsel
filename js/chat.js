// 손님 화면과 상담사 화면이 함께 쓰는 대화창.
import { COPY } from './copy.js';
import { CARDS } from './cards.js';

export const MAX_MESSAGE = 1000;
const SEND_GAP_MS = 500;

// root: 대화창이 들어갈 자리. me: 'g'(손님) 또는 'c'(상담사).
// onSend(text): 글을 보낼 때 부르는 함수. 실패하면 오류를 던져야 한다.
export function mountChat(root, { me, onSend }) {
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

  root.append(log, notice, form);

  let lastSent = 0;
  let sending = false;

  async function submit() {
    const text = input.value.trim();
    if (!text || sending || Date.now() - lastSent < SEND_GAP_MS) return;
    sending = true;
    notice.hidden = true;
    try {
      await onSend(text.slice(0, MAX_MESSAGE));
      input.value = '';
      lastSent = Date.now();
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
    },
    focus() {
      input.focus();
    },
  };
}
