// Сценарии 3D-блока «Как мы лечим». Стадия = декларативное состояние модели (build),
// ракурс камеры (view) и подписи (labels). При смене стадии камера сама облетает челюсть.
//
// build(A, D): A — якоря из jaw.json (точки патологий в координатах зуба, считаются
// в scripts/bake-jaw.mjs), D — размеры типов зубов. Вариант геометрии зуба (variant)
// или челюсти (jawVariant) должен быть запечён: tooth:<код>:<variant>, gum|bone:<челюсть>:<variant>.
// Нет нужного варианта — добавьте его в bake-jaw.mjs и выполните `npm run bake`.
//
// view.cam: overview | side | front (вид на улыбку) | occlusal | buccal (последние два — с view.fdi).

export const baseState = () => ({
  mouth: 0, view: 'normal', hideJaw: null, focus: null, teeth: {}, gumFx: {}, extras: [], jawVariant: {},
});
const T = (s, fdi) => (s.teeth[fdi] ||= {});

const ANT_L = [33, 32, 31, 41, 42, 43];
const ANT_U = [13, 12, 11, 21, 22, 23];
const SMILE = [...ANT_U, ...ANT_L, 14, 15, 24, 25, 34, 35, 44, 45];
const ALL = [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48];

const lowerMolar = (fdi) => ({ ...baseState(), mouth: 0.6, hideJaw: 'U', focus: fdi });
const pulpXray = () => ({ ...baseState(), view: 'xray', mouth: 0.35, hideJaw: 'U', focus: 46 });
const smile = () => ({ ...baseState(), mouth: 0.22 });
const smileView = (dist) => ({ cam: 'front', dist, y: -4 });

export const SCENARIOS = [
  {
    id: 'anatomy',
    title: 'Здоровые зубы',
    hint: 'Как устроена челюсть',
    stages: [
      {
        title: 'Зубные ряды',
        text: 'У взрослого 32 постоянных зуба: резцы, клыки, премоляры и моляры. Каждый держится в лунке челюстной кости, а у шейки его плотно обхватывает десна.',
        build: () => baseState(),
        view: { cam: 'overview' },
      },
      {
        title: 'Открывание рта',
        text: 'Нижняя челюсть поворачивается в височно-нижнечелюстных суставах и при широком открывании немного выдвигается вперёд.',
        build: () => ({ ...baseState(), mouth: 1 }),
        view: { cam: 'side' },
      },
      {
        title: 'Что видно на снимке',
        text: 'Корни сидят глубоко в кости, внутри каждого зуба — пульпа с сосудами и нервом. Поэтому перед лечением мы всегда делаем снимок.',
        build: () => ({ ...baseState(), view: 'xray', mouth: 0.25, showNerve: true, extras: [{ id: 'nerve', type: 'nerve' }] }),
        view: { cam: 'overview' },
        labels: [
          { fdi: 36, local: [0, 1.2, 0], text: 'Пульпа' },
          { jaw: 'L', world: [-25, -25.5, -4], text: 'Нижнечелюстной нерв' },
        ],
      },
    ],
  },

  {
    id: 'caries',
    title: 'Кариес',
    hint: 'От пятна до пломбы',
    service: 'Лечение / терапия',
    stages: [
      {
        title: 'Здоровый зуб',
        text: 'Эмаль — самая твёрдая ткань организма. Но в глубоких бороздках жевательных зубов легко задерживается налёт, и кариес чаще всего начинается именно там.',
        build: () => lowerMolar(36),
        view: { cam: 'occlusal', fdi: 36, dist: 92 },
      },
      {
        title: 'Кариозное пятно',
        text: 'Кислоты бактерий вымывают минералы из эмали, и появляется матовое пятно. Боли ещё нет, и зуб можно вылечить без сверления — реминерализацией и фторированием.',
        build: (A) => {
          const s = lowerMolar(36);
          T(s, 36).lesions = [A.lesion36spot];
          return s;
        },
        view: { cam: 'occlusal', fdi: 36, dist: 84 },
        labels: [{ fdi: 36, local: 'caries36', text: 'Деминерализация эмали' }],
      },
      {
        title: 'Полость в дентине',
        text: 'Без лечения эмаль разрушается, и кариес уходит в мягкий дентин. Зуб реагирует на холодное и сладкое, в полости застревает еда.',
        build: (A) => {
          const s = lowerMolar(36);
          T(s, 36).lesions = [A.lesion36cavity];
          T(s, 36).variant = 'cav45';
          return s;
        },
        view: { cam: 'occlusal', fdi: 36, dist: 78 },
        labels: [{ fdi: 36, local: 'caries36', text: 'Кариозная полость' }],
      },
      {
        title: 'Пломба',
        text: 'Врач под микроскопом убирает поражённые ткани и слой за слоем восстанавливает форму зуба светоотверждаемым композитом. Пломбу не отличить от эмали.',
        build: (A) => {
          const s = lowerMolar(36);
          T(s, 36).fill = A.fill36;
          return s;
        },
        view: { cam: 'occlusal', fdi: 36, dist: 84 },
        labels: [{ fdi: 36, local: 'caries36', text: 'Композитная пломба' }],
      },
    ],
  },

  {
    id: 'pulpitis',
    title: 'Пульпит',
    hint: 'Лечение каналов',
    service: 'Лечение / терапия',
    stages: [
      {
        title: 'Глубокий кариес',
        text: 'Кариес подобрался к пульпе — сосудисто-нервному пучку зуба. Между полостью и нервом остался тонкий слой дентина.',
        build: (A) => {
          const s = lowerMolar(46);
          T(s, 46).lesions = [A.lesion46deep];
          T(s, 46).variant = 'cav95';
          return s;
        },
        view: { cam: 'occlusal', fdi: 46, dist: 84 },
        labels: [{ fdi: 46, local: 'caries46', text: 'Глубокая полость' }],
      },
      {
        title: 'Воспаление нерва',
        text: 'Бактерии проникают в пульпу, и она воспаляется. Возникает сильная самопроизвольная боль: усиливается ночью, отдаёт в ухо или висок.',
        build: (A, D) => {
          const s = pulpXray();
          T(s, 46).lesions = [A.lesion46deep];
          T(s, 46).variant = 'cav95';
          T(s, 46).pulp = { inflam: 1, level: -D.L6.L };
          s.extras.push({ id: 'pain', type: 'pain', fdi: 46, amount: 1 });
          return s;
        },
        view: { cam: 'buccal', fdi: 46, dist: 64 },
        labels: [{ fdi: 46, local: [0, -3, 0], text: 'Воспалённая пульпа' }],
      },
      {
        title: 'Лечение каналов',
        text: 'Под анестезией врач удаляет воспалённую пульпу, расширяет и промывает каналы, а затем герметично пломбирует их гуттаперчей.',
        build: (A) => {
          const s = pulpXray();
          T(s, 46).fill = A.fill46;
          T(s, 46).pulp = { filled: 1 };
          return s;
        },
        view: { cam: 'buccal', fdi: 46, dist: 64 },
        labels: [{ fdi: 46, local: [0, -4, 0], text: 'Запломбированные каналы' }],
      },
      {
        title: 'Зуб сохранён',
        text: 'Коронку восстанавливают пломбой или керамической вкладкой. Зуб продолжает служить, удалять его не нужно.',
        build: (A) => {
          const s = lowerMolar(46);
          T(s, 46).fill = A.fill46;
          return s;
        },
        view: { cam: 'occlusal', fdi: 46, dist: 84 },
      },
    ],
  },

  {
    id: 'implant',
    title: 'Имплантация',
    hint: 'Новый зуб на импланте',
    service: 'Имплантация',
    stages: [
      {
        title: 'Зуба нет',
        text: 'Без зуба кость на его месте не получает нагрузки и постепенно убывает, а соседние зубы начинают наклоняться в промежуток.',
        build: () => {
          const s = { ...baseState(), mouth: 0.3, jawVariant: { L: 'missing36' } };
          T(s, 36).missing = true;
          return s;
        },
        view: { cam: 'buccal', fdi: 36, dist: 78 },
      },
      {
        title: 'Установка импланта',
        text: 'В кость устанавливают титановый имплант — искусственный корень. За 2–4 месяца он прочно срастается с костью.',
        build: () => {
          const s = { ...baseState(), view: 'xray', mouth: 0.3, hideJaw: 'U', jawVariant: { L: 'missing36' } };
          T(s, 36).missing = true;
          s.extras.push({ id: 'implant', type: 'implant', fdi: 36 });
          return s;
        },
        view: { cam: 'buccal', fdi: 36, dist: 80 },
        labels: [{ fdi: 36, local: [0, -6, 0], text: 'Титановый имплант' }],
      },
      {
        title: 'Коронка на импланте',
        text: 'На имплант фиксируют абатмент и керамическую коронку. Новый зуб выглядит и работает как свой, а соседние зубы обтачивать не нужно.',
        build: () => {
          const s = { ...baseState(), mouth: 0.3, focus: 36 };
          T(s, 36).variant = 'crown';
          s.extras.push({ id: 'implant', type: 'implant', fdi: 36 });
          return s;
        },
        view: { cam: 'buccal', fdi: 36, dist: 72 },
        labels: [{ fdi: 36, local: [0, 6.5, 3], text: 'Керамическая коронка' }],
      },
    ],
  },

  {
    id: 'hygiene',
    title: 'Профгигиена',
    hint: 'Налёт и здоровье дёсен',
    service: 'Профгигиена',
    stages: [
      {
        title: 'Зубной налёт',
        text: 'Без тщательной чистки мягкий налёт скапливается у шеек зубов уже за 1–2 дня — там, куда щётка не достаёт.',
        build: () => {
          const s = smile();
          for (const f of ANT_L) T(s, f).plaque = 0.95;
          for (const f of [34, 44, 35, 45]) T(s, f).plaque = 0.6;
          for (const f of ANT_U) T(s, f).plaque = 0.45;
          return s;
        },
        view: smileView(105),
        labels: [{ fdi: 41, local: [0, 1.6, 2.6], text: 'Налёт у шейки зуба' }],
      },
      {
        title: 'Воспаление десны',
        text: 'Бактерии налёта раздражают десну: она краснеет, отекает и кровоточит при чистке. Это гингивит — ранний и полностью обратимый этап.',
        build: (A) => {
          const s = smile();
          for (const f of ANT_L) T(s, f).plaque = 1;
          for (const f of ANT_U) T(s, f).plaque = 0.5;
          s.gumFx = { infl: { jaw: 'L', center: A.frontLowerCenter, radius: 24, amt: 1 }, bleed: 1 };
          s.extras.push({ id: 'drops', type: 'drops' });
          return s;
        },
        view: smileView(80),
        labels: [{ fdi: 31, local: [-2.6, 1.8, 3.2], text: 'Кровоточивость' }],
      },
      {
        title: 'После чистки',
        text: 'Ультразвук и Air Flow убирают налёт и камень даже из труднодоступных мест. Через несколько дней десна снова становится бледно-розовой.',
        build: () => smile(),
        view: smileView(95),
      },
    ],
  },

  {
    id: 'whitening',
    title: 'Отбеливание',
    hint: 'До 8 тонов за визит',
    service: 'Отбеливание',
    stages: [
      {
        title: 'Потемневшая эмаль',
        text: 'Кофе, чай, табак и возраст постепенно окрашивают эмаль. Зубы теряют белизну, даже когда они совершенно здоровы.',
        build: () => {
          const s = smile();
          for (const f of ALL) T(s, f).shade = 0.85;
          for (const f of SMILE) T(s, f).stain = 0.35;
          return s;
        },
        view: smileView(110),
      },
      {
        title: 'Процедура ZOOM 4',
        text: 'На эмаль наносят отбеливающий гель и активируют его холодным светом лампы. Десну на время процедуры надёжно изолируют.',
        build: () => {
          const s = smile();
          for (const f of ALL) T(s, f).shade = 0.35;
          for (const f of SMILE) T(s, f).glow = 0.7;
          return s;
        },
        view: smileView(98),
      },
      {
        title: 'Результат',
        text: 'За один визит зубы светлеют до 8 тонов. Врач подскажет, как ухаживать за эмалью, чтобы эффект держался дольше.',
        build: () => {
          const s = smile();
          for (const f of ALL) T(s, f).shade = -1;
          return s;
        },
        view: smileView(104),
      },
    ],
  },
];

export const STAGE_MS = 6500;
