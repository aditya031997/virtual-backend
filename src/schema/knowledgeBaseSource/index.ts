import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('knowledge_base_source')
export class KnowledgeBaseSource {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    documentId: string;

    @Column({ type: 'varchar' })
    sourceType: 'file' | 'url' | 'text';

    @Column({ type: 'text', nullable: true })
    s3Key: string | null;

    @Column({ type: 'text', nullable: true })
    originalUrl: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
