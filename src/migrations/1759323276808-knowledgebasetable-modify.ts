import { MigrationInterface, QueryRunner } from "typeorm";

export class KnowledgebasetableModify1759323276808 implements MigrationInterface {
    name = 'KnowledgebasetableModify1759323276808'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "link" DROP COLUMN "title"`);
        await queryRunner.query(`ALTER TABLE "link" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "text" DROP COLUMN "title"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "text" ADD "title" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "link" ADD "description" text`);
        await queryRunner.query(`ALTER TABLE "link" ADD "title" character varying NOT NULL`);
    }

}
