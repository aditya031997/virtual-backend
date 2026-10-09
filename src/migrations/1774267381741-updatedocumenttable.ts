import { MigrationInterface, QueryRunner } from "typeorm";

export class Updatedocumenttable1774267381741 implements MigrationInterface {
    name = 'Updatedocumenttable1774267381741'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "hubspot_integrations" DROP CONSTRAINT "FK_29744f16b1e4ff8286d911f3b58"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_hubspot_integrations_userId"`);
        await queryRunner.query(`CREATE TABLE "sitemap" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "url" character varying NOT NULL, "documentIds" text array NOT NULL DEFAULT '{}', "userId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "lastSyncedAt" TIMESTAMP, "syncStatus" character varying NOT NULL DEFAULT 'pending', "syncErrorMessage" text, CONSTRAINT "PK_2620577a53a90ccb0d8e62b328c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "support_emails" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "document" ADD "status" character varying NOT NULL DEFAULT 'success'`);
        await queryRunner.query(`ALTER TABLE "link" ADD "sitemapId" uuid`);
        await queryRunner.query(`ALTER TABLE "sitemap" ADD CONSTRAINT "FK_e92752b9a0e23eec7e70df7aaa6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "link" ADD CONSTRAINT "FK_a3c042c9f596c886fe5fd25a897" FOREIGN KEY ("sitemapId") REFERENCES "sitemap"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "hubspot_integrations" ADD CONSTRAINT "FK_29744f16b1e4ff8286d911f3b58" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "hubspot_integrations" DROP CONSTRAINT "FK_29744f16b1e4ff8286d911f3b58"`);
        await queryRunner.query(`ALTER TABLE "link" DROP CONSTRAINT "FK_a3c042c9f596c886fe5fd25a897"`);
        await queryRunner.query(`ALTER TABLE "sitemap" DROP CONSTRAINT "FK_e92752b9a0e23eec7e70df7aaa6"`);
        await queryRunner.query(`ALTER TABLE "link" DROP COLUMN "sitemapId"`);
        await queryRunner.query(`ALTER TABLE "document" DROP COLUMN "status"`);
        await queryRunner.query(`ALTER TABLE "support_emails" ADD "deletedAt" TIMESTAMP`);
        await queryRunner.query(`DROP TABLE "sitemap"`);
        await queryRunner.query(`CREATE INDEX "IDX_hubspot_integrations_userId" ON "hubspot_integrations" ("userId") `);
        await queryRunner.query(`ALTER TABLE "hubspot_integrations" ADD CONSTRAINT "FK_29744f16b1e4ff8286d911f3b58" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
