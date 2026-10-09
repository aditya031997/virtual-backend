import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveHumanAgentEmailUniqueConstraint1778505000000 implements MigrationInterface {
    name = 'RemoveHumanAgentEmailUniqueConstraint1778505000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            DECLARE
                v_constraint_name text;
            BEGIN
                SELECT tc.constraint_name
                INTO v_constraint_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.constraint_column_usage ccu
                    ON tc.constraint_name = ccu.constraint_name
                    AND tc.table_schema = ccu.table_schema
                WHERE tc.table_name = 'human_agents'
                  AND tc.constraint_type = 'UNIQUE'
                  AND ccu.column_name = 'email'
                LIMIT 1;

                IF v_constraint_name IS NOT NULL THEN
                    EXECUTE format('ALTER TABLE "human_agents" DROP CONSTRAINT %I', v_constraint_name);
                END IF;
            END $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "human_agents"
            ADD CONSTRAINT "UQ_human_agents_email" UNIQUE ("email")
        `);
    }
}

