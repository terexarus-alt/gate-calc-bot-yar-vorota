const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_TOKEN || 'ВАШ_ТОКЕН';
const bot = new TelegramBot(token, { polling: true });

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || 'ВАШ_CHAT_ID';

console.log('🚀 Бот запущен с кнопкой телефона!');

// ХРАНИЛИЩЕ
const users = {};
const waitingForPhone = {};

// КЛАВИАТУРЫ
const mainKeyboard = {
  reply_markup: {
    keyboard: [['🚀 Начать расчет']],
    resize_keyboard: true
  }
};

const knowsSizeKeyboard = {
  reply_markup: {
    keyboard: [
      ['✅ Знаю размеры'],
      ['📞 Вызвать замерщика'],
      ['🔄 Сначала']
    ],
    resize_keyboard: true
  }
};

const automationKeyboard = {
  reply_markup: {
    keyboard: [
      ['✅ С пультом'],
      ['❌ Без автоматики'],
      ['🔄 Сначала']
    ],
    resize_keyboard: true
  }
};

const installationKeyboard = {
  reply_markup: {
    keyboard: [
      ['✅ Установка под ключ'],
      ['❌ Установлю сам'],
      ['🔄 Сначала']
    ],
    resize_keyboard: true
  }
};

// ⚠️ НОВАЯ КЛАВИАТУРА ДЛЯ ТЕЛЕФОНА!
const phoneKeyboard = {
  reply_markup: {
    keyboard: [
      ['📱 Отправить телефон'],
      ['🔄 Сначала']
    ],
    resize_keyboard: true
  }
};

// START
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  users[chatId] = { step: 'start' };
  delete waitingForPhone[chatId];
  
  bot.sendMessage(chatId, 
    '🏭 *Калькулятор секционных ворот*\n\nРассчитайте стоимость за 1 минуту!',
    { parse_mode: 'Markdown', ...mainKeyboard }
  );
});

// ВСЕ СООБЩЕНИЯ
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  
  console.log(`📨 ${chatId}: "${text}" | Шаг: ${users[chatId]?.step || 'нет'} | Жду тел: ${waitingForPhone[chatId] ? 'ДА' : 'НЕТ'}`);
  
  // ЕСЛИ ЖДЕМ ТЕЛЕФОН
  if (waitingForPhone[chatId]) {
    console.log(`📱 ПРИНЯЛ ТЕЛЕФОН: ${text}`);
    await processPhone(chatId, text, msg.from);
    return;
  }
  
  // ИНИЦИАЛИЗАЦИЯ
  if (!users[chatId]) {
    users[chatId] = { step: 'start' };
  }
  
  const user = users[chatId];
  
  // КНОПКА "СНАЧАЛА"
  if (text === '🔄 Сначала') {
    users[chatId] = { step: 'start' };
    delete waitingForPhone[chatId];
    bot.sendMessage(chatId, '🚀 Начать расчет?', mainKeyboard);
    return;
  }
  
  // КНОПКА "ОТПРАВИТЬ ТЕЛЕФОН"
  if (text === '📱 Отправить телефон') {
    if (user.step === 'showResult' && user.orderData) {
      // Показываем инструкцию
      bot.sendMessage(chatId,
        `📞 *Введите номер телефона:*\n\n` +
        `Просто напишите номер в любом формате:\n` +
        `• 89246345577\n` +
        `• +7 924 634-55-77\n` +
        `• 8-924-634-55-77\n\n` +
        `Или нажмите "🔄 Сначала"`,
        { parse_mode: 'Markdown' }
      );
      waitingForPhone[chatId] = true;
      console.log(`✅ УСТАНОВЛЕН waitingForPhone[${chatId}] после кнопки`);
      return;
    } else {
      bot.sendMessage(chatId, '❌ Сначала выполните расчет!', mainKeyboard);
      return;
    }
  }
  
  // НАЧАТЬ РАСЧЕТ
  if (text === '🚀 Начать расчет' || user.step === 'start') {
    user.step = 'askSize';
    bot.sendMessage(chatId, '📏 *Вам известны размеры проёма?*', 
      { parse_mode: 'Markdown', ...knowsSizeKeyboard }
    );
    return;
  }
  
  // ЗНАЕТ РАЗМЕРЫ
  if (user.step === 'askSize') {
    if (text === '✅ Знаю размеры') {
      user.step = 'askWidth';
      bot.sendMessage(chatId, '📏 *Введите ширину (мм):*\nПример: 3000', 
        { parse_mode: 'Markdown' }
      );
    } else if (text === '📞 Вызвать замерщика') {
      bot.sendMessage(chatId, '👷 *Бесплатный выезд замерщика!*\n\n📞 8 (923) 811-54-32\n💬 @systema365',
        { parse_mode: 'Markdown' }
      );
      user.step = 'start';
    }
    return;
  }
  
  // ШИРИНА
  if (user.step === 'askWidth') {
    const width = parseInt(text);
    if (isNaN(width) || width < 2000 || width > 6000) {
      bot.sendMessage(chatId, '❌ Введите число 2000-6000 мм');
      return;
    }
    user.width = width;
    user.step = 'askHeight';
    bot.sendMessage(chatId, `✅ Ширина: ${width} мм\n\n📏 *Введите высоту (мм):*\nПример: 2500`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // ВЫСОТА
  if (user.step === 'askHeight') {
    const height = parseInt(text);
    if (isNaN(height) || height < 1800 || height > 3000) {
      bot.sendMessage(chatId, '❌ Введите число 1800-3000 мм');
      return;
    }
    user.height = height;
    user.step = 'askAutomation';
    bot.sendMessage(chatId, `✅ Размеры: ${user.width} × ${height} мм\n\n⚙️ *Открывать пультом?*`,
      { parse_mode: 'Markdown', ...automationKeyboard }
    );
    return;
  }
  
  // АВТОМАТИКА
  if (user.step === 'askAutomation') {
    if (text === '✅ С пультом') {
      user.automation = true;
      user.step = 'askInstallation';
      bot.sendMessage(chatId, '🏗️ *Нужна установка?*',
        { parse_mode: 'Markdown', ...installationKeyboard }
      );
    } else if (text === '❌ Без автоматики') {
      user.automation = false;
      user.step = 'askInstallation';
      bot.sendMessage(chatId, '🏗️ *Нужна установка?*',
        { parse_mode: 'Markdown', ...installationKeyboard }
      );
    }
    return;
  }
  
  // УСТАНОВКА
  if (user.step === 'askInstallation') {
    if (text === '✅ Установка под ключ' || text === '❌ Установлю сам') {
      user.installation = text === '✅ Установка под ключ';
      await showResult(chatId, user);
    }
    return;
  }
});

// ФУНКЦИЯ ПОКАЗА РЕЗУЛЬТАТА
async function showResult(chatId, user) {
  console.log(`🧮 РАСЧЕТ ДЛЯ ${chatId}: ${user.width}x${user.height}`);
  
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
  
  const finalPrice = Math.round(price * (1 - discount));
  
  // Сохраняем данные
  user.orderData = {
    width: user.width,
    height: user.height,
    automation: user.automation,
    installation: user.installation,
    finalPrice,
    area: area.toFixed(2)
  };
  
  user.step = 'showResult';
  
  // Показываем результат С КНОПКОЙ ТЕЛЕФОНА
  const message = 
    `✅ *Предварительный расчет готов!*\n\n` +
    `📋 *Параметры заказа:*\n` +
    `• Ширина: ${user.width} мм\n` +
    `• Высота: ${user.height} мм\n` +
    `• Автоматика: ${user.automation ? 'Да' : 'Нет'}\n` +
    `• Установка: ${user.installation ? 'Под ключ' : 'Сам'}\n\n` +
    `💰 *Примерная стоимость: ~${finalPrice.toLocaleString('ru-RU')} ₽*\n\n` +
    `📝 *Точную стоимость со всеми скидками укажет менеджер!*\n\n` +
    `👇 *Чтобы получить консультацию, отправьте номер телефона:*`;
  
  await bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown',
    ...phoneKeyboard  // ⚠️ КНОПКА "ОТПРАВИТЬ ТЕЛЕФОН"
  });
  
  console.log(`✅ Показан результат для ${chatId}, жду кнопку телефона`);
}

// ОБРАБОТКА ТЕЛЕФОНА
async function processPhone(chatId, phone, userInfo) {
  console.log(`📞 ОБРАБОТКА ТЕЛЕФОНА ОТ ${chatId}: ${phone}`);
  
  // Снимаем флаг
  delete waitingForPhone[chatId];
  
  const user = users[chatId];
  const order = user?.orderData;
  const requestId = 'REQ-' + Date.now().toString().slice(-6);
  
  if (!order) {
    console.log(`❌ НЕТ ДАННЫХ ЗАКАЗА ДЛЯ ${chatId}`);
    bot.sendMessage(chatId, '❌ Ошибка. Начните заново: /start');
    return;
  }
  
  // 1. Подтверждение клиенту
  const confirmMsg = 
    `📨 *Спасибо! Ваша заявка #${requestId} принята!*\n\n` +
    `✅ Ваш номер: ${phone}\n` +
    `⏱️ *Менеджер @systema365 свяжется в течение 15 минут*\n\n` +
    `📞 *Также вы можете позвонить:*\n` +
    `8 (923) 811-54-32\n\n` +
    `👇 *Быстрая связь:*`;
  
  await bot.sendMessage(chatId, confirmMsg, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💬 Написать менеджеру', url: 'https://t.me/systema365' },
          { text: '📞 Позвонить', url: 'tel:89238115432' }
        ],
        [
          { text: '🔄 Новый расчет', callback_data: 'new_calc' }
        ]
      ]
    }
  });
  
  console.log(`✅ Клиенту ${chatId} отправлено подтверждение`);
  
  // 2. Отправка менеджеру
  if (ADMIN_CHAT_ID && ADMIN_CHAT_ID !== 'ВАШ_CHAT_ID') {
    try {
      const adminMessage = 
        `🔥 *НОВАЯ ЗАЯВКА НА РАСЧЕТ #${requestId}*\n\n` +
        `👤 *Клиент:* ${userInfo.first_name}${userInfo.last_name ? ' ' + userInfo.last_name : ''}\n` +
        `👤 Username: @${userInfo.username || 'нет'}\n` +
        `🆔 ID: ${chatId}\n` +
        `📱 *Телефон:* ${phone}\n` +
        `📅 Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
        `📏 *ПОЛНЫЕ ПАРАМЕТРЫ:*\n` +
        `• Ширина: ${order.width} мм\n` +
        `• Высота: ${order.height} мм\n` +
        `• Автоматика: ${order.automation ? '✅ Да' : '❌ Нет'}\n` +
        `• Установка: ${order.installation ? '✅ Под ключ' : '❌ Сам'}\n` +
        `• Площадь: ${order.area} м²\n` +
        `💰 *Примерная стоимость:* ~${order.finalPrice.toLocaleString('ru-RU')} ₽\n\n` +
        `💬 *Для ответа клиенту ответьте на это сообщение*`;
      
      await bot.sendMessage(ADMIN_CHAT_ID, adminMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '📞 Позвонить клиенту', url: `tel:${phone.replace(/\D/g, '')}` }
          ]]
        }
      });
      
      console.log(`✅ Заявка #${requestId} отправлена менеджеру ${ADMIN_CHAT_ID}`);
      
    } catch (error) {
      console.error('❌ Ошибка отправки менеджеру:', error.message);
    }
  } else {
    console.log('⚠️ ADMIN_CHAT_ID не настроен');
  }
  
  // Сбрасываем пользователя
  users[chatId] = { step: 'start' };
}

// ИНЛАЙН КНОПКИ
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  
  if (query.data === 'new_calc') {
    users[chatId] = { step: 'start' };
    delete waitingForPhone[chatId];
    bot.sendMessage(chatId, '🚀 Начать новый расчет?', mainKeyboard);
  }
  
  bot.answerCallbackQuery(query.id);
});

// DEBUG КОМАНДЫ
bot.onText(/\/debug/, (msg) => {
  const chatId = msg.chat.id;
  const user = users[chatId] || {};
  
  const debugMsg = 
    `🔧 *ДЕБАГ*\n\n` +
    `🆔 Chat ID: ${chatId}\n` +
    `📊 Шаг: ${user.step || 'нет'}\n` +
    `📱 Жду телефон: ${waitingForPhone[chatId] ? '✅ ДА' : '❌ НЕТ'}\n` +
    `📏 Размеры: ${user.width || '?'}x${user.height || '?'}\n` +
    `💰 Заказ: ${user.orderData ? '✅ есть' : '❌ нет'}\n` +
    `👑 Админ ID: ${ADMIN_CHAT_ID || 'не настроен'}`;
  
  bot.sendMessage(chatId, debugMsg, { parse_mode: 'Markdown' });
});

bot.onText(/\/test/, (msg) => {
  const chatId = msg.chat.id;
  
  // Создаем тестовые данные
  users[chatId] = {
    step: 'showResult',
    width: 3000,
    height: 2500,
    automation: true,
    installation: true,
    orderData: {
      width: 3000,
      height: 2500,
      automation: true,
      installation: true,
      finalPrice: 146475,
      area: '7.50'
    }
  };
  
  bot.sendMessage(chatId,
    `✅ ТЕСТОВЫЙ РАСЧЕТ!\n\n` +
    `📏 Размеры: 3000x2500\n` +
    `⚙️ Автоматика: Да\n` +
    `🏗️ Установка: Под ключ\n` +
    `💰 Стоимость: ~146 475 ₽\n\n` +
    `📱 Нажмите кнопку "Отправить телефон"`,
    { parse_mode: 'Markdown', ...phoneKeyboard }
  );
});

console.log('==================================');
console.log('🤖 БОТ С КНОПКОЙ ТЕЛЕФОНА ЗАПУЩЕН');
console.log('📞 Телефон: 8 (923) 811-54-32');
console.log('💬 Менеджер: @systema365');
console.log('🔧 Команды: /debug, /test');
console.log('==================================');
