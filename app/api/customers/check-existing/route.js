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
    
    // Always get all customers with this landline
    const landlineCustomers = await CustomerService.findAllByLandline(landline);
    
    if (landlineCustomers && landlineCustomers.length > 0) {
      // Check if there's an exact match (same name and landline)
      const exactMatch = landlineCustomers.find(customer => 
        customer.firstName.toLowerCase().trim() === firstName.toLowerCase().trim()
      );
      
      // Clean up the customer data to avoid circular references and include last sale info
      const customersWithSales = landlineCustomers.map(customer => {
        // Get the last sale (most recent)
        const lastSale = customer.sales && customer.sales.length > 0 ? customer.sales[0] : null;
        
        return {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          landline: customer.landline,
          address: customer.address,
          state: customer.state,
          city: customer.city,
          country: customer.country,
          mailingAddress: customer.mailingAddress,
          customerFeedback: customer.customerFeedback,
          status: customer.status,
          created_at: customer.created_at,
          updated_at: customer.updated_at,
          isExactMatch: customer.firstName.toLowerCase().trim() === firstName.toLowerCase().trim(),
          lastSale: lastSale ? {
            id: lastSale.id,
            status: lastSale.status,
            spoke_to: lastSale.spoke_to,
            notes: lastSale.notes,
            created_at: lastSale.created_at,
            agent: lastSale.agent ? {
              id: lastSale.agent.id,
              firstName: lastSale.agent.firstName,
              lastName: lastSale.agent.lastName
            } : null
          } : null
        };
      });
      
      return Response.json({
        success: true,
        exists: true,
        matchType: exactMatch ? 'exact' : 'landline',
        hasExactMatch: !!exactMatch,
        exactMatchCustomer: exactMatch ? {
          id: exactMatch.id,
          firstName: exactMatch.firstName,
          lastName: exactMatch.lastName,
          email: exactMatch.email,
          phone: exactMatch.phone,
          landline: exactMatch.landline,
          address: exactMatch.address,
          state: exactMatch.state,
          city: exactMatch.city,
          country: exactMatch.country,
          mailingAddress: exactMatch.mailingAddress,
          customerFeedback: exactMatch.customerFeedback,
          status: exactMatch.status,
          created_at: exactMatch.created_at,
          updated_at: exactMatch.updated_at,
          lastSale: exactMatch.sales && exactMatch.sales.length > 0 ? {
            id: exactMatch.sales[0].id,
            status: exactMatch.sales[0].status,
            spoke_to: exactMatch.sales[0].spoke_to,
            notes: exactMatch.sales[0].notes,
            created_at: exactMatch.sales[0].created_at,
            agent: exactMatch.sales[0].agent ? {
              id: exactMatch.sales[0].agent.id,
              firstName: exactMatch.sales[0].agent.firstName,
              lastName: exactMatch.sales[0].agent.lastName
            } : null
          } : null
        } : null,
        landlineCustomers: customersWithSales,
        customerCount: landlineCustomers.length,
        message: exactMatch 
          ? `Exact match found: ${exactMatch.firstName}. Landline exists with ${landlineCustomers.length} customer(s).`
          : `Landline exists with ${landlineCustomers.length} different customer(s). Please select a customer or create new one.`
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
