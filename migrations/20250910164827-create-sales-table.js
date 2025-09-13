'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('sales', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'customers',
          key: 'id'
        }
      },
      agent_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      status: {
        type: Sequelize.ENUM('lead', 'voicemail', 'hang-up', 'no_response', 'appointment', 'active', 'pending', 'completed', 'cancelled'),
        defaultValue: 'lead'
      },
      
      // Customer Information
      customer_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      landline_no: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      cell_no: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      address: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      
      // Sale Information
      pin_code: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      pin_code_status: {
        type: Sequelize.ENUM('matched', 'not_matched'),
        allowNull: true
      },
      ssn_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      ssn_number: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      carrier: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      basic_package: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      basic_package_status: {
        type: Sequelize.ENUM('same', 'upgrade', 'downgrade'),
        allowNull: true
      },
      no_of_tv: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      no_of_receiver: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      account_holder: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      account_number: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      security_question: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      security_answer: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      regular_bill: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      promotional_bill: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      bundle: {
        type: Sequelize.ENUM('yes', 'no'),
        allowNull: true
      },
      company: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      last_payment: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      last_payment_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      balance: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      due_on_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      breakdown: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      
      // JSON fields for complex data
      services: {
        type: Sequelize.JSON,
        allowNull: true
      },
      receivers: {
        type: Sequelize.JSON,
        allowNull: true
      },
      receivers_info: {
        type: Sequelize.JSON,
        allowNull: true
      },
      
      // Tech Visit Information
      tech_visit_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      tech_visit_time: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      
      // Appointment Information
      appointment_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      appointment_time: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('sales');
  }
};
