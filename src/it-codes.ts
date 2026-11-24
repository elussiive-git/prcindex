// Перечень видов ИТ-деятельности Минцифры (приказ от 11.05.2023 № 449) и широкие сегменты исследования.
// Совпадает с таблицей public.it_activity_codes (миграция 0004).

export type ItCode = { code: string; title: string; segment: string };

export const SEGMENTS = [
  "Разработка ПО, информационных систем и сайтов",
  "Продажа и лицензирование ПО",
  "Автоматизация и цифровизация",
  "Инфраструктура, облака, ЦОД, хостинг",
  "Информационная безопасность",
  "Данные и искусственный интеллект",
  "Интернет-сервисы и платформы",
  "Финтех и электронный документооборот",
  "Электроника, оборудование, робототехника",
  "Видеоигры",
  "Научные исследования",
] as const;

const [DEV, SALES, AUTO, INFRA, SEC, DATA, WEB, FIN, HW, GAMES, SCI] = SEGMENTS;

export const IT_CODES: ItCode[] = [
  { code: "1.01", title: "Разработка, внедрение и обслуживание ПО, баз данных и интерфейсов", segment: DEV },
  { code: "1.02", title: "ПАК, электронная компонентная база и электронная продукция", segment: HW },
  { code: "1.03", title: "Робототехника, сенсорика и системы управления", segment: HW },
  { code: "1.04", title: "Информационные системы, в т. ч. на распределённом реестре", segment: DEV },
  { code: "1.05", title: "Сайты и страницы сайтов", segment: DEV },
  { code: "1.06", title: "ИТ-инфраструктура, ЦОД, облака, ситуационные центры", segment: INFRA },
  { code: "1.07", title: "2D/3D-модели, визуализации, BIM, цифровые копии", segment: DEV },
  { code: "1.08", title: "Средства защиты информации и криптографии", segment: SEC },
  { code: "1.09", title: "Оборудование связи и средства для ОРМ", segment: HW },
  { code: "2.01", title: "Продажа, лицензирование, аренда ПО и СЗИ, удалённый доступ", segment: SALES },
  { code: "3.01", title: "Базы данных и информационные ресурсы", segment: DATA },
  { code: "4.01", title: "Комплексное обслуживание ИТ-инфраструктуры", segment: INFRA },
  { code: "5.01", title: "Хостинг, потоковая передача данных", segment: INFRA },
  { code: "6.01", title: "Операторы ЦОД и облачной инфраструктуры", segment: INFRA },
  { code: "7.01", title: "Регистрация доменных имён", segment: INFRA },
  { code: "8.01", title: "Проекты автоматизации и цифровизации", segment: AUTO },
  { code: "9.01", title: "Интернет-порталы и поисковые системы", segment: WEB },
  { code: "10.01", title: "Нейросети, распознавание изображений, видео, текста и речи", segment: DATA },
  { code: "11.01", title: "Информационная безопасность, тестирование защищённости", segment: SEC },
  { code: "11.02", title: "Монтаж и ремонт средств защиты информации", segment: SEC },
  { code: "11.03", title: "Установка защищённых криптографических систем", segment: SEC },
  { code: "11.04", title: "Обслуживание криптографических средств", segment: SEC },
  { code: "11.05", title: "Аттестация по защите информации", segment: SEC },
  { code: "12.01", title: "Интернет-реклама", segment: WEB },
  { code: "13.01", title: "Аудиовизуальные произведения и онлайн-сервисы", segment: WEB },
  { code: "14.01", title: "Доступ к фонограммам", segment: WEB },
  { code: "15.01", title: "Размещение и продвижение предложений и объявлений", segment: WEB },
  { code: "15.02", title: "Покупка товаров через интернет", segment: WEB },
  { code: "16.01", title: "Электронное образование и электронные книги", segment: WEB },
  { code: "17.01", title: "Информационные и графические материалы", segment: WEB },
  { code: "18.01", title: "Электронный документооборот, ЭП, отчётность", segment: FIN },
  { code: "19.01", title: "Оператор фискальных данных", segment: FIN },
  { code: "20.01", title: "Обслуживание участников расчётов и платёжных систем", segment: FIN },
  { code: "21.01", title: "Удостоверяющий центр", segment: SEC },
  { code: "22.01", title: "Видеоигры", segment: GAMES },
  { code: "23.01", title: "Сервисы пассажирских перевозок", segment: WEB },
  { code: "24.01", title: "Сервисы общепита", segment: WEB },
  { code: "25.01", title: "Краткосрочная аренда транспорта", segment: WEB },
  { code: "26.01", title: "Обработка, обезличивание и верификация информации", segment: DATA },
  { code: "27.01", title: "Торговля и аренда ИТ-оборудования", segment: HW },
  { code: "28.01", title: "Ремонт и обслуживание ПАК и ИТ-оборудования", segment: HW },
  { code: "28.02", title: "Ремонт компьютеров, терминалов, банкоматов", segment: HW },
  { code: "29.01", title: "Научные исследования", segment: SCI },
];

const byCode = new Map(IT_CODES.map((x) => [x.code, x]));
export const codeInfo = (code: string) => byCode.get(code);

/** Основной сегмент: где больше всего кодов компании; при равенстве — сегмент первого указанного кода. */
export function primarySegment(codes: string[]): string | null {
  const known = codes.filter((c) => byCode.has(c));
  if (!known.length) return null;
  const counts = new Map<string, number>();
  for (const c of known) {
    const s = byCode.get(c)!.segment;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const max = Math.max(...counts.values());
  for (const c of known) {
    const s = byCode.get(c)!.segment;
    if (counts.get(s) === max) return s;
  }
  return null;
}
