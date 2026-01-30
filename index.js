const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_TOKEN || 'ВАШ_ТОКЕН';
const bot = new TelegramBot(token, { polling: true });

// ⚠️ УКАЖИТЕ РЕАЛЬНЫЙ ID МЕНЕДЖЕРА!
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '7952018996'; // Ваш ID менеджера

console.log('🚀 Бот запущен! ID менеджера:', ADMIN_CHAT_ID);
console.log('✅ Тест отправки должен работать!');

// ВСЕ ДАННЫЕ В ОДНОМ МЕСТЕ
const users = {};

// 1. START
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`▶️ /start от ${chatId}`);
  
  users[chatId] = {
    step: 'askPhone',
    phone: null
  };
  
  bot.sendMessage(chatId,
    '📞 *Введите ваш номер телефона:*\n\n' +
    'Например: 89246345577\n' +
    'Или в любом другом формате',
    { parse_mode: 'Markdown' }
  );
});

// 2. ВСЕ СООБЩЕНИЯ
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  
  console.log(`📩 ${chatId}: "${text}"`);
  
  // Если нет пользователя
  if (!users[chatId]) {
    users[chatId] = { step: 'askPhone' };
  }
  
  const user = users[chatId];
  
  // ЕСЛИ ЖДЕМ ТЕЛЕФОН
  if (user.step === 'askPhone') {
    if (text.length > 5 && /\d/.test(text)) {
      user.phone = text;
      user.step = 'askSize';
      console.log(`✅ Телефон сохранен: ${text}`);
      
      bot.sendMessage(chatId,
        `✅ Номер принят: ${text}\n\n` +
        '📏 *Вам известны размеры проема?*',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [
              ['✅ Знаю размеры'],
              ['📞 Вызвать замерщика'],
              ['🔄 Начать заново']
            ],
            resize_keyboard: true
          }
        }
      );
    } else {
      bot.sendMessage(chatId, '❌ Пожалуйста, введите номер телефона');
    }
    return;
  }
  
  // НАЧАТЬ ЗАНОВО
  if (text === '🔄 Начать заново') {
    users[chatId] = { step: 'askPhone' };
    bot.sendMessage(chatId, '📞 Введите ваш номер телефона:');
    return;
  }
  
  // ЗНАЕТ РАЗМЕРЫ?
  if (user.step === 'askSize') {
    if (text === '✅ Знаю размеры') {
      user.step = 'askWidth';
      bot.sendMessage(chatId, '📏 *Введите ширину (мм):*\nПример: 3000', 
        { parse_mode: 'Markdown' }
      );
    } else if (text === '📞 Вызвать замерщика') {
      // Сразу отправляем заявку на замерщика
      await sendToManager(chatId, user, msg.from, '📐 Запрос на замерщика');
      return;
    }
    return;
  }
  
  // ШИРИНА
  if (user.step === 'askWidth') {
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
  
  // ВЫСОТА
  if (user.step === 'askHeight') {
    const height = parseInt(text);
    if (isNaN(height) || height < 1800 || height > 3000) {
      bot.sendMessage(chatId, '❌ Введите число 1800-3000 мм');
      return;
    }
    user.height = height;
    user.step = 'askAutomation';
    bot.sendMessage(chatId, `✅ Размеры: ${user.width} × ${height} мм\n\n⚙️ *Открывать пультом?*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            ['✅ С пультом'],
            ['❌ Без автоматики'],
            ['🔄 Начать заново']
          ],
          resize_keyboard: true
        }
      }
    );
    return;
  }
  
  // АВТОМАТИКА
  if (user.step === 'askAutomation') {
    if (text === '✅ С пультом') {
      user.automation = true;
    } else if (text === '❌ Без автоматики') {
      user.automation = false;
    } else {
      bot.sendMessage(chatId, '❌ Выберите вариант');
      return;
    }
    
    user.step = 'askInstallation';
    bot.sendMessage(chatId, '🏗️ *Нужна установка?*',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            ['✅ Установка под ключ'],
            ['❌ Установлю сам'],
            ['🔄 Начать заново']
          ],
          resize_keyboard: true
        }
      }
    );
    return;
  }
  
  // УСТАНОВКА
  if (user.step === 'askInstallation') {
    if (text === '✅ Установка под ключ') {
      user.installation = true;
    } else if (text === '❌ Установлю сам') {
      user.installation = false;
    } else {
      bot.sendMessage(chatId, '❌ Выберите вариант');
      return;
    }
    
    // ПОКАЗЫВАЕМ РЕЗУЛЬТАТ И СРАЗУ ОТПРАВЛЯЕМ!
    await showResultAndSend(chatId, user, msg.from);
    return;
  }
});

// 3. ПОКАЗАТЬ РЕЗУЛЬТАТ И ОТПРАВИТЬ
async function showResultAndSend(chatId, user, fromUser) {
  console.log(`🧮 Делаю расчет для ${chatId}`);
  
  // Расчет стоимости
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
  
  // Показываем клиенту
  const message = 
    `✅ *Расчет готов!*\n\n` +
    `📋 *Параметры:*\n` +
    `• Ширина: ${user.width} мм\n` +
    `• Высота: ${user.height} мм\n` +
    `• Автоматика: ${user.automation ? 'Да' : 'Нет'}\n` +
    `• Установка: ${user.installation ? 'Под ключ' : 'Сам'}\n\n` +
    `💰 *Стоимость:* ~${finalPrice.toLocaleString('ru-RU')} ₽\n\n` +
    `📞 *Отправляем заявку менеджеру...*`;
  
  await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  
  // СРАЗУ ОТПРАВЛЯЕМ МЕНЕДЖЕРУ
  await sendToManager(chatId, user, fromUser, finalPrice, area.toFixed(2));
  
  // Показываем подтверждение
  setTimeout(() => {
    bot.sendMessage(chatId,
      `📨 *Заявка отправлена!*\n\n` +
      `✅ Ваши данные переданы менеджеру\n` +
      `⏱️ Свяжемся с вами в течение 15 минут\n\n` +
      `📞 *Контакты для связи:*\n` +
      `8 (923) 811-54-32\n` +
      `💬 @systema365\n\n` +
      `🔄 Для нового расчета отправьте /start`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '💬 Написать менеджеру', url: 'https://t.me/systema365' }
          ]]
        }
      }
    );
  }, 1000);
}

// 4. ОТПРАВКА МЕНЕДЖЕРУ - ИСПРАВЛЕННАЯ ПРОВЕРКА!
async function sendToManager(chatId, user, fromUser, finalPrice, area) {
  const requestId = 'REQ-' + Date.now().toString().slice(-6);
  
  console.log(`📤 Отправляю заявку #${requestId} менеджеру ${ADMIN_CHAT_ID}`);
  console.log(`📱 Телефон клиента: ${user.phone}`);
  
  // ПРАВИЛЬНАЯ ПРОВЕРКА!
  if (!ADMIN_CHAT_ID || isNaN(ADMIN_CHAT_ID) || ADMIN_CHAT_ID.length < 5) {
    console.log('❌ ОШИБКА: ADMIN_CHAT_ID не указан или указан неправильно!');
    console.log(`⚠️ Текущий ID: "${ADMIN_CHAT_ID}"`);
    console.log('🔧 Укажите реальный ID менеджера в коде!');
    return;
  }
  
  try {
    // Формируем сообщение для менеджера
    let adminMessage = 
      `🔥 *НОВАЯ ЗАЯВКА #${requestId}*\n\n` +
      `👤 *Клиент:* ${fromUser.first_name || 'Не указано'}\n` +
      `👤 Username: @${fromUser.username || 'нет'}\n` +
      `🆔 ID: ${chatId}\n` +
      `📱 *Телефон:* ${user.phone}\n` +
      `📅 Время: ${new Date().toLocaleString('ru-RU')}\n\n`;
    
    // Если есть расчет - добавляем параметры
    if (user.width && user.height) {
      adminMessage += 
        `📏 *Параметры заказа:*\n` +
        `• Ширина: ${user.width} мм\n` +
        `• Высота: ${user.height} мм\n` +
        `• Автоматика: ${user.automation ? '✅ Да' : '❌ Нет'}\n` +
        `• Установка: ${user.installation ? '✅ Под ключ' : '❌ Сам'}\n` +
        `• Площадь: ${area} м²\n` +
        `💰 *Стоимость:* ~${finalPrice.toLocaleString('ru-RU')} ₽\n\n`;
    } else {
      adminMessage += `📝 *Тип заявки:* ${user.requestType || 'Запрос'}\n\n`;
    }
    
    adminMessage += `💬 *Для связи с клиентом:*`;
    
    console.log(`📝 Формирую заявку для отправки...`);
    
    // Отправляем менеджеру
    const sent = await bot.sendMessage(ADMIN_CHAT_ID, adminMessage, {
      parse_mode: 'Markdown'
    });
    
    console.log(`✅ ЗАЯВКА ОТПРАВЛЕНА! ID сообщения: ${sent.message_id}`);
    console.log(`🎉 УСПЕХ! Менеджер получил заявку!`);
    
    // Отправляем второе сообщение с инструкцией
    const phoneForCall = user.phone.replace(/\D/g, '');
    
    await bot.sendMessage(ADMIN_CHAT_ID,
      `📞 *Контакты клиента:*\n` +
      `Телефон: \`${user.phone}\`\n` +
      `TG ссылка: \`tg://user?id=${chatId}\`\n\n` +
      `📋 *Быстрые действия:*`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '💬 Написать клиенту', url: `tg://user?id=${chatId}` },
            { text: '📞 Скопировать телефон', callback_data: `phone_${phoneForCall}` }
          ]]
        }
      }
    );
    
    return true;
    
  } catch (error) {
    console.error('❌ ОШИБКА ОТПРАВКИ МЕНЕДЖЕРУ:', error.message);
    console.error('🔍 Детали ошибки:', error.response?.body?.description || error.code);
    
    // Отправляем сообщение об ошибке пользователю
    await bot.sendMessage(chatId,
      `❌ *Ошибка отправки заявки*\n\n` +
      `Попробуйте связаться с менеджером напрямую:\n` +
      `📞 8 (923) 811-54-32\n` +
      `💬 @systema365`,
      { parse_mode: 'Markdown' }
    );
    
    return false;
  }
}

// 5. КОМАНДА ДЛЯ ПРОВЕРКИ
bot.onText(/\/testmanager/, async (msg) => {
  const chatId = msg.chat.id;
  
  console.log(`🔧 Тестирую отправку менеджеру ${ADMIN_CHAT_ID}`);
  
  // Проверяем ID
  if (!ADMIN_CHAT_ID || isNaN(ADMIN_CHAT_ID) || ADMIN_CHAT_ID.length < 5) {
    bot.sendMessage(chatId, 
      `❌ ADMIN_CHAT_ID не настроен!\n\n` +
      `Текущее значение: "${ADMIN_CHAT_ID}"\n` +
      `🔧 Замените в коде на реальный ID менеджера`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  try {
    // Пробуем отправить тестовое сообщение
    await bot.sendMessage(ADMIN_CHAT_ID, 
      `✅ *ТЕСТОВОЕ СООБЩЕНИЕ ОТ БОТА*\n\n` +
      `📅 ${new Date().toLocaleString('ru-RU')}\n` +
      `🆔 От пользователя: ${chatId}\n` +
      `👤 Имя: ${msg.from.first_name || 'Не указано'}\n\n` +
      `🤖 *Бот готов принимать заявки!*`,
      { parse_mode: 'Markdown' }
    );
    
    bot.sendMessage(chatId, 
      `✅ *Тест успешен!*\n\n` +
      `Сообщение отправлено менеджеру:\n` +
      `🆔 ID: \`${ADMIN_CHAT_ID}\`\n\n` +
      `🎉 *Теперь заявки будут приходить!*`,
      { parse_mode: 'Markdown' }
    );
    
    console.log(`✅ Тест отправлен успешно менеджеру ${ADMIN_CHAT_ID}!`);
    
  } catch (error) {
    bot.sendMessage(chatId, 
      `❌ *Ошибка теста:*\n\n` +
      `${error.message}\n\n` +
      `🔧 Проверьте:\n` +
      `1. Правильный ли ID менеджера?\n` +
      `2. Может ли бот писать менеджеру?`,
      { parse_mode: 'Markdown' }
    );
    
    console.error('❌ Тест не прошел:', error.message);
  }
});

// 6. КОМАНДА ДЛЯ ПРОВЕРКИ ЗАЯВКИ
bot.onText(/\/testorder/, async (msg) => {
  const chatId = msg.chat.id;
  
  console.log(`🔧 Тестовая заявка от ${chatId}`);
  
  // Создаем тестовые данные
  const testUser = {
    phone: '89246345577',
    width: 3000,
    height: 2500,
    automation: true,
    installation: true
  };
  
  const testFromUser = {
    first_name: 'Тест',
    username: 'testuser'
  };
  
  // Показываем результат
  const area = (3000/1000) * (2500/1000);
  const price = area * 18000 + 45000 + 25000;
  const finalPrice = Math.round(price * 0.95);
  
  await bot.sendMessage(chatId,
    `✅ *Тестовый расчет*\n\n` +
    `📱 Телефон: ${testUser.phone}\n` +
    `📏 Размеры: ${testUser.width}x${testUser.height}\n` +
    `💰 Стоимость: ~${finalPrice.toLocaleString('ru-RU')} ₽\n\n` +
    `📤 Отправляю тестовую заявку менеджеру...`,
    { parse_mode: 'Markdown' }
  );
  
  // Отправляем менеджеру
  const success = await sendToManager(chatId, testUser, testFromUser, finalPrice, area.toFixed(2));
  
  if (success) {
    await bot.sendMessage(chatId,
      `🎉 *Тестовая заявка отправлена!*\n\n` +
      `Менеджер должен был получить заявку.\n` +
      `Проверьте у менеджера сообщение.`,
      { parse_mode: 'Markdown' }
    );
  }
});

// 7. КОМАНДА ДЛЯ ПРОВЕРКИ ID
bot.onText(/\/checkid/, (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId,
    `🔍 *ПРОВЕРКА ID*\n\n` +
    `👤 *Ваш ID:* \`${chatId}\`\n` +
    `📝 *Username:* @${msg.from.username || 'нет'}\n\n` +
    `👑 *ID менеджера в настройках:*\n` +
    `\`${ADMIN_CHAT_ID}\`\n\n` +
    `✅ *Статус:* ${ADMIN_CHAT_ID && ADMIN_CHAT_ID.length > 5 ? 'Настроен' : '❌ НЕ НАСТРОЕН'}\n\n` +
    `🔧 *Для изменения:*\n` +
    `Замените в коде строку:\n` +
    `const ADMIN_CHAT_ID = "7952018996";\n` +
    `на реальный ID менеджера`,
    { parse_mode: 'Markdown' }
  );
});

// 8. ОБРАБОТКА КНОПОК
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  if (data.startsWith('phone_')) {
    const phoneNumber = data.replace('phone_', '');
    
    // Показываем телефон для копирования
    await bot.sendMessage(chatId,
      `📞 *Телефон для звонка:*\n\n` +
      `\`${phoneNumber}\`\n\n` +
      `Нажмите на номер чтобы скопировать`,
      { parse_mode: 'Markdown' }
    );
  }
  
  bot.answerCallbackQuery(query.id);
});

console.log('==========================================');
console.log('🤖 БОТ ЗАПУЩЕН С ОКОНЧАТЕЛЬНЫМ ИСПРАВЛЕНИЕМ!');
console.log('📞 Телефон: 8 (923) 811-54-32');
console.log('💬 Менеджер: @systema365');
console.log('👑 ID менеджера в коде:', ADMIN_CHAT_ID);
console.log('==========================================');
console.log('🔧 КОМАНДЫ ДЛЯ ПРОВЕРКИ:');
console.log('• /testmanager - тест связи с менеджером');
console.log('• /testorder - тестовая заявка');
console.log('• /checkid - проверить ID менеджера');
console.log('==========================================');
