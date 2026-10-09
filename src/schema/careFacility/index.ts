import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '@/schema/user/user.entity';

@Entity('care_facilities')
export class CareFacility {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 50, unique: true })
    facilityCode: string;

    @Column({ type: 'varchar', length: 200 })
    facilityName: string;

    @Column({ type: 'varchar', length: 100 })
    reseller: string;

    @Column({ type: 'json', nullable: true })
    agentAssignments: {
        humanAgentId: string;
        priority: string;
    }[];

    @Column({ type: 'uuid' })
    userId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ type: 'boolean', default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}