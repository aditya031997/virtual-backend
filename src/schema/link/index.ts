import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '@/schema/user/user.entity';
import { Sitemap } from '@/schema/sitemap';

@Entity('link')
export class Link {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column()
    url!: string;

    @Column({ type: 'uuid' })
    userId!: string;

    @Column({ nullable: true })
    documentId!: string;

    @Column({ type: 'varchar', default: 'success' })
    status!: 'pending' | 'success' | 'error';

    @ManyToOne(() => User)
    @JoinColumn({ name: 'userId' })
    user!: User;

    @CreateDateColumn()
    createdAt!: Date;

    @Column({ nullable: true })
    sitemapId!: string;

    @ManyToOne(() => Sitemap, (sitemap) => sitemap.links, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sitemapId' })
    sitemap!: Sitemap;
}
