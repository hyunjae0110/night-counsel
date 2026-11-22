// 대문과 문서 화면이 함께 쓰는 것: 위쪽 메뉴, 펼친 메뉴, 맨 아래 정보, 장면으로 가기, 떠오르는 움직임.
// 초대 링크로 들어온 손님의 화면과 상담실에는 붙이지 않는다.
import { COPY } from './copy.js';

const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

// 장면으로 가는 링크. 주소의 # 을 바꾸지 않는다(# 뒤는 초대 링크의 방 이름이다).
// 대문에서는 누르면 그 장면으로 내려가고, 문서 화면에서는 대문으로 가서 그 장면을 연다.
const sceneLink = (item, className) => {
  const a = make('a', className, item.label);
  a.href = `./?go=${item.go}`;
  a.dataset.go = item.go;
  return a;
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
  brand.append(make('i'), S.brand);
  brand.firstChild.setAttribute('aria-hidden', 'true');
  const links = make('nav', 'site-links');
  links.setAttribute('aria-label', S.browse);
  links.append(...S.scenes.map((item) => sceneLink(item)));
  const burger = make('button', 'site-burger');
  burger.type = 'button';
  burger.setAttribute('aria-label', S.menu);
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-controls', 'site-panel');
  burger.append(make('span'), make('span'));
  navIn.append(brand, links, burger);
  nav.append(navIn);

  // 펼친 메뉴
  const panel = make('div', 'site-panel');
  panel.id = 'site-panel';
  const panelIn = make('div', 'site-panel-in');
  panelIn.append(
    group(S.browse, S.scenes.map((item) => sceneLink(item)), 'big'),
    group(S.quick, [...channel, mail, S.guide].map((item) => pageLink(item)), 'small'),
    group(S.policy, S.policies.map((item) => pageLink(item)), 'small')
  );
  panel.append(panelIn);
  const scrim = make('div', 'site-scrim');

  // 맨 아래 정보
  const foot = make('footer', 'site-foot');
  const footIn = make('div', 'site-foot-in');
  const help = make('p');
  help.append(make('strong', '', S.help.lead), ` ${S.help.lines}`);
  const cols = make('div', 'cols');
  cols.append(
    group(S.browse, S.scenes.slice(0, 3).map((item) => sceneLink(item))),
    group(S.contact, [...channel, { label: S.mail, href: mail.href }].map((item) => pageLink(item))),
    group(S.info, [S.guide, S.faq].map((item) => pageLink(item))),
    group(S.policy, S.policies.map((item) => pageLink(item)))
  );
  const legal = make('div', 'legal');
  const legalNav = make('nav');
  legalNav.setAttribute('aria-label', S.policy);
  legalNav.append(...S.policies.map((item) => pageLink(item)), pageLink({ label: S.ask, href: mail.href }));
  legal.append(make('span', '', S.rights), legalNav);
  footIn.append(help, make('p', '', S.disclaimer), cols, legal);
  foot.append(footIn);

  document.body.prepend(nav, panel, scrim);
  document.body.append(foot);

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

  // 장면으로 가기: 이 화면에 그 장면이 보이면 내려가고, 아니면 링크대로 대문으로 간다.
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
  document.addEventListener('click', (event) => {
    const a = event.target.closest('a[data-go]');
    if (a && go(a.dataset.go)) event.preventDefault();
  });

  // 내려갈 때 떠오르기
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        seen.unobserve(entry.target);
      }
    },
    { threshold: 0.18 }
  );
  document.querySelectorAll('.rv').forEach((el) => seen.observe(el));

  let arrived = false;
  return {
    // 메뉴와 맨 아래 정보를 보이거나 감춘다(초대 링크로 들어온 손님에게는 감춘다).
    show(on) {
      for (const el of [nav, panel, scrim, foot]) el.hidden = !on;
      if (!on) setMenu(false);
    },
    // 문서 화면에서 「?go=장면」으로 넘어왔으면 그 장면을 연다. 한 번만 한다.
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
