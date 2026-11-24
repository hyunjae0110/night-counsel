// 대문과 나눈 화면, 문서 화면이 함께 쓰는 것: 위쪽 메뉴, 펼친 메뉴, 맨 아래 정보.
// 초대 링크로 들어온 손님의 화면과 상담실에는 붙이지 않는다.
import { COPY } from './copy.js';

const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const pageLink = (item, className) => {
  const a = make('a', className, item.label);
  a.href = item.href;
  if (/^https?:/.test(item.href)) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return a;
};

const group = (title, links, className) => {
  const box = make('div', className);
  box.append(make('h2', '', title), ...links);
  return box;
};

// 영상(video.motion): 소리 없이 되풀이되는 짧은 장면. 조건은 docs/guidelines.md의 「영상」.
// - 화면에 보일 때만 파일을 불러와 돌린다. 한 번에 하나만 돈다(가장 많이 보이는 것).
// - 움직임을 줄이도록 설정한 사람에게는 불러오지 않는다(아래에 깔린 그림이 보인다).
// - 좁은 화면에서 감춰 둔 영상(display: none)은 불러오지 않는다.
function mountMotion(calm) {
  const videos = [...document.querySelectorAll('video.motion')];
  if (!videos.length || !('IntersectionObserver' in window)) return;
  const seen = new Map();
  for (const v of videos) {
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'none';
    v.setAttribute('aria-hidden', 'true');
    v.tabIndex = -1;
  }
  const settle = () => {
    let best = null;
    for (const v of videos) {
      const share = seen.get(v) || 0;
      if (!calm.matches && v.offsetParent !== null && share > 0.35 && (!best || share > seen.get(best))) best = v;
    }
    for (const v of videos) {
      if (v === best) {
        if (!v.src) v.src = v.dataset.src;
        v.play().catch(() => {});
      } else if (!v.paused) {
        v.pause();
      }
    }
  };
  const watch = new IntersectionObserver(
    (entries) => {
      for (const e of entries) seen.set(e.target, e.isIntersecting ? e.intersectionRatio : 0);
      settle();
    },
    { threshold: [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1] }
  );
  for (const v of videos) watch.observe(v);
  calm.addEventListener('change', settle);
}

export function mountSite() {
  const S = COPY.site;
  const R = COPY.home.reserve;
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  const channel = R.open && R.url ? [{ label: S.channel, href: R.url }] : [];
  const mail = { label: S.mailLabel, href: `mailto:${S.mail}` };

  // 위쪽 메뉴 줄
  const nav = make('header', 'site-nav');
  const navIn = make('div', 'site-nav-in');
  const brand = make('a', 'site-brand');
  brand.href = './';
  // 상표: 작은 문. 문이 열리면 창에 불이 들어온다.
  brand.innerHTML =
    '<svg viewBox="0 0 13 17" aria-hidden="true"><path class="frame" d="M.7 16.3V6.5a5.8 5.8 0 0 1 11.6 0v9.8z"/><path class="pane" d="M4 8.2a2.5 2.5 0 0 1 5 0v2.6H4z"/></svg>';
  brand.append(S.brand);
  const links = make('nav', 'site-links');
  links.setAttribute('aria-label', S.browse);
  links.append(...S.pages.map((item) => pageLink(item)));
  const burger = make('button', 'site-burger');
  burger.type = 'button';
  burger.setAttribute('aria-label', S.menu);
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-controls', 'site-panel');
  burger.append(make('span'), make('span'));
  const cta = pageLink(S.reserve, 'site-cta');
  navIn.append(brand, links, cta, burger);
  nav.append(navIn);

  // 펼친 메뉴
  const panel = make('div', 'site-panel');
  panel.id = 'site-panel';
  const panelIn = make('div', 'site-panel-in');
  panelIn.append(
    group(S.browse, S.pages.map((item) => pageLink(item)), 'big'),
    group(S.quick, [...channel, mail, S.faq].map((item) => pageLink(item)), 'small'),
    group(S.policy, S.policies.map((item) => pageLink(item)), 'small')
  );
  panel.append(panelIn);
  const scrim = make('div', 'site-scrim');

  // 맨 아래 정보
  const foot = make('footer', 'site-foot');
  const footIn = make('div', 'site-foot-in');
  const help = make('p');
  help.append(make('strong', '', S.help.lead), ` ${S.help.lines}`);
  const footLinks = make('nav', 'foot-links');
  footLinks.setAttribute('aria-label', S.info);
  footLinks.append(
    ...[S.guide, S.faq, ...S.policies, ...channel, { label: S.mail, href: mail.href }].map((item) => pageLink(item))
  );
  footIn.append(help, make('p', '', S.disclaimer), footLinks, make('p', 'rights', S.rights));
  // 맨 아래 그림과 같은 장면의 영상(창의 빛과 풀만 움직인다). 그림은 CSS 바탕으로 그대로 깔려 있다.
  const footVideo = make('video', 'motion');
  footVideo.dataset.src = `assets/home/far.mp4?v=${S.motionVersion}`;
  foot.append(footVideo, footIn);

  // 지금 보고 있는 화면의 메뉴에 표시한다
  const here = location.pathname.split('/').pop().replace(/\.html$/, '');
  for (const a of [...links.children, ...panel.querySelectorAll('.big a')]) {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  }
  // 예약 화면: 채널을 열기 전에는 단추 대신 안내를 보인다
  const reserveLink = document.getElementById('reserve-link');
  const reserveSoon = document.getElementById('reserve-soon');
  if (reserveLink && reserveSoon) {
    const open = Boolean(R.open && R.url);
    if (open) reserveLink.href = R.url;
    reserveLink.hidden = !open;
    reserveSoon.hidden = open;
  }

  document.body.prepend(nav, panel, scrim);
  document.body.append(foot);
  mountMotion(calm);

  const setMenu = (open) => {
    root.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
  };
  burger.addEventListener('click', () => setMenu(!root.classList.contains('menu-open')));
  scrim.addEventListener('click', () => setMenu(false));
  panel.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenu(false);
  });

  // 화면 안의 자리로 가기(이용 안내의 자주 묻는 질문처럼 「?go=이름」으로 넘어왔을 때 쓴다).
  const scene = (name) => {
    const el = document.querySelector(`[data-scene="${name}"]`);
    return el && el.offsetParent !== null ? el : null;
  };
  const go = (name) => {
    const el = scene(name);
    if (!el) return false;
    const top = el.getBoundingClientRect().top + scrollY - nav.offsetHeight;
    scrollTo({ top, behavior: calm.matches ? 'auto' : 'smooth' });
    return true;
  };
  let arrived = false;
  return {
    // 메뉴와 맨 아래 정보를 보이거나 감춘다(초대 링크로 들어온 손님에게는 감춘다).
    show(on) {
      for (const el of [nav, panel, scrim, foot]) el.hidden = !on;
      if (!on) setMenu(false);
    },
    // 「?go=이름」으로 넘어왔으면 그 자리로 내려간다. 한 번만 한다.
    arrive() {
      if (arrived) return;
      arrived = true;
      const name = new URLSearchParams(location.search).get('go');
      if (!name || !/^[a-z]+$/.test(name)) return;
      history.replaceState(null, '', location.pathname);
      requestAnimationFrame(() => go(name));
    },
  };
}
