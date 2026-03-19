// Базовые экспонаты для музея компьютерных технологий РФ

const bcrypt = require('bcryptjs');

// Ссылки на изображения
const images = {
  // Основные изображения экспонатов
  m1: 'https://i.ibb.co/Bnt5H0y/soviet-computer-1.jpg',
  ural: 'https://i.ibb.co/VLq0y5K/soviet-computer-2.jpg',
  mir: 'https://i.ibb.co/n6y0k7X/soviet-computer-3.jpg',
  es: 'https://i.ibb.co/gPqxX0L/soviet-computer-4.jpg',
  kr580: 'https://i.ibb.co/8jQk2rH/soviet-computer-5.jpg',
  micro80: 'https://i.ibb.co/tM0sK7F/soviet-computer-6.jpg',
  radio86: 'https://i.ibb.co/GvqQ0Hx/soviet-computer-7.jpg',
  apogey: 'https://i.ibb.co/Dg8t0hN/soviet-computer-8.jpg',
  elektronika: 'https://i.ibb.co/FxqQ0jL/soviet-computer-9.jpg',
  magic: 'https://i.ibb.co/2kP0b0N/soviet-computer-10.jpg',
  
  // Фоны
  lampBg: 'https://i.ibb.co/7Q0y8kH/background-lamp.jpg',
  paperBg: 'https://i.ibb.co/VWqQ0xL/background-paper.jpg',
  tapeBg: 'https://i.ibb.co/KjQ0y7H/background-tape.jpg',
  punchBg: 'https://i.ibb.co/ngQ0y8J/background-punch.jpg',
  chipBg: 'https://i.ibb.co/QjQ0y7K/background-chip.jpg',
  boardBg: 'https://i.ibb.co/pjQ0y8L/background-board.jpg',
  schoolBg: 'https://i.ibb.co/D9Q0y7M/background-school.jpg',
  ninetiesBg: 'https://i.ibb.co/JjQ0y8N/background-90s.jpg'
};

const seedExhibits = [
  {
    title: "М-1 и МЭСМ",
    year: 1951,
    description: "Первые в континентальной Европе электронно-вычислительные машины. МЭСМ (Малая электронная счетная машина), созданная в Киеве под руководством С.А. Лебедева, и М-1, разработанная в Москве командой И.С. Брука, заложили фундамент советской компьютерной индустрии. Они были огромными, занимали целые комнаты, потребляли много энергии и работали на электронных лампах.",
    media_path: images.m1,
    background_path: images.lampBg,
    status: "approved"
  },
  {
    title: "Урал-1",
    year: 1959,
    description: "Легендарная машина, с которой началась история уральской школы программирования. Это была ламповая ЭВМ первого поколения, предназначенная для решения инженерных и производственных задач. Ее габариты поражают: машина занимала площадь до 80 квадратных метров, но была значительно слабее современного мобильного телефона.",
    media_path: images.ural,
    background_path: images.paperBg,
    status: "approved"
  },
  {
    title: "МИР-1",
    year: 1968,
    description: "«Машина для Инженерных Расчётов». Этот компьютер стал одним из первых в мире, кто был ориентирован на индивидуальную работу пользователя-непрограммиста. МИР-1 имел удобную клавиатуру и позволял вводить задачи на специальном алгоритмическом языке, что делало его предшественником современных персональных компьютеров.",
    media_path: images.mir,
    background_path: images.tapeBg,
    status: "approved"
  },
  {
    title: "ЕС ЭВМ (Ряд-1)",
    year: 1971,
    description: "«Единая система» — это семейство компьютеров, ставших стандартом для крупных предприятий, научных институтов и министерств всего СССР. Они были программно совместимы с американскими машинами IBM System/360, что позволило использовать наработанный западный софт. Это были огромные машинные залы с лентопротяжками и шкафами.",
    media_path: images.es,
    background_path: images.punchBg,
    status: "approved"
  },
  {
    title: "КР580ИК80",
    year: 1975,
    description: "Это не компьютер целиком, а его «сердце» — микропроцессор, советский аналог знаменитого Intel 8080. Он стал основой для тысяч любительских конструкций и множества серийных компьютеров. Его появление позволило энтузиастам по всему СССР собирать свои собственные ПК.",
    media_path: images.kr580,
    background_path: images.chipBg,
    status: "approved"
  },
  {
    title: "Микро-80",
    year: 1982,
    description: "Легендарный компьютер для самостоятельной сборки. Его схема была впервые опубликована в журнале «Радио», что дало старт настоящему движению. Хотя для сборки требовались серьезные навыки пайки и дефицитные детали, он открыл мир программирования для тысяч советских радиолюбителей.",
    media_path: images.micro80,
    background_path: images.boardBg,
    status: "approved"
  },
  {
    title: "Радио-86РК",
    year: 1986,
    description: "Упрощенная и доработанная версия «Микро-80», ставшая самым массовым любительским ПК в СССР. Его схема была опубликована в журнале «Радио» и, в отличие от предшественника, была доступна для повторения тысячам радиолюбителей. На его основе многие советские заводы начали выпуск первых серийных домашних компьютеров.",
    media_path: images.radio86,
    background_path: images.boardBg,
    status: "approved"
  },
  {
    title: "Апогей БК-01",
    year: 1986,
    description: "Один из промышленных клонов «Радио-86РК», выпускавшийся Тульским заводом «БРА». Такие компьютеры, собранные на оборонных предприятиях в рамках конверсии, поставлялись в школы и институты, становясь для многих первым знакомством с вычислительной техникой.",
    media_path: images.apogey,
    background_path: images.schoolBg,
    status: "approved"
  },
  {
    title: "Электроника МС 1504",
    year: 1991,
    description: "Первый и, по сути, единственный серийный советский ноутбук. Выпускался в самом конце существования СССР на минском заводе «Интеграл». Он имел монохромный дисплей, процессор, совместимый с Intel 8086, и работал под управлением MS DOS, что делало его сопоставимым с западными моделями того времени.",
    media_path: images.elektronika,
    background_path: images.ninetiesBg,
    status: "approved"
  },
  {
    title: "ПК Magic",
    year: 1995,
    description: "Один из первых российских персональных компьютеров «народной» сборки. Он олицетворяет эпоху перехода от промышленных монстров к доступным персоналкам и зарождение частного ИТ-бизнеса в России начала 90-х.",
    media_path: images.magic,
    background_path: images.ninetiesBg,
    status: "approved"
  }
];

module.exports = seedExhibits;