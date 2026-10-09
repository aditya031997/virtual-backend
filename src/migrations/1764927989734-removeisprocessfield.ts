import { MigrationInterface, QueryRunner } from "typeorm";

export class Removeisprocessfield1764927989734 implements MigrationInterface {
    name = 'Removeisprocessfield1764927989734'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "support_emails" DROP COLUMN "isProcessed"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "support_emails" ADD "isProcessed" boolean NOT NULL DEFAULT false`);
    }

}
