// =========== НАСТРОЙКИ ===========
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_TOKEN || 'ВАШ_ТОКЕН';
const bot = new TelegramBot(token, { 
  polling: { 
    interval: 300,
    timeout: 10,
    autoStart: true
  } 
});

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || 'ВАШ_CHAT_ID';

console.log('✅ Бот запущен!');

// =========== ХРАНИЛИЩЕ ===========
const users = {}; // chatId -> {step, width, height, automation, installation, orderData}
const phoneRequests = {}; // chatId -> {waitingPhone: true, orderData}

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

// =========== ГЛАВНЫЙ ОБРАБОТЧИК СООБЩЕНИЙ ===========
bot.on('message', async (msg) => {
  // Игнорируем служебные сообщения
  if (msg.chat.type === 'channel') return;
  
  const chatId = msg.chat.id;
  const text = msg.text || '';
  
  console.log(`📨 Получено от ${chatId}: "${text}", шаг: ${users[chatId]?.step || 'нет'}`);
  
  // Если пользователя нет - создаем
  if (!users[chatId]) {
    users[chatId] = { step: 'start' };
  }
  
  const user = users[chatId];
  
  // ====== ПРОВЕРЯЕМ: ЖДЕМ ЛИ МЫ ТЕЛЕФОН? ======
  // Это ВАЖНО - проверяем ПЕРВЫМ делом!
  if (phoneRequests[chatId] && phoneRequests[chatId].waitingPhone) {
    console.log(`📱 Принят телефон от ${chatId}: ${text}`);
    await handlePhoneInput(chatId, text, msg.from);
    return; // ВАЖНО: завершаем обработку
  }
  
  // ====== ОБРАБОТКА КОМАНД И КНОПОК ======
  
  // Кнопка "Сначала" всегда работает
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
  
  // Шаг 1: Знает размеры?
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
      users[chatId] = { step: 'start' };
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
    if (text === '✅ Установка под ключ') {
      user.installation = true;
      await showCalculationResult(chatId, user);
      return;
    }
    
    if (text === '❌ Установлю сам') {
      user.installation = false;
      await showCalculationResult(chatId, user);
      return;
    }
    
    await bot.sendMessage(chatId, '❌ Выберите вариант из кнопок', Keyboards.installation);
    return;
  }
  
  // Если ничего не подошло - показываем старт
  if (!['start', 'askSize', 'askWidth', 'askHeight', 'askAutomation', 'askInstallation'].includes(user.step)) {
    users[chatId] = { step: 'start' };
    await bot.sendMessage(chatId, '🚀 Начать расчет?', Keyboards.main);
  }
});

// =========== ПОКАЗ РЕЗУЛЬТАТА И ЗАПРОС ТЕЛЕФОНА ===========
async function showCalculationResult(chatId, user) {
  console.log(`🧮 Расчет для ${chatId}: ${user.width}x${user.height}`);
  
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
  const date = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  
  // Сохраняем данные расчета
  const orderData = {
    width: user.width,
    height: user.height,
    automation: user.automation,
    installation: user.installation,
    finalPrice,
    date,
    area: area.toFixed(2)
  };
  
  // Сохраняем у пользователя
  users[chatId].orderData = orderData;
  
  // ПОКАЗЫВАЕМ РЕЗУЛЬТАТ И ЗАПРАШИВАЕМ ТЕЛЕФОН
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
  
  // Отправляем сообщение
  await bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown',
    reply_markup: { remove_keyboard: true } // Убираем клавиатуру
  });
  
  // Устанавливаем флаг что ждем телефон
  phoneRequests[chatId] = {
    waitingPhone: true,
    orderData: orderData
  };
  
  console.log(`⏳ Жду телефон от ${chatId}`);
}

// =========== ОБРАБОТКА ВВОДА ТЕЛЕФОНА ===========
async function handlePhoneInput(chatId, phone, userInfo) {
  console.log(`📞 Обрабатываю телефон от ${chatId}: ${phone}`);
  
  const request = phoneRequests[chatId];
  
  if (!request || !request.waitingPhone) {
    console.log(`❌ Нет ожидания телефона для ${chatId}`);
    await bot.sendMessage(chatId, '❌ Ошибка. Начните заново: /start');
    return;
  }
  
  const order = request.orderData;
  const requestId = 'REQ-' + Date.now().toString().slice(-6);
  
  // Убираем флаг ожидания
  delete phoneRequests[chatId];
  
  // ПОДТВЕРЖДЕНИЕ КЛИЕНТУ
  const confirmMsg = 
    `📨 *Спасибо! Ваша заявка #${requestId} принята!*\n\n` +
    `✅ Ваш номер: ${phone}\n` +
    `⏱️ *Менеджер @systema365 свяжется в течение 15 минут*\n\n` +
    `📞 *Также вы можете позвонить:*\n` +
    `8 (923) 811-54-32\n\n` +
    `👇 *Быстрая связь:*`;
  
  const confirmButtons = {
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
  };
  
  await bot.sendMessage(chatId, confirmMsg, {
    parse_mode: 'Markdown',
    ...confirmButtons
  });
  
  console.log(`✅ Клиенту ${chatId} отправлено подтверждение`);
  
  // ====== ОТПРАВЛЯЕМ ЗАЯВКУ АДМИНУ ======
  await sendToAdmin(chatId, phone, userInfo, order, requestId);
  
  // Очищаем данные пользователя
  users[chatId] = { step: 'start' };
}

// =========== ФУНКЦИЯ ОТПРАВКИ АДМИНУ ===========
async function sendToAdmin(chatId, phone, userInfo, order, requestId) {
  console.log(`📤 Отправляю заявку админу ${ADMIN_CHAT_ID}`);
  
  if (!ADMIN_CHAT_ID || ADMIN_CHAT_ID === 'ВАШ_CHAT_ID') {
    console.log('❌ ADMIN_CHAT_ID не указан!');
    console.log(`📝 Заявка #${requestId} от ${userInfo.first_name}: ${phone}`);
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
      `📏 *ПОЛНЫЕ ПАРАМЕТРЫ ЗАКАЗА:*\n` +
      `• Ширина: ${order.width} мм\n` +
      `• Высота: ${order.height} мм\n` +
      `• Автоматика: ${order.automation ? '✅ Да (с пультом)' : '❌ Нет (ручное)'}\n` +
      `• Установка: ${order.installation ? '✅ Под ключ' : '❌ Сам'}\n` +
      `• Площадь: ${order.area} м²\n` +
      `💰 *Примерная стоимость:* ~${order.finalPrice.toLocaleString('ru-RU')} ₽\n\n` +
      `💬 *Для ответа клиенту ответьте на это сообщение*`;
    
    const adminKeyboard = {
      reply_markup: {
        inline_keyboard: [[
          { 
            text: '📞 Позвонить клиенту', 
            url: `tel:${phone.replace(/\D/g, '').replace(/^8/, '7')}`
          }
        ]]
      }
    };
    
    await bot.sendMessage(ADMIN_CHAT_ID, adminMessage, {
      parse_mode: 'Markdown',
      ...adminKeyboard
    });
    
    console.log(`✅ Заявка #${requestId} отправлена админу`);
    
  } catch (error) {
    console.error('❌ Ошибка отправки админу:', error.message);
  }
}

// =========== ОБРАБОТКА ИНЛАЙН-КНОПОК ===========
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  if (data === 'new_calc') {
    users[chatId] = { step: 'start' };
    delete phoneRequests[chatId];
    bot.sendMessage(chatId, '🚀 Начать новый расчет?', Keyboards.main);
  }
  
  bot.answerCallbackQuery(query.id);
});

// =========== ДЕБАГ КОМАНДЫ ===========
bot.onText(/\/debug/, (msg) => {
  const chatId = msg.chat.id;
  const user = users[chatId];
  const request = phoneRequests[chatId];
  
  const debugInfo = 
    `🔧 *ДЕБАГ ИНФО:*\n` +
    `🆔 Chat ID: ${chatId}\n` +
    `📊 Шаг: ${user?.step || 'нет'}\n` +
    `📱 Жду телефон: ${request?.waitingPhone ? '✅ Да' : '❌ Нет'}\n` +
    `📏 Размеры: ${user?.width || '?'}x${user?.height || '?'}\n` +
    `⚙️ Автоматика: ${user?.automation === true ? 'Да' : user?.automation === false ? 'Нет' : '?'}\n` +
    `🏗️ Установка: ${user?.installation === true ? 'Да' : user?.installation === false ? 'Нет' : '?'}\n\n` +
    `👑 Админ ID: ${ADMIN_CHAT_ID || 'не указан'}`;
  
  bot.sendMessage(chatId, debugInfo, { parse_mode: 'Markdown' });
});

bot.onText(/\/test/, (msg) => {
  const chatId = msg.chat.id;
  
  // Создаем тестового пользователя на шаге "жду телефон"
  users[chatId] = {
    step: 'waitingPhone',
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
  
  phoneRequests[chatId] = {
    waitingPhone: true,
    orderData: users[chatId].orderData
  };
  
  bot.sendMessage(chatId, 
    '✅ Тестовый режим: Бот ждет телефон\n' +
    '📞 Введите любой номер для проверки\n\n' +
    'Или /debug для статуса',
    { parse_mode: 'Markdown' }
  );
});

// =========== ОШИБКИ ===========
bot.on('polling_error', (error) => {
  console.log('❌ Ошибка polling:', error.message);
});

console.log('🤖 Бот полностью готов к работе!');
console.log('📞 Телефон для связи: 8 (923) 811-54-32');
console.log('💬 Менеджер: @systema365');
console.log('🔧 Команды: /debug - статус, /test - тест режима');
