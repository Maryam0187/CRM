import { CustomerService } from '../../../../lib/sequelize-db.js';

export async function POST(request) {
  try {
    const { landline, firstName } = await request.json();
    
    if (!landline || !firstName) {
      return Response.json(
        { success: false, message: 'Landline and first name are required' },
        { status: 400 }
      );
    }
    
    // Check if customer already exists
    const existingCustomer = await CustomerService.findByLandlineAndName(landline, firstName);
    
    if (existingCustomer) {
      // Get the last sale for this customer
      const lastSale = await CustomerService.getLastSaleForCustomer(existingCustomer.id);
      
      return Response.json({
        success: true,
        exists: true,
        customer: existingCustomer,
        lastSale: lastSale,
        message: `Customer already exists. Last sale: ${lastSale ? new Date(lastSale.created_at).toLocaleString() : 'No previous sales'}. You can proceed with this customer if needed.`
      });
    }
    
    return Response.json({
      success: true,
      exists: false,
      message: 'Customer does not exist'
    });
    
  } catch (error) {
    console.error('Check existing customer error:', error);
    return Response.json(
      { success: false, message: 'Failed to check customer', error: error.message },
      { status: 500 }
    );
  }
}
