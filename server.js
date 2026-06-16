const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const socketManager = require('./lib/socket');
const { initializeAiMediaBridge } = require('./lib/aiMediaBridge');
const { initializeAiMonitorStream } = require('./lib/aiMonitorStream');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT, 10) || 3000;

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  // Create HTTP server
  // Trust proxy - this allows the server to correctly identify client IPs
  // when behind a proxy/load balancer (Docker, nginx, etc.)
  const server = createServer((req, res) => {
    // Ensure proxy headers are preserved for IP extraction
    // Next.js API routes will read these headers via request.headers
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });
  
  // Note: For proper proxy trust in production, ensure your reverse proxy
  // (nginx, Docker, etc.) sets these headers:
  // - X-Forwarded-For: Original client IP
  // - X-Real-IP: Real client IP (nginx)
  // - CF-Connecting-IP: Cloudflare client IP

  // Initialize Socket.IO
  const io = socketManager.initialize(server);
  initializeAiMediaBridge(server);
  initializeAiMonitorStream(server);

  // Start server
  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`🚀 Server ready on http://${hostname}:${port}`);
    console.log(`🔌 Socket.IO server ready`);
  });

  // Handle server shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
      console.log('Process terminated');
    });
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
      console.log('Process terminated');
    });
  });
});
