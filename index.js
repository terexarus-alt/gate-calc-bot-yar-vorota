// ============================================
// КАЛЬКУЛЯТОР ВОРОТ - МАКСИМАЛЬНО ПРОСТОЙ
// ============================================

const TelegramBot = require('node-telegram-bot-api');

// Получаем токен из переменных окружения
const token = process.env.TELEGRAM_TOKEN || 'ВАШ_ТОКЕН';
const bot = new TelegramBot(token, { polling: true });

console.log('✅ Бот запущен!');

// Хранилище пользователей
const users = {};

// Главное меню
const mainKeyboard = {
  reply_markup: {
    keyboard: [['📏 Рассчитать стоимость']],
    resize_keyboard: true
  }
};

// Шаг 1: Знает ли размеры
const sizeKeyboard = {
  reply_markup: {
    keyboard: [
      ['✅ Да, знаю размеры'],
      ['📞 Вызвать замерщика'],
      ['🔁 Начать сначала']
    ],
    resize_keyboard: true
  }
};

// Шаг 2: Автоматика
const autoKeyboard = {
  reply_markup: {
    keyboard: [
      ['✅ Да, с пультом'],
      ['❌ Нет, без автоматики'],
      ['🔁 Начать сначала']
    ],
    resize_keyboard: true
  }
};

// Шаг 3: Установка
const installKeyboard = {
  reply_markup: {
    keyboard: [
      ['✅ Установка под ключ'],
      ['❌ Установлю сам'],
      ['🔁 Начать сначала']
    ],
    resize_keyboard: true
  }
};

// ============================================
// НАЧАЛО
// ============================================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  users[chatId] = { step: 'start' };
  
  bot.sendMessage(
    chatId,
    '🏭 *Калькулятор секционных ворот*\n\n' +
    'Рассчитайте стоимость за 1 минуту!\n\n' +
    '👇 Нажмите кнопку ниже:',
    { parse_mode: 'Markdown', ...mainKeyboard }
  );
});

// ============================================
// ОБРАБОТКА ВСЕХ СООБЩЕНИЙ
// ============================================
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Если нет данных пользователя - создаем
  if (!users[chatId]) {
    users[chatId] = { step: 'start' };
  }
  
  const user = users[chatId];
  
  // Кнопка "Начать сначала" работает всегда
  if (text === '🔁 Начать сначала') {
    users[chatId] = { step: 'start' };
    bot.sendMessage(chatId, '📏 Рассчитать стоимость?', mainKeyboard);
    return;
  }
  
  // Главная кнопка
  if (text === '📏 Рассчитать стоимость') {
    user.step = 'ask_knows_sizes';
    bot.sendMessage(
      chatId,
      '📏 *Вам известны размеры проёма?*',
      { parse_mode: 'Markdown', ...sizeKeyboard }
    );
    return;
  }
  
  // Шаг 1: Знает ли размеры
  if (user.step === 'ask_knows_sizes') {
    if (text === '✅ Да, знаю размеры') {
      user.step = 'ask_width';
      bot.sendMessage(
        chatId,
        '📏 *Введите ширину проёма (мм):*\nНапример: 3000',
        { parse_mode: 'Markdown' }
      );
    } else if (text === '📞 Вызвать замерщика') {
      bot.sendMessage(
        chatId,
        '👷 *Бесплатный выезд замерщика!*\n\n' +
        '📞 Позвоните: 8 (923) 811-54-32\n\n' +
        'Или напишите менеджеру: @gate_manager',
        { parse_mode: 'Markdown' }
      );
      user.step = 'start';
    }
    return;
  }
  
  // Шаг 2: Ввод ширины
  if (user.step === 'ask_width') {
    const width = parseInt(text);
    if (isNaN(width) || width < 2000 || width > 6000) {
      bot.sendMessage(chatId, '❌ Введите число от 2000 до 6000 мм');
      return;
    }
    
    user.width = width;
    user.step = 'ask_height';
    
    bot.sendMessage(
      chatId,
      `✅ Ширина: ${width} мм\n\n📏 *Введите высоту проёма (мм):*\nНапример: 2500`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // Шаг 3: Ввод высоты
  if (user.step === 'ask_height') {
    const height = parseInt(text);
    if (isNaN(height) || height < 1800 || height > 3000) {
      bot.sendMessage(chatId, '❌ Введите число от 1800 до 3000 мм');
      return;
    }
    
    user.height = height;
    user.step = 'ask_automation';
    
    bot.sendMessage(
      chatId,
      `✅ Размеры: ${user.width} × ${height} мм\n\n⚙️ *Планируете открывать ворота пультом?*`,
      { parse_mode: 'Markdown', ...autoKeyboard }
    );
    return;
  }
  
  // Шаг 4: Автоматика
  if (user.step === 'ask_automation') {
    if (text === '✅ Да, с пультом') {
      user.automation = true;
      user.step = 'ask_installation';
      
      bot.sendMessage(
        chatId,
        '🏗️ *Нужна ли установка ворот?*',
        { parse_mode: 'Markdown', ...installKeyboard }
      );
    } else if (text === '❌ Нет, без автоматики') {
      user.automation = false;
      user.step = 'ask_installation';
      
      bot.sendMessage(
        chatId,
        '🏗️ *Нужна ли установка ворот?*',
        { parse_mode: 'Markdown', ...installKeyboard }
      );
    }
    return;
  }
  
  // Шаг 5: Установка - КЛЮЧЕВОЙ ШАГ!
  if (user.step === 'ask_installation') {
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

// ============================================
// ПОКАЗ РЕЗУЛЬТАТА
// ============================================
function showResult(chatId, user) {
  // Расчет стоимости
  const area = (user.width / 1000) * (user.height / 1000);
  let price = area * 18000; // 18000 руб за м²
  
  if (user.automation) price += 45000; // Автоматика
  if (user.installation) price += 25000; // Установка
  
  // Скидка
  let discount = 0;
  if (price > 200000) discount = 0.10;
  else if (price > 150000) discount = 0.07;
  else if (price > 100000) discount = 0.05;
  
  const finalPrice = Math.round(price * (1 - discount));
  
  // Формируем сообщение
  const message = 
    `✅ *Расчет готов!*\n\n` +
    `📋 *Параметры:*\n` +
    `• Ширина: ${user.width} мм\n` +
    `• Высота: ${user.height} мм\n` +
    `• Автоматика: ${user.automation ? 'Да' : 'Нет'}\n` +
    `• Установка: ${user.installation ? 'Под ключ' : 'Сам'}\n\n` +
    `💰 *Итого: ~${finalPrice.toLocaleString('ru-RU')} ₽*`;
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💰 Точный расчет', callback_data: 'exact' },
          { text: '💬 Менеджер', url: 'https://t.me/gate_manager' }
        ],
        [
          { text: '📞 Позвонить', callback_data: 'call' },
          { text: '🔁 Новый расчет', callback_data: 'new' }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...keyboard });
  
  // Очищаем данные пользователя
  users[chatId] = { step: 'start' };
}

// ============================================
// ИНЛАЙН-КНОПКИ
// ============================================
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  
  if (data === 'exact') {
    bot.sendMessage(
      chatId,
      '📞 Для точного расчета позвоните:\n8 (923) 811-54-32\n\n' +
      'Или напишите менеджеру: @gate_manager'
    );
  } else if (data === 'call') {
    bot.sendMessage(chatId, '📞 Телефон: 8 (923) 811-54-32');
  } else if (data === 'new') {
    users[chatId] = { step: 'start' };
    bot.sendMessage(chatId, '📏 Рассчитать стоимость?', mainKeyboard);
  }
  
  bot.answerCallbackQuery(callbackQuery.id);
});

// ============================================
// ОБРАБОТКА ОШИБОК
// ============================================
bot.on('polling_error', (error) => {
  console.log('Ошибка:', error.message);
});

console.log('🤖 Бот готов принимать сообщения!');
