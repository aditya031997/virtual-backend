import { MigrationInterface, QueryRunner } from "typeorm";

export class Createtrascripttable1762941361374 implements MigrationInterface {
    name = 'Createtrascripttable1762941361374'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "call_transcript" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversationId" character varying(255) NOT NULL, "transcript" jsonb NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_38eb98cc109956aafa8fe619d50" UNIQUE ("conversationId"), CONSTRAINT "PK_73f8a93c97548ebfe9a9e72b407" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "call_history" ADD "handledBy" character varying(100)`);
        await queryRunner.query(`ALTER TABLE "call_history" ADD "isTransferred" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "isTransferred"`);
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "handledBy"`);
        await queryRunner.query(`DROP TABLE "call_transcript"`);
    }

}
