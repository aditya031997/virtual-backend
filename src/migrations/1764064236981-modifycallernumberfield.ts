import { MigrationInterface, QueryRunner } from "typeorm";

export class Modifycallernumberfield1764064236981 implements MigrationInterface {
    name = 'Modifycallernumberfield1764064236981'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "callerNumber"`);
        await queryRunner.query(`ALTER TABLE "call_history" ADD "callerNumber" character varying(30)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_history" DROP COLUMN "callerNumber"`);
        await queryRunner.query(`ALTER TABLE "call_history" ADD "callerNumber" character varying(20)`);
    }

}
