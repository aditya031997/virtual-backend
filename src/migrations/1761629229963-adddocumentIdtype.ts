import { MigrationInterface, QueryRunner } from "typeorm";

export class AdddocumentIdtype1761629229963 implements MigrationInterface {
    name = 'AdddocumentIdtype1761629229963'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "faq" DROP COLUMN "documentId"`);
        await queryRunner.query(`ALTER TABLE "faq" ADD "documentId" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "faq" DROP COLUMN "documentId"`);
        await queryRunner.query(`ALTER TABLE "faq" ADD "documentId" uuid`);
    }

}
