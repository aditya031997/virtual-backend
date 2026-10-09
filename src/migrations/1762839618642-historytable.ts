import { MigrationInterface, QueryRunner } from "typeorm";

export class Historytable1762839618642 implements MigrationInterface {
    name = 'Historytable1762839618642'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."call_history_feedback_enum" AS ENUM('Positive', 'Neutral', 'Negative')`);
        await queryRunner.query(`CREATE TABLE "call_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "callerName" character varying(100) NOT NULL, "phoneNumber" character varying(20) NOT NULL, "callDateTime" TIMESTAMP NOT NULL, "duration" character varying(20), "afterHours" boolean, "facility" character varying(255), "feedback" "public"."call_history_feedback_enum" NOT NULL DEFAULT 'Neutral', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6587a86413c25970c7e5123b436" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "call_history"`);
        await queryRunner.query(`DROP TYPE "public"."call_history_feedback_enum"`);
    }

}
