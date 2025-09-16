'use strict';

const bcrypt = require('bcrypt');

module.exports = {
  async up(queryInterface, Sequelize) {
    // Pre-hash the password for better seeding performance
    // Password: password123
    const hashedPassword = await bcrypt.hash('password123', 12);

    // Insert users with clear hierarchy
    await queryInterface.bulkInsert('users', [
      // Admin user
      {
        email: 'admin@crm.com',
        password: hashedPassword,
        first_name: 'Admin',
        last_name: 'User',
        role: 'admin',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      
      // Supervisor
      {
        email: 'supervisor@crm.com',
        password: hashedPassword,
        first_name: 'Mike',
        last_name: 'Supervisor',
        role: 'supervisor',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      
      // Agents under supervisor
      {
        email: 'john.agent@crm.com',
        password: hashedPassword,
        first_name: 'John',
        last_name: 'Agent',
        role: 'agent',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        email: 'sarah.agent@crm.com',
        password: hashedPassword,
        first_name: 'Sarah',
        last_name: 'Agent',
        role: 'agent',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      
      // Independent agent (not under supervisor)
      {
        email: 'independent.agent@crm.com',
        password: hashedPassword,
        first_name: 'Independent',
        last_name: 'Agent',
        role: 'agent',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      
      // Other roles
      {
        email: 'processor@crm.com',
        password: hashedPassword,
        first_name: 'Lisa',
        last_name: 'Processor',
        role: 'processor',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        email: 'verification@crm.com',
        password: hashedPassword,
        first_name: 'David',
        last_name: 'Verifier',
        role: 'verification',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});

    // Insert customers
    await queryInterface.bulkInsert('customers', [
      {
        first_name: 'Alice',
        last_name: 'Johnson',
        email: 'alice.johnson@email.com',
        phone: '555-0101',
        landline: '555-0201',
        address: '123 Main St, Springfield, IL 62701',
        company: 'TechCorp Inc.',
        status: 'active',
        created_by: 3, // John Agent
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        first_name: 'Bob',
        last_name: 'Smith',
        email: 'bob.smith@email.com',
        phone: '555-0102',
        landline: '555-0202',
        address: '456 Oak Ave, Springfield, IL 62702',
        company: 'GrowthCo',
        status: 'active',
        created_by: 3, // John Agent
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        first_name: 'Carol',
        last_name: 'Davis',
        email: 'carol.davis@email.com',
        phone: '555-0103',
        landline: '555-0203',
        address: '789 Pine St, Springfield, IL 62703',
        company: 'StartupXYZ',
        status: 'prospect',
        created_by: 4, // Sarah Agent
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        first_name: 'David',
        last_name: 'Wilson',
        email: 'david.wilson@email.com',
        phone: '555-0104',
        landline: '555-0204',
        address: '321 Elm St, Springfield, IL 62704',
        company: 'Enterprise Co',
        status: 'active',
        created_by: 4, // Sarah Agent
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        first_name: 'Eva',
        last_name: 'Brown',
        email: 'eva.brown@email.com',
        phone: '555-0105',
        landline: '555-0205',
        address: '654 Maple Ave, Springfield, IL 62705',
        company: 'Independent LLC',
        status: 'prospect',
        created_by: 5, // Independent Agent
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});

    // Insert sales - mix of different statuses and agents
    await queryInterface.bulkInsert('sales', [
      // Sales by John Agent (agent_id: 3) - supervised by Mike Supervisor
      {
        customer_id: 1,
        agent_id: 3,
        status: 'active',
        pin_code: '12345',
        pin_code_status: 'matched',
        ssn_name: 'Alice Johnson',
        ssn_number: '123-45-6789',
        carrier: 'Dish',
        basic_package: 'America\'s Top 120',
        basic_package_status: 'same',
        no_of_tv: 2,
        no_of_receiver: 2,
        account_holder: 'Alice Johnson',
        account_number: 'DISH123456789',
        security_question: 'What is your pet\'s name?',
        security_answer: 'Fluffy',
        regular_bill: '89.99',
        promotional_bill: '59.99',
        bundle: 'yes',
        company: 'Frontier',
        last_payment: '89.99',
        last_payment_date: '2024-08-15',
        balance: '0.00',
        due_on_date: '2024-09-15',
        breakdown: 'America\'s Top 120: $69.99\\nHopper 3 DVR: $15.00\\nJoey Receiver: $5.00\\nTotal: $89.99',
        notes: 'Customer is happy with current package. Renewal due next month.',
        services: '["Tech Visit", "Receiver Shipment"]',
        receivers: '{"311": 1, "322": 1}',
        receivers_info: '{"311": {"receiverId": "R311001", "smartCardId": "SC123456", "secureId": "SEC789", "locationId": "LOC001", "room": "Living Room"}}',
        tech_visit_date: '2024-09-20',
        tech_visit_time: '8am - 12pm',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        customer_id: 2,
        agent_id: 3,
        status: 'pending',
        pin_code: '54321',
        pin_code_status: 'not_matched',
        ssn_name: 'Bob Smith',
        carrier: 'DirecTV',
        basic_package: 'Choice Package',
        basic_package_status: 'upgrade',
        no_of_tv: 3,
        no_of_receiver: 3,
        account_holder: 'Bob Smith',
        regular_bill: '124.99',
        promotional_bill: '89.99',
        bundle: 'no',
        notes: 'Customer wants to upgrade package. Waiting for approval.',
        services: '["Remotely Upgrade"]',
        receivers: '{"211k": 2, "222": 1}',
        created_at: new Date(),
        updated_at: new Date()
      },

      // Sales by Sarah Agent (agent_id: 4) - supervised by Mike Supervisor  
      {
        customer_id: 3,
        agent_id: 4,
        status: 'completed',
        pin_code: '67890',
        pin_code_status: 'matched',
        ssn_name: 'Carol Davis',
        carrier: 'Spectrum',
        basic_package: 'Silver Package',
        basic_package_status: 'same',
        no_of_tv: 1,
        no_of_receiver: 1,
        account_holder: 'Carol Davis',
        regular_bill: '79.99',
        promotional_bill: '49.99',
        bundle: 'yes',
        company: 'CenturyLink',
        notes: 'Installation completed successfully. Customer satisfied.',
        services: '["Tech Visit"]',
        receivers: '{"311": 1}',
        tech_visit_date: '2024-09-10',
        tech_visit_time: '12pm - 4pm',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        customer_id: 4,
        agent_id: 4,
        status: 'cancelled',
        pin_code: '11111',
        carrier: 'Comcast',
        basic_package: 'Basic Cable',
        notes: 'Customer decided to cancel due to pricing concerns.',
        created_at: new Date(),
        updated_at: new Date()
      },

      // Sales by Independent Agent (agent_id: 5) - NOT supervised by Mike Supervisor
      {
        customer_id: 5,
        agent_id: 5,
        status: 'active',
        pin_code: '99999',
        pin_code_status: 'matched',
        ssn_name: 'Eva Brown',
        carrier: 'AT&T U-verse',
        basic_package: 'U-verse TV',
        basic_package_status: 'same',
        no_of_tv: 2,
        no_of_receiver: 2,
        account_holder: 'Eva Brown',
        regular_bill: '99.99',
        promotional_bill: '69.99',
        bundle: 'yes',
        notes: 'Independent agent sale - should NOT be visible to Mike Supervisor.',
        services: '["Remote Shipment"]',
        receivers: '{"211z": 2}',
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});

    // Insert supervisor-agent relationships
    // Supervisor ID 2 (Mike Supervisor) supervises agents 3 (John) and 4 (Sarah)
    await queryInterface.bulkInsert('supervisor_agents', [
      {
        supervisor_id: 2, // Mike Supervisor
        agent_id: 3, // John Agent
        assigned_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        supervisor_id: 2, // Mike Supervisor  
        agent_id: 4, // Sarah Agent
        assigned_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      }
      // Note: Independent Agent (ID 5) is NOT supervised by anyone
    ], {});

    console.log('✅ Demo data seeded successfully!');
    console.log('📊 Data Summary:');
    console.log('   - Users: 7 (1 admin, 1 supervisor, 3 agents, 1 processor, 1 verifier)');
    console.log('   - Customers: 5');
    console.log('   - Sales: 5 (4 by supervised agents, 1 by independent agent)');
    console.log('   - Supervisor Relations: 2 (Mike supervises John & Sarah)');
    console.log('');
    console.log('🔐 Login Credentials (all passwords: password123):');
    console.log('   - Admin: admin@crm.com');
    console.log('   - Supervisor: supervisor@crm.com (should see 4 sales from John & Sarah)');
    console.log('   - John Agent: john.agent@crm.com (should see 2 own sales)');
    console.log('   - Sarah Agent: sarah.agent@crm.com (should see 2 own sales)');
    console.log('   - Independent Agent: independent.agent@crm.com (should see 1 own sale)');
  },

  async down(queryInterface, Sequelize) {
    // Remove all sample data in reverse order of dependencies
    await queryInterface.bulkDelete('supervisor_agents', null, {});
    await queryInterface.bulkDelete('sales', null, {});
    await queryInterface.bulkDelete('customers', null, {});
    await queryInterface.bulkDelete('users', null, {});
    
    console.log('🗑️ Demo data removed successfully!');
  }
};
