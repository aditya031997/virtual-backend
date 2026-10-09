import * as crypto from 'crypto';

/**
 * Service for encrypting and decrypting sensitive tokens
 * Uses AES-256-GCM encryption
 */
export class TokenEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly saltLength = 64;
  private readonly tagLength = 16;
  private readonly iterations = 100000;

  /**
   * Get encryption key from environment variable or generate from JWT_SECRET
   */
  private getEncryptionKey(): Buffer {
    const encryptionKey = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;
    
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY or JWT_SECRET must be set for token encryption');
    }

    // Derive a consistent key from the secret
    return crypto.pbkdf2Sync(encryptionKey, 'hubspot-token-salt', this.iterations, this.keyLength, 'sha512');
  }

  /**
   * Encrypt a token
   */
  encrypt(token: string): string {
    try {
      const key = this.getEncryptionKey();
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);

      let encrypted = cipher.update(token, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag();

      // Combine iv + tag + encrypted data
      const combined = iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;

      return combined;
    } catch (error) {
      throw new Error(`Failed to encrypt token: ${error.message}`);
    }
  }

  /**
   * Decrypt a token
   */
  decrypt(encryptedToken: string): string {
    try {
      const key = this.getEncryptionKey();
      const parts = encryptedToken.split(':');

      if (parts.length !== 3) {
        throw new Error('Invalid encrypted token format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const tag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Failed to decrypt token: ${error.message}`);
    }
  }
}

