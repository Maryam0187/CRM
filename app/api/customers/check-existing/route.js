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
    
    // First, try exact match (name + landline)
    const exactMatch = await CustomerService.findByLandlineAndName(landline, firstName);
    
    if (exactMatch) {
      // Exact match found - same name and landline
      const lastSale = await CustomerService.getLastSaleForCustomer(exactMatch.id);
      
      return Response.json({
        success: true,
        exists: true,
        matchType: 'exact',
        customer: exactMatch,
        lastSale: lastSale,
        message: `Exact match found: ${exactMatch.firstName}. Will add new sale to existing customer.`
      });
    }
    
    // No exact match, check if landline exists with different names
    const landlineCustomers = await CustomerService.findAllByLandline(landline);
    
    if (landlineCustomers && landlineCustomers.length > 0) {
      // Landline exists with different names - show all options
      return Response.json({
        success: true,
        exists: true,
        matchType: 'landline',
        landlineCustomers: landlineCustomers,
        message: `Landline exists with ${landlineCustomers.length} different customer(s). Please select or create new customer.`
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
