// ============================================
// ПРОФЕССИОНАЛЬНЫЙ КАЛЬКУЛЯТОР ВОРОТ
// ВЕРСИЯ ДЛЯ TIMEWEB
// ============================================

// Загружаем переменные окружения
require('dotenv').config();

// Проверяем обязательные переменные
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const MANAGER_USERNAME = process.env.MANAGER_USERNAME || '@gate_manager';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const PHONE_NUMBER = process.env.PHONE_NUMBER || '8 (923) 811-54-32';
const PHONE_LINK = PHONE_NUMBER.replace(/\D/g, ''); // Для кликабельного номера

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

// Прайс в коде
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
// Хранилище расчетов для заявок (chatId -> данные)
const calculationsForRequests = new Map();

// ============================================
// ГЛАВНОЕ МЕНЮ
// ============================================
const mainMenu = {
  reply_markup: {
    keyboard: [
      ['🔢 Рассчитать стоимость'],
      ['🔄 Начать заново']
    ],
    resize_keyboard: true
  }
};

// ============================================
// КОМАНДА /start И /new
// ============================================
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userSessions.delete(chatId);
  calculationsForRequests.delete(chatId);
  
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

// Команда для начала заново
bot.onText(/\/new/, (msg) => {
  const chatId = msg.chat.id;
  userSessions.delete(chatId);
  calculationsForRequests.delete(chatId);
  startCalculation(chatId);
});

// ============================================
// ОБРАБОТКА СООБЩЕНИЙ
// ============================================
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // 1. Кнопка "Начать заново" в любом месте
  if (text === '🔄 Начать заново') {
    userSessions.delete(chatId);
    calculationsForRequests.delete(chatId);
    startCalculation(chatId);
    return;
  }
  
  // 2. Главная кнопка расчета
  if (text === '🔢 Рассчитать стоимость') {
    startCalculation(chatId);
    return;
  }
  
  // Проверяем сессию пользователя
  const session = userSessions.get(chatId);
  if (!session) {
    // Если нет сессии, но пользователь что-то пишет - предлагаем начать
    if (text && !text.startsWith('/')) {
      bot.sendMessage(
        chatId,
        'Нажмите "🔢 Рассчитать стоимость" для начала расчета или "🔄 Начать заново"',
        mainMenu
      );
    }
    return;
  }
  
  // Кнопка "Назад" на любом этапе
  if (text === '🔙 Назад') {
    handleBackButton(chatId, session);
    return;
  }
  
  // Шаг 1: Вопрос про размеры
  if (session.step === 'ask_sizes') {
    if (text === '✅ Да, я знаю размеры') {
      session.step = 'ask_width';
      bot.sendMessage(
        chatId,
        '📏 *Введите ширину проёма в мм:*\nПример: 2900, 3000, 3500\n\n_Можно отправить любое число от 2000 до 6000 мм_',
        { 
          parse_mode: 'Markdown', 
          reply_markup: {
            keyboard: [['🔙 Назад', '🔄 Начать заново']],
            resize_keyboard: true
          }
        }
      );
    } else if (text === '📞 Вызвать замерщика') {
      bot.sendMessage(
        chatId,
        `👷 *БЕСПЛАТНЫЙ ВЫЕЗД ЗАМЕРЩИКА*\n\n` +
        `✅ Замерщик приедет в удобное для вас время\n` +
        `✅ Профессиональный замер всех параметров\n` +
        `✅ Консультация по установке и материалам\n\n` +
        `📞 *Позвоните для вызова замерщика:*\n` +
        `[${PHONE_NUMBER}](tel:${PHONE_LINK})\n\n` +
        `Или напишите менеджеру для согласования времени:`,
        {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [[
              { text: '💬 Написать менеджеру', url: `https://t.me/${MANAGER_USERNAME.replace('@', '')}` }
            ]]
          }
        }
      );
      
      // Уведомление админу
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
      calculationsForRequests.delete(chatId);
    } else {
      bot.sendMessage(
        chatId,
        '❌ Выберите вариант из кнопок',
        {
          reply_markup: {
            keyboard: [
              ['✅ Да, я знаю размеры'],
              ['📞 Вызвать замерщика'],
              ['🔄 Начать заново']
            ],
            resize_keyboard: true
          }
        }
      );
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
      '📏 *Введите высоту проёма в мм:*\nПример: 2100, 2200, 2500\n\n_Можно отправить любое число от 1800 до 3000 мм_',
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [['🔙 Назад', '🔄 Начать заново']],
          resize_keyboard: true
        }
      }
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
          keyboard: [
            ['✅ Да, с пультом', '❌ Нет, без автоматики'],
            ['🔙 Назад', '🔄 Начать заново']
          ],
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
            ['❌ Нет, установлю сам'],
            ['🔙 Назад', '🔄 Начать заново']
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
      // Сохраняем расчет и показываем результат
      const calculationData = showResult(chatId, session.data);
      // Сохраняем для возможной заявки
      calculationsForRequests.set(chatId, calculationData);
      userSessions.delete(chatId);
    } else if (text === '❌ Нет, установлю сам') {
      session.data.installation = false;
      // Сохраняем расчет и показываем результат
      const calculationData = showResult(chatId, session.data);
      // Сохраняем для возможной заявки
      calculationsForRequests.set(chatId, calculationData);
      userSessions.delete(chatId);
    } else {
      bot.sendMessage(
        chatId,
        '❌ Выберите вариант из кнопок',
        {
          reply_markup: {
            keyboard: [
              ['✅ Нужна установка под ключ'],
              ['❌ Нет, установлю сам'],
              ['🔙 Назад', '🔄 Начать заново']
            ],
            resize_keyboard: true
          }
        }
      );
    }
  }
});

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
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
          ['📞 Вызвать замерщика'],
          ['🔄 Начать заново']
        ],
        resize_keyboard: true
      }
    }
  );
}

function handleBackButton(chatId, session) {
  if (session.step === 'ask_width') {
    session.step = 'ask_sizes';
    bot.sendMessage(
      chatId,
      '📏 *Вам известны размеры проёма?*',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            ['✅ Да, я знаю размеры'],
            ['📞 Вызвать замерщика'],
            ['🔄 Начать заново']
          ],
          resize_keyboard: true
        }
      }
    );
  } else if (session.step === 'ask_height') {
    session.step = 'ask_width';
    bot.sendMessage(
      chatId,
      '📏 *Введите ширину проёма в мм:*\nПример: 2900, 3000, 3500',
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [['🔙 Назад', '🔄 Начать заново']],
          resize_keyboard: true
        }
      }
    );
  } else if (session.step === 'ask_automation') {
    session.step = 'ask_height';
    bot.sendMessage(
      chatId,
      '📏 *Введите высоту проёма в мм:*\nПример: 2100, 2200, 2500',
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [['🔙 Назад', '🔄 Начать заново']],
          resize_keyboard: true
        }
      }
    );
  } else if (session.step === 'ask_installation') {
    session.step = 'ask_automation';
    bot.sendMessage(
      chatId,
      '⚙️ *Планируете открывать ворота пультом?*',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            ['✅ Да, с пультом', '❌ Нет, без автоматики'],
            ['🔙 Назад', '🔄 Начать заново']
          ],
          resize_keyboard: true
        }
      }
    );
  }
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
  
  // Текущая дата
  const currentDate = new Date();
  const formattedDate = currentDate.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  
  // Сохраняем данные расчета
  const calculationData = {
    data: { ...data },
    finalPrice,
    area: parseFloat(area.toFixed(2)),
    date: new Date().toISOString(),
    formattedDate
  };
  
  // Формируем сообщение клиенту
  const message = 
    `✅ *Предварительный расчет готов!*\n\n` +
    `📋 *Комплектация:*\n` +
    `• Ширина: ${data.width} мм\n` +
    `• Высота: ${data.height} мм\n` +
    `• Автоматика: ${data.automation ? 'Да' : 'Нет'}\n` +
    `• Установка: ${data.installation ? 'Под ключ' : 'Сам'}\n\n` +
    `💰 *Итого: ~${finalPrice.toLocaleString('ru-RU')} ₽*\n\n` +
    `_Точную стоимость на ${formattedDate} с учетом скидки подскажет менеджер._`;
  
  bot.sendMessage(
    chatId,
    message,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💰 Узнать точную стоимость', callback_data: 'exact_calc' },
            { text: '💬 Менеджер', url: `https://t.me/${MANAGER_USERNAME.replace('@', '')}` }
          ],
          [
            { text: '📞 Позвонить', url: `tel:${PHONE_LINK}` }
          ],
          [
            { text: '🔄 Новый расчет', callback_data: 'new_calc' }
          ]
        ]
      }
    }
  );
  
  return calculationData;
}

// ============================================
// ОБРАБОТКА ИНЛАЙН-КНОПОК
// ============================================
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const user = callbackQuery.from;
  
  if (data === 'exact_calc') {
    // 1. Сначала показываем клиенту ЧТО он отправляет
    const calculationData = calculationsForRequests.get(chatId);
    
    if (!calculationData) {
      bot.sendMessage(chatId, '❌ Расчет не найден. Пожалуйста, выполните расчет заново.');
      return;
    }
    
    const orderSummary = 
      `📋 *ВАША ЗАЯВКА НА ТОЧНЫЙ РАСЧЕТ*\n\n` +
      `• Ширина: ${calculationData.data.width} мм\n` +
      `• Высота: ${calculationData.data.height} мм\n` +
      `• Автоматика: ${calculationData.data.automation ? 'Да' : 'Нет'}\n` +
      `• Установка: ${calculationData.data.installation ? 'Под ключ' : 'Сам'}\n` +
      `• Примерная стоимость: ~${calculationData.finalPrice.toLocaleString('ru-RU')} ₽\n\n` +
      `👇 *Укажите ваш номер телефона для связи:*`;
    
    // 2. Показываем заявку и запрашиваем телефон
    await bot.sendMessage(
      chatId,
      orderSummary,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          force_reply: true,
          selective: true,
          input_field_placeholder: 'Например: +7 999 123-45-67'
        }
      }
    ).then((sentMessage) => {
      // 3. Ждем ответ с номером телефона
      bot.onReplyToMessage(sentMessage.chat.id, sentMessage.message_id, async (phoneMsg) => {
        const phone = phoneMsg.text.trim();
        const requestId = 'REQ-' + Date.now().toString().slice(-6);
        
        // 4. Сообщение клиенту что заявка принята
        await bot.sendMessage(
          chatId,
          `📨 *Заявка #${requestId} принята!*\n\n` +
          `✅ Ваш номер: [${phone}](tel:${phone.replace(/\D/g, '')})\n` +
          `⏱️ Менеджер свяжется в течение 15 минут\n\n` +
          `📞 *Также вы можете позвонить:*\n` +
          `[${PHONE_NUMBER}](tel:${PHONE_LINK})`,
          {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            reply_markup: {
              inline_keyboard: [[
                { text: '💬 Написать менеджеру', url: `https://t.me/${MANAGER_USERNAME.replace('@', '')}` },
                { text: '📞 Позвонить', url: `tel:${PHONE_LINK}` }
              ]]
            }
          }
        );
        
        // 5. Уведомление админу
        if (ADMIN_CHAT_ID) {
          const adminMessage = 
            `🔥 *НОВАЯ ЗАЯВКА НА РАСЧЕТ #${requestId}*\n\n` +
            `👤 *Клиент:* ${user.first_name}${user.last_name ? ' ' + user.last_name : ''}\n` +
            `👤 Username: ${user.username ? '@' + user.username : 'нет'}\n` +
            `🆔 ID: ${chatId}\n` +
            `📱 Телефон: ${phone}\n` +
            `📅 Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
            `📏 *ПАРАМЕТРЫ ЗАЯВКИ:*\n` +
            `• Ширина: ${calculationData.data.width} мм\n` +
            `• Высота: ${calculationData.data.height} мм\n` +
            `• Автоматика: ${calculationData.data.automation ? 'Да' : 'Нет'}\n` +
            `• Установка: ${calculationData.data.installation ? 'Под ключ' : 'Сам'}\n` +
            `• Площадь: ${calculationData.area} м²\n` +
            `💰 *Примерная стоимость:* ${calculationData.finalPrice.toLocaleString('ru-RU')} ₽\n\n` +
            `💬 *Для ответа клиенту:*\n` +
            `1. Ответьте на это сообщение\n` +
            `2. Напишите точную цену и условия\n` +
            `3. Я перешлю ваш ответ клиенту`;
          
          await bot.sendMessage(
            ADMIN_CHAT_ID,
            adminMessage,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[
                  { text: '📞 Позвонить клиенту', url: `tel:${phone.replace(/\D/g, '')}` },
                  { text: '💬 Ответить клиенту', callback_data: `reply_${requestId}` }
                ]]
              }
            }
          ).then((adminMsg) => {
            // Сохраняем связь для ответа админа
            userSessions.set(`admin_${adminMsg.message_id}`, {
              clientChatId: chatId,
              clientMessageId: messageId,
              requestId,
              phone,
              userInfo: user,
              calculationData: calculationData.data,
              finalPrice: calculationData.finalPrice
            });
            
            console.log(`✅ Заявка #${requestId} отправлена админу ${ADMIN_CHAT_ID}`);
          }).catch(err => {
            console.error('❌ Ошибка отправки админу:', err.message);
          });
        }
        
        // 6. Очищаем данные расчета
        calculationsForRequests.delete(chatId);
      });
    });
  }
  else if (data === 'new_calc') {
    userSessions.delete(chatId);
    calculationsForRequests.delete(chatId);
    startCalculation(chatId);
  }
  
  bot.answerCallbackQuery(callbackQuery.id);
});

// ============================================
// ОБРАБОТКА ОТВЕТОВ АДМИНА НА ЗАЯВКИ
// ============================================
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Проверяем если сообщение от админа и является ответом
  if (chatId.toString() === ADMIN_CHAT_ID && msg.reply_to_message) {
    const repliedMsgId = msg.reply_to_message.message_id;
    const sessionKey = `admin_${repliedMsgId}`;
    const session = userSessions.get(sessionKey);
    
    if (session) {
      const { clientChatId, requestId, phone } = session;
      
      // Текущая дата для ответа
      const currentDate = new Date().toLocaleDateString('ru-RU');
      
      // Отправляем ответ клиенту
      bot.sendMessage(
        clientChatId,
        `📞 *ОТВЕТ ОТ МЕНЕДЖЕРА ПО ЗАЯВКЕ #${requestId}*\n\n` +
        `${text}\n\n` +
        `📱 *Ваш телефон:* [${phone}](tel:${phone.replace(/\D/g, '')})\n` +
        `📞 *Позвоните также по номеру:*\n` +
        `[${PHONE_NUMBER}](tel:${PHONE_LINK})\n\n` +
        `_Актуально на ${currentDate}_\n\n` +
        `👇 *Быстрая связь:*`,
        {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          reply_markup: {
            inline_keyboard: [[
              { text: '💬 Написать менеджеру', url: `https://t.me/${MANAGER_USERNAME.replace('@', '')}` },
              { text: '📞 Позвонить', url: `tel:${PHONE_LINK}` }
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
        
        console.log(`✅ Ответ по заявке #${requestId} отправлен клиенту ${clientChatId}`);
      }).catch(err => {
        console.error('❌ Ошибка отправки ответа клиенту:', err.message);
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

bot.on('error', (error) => {
  console.error('❌ Общая ошибка бота:', error.message);
});

// ============================================
// ЗАПУСК
// ============================================
console.log('🤖 Бот готов к работе!');
console.log('⏳ Ожидаю сообщений...');
console.log('📞 Номер для связи:', PHONE_NUMBER);
console.log('👨‍💼 Менеджер:', MANAGER_USERNAME);
