import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Text } from '@/schema';
import { TextService } from '@/text/textService';
import { TextController } from '@/text/textController';

@Module({
    imports: [TypeOrmModule.forFeature([Text])],
    controllers: [TextController],
    providers: [TextService],
    exports: [TextService],
})
export class TextModule {}