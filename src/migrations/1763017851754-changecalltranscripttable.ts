import { MigrationInterface, QueryRunner } from "typeorm";

export class Changecalltranscripttable1763017851754 implements MigrationInterface {
    name = 'Changecalltranscripttable1763017851754'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_transcript" DROP COLUMN "timeInCallSecs"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_transcript" ADD "timeInCallSecs" character varying(20)`);
    }

}
