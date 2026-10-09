import { MigrationInterface, QueryRunner } from "typeorm";

export class Chnagetextschema1761290868696 implements MigrationInterface {
    name = 'Chnagetextschema1761290868696'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "text" DROP CONSTRAINT "FK_6953cd28d551af06f91fb531adf"`);
        await queryRunner.query(`ALTER TABLE "text" DROP COLUMN "folderId"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "text" ADD "folderId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "text" ADD CONSTRAINT "FK_6953cd28d551af06f91fb531adf" FOREIGN KEY ("folderId") REFERENCES "folder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
