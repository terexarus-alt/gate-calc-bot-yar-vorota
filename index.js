// =========== НАСТРОЙКИ ===========
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_TOKEN || 'ВАШ_ТОКЕН';
const bot = new TelegramBot(token, { polling: true });
console.log('Бот запущен!');

// =========== ХРАНИЛИЩЕ ===========
let users = {};
let pendingOrders = {}; // Для хранения расчетов перед заявкой

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
  delete pendingOrders[chatId];
  
  bot.sendMessage(
    chatId,
    '🏭 *Калькулятор секционных ворот*\n\n' +
    'Рассчитайте стоимость за 1 минуту!\n\n' +
    '✅ Точный расчет по размерам\n' +
    '✅ Учет автоматики и установки\n' +
    '✅ Автоматические скидки\n\n' +
    '👇 Нажмите кнопку для начала:',
    { parse_mode: 'Markdown', ...keyboards.start }
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
    delete pendingOrders[chatId];
    bot.sendMessage(chatId, '🚀 Начать расчет?', keyboards.start);
    return;
  }
  
  // Главная кнопка
  if (text === '🚀 Начать расчет') {
    user.step = 'askSize';
    bot.sendMessage(
      chatId,
      '📏 *Вам известны размеры проёма?*\n\n' +
      'Для точного расчета нужны ширина и высота в миллиметрах.',
      { parse_mode: 'Markdown', ...keyboards.knowsSize }
    );
    return;
  }
  
  // Шаг 1: Знает размеры?
  if (user.step === 'askSize') {
    if (text === '✅ Знаю размеры') {
      user.step = 'askWidth';
      bot.sendMessage(
        chatId,
        '📏 *Введите ширину проёма (мм):*\n\n' +
        'Пример: 2900, 3000, 3500\n' +
        'Диапазон: от 2000 до 6000 мм',
        { parse_mode: 'Markdown' }
      );
    } else if (text === '📞 Вызвать замерщика') {
      bot.sendMessage(
        chatId,
        '👷 *БЕСПЛАТНЫЙ ВЫЕЗД ЗАМЕРЩИКА!*\n\n' +
        '✅ Профессиональный замер всех параметров\n' +
        '✅ Консультация специалиста на месте\n' +
        '✅ Учет всех нюансов установки\n\n' +
        '📞 *Позвоните для вызова:*\n' +
        '8 (923) 811-54-32\n\n' +
        '💬 *Или напишите менеджеру:*\n' +
        '@systema365',
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
      bot.sendMessage(chatId, '❌ Пожалуйста, введите число от 2000 до 6000 мм');
      return;
    }
    user.width = width;
    user.step = 'askHeight';
    bot.sendMessage(
      chatId, 
      `✅ *Ширина:* ${width} мм\n\n📏 *Введите высоту проёма (мм):*\n\n` +
      'Пример: 2100, 2200, 2500\n' +
      'Диапазон: от 1800 до 3000 мм',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // Шаг 3: Высота
  if (user.step === 'askHeight') {
    const height = parseInt(text);
    if (isNaN(height) || height < 1800 || height > 3000) {
      bot.sendMessage(chatId, '❌ Пожалуйста, введите число от 1800 до 3000 мм');
      return;
    }
    user.height = height;
    user.step = 'askAutomation';
    bot.sendMessage(
      chatId,
      `✅ *Размеры проема:* ${user.width} × ${height} мм\n\n⚙️ *Планируете открывать ворота пультом?*\n\n` +
      'Автоматика позволяет управлять воротами с дистанционного пульта.',
      { parse_mode: 'Markdown', ...keyboards.automation }
    );
    return;
  }
  
  // Шаг 4: Автоматика
  if (user.step === 'askAutomation') {
    if (text === '✅ С пультом') {
      user.automation = true;
      user.step = 'askInstallation';
      bot.sendMessage(
        chatId, 
        '🏗️ *Нужна ли установка ворот?*\n\n' +
        '*Установка "под ключ" включает:*\n' +
        '• Монтаж ворот на объекте\n' +
        '• Настройка автоматики (если выбрана)\n' +
        '• Гарантия на работы\n\n' +
        '*Только поставка:*\n' +
        '• Ворота доставляются готовыми\n' +
        '• Установка своими силами',
        { parse_mode: 'Markdown', ...keyboards.installation }
      );
    } else if (text === '❌ Без автоматики') {
      user.automation = false;
      user.step = 'askInstallation';
      bot.sendMessage(
        chatId,
        '🏗️ *Нужна ли установка ворот?*\n\n' +
        '*Установка "под ключ" включает:*\n' +
        '• Монтаж ворот на объекте\n' +
        '• Гарантия на работы\n\n' +
        '*Только поставка:*\n' +
        '• Ворота доставляются готовыми\n' +
        '• Установка своими силами',
        { parse_mode: 'Markdown', ...keyboards.installation }
      );
    }
    return;
  }
  
  // Шаг 5: Установка
  if (user.step === 'askInstallation') {
    if (text === '✅ Установка под ключ') {
      user.installation = true;
      showCalculationResult(chatId, user);
    } else if (text === '❌ Установлю сам') {
      user.installation = false;
      showCalculationResult(chatId, user);
    }
    return;
  }
});

// =========== РАСЧЕТ И РЕЗУЛЬТАТ ===========
function showCalculationResult(chatId, user) {
  // Расчет
  const area = (user.width / 1000) * (user.height / 1000);
  let price = area * 18000;
  if (user.automation) price += 45000;
  if (user.installation) price += 25000;
  
  // Скидка
  let discount = 0;
  let discountText = '';
  if (price > 200000) {
    discount = 0.10;
    discountText = ' (скидка 10% за заказ от 200 000 ₽)';
  } else if (price > 150000) {
    discount = 0.07;
    discountText = ' (скидка 7% за заказ от 150 000 ₽)';
  } else if (price > 100000) {
    discount = 0.05;
    discountText = ' (скидка 5% за заказ от 100 000 ₽)';
  }
  
  const finalPrice = Math.round(price * (1 - discount));
  const currentDate = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  
  // Сохраняем расчет для возможной заявки
  pendingOrders[chatId] = {
    data: { ...user },
    finalPrice,
    area: area.toFixed(2),
    date: currentDate
  };
  
  // Формируем сообщение
  const message = 
    `✅ *Предварительный расчет готов!*\n\n` +
    `📋 *Комплектация заказа:*\n` +
    `Ворота секционные с пружинами растяжения\n\n` +
    `• Ширина: ${user.width} мм\n` +
    `• Высота: ${user.height} мм\n` +
    `• Автоматика: ${user.automation ? 'Да (с пультом ДУ)' : 'Нет (ручное управление)'}\n` +
    `• Установка: ${user.installation ? 'Да (под ключ)' : 'Нет (самостоятельная установка)'}\n\n` +
    `💰 *Итого: ~${finalPrice.toLocaleString('ru-RU')} ₽*${discountText}\n\n` +
    `📝 *Расчет предварительный!*\n` +
    `Точную стоимость на ${currentDate} с учетом всех актуальных скидок подскажет менеджер.\n\n` +
    `👇 *Для получения точного расчета:*`;
  
  // Кнопки под сообщением
  const buttons = {
    reply_markup: {
      inline_keyboard: [
        [
          { 
            text: '📱 Оставить заявку на точный расчет', 
            callback_data: 'request_exact_calc'
          }
        ],
        [
          { 
            text: '💬 Написать менеджеру', 
            url: 'https://t.me/systema365' 
          },
          { 
            text: '📞 Позвонить', 
            url: 'tel:89238115432' 
          }
        ],
        [
          { 
            text: '🔄 Новый расчет', 
            callback_data: 'new_calculation' 
          }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId, message, { 
    parse_mode: 'Markdown', 
    disable_web_page_preview: true,
    ...buttons 
  });
  
  // Очищаем временные данные, но оставляем расчет
  users[chatId] = { step: 'start' };
}

// =========== КНОПКИ ПОД СООБЩЕНИЕМ ===========
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const user = query.from;
  
  if (query.data === 'request_exact_calc') {
    const order = pendingOrders[chatId];
    
    if (!order) {
      bot.sendMessage(chatId, '❌ Расчет не найден. Пожалуйста, выполните расчет заново.');
      return;
    }
    
    // Показываем заявку и запрашиваем телефон
    const requestMessage = 
      `📋 *ВАША ЗАЯВКА НА ТОЧНЫЙ РАСЧЕТ*\n\n` +
      `• Ширина: ${order.data.width} мм\n` +
      `• Высота: ${order.data.height} мм\n` +
      `• Автоматика: ${order.data.automation ? 'Да' : 'Нет'}\n` +
      `• Установка: ${order.data.installation ? 'Под ключ' : 'Сам'}\n` +
      `• Примерная стоимость: ~${order.finalPrice.toLocaleString('ru-RU')} ₽\n\n` +
      `👇 *Укажите ваш номер телефона, и менеджер свяжется для уточнения деталей:*\n\n` +
      `_Например: +7 999 123-45-67 или 89991234567_`;
    
    bot.sendMessage(chatId, requestMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        selective: true,
        input_field_placeholder: 'Ваш номер телефона'
      }
    }).then(sentMessage => {
      // Ожидаем ответ с номером телефона
      bot.onReplyToMessage(sentMessage.chat.id, sentMessage.message_id, (phoneMsg) => {
        const phone = phoneMsg.text.trim();
        const requestId = 'REQ-' + Date.now().toString().slice(-6);
        
        // Подтверждение клиенту
        bot.sendMessage(
          chatId,
          `📨 *Заявка #${requestId} принята!*\n\n` +
          `✅ Ваш номер: ${phone}\n` +
          `✅ Параметры расчета сохранены\n\n` +
          `⏱️ *Менеджер @systema365 свяжется в течение 15 минут*\n\n` +
          `📞 *Также вы можете позвонить:*\n` +
          `8 (923) 811-54-32\n\n` +
          `💬 *Быстрая связь:*`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { 
                  text: '💬 Написать менеджеру', 
                  url: 'https://t.me/systema365' 
                },
                { 
                  text: '📞 Позвонить', 
                  url: 'tel:89238115432' 
                }
              ]]
            }
          }
        );
        
        // Уведомление админу (если настроен ADMIN_CHAT_ID в переменных окружения)
        const adminChatId = process.env.ADMIN_CHAT_ID;
        if (adminChatId) {
          const adminMessage = 
            `🔥 *НОВАЯ ЗАЯВКА НА РАСЧЕТ #${requestId}*\n\n` +
            `👤 *Клиент:* ${user.first_name}${user.last_name ? ' ' + user.last_name : ''}\n` +
            `👤 Username: @${user.username || 'нет'}\n` +
            `🆔 ID: ${chatId}\n` +
            `📱 Телефон: ${phone}\n` +
            `📅 Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
            `📏 *Параметры заявки:*\n` +
            `• Ширина: ${order.data.width} мм\n` +
            `• Высота: ${order.data.height} мм\n` +
            `• Автоматика: ${order.data.automation ? 'Да' : 'Нет'}\n` +
            `• Установка: ${order.data.installation ? 'Под ключ' : 'Сам'}\n` +
            `💰 *Примерная стоимость:* ~${order.finalPrice.toLocaleString('ru-RU')} ₽\n\n` +
            `💬 *Для связи с клиентом:*`;
          
          bot.sendMessage(adminChatId, adminMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { 
                  text: '📞 Позвонить клиенту', 
                  url: `tel:${phone.replace(/\D/g, '')}` 
                }
              ]]
            }
          });
        }
        
        // Очищаем сохраненный расчет
        delete pendingOrders[chatId];
      });
    });
    
  } else if (query.data === 'new_calculation') {
    users[chatId] = { step: 'start' };
    delete pendingOrders[chatId];
    bot.sendMessage(chatId, '🚀 Начать новый расчет?', keyboards.start);
  } else if (query.data === 'call') {
    bot.sendMessage(chatId, '📞 *Телефон для связи:*\n8 (923) 811-54-32', { parse_mode: 'Markdown' });
  }
  
  bot.answerCallbackQuery(query.id);
});

// =========== ОШИБКИ ===========
bot.on('polling_error', (error) => {
  console.log('Ошибка бота:', error.message);
});

bot.on('error', (error) => {
  console.log('Общая ошибка:', error.message);
});

console.log('🤖 Бот полностью готов к работе!');
console.log('📞 Телефон: 8 (923) 811-54-32');
console.log('👨‍💼 Менеджер: @systema365');
console.log('\n✅ Все функции активированы:');
console.log('  • Расчет стоимости с скидками');
console.log('  • Заявки на точный расчет');
console.log('  • Кликабельные телефоны');
console.log('  • Кнопка "Начать сначала"');
