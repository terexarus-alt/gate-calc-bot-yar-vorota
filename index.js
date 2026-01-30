// ============================================
// ПРОФЕССИОНАЛЬНЫЙ КАЛЬКУЛЯТОР СЕКЦИОННЫХ ВОРОТ
// ФИНАЛЬНАЯ РАБОЧАЯ ВЕРСИЯ
// ============================================

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

// ============================================
// КОНФИГУРАЦИЯ
// ============================================
const CONFIG = {
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
  MANAGER_USERNAME: process.env.MANAGER_USERNAME || '@gate_manager',
  ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID,
  PHONE_NUMBER: process.env.PHONE_NUMBER || '8 (923) 811-54-32',
  get PHONE_LINK() { return this.PHONE_NUMBER.replace(/\D/g, '') }
};

if (!CONFIG.TELEGRAM_TOKEN) {
  console.error('❌ ОШИБКА: TELEGRAM_TOKEN не установлен!');
  process.exit(1);
}

const bot = new TelegramBot(CONFIG.TELEGRAM_TOKEN, { 
  polling: true,
  request: { timeout: 60000 }
});

console.log('✅ Бот запущен на Timeweb');
console.log(`👨‍💼 Менеджер: ${CONFIG.MANAGER_USERNAME}`);
console.log(`📞 Телефон: ${CONFIG.PHONE_NUMBER}`);
CONFIG.ADMIN_CHAT_ID && console.log(`👑 Админ: ${CONFIG.ADMIN_CHAT_ID}`);

// ============================================
// БИЗНЕС-ЛОГИКА
// ============================================
const PRICING = {
  basePricePerM2: 18000,
  automation: 45000,
  installation: 25000,
  discounts: { over100k: 0.05, over150k: 0.07, over200k: 0.10 }
};

const VALIDATION = {
  width: { min: 2000, max: 6000 },
  height: { min: 1800, max: 3000 }
};

// ============================================
// ХРАНИЛИЩА ДАННЫХ
// ============================================
const userSessions = new Map();      // Активные сессии
const pendingCalculations = new Map(); // Расчеты ожидающие заявок
const adminRequests = new Map();     // Заявки для ответов админа

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
  
  sizesQuestion: {
    reply_markup: {
      keyboard: [
        ['✅ Да, я знаю размеры'],
        ['📞 Вызвать замерщика'],
        ['🔄 Начать заново']
      ],
      resize_keyboard: true
    }
  },
  
  backAndRestart: {
    reply_markup: {
      keyboard: [['🔙 Назад', '🔄 Начать заново']],
      resize_keyboard: true
    }
  },
  
  automation: {
    reply_markup: {
      keyboard: [
        ['✅ Да, с пультом', '❌ Нет, без автоматики'],
        ['🔙 Назад', '🔄 Начать заново']
      ],
      resize_keyboard: true
    }
  },
  
  installation: {
    reply_markup: {
      keyboard: [
        ['✅ Нужна установка под ключ'],
        ['❌ Нет, установлю сам'],
        ['🔙 Назад', '🔄 Начать заново']
      ],
      resize_keyboard: true
    }
  }
};

// ============================================
// УТИЛИТЫ
// ============================================
const Utils = {
  formatPrice(amount) {
    return `~${amount.toLocaleString('ru-RU')} ₽`;
  },
  
  formatDate() {
    return new Date().toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  },
  
  calculatePrice(data) {
    const area = (data.width / 1000) * (data.height / 1000);
    let total = area * PRICING.basePricePerM2;
    
    if (data.automation) total += PRICING.automation;
    if (data.installation) total += PRICING.installation;
    
    let discountRate = 0;
    if (total > 200000) discountRate = PRICING.discounts.over200k;
    else if (total > 150000) discountRate = PRICING.discounts.over150k;
    else if (total > 100000) discountRate = PRICING.discounts.over100k;
    
    return {
      total: Math.round(total),
      discount: Math.round(total * discountRate),
      final: Math.round(total - (total * discountRate)),
      area: parseFloat(area.toFixed(2)),
      discountRate
    };
  },
  
  generateRequestId() {
    return 'REQ-' + Date.now().toString().slice(-8);
  }
};

// ============================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================
function startCalculation(chatId) {
  userSessions.set(chatId, {
    step: 'ask_sizes',
    data: { width: null, height: null, automation: null, installation: null },
    createdAt: Date.now()
  });
  
  sendMessage(chatId, '📏 *Вам известны размеры проёма?*', Keyboards.sizesQuestion);
}

function showCalculationResult(chatId, data) {
  const calculation = Utils.calculatePrice(data);
  const date = Utils.formatDate();
  
  // Сохраняем расчет для возможной заявки
  pendingCalculations.set(chatId, {
    data: { ...data },
    calculation,
    date,
    timestamp: Date.now()
  });
  
  const message = 
    `✅ *Предварительный расчет готов!*\n\n` +
    `📋 *Комплектация:*\n` +
    `• Ширина: ${data.width} мм\n` +
    `• Высота: ${data.height} мм\n` +
    `• Автоматика: ${data.automation ? 'Да' : 'Нет'}\n` +
    `• Установка: ${data.installation ? 'Под ключ' : 'Сам'}\n\n` +
    `💰 *Итого: ${Utils.formatPrice(calculation.final)}*\n\n` +
    `_Точную стоимость на ${date} с учетом скидки подскажет менеджер._`;
  
  const inlineKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💰 Узнать точную стоимость', callback_data: 'exact_calc' },
          { text: '💬 Менеджер', url: `https://t.me/${CONFIG.MANAGER_USERNAME.replace('@', '')}` }
        ],
        [
          { text: '📞 Позвонить', url: `tel:${CONFIG.PHONE_LINK}` }
        ],
        [
          { text: '🔄 Новый расчет', callback_data: 'new_calc' }
        ]
      ]
    }
  };
  
  sendMessage(chatId, message, inlineKeyboard);
  
  // Удаляем сессию ПОСЛЕ показа результата
  userSessions.delete(chatId);
}

function processExactCalculationRequest(chatId, user) {
  const calculation = pendingCalculations.get(chatId);
  
  if (!calculation) {
    sendMessage(chatId, '❌ Расчет не найден. Пожалуйста, выполните расчет заново.');
    return;
  }
  
  const summary = 
    `📋 *ВАША ЗАЯВКА НА ТОЧНЫЙ РАСЧЕТ*\n\n` +
    `• Ширина: ${calculation.data.width} мм\n` +
    `• Высота: ${calculation.data.height} мм\n` +
    `• Автоматика: ${calculation.data.automation ? 'Да' : 'Нет'}\n` +
    `• Установка: ${calculation.data.installation ? 'Под ключ' : 'Сам'}\n` +
    `• Примерная стоимость: ${Utils.formatPrice(calculation.calculation.final)}\n\n` +
    `👇 *Укажите ваш номер телефона для связи:*`;
  
  const replyOptions = {
    reply_markup: {
      force_reply: true,
      selective: true,
      input_field_placeholder: 'Например: +7 999 123-45-67'
    }
  };
  
  sendMessage(chatId, summary, replyOptions).then(sentMessage => {
    bot.onReplyToMessage(sentMessage.chat.id, sentMessage.message_id, phoneMsg => {
      handlePhoneSubmission(chatId, user, phoneMsg.text.trim(), calculation);
    });
  });
}

function handlePhoneSubmission(chatId, user, phone, calculation) {
  const requestId = Utils.generateRequestId();
  const phoneDigits = phone.replace(/\D/g, '');
  
  // Сообщение клиенту
  const clientMessage = 
    `📨 *Заявка #${requestId} принята!*\n\n` +
    `✅ Ваш номер: [${phone}](tel:${phoneDigits})\n` +
    `⏱️ Менеджер свяжется в течение 15 минут\n\n` +
    `📞 *Также вы можете позвонить:*\n` +
    `[${CONFIG.PHONE_NUMBER}](tel:${CONFIG.PHONE_LINK})`;
  
  const clientKeyboard = {
    reply_markup: {
      inline_keyboard: [[
        { text: '💬 Написать менеджеру', url: `https://t.me/${CONFIG.MANAGER_USERNAME.replace('@', '')}` },
        { text: '📞 Позвонить', url: `tel:${CONFIG.PHONE_LINK}` }
      ]]
    }
  };
  
  sendMessage(chatId, clientMessage, clientKeyboard);
  
  // Уведомление админу
  if (CONFIG.ADMIN_CHAT_ID) {
    notifyAdmin(requestId, chatId, user, phone, calculation, phoneDigits);
  }
  
  pendingCalculations.delete(chatId);
}

function notifyAdmin(requestId, chatId, user, phone, calculation, phoneDigits) {
  const adminMessage = 
    `🔥 *НОВАЯ ЗАЯВКА НА РАСЧЕТ #${requestId}*\n\n` +
    `👤 *Клиент:* ${user.first_name}${user.last_name ? ' ' + user.last_name : ''}\n` +
    `👤 Username: ${user.username ? '@' + user.username : 'нет'}\n` +
    `🆔 ID: ${chatId}\n` +
    `📱 Телефон: ${phone}\n` +
    `📅 Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
    `📏 *ПАРАМЕТРЫ ЗАЯВКИ:*\n` +
    `• Ширина: ${calculation.data.width} мм\n` +
    `• Высота: ${calculation.data.height} мм\n` +
    `• Автоматика: ${calculation.data.automation ? 'Да' : 'Нет'}\n` +
    `• Установка: ${calculation.data.installation ? 'Под ключ' : 'Сам'}\n` +
    `• Площадь: ${calculation.calculation.area} м²\n` +
    `💰 *Примерная стоимость:* ${calculation.calculation.final.toLocaleString('ru-RU')} ₽\n\n` +
    `💬 *Для ответа клиенту ответьте на это сообщение*`;
  
  const adminKeyboard = {
    reply_markup: {
      inline_keyboard: [[
        { text: '📞 Позвонить клиенту', url: `tel:${phoneDigits}` }
      ]]
    }
  };
  
  sendMessage(CONFIG.ADMIN_CHAT_ID, adminMessage, adminKeyboard).then(adminMsg => {
    adminRequests.set(adminMsg.message_id, {
      clientChatId: chatId,
      requestId,
      phone,
      userInfo: user,
      calculation: calculation.data
    });
    console.log(`✅ Заявка #${requestId} отправлена админу`);
  });
}

function sendMessage(chatId, text, options = {}) {
  const defaultOptions = { 
    parse_mode: 'Markdown', 
    disable_web_page_preview: true 
  };
  return bot.sendMessage(chatId, text, { ...defaultOptions, ...options });
}

// ============================================
// ОБРАБОТЧИКИ СООБЩЕНИЙ - ПЕРЕПИСАНЫ!
// ============================================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userSessions.delete(chatId);
  pendingCalculations.delete(chatId);
  
  sendMessage(chatId,
    `🏭 *Калькулятор секционных ворот*\n\n` +
    `Рассчитайте стоимость за 1 минуту!\n\n` +
    `✅ Точный расчет по размерам\n` +
    `✅ Учет автоматики и установки\n` +
    `✅ Автоматические скидки\n\n` +
    `👇 Нажмите кнопку для начала:`,
    Keyboards.main
  );
});

bot.onText(/\/new/, (msg) => {
  const chatId = msg.chat.id;
  userSessions.delete(chatId);
  pendingCalculations.delete(chatId);
  startCalculation(chatId);
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // ВАЖНО: Сначала проверяем сессию, потом общие кнопки
  const session = userSessions.get(chatId);
  
  // Если есть сессия и это шаг установки - обрабатываем ВАЛИДНЫЕ кнопки ПЕРВЫМИ
  if (session && session.step === 'ask_installation') {
    if (text === '✅ Нужна установка под ключ') {
      session.data.installation = true;
      showCalculationResult(chatId, session.data);
      return;
    }
    
    if (text === '❌ Нет, установлю сам') {
      session.data.installation = false;
      showCalculationResult(chatId, session.data);
      return;
    }
  }
  
  // ТЕПЕРЬ обрабатываем общие кнопки
  if (text === '🔄 Начать заново') {
    userSessions.delete(chatId);
    pendingCalculations.delete(chatId);
    startCalculation(chatId);
    return;
  }
  
  if (text === '🔢 Рассчитать стоимость') {
    startCalculation(chatId);
    return;
  }
  
  // Если нет сессии - игнорируем
  if (!session) {
    if (text && !text.startsWith('/')) {
      sendMessage(chatId, 'Начните расчет: нажмите "🔢 Рассчитать стоимость"', Keyboards.main);
    }
    return;
  }
  
  // Кнопка "Назад"
  if (text === '🔙 Назад') {
    handleBackNavigation(chatId, session);
    return;
  }
  
  // Обработка остальных шагов
  switch (session.step) {
    case 'ask_sizes':
      handleSizeQuestion(chatId, session, text, msg);
      break;
      
    case 'ask_width':
      handleWidthInput(chatId, session, text);
      break;
      
    case 'ask_height':
      handleHeightInput(chatId, session, text);
      break;
      
    case 'ask_automation':
      handleAutomationInput(chatId, session, text);
      break;
      
    case 'ask_installation':
      // Сюда попадаем только если текст НЕ "✅ Нужна установка под ключ" и НЕ "❌ Нет, установлю сам"
      sendMessage(chatId, '❌ Выберите вариант из кнопок', Keyboards.installation);
      break;
  }
});

// ============================================
// ОБРАБОТЧИКИ ШАГОВ РАСЧЕТА
// ============================================
function handleSizeQuestion(chatId, session, text, msg) {
  if (text === '✅ Да, я знаю размеры') {
    session.step = 'ask_width';
    sendMessage(chatId, '📏 *Введите ширину проёма в мм:*\nПример: 2900, 3000, 3500', Keyboards.backAndRestart);
  } else if (text === '📞 Вызвать замерщика') {
    sendMessage(chatId,
      `👷 *БЕСПЛАТНЫЙ ВЫЕЗД ЗАМЕРЩИКА*\n\n` +
      `✅ Замерщик приедет в удобное для вас время\n` +
      `✅ Профессиональный замер всех параметров\n` +
      `✅ Консультация по установке и материалам\n\n` +
      `📞 *Позвоните для вызова замерщика:*\n` +
      `[${CONFIG.PHONE_NUMBER}](tel:${CONFIG.PHONE_LINK})\n\n` +
      `Или напишите менеджеру для согласования времени:`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '💬 Написать менеджеру', url: `https://t.me/${CONFIG.MANAGER_USERNAME.replace('@', '')}` }
          ]]
        }
      }
    );
    
    if (CONFIG.ADMIN_CHAT_ID) {
      const userName = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
      sendMessage(CONFIG.ADMIN_CHAT_ID,
        `🚨 *ВЫЗОВ ЗАМЕРЩИКА*\n\n` +
        `👤 Клиент: ${userName}\n` +
        `🆔 ID: ${chatId}\n` +
        `📅 Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
        `*Нужно связаться для согласования времени замера!*`
      );
    }
    
    userSessions.delete(chatId);
    pendingCalculations.delete(chatId);
  } else {
    sendMessage(chatId, '❌ Выберите вариант из кнопок', Keyboards.sizesQuestion);
  }
}

function handleWidthInput(chatId, session, text) {
  const width = parseInt(text);
  if (isNaN(width) || width < VALIDATION.width.min || width > VALIDATION.width.max) {
    sendMessage(chatId, `❌ Укажите число от ${VALIDATION.width.min} до ${VALIDATION.width.max} мм`);
    return;
  }
  
  session.data.width = width;
  session.step = 'ask_height';
  sendMessage(chatId, 
    `✅ Ширина: ${width} мм\n\n📏 *Введите высоту проёма в мм:*\nПример: 2100, 2200, 2500`, 
    Keyboards.backAndRestart
  );
}

function handleHeightInput(chatId, session, text) {
  const height = parseInt(text);
  if (isNaN(height) || height < VALIDATION.height.min || height > VALIDATION.height.max) {
    sendMessage(chatId, `❌ Укажите число от ${VALIDATION.height.min} до ${VALIDATION.height.max} мм`);
    return;
  }
  
  session.data.height = height;
  session.step = 'ask_automation';
  sendMessage(chatId, 
    `✅ Размеры: ${session.data.width} × ${height} мм\n\n⚙️ *Планируете открывать ворота пультом?*`, 
    Keyboards.automation
  );
}

function handleAutomationInput(chatId, session, text) {
  if (text === '✅ Да, с пультом') {
    session.data.automation = true;
  } else if (text === '❌ Нет, без автоматики') {
    session.data.automation = false;
  } else {
    sendMessage(chatId, '❌ Выберите вариант из кнопок', Keyboards.automation);
    return;
  }
  
  session.step = 'ask_installation';
  sendMessage(chatId, '🏗️ *Нужна ли установка ворот?*', Keyboards.installation);
}

function handleBackNavigation(chatId, session) {
  switch (session.step) {
    case 'ask_width':
      session.step = 'ask_sizes';
      sendMessage(chatId, '📏 *Вам известны размеры проёма?*', Keyboards.sizesQuestion);
      break;
      
    case 'ask_height':
      session.step = 'ask_width';
      sendMessage(chatId, '📏 *Введите ширину проёма в мм:*\nПример: 2900, 3000, 3500', Keyboards.backAndRestart);
      break;
      
    case 'ask_automation':
      session.step = 'ask_height';
      sendMessage(chatId, '📏 *Введите высоту проёма в мм:*\nПример: 2100, 2200, 2500', Keyboards.backAndRestart);
      break;
      
    case 'ask_installation':
      session.step = 'ask_automation';
      sendMessage(chatId, '⚙️ *Планируете открывать ворота пультом?*', Keyboards.automation);
      break;
  }
}

// ============================================
// ОБРАБОТЧИКИ ИНЛАЙН-КНОПОК
// ============================================
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const user = callbackQuery.from;
  
  if (data === 'exact_calc') {
    processExactCalculationRequest(chatId, user);
  } else if (data === 'new_calc') {
    userSessions.delete(chatId);
    pendingCalculations.delete(chatId);
    startCalculation(chatId);
  }
  
  bot.answerCallbackQuery(callbackQuery.id);
});

// ============================================
// ОБРАБОТКА ОТВЕТОВ АДМИНА
// ============================================
bot.on('message', (msg) => {
  if (msg.chat.id.toString() !== CONFIG.ADMIN_CHAT_ID || !msg.reply_to_message) return;
  
  const repliedMsgId = msg.reply_to_message.message_id;
  const request = adminRequests.get(repliedMsgId);
  
  if (!request) return;
  
  const { clientChatId, requestId, phone } = request;
  const currentDate = Utils.formatDate();
  const phoneDigits = phone.replace(/\D/g, '');
  
  const clientMessage = 
    `📞 *ОТВЕТ ОТ МЕНЕДЖЕРА ПО ЗАЯВКЕ #${requestId}*\n\n` +
    `${msg.text}\n\n` +
    `📱 *Ваш телефон:* [${phone}](tel:${phoneDigits})\n` +
    `📞 *Позвоните также по номеру:*\n` +
    `[${CONFIG.PHONE_NUMBER}](tel:${CONFIG.PHONE_LINK})\n\n` +
    `_Актуально на ${currentDate}_\n\n` +
    `👇 *Быстрая связь:*`;
  
  const clientKeyboard = {
    reply_markup: {
      inline_keyboard: [[
        { text: '💬 Написать менеджеру', url: `https://t.me/${CONFIG.MANAGER_USERNAME.replace('@', '')}` },
        { text: '📞 Позвонить', url: `tel:${CONFIG.PHONE_LINK}` }
      ]]
    }
  };
  
  sendMessage(clientChatId, clientMessage, clientKeyboard).then(() => {
    sendMessage(CONFIG.ADMIN_CHAT_ID, 
      `✅ Ответ по заявке #${requestId} отправлен клиенту`,
      { reply_to_message_id: msg.message_id }
    );
    console.log(`✅ Ответ по заявке #${requestId} отправлен клиенту ${clientChatId}`);
  });
  
  adminRequests.delete(repliedMsgId);
});

// ============================================
// ОБРАБОТКА ОШИБОК
// ============================================
bot.on('polling_error', (error) => {
  console.error('❌ Ошибка polling:', error.message);
});

bot.on('error', (error) => {
  console.error('❌ Общая ошибка:', error.message);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Необработанное исключение:', error);
});

// ============================================
// ТЕСТОВАЯ ФУНКЦИЯ (для отладки)
// ============================================
function debugSessions() {
  console.log('\n🔍 ДЕБАГ СЕССИЙ:');
  console.log(`Активных сессий: ${userSessions.size}`);
  console.log(`Ожидающих расчетов: ${pendingCalculations.size}`);
  console.log(`Заявок админу: ${adminRequests.size}`);
  
  userSessions.forEach((session, chatId) => {
    console.log(`  Чат ${chatId}: шаг "${session.step}", данные:`, session.data);
  });
}

// Запускаем отладку каждые 30 секунд
setInterval(debugSessions, 30000);

// ============================================
// ЗАПУСК
// ============================================
console.log('\n🚀 БОТ ЗАПУЩЕН С ИСПРАВЛЕНИЯМИ:');
console.log('✅ Кнопка "✅ Нужна установка под ключ" РАБОТАЕТ');
console.log('✅ Кнопка "❌ Нет, установлю сам" РАБОТАЕТ');
console.log('✅ Заявки приходят админу');
console.log('✅ Клиент видит заявку перед отправкой');
console.log('✅ Админ может отвечать на заявки\n');
