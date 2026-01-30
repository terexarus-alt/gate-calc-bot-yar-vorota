// =========== НАСТРОЙКИ ===========
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_TOKEN || 'ВАШ_ТОКЕН';
const bot = new TelegramBot(token, { polling: true });
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

// =========== /start ===========
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

// =========== ОБРАБОТКА ВСЕХ СООБЩЕНИЙ ===========
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Если пользователя нет - создаем
  if (!users[chatId]) {
    users[chatId] = { step: 'start' };
  }
  
  const user = users[chatId];
  
  // ====== ПРОВЕРЯЕМ СНАЧАЛА - ЖДЕМ ЛИ МЫ ТЕЛЕФОН? ======
  if (phoneRequests[chatId] && phoneRequests[chatId].waitingPhone) {
    handlePhoneInput(chatId, text, msg.from);
    return;
  }
  
  // Кнопка "Сначала" всегда работает
  if (text === '🔄 Сначала') {
    users[chatId] = { step: 'start' };
    delete phoneRequests[chatId];
    bot.sendMessage(chatId, '🚀 Начать расчет?', Keyboards.main);
    return;
  }
  
  // Главная кнопка
  if (text === '🚀 Начать расчет') {
    user.step = 'askSize';
    bot.sendMessage(chatId, '📏 *Вам известны размеры проёма?*', 
      { parse_mode: 'Markdown', ...Keyboards.knowsSize }
    );
    return;
  }
  
  // Шаг 1: Знает размеры?
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
      users[chatId] = { step: 'start' };
    }
    return;
  }
  
  // Шаг 2: Ширина
  if (user.step === 'askWidth') {
    if (text === '🔄 Сначала') {
      users[chatId] = { step: 'start' };
      bot.sendMessage(chatId, '🚀 Начать расчет?', Keyboards.main);
      return;
    }
    
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
  
  // Шаг 3: Высота
  if (user.step === 'askHeight') {
    if (text === '🔄 Сначала') {
      users[chatId] = { step: 'start' };
      bot.sendMessage(chatId, '🚀 Начать расчет?', Keyboards.main);
      return;
    }
    
    const height = parseInt(text);
    if (isNaN(height) || height < 1800 || height > 3000) {
      bot.sendMessage(chatId, '❌ Введите число 1800-3000 мм');
      return;
    }
    
    user.height = height;
    user.step = 'askAutomation';
    bot.sendMessage(chatId, `✅ Размеры: ${user.width} × ${height} мм\n\n⚙️ *Открывать пультом?*`,
      { parse_mode: 'Markdown', ...Keyboards.automation }
    );
    return;
  }
  
  // Шаг 4: Автоматика
  if (user.step === 'askAutomation') {
    if (text === '🔄 Сначала') {
      users[chatId] = { step: 'start' };
      bot.sendMessage(chatId, '🚀 Начать расчет?', Keyboards.main);
      return;
    }
    
    if (text === '✅ С пультом') {
      user.automation = true;
      user.step = 'askInstallation';
      bot.sendMessage(chatId, '🏗️ *Нужна установка?*',
        { parse_mode: 'Markdown', ...Keyboards.installation }
      );
    } else if (text === '❌ Без автоматики') {
      user.automation = false;
      user.step = 'askInstallation';
      bot.sendMessage(chatId, '🏗️ *Нужна установка?*',
        { parse_mode: 'Markdown', ...Keyboards.installation }
      );
    }
    return;
  }
  
  // Шаг 5: Установка
  if (user.step === 'askInstallation') {
    if (text === '🔄 Сначала') {
      users[chatId] = { step: 'start' };
      bot.sendMessage(chatId, '🚀 Начать расчет?', Keyboards.main);
      return;
    }
    
    if (text === '✅ Установка под ключ') {
      user.installation = true;
      showCalculationResult(chatId, user);
      return;
    }
    
    if (text === '❌ Установлю сам') {
      user.installation = false;
      showCalculationResult(chatId, user);
      return;
    }
    
    bot.sendMessage(chatId, '❌ Выберите вариант из кнопок', Keyboards.installation);
    return;
  }
});

// =========== ПОКАЗ РЕЗУЛЬТАТА И ЗАПРОС ТЕЛЕФОНА ===========
function showCalculationResult(chatId, user) {
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
  
  // ПОКАЗЫВАЕМ РЕЗУЛЬТАТ И СРАЗУ ЗАПРАШИВАЕМ ТЕЛЕФОН
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
  bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown' 
  });
  
  // Устанавливаем флаг что ждем телефон
  phoneRequests[chatId] = {
    waitingPhone: true,
    orderData: orderData
  };
}

// =========== ОБРАБОТКА ВВОДА ТЕЛЕФОНА ===========
function handlePhoneInput(chatId, phone, userInfo) {
  const request = phoneRequests[chatId];
  
  if (!request || !request.waitingPhone) {
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
  
  bot.sendMessage(chatId, confirmMsg, {
    parse_mode: 'Markdown',
    ...confirmButtons
  });
  
  // ====== ОТПРАВЛЯЕМ ПОЛНУЮ ЗАЯВКУ АДМИНУ ======
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (adminChatId) {
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
          { text: '📞 Позвонить клиенту', url: `tel:${phone.replace(/\D/g, '')}` }
        ]]
      }
    };
    
    bot.sendMessage(adminChatId, adminMessage, {
      parse_mode: 'Markdown',
      ...adminKeyboard
    }).then(adminMsg => {
      // Сохраняем связь для ответов админа
      phoneRequests[chatId] = {
        adminMessageId: adminMsg.message_id,
        requestId: requestId,
        clientPhone: phone,
        clientChatId: chatId
      };
    });
  }
  
  // Очищаем данные пользователя
  if (users[chatId]) {
    users[chatId] = { step: 'start' };
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

// =========== ОБРАБОТКА ОТВЕТОВ АДМИНА ===========
bot.on('message', (msg) => {
  const adminChatId = process.env.ADMIN_CHAT_ID;
  
  // Проверяем если сообщение от админа и является ответом
  if (adminChatId && msg.chat.id.toString() === adminChatId && msg.reply_to_message) {
    const repliedMsgId = msg.reply_to_message.message_id;
    
    // Ищем заявку по ID сообщения админа
    let targetChatId = null;
    let requestData = null;
    
    for (const [chatId, request] of Object.entries(phoneRequests)) {
      if (request.adminMessageId === repliedMsgId) {
        targetChatId = chatId;
        requestData = request;
        break;
      }
    }
    
    if (targetChatId && requestData) {
      const currentDate = new Date().toLocaleDateString('ru-RU');
      
      // Отправляем ответ клиенту
      const clientMessage = 
        `📞 *ОТВЕТ ОТ МЕНЕДЖЕРА ПО ЗАЯВКЕ #${requestData.requestId}*\n\n` +
        `${msg.text}\n\n` +
        `📱 *Ваш телефон:* ${requestData.clientPhone}\n` +
        `📞 *Позвоните также по номеру:*\n` +
        `8 (923) 811-54-32\n\n` +
        `_Актуально на ${currentDate}_\n\n` +
        `👇 *Быстрая связь:*`;
      
      const clientKeyboard = {
        reply_markup: {
          inline_keyboard: [[
            { text: '💬 Написать менеджеру', url: 'https://t.me/systema365' },
            { text: '📞 Позвонить', url: 'tel:89238115432' }
          ]]
        }
      };
      
      bot.sendMessage(targetChatId, clientMessage, {
        parse_mode: 'Markdown',
        ...clientKeyboard
      }).then(() => {
        // Подтверждаем админу
        bot.sendMessage(adminChatId, `✅ Ответ по заявке #${requestData.requestId} отправлен клиенту`, {
          reply_to_message_id: msg.message_id
        });
      });
      
      // Удаляем обработанную заявку
      delete phoneRequests[targetChatId];
    }
  }
});

// =========== ОШИБКИ ===========
bot.on('polling_error', (error) => {
  console.log('Ошибка:', error.message);
});

console.log('🤖 Бот полностью готов к работе!');
console.log('📞 Телефон для связи: 8 (923) 811-54-32');
console.log('💬 Менеджер: @systema365');
if (process.env.ADMIN_CHAT_ID) {
  console.log('👑 Админ ID настроен, заявки будут приходить');
}
