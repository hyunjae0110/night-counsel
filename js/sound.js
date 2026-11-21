// 소리. 기본은 무음이다. 상담사 화면에서 손님이 자리에 앉는 순간에만 작은 종소리가 한 번 난다.
// 손님 화면은 이 파일을 불러오지 않는다. 소리 파일 없이 브라우저가 직접 만든다.
let ctx = null;

// 브라우저는 사람이 화면을 한 번 누른 뒤에만 소리를 허락한다. 처음 누를 때 준비해 둔다.
export function armSound() {
  const unlock = () => {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (err) {
      ctx = null; // 소리를 낼 수 없는 브라우저에서는 조용히 넘어간다.
    }
  };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
}

// 작고 짧은 종소리 한 번. 소리가 났으면 true를 돌려준다.
export function bell() {
  if (!ctx || ctx.state !== 'running') return false;
  const now = ctx.currentTime;
  for (const [freq, peak, length] of [
    [784, 0.05, 1.6],
    [1568, 0.018, 0.9],
  ]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + length + 0.05);
  }
  return true;
}
