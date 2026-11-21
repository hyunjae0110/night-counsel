// 화면에 보이는 문구는 모두 이 파일에 모은다.
// 규칙: 해요체, 짧은 문장, 느낌표와 이모지 없음.
export const COPY = {
  counselorName: 'present',
  guestName: '손님',

  door: {
    loading: { title: '문을 살피는 중이에요', lead: '잠시만 기다려 주세요.' },
    closed: {
      title: '지금은 문 닫았어요',
      lead: '상담소를 준비하고 있어요. 문을 여는 날이 정해지면 이곳에 알릴게요.',
    },
    open: {
      title: '상담소에 불이 켜져 있어요',
      lead: '상담은 예약한 분께 보내 드린 초대 링크로 들어올 수 있어요.',
    },
    checking: { title: '초대 링크를 확인하는 중이에요', lead: '잠시만 기다려 주세요.' },
    invited: {
      title: '상담소에 불이 켜져 있어요',
      lead: 'present와 1:1로 조용히 이야기해요. 들어가기 전에 약속을 먼저 읽어 주세요.',
      action: '이용 약속 읽기',
    },
    invalid: {
      title: '이 초대 링크로는 들어올 수 없어요',
      lead: '이미 쓰였거나 끝난 상담의 링크예요. 예약하신 곳으로 다시 문의해 주세요.',
    },
    ended: {
      title: '상담이 끝났어요',
      lead: '나눈 대화와 카드는 모두 지워졌어요. 다시 이야기하고 싶어지면 예약하신 곳으로 알려 주세요. 편히 돌아가세요.',
    },
    left: {
      title: '상담실을 나왔어요',
      lead: '나눈 대화와 카드는 present가 상담을 마치면 지워져요. 편히 돌아가세요.',
    },
    failed: {
      title: '지금은 상담소에 들어올 수 없어요',
      lead: '연결이 잘 되지 않았어요. 잠시 뒤에 다시 열어 주세요.',
    },
    sitFailed: '자리에 앉지 못했어요. 잠시 뒤에 다시 눌러 주세요.',
  },

  // 손님이 자리에 앉기 전에 읽는 이용 약속. 글자 대신 함수인 항목은 상담 길이(분)를 받아 문장을 만든다.
  promise: {
    title: '들어가기 전에 읽어 주세요',
    items: [
      '이야기를 듣고 답하는 사람은 present 한 사람이에요. AI가 대신 답하지 않아요.',
      '나눈 대화와 카드는 상담이 끝나면 서버에서 모두 지워져요.',
      '이곳은 고민을 나누는 자리예요. 치료나 진단, 의료를 대신하지 않아요.',
      '만 15세 이상만 들어올 수 있어요.',
      '미성년자(만 19세 미만)라면, 스스로를 해치고 싶은 마음이나 집을 나오려는 일처럼 전문가의 도움이 필요한 이야기가 나올 때 상담을 멈추고 도움받을 곳을 알려 드려요.',
      (minutes) => `상담은 ${minutes}분이에요. 시간이 지나도 저절로 끊기지는 않아요.`,
    ],
    agree: '만 15세 이상이고, 위 내용을 읽었어요',
    sit: '자리에 앉기',
    back: '문 앞으로 돌아가기',
  },

  // 상담 중: 남은 시간, 상대가 자리를 비웠을 때, 먼저 나가기, 마침
  session: {
    left: (minutes) => `남은 시간 ${minutes}분`,
    soon: (minutes) => `${minutes}분 남았어요`,
    over: '시간이 다 됐어요',
    erasing: '대화와 카드를 지우고 있어요',
    leave: '나가기',
    leaveConfirm: '한 번 더 누르면 나가요',
    leaveFailed: '나가지 못했어요. 잠시 뒤에 다시 눌러 주세요.',
    g: {
      waiting: 'present가 오고 있어요. 잠시만 기다려 주세요.',
      away: 'present가 잠시 자리를 비웠어요. 돌아오면 이어서 이야기할 수 있어요.',
    },
    c: {
      away: '손님이 잠시 자리를 비웠어요. 돌아오면 이어져요.',
      left: '손님이 먼저 나갔어요. 상담 마치기를 눌러 대화를 지워 주세요.',
    },
  },

  chat: {
    label: '대화',
    empty: '아직 나눈 이야기가 없어요',
    seated: '손님이 자리에 앉았어요',
    guestPlaceholder: '마음을 편하게 적어 주세요',
    counselorPlaceholder: '손님에게 답하기',
    inputLabel: '메시지',
    send: '보내기',
    sendFailed: '보내지 못했어요. 다시 보내 주세요.',
    offline: '연결이 잠시 끊겼어요. 다시 잇는 중이에요.',
  },

  tarot: {
    spreadLabel: '펼칠 카드 수',
    spreadNames: { 1: '한 장', 3: '세 장' },
    shuffle: '카드 섞기',
    reshuffle: '다시 섞기',
    choose: '이 카드 고르기',
    revealLabel: '카드 펼치기',
    upright: '정방향',
    reversed: '역방향',
    fanLabel: '덱에서 카드 고르기',
    fanNone: '아직 고른 카드가 없어요',
    fanNth: (n, total) => `남은 ${total}장 중 ${n}번째 카드`,
    failed: '잘 되지 않았어요. 잠시 뒤에 다시 해 주세요.',
    g: {
      shuffling: 'present가 카드를 섞고 있어요',
      picking: (left) => `마음이 가는 카드를 ${left}장 골라 주세요. 덱 위를 훑으면 카드가 올라와요.`,
      revealing: 'present가 카드를 펼칠 거예요',
      done: '카드가 모두 펼쳐졌어요',
    },
    c: {
      idle: '카드를 섞으면 손님 화면에 덱이 펼쳐져요.',
      shuffling: '카드를 섞는 중이에요',
      picking: (left, done, total) => `손님이 카드를 고르는 중이에요 (${done}/${total})`,
      revealing: '뒷면인 카드를 눌러 한 장씩 펼치세요',
      done: '모두 펼쳤어요. 이야기를 이어가세요.',
    },
  },

  counselor: {
    loginTitle: 'present 로그인',
    email: '이메일',
    password: '비밀번호',
    login: '로그인',
    loginFailed: '이메일이나 비밀번호가 맞지 않아요.',
    logout: '로그아웃',
    deniedTitle: '이 계정으로는 문을 열 수 없어요',
    deniedLead: '상담사로 등록된 계정이 아니에요. 로그아웃한 뒤 present 계정으로 다시 들어와 주세요.',
    checking: '확인하는 중이에요',
    closedTitle: '상담소 문이 닫혀 있어요',
    closedLead: '문을 열면 손님 화면에 불이 켜져요.',
    openDoor: '상담소 열기',
    closeDoor: '문 닫기',
    openTitle: '문이 열려 있어요',
    openLead: '초대 링크를 만들어 예약한 손님에게 보내 주세요.',
    makeInvite: '초대 링크 만들기',
    waitingTitle: '손님을 기다리는 중이에요',
    waitingLead: '아래 링크를 손님에게 보내 주세요. 한 사람만 들어올 수 있어요.',
    inviteLabel: '초대 링크',
    copy: '링크 복사',
    copied: '복사했어요',
    copyFailed: '복사하지 못했어요. 링크를 직접 길게 눌러 복사해 주세요.',
    cancelInvite: '초대 취소',
    sessionTitle: '손님과 상담 중',
    end: '상담 마치기',
    endConfirm: '한 번 더 누르면 대화가 지워져요',
    failed: '잘 되지 않았어요. 연결을 확인하고 다시 눌러 주세요.',
    erased: '대화와 카드를 모두 지웠어요.',
    eraseFailed: '지워지지 않은 것이 남아 있어요. 문을 닫았다가 다시 열면 모두 지워져요.',
  },
};
