import { MigrationInterface, QueryRunner } from "typeorm";

export class Addcallsummary1764842706811 implements MigrationInterface {
    name = 'Addcallsummary1764842706811'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" ADD "callSummary" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "callSummary"`);
    }

}
