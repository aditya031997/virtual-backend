import { MigrationInterface, QueryRunner } from "typeorm";

export class AdddocumentId1761628976779 implements MigrationInterface {
    name = 'AdddocumentId1761628976779'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "faq" ADD "documentId" uuid`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "faq" DROP COLUMN "documentId"`);
    }

}
