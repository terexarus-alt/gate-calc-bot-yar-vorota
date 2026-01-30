// ============================================
// ПРОФЕССИОНАЛЬНЫЙ КАЛЬКУЛЯТОР ВОРОТ
// ВЕРСИЯ ДЛЯ TIMEWEB
// ============================================

// Загружаем переменные окружения
require('dotenv').config();

// Проверяем обязательные переменные
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const MANAGER_USERNAME = process.env.MANAGER_USERNAME || '@gate_manager';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // ID админа для заявок
const PHONE_NUMBER = process.env.PHONE_NUMBER || '8 (923) 811-54-32';

if (!TELEGRAM_TOKEN) {
  console.error('❌ ОШИБКА: TELEGRAM_TOKEN не установлен!');
  console.error('Добавьте TELEGRAM_TOKEN в переменные окружения Timeweb');
  process.exit(1);
}

// Инициализация бота
const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

console.log('✅ Бот успешно запущен на Timeweb');
console.log(`👨‍💼 Менеджер: ${MANAGER_USERNAME}`);
console.log(`📞 Телефон: ${PHONE_NUMBER}`);
if (ADMIN_CHAT_ID) console.log(`👑 Админ: ${ADMIN_CHAT_ID}`);

// Прайс в коде (не нужно отдельного файла)
const PRICES = {
  basePricePerM2: 18000,
  automation: 45000,
  installation: 25000,
  discounts: {
    over100k: 0.05,
    over150k: 0.07,
    over200k: 0.10
  }
};

// Хранилище сессий
const userSessions = new Map();

// ============================================
// ГЛАВНОЕ МЕНЮ
// ============================================
const mainMenu = {
  reply_markup: {
    keyboard: [['🔢 Рассчитать стоимость']], // Измененный эмодзи
    resize_keyboard: true
  }
};

// ============================================
// КОМАНДА /start
// ============================================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(
    chatId,
    `🏭 *Калькулятор секционных ворот*\n\n` +
    `Рассчитайте стоимость за 1 минуту!\n\n` +
    `✅ Точный расчет по размерам\n` +
    `✅ Учет автоматики и установки\n` +
    `✅ Автоматические скидки\n\n` +
    `👇 Нажмите кнопку для начала:`,
    {
      parse_mode: 'Markdown',
      ...mainMenu
    }
  );
});

// ============================================
// НАЧАЛО РАСЧЕТА
// ============================================
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (text === '🔢 Рассчитать стоимость') { // Измененный эмодзи
    startCalculation(chatId);
  }
  
  // Обработка шагов расчета
  const session = userSessions.get(chatId);
  if (!session) return;
  
  // Шаг 1: Вопрос про размеры
  if (session.step === 'ask_sizes') {
    if (text === '✅ Да, я знаю размеры') {
      session.step = 'ask_width';
      bot.sendMessage(
        chatId,
        '📏 *Введите ширину проёма в мм:*\nПример: 2900, 3000, 3500',
        { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } }
      );
    } else if (text === '📞 Вызвать замерщика') {
      // Уведомление клиенту
      bot.sendMessage(
        chatId,
        `👷 *БЕСПЛАТНЫЙ ВЫЕЗД ЗАМЕРЩИКА*\n\n` +
        `✅ Замерщик приедет в удобное для вас время\n` +
        `✅ Профессиональный замер всех параметров\n` +
        `✅ Консультация по установке и материалам\n\n` +
        `📞 *Позвоните для вызова замерщика:*\n` +
        `${PHONE_NUMBER}\n\n` +
        `Или напишите менеджеру для согласования времени:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '💬 Написать менеджеру', url: `https://t.me/${MANAGER_USERNAME.replace('@', '')}` }
            ]]
          }
        }
      );
      
      // Уведомление админу о вызове замерщика
      if (ADMIN_CHAT_ID) {
        const userName = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
        bot.sendMessage(
          ADMIN_CHAT_ID,
          `🚨 *ВЫЗОВ ЗАМЕРЩИКА*\n\n` +
          `👤 Клиент: ${userName}\n` +
          `🆔 ID: ${chatId}\n` +
          `📅 Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
          `*Нужно связаться для согласования времени замера!*`,
          { parse_mode: 'Markdown' }
        );
      }
      
      userSessions.delete(chatId);
    }
  }
  
  // Шаг 2: Ширина
  else if (session.step === 'ask_width') {
    const width = parseInt(text);
    if (isNaN(width) || width < 2000 || width > 6000) {
      bot.sendMessage(chatId, '❌ Укажите число от 2000 до 6000 мм');
      return;
    }
    
    session.data.width = width;
    session.step = 'ask_height';
    
    bot.sendMessage(
      chatId,
      `✅ Ширина: ${width} мм\n\n` +
      '📏 *Введите высоту проёма в мм:*\nПример: 2100, 2200, 2500',
      { parse_mode: 'Markdown' }
    );
  }
  
  // Шаг 3: Высота
  else if (session.step === 'ask_height') {
    const height = parseInt(text);
    if (isNaN(height) || height < 1800 || height > 3000) {
      bot.sendMessage(chatId, '❌ Укажите число от 1800 до 3000 мм');
      return;
    }
    
    session.data.height = height;
    session.step = 'ask_automation';
    
    bot.sendMessage(
      chatId,
      `✅ Размеры: ${session.data.width} × ${height} мм\n\n` +
      '⚙️ *Планируете открывать ворота пультом?*',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [['✅ Да, с пультом', '❌ Нет, без автоматики']],
          resize_keyboard: true
        }
      }
    );
  }
  
  // Шаг 4: Автоматика
  else if (session.step === 'ask_automation') {
    if (text === '✅ Да, с пультом') {
      session.data.automation = true;
    } else if (text === '❌ Нет, без автоматики') {
      session.data.automation = false;
    } else {
      bot.sendMessage(chatId, '❌ Выберите вариант из кнопок');
      return;
    }
    
    session.step = 'ask_installation';
    
    bot.sendMessage(
      chatId,
      '🏗️ *Нужна ли установка ворот?*',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            ['✅ Нужна установка под ключ'],
            ['❌ Нет, установлю сам']
          ],
          resize_keyboard: true
        }
      }
    );
  }
  
  // Шаг 5: Установка
  else if (session.step === 'ask_installation') {
    if (text === '✅ Нужна установка под ключ') {
      session.data.installation = true;
    } else if (text === '❌ Нет, установлю сам') {
      session.data.installation = false;
    } else {
      bot.sendMessage(chatId, '❌ Выберите вариант из кнопок');
      return;
    }
    
    // Показываем результат
    showResult(chatId, session.data);
    userSessions.delete(chatId);
  }
});

// ============================================
// ФУНКЦИИ
// ============================================
function startCalculation(chatId) {
  userSessions.set(chatId, {
    step: 'ask_sizes',
    data: {
      width: null,
      height: null,
      automation: null,
      installation: null
    }
  });
  
  bot.sendMessage(
    chatId,
    '📏 *Вам известны размеры проёма?*',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          ['✅ Да, я знаю размеры'],
          ['📞 Вызвать замерщика']
        ],
        resize_keyboard: true
      }
    }
  );
}

function showResult(chatId, data) {
  // Расчет площади
  const area = (data.width / 1000) * (data.height / 1000);
  
  // Расчет стоимости
  let total = area * PRICES.basePricePerM2;
  if (data.automation) total += PRICES.automation;
  if (data.installation) total += PRICES.installation;
  
  // Скидка
  let discountRate = 0;
  if (total > 200000) discountRate = PRICES.discounts.over200k;
  else if (total > 150000) discountRate = PRICES.discounts.over150k;
  else if (total > 100000) discountRate = PRICES.discounts.over100k;
  
  const discount = total * discountRate;
  const finalPrice = Math.round(total - discount);
  
  // Сохраняем данные расчета для админа
  const calculationData = {
    chatId,
    data,
    finalPrice,
    timestamp: new Date().toISOString(),
    userInfo: userSessions.get(chatId)?.userInfo || {}
  };
  
  // Формируем сообщение клиенту
  const message = 
    `✅ *Расчет готов!*\n\n` +
    `📋 *Комплектация:*\n` +
    `• Ширина: ${data.width} мм\n` +
    `• Высота: ${data.height} мм\n` +
    `• Автоматика: ${data.automation ? 'Да' : 'Нет'}\n` +
    `• Установка: ${data.installation ? 'Под ключ' : 'Сам'}\n\n` +
    `💰 *Итого: ${finalPrice.toLocaleString('ru-RU')} ₽*\n` +
    `*Стоимость указана с учетом скидки.*`;
  
  bot.sendMessage(
    chatId,
    message,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 Получить точный расчет', callback_data: 'exact_calc' },
            { text: '💬 Написать менеджеру', url: `https://t.me/${MANAGER_USERNAME.replace('@', '')}` }
          ],
          [
            { text: '🔄 Новый расчет', callback_data: 'new_calc' }
          ]
        ]
      }
    }
  );
}

// ============================================
// ОБРАБОТКА ИНЛАЙН-КНОПОК
// ============================================
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  
  if (data === 'exact_calc') {
    // Сохраняем информацию о пользователе
    const user = callbackQuery.from;
    const userInfo = {
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name
    };
    
    // Запрос контактных данных у клиента
    await bot.sendMessage(
      chatId,
      `📋 *ЗАЯВКА НА ТОЧНЫЙ РАСЧЕТ*\n\n` +
      `Пожалуйста, укажите ваш номер телефона для связи:\n` +
      `(Напишите номер в любом формате)`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          force_reply: true,
          selective: true
        }
      }
    ).then((sentMessage) => {
      // Ждем ответ с номером телефона
      bot.onReplyToMessage(sentMessage.chat.id, sentMessage.message_id, async (phoneMsg) => {
        const phone = phoneMsg.text;
        const requestId = 'REQ-' + Date.now().toString().slice(-6);
        
        // Сообщение клиенту
        await bot.sendMessage(
          chatId,
          `📨 *Заявка #${requestId} принята!*\n\n` +
          `✅ Ваш номер: ${phone}\n` +
          `⏱️ Менеджер свяжется в течение 15 минут\n\n` +
          `📞 *Также вы можете позвонить:*\n` +
          `${PHONE_NUMBER}`,
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
            `🔥 *НОВАЯ ЗАЯВКА НА РАСЧЕТ #${requestId}*\n\n` +
            `👤 *Клиент:* ${user.first_name}${user.last_name ? ' ' + user.last_name : ''}\n` +
            `👤 Username: ${user.username ? '@' + user.username : 'нет'}\n` +
            `🆔 ID: ${chatId}\n` +
            `📱 Телефон: ${phone}\n` +
            `📅 Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
            `📏 *Параметры заявки:*\n` +
            `• Ширина: ${callbackQuery.message.text.match(/Ширина: (\d+)/)?.[1] || 'не указано'} мм\n` +
            `• Высота: ${callbackQuery.message.text.match(/Высота: (\d+)/)?.[1] || 'не указано'} мм\n` +
            `• Автоматика: ${callbackQuery.message.text.includes('Автоматика: Да') ? 'Да' : 'Нет'}\n` +
            `• Установка: ${callbackQuery.message.text.includes('Под ключ') ? 'Под ключ' : 'Сам'}\n` +
            `💰 *Примерная стоимость:* ${callbackQuery.message.text.match(/Итого: ([\d\s]+) ₽/)?.[1] || 'не рассчитано'}\n\n` +
            `💬 *Для ответа клиенту:*\n` +
            `1. Ответьте на это сообщение\n` +
            `2. Напишите цену и условия\n` +
            `3. Я перешлю ваш ответ клиенту`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[
                  { text: '📞 Позвонить клиенту', callback_data: `call_${phone.replace(/\D/g, '')}` }
                ]]
              }
            }
          ).then((adminMsg) => {
            // Сохраняем связь между сообщением админа и клиентом
            userSessions.set(`admin_${adminMsg.message_id}`, {
              clientChatId: chatId,
              clientMessageId: messageId,
              requestId,
              phone,
              userInfo
            });
          });
        }
      });
    });
  }
  else if (data === 'new_calc') {
    startCalculation(chatId);
  }
  else if (data.startsWith('call_')) {
    const phone = data.replace('call_', '');
    // Просто отвечаем на callback
    bot.answerCallbackQuery(callbackQuery.id, {
      text: `Телефон клиента: ${phone}`,
      show_alert: true
    });
  }
  
  bot.answerCallbackQuery(callbackQuery.id);
});

// ============================================
// ОБРАБОТКА ОТВЕТОВ АДМИНА НА ЗАЯВКИ
// ============================================
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Если сообщение от админа и является ответом
  if (chatId.toString() === ADMIN_CHAT_ID && msg.reply_to_message) {
    const repliedMsgId = msg.reply_to_message.message_id;
    const sessionKey = `admin_${repliedMsgId}`;
    const session = userSessions.get(sessionKey);
    
    if (session) {
      const { clientChatId, requestId, phone, userInfo } = session;
      
      // Отправляем ответ клиенту
      bot.sendMessage(
        clientChatId,
        `📞 *ОТВЕТ ОТ МЕНЕДЖЕРА ПО ЗАЯВКЕ #${requestId}*\n\n` +
        `${text}\n\n` +
        `📱 *Ваш телефон:* ${phone}\n` +
        `📞 *Позвоните также по номеру:*\n` +
        `${PHONE_NUMBER}\n\n` +
        `👇 *Быстрая связь:*`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '💬 Написать менеджеру', url: `https://t.me/${MANAGER_USERNAME.replace('@', '')}` }
            ]]
          }
        }
      ).then(() => {
        // Уведомляем админа об успешной отправке
        bot.sendMessage(
          ADMIN_CHAT_ID,
          `✅ Ответ по заявке #${requestId} отправлен клиенту`,
          { reply_to_message_id: msg.message_id }
        );
      });
      
      // Удаляем сессию
      userSessions.delete(sessionKey);
    }
  }
});

// ============================================
// ОБРАБОТКА ОШИБОК
// ============================================
bot.on('polling_error', (error) => {
  console.error('❌ Ошибка бота:', error.message);
});

// ============================================
// ЗАПУСК
// ============================================
console.log('🤖 Бот готов к работе!');
console.log('⏳ Ожидаю сообщений...');
