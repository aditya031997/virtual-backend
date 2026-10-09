import { MigrationInterface, QueryRunner } from "typeorm";

export class HumanAgentAndAvailabilityManagement1757681486932 implements MigrationInterface {
    name = 'HumanAgentAndAvailabilityManagement1757681486932'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "department_types" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying(100) NOT NULL,
                "description" character varying(255),
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_63cd63e7fbf06f343cbdebc40f2" UNIQUE ("name"),
                CONSTRAINT "PK_ac9333bc4e730ca930a69bf7396" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "human_agents" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "agentName" character varying(100) NOT NULL,
                "reseller" character varying(100) NOT NULL,
                "phone" character varying(20) NOT NULL,
                "supportTypeId" uuid NOT NULL,
                "departmentTypeId" uuid NOT NULL,
                "userId" uuid NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "isAvailable" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_fea07ea85869c7495ccf1f196ee" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "support_types" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying(100) NOT NULL,
                "description" character varying(255),
                "isActive" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_4693b179eca404e95b957f39c85" UNIQUE ("name"),
                CONSTRAINT "PK_6f0c482e32339736902d144cdef" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "public_holidays" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "holidayName" character varying(100) NOT NULL,
                "startDate" date NOT NULL,
                "endDate" date NOT NULL,
                "startTime" TIME,
                "endTime" TIME,
                "isActive" boolean NOT NULL DEFAULT true,
                "userId" uuid NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_e959831bb7c79c39cc58207c122" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "business_hours" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "dayOfWeek" character varying(10) NOT NULL,
                "startTime" TIME NOT NULL,
                "endTime" TIME NOT NULL,
                "isAvailable" boolean NOT NULL DEFAULT true,
                "userId" uuid NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_560a76077605005da835fe505a5" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "after_hours" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "dayOfWeek" character varying(10) NOT NULL,
                "startTime" TIME NOT NULL,
                "endTime" TIME NOT NULL,
                "isAvailable" boolean NOT NULL DEFAULT true,
                "userId" uuid NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_3a5dd4dbb0b314fcfb9e7ee9480" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "human_agents"
            ADD CONSTRAINT "FK_8eba4e7b958f3a257977719ceb2" FOREIGN KEY ("supportTypeId") REFERENCES "support_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "human_agents"
            ADD CONSTRAINT "FK_069d7e6a51b1c7d2f0ff99e008e" FOREIGN KEY ("departmentTypeId") REFERENCES "department_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "human_agents"
            ADD CONSTRAINT "FK_18ca06deead0781c3966dd18a75" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "public_holidays"
            ADD CONSTRAINT "FK_15ff8d6c848341efa49ec2715a5" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "business_hours"
            ADD CONSTRAINT "FK_f2a49ac3a76b7ddfa48d423a7ba" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "after_hours"
            ADD CONSTRAINT "FK_86ca0aefdbc09b991ff8c5e421d" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "after_hours" DROP CONSTRAINT "FK_86ca0aefdbc09b991ff8c5e421d"
        `);
        await queryRunner.query(`
            ALTER TABLE "business_hours" DROP CONSTRAINT "FK_f2a49ac3a76b7ddfa48d423a7ba"
        `);
        await queryRunner.query(`
            ALTER TABLE "public_holidays" DROP CONSTRAINT "FK_15ff8d6c848341efa49ec2715a5"
        `);
        await queryRunner.query(`
            ALTER TABLE "human_agents" DROP CONSTRAINT "FK_18ca06deead0781c3966dd18a75"
        `);
        await queryRunner.query(`
            ALTER TABLE "human_agents" DROP CONSTRAINT "FK_069d7e6a51b1c7d2f0ff99e008e"
        `);
        await queryRunner.query(`
            ALTER TABLE "human_agents" DROP CONSTRAINT "FK_8eba4e7b958f3a257977719ceb2"
        `);
        await queryRunner.query(`
            DROP TABLE "after_hours"
        `);
        await queryRunner.query(`
            DROP TABLE "business_hours"
        `);
        await queryRunner.query(`
            DROP TABLE "public_holidays"
        `);
        await queryRunner.query(`
            DROP TABLE "support_types"
        `);
        await queryRunner.query(`
            DROP TABLE "human_agents"
        `);
        await queryRunner.query(`
            DROP TABLE "department_types"
        `);
    }

}
