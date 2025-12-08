import { NextResponse } from 'next/server';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import sequelizeDb from '../../../../lib/sequelize-db';
import crypto from 'crypto';

/**
 * GET /api/agents/sip-password
 * Get decrypted SIP password for the authenticated agent
 * Only returns password for the agent's own account
 */
export async function GET(request) {
  try {
    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const user = authResult.user;

    // Get agent with SIP password
    const agent = await sequelizeDb.User.findByPk(user.id, {
      attributes: ['id', 'extension', 'sipUsername', 'sipPassword', 'sipDomain']
    });

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    if (!agent.sipPassword) {
      return NextResponse.json(
        { error: 'SIP password not configured' },
        { status: 400 }
      );
    }

    // Decrypt SIP password
    let decryptedPassword = null;
    try {
      // Check if password is encrypted (format: iv:encrypted)
      if (agent.sipPassword.includes(':')) {
        const parts = agent.sipPassword.split(':');
        if (parts.length === 2) {
          const algorithm = 'aes-256-cbc';
          const encryptionKey = process.env.ENCRYPTION_KEY || 'default-key-32-chars-long!!';
          const iv = Buffer.from(parts[0], 'hex');
          const encrypted = parts[1];
          
          // Try new method first (SHA-256 hashed key - always 32 bytes)
          try {
            const key = crypto.createHash('sha256').update(encryptionKey).digest();
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            decryptedPassword = decrypted;
          } catch (newMethodError) {
            // If new method fails, try old method for backward compatibility
            try {
              const oldKey = Buffer.from(encryptionKey, 'utf8');
              // Pad or truncate to 32 bytes if needed
              const key = oldKey.length === 32 ? oldKey : 
                         oldKey.length < 32 ? Buffer.concat([oldKey, Buffer.alloc(32 - oldKey.length)]) :
                         oldKey.slice(0, 32);
              const decipher = crypto.createDecipheriv(algorithm, key, iv);
              let decrypted = decipher.update(encrypted, 'hex', 'utf8');
              decrypted += decipher.final('utf8');
              decryptedPassword = decrypted;
            } catch (oldMethodError) {
              console.error('Both decryption methods failed:', { newMethodError, oldMethodError });
              throw new Error('Failed to decrypt SIP password');
            }
          }
        } else {
          // Invalid format, return as-is
          decryptedPassword = agent.sipPassword;
        }
      } else {
        // Password is not encrypted, return as-is
        decryptedPassword = agent.sipPassword;
      }
    } catch (decryptError) {
      console.error('Error decrypting SIP password:', decryptError);
      return NextResponse.json(
        { error: 'Failed to decrypt SIP password' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        sipUsername: agent.sipUsername,
        sipDomain: agent.sipDomain,
        extension: agent.extension,
        password: decryptedPassword // Return decrypted password for SIP connection
      }
    });

  } catch (error) {
    console.error('Error getting SIP password:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

