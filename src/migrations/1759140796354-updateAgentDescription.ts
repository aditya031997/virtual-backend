import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateAgentDescription1759140796354 implements MigrationInterface {
    name = 'UpdateAgentDescription1759140796354'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."human_agents_priority_enum" AS ENUM('P1', 'P2', 'P3')`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD "priority" "public"."human_agents_priority_enum" NOT NULL DEFAULT 'P1'`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD "description" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "human_agents" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "human_agents" DROP COLUMN "priority"`);
        await queryRunner.query(`DROP TYPE "public"."human_agents_priority_enum"`);
    }

}
