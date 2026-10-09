/**
 * READ-ONLY diagnostic for the "session could not be found" failures.
 *
 * Reads the database from this project's own .env, so no credentials are
 * typed anywhere. Runs four SELECTs and changes nothing.
 *
 *   node diagnose-sessions.js
 */
require('dotenv').config({ quiet: true });
const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USERNAME || process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // Always on, matching database.config.ts. RDS refuses unencrypted
    // connections ("no pg_hba.conf entry ... no encryption"), and gating this
    // on a DB_SSL flag the app itself does not read made the script fail
    // where the app connects fine.
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const totals = await c.query(`
    SELECT count(*)::int AS total,
           count("conversationId")::int AS linked
      FROM chatbot_sessions`);
  const { total, linked } = totals.rows[0];
  console.log('--- sessions ---');
  console.log('  total          :', total);
  console.log('  with conv id   :', linked);
  console.log('  WITHOUT conv id:', total - linked);

  const today = await c.query(`
    SELECT count(*)::int AS n FROM chatbot_sessions
     WHERE "startedAt" >= CURRENT_DATE`);
  console.log('  created today  :', today.rows[0].n);

  console.log('\n--- 5 newest sessions ---');
  const newest = await c.query(`
    SELECT "startedAt", status, "conversationId", "siteId"
      FROM chatbot_sessions ORDER BY "startedAt" DESC LIMIT 5`);
  newest.rows.forEach((r) =>
    console.log(
      '  ',
      r.startedAt.toISOString().slice(0, 19),
      '|', String(r.status).padEnd(8),
      '| conv:', r.conversationId ?? 'NULL',
      '| site:', r.siteId ?? 'NULL',
    ),
  );

  console.log('\n--- return requests recorded ---');
  const rr = await c.query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE "createdAt" >= CURRENT_DATE)::int AS today
      FROM chatbot_return_requests`);
  console.log('  total:', rr.rows[0].total, '| today:', rr.rows[0].today);

  // A session only gets a conversation id once the ElevenLabs conversation
  // actually starts. Counting every unlinked session as a fault reported a
  // problem that was not there: a visitor who opens the widget and types
  // nothing has a session and no conversation, entirely correctly.
  console.log('\n--- linking, among sessions the assistant replied in ---');
  const spoke = await c.query(`
    SELECT (s."conversationId" IS NOT NULL) AS linked, count(*)::int AS n
      FROM chatbot_sessions s
     WHERE EXISTS (SELECT 1 FROM chatbot_messages m
                    WHERE m."sessionId" = s.id AND m.role = 'bot')
     GROUP BY 1`);
  const spokeLinked = spoke.rows.find((r) => r.linked)?.n ?? 0;
  const spokeUnlinked = spoke.rows.find((r) => !r.linked)?.n ?? 0;
  console.log('  linked  :', spokeLinked);
  console.log('  UNLINKED:', spokeUnlinked, '  <- these are the broken ones');

  console.log('\n--- verdict ---');
  if (spokeUnlinked > 0) {
    console.log('  Sessions where the assistant replied but no conversation');
    console.log('  id was recorded. The agent resolves the lead from that id,');
    console.log('  so its submit_* tools fail with no_session_for_conversation.');
  } else if (today.rows[0].n === 0) {
    console.log('  No sessions created today — leads are not being created.');
  } else {
    console.log('  Linking looks healthy: every session the assistant replied');
    console.log('  in has a conversation id. If submissions still fail, send');
    console.log('  the backend log lines for "no session found for');
    console.log('  conversation_id" — the cause is elsewhere.');
  }

  await c.end();
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
