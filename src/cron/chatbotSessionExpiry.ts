import cron from 'node-cron';
import { INestApplicationContext } from '@nestjs/common';
import { ChatbotLeadsService } from '@/chatbotLeads/chatbotLeadsService';

/**
 * Start the chatbot session inactivity-expiry cron job.
 *
 * This is the authoritative safety net for session lifecycle: an idle
 * 'active' session is marked 'expired' (endReason 'inactivity') server-side
 * even if the browser never reports a tab-close. The frontend renders the
 * "previous session ended" state from the backend flags — never guesses.
 *
 * Env:
 *  - CHATBOT_SESSION_TTL_MINUTES    (default 30)
 *  - CHATBOT_SESSION_EXPIRY_CRON    (default every 5 minutes)
 *  - ENABLE_CHATBOT_SESSION_EXPIRY  (set 'false' to disable)
 */
export function startChatbotSessionExpiryCron(
  app: INestApplicationContext,
): void {
  const isEnabled =
    process.env.ENABLE_CHATBOT_SESSION_EXPIRY !== 'false';

  if (!isEnabled) {
    console.log('⏸️  Chatbot session expiry cron is disabled');
    return;
  }

  const cronExpression =
    process.env.CHATBOT_SESSION_EXPIRY_CRON || '*/5 * * * *';
  const ttlMinutes = Math.max(
    1,
    Number(process.env.CHATBOT_SESSION_TTL_MINUTES) || 30,
  );

  const chatbotLeadsService = app.get(ChatbotLeadsService);

  cron.schedule(cronExpression, async () => {
    try {
      const expired =
        await chatbotLeadsService.expireInactiveSessions(ttlMinutes);
      if (expired > 0) {
        console.log(
          `🕒 Chatbot session expiry: ${expired} inactive session(s) expired (TTL ${ttlMinutes}m)`,
        );
      }
    } catch (error: any) {
      console.error(
        `❌ Chatbot session expiry cron error: ${error.message}`,
      );
    }
  });

  console.log('✅ Chatbot session expiry cron job started successfully\n');
}
