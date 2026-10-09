import { MigrationInterface, QueryRunner } from "typeorm";

export class Changecallhistorycallernumber1764045684684 implements MigrationInterface {
    name = 'Changecallhistorycallernumber1764045684684'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" RENAME COLUMN "humanAgentContact" TO "callerNumber"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" RENAME COLUMN "callerNumber" TO "humanAgentContact"`);
    }

}
