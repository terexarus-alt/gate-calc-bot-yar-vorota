// =========== НАСТРОЙКИ ===========
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_TOKEN || 'ВАШ_ТОКЕН';
const bot = new TelegramBot(token, { polling: true });
console.log('✅ Бот запущен!');

// =========== ХРАНИЛИЩЕ ===========
const users = {}; // chatId -> {step, width, height, automation, installation, orderData}
const pendingRequests = {}; // chatId -> {phone, orderData, messageId}

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
  
  // ====== ОБРАБОТКА ОТВЕТОВ НА ЗАПРОС ТЕЛЕФОНА ======
  if (pendingRequests[chatId] && pendingRequests[chatId].waitingForPhone) {
    handlePhoneInput(chatId, text, msg.from);
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
    } else if (text === '🔄 Сначала') {
      users[chatId] = { step: 'start' };
      bot.sendMessage(chatId, '🚀 Начать расчет?', Keyboards.main);
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

// =========== ПОКАЗ РЕЗУЛЬТАТА РАСЧЕТА ===========
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
  
  // Формируем сообщение с результатом
  const message = 
    `✅ *Предварительный расчет готов!*\n\n` +
    `📋 *Параметры заказа:*\n` +
    `• Ширина: ${user.width} мм\n` +
    `• Высота: ${user.height} мм\n` +
    `• Автоматика: ${user.automation ? 'Да' : 'Нет'}\n` +
    `• Установка: ${user.installation ? 'Под ключ' : 'Сам'}\n\n` +
    `💰 *Примерная стоимость: ~${finalPrice.toLocaleString('ru-RU')} ₽*\n\n` +
    `📝 *Точную стоимость со всеми скидками укажет менеджер!*\n\n` +
    `👇 *Укажите номер телефона, куда Вам позвонить?*`;
  
  // Кнопки для запроса телефона
  const phoneRequestButtons = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📱 Отправить номер', callback_data: 'send_phone' }
        ],
        [
          { text: '💬 Написать менеджеру', url: 'https://t.me/systema365' }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown', 
    ...phoneRequestButtons 
  });
}

// =========== ОБРАБОТКА ИНЛАЙН-КНОПОК ===========
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const userData = users[chatId];
  
  if (data === 'send_phone') {
    // Проверяем есть ли расчет
    if (!userData || !userData.orderData) {
      bot.sendMessage(chatId, '❌ Расчет не найден. Начните заново.');
      return;
    }
    
    // Сохраняем что ждем телефон
    pendingRequests[chatId] = {
      waitingForPhone: true,
      orderData: userData.orderData,
      messageId: query.message.message_id
    };
    
    // Запрашиваем телефон
    bot.sendMessage(
      chatId,
      `📱 *Укажите ваш номер телефона:*\n\n` +
      `_Пример: 8 999 123-45-67 или +7 999 123-45-67_\n\n` +
      `Менеджер @systema365 свяжется для уточнения деталей и расчета точной стоимости.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          force_reply: true,
          selective: true,
          input_field_placeholder: 'Ваш номер телефона'
        }
      }
    );
    
  } else if (data === 'new_calculation') {
    users[chatId] = { step: 'start' };
    delete pendingRequests[chatId];
    bot.sendMessage(chatId, '🚀 Начать новый расчет?', Keyboards.main);
  }
  
  bot.answerCallbackQuery(query.id);
});

// =========== ОБРАБОТКА ВВОДА ТЕЛЕФОНА ===========
function handlePhoneInput(chatId, phone, userInfo) {
  const request = pendingRequests[chatId];
  
  if (!request || !request.waitingForPhone) {
    return;
  }
  
  const order = request.orderData;
  const requestId = 'REQ-' + Date.now().toString().slice(-6);
  
  // Удаляем флаг ожидания
  delete pendingRequests[chatId].waitingForPhone;
  
  // Показываем подтверждение клиенту
  const confirmationMessage = 
    `📨 *Заявка #${requestId} отправлена!*\n\n` +
    `✅ Ваш номер: ${phone}\n` +
    `✅ Параметры заказа сохранены\n\n` +
    `⏱️ *Менеджер @systema365 свяжется в течение 15 минут*\n\n` +
    `📞 *Также вы можете позвонить:*\n` +
    `8 (923) 811-54-32\n\n` +
    `💬 *Быстрая связь:*`;
  
  const confirmationButtons = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💬 Написать менеджеру', url: 'https://t.me/systema365' },
          { text: '📞 Позвонить', url: 'tel:89238115432' }
        ],
        [
          { text: '🔄 Новый расчет', callback_data: 'new_calculation' }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId, confirmationMessage, {
    parse_mode: 'Markdown',
    ...confirmationButtons
  });
  
  // Отправляем заявку админу (если настроен)
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (adminChatId) {
    const adminMessage = 
      `🔥 *НОВАЯ ЗАЯВКА НА РАСЧЕТ #${requestId}*\n\n` +
      `👤 *Клиент:* ${userInfo.first_name}${userInfo.last_name ? ' ' + userInfo.last_name : ''}\n` +
      `👤 Username: @${userInfo.username || 'нет'}\n` +
      `🆔 ID: ${chatId}\n` +
      `📱 Телефон: ${phone}\n` +
      `📅 Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
      `📏 *ПАРАМЕТРЫ ЗАКАЗА:*\n` +
      `• Ширина: ${order.width} мм\n` +
      `• Высота: ${order.height} мм\n` +
      `• Автоматика: ${order.automation ? 'Да' : 'Нет'}\n` +
      `• Установка: ${order.installation ? 'Под ключ' : 'Сам'}\n` +
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
      pendingRequests[chatId].adminMessageId = adminMsg.message_id;
      pendingRequests[chatId].requestId = requestId;
      pendingRequests[chatId].clientPhone = phone;
    });
  }
  
  // Очищаем данные расчета у пользователя
  if (users[chatId]) {
    delete users[chatId].orderData;
  }
}

// =========== ОБРАБОТКА ОТВЕТОВ АДМИНА ===========
bot.on('message', (msg) => {
  // Проверяем если сообщение от админа и является ответом
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (adminChatId && msg.chat.id.toString() === adminChatId && msg.reply_to_message) {
    const repliedMsgId = msg.reply_to_message.message_id;
    
    // Ищем заявку по ID сообщения админа
    let targetChatId = null;
    let requestData = null;
    
    for (const [chatId, request] of Object.entries(pendingRequests)) {
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
      delete pendingRequests[targetChatId];
    }
  }
});

// =========== ОШИБКИ ===========
bot.on('polling_error', (error) => {
  console.log('Ошибка:', error.message);
});

console.log('🤖 Бот готов к работе!');
console.log('📞 Телефон: 8 (923) 811-54-32');
console.log('💬 Менеджер: @systema365');
console.log('\n✅ Функционал:');
console.log('  • Кнопка "✅ Установка под ключ" - РАБОТАЕТ ✅');
console.log('  • Кнопка "❌ Установлю сам" - РАБОТАЕТ ✅');
console.log('  • Предварительный расчет с текстом');
console.log('  • Запрос телефона клиента');
console.log('  • Заявки админу с ответами');
console.log('  • Кнопка "Начать сначала" везде');
