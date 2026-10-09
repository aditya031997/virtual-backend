// src/helper/knowledgeBase.helper.ts
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import FormData from 'form-data';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { htmlToText } from 'html-to-text';

export class KnowledgeBaseHelper {
  private readonly baseUrl: string;
  private readonly internalUploadUrl: string;
  private readonly internalSearchUrl: string;

  constructor(private readonly headers: Record<string, string>) {
    this.baseUrl = process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io/v1/convai';
    const internalApiBaseUrl = this.buildInternalApiBaseUrl();
    this.internalUploadUrl = this.buildInternalEndpointUrl(internalApiBaseUrl, '/upload');
    this.internalSearchUrl = this.buildInternalEndpointUrl(internalApiBaseUrl, '/search');
  }

  private isFileNameTooLongError(error: any): boolean {
    if (!error) return false;

    const errorCode = error.code || error.errno || error.response?.data?.code || error.cause?.code;
    const errorMessage = String(error.message || error.toString() || '');

    return (
      errorCode === 'ENOENT' ||
      errorCode === 'ENAMETOOLONG' ||
      errorMessage.includes('ENOENT') ||
      errorMessage.includes('ENAMETOOLONG') ||
      errorMessage.includes('ENAMETOOLONG:') ||
      errorMessage.includes('name too long')
    );
  }

  async uploadFile(file: Express.Multer.File, elevenLabsClient: ElevenLabsClient): Promise<{ id: string; name: string; type: string }> {
    if (!file) throw new Error('Invalid file');
    const fileSize = (file as any).size ?? (file.buffer ? file.buffer.length : 0);
    if (fileSize > 20 * 1024 * 1024) throw new Error('File too large (max 20MB)');

    const allowedTypes = [
      'application/pdf',
      'application/epub+zip',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/html',
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error(`Unsupported file type: ${file.mimetype}`);
    }

    let tempPath: string | null = null;
    let streamPath: string;

    if ((file as any).path) {
      streamPath = (file as any).path;
    } else {
      try {
        tempPath = path.join(process.cwd(), 'temp', `${uuidv4()}_${file.originalname}`);
        fs.mkdirSync(path.dirname(tempPath), { recursive: true });
        fs.writeFileSync(tempPath, file.buffer as Buffer);
        streamPath = tempPath;
      } catch (error: any) {
        if (this.isFileNameTooLongError(error)) {
          throw new Error('File name too long');
        }
        throw error;
      }
    }

    try {
      // IMPORTANT: Using direct HTTP (axios) for file uploads instead of SDK
      // The SDK's createFromFile() method has a known issue where it doesn't properly
      // set the Content-Type header and filename in multipart form-data, causing
      // ElevenLabs API to reject files with "invalid_file_type" error.
      // 
      // This is a limitation of the SDK, not our code. Direct HTTP with FormData
      // properly sets all required headers and works correctly.
      // 
      // SDK is successfully used for: URL uploads, text uploads, agent operations, etc.
      const formData = new FormData();
      formData.append('file', fs.createReadStream(streamPath), {
        filename: file.originalname,
        contentType: file.mimetype,
      });
      formData.append('name', file.originalname.split('.')[0]);

      const { data } = await axios.post(
        `${this.baseUrl}/knowledge-base/file`,
        formData,
        {
          headers: { ...this.headers, ...formData.getHeaders() },
          timeout: 0,
        }
      );

      return { id: data.id, name: data.name, type: 'file' };
    } catch (error: any) {
      if (this.isFileNameTooLongError(error) || this.isFileNameTooLongError(error.cause) || this.isFileNameTooLongError(error.response?.data)) {
        throw new Error('File name too long');
      }

      const status = error?.response?.status || error?.status || error?.statusCode;
      const responseData = error?.response?.data;
      const formattedResponseData = typeof responseData === 'string'
        ? responseData
        : responseData
          ? JSON.stringify(responseData)
          : '';
      const upstreamMessage = formattedResponseData || error?.message || String(error);

      console.error('ElevenLabs file upload failed:', {
        status,
        message: error?.message,
        responseData,
      });

      throw new Error(
        status
          ? `ElevenLabs file upload failed (${status}): ${upstreamMessage}`
          : `ElevenLabs file upload failed: ${upstreamMessage}`
      );
    } finally {
      if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }

  async uploadUrl(url: string, name?: string): Promise<{ id: string; name: string; type: string }> {
    if (!url) throw new Error('URL required');
    try {
      new URL(url);
    } catch {
      throw new Error('Invalid URL');
    }

    // URL crawling can take longer, use extended timeout (2 minutes)
    const { data } = await axios.post(
      `${this.baseUrl}/knowledge-base/url`,
      { url, name: name || `URL_${Date.now()}` },
      { headers: { ...this.headers, 'Content-Type': 'application/json' }, timeout: 0 }
    );

    return { id: data.id, name: data.name, type: 'url' };
  }

  async uploadText(text: string, name?: string): Promise<{ id: string; name: string; type: string }> {
    if (!text?.trim()) throw new Error('Text required');

    const { data } = await axios.post(
      `${this.baseUrl}/knowledge-base/text`,
      { text, name: name || `Text_${Date.now()}` },
      { headers: { ...this.headers, 'Content-Type': 'application/json' }, timeout: 0 }
    );

    return { id: data.id, name: data.name, type: 'text' };
  }

  async getAgentConfig(agentId: string) {
    // URL encode the agentId to handle special characters like '?'
    const encodedAgentId = encodeURIComponent(agentId);
    const { data } = await axios.get(
      `${this.baseUrl}/agents/${encodedAgentId}`,
      { headers: this.headers, timeout: 0 }
    );
    return data;
  }

  async updateAgentKnowledgeBase(agentId: string, knowledgeBaseDocuments: any[], ragConfig: any) {
    try {
      const encodedAgentId = encodeURIComponent(agentId);

      // Build the correct structure with 'agent' level
      const updatePayload = {
        conversation_config: {
          agent: {
            prompt: {
              knowledge_base: knowledgeBaseDocuments,
              rag: ragConfig,
            },
          },
        },
      };

      // Send the update
      const response = await axios.patch(
        `${this.baseUrl}/agents/${encodedAgentId}`,
        updatePayload,
        {
          headers: { ...this.headers, 'Content-Type': 'application/json' },
          timeout: 0
        }
      );


      return knowledgeBaseDocuments.length;
    } catch (error: any) {
      console.error('Error updating agent:', error.message);
      if (error.response) {
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      throw new Error(`Failed to update agent knowledge base: ${error.message} - ${JSON.stringify(error.response?.data || {})}`);
    }
  }

  /**
   * Trigger (and, when attached with usage_mode "auto", REQUIRED) RAG indexing
   * for a knowledge-base document. Attaching a document to the agent does NOT
   * make it retrievable — the agent only answers from a document once its RAG
   * embeddings are computed. Without this, newly-uploaded documents are silently
   * invisible to the agent. Idempotent: ElevenLabs returns the existing index if
   * one already exists. `embeddingModel` must match the agent's rag config.
   */
  async computeRagIndex(
    documentId: string,
    embeddingModel = 'e5_mistral_7b_instruct',
  ): Promise<{ id?: string; status?: string } | null> {
    if (!documentId) return null;
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/knowledge-base/${documentId}/rag-index`,
        { model: embeddingModel },
        { headers: { ...this.headers, 'Content-Type': 'application/json' }, timeout: 0 },
      );
      return { id: data?.id, status: data?.status };
    } catch (error: any) {
      // Don't fail the whole upload if indexing can't be kicked off; log loudly
      // so it can be retried. The document is still attached.
      console.error(
        `[RAG_INDEX] failed to trigger indexing for document ${documentId}: ${error?.response?.status || ''} ${error?.message || error}`,
      );
      return null;
    }
  }

  async getAllDocuments() {
    const { data } = await axios.get(`${this.baseUrl}/knowledge-base`, {
      headers: this.headers,
      timeout: 0,
    });
    return data;
  }

  async deleteDocumentFromKnowledgeBase(documentId: string) {
    await axios.delete(`${this.baseUrl}/knowledge-base/${documentId}`, {
      headers: this.headers,
      timeout: 0,
    });
    return true;
  }

  async getDocumentContent(documentId: string) {
    if (!documentId) throw new Error('Document ID is required');

    try {
      // Use the headers this helper was constructed with, exactly like every
      // other method here. Reading process.env directly meant this one call
      // could authenticate with a different key than the rest of the class —
      // and after a key rotation, with a stale one.
      const headers: Record<string, string> = { ...this.headers };

      if (!headers['xi-api-key']) {
        throw new Error('ElevenLabs API key not configured');
      }

      const url = `${this.baseUrl}/knowledge-base/${documentId}/content`;
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        if (response.status === 404) {
          // A 404 here has two very different causes, and reporting only the
          // first sends whoever is debugging after the wrong one:
          //   - the document really is gone, or
          //   - ELEVENLABS_BASE_URL is missing the '/convai' segment, so every
          //     document 404s. Name the URL so the second is obvious.
          if (!this.baseUrl.includes('/convai')) {
            throw new Error(
              `Knowledge-base request 404'd against ${url}. ELEVENLABS_BASE_URL is "${this.baseUrl}" — it must end in /v1/convai.`,
            );
          }
          throw new Error('Document not found. Please check the document ID.');
        }
        if (response.status === 400) {
          throw new Error('Invalid document ID format.');
        }
        if (response.status === 401) {
          // Include what upstream actually said and which key was used (last 4
          // characters only). "Check your API key" on its own sent us chasing
          // a key that turned out to be valid.
          const body = await response.text();
          const used = headers['xi-api-key'] ?? '';
          throw new Error(
            `Authentication failed against ${url} using key ...${used.slice(-4)}: ${body.slice(0, 200)}`,
          );
        }

        const errorText = await response.text();
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }

      const rawContent = await response.text();
      let parsedContent: any = rawContent;

      try {
        parsedContent = JSON.parse(rawContent);
      } catch {
        parsedContent = rawContent;
      }

      const normalizedPayload =
        parsedContent && typeof parsedContent === 'object'
          ? (parsedContent.document || parsedContent.data || parsedContent)
          : null;

      const isHtmlString =
        typeof parsedContent === 'string' && parsedContent.trim().startsWith('<');
      const extractedInnerHtml =
        normalizedPayload?.extracted_inner_html ||
        normalizedPayload?.extractedInnerHtml ||
        (isHtmlString ? parsedContent : null);
      const detectedTitle = isHtmlString
        ? this.extractFirstHeading(parsedContent)
        : null;
      const detectedContainerName = isHtmlString
        ? this.extractHtmlAttribute(parsedContent, 'data-name')
        : null;

      console.log('[KB_CONTENT_PARSED]', {
        documentId,
        responseType: isHtmlString ? 'html-string' : typeof parsedContent,
        name: normalizedPayload?.name || null,
        url: normalizedPayload?.url || null,
        extracted_inner_html: extractedInnerHtml,
        detectedTitle,
        detectedContainerName,
        payload: parsedContent,
      });

      return {
        success: true,
        documentId,
        content: parsedContent,
        name: normalizedPayload?.name || null,
        url: normalizedPayload?.url || null,
        extractedInnerHtml,
      };
    } catch (error: any) {
      if (error?.message?.includes('not found') ||
        error?.message?.includes('Invalid') ||
        error?.message?.includes('Authentication')) {
        throw error;
      }

      throw new Error('Failed to fetch document content: ' + error?.message);
    }
  }

  async getDocumentDetails(documentId: string) {
    if (!documentId) throw new Error('Document ID is required');

    try {
      const { data } = await axios.get(`${this.baseUrl}/knowledge-base/${documentId}`, {
        headers: this.headers,
        timeout: 0,
      });

      const normalizedPayload =
        data && typeof data === 'object'
          ? (data.document || data.data || data)
          : null;

      console.log('[KB_DOCUMENT_DETAILS]', {
        documentId,
        payload: normalizedPayload,
      });

      return {
        success: true,
        documentId,
        content: normalizedPayload,
        id: normalizedPayload?.id || documentId,
        name: normalizedPayload?.name || normalizedPayload?.filename || null,
        filename: normalizedPayload?.filename || null,
        url: normalizedPayload?.url || null,
        type: normalizedPayload?.type || null,
        extractedInnerHtml:
          normalizedPayload?.extracted_inner_html ||
          normalizedPayload?.extractedInnerHtml ||
          null,
      };
    } catch (error: any) {
      const status = error?.response?.status || error?.status || error?.statusCode;

      if (status === 404) {
        throw new Error('Document not found. Please check the document ID.');
      }

      if (status === 400) {
        throw new Error('Invalid document ID format.');
      }

      if (status === 401) {
        throw new Error('Authentication failed. Check your API key.');
      }

      throw new Error('Failed to fetch document details: ' + (error?.response?.data?.detail || error?.message));
    }
  }

  async uploadDocumentDetailsToInternalApi(documentDetails: {
    documentId?: string;
    filename?: string | null;
    name?: string | null;
    extractedInnerHtml?: string | null;
  }) {
    const fileName = this.buildInternalUploadFileName(documentDetails);
    const content = this.convertHtmlToPlainText(documentDetails.extractedInnerHtml);

    if (!content.trim()) {
      throw new Error(`No extracted content available for internal upload${documentDetails.documentId ? ` (${documentDetails.documentId})` : ''}`);
    }

    const payload = {
      file_name: fileName,
      content,
    };

    console.log('[KB_INTERNAL_UPLOAD_REQUEST]', {
      documentId: documentDetails.documentId || null,
      endpoint: this.internalUploadUrl,
      file_name: payload.file_name,
      content_length: payload.content.length,
    });

    try {
      const { data } = await axios.post(this.internalUploadUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 0,
      });

      console.log('[KB_INTERNAL_UPLOAD_RESPONSE]', {
        documentId: documentDetails.documentId || null,
        file_name: payload.file_name,
        response: data,
      });

      return {
        success: true,
        fileName: payload.file_name,
        content,
        response: data,
      };
    } catch (error: any) {
      const status = error?.response?.status || error?.status || error?.statusCode;
      const responseData = error?.response?.data;
      console.error('[KB_INTERNAL_UPLOAD_ERROR]', {
        documentId: documentDetails.documentId || null,
        file_name: payload.file_name,
        status,
        response: responseData,
        message: error?.message,
      });

      throw new Error(
        status
          ? `Internal upload failed (${status}): ${typeof responseData === 'string' ? responseData : JSON.stringify(responseData || {})}`
          : `Internal upload failed: ${error?.message || 'Unknown error'}`
      );
    }
  }

  async searchInternalKnowledgeBase(query: string) {
    const payload = { query };

    try {
      const { data } = await axios.post(this.internalSearchUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 0,
      });

      return data;
    } catch (error: any) {
      const status = error?.response?.status || error?.status || error?.statusCode;
      const responseData = error?.response?.data;
      console.error('[KB_INTERNAL_SEARCH_ERROR]', {
        status,
        response: responseData,
        message: error?.message,
      });

      throw new Error(
        status
          ? `Internal search failed (${status}): ${typeof responseData === 'string' ? responseData : JSON.stringify(responseData || {})}`
          : `Internal search failed: ${error?.message || 'Unknown error'}`
      );
    }
  }

  private extractFirstHeading(content: string): string | null {
    const match = content.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/i);
    if (!match?.[1]) {
      return null;
    }

    return this.stripHtml(match[1]);
  }

  private extractHtmlAttribute(content: string, attributeName: string): string | null {
    const escapedAttributeName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(new RegExp(`${escapedAttributeName}="([^"]+)"`, 'i'));
    return match?.[1] || null;
  }

  private stripHtml(content: string): string {
    return content
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildInternalUploadFileName(documentDetails: {
    documentId?: string;
    filename?: string | null;
    name?: string | null;
  }): string {
    const trimmedDocumentId = documentDetails.documentId?.trim();
    const trimmedFilename = documentDetails.filename?.trim();
    const trimmedName = documentDetails.name?.trim();

    if (!trimmedDocumentId) {
      return trimmedFilename || `${trimmedName || 'knowledge-base-document'}.txt`;
    }

    const extensionIndex = trimmedFilename ? trimmedFilename.lastIndexOf('.') : -1;
    const extension = extensionIndex > 0 ? trimmedFilename!.slice(extensionIndex) : '.txt';
    const fallbackBaseName =
      (trimmedFilename && extensionIndex > 0 ? trimmedFilename.slice(0, extensionIndex) : trimmedFilename) ||
      trimmedName ||
      'knowledge-base-document';
    const baseName = (trimmedName || fallbackBaseName)
      .replace(/[\/\\]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();

    return `${baseName}__${trimmedDocumentId}${extension}`;
  }

  private convertHtmlToPlainText(html?: string | null): string {
    if (!html?.trim()) {
      return '';
    }

    return htmlToText(html, {
      wordwrap: false,
      preserveNewlines: true,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
      ],
    }).trim();
  }

  private buildInternalApiBaseUrl(): string {
    const configuredUrl =
      process.env['AI-API'] ||
      process.env.AI_API ||
      process.env.INTERNAL_CONTENT_UPLOAD_URL ||
      'https://stg-ai-api.smartcaller.com.au';
    const normalizedUrl = configuredUrl.replace(/\/+$/, '');
    return normalizedUrl.endsWith('/upload')
      ? normalizedUrl.slice(0, -'/upload'.length)
      : normalizedUrl;
  }

  private buildInternalEndpointUrl(baseUrl: string, endpointPath: string): string {
    const normalizedEndpointPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;

    return baseUrl.endsWith(normalizedEndpointPath)
      ? baseUrl
      : `${baseUrl}${normalizedEndpointPath}`;
  }
}