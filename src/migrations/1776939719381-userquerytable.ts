import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Same schema as user_transfer_query from an earlier migration timestamp.
 * Idempotent: safe if enum/table already exist (avoids duplicate CREATE TYPE).
 */
export class Userquerytable1776939719381 implements MigrationInterface {
  name = 'Userquerytable1776939719381';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
DO $$ BEGIN
    CREATE TYPE "public"."user_transfer_query_querystatus_enum" AS ENUM('pending', 'resolved', 'escalated');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
`);
    const exists = await queryRunner.hasTable('user_transfer_query');
    if (!exists) {
      await queryRunner.query(
        `CREATE TABLE "user_transfer_query" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "queryStatus" "public"."user_transfer_query_querystatus_enum" NOT NULL DEFAULT 'pending', "currentCallSid" character varying(64) NOT NULL, "conversationId" character varying(255) NOT NULL, "transferPhoneNumber" character varying(40) NOT NULL, "callerName" character varying(200), "callerEmail" character varying(255), "callerPhone" character varying(40), "dealerCode" character varying(100), "agentQueue" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b893c8fd14b3f6eb87a77a8405a" PRIMARY KEY ("id"))`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_transfer_query"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."user_transfer_query_querystatus_enum"`,
    );
  }
}
