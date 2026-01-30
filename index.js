// =========== НАСТРОЙКИ ===========
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_TOKEN || 'ВАШ_ТОКЕН';
const bot = new TelegramBot(token, { polling: true });
console.log('✅ Бот запущен!');

// =========== ХРАНИЛИЩЕ ===========
const users = {}; // chatId -> {step, width, height, automation, installation}

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
  
  // ====== ВАЖНО: Кнопка "Сначала" обрабатывается ОТДЕЛЬНО для каждого шага ======
  
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
  
  // ====== ШАГ 5: УСТАНОВКА - ЭТОТ БЛОК ТОЧНО РАБОТАЕТ ======
  if (user.step === 'askInstallation') {
    // Сначала проверяем кнопку "Сначала"
    if (text === '🔄 Сначала') {
      users[chatId] = { step: 'start' };
      bot.sendMessage(chatId, '🚀 Начать расчет?', Keyboards.main);
      return;
    }
    
    // Проверяем кнопки установки
    if (text === '✅ Установка под ключ') {
      user.installation = true;
      showResult(chatId, user);
      return;
    }
    
    if (text === '❌ Установлю сам') {
      user.installation = false;
      showResult(chatId, user);
      return;
    }
    
    // Если пришел другой текст
    bot.sendMessage(chatId, '❌ Выберите вариант из кнопок', Keyboards.installation);
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
  const date = new Date().toLocaleDateString('ru-RU');
  
  // Сохраняем расчет
  const orderData = {
    width: user.width,
    height: user.height,
    automation: user.automation,
    installation: user.installation,
    finalPrice,
    date
  };
  
  // Формируем сообщение
  const message = 
    `✅ *Предварительный расчет готов!*\n\n` +
    `📋 *Параметры:*\n` +
    `• Ширина: ${user.width} мм\n` +
    `• Высота: ${user.height} мм\n` +
    `• Автоматика: ${user.automation ? 'Да' : 'Нет'}\n` +
    `• Установка: ${user.installation ? 'Под ключ' : 'Сам'}\n\n` +
    `💰 *Итого: ~${finalPrice.toLocaleString('ru-RU')} ₽*\n\n` +
    `📝 *Расчет предварительный!*\n` +
    `Точную стоимость на ${date} с учетом всех скидок подскажет менеджер!\n\n` +
    `👇 *Для точного расчета:*`;
  
  const buttons = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📱 Оставить заявку', callback_data: 'request_exact' },
          { text: '💬 Менеджер', url: 'https://t.me/systema365' }
        ],
        [
          { text: '📞 Позвонить', url: 'tel:89238115432' },
          { text: '🔄 Новый расчет', callback_data: 'new' }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown', 
    ...buttons 
  });
  
  // Сохраняем данные заказа для возможной заявки
  users[chatId].orderData = orderData;
}

// =========== ИНЛАЙН-КНОПКИ ===========
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  if (data === 'request_exact') {
    const user = users[chatId];
    if (!user || !user.orderData) {
      bot.sendMessage(chatId, '❌ Расчет не найден. Начните заново.');
      return;
    }
    
    const order = user.orderData;
    
    bot.sendMessage(
      chatId,
      `📋 *Заявка на точный расчет*\n\n` +
      `• Ширина: ${order.width} мм\n` +
      `• Высота: ${order.height} мм\n` +
      `• Автоматика: ${order.automation ? 'Да' : 'Нет'}\n` +
      `• Установка: ${order.installation ? 'Под ключ' : 'Сам'}\n` +
      `• Примерная стоимость: ~${order.finalPrice.toLocaleString('ru-RU')} ₽\n\n` +
      `👇 *Введите ваш номер телефона:*\n_Менеджер свяжется для уточнения деталей_`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          force_reply: true,
          selective: true,
          input_field_placeholder: 'Например: 8 999 123-45-67'
        }
      }
    ).then(sentMsg => {
      bot.onReplyToMessage(sentMsg.chat.id, sentMsg.message_id, (phoneMsg) => {
        const phone = phoneMsg.text.trim();
        const requestId = 'REQ-' + Date.now().toString().slice(-6);
        
        // Ответ клиенту
        bot.sendMessage(
          chatId,
          `📨 *Заявка #${requestId} принята!*\n\n` +
          `✅ Ваш номер: ${phone}\n` +
          `⏱️ Менеджер @systema365 свяжется в течение 15 минут\n\n` +
          `📞 *Также можете позвонить:*\n8 (923) 811-54-32`,
          { parse_mode: 'Markdown' }
        );
        
        // Уведомление админу (если настроен)
        const adminId = process.env.ADMIN_CHAT_ID;
        if (adminId) {
          const userInfo = query.from;
          bot.sendMessage(
            adminId,
            `🔥 НОВАЯ ЗАЯВКА #${requestId}\n\n` +
            `👤 Клиент: ${userInfo.first_name}\n` +
            `📱 Телефон: ${phone}\n` +
            `🆔 ID: ${chatId}\n\n` +
            `📏 Параметры:\n` +
            `• ${order.width} × ${order.height} мм\n` +
            `• Автоматика: ${order.automation ? 'Да' : 'Нет'}\n` +
            `• Установка: ${order.installation ? 'Под ключ' : 'Сам'}\n` +
            `💰 ~${order.finalPrice.toLocaleString('ru-RU')} ₽`,
            { reply_markup: { inline_keyboard: [[
              { text: '📞 Позвонить клиенту', url: `tel:${phone.replace(/\D/g, '')}` }
            ]] }}
          );
        }
        
        // Очищаем данные
        delete users[chatId].orderData;
      });
    });
    
  } else if (data === 'new') {
    users[chatId] = { step: 'start' };
    bot.sendMessage(chatId, '🚀 Начать расчет?', Keyboards.main);
  }
  
  bot.answerCallbackQuery(query.id);
});

// =========== ОШИБКИ ===========
bot.on('polling_error', (error) => {
  console.log('Ошибка:', error.message);
});

console.log('🤖 Бот готов!');
console.log('📞 Телефон: 8 (923) 811-54-32');
console.log('💬 Менеджер: @systema365');
