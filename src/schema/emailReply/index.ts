import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index
} from 'typeorm';
import { SupportEmail } from '@/schema/supportEmail';

@Entity('email_replies')
export class EmailReply {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  supportEmailId: string;

  @ManyToOne(() => SupportEmail, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'supportEmailId' })
  supportEmail: SupportEmail;

  @Column({ type: 'varchar', length: 255 })
  fromEmail: string;

  @Column({ type: 'varchar', length: 255 })
  toEmail: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subject: string | null;

  @Column({ type: 'text' })
  replyContent: string;

  @Column({ 
    type: 'enum', 
    enum: ['draft', 'sent'],
    default: 'draft'
  })
  status: 'draft' | 'sent';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

