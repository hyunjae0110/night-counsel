// 타로 탁자: 손님 화면과 상담사 화면이 함께 쓴다.
// 상담사가 섞고, 손님이 고르고, 상담사가 펼친다.
// 이 화면은 DB의 rooms/{방}/table을 그대로 그릴 뿐이고, 권한은 데이터 규칙이 지킨다.
import { CARDS, DECK_SIZE, SPREADS, ART_CARDS } from './cards.js';
import { COPY } from './copy.js';

const T = COPY.tarot;
const SHUFFLE_MS = 1400;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// DB는 0, 1, 2처럼 이어지는 열쇠를 배열로 돌려주기도 한다. 어느 쪽이든 [열쇠, 값] 목록으로 바꾼다.
function entries(value) {
  return Object.entries(value || {}).filter(([, v]) => v !== null && v !== undefined);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// root: 탁자가 들어갈 자리. role: 'g'(손님) 또는 'c'(상담사).
// onPick(slot, pos), onReveal(slot), onShuffle(spread), onSpread(spread): DB를 바꾸는 함수. 실패하면 오류를 던진다.
export function mountTable(root, { role, onPick, onReveal, onShuffle, onSpread }) {
  const isGuest = role === 'g';
  root.textContent = '';

  // 상담사 도구: 스프레드 고르기, 섞기
  const tools = el('div', 't-tools');
  const seg = el('div', 't-seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', T.spreadLabel);
  const segButtons = [1, 3].map((n) => {
    const b = el('button', '', T.spreadNames[n]);
    b.type = 'button';
    b.dataset.spread = String(n);
    seg.append(b);
    return b;
  });
  const shuffleButton = el('button', 'main', T.shuffle);
  shuffleButton.type = 'button';
  tools.append(seg, shuffleButton);
  if (isGuest) tools.hidden = true;

  const hint = el('p', 't-hint');
  hint.setAttribute('aria-live', 'polite');
  const slots = el('div', 't-slots');
  const fan = el('div', 't-fan');
  const choose = el('button', 'main t-choose', T.choose);
  choose.type = 'button';
  choose.hidden = true;
  const notice = el('p', 'note t-notice', T.failed);
  notice.setAttribute('role', 'alert');
  notice.hidden = true;

  root.append(tools, hint, slots, fan, choose, notice);

  let table = null;
  let lastDeal; // undefined: 아직 한 번도 그리지 않음
  let shuffling = false;
  let shuffleTimer = 0;
  let busy = false;
  let chosenSpread = 3; // 아직 섞기 전에 상담사가 골라 둔 스프레드
  let selected = null; // 손님이 고르려고 올려 둔 카드의 위치
  let seen = new Set(); // 이미 펼쳐진 모습을 그린 자리(펼치는 움직임은 한 번만)
  let layout = { rows: [], rowH: 0, cardW: 0, step: 0, padTop: 0 };

  const picksOf = () => {
    const out = [];
    for (const [slot, pos] of entries(table && table.picks)) out[Number(slot)] = Number(pos);
    return out;
  };
  const revealsOf = () => {
    const out = [];
    for (const [slot, r] of entries(table && table.reveals)) out[Number(slot)] = r;
    return out;
  };
  const spreadOf = () => (table ? (table.spread === 1 ? 1 : 3) : chosenSpread);
  const canPick = () =>
    isGuest && table && !shuffling && !busy && picksOf().filter((p) => p !== undefined).length < spreadOf();

  async function run(action) {
    if (busy) return;
    busy = true;
    notice.hidden = true;
    render();
    try {
      await action();
    } catch (err) {
      notice.hidden = false;
    }
    busy = false;
    render();
  }

  function frontCard(reveal, isNew) {
    const card = CARDS[reveal.card] || { mark: '', name: '' };
    const face = el('div', `card front${reveal.reversed ? ' rv' : ''}${isNew && !reduceMotion ? ' new' : ''}`);
    face.setAttribute('role', 'img');
    face.setAttribute('aria-label', `${card.name} ${reveal.reversed ? T.reversed : T.upright}`);
    const mark = el('span', 'mark', card.mark);
    const name = el('span', 'nm', card.name);
    if (reveal.card < ART_CARDS) {
      // 그림은 카드가 펼쳐진 뒤에만 불러온다. 불러오지 못하면 임시 모양으로 보인다.
      const pic = document.createElement('img');
      pic.className = 'pic';
      pic.alt = '';
      pic.src = `assets/cards/${String(reveal.card).padStart(2, '0')}.svg`;
      pic.addEventListener('error', () => {
        pic.remove();
        face.classList.remove('art');
      });
      face.classList.add('art');
      face.append(mark, pic, name);
    } else {
      face.append(mark, name);
    }
    return face;
  }

  function renderSlots() {
    const spread = spreadOf();
    const picks = picksOf();
    const reveals = revealsOf();
    slots.textContent = '';
    slots.dataset.count = String(spread);
    SPREADS[spread].forEach((label, i) => {
      const figure = el('figure', 'slot');
      const reveal = reveals[i];
      const picked = picks[i] !== undefined;
      if (reveal) {
        const key = `${table.deal}:${i}`;
        figure.append(frontCard(reveal, !seen.has(key)));
        seen.add(key);
      } else if (picked && !isGuest) {
        const b = el('button', 'card back');
        b.type = 'button';
        b.dataset.slot = String(i);
        b.disabled = busy || shuffling;
        b.setAttribute('aria-label', `${label} ${T.revealLabel}`);
        figure.append(b);
      } else if (picked) {
        figure.append(el('div', 'card back'));
      } else {
        figure.append(el('div', 'card empty'));
      }
      figure.append(el('figcaption', '', reveal && reveal.reversed ? `${label} · ${T.reversed}` : label));
      if (reveal && !isGuest) {
        const card = CARDS[reveal.card];
        if (card) figure.append(el('p', 'kw', reveal.reversed ? card.rev : card.up));
      }
      slots.append(figure);
    });
  }

  // 남은 카드를 화면 너비에 맞춰 한 줄에서 세 줄로 펼친다.
  function renderFan() {
    fan.textContent = '';
    const taken = new Set(picksOf().filter((p) => p !== undefined));
    // 아직 섞지 않았거나, 고를 카드를 다 골랐으면 덱은 치운다.
    if (!table || taken.size >= spreadOf()) {
      fan.hidden = true;
      layout = { rows: [], rowH: 0, cardW: 0, step: 0, padTop: 0 };
      return;
    }
    fan.hidden = false;
    const rest = [];
    for (let pos = 0; pos < DECK_SIZE; pos++) if (!taken.has(pos)) rest.push(pos);
    if (selected !== null && taken.has(selected)) selected = null;

    const width = fan.clientWidth || 320;
    const rowCount = width < 480 ? 3 : width < 820 ? 2 : 1;
    const cardW = width < 480 ? 38 : 46;
    const cardH = Math.round(cardW * 1.62);
    const perRow = Math.ceil(rest.length / rowCount);
    const step = Math.min(cardW * 0.6, perRow > 1 ? (width - cardW) / (perRow - 1) : 0);
    const padTop = 14;
    const rowH = cardH + 10;
    const rows = [];
    for (let r = 0; r < rowCount; r++) {
      const list = rest.slice(r * perRow, (r + 1) * perRow);
      if (!list.length) break;
      const rowWidth = step * (list.length - 1) + cardW;
      rows.push({ list, x0: (width - rowWidth) / 2 });
    }
    layout = { rows, rowH, cardW, step, padTop };
    fan.style.height = `${padTop + rows.length * rowH}px`;
    fan.classList.toggle('shuf', shuffling && !reduceMotion);
    fan.classList.toggle('pickable', !!canPick());

    rows.forEach((row, r) => {
      row.list.forEach((pos, k) => {
        const c = el('i', `fc${pos === selected ? ' up' : ''}`);
        c.style.left = `${row.x0 + k * step}px`;
        c.style.top = `${padTop + r * rowH}px`;
        c.style.width = `${cardW}px`;
        c.style.height = `${cardH}px`;
        c.style.setProperty('--d', String(((pos * 37) % 30) - 15));
        c.style.setProperty('--t', `${-((pos * 53) % 450)}ms`);
        fan.append(c);
      });
    });

    if (isGuest) {
      const order = rows.flatMap((row) => row.list);
      const index = selected === null ? -1 : order.indexOf(selected);
      fan.tabIndex = canPick() ? 0 : -1;
      fan.setAttribute('role', 'slider');
      fan.setAttribute('aria-label', T.fanLabel);
      fan.setAttribute('aria-valuemin', '1');
      fan.setAttribute('aria-valuemax', String(order.length));
      fan.setAttribute('aria-valuenow', String(Math.max(1, index + 1)));
      fan.setAttribute('aria-valuetext', index < 0 ? T.fanNone : T.fanNth(index + 1, order.length));
    } else {
      fan.setAttribute('aria-hidden', 'true');
    }
  }

  function renderHint() {
    if (!table) {
      hint.textContent = isGuest ? '' : T.c.idle;
      return;
    }
    const spread = spreadOf();
    const done = picksOf().filter((p) => p !== undefined).length;
    const open = revealsOf().filter(Boolean).length;
    const side = isGuest ? T.g : T.c;
    if (shuffling) hint.textContent = side.shuffling;
    else if (done < spread) hint.textContent = side.picking(spread - done, done, spread);
    else if (open < spread) hint.textContent = side.revealing;
    else hint.textContent = side.done;
  }

  function render() {
    root.hidden = isGuest && !table;
    const hasPicks = picksOf().some((p) => p !== undefined);
    const spread = spreadOf();
    segButtons.forEach((b) => {
      b.setAttribute('aria-pressed', String(Number(b.dataset.spread) === spread));
      b.disabled = busy || shuffling || hasPicks;
    });
    shuffleButton.textContent = table ? T.reshuffle : T.shuffle;
    shuffleButton.disabled = busy || shuffling;
    renderHint();
    renderSlots();
    renderFan();
    choose.hidden = !canPick();
    choose.disabled = selected === null;
  }

  // 화면의 한 점 아래에 있는 카드의 위치를 찾는다.
  function posAt(clientX, clientY) {
    const box = fan.getBoundingClientRect();
    const { rows, rowH, step, cardW, padTop } = layout;
    if (!rows.length) return null;
    const r = Math.max(0, Math.min(rows.length - 1, Math.floor((clientY - box.top - padTop) / rowH)));
    const row = rows[r];
    const x = clientX - box.left - row.x0;
    const k = step > 0 ? Math.floor(x / step) : 0;
    const last = row.list.length - 1;
    if (x < -cardW || x > last * step + cardW * 2) return null;
    return row.list[Math.max(0, Math.min(last, k))];
  }

  function select(pos) {
    if (pos === null || pos === selected) return;
    selected = pos;
    render();
  }

  // 손가락이나 마우스로 덱 위를 훑으면 그 아래 카드가 올라온다. 고르기는 단추로 확정한다.
  fan.addEventListener('pointerdown', (e) => {
    if (!canPick()) return;
    select(posAt(e.clientX, e.clientY));
  });
  fan.addEventListener('pointermove', (e) => {
    if (!canPick()) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) return;
    select(posAt(e.clientX, e.clientY));
  });
  fan.addEventListener('keydown', (e) => {
    if (!canPick()) return;
    const order = layout.rows.flatMap((row) => row.list);
    const index = selected === null ? -1 : order.indexOf(selected);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(order.length - 1, index + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = order.length - 1;
    else if ((e.key === 'Enter' || e.key === ' ') && selected !== null) {
      e.preventDefault();
      choose.click();
      return;
    }
    if (next === null) return;
    e.preventDefault();
    select(order[next]);
    fan.focus();
  });

  choose.addEventListener('click', () => {
    if (!canPick() || selected === null) return;
    const pos = selected;
    const slot = picksOf().filter((p) => p !== undefined).length;
    selected = null;
    run(() => onPick(slot, pos));
  });

  slots.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-slot]');
    if (!b || b.disabled) return;
    run(() => onReveal(Number(b.dataset.slot)));
  });

  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-spread]');
    if (!b || b.disabled) return;
    const n = Number(b.dataset.spread);
    if (n === spreadOf()) return;
    if (!table) {
      chosenSpread = n;
      render();
    } else {
      run(() => onSpread(n));
    }
  });

  shuffleButton.addEventListener('click', () => {
    if (shuffleButton.disabled) return;
    run(() => onShuffle(spreadOf()));
  });

  const resize = new ResizeObserver(() => {
    if (table) renderFan();
  });
  resize.observe(fan);

  return {
    // next: DB의 rooms/{방}/table 값. 아직 섞지 않았으면 null.
    update(next) {
      const deal = next ? next.deal : null;
      if (lastDeal !== undefined && deal !== null && deal !== lastDeal) {
        // 새로 섞였다: 잠깐 섞는 모습을 보여 주고, 그동안은 고를 수 없다.
        shuffling = true;
        selected = null;
        seen = new Set();
        clearTimeout(shuffleTimer);
        shuffleTimer = setTimeout(
          () => {
            shuffling = false;
            render();
          },
          reduceMotion ? 200 : SHUFFLE_MS
        );
      }
      if (!next) {
        selected = null;
        seen = new Set();
      } else if (lastDeal === undefined) {
        // 처음 그릴 때 이미 펼쳐져 있던 카드는 움직임 없이 보여 준다.
        for (const [slot] of entries(next.reveals)) seen.add(`${next.deal}:${slot}`);
      }
      lastDeal = deal;
      table = next || null;
      if (table) chosenSpread = spreadOf();
      render();
    },
    reset() {
      clearTimeout(shuffleTimer);
      shuffling = false;
      busy = false;
      table = null;
      lastDeal = undefined;
      selected = null;
      seen = new Set();
      notice.hidden = true;
      render();
    },
  };
}
