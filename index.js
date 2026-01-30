// =========== НАСТРОЙКИ ===========
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_TOKEN || 'ВАШ_ТОКЕН';
const bot = new TelegramBot(token, { polling: true });
console.log('Бот запущен!');

// =========== ХРАНИЛИЩЕ ===========
let users = {};

// =========== КНОПКИ ===========
const keyboards = {
  start: {
    reply_markup: { keyboard: [['🚀 Начать расчет']], resize_keyboard: true }
  },
  knowsSize: {
    reply_markup: {
      keyboard: [
        ['✅ Знаю размеры'],
        ['📞 Вызвать замерщика'],
        ['🔄 Сначала']
      ],
      resize_keyboard: true
    }
  },
  automation: {
    reply_markup: {
      keyboard: [
        ['✅ С пультом'],
        ['❌ Без автоматики'],
        ['🔄 Сначала']
      ],
      resize_keyboard: true
    }
  },
  installation: {
    reply_markup: {
      keyboard: [
        ['✅ Установка под ключ'],
        ['❌ Установлю сам'],
        ['🔄 Сначала']
      ],
      resize_keyboard: true
    }
  }
};

// =========== СТАРТ ===========
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  users[chatId] = { step: 'start' };
  
  bot.sendMessage(
    chatId,
    '🏭 Калькулятор секционных ворот\n\n' +
    'Рассчитайте стоимость за 1 минуту!\n\n' +
    '👇 Нажмите кнопку:',
    keyboards.start
  );
});

// =========== ВСЕ СООБЩЕНИЯ ===========
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Создаем пользователя если нет
  if (!users[chatId]) users[chatId] = { step: 'start' };
  
  const user = users[chatId];
  
  // Кнопка "Сначала" всегда работает
  if (text === '🔄 Сначала') {
    users[chatId] = { step: 'start' };
    bot.sendMessage(chatId, '🚀 Начать расчет?', keyboards.start);
    return;
  }
  
  // Главная кнопка
  if (text === '🚀 Начать расчет') {
    user.step = 'askSize';
    bot.sendMessage(
      chatId,
      '📏 Вам известны размеры проёма?',
      keyboards.knowsSize
    );
    return;
  }
  
  // Шаг 1: Знает размеры?
  if (user.step === 'askSize') {
    if (text === '✅ Знаю размеры') {
      user.step = 'askWidth';
      bot.sendMessage(chatId, '📏 Введите ширину (мм):\nПример: 3000');
    } else if (text === '📞 Вызвать замерщика') {
      bot.sendMessage(
        chatId,
        '👷 Бесплатный выезд замерщика!\n\n' +
        '📞 Телефон: 8 (923) 811-54-32\n' +
        '💬 Менеджер: @systema365'
      );
      users[chatId] = { step: 'start' };
    }
    return;
  }
  
  // Шаг 2: Ширина
  if (user.step === 'askWidth') {
    const width = parseInt(text);
    if (isNaN(width) || width < 2000 || width > 6000) {
      bot.sendMessage(chatId, '❌ Введите число 2000-6000 мм');
      return;
    }
    user.width = width;
    user.step = 'askHeight';
    bot.sendMessage(chatId, `✅ Ширина: ${width} мм\n\n📏 Введите высоту (мм):\nПример: 2500`);
    return;
  }
  
  // Шаг 3: Высота
  if (user.step === 'askHeight') {
    const height = parseInt(text);
    if (isNaN(height) || height < 1800 || height > 3000) {
      bot.sendMessage(chatId, '❌ Введите число 1800-3000 мм');
      return;
    }
    user.height = height;
    user.step = 'askAutomation';
    bot.sendMessage(
      chatId,
      `✅ Размеры: ${user.width} × ${height} мм\n\n⚙️ Открывать пультом?`,
      keyboards.automation
    );
    return;
  }
  
  // Шаг 4: Автоматика
  if (user.step === 'askAutomation') {
    if (text === '✅ С пультом') {
      user.automation = true;
      user.step = 'askInstallation';
      bot.sendMessage(chatId, '🏗️ Нужна установка?', keyboards.installation);
    } else if (text === '❌ Без автоматики') {
      user.automation = false;
      user.step = 'askInstallation';
      bot.sendMessage(chatId, '🏗️ Нужна установка?', keyboards.installation);
    }
    return;
  }
  
  // Шаг 5: Установка
  if (user.step === 'askInstallation') {
    if (text === '✅ Установка под ключ') {
      user.installation = true;
      showResult(chatId, user);
    } else if (text === '❌ Установлю сам') {
      user.installation = false;
      showResult(chatId, user);
    }
    return;
  }
});

// =========== РАСЧЕТ И РЕЗУЛЬТАТ ===========
function showResult(chatId, user) {
  // Расчет
  const area = (user.width / 1000) * (user.height / 1000);
  let price = area * 18000;
  if (user.automation) price += 45000;
  if (user.installation) price += 25000;
  
  // Скидка
  let discount = 0;
  if (price > 200000) discount = 0.10;
  else if (price > 150000) discount = 0.07;
  else if (price > 100000) discount = 0.05;
  
  const final = Math.round(price * (1 - discount));
  
  // Сообщение
  const msg = 
    `✅ Расчет готов!\n\n` +
    `📋 Параметры:\n` +
    `• Ширина: ${user.width} мм\n` +
    `• Высота: ${user.height} мм\n` +
    `• Автоматика: ${user.automation ? 'Да' : 'Нет'}\n` +
    `• Установка: ${user.installation ? 'Под ключ' : 'Сам'}\n\n` +
    `💰 Итого: ~${final.toLocaleString('ru-RU')} ₽\n\n` +
    `📞 Для точного расчета:\n` +
    `Телефон: 8 (923) 811-54-32\n` +
    `Менеджер: @systema365`;
  
  // Кнопки под сообщением
  const buttons = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📞 Позвонить', callback_data: 'call' },
          { text: '💬 Менеджер', url: 'https://t.me/systema365' }
        ],
        [
          { text: '🔄 Новый расчет', callback_data: 'new' }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId, msg, buttons);
  
  // Очищаем данные
  users[chatId] = { step: 'start' };
}

// =========== КНОПКИ ПОД СООБЩЕНИЕМ ===========
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  
  if (query.data === 'call') {
    bot.sendMessage(chatId, '📞 8 (923) 811-54-32');
  } else if (query.data === 'new') {
    users[chatId] = { step: 'start' };
    bot.sendMessage(chatId, '🚀 Начать расчет?', keyboards.start);
  }
  
  bot.answerCallbackQuery(query.id);
});

// =========== ОШИБКИ ===========
bot.on('polling_error', (error) => {
  console.log('Ошибка:', error.message);
});
