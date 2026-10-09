import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records who each document may be disclosed to, so the chatbot can email
 * guides and brochures without leaking one customer's documents to another.
 *
 * Three values: 'public' (anyone), 'dealer' (that dealer's chain) and 'site'
 * (that site only). Stored as varchar rather than a Postgres enum so the set
 * can be widened later without a type migration, matching how the existing
 * `status` column on this table is handled.
 *
 * NOT NULL with a 'site' default, which is the most restrictive value. Every
 * row that exists today therefore becomes site-only rather than public: these
 * documents were uploaded before anyone recorded an audience, so nothing is
 * known about who may see them, and the safe reading of "unknown" is "nobody
 * outside the site". Widening them is a deliberate admin action in the panel,
 * which is the client-side review this CR already depends on.
 */
export class AddDocumentVisibility1780500000000 implements MigrationInterface {
  name = 'AddDocumentVisibility1780500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "document" ADD "visibility" character varying NOT NULL DEFAULT 'site'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "document" DROP COLUMN "visibility"`);
  }
}
