import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSupportType1759989213856 implements MigrationInterface {
    name = 'AddSupportType1759989213856'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "human_agents" DROP CONSTRAINT "FK_28093ddd339ca3368fa53f8cd25"`);
        await queryRunner.query(`ALTER TABLE "human_agents" DROP CONSTRAINT "FK_d5a7f1ba0d2facc78b5a3783510"`);
        await queryRunner.query(`ALTER TABLE "human_agents" DROP COLUMN "businessHoursId"`);
        await queryRunner.query(`ALTER TABLE "human_agents" DROP COLUMN "afterHoursId"`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD "supportTypeId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD CONSTRAINT "FK_8eba4e7b958f3a257977719ceb2" FOREIGN KEY ("supportTypeId") REFERENCES "support_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "human_agents" DROP CONSTRAINT "FK_8eba4e7b958f3a257977719ceb2"`);
        await queryRunner.query(`ALTER TABLE "human_agents" DROP COLUMN "supportTypeId"`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD "afterHoursId" uuid`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD "businessHoursId" uuid`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD CONSTRAINT "FK_d5a7f1ba0d2facc78b5a3783510" FOREIGN KEY ("businessHoursId") REFERENCES "business_hours"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD CONSTRAINT "FK_28093ddd339ca3368fa53f8cd25" FOREIGN KEY ("afterHoursId") REFERENCES "after_hours"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
