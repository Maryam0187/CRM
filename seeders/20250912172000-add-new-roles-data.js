'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Insert new role users
    await queryInterface.bulkInsert('users', [
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

    // Insert supervisor-agent relationships
    await queryInterface.bulkInsert('supervisor_agents', [
      {
        supervisor_id: 17, // Mike Supervisor
        agent_id: 2, // John Doe
        assigned_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        supervisor_id: 17, // Mike Supervisor
        agent_id: 3, // Sarah Johnson
        assigned_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});

    // Insert role assignments (processor and verification roles)
    await queryInterface.bulkInsert('role_assignments', [
      {
        user_id: 2, // John Doe (agent)
        assigned_role: 'processor',
        assigned_by: 1, // Admin
        is_active: true,
        assigned_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        user_id: 3, // Sarah Johnson (agent)
        assigned_role: 'verification',
        assigned_by: 17, // Supervisor
        is_active: true,
        assigned_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    // Remove the new data
    await queryInterface.bulkDelete('role_assignments', null, {});
    await queryInterface.bulkDelete('supervisor_agents', null, {});
    await queryInterface.bulkDelete('users', { 
      email: ['supervisor@crm.com', 'processor@crm.com', 'verification@crm.com'] 
    }, {});
  }
};
