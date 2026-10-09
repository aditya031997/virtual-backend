import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDealerTable1758797649829 implements MigrationInterface {
    name = 'CreateDealerTable1758797649829'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "care_facilities" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "facilityCode" character varying(50) NOT NULL, "facilityName" character varying(200) NOT NULL, "reseller" character varying(100) NOT NULL, "agentAssignments" json, "userId" uuid NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_a94a274ac69e4a609390fed05dc" UNIQUE ("facilityCode"), CONSTRAINT "PK_c9b0b916d5aa61db30df3c2280f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "dealer" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "dealerName" character varying(100) NOT NULL, "phone" character varying(20) NOT NULL, "email" character varying(255) NOT NULL, "businessAddress" character varying NOT NULL, "userId" uuid NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_330092c4016e59752786ebbafdd" UNIQUE ("email"), CONSTRAINT "PK_1bd6073e224f6c22ff1d5827add" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "care_facilities" ADD CONSTRAINT "FK_53972af12c194bcdc0a61da988f" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "dealer" ADD CONSTRAINT "FK_7c2e500551158a2e30b129d3c79" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "dealer" DROP CONSTRAINT "FK_7c2e500551158a2e30b129d3c79"`);
        await queryRunner.query(`ALTER TABLE "care_facilities" DROP CONSTRAINT "FK_53972af12c194bcdc0a61da988f"`);
        await queryRunner.query(`DROP TABLE "dealer"`);
        await queryRunner.query(`DROP TABLE "care_facilities"`);
    }

}
