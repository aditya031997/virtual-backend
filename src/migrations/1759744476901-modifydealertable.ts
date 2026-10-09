import { MigrationInterface, QueryRunner } from "typeorm";

export class Modifydealertable1759744476901 implements MigrationInterface {
    name = 'Modifydealertable1759744476901'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sites" DROP CONSTRAINT "FK_f6ede09c5a3e1529c82afec9ed1"`);
        await queryRunner.query(`ALTER TABLE "sites" ADD CONSTRAINT "FK_f6ede09c5a3e1529c82afec9ed1" FOREIGN KEY ("assignedDealerId") REFERENCES "dealer"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sites" DROP CONSTRAINT "FK_f6ede09c5a3e1529c82afec9ed1"`);
        await queryRunner.query(`ALTER TABLE "sites" ADD CONSTRAINT "FK_f6ede09c5a3e1529c82afec9ed1" FOREIGN KEY ("assignedDealerId") REFERENCES "dealer"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
