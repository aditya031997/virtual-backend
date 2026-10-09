import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn,OneToMany } from 'typeorm';
import { User } from '@/schema/user/user.entity';
import { Site } from '@/schema';

@Entity('parent_companies')
export class ParentCompany {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 100 })
    companyName: string;

    @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
    email: string | null;

    @Column({ type: 'varchar', length: 20, nullable: true })
    contactNumber: string | null;

    @Column({ type: 'varchar', length: 100 })
    businessAddress: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    state: string;

    @Column({ type: 'varchar', length: 10, nullable: true })
    stateCode: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    city: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'uuid' })
    userId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'userId' })
    user: User;

    @OneToMany(() => Site, (site) => site.parentCompany, { cascade: true })
    sites: Site[];

    @Column({ type: 'boolean', default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}