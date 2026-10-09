import { MigrationInterface, QueryRunner } from "typeorm";

export class Createhubspotentity1765882804432 implements MigrationInterface {
    name = 'Createhubspotentity1765882804432'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "hubspot_integrations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "accessToken" text NOT NULL, "portalId" character varying(50) NOT NULL, "accountName" character varying(255), "isActive" boolean NOT NULL DEFAULT true, "connectedAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_27da5d54638733454b1175c5743" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "hubspot_integrations" ADD CONSTRAINT "FK_29744f16b1e4ff8286d911f3b58" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        
        // Create index on userId for faster lookups
        await queryRunner.query(`CREATE INDEX "IDX_hubspot_integrations_userId" ON "hubspot_integrations" ("userId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_hubspot_integrations_userId"`);
        await queryRunner.query(`ALTER TABLE "hubspot_integrations" DROP CONSTRAINT "FK_29744f16b1e4ff8286d911f3b58"`);
        await queryRunner.query(`DROP TABLE "hubspot_integrations"`);
    }

}
