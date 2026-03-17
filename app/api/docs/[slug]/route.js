import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

const ALLOWED_PDFS = [
  'SalesCRM_Agent_Supervisor_Guide.pdf',
  'SalesCRM_Admin_Guide.pdf',
];

/**
 * GET /api/docs/[slug] - Serve PDF for same-origin iframe (no redirect, correct headers).
 */
export async function GET(request, { params }) {
  const { slug } = await params;
  if (!slug || !ALLOWED_PDFS.includes(slug)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  try {
    const filePath = path.join(process.cwd(), 'public', 'docs', slug);
    const body = await readFile(filePath);

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(body.length),
        'X-Frame-Options': 'SAMEORIGIN',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    if (err.code === 'ENOENT') return new NextResponse('Not Found', { status: 404 });
    console.error('Docs PDF serve error:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
