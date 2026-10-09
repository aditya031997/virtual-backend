import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrects `chatbot_sessions.siteId` from character varying to uuid.
 *
 * It is joined against `sites.id`, which is uuid, and Postgres refuses to
 * compare the two types — so the Chat History query failed with "operator does
 * not exist: uuid = character varying" rather than simply showing no site
 * name. The column was added as varchar in 1780100000000; this repairs any
 * database that already ran that version.
 *
 * The cast is safe: the column was added empty and only ever written with site
 * ids, and the USING clause turns anything unparseable into NULL rather than
 * failing the migration.
 */
export class FixChatbotSessionSiteIdType1780200000000
  implements MigrationInterface
{
  name = 'FixChatbotSessionSiteIdType1780200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [column] = (await queryRunner.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'chatbot_sessions' AND column_name = 'siteId'`,
    )) as { data_type: string }[];

    // Already uuid on a database created after the fix — nothing to do.
    if (!column || column.data_type === 'uuid') return;

    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions"
         ALTER COLUMN "siteId" TYPE uuid
         USING NULLIF("siteId", '')::uuid`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "chatbot_sessions"
         ALTER COLUMN "siteId" TYPE character varying(255)
         USING "siteId"::text`,
    );
  }
}
