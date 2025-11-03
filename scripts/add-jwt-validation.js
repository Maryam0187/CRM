#!/usr/bin/env node

/**
 * Script to add JWT validation to all unprotected API routes
 * This ensures every protected route validates JWT tokens on every request
 */

const fs = require('fs');
const path = require('path');

// Routes that should be protected (exclude public routes)
const protectedRoutes = [
  'app/api/dashboard/route.js',
  'app/api/customers/route.js',
  'app/api/customers/[id]/route.js',
  'app/api/customers/check-existing/route.js',
  'app/api/sales-logs/route.js',
  'app/api/sales-logs/stats/route.js',
  'app/api/payments/route.js',
  'app/api/calls/initiate/route.js',
  'app/api/calls/status/[callSid]/route.js',
  'app/api/calls/notes/route.js',
  'app/api/carriers/route.js',
  'app/api/carriers/[id]/route.js',
  'app/api/receivers/route.js',
  'app/api/receivers/[id]/route.js',
  'app/api/banks/route.js',
  'app/api/cards/route.js',
  'app/api/notifications/route.js',
  'app/api/supervisor-agents/route.js',
  'app/api/role-assignments/route.js'
];

// Routes that should remain public (no JWT validation needed)
const publicRoutes = [
  'app/api/auth/signin/route.js',
  'app/api/auth/refresh/route.js',
  'app/api/test-auth/route.js',
  'app/api/test-db/route.js',
  'app/api/test-sequelize/route.js',
  'app/api/test-voice/route.js',
  'app/api/test-recording/route.js',
  'app/api/deployment-info/route.js',
  'app/api/socket/health/route.js',
  'app/api/socket/route.js',
  'app/api/twilio/voice-response/route.js',
  'app/api/twilio/call-status-callback/route.js',
  'app/api/twilio/recording-callback/route.js'
];

// JWT validation template for GET requests
const jwtValidationTemplate = `    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

`;

// JWT validation template for NextResponse
const jwtValidationNextResponseTemplate = `    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

`;

// Import template
const importTemplate = `import { requireJWTAuth } from '../../../lib/jwtAuth.js';
`;

const importTemplateDeep = `import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
`;

function addJWTValidation(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${filePath}`);
      return;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if JWT validation is already present
    if (content.includes('requireJWTAuth') || content.includes('requireJWTAdmin')) {
      console.log(`✅ JWT validation already present: ${filePath}`);
      return;
    }

    // Determine import path based on file depth
    const depth = filePath.split('/').length - 3; // Count ../ needed
    const importStatement = depth > 2 ? importTemplateDeep : importTemplate;
    
    // Add import statement after existing imports
    const importRegex = /(import.*from.*['"];?\s*\n)/g;
    const importMatches = content.match(importRegex);
    
    if (importMatches) {
      const lastImport = importMatches[importMatches.length - 1];
      const lastImportIndex = content.lastIndexOf(lastImport) + lastImport.length;
      content = content.slice(0, lastImportIndex) + '\n' + importStatement + content.slice(lastImportIndex);
    } else {
      // If no imports found, add at the top
      content = importStatement + '\n' + content;
    }

    // Add JWT validation to each export function
    const functionRegex = /export async function (GET|POST|PUT|DELETE)\(request\)\s*{/g;
    let match;
    let offset = 0;

    while ((match = functionRegex.exec(content)) !== null) {
      const functionStart = match.index + match[0].length;
      const functionBodyStart = content.indexOf('{', functionStart) + 1;
      
      // Find the first non-whitespace, non-comment line
      let insertPoint = functionBodyStart;
      while (insertPoint < content.length && (content[insertPoint] === ' ' || content[insertPoint] === '\n' || content[insertPoint] === '\t')) {
        insertPoint++;
      }
      
      // Check if there's a try block
      const tryIndex = content.indexOf('try {', functionBodyStart);
      if (tryIndex !== -1 && tryIndex < insertPoint + 50) {
        insertPoint = tryIndex + 5; // After "try {"
      }
      
      // Determine which template to use based on response type
      const usesNextResponse = content.includes('NextResponse.json') || content.includes('NextResponse.redirect');
      const template = usesNextResponse ? jwtValidationNextResponseTemplate : jwtValidationTemplate;
      
      // Insert JWT validation
      content = content.slice(0, insertPoint) + '\n' + template + content.slice(insertPoint);
      
      // Update offset for next match
      offset = insertPoint + template.length;
      functionRegex.lastIndex = offset;
    }

    // Write the updated content
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Added JWT validation to: ${filePath}`);
    
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

function main() {
  console.log('🔒 Adding JWT validation to protected API routes...\n');
  
  const projectRoot = process.cwd();
  
  // Process each protected route
  protectedRoutes.forEach(route => {
    const fullPath = path.join(projectRoot, route);
    addJWTValidation(fullPath);
  });
  
  console.log('\n📋 Summary:');
  console.log(`✅ Processed ${protectedRoutes.length} protected routes`);
  console.log(`🔓 ${publicRoutes.length} routes remain public (no JWT validation)`);
  
  console.log('\n🔍 Public routes (no JWT validation):');
  publicRoutes.forEach(route => {
    console.log(`   - ${route}`);
  });
  
  console.log('\n✨ JWT validation setup complete!');
  console.log('\n📝 Next steps:');
  console.log('1. Test the protected routes to ensure JWT validation works');
  console.log('2. Verify that public routes still work without authentication');
  console.log('3. Check that token refresh works with protected routes');
}

if (require.main === module) {
  main();
}

module.exports = { addJWTValidation, protectedRoutes, publicRoutes };
