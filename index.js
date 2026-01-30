// ============================================
// ПРОФЕССИОНАЛЬНЫЙ КАЛЬКУЛЯТОР ВОРОТ
// ВЕРСИЯ ДЛЯ TIMEWEB
// ============================================

// Загружаем переменные окружения
require('dotenv').config();

// Проверяем обязательные переменные
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const MANAGER_USERNAME = process.env.MANAGER_USERNAME || '@gate_manager';

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
    keyboard: [['🚪 Рассчитать стоимость']],
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
  
  if (text === '🚪 Рассчитать стоимость') {
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
      bot.sendMessage(
        chatId,
        `👷 *Бесплатный выезд замерщика*\n\n` +
        `Менеджер ${MANAGER_USERNAME} свяжется для согласования времени.\n\n` +
        `Напишите ему прямо сейчас 👇`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '💬 Написать менеджеру', url: `https://t.me/${MANAGER_USERNAME.replace('@', '')}` }
            ]]
          }
        }
      );
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
  
  // Формируем сообщение
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
            { text: '📋 Точный расчет', callback_data: 'exact' },
            { text: '💬 Менеджер', url: `https://t.me/${MANAGER_USERNAME.replace('@', '')}` }
          ],
          [
            { text: '🔄 Новый расчет', callback_data: 'new' }
          ]
        ]
      }
    }
  );
}

// Обработка инлайн-кнопок
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  
  if (data === 'exact') {
    bot.sendMessage(
      chatId,
      `📨 *Заявка принята!*\n\n` +
      `Менеджер ${MANAGER_USERNAME} свяжется в течение 15 минут.`,
      mainMenu
    );
  } else if (data === 'new') {
    startCalculation(chatId);
  }
  
  bot.answerCallbackQuery(callbackQuery.id);
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('❌ Ошибка бота:', error.message);
});

// ============================================
// ЗАПУСК
// ============================================
console.log('🤖 Бот готов к работе!');
console.log('⏳ Ожидаю сообщений...');
