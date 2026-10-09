import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { IGenerateReplyParams, IGenerateReplyResult } from '@/types/openai';

@Injectable()
export class OpenAIHelper {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(OpenAIHelper.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY is not configured. AI reply generation will not work.');
    }
    
    this.openai = new OpenAI({
      apiKey: apiKey || '',
    });
  }

  /**
   * Generate an email reply based on call transcript and email content
   */
  async generateEmailReply(params: IGenerateReplyParams): Promise<IGenerateReplyResult> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    
    if (!apiKey) {
      return {
        success: false,
        error: 'OpenAI API key is not configured',
      };
    }

    try {
      const prompt = this.buildPrompt(params);
      
      this.logger.log(`Generating AI reply for customer: ${params.customerName}`);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a professional customer support agent for SmartCaller, an AI-powered virtual receptionist service. 
Your task is to generate helpful, empathetic, and professional email replies to customer callback requests.
Always be courteous, address customers by name, and provide clear next steps or assurance.
Keep responses concise (2-3 paragraphs) and professional.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      const generatedReply = response.choices[0]?.message?.content?.trim();

      if (!generatedReply) {
        return {
          success: false,
          error: 'No reply generated from OpenAI',
        };
      }

      this.logger.log(`Successfully generated AI reply for customer: ${params.customerName}`);

      return {
        success: true,
        generatedReply,
      };
    } catch (error: any) {
      this.logger.error(`Failed to generate AI reply: ${error.message}`, error.stack);
      
      return {
        success: false,
        error: error.message || 'Failed to generate reply',
      };
    }
  }

  /**
   * Build the prompt for OpenAI based on the provided parameters
   */
  private buildPrompt(params: IGenerateReplyParams): string {
    let prompt = `Generate a professional email reply for the following callback request:

Customer Information:
- Name: ${params.customerName || 'Customer'}`;

    if (params.customerEmail) {
      prompt += `\n- Email: ${params.customerEmail}`;
    }

    if (params.customerPhone) {
      prompt += `\n- Phone: ${params.customerPhone}`;
    }

    if (params.dealerCode) {
      prompt += `\n- Dealer Code: ${params.dealerCode}`;
    }

    prompt += `\n\nSubject: ${params.subject || 'Callback Request'}`;

    if (params.transcript) {
      prompt += `\n\nCall Transcript:
${params.transcript}`;
    }

    if (params.emailBody) {
      prompt += `\n\nOriginal Email Content:
${params.emailBody}`;
    }

    prompt += `\n\nPlease generate a professional, empathetic reply that:
1. Addresses the customer by name
2. Acknowledges their callback request
3. Provides assurance that their concern will be addressed
4. Includes appropriate next steps if applicable
5. Ends with a professional sign-off from "SmartCaller Support Team"

Generate the reply:`;

    return prompt;
  }
}

