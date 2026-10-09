import { MigrationInterface, QueryRunner } from "typeorm";

export class Chnagecallhistoryfieldtype1764237567532 implements MigrationInterface {
    name = 'Chnagecallhistoryfieldtype1764237567532'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "isEscalation"`);
        await queryRunner.query(`CREATE TYPE "public"."call_history_isescalation_enum" AS ENUM('not-requested', 'successful', 'unsuccessful')`);
        await queryRunner.query(`ALTER TABLE "call_history" ADD "isEscalation" "public"."call_history_isescalation_enum" NOT NULL DEFAULT 'not-requested'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "isEscalation"`);
        await queryRunner.query(`DROP TYPE "public"."call_history_isescalation_enum"`);
        await queryRunner.query(`ALTER TABLE "call_history" ADD "isEscalation" boolean NOT NULL DEFAULT false`);
    }

}
