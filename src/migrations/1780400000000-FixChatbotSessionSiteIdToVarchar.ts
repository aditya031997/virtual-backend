import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reverts `chatbot_sessions.siteId` from uuid back to varchar.
 *
 * The column was made uuid to match `sites.id` in THIS database. That was the
 * wrong reference: the widget's siteId comes from the smartcaller service,
 * whose Prisma schema declares `id String @id @default(cuid())`. A cuid is not
 * a uuid, so every insert failed with
 *
 *   invalid input syntax for type uuid: "cmspz5rxy0007vdkkl3c4tboz"
 *
 * and the whole lead-creation transaction rolled back. No session was
 * recorded, which is why chats stopped appearing in Chat History and why every
 * agent tool call failed with "no_session_for_conversation" — there was no
 * session for the conversation id to resolve to.
 *
 * varchar accepts both id formats, so this works whichever service the id came
 * from. The Site join added alongside it stays: it simply never matches for a
 * cuid, which is correct — that site lives in another database.
 */
export class FixChatbotSessionSiteIdToVarchar1780400000000
  implements MigrationInterface
{
  name = 'FixChatbotSessionSiteIdToVarchar1780400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [column] = (await queryRunner.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'chatbot_sessions' AND column_name = 'siteId'`,
    )) as { data_type: string }[];

    if (!column || column.data_type === 'character varying') return;

    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions"
         ALTER COLUMN "siteId" TYPE character varying(255)
         USING "siteId"::text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Anything that is not a uuid becomes NULL rather than failing the
    // migration — a cuid has no uuid equivalent.
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions"
         ALTER COLUMN "siteId" TYPE uuid
         USING CASE
           WHEN "siteId" ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
           THEN "siteId"::uuid
           ELSE NULL
         END`,
    );
  }
}
