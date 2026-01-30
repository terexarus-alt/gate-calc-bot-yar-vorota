// ============================================
// КАЛЬКУЛЯТОР СЕКЦИОННЫХ ВОРОТ
// УЛЬТРА-ПРОСТАЯ И РАБОЧАЯ ВЕРСИЯ
// ============================================

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

// Конфигурация
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const MANAGER_USERNAME = process.env.MANAGER_USERNAME || '@gate_manager';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const PHONE_NUMBER = process.env.PHONE_NUMBER || '8 (923) 811-54-32';

if (!TELEGRAM_TOKEN) {
  console.error('❌ ОШИБКА: TELEGRAM_TOKEN не установлен!');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
console.log('✅ Бот запущен!');

// Хранилище данных
const userData = new Map(); // chatId -> {step, width, height, automation, installation}
const pendingOrders = new Map(); // chatId -> orderData

// Цены
const PRICES = {
  perM2: 18000,
  automation: 45000,
  installation: 25000
};

// ============================================
// КЛАВИАТУРЫ
// ============================================
const Keyboards = {
  main: {
    reply_markup: {
      keyboard: [['🔢 Рассчитать стоимость']],
      resize_keyboard: true
    }
  },
  
  knowsSizes: {
    reply_markup: {
      keyboard: [
        ['✅ Да, знаю размеры'],
        ['📞 Вызвать замерщика'],
        ['🔄 Начать заново']
      ],
      resize_keyboard: true
    }
  },
  
  automation: {
    reply_markup: {
      keyboard: [
        ['✅ Да, с пультом'],
        ['❌ Нет, без автоматики'],
        ['🔙 Назад', '🔄 Начать заново']
      ],
      resize_keyboard: true
    }
  },
  
  installation: {
    reply_markup: {
      keyboard: [
        ['✅ Установка под ключ'],
        ['❌ Установлю сам'],
        ['🔙 Назад', '🔄 Начать заново']
      ],
      resize_keyboard: true
    }
  }
};

// ============================================
// ГЛАВНЫЙ ОБРАБОТЧИК СООБЩЕНИЙ
// ============================================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Очистка данных при командах
  if (text === '/start' || text === '/new' || text === '🔄 Начать заново') {
    userData.delete(chatId);
    pendingOrders.delete(chatId);
    
    if (text === '🔄 Начать заново') {
      startCalculation(chatId);
    } else {
      sendWelcome(chatId);
    }
    return;
  }
  
  // Начало расчета
  if (text === '🔢 Рассчитать стоимость') {
    startCalculation(chatId);
    return;
  }
  
  // Получаем данные пользователя
  const data = userData.get(chatId) || {};
  
  // Если нет данных, но есть текст - просим начать
  if (!data.step && text && !text.startsWith('/')) {
    sendWelcome(chatId);
    return;
  }
  
  // Обработка по шагам
  switch (data.step) {
    case 'ask_knows_sizes':
      handleKnowsSizes(chatId, text, msg);
      break;
      
    case 'ask_width':
      handleWidth(chatId, text, data);
      break;
      
    case 'ask_height':
      handleHeight(chatId, text, data);
      break;
      
    case 'ask_automation':
      handleAutomation(chatId, text, data);
      break;
      
    case 'ask_installation':
      handleInstallation(chatId, text, data);
      break;
      
    default:
      // Если что-то пошло не так
      userData.delete(chatId);
      sendWelcome(chatId);
  }
});

// ============================================
// ОБРАБОТЧИКИ ШАГОВ
// ============================================
function startCalculation(chatId) {
  userData.set(chatId, { step: 'ask_knows_sizes' });
  bot.sendMessage(
    chatId,
    '📏 *Вам известны размеры проёма?*',
    { parse_mode: 'Markdown', ...Keyboards.knowsSizes }
  );
}

function handleKnowsSizes(chatId, text, msg) {
  if (text === '✅ Да, знаю размеры') {
    userData.set(chatId, { step: 'ask_width', ...userData.get(chatId) });
    bot.sendMessage(
      chatId,
      '📏 *Введите ширину проёма (мм):*\nНапример: 2900, 3000, 3500\n(от 2000 до 6000 мм)',
      { parse_mode: 'Markdown' }
    );
  } else if (text === '📞 Вызвать замерщика') {
    bot.sendMessage(
      chatId,
      `👷 *БЕСПЛАТНЫЙ ВЫЕЗД ЗАМЕРЩИКА*\n\n` +
      `✅ Приедем в удобное время\n` +
      `✅ Профессиональный замер\n` +
      `✅ Консультация специалиста\n\n` +
      `📞 *Позвоните:* ${PHONE_NUMBER}\n\n` +
      `Или напишите менеджеру:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '💬 Написать менеджеру', url: `https://t.me/${MANAGER_USERNAME.replace('@', '')}` }
          ]]
        }
      }
    );
    
    if (ADMIN_CHAT_ID) {
      const userName = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
      bot.sendMessage(
        ADMIN_CHAT_ID,
        `🚨 ВЫЗОВ ЗАМЕРЩИКА\nОт: ${userName}\nID: ${chatId}\nВремя: ${new Date().toLocaleString('ru-RU')}`
      );
    }
    
    userData.delete(chatId);
  }
}

function handleWidth(chatId, text, data) {
  const width = parseInt(text);
  if (isNaN(width) || width < 2000 || width > 6000) {
    bot.sendMessage(chatId, '❌ Введите число от 2000 до 6000 мм');
    return;
  }
  
  const newData = { ...data, width, step: 'ask_height' };
  userData.set(chatId, newData);
  
  bot.sendMessage(
    chatId,
    `✅ Ширина: ${width} мм\n\n📏 *Введите высоту проёма (мм):*\nНапример: 2100, 2200, 2500\n(от 1800 до 3000 мм)`,
    { parse_mode: 'Markdown' }
  );
}

function handleHeight(chatId, text, data) {
  const height = parseInt(text);
  if (isNaN(height) || height < 1800 || height > 3000) {
    bot.sendMessage(chatId, '❌ Введите число от 1800 до 3000 мм');
    return;
  }
  
  const newData = { ...data, height, step: 'ask_automation' };
  userData.set(chatId, newData);
  
  bot.sendMessage(
    chatId,
    `✅ Размеры: ${data.width} × ${height} мм\n\n⚙️ *Планируете открывать ворота пультом?*`,
    { parse_mode: 'Markdown', ...Keyboards.automation }
  );
}

function handleAutomation(chatId, text, data) {
  if (text === '🔙 Назад') {
    userData.set(chatId, { ...data, step: 'ask_width' });
    bot.sendMessage(
      chatId,
      '📏 *Введите ширину проёма (мм):*',
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  if (text !== '✅ Да, с пультом' && text !== '❌ Нет, без автоматики') {
    bot.sendMessage(chatId, '❌ Выберите вариант из кнопок', Keyboards.automation);
    return;
  }
  
  const automation = text === '✅ Да, с пультом';
  const newData = { ...data, automation, step: 'ask_installation' };
  userData.set(chatId, newData);
  
  bot.sendMessage(
    chatId,
    '🏗️ *Нужна ли установка ворот?*',
    { parse_mode: 'Markdown', ...Keyboards.installation }
  );
}

function handleInstallation(chatId, text, data) {
  if (text === '🔙 Назад') {
    userData.set(chatId, { ...data, step: 'ask_automation' });
    bot.sendMessage(
      chatId,
      '⚙️ *Планируете открывать ворота пультом?*',
      { parse_mode: 'Markdown', ...Keyboards.automation }
    );
    return;
  }
  
  if (text !== '✅ Установка под ключ' && text !== '❌ Установлю сам') {
    bot.sendMessage(chatId, '❌ Выберите вариант из кнопок', Keyboards.installation);
    return;
  }
  
  const installation = text === '✅ Установка под ключ';
  const completeData = { ...data, installation };
  
  // Сохраняем полные данные
  userData.set(chatId, completeData);
  
  // Показываем результат
  showCalculationResult(chatId, completeData);
}

// ============================================
// РАСЧЕТ И ПОКАЗ РЕЗУЛЬТАТА
// ============================================
function showCalculationResult(chatId, data) {
  // Расчет стоимости
  const area = (data.width / 1000) * (data.height / 1000);
  let total = area * PRICES.perM2;
  if (data.automation) total += PRICES.automation;
  if (data.installation) total += PRICES.installation;
  
  // Скидка
  let discount = 0;
  if (total > 200000) discount = total * 0.10;
  else if (total > 150000) discount = total * 0.07;
  else if (total > 100000) discount = total * 0.05;
  
  const finalPrice = Math.round(total - discount);
  const date = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  
  // Сохраняем заказ
  pendingOrders.set(chatId, {
    data,
    finalPrice,
    area: area.toFixed(2),
    date
  });
  
  // Формируем сообщение
  const message = 
    `✅ *Предварительный расчет готов!*\n\n` +
    `📋 *Комплектация:*\n` +
    `• Ширина: ${data.width} мм\n` +
    `• Высота: ${data.height} мм\n` +
    `• Автоматика: ${data.automation ? 'Да' : 'Нет'}\n` +
    `• Установка: ${data.installation ? 'Под ключ' : 'Сам'}\n\n` +
    `💰 *Итого: ~${finalPrice.toLocaleString('ru-RU')} ₽*\n\n` +
    `_Точную стоимость на ${date} с учетом скидки подскажет менеджер._`;
  
  const inlineKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💰 Узнать точную стоимость', callback_data: 'get_exact_price' },
          { text: '💬 Менеджер', url: `https://t.me/${MANAGER_USERNAME.replace('@', '')}` }
        ],
        [
          { text: '📞 Позвонить', url: `tel:${PHONE_NUMBER.replace(/\D/g, '')}` }
        ],
        [
          { text: '🔄 Новый расчет', callback_data: 'new_calculation' }
        ]
      ]
    }
  };
  
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...inlineKeyboard });
}

// ============================================
// ОБРАБОТКА ИНЛАЙН-КНОПОК
// ============================================
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const user = callbackQuery.from;
  
  if (data === 'get_exact_price') {
    const order = pendingOrders.get(chatId);
    
    if (!order) {
      bot.sendMessage(chatId, '❌ Расчет не найден. Начните расчет заново.');
      return;
    }
    
    // Показываем заявку и запрашиваем телефон
    const orderSummary = 
      `📋 *ВАША ЗАЯВКА НА ТОЧНЫЙ РАСЧЕТ*\n\n` +
      `• Ширина: ${order.data.width} мм\n` +
      `• Высота: ${order.data.height} мм\n` +
      `• Автоматика: ${order.data.automation ? 'Да' : 'Нет'}\n` +
      `• Установка: ${order.data.installation ? 'Под ключ' : 'Сам'}\n` +
      `• Примерная стоимость: ~${order.finalPrice.toLocaleString('ru-RU')} ₽\n\n` +
      `👇 *Укажите ваш номер телефона:*`;
    
    const message = await bot.sendMessage(chatId, orderSummary, {
      parse_mode: 'Markdown',
      reply_markup: {
        force_reply: true,
        selective: true,
        input_field_placeholder: 'Ваш номер телефона'
      }
    });
    
    // Ожидаем ответ с номером телефона
    bot.onReplyToMessage(message.chat.id, message.message_id, async (phoneMsg) => {
      const phone = phoneMsg.text.trim();
      const requestId = 'REQ-' + Date.now().toString().slice(-6);
      
      // Подтверждение клиенту
      await bot.sendMessage(
        chatId,
        `📨 *Заявка #${requestId} принята!*\n\n` +
        `✅ Ваш номер: ${phone}\n` +
        `⏱️ Менеджер свяжется в течение 15 минут\n\n` +
        `📞 *Позвоните также:*\n${PHONE_NUMBER}`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '💬 Написать менеджеру', url: `https://t.me/${MANAGER_USERNAME.replace('@', '')}` }
            ]]
          }
        }
      );
      
      // Уведомление админу
      if (ADMIN_CHAT_ID) {
        await bot.sendMessage(
          ADMIN_CHAT_ID,
          `🔥 НОВАЯ ЗАЯВКА #${requestId}\n\n` +
          `👤 Клиент: ${user.first_name}${user.last_name ? ' ' + user.last_name : ''}\n` +
          `👤 @${user.username || 'нет'}\n` +
          `🆔 ID: ${chatId}\n` +
          `📱 Телефон: ${phone}\n` +
          `📅 Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
          `📏 Параметры:\n` +
          `• Ширина: ${order.data.width} мм\n` +
          `• Высота: ${order.data.height} мм\n` +
          `• Автоматика: ${order.data.automation ? 'Да' : 'Нет'}\n` +
          `• Установка: ${order.data.installation ? 'Под ключ' : 'Сам'}\n` +
          `💰 ~${order.finalPrice.toLocaleString('ru-RU')} ₽\n\n` +
          `💬 Ответьте на это сообщение для отправки клиенту`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: '📞 Позвонить клиенту', callback_data: `call_${phone.replace(/\D/g, '')}` }
              ]]
            }
          }
        ).then(adminMsg => {
          // Сохраняем связь для ответа
          userData.set(`admin_${adminMsg.message_id}`, {
            clientChatId: chatId,
            requestId,
            phone
          });
        });
      }
      
      pendingOrders.delete(chatId);
    });
    
  } else if (data === 'new_calculation') {
    userData.delete(chatId);
    pendingOrders.delete(chatId);
    startCalculation(chatId);
  } else if (data.startsWith('call_')) {
    const phone = data.replace('call_', '');
    bot.answerCallbackQuery(callbackQuery.id, {
      text: `Телефон: ${phone}`,
      show_alert: true
    });
  }
  
  bot.answerCallbackQuery(callbackQuery.id);
});

// ============================================
// ОБРАБОТКА ОТВЕТОВ АДМИНА
// ============================================
bot.on('message', (msg) => {
  if (msg.chat.id.toString() === ADMIN_CHAT_ID && msg.reply_to_message) {
    const repliedMsgId = msg.reply_to_message.message_id;
    const requestKey = `admin_${repliedMsgId}`;
    const request = userData.get(requestKey);
    
    if (request) {
      const { clientChatId, requestId, phone } = request;
      const currentDate = new Date().toLocaleDateString('ru-RU');
      
      bot.sendMessage(
        clientChatId,
        `📞 *ОТВЕТ ОТ МЕНЕДЖЕРА ПО ЗАЯВКЕ #${requestId}*\n\n` +
        `${msg.text}\n\n` +
        `📱 Ваш телефон: ${phone}\n` +
        `📞 Позвоните также: ${PHONE_NUMBER}\n\n` +
        `_Актуально на ${currentDate}_\n\n` +
        `👇 Быстрая связь:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '💬 Написать менеджеру', url: `https://t.me/${MANAGER_USERNAME.replace('@', '')}` }
            ]]
          }
        }
      ).then(() => {
        bot.sendMessage(
          ADMIN_CHAT_ID,
          `✅ Ответ по заявке #${requestId} отправлен`,
          { reply_to_message_id: msg.message_id }
        );
      });
      
      userData.delete(requestKey);
    }
  }
});

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================
function sendWelcome(chatId) {
  bot.sendMessage(
    chatId,
    `🏭 *Калькулятор секционных ворот*\n\n` +
    `Рассчитайте стоимость за 1 минуту!\n\n` +
    `✅ Точный расчет\n` +
    `✅ Учет автоматики и установки\n` +
    `✅ Автоматические скидки\n\n` +
    `👇 Нажмите кнопку для начала:`,
    { parse_mode: 'Markdown', ...Keyboards.main }
  );
}

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('❌ Ошибка бота:', error.message);
});

// ============================================
// ЗАПУСК
// ============================================
console.log('🚀 Бот готов к работе!');
console.log('📞 Телефон:', PHONE_NUMBER);
console.log('👨‍💼 Менеджер:', MANAGER_USERNAME);
console.log('\n🎯 Функционал:');
console.log('  • Расчет стоимости ворот');
console.log('  • Кнопки установки РАБОТАЮТ ✅');
console.log('  • Заявки админу');
console.log('  • Ответы админа клиентам');
console.log('  • Простая и надежная логика');
