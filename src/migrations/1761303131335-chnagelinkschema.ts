import { MigrationInterface, QueryRunner } from "typeorm";

export class Chnagelinkschema1761303131335 implements MigrationInterface {
    name = 'Chnagelinkschema1761303131335'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "link" DROP CONSTRAINT "FK_1f8538f1595d7007b8a92c460ca"`);
        await queryRunner.query(`ALTER TABLE "link" DROP COLUMN "folderId"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "link" ADD "folderId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "link" ADD CONSTRAINT "FK_1f8538f1595d7007b8a92c460ca" FOREIGN KEY ("folderId") REFERENCES "folder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
