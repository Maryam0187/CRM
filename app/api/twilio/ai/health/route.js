import { NextResponse } from 'next/server';
import { getWebhookUrl } from '../../../../../lib/twilio';
import {
  getOpenAiRealtimeConfig,
  getAiMediaStreamWsUrl
} from '../../../../../lib/aiRealtimeConfig';
import { isAiCallingEnabled } from '../../../../../lib/aiCalling';

export async function GET() {
  const { model, isGa, url } = getOpenAiRealtimeConfig();
  const streamUrl = getAiMediaStreamWsUrl(getWebhookUrl);
  let streamHost = '';
  try {
    streamHost = new URL(streamUrl).host;
  } catch {
    streamHost = 'invalid-url';
  }

  return NextResponse.json({
    success: true,
    data: {
      aiCallingEnabled: isAiCallingEnabled(),
      hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
      openAiRealtime: { model, mode: isGa ? 'ga' : 'beta', connectUrlHost: 'api.openai.com' },
      mediaStream: {
        path: '/ws/ai-media-stream',
        host: streamHost,
        usesExplicitEnv: Boolean(process.env.AI_MEDIA_STREAM_WS_URL)
      },
      webhookBaseHost: (() => {
        try {
          return new URL(getWebhookUrl('/')).host;
        } catch {
          return null;
        }
      })(),
      supervisedConferenceMode: process.env.AI_SUPERVISED_CONFERENCE_MODE === 'true',
      hints: [
        'Twilio 31921 = your server closed the media WebSocket — check Railway logs for [AI BRIDGE] OpenAI WS closed / handshake failed.',
        'Use OPENAI_REALTIME_GA=true and OPENAI_REALTIME_MODEL=gpt-realtime if preview/beta fails.',
        'Set AI_MEDIA_STREAM_WS_URL=wss://YOUR-RAILWAY-APP.up.railway.app/ws/ai-media-stream if custom domain blocks WebSockets.'
      ]
    }
  });
}
