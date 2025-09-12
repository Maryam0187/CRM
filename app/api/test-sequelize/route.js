import { 
  testSequelizeConnection, 
  syncSequelizeDatabase,
  DashboardService,
  CustomerService,
  SaleService 
} from '../../../lib/sequelize-db.js';

export async function GET() {
  try {
    // Test database connection
    const isConnected = await testSequelizeConnection();
    
    if (!isConnected) {
      return Response.json(
        { success: false, message: 'Sequelize database connection failed' },
        { status: 500 }
      );
    }

    // Get dashboard stats
    const stats = await DashboardService.getStats();

    // Get sample data
    const customers = await CustomerService.findAll();
    const sales = await SaleService.findAll();

    return Response.json({
      success: true,
      message: 'Sequelize database connected successfully',
      stats: stats,
      sampleData: {
        customers: customers.slice(0, 3), // First 3 customers
        sales: sales.slice(0, 3) // First 3 sales
      }
    });
  } catch (error) {
    console.error('Sequelize API Error:', error);
    return Response.json(
      { success: false, message: 'Internal server error', error: error.message },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    // Sync database (create tables if they don't exist)
    const synced = await syncSequelizeDatabase(false);
    
    if (!synced) {
      return Response.json(
        { success: false, message: 'Database synchronization failed' },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: 'Database synchronized successfully'
    });
  } catch (error) {
    console.error('Sequelize Sync Error:', error);
    return Response.json(
      { success: false, message: 'Database sync failed', error: error.message },
      { status: 500 }
    );
  }
}
