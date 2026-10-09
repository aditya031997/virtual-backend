import { MigrationInterface, QueryRunner } from "typeorm";

export class Chnagesupportmeailassoftdelete1765436037066 implements MigrationInterface {
    name = 'Chnagesupportmeailassoftdelete1765436037066'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "support_emails" ADD "deletedAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "support_emails" DROP COLUMN "deletedAt"`);
    }

}
