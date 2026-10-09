import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '@/schema/user/user.entity';

@Entity('folder')
export class Folder {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar', length: 100 })
    folderName: string;

    @Column({ type: 'varchar', length: 100 })
    section: string;

    @Column({ type: 'uuid' })
    userId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ type: 'uuid', nullable: true })
    parentId: string | null;

    @ManyToOne(() => Folder, { nullable: true })
    @JoinColumn({ name: 'parentId' })
    parent: Folder;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
