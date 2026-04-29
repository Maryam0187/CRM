import { NextResponse } from 'next/server';

export function isAiCallingEnabled() {
  return process.env.AI_CALLING_ENABLED === 'true';
}

export function ensureAiCallingEnabled() {
  if (isAiCallingEnabled()) return null;
  return NextResponse.json(
    {
      success: false,
      message: 'AI calling is disabled',
      code: 'AI_CALLING_DISABLED'
    },
    { status: 403 }
  );
}

export function getAiAgentVersion() {
  return process.env.AI_AGENT_VERSION || 'v1';
}

