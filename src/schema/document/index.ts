import { 
    Entity, 
    PrimaryGeneratedColumn, 
    Column, 
    CreateDateColumn, 
    UpdateDateColumn, 
    ManyToOne, 
    JoinColumn 
} from 'typeorm';
import { User } from '@/schema/user/user.entity';
import { Folder } from '@/schema';
import { DocumentVisibility, DEFAULT_DOCUMENT_VISIBILITY } from '@/types/document';

@Entity('document')
export class Document {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ nullable: true })
    documentId: string;

    @Column({ type: 'varchar', default: 'success' })
    status: string;

    @Column()
    fileName: string; 

    @Column()
    fileUrl: string; 

    @Column()
    fileType: string;

    @Column({ type: 'bigint' })
    fileSize: number; 

    @Column()
    mimeType: string; 

    /**
     * Who this document may be disclosed to. Stored as varchar rather than a
     * Postgres enum so the set of values can be widened without a type
     * migration, matching how `status` above is handled.
     *
     * Defaults to the most restrictive value at both the column and the
     * application level, so a document is never disclosed merely because
     * nobody said who could see it.
     */
    @Column({ type: 'varchar', default: DEFAULT_DOCUMENT_VISIBILITY })
    visibility: DocumentVisibility;

    @Column({ type: 'uuid' })
    folderId: string;

    @ManyToOne(() => Folder)
    @JoinColumn({ name: 'folderId' })
    folder: Folder;

    @Column({ type: 'uuid' })
    userId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'userId' })
    user: User;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}