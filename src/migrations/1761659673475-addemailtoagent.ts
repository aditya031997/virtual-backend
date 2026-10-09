import { MigrationInterface, QueryRunner } from "typeorm";

export class Addemailtoagent1761659673475 implements MigrationInterface {
    name = 'Addemailtoagent1761659673475'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "human_agents" ADD "email" character varying(100) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "human_agents" ADD CONSTRAINT "UQ_c1cbea600a26361550e0b0103a3" UNIQUE ("email")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "human_agents" DROP CONSTRAINT "UQ_c1cbea600a26361550e0b0103a3"`);
        await queryRunner.query(`ALTER TABLE "human_agents" DROP COLUMN "email"`);
    }

}
