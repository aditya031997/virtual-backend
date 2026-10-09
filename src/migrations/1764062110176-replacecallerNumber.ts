import { MigrationInterface, QueryRunner } from "typeorm";

export class ReplacecallerNumber1764062110176 implements MigrationInterface {
    name = 'ReplacecallerNumber1764062110176'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" RENAME COLUMN "humanAgentContact" TO "callerNumber"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" RENAME COLUMN "callerNumber" TO "humanAgentContact"`);
    }

}
