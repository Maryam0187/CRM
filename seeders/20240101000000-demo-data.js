'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Insert sample users
    await queryInterface.bulkInsert('users', [
      {
        email: 'admin@crm.com',
        password: 'password123',
        first_name: 'Admin',
        last_name: 'User',
        role: 'admin',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        email: 'supervisor@crm.com',
        password: 'password123',
        first_name: 'Mike',
        last_name: 'Supervisor',
        role: 'supervisor',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        email: 'john.doe@company.com',
        password: 'password123',
        first_name: 'John',
        last_name: 'Doe',
        role: 'agent',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        email: 'sarah.johnson@company.com',
        password: 'password123',
        first_name: 'Sarah',
        last_name: 'Johnson',
        role: 'agent',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        email: 'processor@crm.com',
        password: 'password123',
        first_name: 'Lisa',
        last_name: 'Processor',
        role: 'processor',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        email: 'verification@crm.com',
        password: 'password123',
        first_name: 'David',
        last_name: 'Verifier',
        role: 'verification',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});

    // Insert sample customers
    await queryInterface.bulkInsert('customers', [
      {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john.doe@email.com',
        phone: '555-0123',
        company: 'TechCorp Inc.',
        status: 'active',
        created_by: 2,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane.smith@email.com',
        phone: '555-0124',
        company: 'GrowthCo',
        status: 'active',
        created_by: 2,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        first_name: 'Mike',
        last_name: 'Johnson',
        email: 'mike.johnson@email.com',
        phone: '555-0125',
        company: 'StartupXYZ',
        status: 'prospect',
        created_by: 3,
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});

    // Insert sample sales
    await queryInterface.bulkInsert('sales', [
      {
        customer_id: 1,
        agent_id: 2,
        status: 'active',
        customer_name: 'John Doe',
        landline_no: '555-0123',
        cell_no: '555-0124',
        pin_code: '12345',
        carrier: 'Dish',
        basic_package: 'Basic Package',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        customer_id: 2,
        agent_id: 2,
        status: 'pending',
        customer_name: 'Jane Smith',
        landline_no: '555-0125',
        cell_no: '555-0126',
        pin_code: '12346',
        carrier: 'DirecTV',
        basic_package: 'Premium Package',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        customer_id: 3,
        agent_id: 3,
        status: 'completed',
        customer_name: 'Mike Johnson',
        landline_no: '555-0127',
        cell_no: '555-0128',
        pin_code: '12347',
        carrier: 'Comcast',
        basic_package: 'Standard Package',
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});

    // Insert supervisor-agent relationships
    await queryInterface.bulkInsert('supervisor_agents', [
      {
        supervisor_id: 2, // Mike Supervisor
        agent_id: 3, // John Doe
        assigned_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        supervisor_id: 2, // Mike Supervisor
        agent_id: 4, // Sarah Johnson
        assigned_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});

    // Insert role assignments (processor and verification roles)
    await queryInterface.bulkInsert('role_assignments', [
      {
        user_id: 3, // John Doe (agent)
        assigned_role: 'processor',
        assigned_by: 1, // Admin
        is_active: true,
        assigned_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        user_id: 4, // Sarah Johnson (agent)
        assigned_role: 'verification',
        assigned_by: 2, // Supervisor
        is_active: true,
        assigned_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});

  },

  async down(queryInterface, Sequelize) {
    // Remove all sample data
    await queryInterface.bulkDelete('role_assignments', null, {});
    await queryInterface.bulkDelete('supervisor_agents', null, {});
    await queryInterface.bulkDelete('sales', null, {});
    await queryInterface.bulkDelete('customers', null, {});
    await queryInterface.bulkDelete('users', null, {});
  }
};
