import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateAgent1759138839688 implements MigrationInterface {
    name = 'UpdateAgent1759138839688'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "human_agents" DROP CONSTRAINT "FK_8eba4e7b958f3a257977719ceb2"`);
        await queryRunner.query(`ALTER TABLE "human_agents" DROP CONSTRAINT "FK_069d7e6a51b1c7d2f0ff99e008e"`);
        await queryRunner.query(`ALTER TABLE "human_agents" DROP COLUMN "supportTypeId"`);
        await queryRunner.query(`ALTER TABLE "human_agents" DROP COLUMN "departmentTypeId"`);
        await queryRunner.query(`ALTER TABLE "human_agents" DROP COLUMN "reseller"`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD "dealerId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD CONSTRAINT "FK_96d8093528e7e538af6253858ae" FOREIGN KEY ("dealerId") REFERENCES "dealer"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "human_agents" DROP CONSTRAINT "FK_96d8093528e7e538af6253858ae"`);
        await queryRunner.query(`ALTER TABLE "human_agents" DROP COLUMN "dealerId"`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD "reseller" character varying(100) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD "departmentTypeId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD "supportTypeId" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD CONSTRAINT "FK_069d7e6a51b1c7d2f0ff99e008e" FOREIGN KEY ("departmentTypeId") REFERENCES "department_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD CONSTRAINT "FK_8eba4e7b958f3a257977719ceb2" FOREIGN KEY ("supportTypeId") REFERENCES "support_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

}
