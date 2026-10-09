import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from '@/schema/user/user.entity';
import { Link } from '@/schema/link';

@Entity('sitemap')
export class Sitemap {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    url: string;

    @Column({ type: 'text', array: true, default: [] })
    documentIds: string[];

    @Column({ type: 'uuid' })
    userId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'userId' })
    user: User;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ nullable: true })
    lastSyncedAt: Date;

    @Column({ type: 'varchar', default: 'pending' })
    syncStatus: 'pending' | 'syncing' | 'success' | 'error';

    @Column({ type: 'text', nullable: true, default: null })
    syncErrorMessage: string | null;

    @OneToMany(() => Link, (link) => link.sitemap)
    links: Link[];
}
