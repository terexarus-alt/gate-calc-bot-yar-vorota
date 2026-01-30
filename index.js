const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_TOKEN || 'ВАШ_ТОКЕН';
const bot = new TelegramBot(token, { polling: true });

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || 'ВАШ_CHAT_ID';

console.log('🚀 Бот запущен! Сначала телефон, потом расчет!');

// ХРАНИЛИЩЕ
const userData = {}; // {chatId: {phone, step, width, height, automation, installation}}

// КЛАВИАТУРЫ
const phoneKeyboard = {
  reply_markup: {
    keyboard: [
      ['📱 Поделиться телефоном'],
      ['🔄 Отмена']
    ],
    resize_keyboard: true
  }
};

const knowsSizeKeyboard = {
  reply_markup: {
    keyboard: [
      ['✅ Знаю размеры'],
      ['📞 Вызвать замерщика'],
      ['🔄 Отмена']
    ],
    resize_keyboard: true
  }
};

const automationKeyboard = {
  reply_markup: {
    keyboard: [
      ['✅ С пультом'],
      ['❌ Без автоматики'],
      ['🔄 Отмена']
    ],
    resize_keyboard: true
  }
};

const installationKeyboard = {
  reply_markup: {
    keyboard: [
      ['✅ Установка под ключ'],
      ['❌ Установлю сам'],
      ['🔄 Отмена']
    ],
    resize_keyboard: true
  }
};

const confirmKeyboard = {
  reply_markup: {
    keyboard: [
      ['✅ Отправить заявку'],
      ['🔄 Новый расчет']
    ],
    resize_keyboard: true
  }
};

// =========== START ===========
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userData[chatId] = { step: 'needPhone' };
  
  const welcomeMsg = 
    `🏭 *Калькулятор секционных ворот*\n\n` +
    `📞 *Для начала расчета нам нужен ваш номер телефона*\n\n` +
    `Это нужно чтобы:\n` +
    `✅ Сохранить ваш расчет\n` +
    `✅ Связаться для уточнения деталей\n` +
    `✅ Отправить персональное предложение\n\n` +
    `👇 *Нажмите кнопку ниже чтобы поделиться телефоном:*`;
  
  bot.sendMessage(chatId, welcomeMsg, {
    parse_mode: 'Markdown',
    ...phoneKeyboard
  });
});

// =========== КОНТАКТ (Телефон) ===========
bot.on('contact', (msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;
  
  if (contact.user_id === msg.from.id) {
    // Сохраняем телефон
    userData[chatId] = {
      step: 'askSize',
      phone: contact.phone_number,
      firstName: msg.from.first_name,
      username: msg.from.username
    };
    
    console.log(`✅ Получен телефон от ${chatId}: ${contact.phone_number}`);
    
    bot.sendMessage(chatId,
      `✅ *Отлично! Номер получен: ${contact.phone_number}*\n\n` +
      `📏 *Теперь укажите размеры проема*\n\n` +
      `Вам известны точные размеры?`,
      { parse_mode: 'Markdown', ...knowsSizeKeyboard }
    );
  }
});

// =========== ВСЕ СООБЩЕНИЯ ===========
bot.on('message', (msg) => {
  if (!msg.text || msg.chat.type === 'channel') return;
  
  const chatId = msg.chat.id;
  const text = msg.text;
  
  console.log(`📨 ${chatId}: "${text}" | Шаг: ${userData[chatId]?.step || 'нет'}`);
  
  // Если пользователя нет
  if (!userData[chatId]) {
    userData[chatId] = { step: 'needPhone' };
  }
  
  const user = userData[chatId];
  
  // ОТМЕНА
  if (text === '🔄 Отмена' || text === '🔄 Новый расчет') {
    userData[chatId] = { step: 'needPhone' };
    bot.sendMessage(chatId, '🚀 Начать новый расчет? Отправьте /start');
    return;
  }
  
  // НАЧАЛО - ЗАПРОС ТЕЛЕФОНА
  if (user.step === 'needPhone') {
    if (text === '📱 Поделиться телефоном') {
      bot.sendMessage(chatId,
        `📞 *Поделитесь контактом*\n\n` +
        `Нажмите на кнопку "📎" (скрепка) рядом с полем ввода,\n` +
        `выберите "Контакты" и отправьте свой контакт.\n\n` +
        `Или просто напишите номер вручную:\n` +
        `89246345577`,
        { parse_mode: 'Markdown' }
      );
    } else if (text.match(/^[\d\+\(\)\s-]{5,20}$/)) {
      // Если ввели номер вручную
      user.step = 'askSize';
      user.phone = text;
      user.firstName = msg.from.first_name;
      user.username = msg.from.username;
      
      console.log(`✅ Введен телефон вручную: ${text}`);
      
      bot.sendMessage(chatId,
        `✅ *Отлично! Номер получен: ${text}*\n\n` +
        `📏 *Теперь укажите размеры проема*\n\n` +
        `Вам известны точные размеры?`,
        { parse_mode: 'Markdown', ...knowsSizeKeyboard }
      );
    }
    return;
  }
  
  // ЗНАЕТ РАЗМЕРЫ?
  if (user.step === 'askSize') {
    if (text === '✅ Знаю размеры') {
      user.step = 'askWidth';
      bot.sendMessage(chatId, '📏 *Введите ширину проема (мм):*\nПример: 3000', 
        { parse_mode: 'Markdown' }
      );
    } else if (text === '📞 Вызвать замерщика') {
      sendToManager(chatId, user, 'Запрос на выезд замерщика');
      return;
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
      user.step = 'showResult';
      showResult(chatId, user);
    }
    return;
  }
  
  // ПОДТВЕРЖДЕНИЕ ЗАЯВКИ
  if (user.step === 'showResult') {
    if (text === '✅ Отправить заявку') {
      sendToManager(chatId, user, 'Расчет стоимости');
    }
    return;
  }
});

// =========== ПОКАЗ РЕЗУЛЬТАТА ===========
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
  
  const finalPrice = Math.round(price * (1 - discount));
  
  // Сохраняем
  user.finalPrice = finalPrice;
  user.area = area.toFixed(2);
  
  const message = 
    `✅ *Расчет готов!*\n\n` +
    `📋 *Ваши параметры:*\n` +
    `• Ширина: ${user.width} мм\n` +
    `• Высота: ${user.height} мм\n` +
    `• Автоматика: ${user.automation ? 'Да' : 'Нет'}\n` +
    `• Установка: ${user.installation ? 'Под ключ' : 'Сам'}\n\n` +
    `💰 *Примерная стоимость:*\n` +
    `*~${finalPrice.toLocaleString('ru-RU')} ₽*\n\n` +
    `📞 *Ваш телефон:* ${user.phone}\n\n` +
    `👇 *Отправляем заявку менеджеру?*`;
  
  bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    ...confirmKeyboard
  });
}

// =========== ОТПРАВКА МЕНЕДЖЕРУ ===========
function sendToManager(chatId, user, requestType) {
  const requestId = 'REQ-' + Date.now().toString().slice(-6);
  
  console.log(`📤 Отправляю заявку #${requestId} менеджеру`);
  
  // 1. Подтверждение клиенту
  const confirmMsg = 
    `📨 *Заявка #${requestId} отправлена!*\n\n` +
    `✅ Ваши данные переданы менеджеру\n` +
    `⏱️ *Свяжемся с вами в течение 15 минут*\n\n` +
    `📞 *Для связи также:*\n` +
    `8 (923) 811-54-32\n` +
    `💬 @systema365\n\n` +
    `👇 *Быстрая связь:*`;
  
  bot.sendMessage(chatId, confirmMsg, {
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
  
  // 2. Отправка менеджеру
  if (ADMIN_CHAT_ID && ADMIN_CHAT_ID !== 'ВАШ_CHAT_ID') {
    try {
      let managerMessage = 
        `🔥 *НОВАЯ ЗАЯВКА #${requestId}*\n\n` +
        `👤 *Клиент:* ${user.firstName || 'Не указано'}\n` +
        `👤 Username: @${user.username || 'нет'}\n` +
        `🆔 ID: ${chatId}\n` +
        `📱 *Телефон:* ${user.phone}\n` +
        `📅 Время: ${new Date().toLocaleString('ru-RU')}\n` +
        `📋 *Тип:* ${requestType}\n\n`;
      
      // Если есть расчет
      if (user.width && user.height) {
        managerMessage += 
          `📏 *ПАРАМЕТРЫ РАСЧЕТА:*\n` +
          `• Ширина: ${user.width} мм\n` +
          `• Высота: ${user.height} мм\n` +
          `• Автоматика: ${user.automation ? '✅ Да' : '❌ Нет'}\n` +
          `• Установка: ${user.installation ? '✅ Под ключ' : '❌ Сам'}\n` +
          `• Площадь: ${user.area} м²\n` +
          `💰 *Стоимость:* ~${user.finalPrice.toLocaleString('ru-RU')} ₽\n\n`;
      }
      
      managerMessage += `💬 *Для ответа клиенту ответьте на это сообщение*`;
      
      bot.sendMessage(ADMIN_CHAT_ID, managerMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '📞 Позвонить клиенту', url: `tel:${user.phone.replace(/\D/g, '')}` },
            { text: '💬 Ответить', callback_data: `reply_${chatId}` }
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
  
  // Сбрасываем
  userData[chatId] = { step: 'needPhone' };
}

// =========== ИНЛАЙН КНОПКИ ===========
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  if (data === 'new_calc') {
    userData[chatId] = { step: 'needPhone' };
    bot.sendMessage(chatId, '🚀 Начать новый расчет? Отправьте /start');
  }
  
  bot.answerCallbackQuery(query.id);
});

// =========== DEBUG ===========
bot.onText(/\/debug/, (msg) => {
  const chatId = msg.chat.id;
  const user = userData[chatId] || {};
  
  const debugMsg = 
    `🔧 *ДЕБАГ*\n\n` +
    `🆔 Chat ID: ${chatId}\n` +
    `📊 Шаг: ${user.step || 'нет'}\n` +
    `📱 Телефон: ${user.phone || 'не указан'}\n` +
    `📏 Размеры: ${user.width || '?'}x${user.height || '?'}\n` +
    `👑 Админ ID: ${ADMIN_CHAT_ID || 'не настроен'}`;
  
  bot.sendMessage(chatId, debugMsg, { parse_mode: 'Markdown' });
});

bot.onText(/\/testphone/, (msg) => {
  const chatId = msg.chat.id;
  
  // Тестовый пользователь с телефоном
  userData[chatId] = {
    step: 'askSize',
    phone: '89246345577',
    firstName: 'Тест',
    username: 'testuser'
  };
  
  bot.sendMessage(chatId,
    `✅ ТЕСТ: Телефон установлен: 89246345577\n\n` +
    `📏 Теперь можно начать расчет!\n` +
    `Вам известны размеры проема?`,
    { parse_mode: 'Markdown', ...knowsSizeKeyboard }
  );
});

console.log('==========================================');
console.log('🤖 БОТ "СНАЧАЛА ТЕЛЕФОН" ЗАПУЩЕН');
console.log('📱 Теперь телефон запрашивается ПЕРВЫМ!');
console.log('📞 Менеджер: @systema365 | 8 (923) 811-54-32');
console.log('🔧 Команды: /debug, /testphone');
console.log('==========================================');
