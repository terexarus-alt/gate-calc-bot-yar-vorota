// =========== НАСТРОЙКИ ===========
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_TOKEN || 'ВАШ_ТОКЕН';
const bot = new TelegramBot(token, { 
  polling: true
});

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || 'ВАШ_CHAT_ID';

console.log('✅ Бот запущен!');

// =========== ХРАНИЛИЩЕ ===========
const users = {};
const phoneRequests = {};

// =========== КНОПКИ ===========
const Keyboards = {
  main: {
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

// =========== ОБРАБОТКА /start ===========
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  users[chatId] = { step: 'start' };
  delete phoneRequests[chatId];
  
  bot.sendMessage(
    chatId,
    '🏭 *Калькулятор секционных ворот*\n\nРассчитайте стоимость за 1 минуту!\n👇 Нажмите кнопку:',
    { parse_mode: 'Markdown', ...Keyboards.main }
  );
});

// =========== ГЛАВНЫЙ ОБРАБОТЧИК ===========
bot.on('message', async (msg) => {
  if (!msg.text || msg.chat.type === 'channel') return;
  
  const chatId = msg.chat.id;
  const text = msg.text;
  
  console.log(`📨 От ${chatId}: "${text.substring(0, 30)}...", шаг: ${users[chatId]?.step || 'нет'}`);
  
  // Создаем пользователя если нет
  if (!users[chatId]) {
    users[chatId] = { step: 'start' };
  }
  
  // ====== ВАЖНО: ПРОВЕРКА ТЕЛЕФОНА ПЕРВОЙ! ======
  if (phoneRequests[chatId] && phoneRequests[chatId].waitingPhone) {
    console.log(`📱 Обнаружен телефон от ${chatId}: ${text}`);
    await handlePhoneInput(chatId, text, msg.from);
    return;
  }
  
  // Обработка остальных команд
  await handleRegularMessage(chatId, text, msg);
});

// =========== ОБРАБОТКА ОБЫЧНЫХ СООБЩЕНИЙ ===========
async function handleRegularMessage(chatId, text, msg) {
  const user = users[chatId];
  
  // Кнопка "Сначала"
  if (text === '🔄 Сначала') {
    users[chatId] = { step: 'start' };
    delete phoneRequests[chatId];
    await bot.sendMessage(chatId, '🚀 Начать расчет?', Keyboards.main);
    return;
  }
  
  // Главная кнопка
  if (text === '🚀 Начать расчет') {
    user.step = 'askSize';
    await bot.sendMessage(chatId, '📏 *Вам известны размеры проёма?*', 
      { parse_mode: 'Markdown', ...Keyboards.knowsSize }
    );
    return;
  }
  
  // Шаг 1: Размеры
  if (user.step === 'askSize') {
    if (text === '✅ Знаю размеры') {
      user.step = 'askWidth';
      await bot.sendMessage(chatId, '📏 *Введите ширину (мм):*\nПример: 3000', 
        { parse_mode: 'Markdown' }
      );
    } else if (text === '📞 Вызвать замерщика') {
      await bot.sendMessage(chatId, '👷 *Бесплатный выезд замерщика!*\n\n📞 8 (923) 811-54-32\n💬 @systema365',
        { parse_mode: 'Markdown' }
      );
      user.step = 'start';
    }
    return;
  }
  
  // Шаг 2: Ширина
  if (user.step === 'askWidth') {
    const width = parseInt(text);
    if (isNaN(width) || width < 2000 || width > 6000) {
      await bot.sendMessage(chatId, '❌ Введите число 2000-6000 мм');
      return;
    }
    
    user.width = width;
    user.step = 'askHeight';
    await bot.sendMessage(chatId, `✅ Ширина: ${width} мм\n\n📏 *Введите высоту (мм):*\nПример: 2500`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // Шаг 3: Высота
  if (user.step === 'askHeight') {
    const height = parseInt(text);
    if (isNaN(height) || height < 1800 || height > 3000) {
      await bot.sendMessage(chatId, '❌ Введите число 1800-3000 мм');
      return;
    }
    
    user.height = height;
    user.step = 'askAutomation';
    await bot.sendMessage(chatId, `✅ Размеры: ${user.width} × ${height} мм\n\n⚙️ *Открывать пультом?*`,
      { parse_mode: 'Markdown', ...Keyboards.automation }
    );
    return;
  }
  
  // Шаг 4: Автоматика
  if (user.step === 'askAutomation') {
    if (text === '✅ С пультом') {
      user.automation = true;
      user.step = 'askInstallation';
      await bot.sendMessage(chatId, '🏗️ *Нужна установка?*',
        { parse_mode: 'Markdown', ...Keyboards.installation }
      );
    } else if (text === '❌ Без автоматики') {
      user.automation = false;
      user.step = 'askInstallation';
      await bot.sendMessage(chatId, '🏗️ *Нужна установка?*',
        { parse_mode: 'Markdown', ...Keyboards.installation }
      );
    }
    return;
  }
  
  // Шаг 5: Установка
  if (user.step === 'askInstallation') {
    if (text === '✅ Установка под ключ' || text === '❌ Установлю сам') {
      user.installation = text === '✅ Установка под ключ';
      await showCalculationResult(chatId, user);
      return;
    }
    
    await bot.sendMessage(chatId, '❌ Выберите вариант из кнопок', Keyboards.installation);
    return;
  }
  
  // Если не обработано - показываем старт
  await bot.sendMessage(chatId, '🚀 Начать расчет?', Keyboards.main);
  users[chatId] = { step: 'start' };
}

// =========== ПОКАЗ РЕЗУЛЬТАТА ===========
async function showCalculationResult(chatId, user) {
  console.log(`🧮 Расчет для ${chatId}: ${user.width}x${user.height}`);
  
  // Расчет стоимости
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
  const orderData = {
    width: user.width,
    height: user.height,
    automation: user.automation,
    installation: user.installation,
    finalPrice,
    area: area.toFixed(2)
  };
  
  users[chatId].orderData = orderData;
  
  // Показываем результат
  const message = 
    `✅ *Предварительный расчет готов!*\n\n` +
    `📋 *Параметры заказа:*\n` +
    `• Ширина: ${user.width} мм\n` +
    `• Высота: ${user.height} мм\n` +
    `• Автоматика: ${user.automation ? 'Да' : 'Нет'}\n` +
    `• Установка: ${user.installation ? 'Под ключ' : 'Сам'}\n\n` +
    `💰 *Примерная стоимость: ~${finalPrice.toLocaleString('ru-RU')} ₽*\n\n` +
    `📝 *Точную стоимость со всеми скидками укажет менеджер!*\n\n` +
    `👇 *Укажите номер, куда Вам позвонить?*\n` +
    `_(просто напишите номер телефона)_`;
  
  await bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown',
    reply_markup: { remove_keyboard: true }
  });
  
  // ⚠️ ВАЖНО: Устанавливаем флаг ожидания телефона!
  phoneRequests[chatId] = {
    waitingPhone: true,
    orderData: orderData,
    timestamp: Date.now()
  };
  
  console.log(`⏳ Установлен waitingPhone для ${chatId}`);
}

// =========== ОБРАБОТКА ТЕЛЕФОНА ===========
async function handlePhoneInput(chatId, phone, userInfo) {
  console.log(`📞 Начало обработки телефона от ${chatId}`);
  
  const request = phoneRequests[chatId];
  
  if (!request || !request.waitingPhone) {
    console.log(`❌ Ошибка: нет ожидания телефона для ${chatId}`);
    await bot.sendMessage(chatId, '❌ Сессия устарела. Начните заново: /start');
    return;
  }
  
  // Снимаем флаг
  delete phoneRequests[chatId];
  
  const order = request.orderData;
  const requestId = 'REQ-' + Date.now().toString().slice(-6);
  
  // Подтверждение клиенту
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
  
  console.log(`✅ Клиент ${chatId} получил подтверждение`);
  
  // Отправка админу
  await sendToAdmin(chatId, phone, userInfo, order, requestId);
  
  // Сбрасываем пользователя
  users[chatId] = { step: 'start' };
}

// =========== ОТПРАВКА АДМИНУ ===========
async function sendToAdmin(chatId, phone, userInfo, order, requestId) {
  console.log(`📤 Отправляю заявку админу: ${ADMIN_CHAT_ID}`);
  
  if (!ADMIN_CHAT_ID || ADMIN_CHAT_ID === 'ВАШ_CHAT_ID') {
    console.log('❌ ADMIN_CHAT_ID не указан!');
    return;
  }
  
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
    
    const sentMsg = await bot.sendMessage(ADMIN_CHAT_ID, adminMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '📞 Позвонить клиенту', url: `tel:${phone.replace(/\D/g, '')}` }
        ]]
      }
    });
    
    console.log(`✅ Заявка #${requestId} отправлена админу, ID сообщения: ${sentMsg.message_id}`);
    
  } catch (error) {
    console.error('❌ Ошибка отправки админу:', error.message);
  }
}

// =========== ИНЛАЙН КНОПКИ ===========
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  
  if (query.data === 'new_calc') {
    users[chatId] = { step: 'start' };
    delete phoneRequests[chatId];
    bot.sendMessage(chatId, '🚀 Начать новый расчет?', Keyboards.main);
  }
  
  bot.answerCallbackQuery(query.id);
});

// =========== DEBUG КОМАНДЫ ===========
bot.onText(/\/debug/, (msg) => {
  const chatId = msg.chat.id;
  const user = users[chatId] || {};
  const request = phoneRequests[chatId] || {};
  
  const debugMsg = 
    `🔧 *ДЕБАГ ИНФОРМАЦИЯ*\n\n` +
    `🆔 Chat ID: ${chatId}\n` +
    `📊 Текущий шаг: ${user.step || 'не установлен'}\n` +
    `📱 Жду телефон: ${request.waitingPhone ? '✅ ДА' : '❌ НЕТ'}\n` +
    `📏 Размеры: ${user.width || '?'}x${user.height || '?'}\n` +
    `⚙️ Автоматика: ${typeof user.automation !== 'undefined' ? (user.automation ? 'Да' : 'Нет') : '?'}\n` +
    `🏗️ Установка: ${typeof user.installation !== 'undefined' ? (user.installation ? 'Да' : 'Нет') : '?'}\n\n` +
    `👑 Админ ID: ${ADMIN_CHAT_ID}\n` +
    `📅 Время: ${new Date().toLocaleTimeString('ru-RU')}`;
  
  bot.sendMessage(chatId, debugMsg, { parse_mode: 'Markdown' });
});

bot.onText(/\/setphone/, (msg) => {
  const chatId = msg.chat.id;
  
  // Принудительно устанавливаем режим ожидания телефона
  phoneRequests[chatId] = {
    waitingPhone: true,
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
    '✅ Режим ожидания телефона установлен!\n' +
    '📞 Теперь введите номер телефона для теста',
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const totalUsers = Object.keys(users).length;
  const waitingPhones = Object.values(phoneRequests).filter(r => r.waitingPhone).length;
  
  bot.sendMessage(chatId, 
    `📊 *СТАТУС БОТА*\n\n` +
    `👥 Всего пользователей: ${totalUsers}\n` +
    `⏳ Ждут ввода телефона: ${waitingPhones}\n` +
    `🤖 Бот активен: ✅\n` +
    `👑 Админ: ${ADMIN_CHAT_ID ? '✅ настроен' : '❌ не настроен'}`,
    { parse_mode: 'Markdown' }
  );
});

console.log('🤖 Бот полностью готов к работе!');
console.log('📞 Телефон для связи: 8 (923) 811-54-32');
console.log('💬 Менеджер: @systema365');
console.log('🔧 Команды:');
console.log('  /debug - отладка текущего состояния');
console.log('  /setphone - принудительно ждать телефон');
console.log('  /status - общий статус бота');
