import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  UpdateDateColumn
} from 'typeorm';
import type { Transcript } from '@/types/callTranscript';

@Entity('call_transcript')
export class CallTranscript {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  conversationId: string;

  @Column({ type: 'jsonb' })
  transcript: Transcript;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

