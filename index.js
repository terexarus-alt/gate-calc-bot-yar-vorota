require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const prices = require('./prices.json');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const MANAGER_USERNAME = process.env.MANAGER_USERNAME || '@gate_manager';

if (!TELEGRAM_TOKEN) {
  console.error('❌ ОШИБКА: TELEGRAM_TOKEN не установлен');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
console.log('✅ Бот запущен');

const userSessions = {};

const mainMenu = {
  reply_markup: {
    keyboard: [['🚪 Рассчитать стоимость']],
    resize_keyboard: true
  }
};

// /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userSessions[chatId] = { step: 'main', data: {} };
  
  bot.sendMessage(chatId,
    `🏭 *Калькулятор секционных ворот*\n\n` +
    `Рассчитайте стоимость за 1 минуту!\n\n` +
    `✅ Точный расчет по размерам\n` +
    `✅ Учет автоматики и установки\n` +
    `✅ Автоматические скидки\n\n` +
    `👇 Нажмите кнопку для начала:`,
    { parse_mode: 'Markdown', ...mainMenu }
  );
});

// Обработка кнопок
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (text === '🚪 Рассчитать стоимость') {
    startCalculation(chatId);
    return;
  }
  
  const session = userSessions[chatId];
  if (!session) return;
  
  // Шаг 1: Вопрос про размеры
  if (session.step === 'ask_if_knows_sizes') {
    if (text === '✅ Да, я знаю размеры') {
      session.step = 'ask_width';
      bot.sendMessage(chatId,
        `📏 *Укажите ширину проёма в мм:*\n\n` +
        `Например: 2900, 3000, 3500\n` +
        `(от 2000 до 6000 мм)`,
        {
          parse_mode: 'Markdown',
          reply_markup: { remove_keyboard: true }
        }
      );
    } else if (text === '📞 Вызвать замерщика') {
      bot.sendMessage(chatId,
        `👷 *Вызов замерщика*\n\n` +
        `Менеджер ${MANAGER_USERNAME} свяжется с вами для согласования времени замера.\n\n` +
        `Услуга замера *БЕСПЛАТНАЯ*.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '📞 Написать менеджеру', url: `https://t.me/${MANAGER_USERNAME.replace('@', '')}` }
            ]]
          }
        }
      );
      userSessions[chatId] = { step: 'main', data: {} };
    }
  }
  
  // Шаг 2: Ширина проема
  else if (session.step === 'ask_width') {
    const width = parseInt(text);
    if (isNaN(width) || width < 2000 || width > 6000) {
      bot.sendMessage(chatId, '❌ Укажите число от 2000 до 6000 мм');
      return;
    }
    
    session.data.width = width;
    session.step = 'ask_height';
    
    bot.sendMessage(chatId,
      `✅ Ширина: *${width} мм*\n\n` +
      `📏 *Укажите высоту проёма в мм:*\n\n` +
      `Например: 2100, 2200, 2500\n` +
      `(от 1800 до 3000 мм)`,
      { parse_mode: 'Markdown' }
    );
  }
  
  // Шаг 3: Высота проема
  else if (session.step === 'ask_height') {
    const height = parseInt(text);
    if (isNaN(height) || height < 1800 || height > 3000) {
      bot.sendMessage(chatId, '❌ Укажите число от 1800 до 3000 мм');
      return;
    }
    
    session.data.height = height;
    session.step = 'ask_automation';
    
    bot.sendMessage(chatId,
      `✅ Размеры: *${session.data.width} × ${height} мм*\n\n` +
      `⚙️ *Планируете открывать/закрывать ворота пультом?*\n\n` +
      `Автоматика позволяет управлять воротами с дистанционного пульта.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [['✅ Да, с пультом', '❌ Нет, без автоматики'], ['🔙 Назад']],
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
    } else if (text === '🔙 Назад') {
      session.step = 'ask_width';
      bot.sendMessage(chatId, '📏 Укажите ширину проёма в мм:');
      return;
    } else {
      bot.sendMessage(chatId, '❌ Пожалуйста, выберите вариант из кнопок');
      return;
    }
    
    session.step = 'ask_installation';
    
    bot.sendMessage(chatId,
      `🏗️ *Нужна ли установка ворот?*\n\n` +
      `*Установка "под ключ" включает:*\n` +
      `• Монтаж ворот\n` +
      `• Настройка автоматики (если выбрана)\n` +
      `• Гарантия на работу\n\n` +
      `*Только поставка:*\n` +
      `• Ворота доставляются в собранном виде\n` +
      `• Установка своими силами`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            ['✅ Нужна установка под ключ'],
            ['❌ Нет, установлю сам'],
            ['🔙 Назад']
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
    } else if (text === '🔙 Назад') {
      session.step = 'ask_automation';
      bot.sendMessage(chatId, '⚙️ Планируете открывать/закрывать ворота пультом?', {
        reply_markup: {
          keyboard: [['✅ Да, с пультом', '❌ Нет, без автоматики'], ['🔙 Назад']],
          resize_keyboard: true
        }
      });
      return;
    } else {
      bot.sendMessage(chatId, '❌ Пожалуйста, выберите вариант из кнопок');
      return;
    }
    
    // ПОКАЗЫВАЕМ РЕЗУЛЬТАТ
    showCalculation(chatId, session.data);
    userSessions[chatId] = { step: 'main', data: {} };
  }
});

function startCalculation(chatId) {
  userSessions[chatId] = {
    step: 'ask_if_knows_sizes',
    data: {
      width: null,
      height: null,
      automation: null,
      installation: null
    }
  };
  
  bot.sendMessage(chatId,
    `📏 *Вам известны размеры проёма?*\n\n` +
    `Для точного расчета нужны ширина и высота в миллиметрах.`,
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

function showCalculation(chatId, data) {
  // Конвертируем мм в метры
  const widthM = data.width / 1000;
  const heightM = data.height / 1000;
  const area = widthM * heightM;
  
  // Базовая стоимость ворот
  let total = area * prices.basePricePerM2;
  
  // Автоматика
  if (data.automation) {
    total += prices.automation;
  }
  
  // Установка
  if (data.installation) {
    total += prices.installation;
  }
  
  // Скидки
  let discountRate = 0;
  let discountText = '';
  
  if (total > 200000) {
    discountRate = prices.discount.over200k;
    discountText = ` (скидка ${(discountRate * 100)}% за сумму >200к)`;
  } else if (total > 150000) {
    discountRate = prices.discount.over150k;
    discountText = ` (скидка ${(discountRate * 100)}% за сумму >150к)`;
  } else if (total > 100000) {
    discountRate = prices.discount.over100k;
    discountText = ` (скидка ${(discountRate * 100)}% за сумму >100к)`;
  }
  
  const discount = total * discountRate;
  const finalPrice = Math.round(total - discount);
  
  // Формируем детали
  const details = 
    `📋 *Комплектация заказа:*\n` +
    `Ворота секционные с пружинами растяжения (RSD01 BIW)\n\n` +
    `• Ширина: ${data.width} мм\n` +
    `• Высота: ${data.height} мм\n` +
    `• Автоматика: ${data.automation ? '✅ Да (с пультом)' : '❌ Нет'}\n` +
    `• Установка: ${data.installation ? '✅ Под ключ' : '❌ Установлю сам'}\n`;
  
  // Стоимость по компонентам
  let breakdown = `\n💰 *Расчет стоимости:*\n`;
  breakdown += `• Ворота ${area.toFixed(1)} м²: ${Math.round(area * prices.basePricePerM2).toLocaleString('ru-RU')} ₽\n`;
  if (data.automation) {
    breakdown += `• Автоматика с пультом: ${prices.automation.toLocaleString('ru-RU')} ₽\n`;
  }
  if (data.installation) {
    breakdown += `• Установка "под ключ": ${prices.installation.toLocaleString('ru-RU')} ₽\n`;
  }
  if (discountRate > 0) {
    breakdown += `• Скидка: -${Math.round(discount).toLocaleString('ru-RU')} ₽\n`;
  }
  
  bot.sendMessage(chatId,
    `✅ *Расчет готов!*\n\n` +
    details +
    breakdown +
    `\n💵 *Итого: ${finalPrice.toLocaleString('ru-RU')} ₽*${discountText}\n\n` +
    `*Стоимость указана с учетом скидки без услуг доставки.*`,
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

// Обработка инлайн-кнопок
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  
  if (data === 'exact_calc') {
    const requestId = 'REQ-' + Date.now().toString().slice(-6);
    
    bot.sendMessage(chatId,
      `📨 *Заявка #${requestId} принята!*\n\n` +
      `Менеджер ${MANAGER_USERNAME} свяжется для уточнения деталей и согласования времени замера.\n\n` +
      `⏱️ *Обычно отвечаем в течение 15 минут*`,
      {
        parse_mode: 'Markdown',
        reply_markup: mainMenu.reply_markup
      }
    );
  }
  else if (data === 'new_calc') {
    startCalculation(chatId);
  }
  
  bot.answerCallbackQuery(callbackQuery.id);
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('❌ Ошибка бота:', error.message);
});

console.log('🤖 Калькулятор секционных ворот запущен!');
console.log(`👨‍💼 Менеджер: ${MANAGER_USERNAME}`);