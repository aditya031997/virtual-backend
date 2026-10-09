import { MigrationInterface, QueryRunner } from "typeorm";

export class Chnagedocumentschemafield1761379095577 implements MigrationInterface {
    name = 'Chnagedocumentschemafield1761379095577'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "document" ADD "documentId" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "document" DROP COLUMN "documentId"`);
    }

}
