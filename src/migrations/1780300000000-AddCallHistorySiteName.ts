import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records the site a caller identified, so Call History can show a Site Name
 * column alongside the one Chat History already has.
 *
 * The existing `facility` column holds a dealer code, which cannot stand in
 * for this: one dealer covers many sites, so the code resolves to several
 * possible names and none of them is knowably correct.
 *
 * The value comes from the agent's `get_site_info` tool, whose result the
 * webhook already parses — it was being used only to build the notification
 * email and then discarded.
 *
 * Nullable with no backfill. Calls before this column existed have no site
 * recorded, and calls where the agent never asked for one genuinely have none.
 */
export class AddCallHistorySiteName1780300000000 implements MigrationInterface {
  name = 'AddCallHistorySiteName1780300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "call_history" ADD "siteName" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "call_history" DROP COLUMN "siteName"`,
    );
  }
}
