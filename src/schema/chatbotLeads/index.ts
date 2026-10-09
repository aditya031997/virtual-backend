import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('chatbot_leads')
export class ChatbotLead {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  contact!: string | null;

  // Digits-only canonical form of `contact`, used for duplicate detection and
  // the partial UNIQUE constraint. Null when no phone is provided (multiple
  // NULLs do not collide in the unique index).
  @Column({ type: 'varchar', length: 30, nullable: true })
  contactNormalized!: string | null;

  @Column({ type: 'varchar', length: 50, default: 'Active' })
  chatStatus!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
