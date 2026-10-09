import { MigrationInterface, QueryRunner } from "typeorm";

export class ModifyparentCompany1759838266811 implements MigrationInterface {
    name = 'ModifyparentCompany1759838266811'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sites" DROP CONSTRAINT "FK_40b488a4b8629cc8bcccb5a28ec"`);
        await queryRunner.query(`ALTER TABLE "sites" ADD CONSTRAINT "FK_40b488a4b8629cc8bcccb5a28ec" FOREIGN KEY ("parentCompanyId") REFERENCES "parent_companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sites" DROP CONSTRAINT "FK_40b488a4b8629cc8bcccb5a28ec"`);
        await queryRunner.query(`ALTER TABLE "sites" ADD CONSTRAINT "FK_40b488a4b8629cc8bcccb5a28ec" FOREIGN KEY ("parentCompanyId") REFERENCES "parent_companies"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
