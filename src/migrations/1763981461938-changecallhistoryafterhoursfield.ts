import { MigrationInterface, QueryRunner } from "typeorm";

export class Changecallhistoryafterhoursfield1763981461938 implements MigrationInterface {
    name = 'Changecallhistoryafterhoursfield1763981461938'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" ADD "callStatus" character varying(50)`);
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "afterHours"`);
        await queryRunner.query(`ALTER TABLE "call_history" ADD "afterHours" character varying(50)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "afterHours"`);
        await queryRunner.query(`ALTER TABLE "call_history" ADD "afterHours" boolean`);
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "callStatus"`);
    }

}
