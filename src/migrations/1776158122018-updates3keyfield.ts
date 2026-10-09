import { MigrationInterface, QueryRunner } from "typeorm";

export class Updates3keyfield1776158122018 implements MigrationInterface {
    name = 'Updates3keyfield1776158122018'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "knowledge_base_source" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "documentId" character varying NOT NULL, "sourceType" character varying NOT NULL, "s3Key" text, "originalUrl" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_590e56c6191eb306343b6aa7982" UNIQUE ("documentId"), CONSTRAINT "PK_1cf2a75ed21885e55a24159d87e" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "knowledge_base_source"`);
    }

}
