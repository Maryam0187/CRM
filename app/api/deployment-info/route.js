import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Get deployment information from environment variables
    const deploymentInfo = {
      // Railway deployment info
      deploymentId: process.env.RAILWAY_DEPLOYMENT_ID || 'local',
      serviceId: process.env.RAILWAY_SERVICE_ID || 'local',
      projectId: process.env.RAILWAY_PROJECT_ID || 'local',
      
      // Build info
      buildId: process.env.RAILWAY_BUILD_ID || 'local',
      commitSha: process.env.RAILWAY_GIT_COMMIT_SHA || 'local',
      branch: process.env.RAILWAY_GIT_BRANCH || 'local',
      
      // App info
      nodeEnv: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      
      // Timestamps
      deployedAt: process.env.RAILWAY_DEPLOYMENT_TIMESTAMP || new Date().toISOString(),
      buildTime: process.env.BUILD_TIME || new Date().toISOString(),
      
      // Short deployment ID for display (first 8 characters)
      shortDeploymentId: (process.env.RAILWAY_DEPLOYMENT_ID || 'local').substring(0, 8),
      
      // Railway URL info
      railwayUrl: process.env.RAILWAY_PUBLIC_DOMAIN || 'localhost',
      
      // Additional Railway environment variables
      railwayEnvironment: process.env.RAILWAY_ENVIRONMENT || 'development',
      railwayRegion: process.env.RAILWAY_REGION || 'unknown'
    };

    return NextResponse.json({
      success: true,
      data: deploymentInfo
    });

  } catch (error) {
    console.error('Error fetching deployment info:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch deployment info',
        error: error.message 
      },
      { status: 500 }
    );
  }
}
