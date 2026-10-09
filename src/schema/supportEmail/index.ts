import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  UpdateDateColumn,
  Index
} from 'typeorm';

@Entity('support_emails')
export class SupportEmail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'int', unique: true })
  uid: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  messageId: string | null;

  @Column({ type: 'varchar', length: 255 })
  fromEmail: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fromName: string | null;

  @Column({ type: 'simple-array', nullable: true })
  toEmails: string[];

  @Column({ type: 'varchar', length: 500, nullable: true })
  subject: string | null;

  @Column({ type: 'timestamp' })
  emailDate: Date;

  @Column({ type: 'text', nullable: true })
  bodyText: string | null;

  @Column({ type: 'text', nullable: true })
  bodyHtml: string | null;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

