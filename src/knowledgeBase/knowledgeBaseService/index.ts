import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import axios from 'axios';
import * as xml2js from 'xml2js';
import { KnowledgeBaseHelper } from '@/src/helper';
import { KnowledgeBaseInput } from '@/types';
import { Sitemap } from '@/schema/sitemap';
import { Link } from '@/schema/link';
import { KnowledgeBaseSource } from '@/schema/knowledgeBaseSource';
import { Document } from '@/schema';
import { S3Service } from '@/helper/s3-bucket';
import { EmailService } from '@/helper/email-service';
import { AuditFileLoggerService } from '@/auditLog';

@Injectable()
export class KnowledgeBaseService {
  private readonly logger = new Logger(KnowledgeBaseService.name);
  private readonly helper: KnowledgeBaseHelper;
  private readonly elevenLabsClient: ElevenLabsClient;
  private readonly defaultAgentId: string;
  // Secondary agent (the chatbot) that must share the same knowledge base as
  // the receptionist. Optional — empty string means "no chatbot to sync".
  private readonly chatbotAgentId: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Sitemap)
    private sitemapRepository: Repository<Sitemap>,
    @InjectRepository(Link)
    private linkRepository: Repository<Link>,
    @InjectRepository(KnowledgeBaseSource)
    private knowledgeBaseSourceRepository: Repository<KnowledgeBaseSource>,
    @InjectRepository(Document)
    private documentRepository: Repository<Document>,
    private readonly s3Service: S3Service,
    private readonly emailService: EmailService,
    private readonly auditFileLogger: AuditFileLoggerService,
  ) {
    const apiKey = this.configService.get<string>('ELEVENLABS_API_KEY');
    if (!apiKey) {
      console.error('Environment variables:', {
        ELEVENLABS_API_KEY: this.configService.get<string>('ELEVENLABS_API_KEY'),
        ELEVENLABS_AGENT_ID: this.configService.get<string>('ELEVENLABS_AGENT_ID'),
      });
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    const agentId = this.configService.get<string>('ELEVENLABS_AGENT_ID');
    if (!agentId) {
      console.error('ELEVENLABS_AGENT_ID not found in environment variables');
      console.error('Available env vars:', process.env.ELEVENLABS_AGENT_ID);
      throw new Error('ELEVENLABS_AGENT_ID is not configured in .env file');
    }
    this.defaultAgentId = agentId;
    // Optional — when set, every KB add/remove is mirrored to this agent too so
    // the chatbot and the receptionist stay in sync.
    this.chatbotAgentId =
      this.configService.get<string>('ELEVENLABS_CHATBOT_AGENT_ID') || '';
    const headers = { 'xi-api-key': apiKey };
    this.helper = new KnowledgeBaseHelper(headers);

    this.elevenLabsClient = new ElevenLabsClient({
      environment: 'https://api.elevenlabs.io/',
      apiKey,
    });
  }

  /**
   * Mirror an ATTACH onto the chatbot agent: add the given document refs to the
   * chatbot agent's own knowledge base (computed against ITS current config, not
   * the receptionist's). Best-effort — a failure here is logged and swallowed so
   * the receptionist sync (already done by the caller) never regresses.
   */
  private async mirrorAttachToChatbotAgent(documents: any[]) {
    if (!this.chatbotAgentId || !documents?.length) return;
    try {
      const existingAgent = await this.helper.getAgentConfig(this.chatbotAgentId);
      const existingKnowledgeBase =
        existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];
      const existingIds = new Set(existingKnowledgeBase.map((d: any) => d.id));
      const uniqueNewDocuments = documents.filter(d => !existingIds.has(d.id));
      if (!uniqueNewDocuments.length) return;
      const combinedKnowledgeBase = [
        ...existingKnowledgeBase,
        ...uniqueNewDocuments.map(d => ({ type: d.type || 'file', id: d.id, name: d.name })),
      ];
      const ragConfig = existingAgent?.conversation_config?.agent?.prompt?.rag || {
        enabled: true,
        embedding_model: 'e5_mistral_7b_instruct',
        max_vector_distance: 0.6,
        max_documents_length: 50000,
        max_retrieved_rag_chunks_count: 20,
      };
      await this.helper.updateAgentKnowledgeBase(this.chatbotAgentId, combinedKnowledgeBase, ragConfig);
    } catch (error: any) {
      this.logger.warn(
        `Failed to mirror knowledge base attach to chatbot agent ${this.chatbotAgentId}: ${error?.message || error}`,
      );
    }
  }

  /**
   * Mirror a DETACH onto the chatbot agent: remove the given document id from the
   * chatbot agent's knowledge base. Best-effort (logged + swallowed on failure).
   */
  private async mirrorDetachFromChatbotAgent(documentId: string) {
    if (!this.chatbotAgentId || !documentId) return;
    try {
      await this.removeDocumentFromAgent(this.chatbotAgentId, documentId, false);
    } catch (error: any) {
      this.logger.warn(
        `Failed to mirror knowledge base detach from chatbot agent ${this.chatbotAgentId}: ${error?.message || error}`,
      );
    }
  }

  async uploadContentAndAttachAgent(input: KnowledgeBaseInput, agentId: string) {
    if (!input.file && !input.url && !input.text) throw new Error('Provide at least one: file, url, or text');
    if (!agentId) throw new Error('Agent ID required');

    const documents: any[] = [];
    const results: any[] = [];

    if (input.file) {
      try {
        const file = input.file;
        const doc = await this.helper.uploadFile(file, this.elevenLabsClient);
        await this.runPostUploadProcessingSafely(async () => {
          await this.logAndStoreOriginalFile(file, doc.id, doc.name);
        }, `file:${doc.id}`);
        documents.push(doc);
        results.push({ type: 'file', documentId: doc.id, name: doc.name, originalName: file.originalname });
      } catch (error: any) {
        // Check if error is related to file name being too long
        const errorMessage = String(error.message || '');
        if (
          errorMessage.includes('File name too long') ||
          errorMessage.includes('ENAMETOOLONG') ||
          errorMessage.includes('name too long')
        ) {
          throw new Error('File name too long');
        }
        throw error;
      }
    }

    if (input.url) {
      const url = input.url;
      const doc = await this.helper.uploadUrl(url, input.name);
      await this.runPostUploadProcessingSafely(async () => {
        await this.logAndStoreOriginalUrl(url, doc.id, doc.name);
      }, `url:${doc.id}`);
      documents.push(doc);
      results.push({ type: 'url', documentId: doc.id, name: doc.name, originalUrl: url });
    }

    if (input.text) {
      const doc = await this.helper.uploadText(input.text, input.name);
      await this.saveKnowledgeBaseSource({
        documentId: doc.id,
        sourceType: 'text',
        s3Key: null,
        originalUrl: null,
      });
      documents.push(doc);
      results.push({ type: 'text', documentId: doc.id, name: doc.name, textLength: input.text.length });
    }

    // attach documents to agent
    const existingAgent = await this.helper.getAgentConfig(agentId);
    const existingKnowledgeBase = existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];
    const existingIds = new Set(existingKnowledgeBase.map((d: any) => d.id));
    const uniqueNewDocuments = documents.filter(d => !existingIds.has(d.id));
    const combinedKnowledgeBase = [
      ...existingKnowledgeBase,
      ...uniqueNewDocuments.map(d => ({ type: d.type || 'file', id: d.id, name: d.name }))
    ];

    const ragConfig = existingAgent?.conversation_config?.agent?.prompt?.rag || {
      enabled: true,
      embedding_model: 'e5_mistral_7b_instruct',
      max_vector_distance: 0.6,
      max_documents_length: 50000,
      max_retrieved_rag_chunks_count: 20,
    };

    await this.helper.updateAgentKnowledgeBase(agentId, combinedKnowledgeBase, ragConfig);
    await this.mirrorAttachToChatbotAgent(documents);

    // Attaching a doc is not enough — with usage_mode "auto" the agent only
    // answers from a document once its RAG embeddings are computed. Trigger
    // indexing for every newly-attached document so new uploads are actually
    // retrievable (otherwise they are silently invisible to the agent).
    await Promise.all(
      uniqueNewDocuments.map((d) =>
        this.helper.computeRagIndex(
          d.id,
          ragConfig.embedding_model || 'e5_mistral_7b_instruct',
        ),
      ),
    );

    return {
      success: true,
      message: `${results.length} document(s) uploaded successfully`,
      documentsUploaded: results.length,
      documents: results,
      agentUpdate: {
        totalDocumentsInAgent: combinedKnowledgeBase.length,
        newDocumentsAdded: uniqueNewDocuments.length,
        existingDocuments: existingKnowledgeBase.length,
      },
    };
  }

  async uploadUrlAndAttachAgent(url: string, userId: string) {
    if (!url) throw new Error('URL is required');

    // Check if link already exists in DB for this user
    const existingLinkInDb = await this.linkRepository.findOne({ where: { url, userId } });
    if (existingLinkInDb && existingLinkInDb.documentId) {
      // It already exists in our DB, let's check if it's already in the agent too
      const existingAgent = await this.helper.getAgentConfig(this.defaultAgentId);
      const existingKnowledgeBase = existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];
      const isInAgent = existingKnowledgeBase.some((d: any) => d.id === existingLinkInDb.documentId);

      if (isInAgent) {
        return {
          success: true,
          message: 'Link already exists in database and agent',
          documentId: existingLinkInDb.documentId,
          skipped: true,
        };
      }
      // If in DB but not in agent (maybe deleted from agent but not DB), we can continue to attach it
    }

    let doc: any;
    let documentId: string;
    let documentName: string;

    try {
      // Upload URL using native ElevenLabs SDK
      doc = await this.elevenLabsClient.conversationalAi.knowledgeBase.documents.createFromUrl({
        url,
      });

      // The response might have different property names, handle both cases
      documentId = doc.document_id || doc.id || doc.documentId;
      documentName = doc.name || url;

      if (!documentId) {
        throw new Error('Failed to retrieve document ID from ElevenLabs response');
      }

      await this.attachUrlDocumentToAgent(documentId, documentName);
      await this.runPostUploadProcessingSafely(async () => {
        await this.logAndStoreOriginalUrl(url, documentId, documentName);
      }, `url:${documentId}`);

    } catch (error: any) {
      console.error('❌ Error uploading URL:', error);

      // Handle ElevenLabs API errors
      if (error.statusCode === 400 || error.status === 400) {
        const errorBody = typeof error.body === 'string'
          ? error.body
          : JSON.stringify(error.body || error.message || error);

        if (errorBody.includes('InvalidUrl') || errorBody.includes('not valid')) {
          throw new Error('The provided URL is not valid. Please check the URL and try again.');
        }

        throw new Error('Invalid request: ' + (error.message || 'Bad request'));
      }

      throw new Error('Failed to upload URL: ' + (error.message || String(error)));
    }

    try {
      const existingAgent = await this.helper.getAgentConfig(this.defaultAgentId);
      const existingKnowledgeBase = existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];
      const existingIds = new Set(existingKnowledgeBase.map((d: any) => d.id));

      // Save to database if not already there
      if (!existingLinkInDb) {
        const newLink = this.linkRepository.create({
          url,
          userId,
          documentId,
          // sitemapId: null - implicitly null for independent links
        });
        await this.linkRepository.save(newLink);
      } else if (!existingLinkInDb.documentId) {
        // Update documentId if it was missing
        existingLinkInDb.documentId = documentId;
        await this.linkRepository.save(existingLinkInDb);
      }

      return {
        success: true,
        message: 'URL uploaded, attached to agent, and saved to database successfully',
        documentId,
        name: documentName,
        originalUrl: url,
        agentUpdate: {
          totalDocumentsInAgent: existingKnowledgeBase.length + (existingIds.has(documentId) ? 0 : 1),
          newDocumentsAdded: existingIds.has(documentId) ? 0 : 1,
        },
      };

    } catch (error: any) {
      console.error('❌ Error attaching document to agent:', error);
      console.error('❌ Error details:', {
        message: error.message,
        status: error.status || error.statusCode,
        response: error.response?.data,
      });

      // If agent not found
      if (error.status === 404 || error.statusCode === 404 || error.response?.status === 404) {
        throw new Error(
          `Agent with ID '${this.defaultAgentId}' not found. Please verify ELEVENLABS_AGENT_ID is correct in your environment variables.`
        );
      }

      // If it's a message we already formatted, re-throw it
      if (error.message?.includes('not found') || error.message?.includes('not configured')) {
        throw error;
      }

      throw new Error('Failed to attach document to agent: ' + (error.message || String(error)));
    }
  }

  async uploadTextAndAttachAgent(text: string) {
    if (!text) throw new Error('Text is required');

    // Upload text using native ElevenLabs SDK
    const doc: any = await this.elevenLabsClient.conversationalAi.knowledgeBase.documents.createFromText({
      text,
    });

    // The response might have different property names, handle both cases
    const documentId = doc.document_id || doc.id || doc.documentId;
    const documentName = doc.name || 'Text Document';

    if (!documentId) {
      throw new Error('Failed to retrieve document ID from ElevenLabs response');
    }

    // Attach to agent
    const existingAgent = await this.helper.getAgentConfig(this.defaultAgentId);
    const existingKnowledgeBase = existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];
    const existingIds = new Set(existingKnowledgeBase.map((d: any) => d.id));

    if (existingIds.has(documentId)) {
      return {
        success: true,
        message: 'Document already exists in agent',
        documentId,
        skipped: true,
      };
    }

    const combinedKnowledgeBase = [
      ...existingKnowledgeBase,
      { type: 'text', id: documentId, name: documentName }
    ];

    const ragConfig = existingAgent?.conversation_config?.agent?.prompt?.rag || {
      enabled: true,
      embedding_model: 'e5_mistral_7b_instruct',
      max_vector_distance: 0.6,
      max_documents_length: 50000,
      max_retrieved_rag_chunks_count: 20,
    };

    await this.helper.updateAgentKnowledgeBase(this.defaultAgentId, combinedKnowledgeBase, ragConfig);
    await this.mirrorAttachToChatbotAgent([{ type: 'text', id: documentId, name: documentName }]);
    // Compute RAG embeddings so the newly-attached doc is actually retrievable.
    await this.helper.computeRagIndex(
      documentId,
      ragConfig.embedding_model || 'e5_mistral_7b_instruct',
    );
    await this.saveKnowledgeBaseSource({
      documentId,
      sourceType: 'text',
      s3Key: null,
      originalUrl: null,
    });

    return {
      success: true,
      message: 'Text uploaded and attached to agent successfully',
      documentId,
      name: documentName,
      textLength: text.length,
      agentUpdate: {
        totalDocumentsInAgent: combinedKnowledgeBase.length,
        newDocumentsAdded: 1,
      },
    };
  }

  async updateDocument(documentId: string, name: string) {
    if (!documentId) throw new Error('Document ID is required');
    if (!name) throw new Error('Document name is required');

    try {
      // Update document using ElevenLabs SDK
      await this.elevenLabsClient.conversationalAi.knowledgeBase.documents.update(documentId, {
        name,
      });

      // Update the document name in the agent's knowledge base
      const existingAgent = await this.helper.getAgentConfig(this.defaultAgentId);
      const existingKnowledgeBase = existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];

      // Find and update the document in the knowledge base
      const updatedKnowledgeBase = existingKnowledgeBase.map((d: any) => {
        if (d.id === documentId) {
          return { ...d, name };
        }
        return d;
      });

      // Check if document exists in agent
      const documentExists = existingKnowledgeBase.some((d: any) => d.id === documentId);

      if (documentExists) {
        const ragConfig = existingAgent?.conversation_config?.agent?.prompt?.rag || {};
        await this.helper.updateAgentKnowledgeBase(this.defaultAgentId, updatedKnowledgeBase, ragConfig);
      }

      // Mirror the rename onto the chatbot agent (best-effort).
      if (this.chatbotAgentId) {
        try {
          const chatbotAgent = await this.helper.getAgentConfig(this.chatbotAgentId);
          const chatbotKnowledgeBase =
            chatbotAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];
          if (chatbotKnowledgeBase.some((d: any) => d.id === documentId)) {
            const renamedKnowledgeBase = chatbotKnowledgeBase.map((d: any) =>
              d.id === documentId ? { ...d, name } : d,
            );
            const chatbotRagConfig =
              chatbotAgent?.conversation_config?.agent?.prompt?.rag || {};
            await this.helper.updateAgentKnowledgeBase(this.chatbotAgentId, renamedKnowledgeBase, chatbotRagConfig);
          }
        } catch (error: any) {
          this.logger.warn(
            `Failed to mirror document rename to chatbot agent ${this.chatbotAgentId}: ${error?.message || error}`,
          );
        }
      }

      return {
        success: true,
        message: 'Document updated successfully',
        documentId,
        newName: name,
        updatedInAgent: documentExists,
      };
    } catch (error: any) {
      // Handle specific error cases
      if (error.statusCode === 404 || error.status === 404) {
        throw new Error('Document not found. Please check the document ID.');
      }

      if (error.statusCode === 400 || error.status === 400) {
        throw new Error('Invalid request. Please check the document name.');
      }

      throw new Error('Failed to update document: ' + (error.message || String(error)));
    }
  }

  async removeDocumentFromAgent(agentId: string, documentId: string, deleteFromKnowledgeBase = false) {
    if (!agentId) throw new Error('Agent ID required');
    if (!documentId) throw new Error('Document ID required');

    const existingAgent = await this.helper.getAgentConfig(agentId);
    const existingKnowledgeBase = existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];

    const documentExists = existingKnowledgeBase.some((d: any) => d.id === documentId);
    const filteredKnowledgeBase = existingKnowledgeBase.filter((d: any) => d.id !== documentId);
    const ragConfig = existingAgent?.conversation_config?.agent?.prompt?.rag || {};

    if (documentExists) {
      await this.helper.updateAgentKnowledgeBase(agentId, filteredKnowledgeBase, ragConfig);
    }

    if (deleteFromKnowledgeBase) {
      try {
        await this.helper.deleteDocumentFromKnowledgeBase(documentId);
      } catch (error: any) {
        this.logger.warn(`Failed to delete knowledge base document ${documentId}: ${error?.message || error}`);
      }
    }

    return {
      success: true,
      message: deleteFromKnowledgeBase
        ? 'Document removed from agent and deleted from knowledge base successfully'
        : 'Document removed from agent successfully',
      removedDocumentId: documentId,
      remainingDocuments: filteredKnowledgeBase.length,
      deletedFromKnowledgeBase: deleteFromKnowledgeBase,
    };
  }

  async removeDocumentAndDeleteFromKnowledgeBase(documentId: string) {
    try {
      const res = await this.removeDocumentFromAgent(this.defaultAgentId, documentId, false);
      // Mirror the detach onto the chatbot agent before the document is deleted
      // from the shared knowledge base pool further below.
      await this.mirrorDetachFromChatbotAgent(documentId);
      try {
        const storedSource = await this.knowledgeBaseSourceRepository.findOne({ where: { documentId } });
        if (storedSource?.s3Key) {
          try {
            await this.s3Service.deleteFile(storedSource.s3Key);
          } catch (s3Error: any) {
            this.logger.warn(`Failed to delete S3 source ${storedSource.s3Key} for knowledge base document ${documentId}: ${s3Error.message}`);
          }
        }
        try {
          await this.helper.deleteDocumentFromKnowledgeBase(documentId);
        } catch (kbError: any) {
          this.logger.warn(`Failed to delete knowledge base document ${documentId}: ${kbError?.message || kbError}`);
        }
        await this.knowledgeBaseSourceRepository.delete({ documentId });

        // Also delete from Link database table if it exists
        await this.linkRepository.delete({ documentId });

        // Also delete the Document table row(s) that reference this knowledge base documentId
        await this.documentRepository.delete({ documentId });

      } catch (err: any) {
        return {
          success: true,
          message: 'Document removed from agent, but failed to delete from knowledge base',
          removedDocumentId: documentId,
          remainingDocuments: res.remainingDocuments,
          agentUpdateSuccess: true,
          knowledgeBaseDeletionSuccess: false,
          knowledgeBaseDeletionError: err?.message || String(err),
        };
      }
      return {
        success: true,
        message: 'Document removed from agent, deleted from knowledge base and database successfully',
        removedDocumentId: documentId,
        remainingDocuments: res.remainingDocuments,
        agentUpdateSuccess: true,
        knowledgeBaseDeletionSuccess: true,
      };
    } catch (err: any) {
      throw new Error(err.message || String(err));
    }
  }

  async deleteDocument(documentId: string, agentIds?: string[]) {
    if (!documentId) throw new Error('Document ID required');

    const results: Array<{ agentId: string; success: boolean; remainingDocuments?: number; error?: string }> = [];

    if (Array.isArray(agentIds) && agentIds.length > 0) {
      for (const agentId of agentIds) {
        try {
          const result = await this.removeDocumentFromAgent(agentId, documentId, false);
          results.push({ agentId, success: true, remainingDocuments: result.remainingDocuments });
        } catch (error: any) {
          results.push({ agentId, success: false, error: error.message });
        }
      }
    }

    await this.helper.deleteDocumentFromKnowledgeBase(documentId);

    return {
      success: true,
      message: 'Document deleted successfully',
      deletedDocumentId: documentId,
      agentUpdates: results,
      deletedFromKnowledgeBase: true,
    };
  }

  async getAllDocuments(userId: string) {
    // 1. Fetch Sitemaps (only fully uploaded ones, not pending/incomplete)
    const sitemaps = await this.sitemapRepository.find({
      where: { userId, syncStatus: 'success' },
      order: { createdAt: 'DESC' }
    });

    const sitemapItems = sitemaps.map(s => ({
      id: s.id,
      url: s.url,
      type: 'sitemap',
      name: s.url, // Use key 'name' for UI consistency
      documentId: s.id, // Frontend often uses documentId as key
      createdAt: s.createdAt,
      childCount: s.documentIds?.length || 0
    }));

    // 2. Fetch Independent Links (sitemapId is NULL)
    const independentLinks = await this.linkRepository.find({
      where: { userId, sitemapId: IsNull() },
      order: { createdAt: 'DESC' }
    });

    const linkItems = independentLinks.map(l => ({
      id: l.id, // Database UUID
      url: l.url,
      type: 'link',
      name: l.url,
      documentId: l.documentId, // ElevenLabs ID stored in DB
      createdAt: l.createdAt,
    }));

    return {
      success: true,
      documents: [...sitemapItems, ...linkItems],
      totalDocuments: sitemapItems.length + linkItems.length,
    };
  }

  async getSitemapLinks(sitemapId: string) {
    if (!sitemapId) throw new Error('Sitemap ID is required');

    const links = await this.linkRepository.find({
      where: { sitemapId },
      order: { createdAt: 'DESC' }
    });

    return {
      success: true,
      sitemapId,
      links: links.map(l => ({
        id: l.id,
        url: l.url,
        documentId: l.documentId,
        createdAt: l.createdAt
      }))
    };
  }

  async getDocumentContent(documentId: string) {
    if (!documentId) throw new Error('Document ID is required');
    return this.helper.getDocumentContent(documentId);
  }

  private async attachUrlDocumentToAgent(documentId: string, documentName: string): Promise<void> {
    if (!this.defaultAgentId) {
      throw new Error('Default agent ID is not configured. Please set ELEVENLABS_AGENT_ID in environment variables.');
    }

    const existingAgent = await this.helper.getAgentConfig(this.defaultAgentId);

    if (!existingAgent) {
      throw new Error(`Agent with ID ${this.defaultAgentId} not found. Please verify the agent ID is correct.`);
    }

    const existingKnowledgeBase = existingAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];
    const existingIds = new Set(existingKnowledgeBase.map((d: any) => d.id));

    if (existingIds.has(documentId)) {
      return;
    }

    const combinedKnowledgeBase = [
      ...existingKnowledgeBase,
      { type: 'url', id: documentId, name: documentName }
    ];

    const ragConfig = existingAgent?.conversation_config?.agent?.prompt?.rag || {
      enabled: true,
      embedding_model: 'e5_mistral_7b_instruct',
      max_vector_distance: 0.6,
      max_documents_length: 50000,
      max_retrieved_rag_chunks_count: 20,
    };

    await this.helper.updateAgentKnowledgeBase(this.defaultAgentId, combinedKnowledgeBase, ragConfig);
    await this.mirrorAttachToChatbotAgent([{ type: 'url', id: documentId, name: documentName }]);
    // Compute RAG embeddings so the newly-attached doc is actually retrievable.
    await this.helper.computeRagIndex(
      documentId,
      ragConfig.embedding_model || 'e5_mistral_7b_instruct',
    );
  }

  private async runPostUploadProcessingSafely(
    operation: () => Promise<void>,
    context: string,
  ): Promise<void> {
    try {
      await operation();
    } catch (error: any) {
      this.logger.warn(`[KB_POST_UPLOAD_WARNING] context=${context} error=${error?.message || String(error)}`);
    }
  }

  async searchAndEmailKnowledgeBaseResult(query: string, email: string, userName: string) {
    if (!query?.trim()) {
      throw new Error('Query is required');
    }

    if (!email?.trim()) {
      throw new Error('Email is required');
    }

    if (!userName?.trim()) {
      throw new Error('user_name is required');
    }

    const searchResponse = await this.helper.searchInternalKnowledgeBase(query.trim());
    const topResult = searchResponse?.results?.[0];

    if (!topResult) {
      throw new Error(`No search results found for query "${query}"`);
    }

    const matchedFileName = topResult?.metadata?.file_name;
    const matchedSummary = searchResponse?.ai_summary;

    if (!matchedFileName) {
      throw new Error('Search result does not include metadata.file_name');
    }

    if (!matchedSummary) {
      throw new Error('Search result does not include ai_summary');
    }

    const matchedDocumentId = this.extractDocumentIdFromMatchedFileName(matchedFileName);
    const storedSource = matchedDocumentId
      ? await this.knowledgeBaseSourceRepository.findOne({ where: { documentId: matchedDocumentId } })
      : null;
    const s3Key = storedSource?.s3Key || await this.s3Service.findOriginalSourceByFileName(matchedFileName);

    if (!s3Key) {
      throw new Error(`No source file found in S3 for "${matchedFileName}"`);
    }

    const originalUrl = storedSource?.sourceType === 'url' ? storedSource.originalUrl || null : null;
    const referenceUrl = originalUrl ? originalUrl : await this.s3Service.getPresignedUrl(s3Key);
    const maxAttachmentBytes = 10 * 1024 * 1024;
    const objectMetadata = !originalUrl ? await this.s3Service.getObjectMetadata(s3Key) : null;
    const shouldAttachFile = !originalUrl && !!objectMetadata?.contentLength && objectMetadata.contentLength < maxAttachmentBytes;
    const objectContent = shouldAttachFile ? await this.s3Service.getObjectContent(s3Key) : null;

    const emailResult = await this.emailService.sendKnowledgeBaseSearchEmail({
      to: email.trim(),
      userName: userName.trim(),
      query: query.trim(),
      matchedFileName,
      matchedDocument: matchedSummary,
      originalUrl,
      referenceUrl,
      attachment: originalUrl || !shouldAttachFile
        ? null
        : {
            fileName: matchedFileName,
            content: objectContent!.body,
            contentType: objectContent!.contentType || objectMetadata?.contentType || 'application/octet-stream',
          },
    });

    if (!emailResult.success) {
      throw new Error(emailResult.error || 'Failed to send search result email');
    }

    this.logger.log(
      `[KB_SEARCH_EMAIL] query="${query.trim()}" fileName="${matchedFileName}" s3Key="${s3Key}" email="${email.trim()}" originalUrl=${originalUrl || 'NA'} referenceUrl=${referenceUrl} attachmentIncluded=${shouldAttachFile}`,
    );

    const result = {
      success: true,
      query: query.trim(),
      email: email.trim(),
      userName: userName.trim(),
      matchedFileName,
      matchedS3Key: s3Key,
      originalUrl: originalUrl || null,
      referenceUrl,
      attachmentIncluded: shouldAttachFile,
      totalResults: searchResponse?.total_results ?? null,
      messageId: emailResult.messageId,
      message: originalUrl
        ? 'Search result and original URL emailed successfully'
        : 'Search result and source file emailed successfully',
    };

    this.auditFileLogger.logApiSearchEmail({
      action: 'API_CALL',
      request: { query: query.trim(), email: email.trim(), userName: userName.trim() },
      response: result,
    });

    return result;
  }

  private async logAndStoreOriginalFile(file: Express.Multer.File, documentId: string, uploadedName?: string): Promise<void> {
    const fetchedContent = await this.helper.getDocumentDetails(documentId);
    this.logFetchedDocumentContent(documentId, fetchedContent);
    await this.helper.uploadDocumentDetailsToInternalApi({
      documentId,
      filename: fetchedContent.filename || file.originalname,
      name: fetchedContent.name || uploadedName || file.originalname,
      extractedInnerHtml: fetchedContent.extractedInnerHtml,
    });

    const targetFileName = this.buildStorageFileName(
      fetchedContent.name || uploadedName || file.originalname,
      documentId,
      this.getExtension(file.originalname),
    );

    const s3Result = await this.s3Service.uploadFileWithCustomName(file, targetFileName);
    await this.saveKnowledgeBaseSource({
      documentId,
      sourceType: 'file',
      s3Key: s3Result.fileUrl,
      originalUrl: null,
    });
    this.logger.log(`[KB_S3] Stored original file for documentId=${documentId} at key=${s3Result.fileUrl}`);
  }

  private async logAndStoreOriginalUrl(url: string, documentId: string, uploadedName?: string): Promise<void> {
    const fetchedContent = await this.helper.getDocumentDetails(documentId);
    this.logFetchedDocumentContent(documentId, fetchedContent);
    await this.helper.uploadDocumentDetailsToInternalApi({
      documentId,
      filename: fetchedContent.filename || null,
      name: fetchedContent.name || uploadedName || 'knowledge-base-url',
      extractedInnerHtml: fetchedContent.extractedInnerHtml,
    });

    const targetFileName = this.buildStorageFileName(
      fetchedContent.name || uploadedName || 'knowledge-base-url',
      documentId,
      '.txt',
    );

    const s3Result = await this.s3Service.uploadTextContent(url, targetFileName);
    await this.saveKnowledgeBaseSource({
      documentId,
      sourceType: 'url',
      s3Key: s3Result.fileUrl,
      originalUrl: url,
    });
    this.logger.log(`[KB_S3] Stored original URL for documentId=${documentId} at key=${s3Result.fileUrl}`);
  }

  private logFetchedDocumentContent(
    documentId: string,
    fetchedContent: { name?: string | null; url?: string | null; extractedInnerHtml?: string | null },
  ): void {
    this.logger.log(
      `[KB_CONTENT] documentId=${documentId} name=${fetchedContent.name || 'NA'} url=${fetchedContent.url || 'NA'} extracted_inner_html_length=${fetchedContent.extractedInnerHtml?.length || 0}`,
    );
  }

  private buildStorageFileName(name: string, documentId: string, fallbackExtension: string = ''): string {
    const sanitizedBaseName = this.sanitizeBaseName(name);
    const hasExtension = /\.[a-z0-9]+$/i.test(sanitizedBaseName);
    const extension = hasExtension ? '' : fallbackExtension;
    return `${sanitizedBaseName}__${documentId}${extension}`;
  }

  private sanitizeBaseName(value: string): string {
    return value
      .replace(/[\/\\]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getExtension(fileName: string): string {
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex >= 0 ? fileName.slice(dotIndex) : '';
  }

  private extractUrlIfPresent(buffer: Buffer, contentType?: string): string | null {
    const isTextContent = (contentType || '').includes('text/plain');
    if (!isTextContent) {
      return null;
    }

    const value = buffer.toString('utf-8').trim();
    try {
      const parsedUrl = new URL(value);
      return parsedUrl.toString();
    } catch {
      return null;
    }
  }

  private async saveKnowledgeBaseSource(input: {
    documentId: string;
    sourceType: 'file' | 'url' | 'text';
    s3Key: string | null;
    originalUrl: string | null;
  }): Promise<void> {
    const existingSource = await this.knowledgeBaseSourceRepository.findOne({
      where: { documentId: input.documentId },
    });

    const sourceRecord = this.knowledgeBaseSourceRepository.create({
      ...existingSource,
      documentId: input.documentId,
      sourceType: input.sourceType,
      s3Key: input.s3Key,
      originalUrl: input.originalUrl,
    });

    await this.knowledgeBaseSourceRepository.save(sourceRecord);
  }

  private extractDocumentIdFromMatchedFileName(fileName: string): string | null {
    const trimmedFileName = fileName.trim();
    const separatorIndex = trimmedFileName.lastIndexOf('__');
    if (separatorIndex === -1) {
      return null;
    }

    const documentIdWithMaybeExtension = trimmedFileName.slice(separatorIndex + 2);
    const extensionIndex = documentIdWithMaybeExtension.lastIndexOf('.');

    return (extensionIndex > 0
      ? documentIdWithMaybeExtension.slice(0, extensionIndex)
      : documentIdWithMaybeExtension).trim() || null;
  }
}