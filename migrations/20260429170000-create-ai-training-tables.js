'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ai_prompt_versions', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      version_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      prompt_text: {
        type: Sequelize.TEXT('long'),
        allowNull: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
    await queryInterface.addIndex('ai_prompt_versions', ['is_active']);

    await queryInterface.createTable('ai_call_extractions', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      call_log_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'call_logs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      prompt_version_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'ai_prompt_versions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      provider: {
        type: Sequelize.ENUM('dish', 'directv', 'unknown'),
        allowNull: false,
        defaultValue: 'unknown'
      },
      tv_on: {
        type: Sequelize.ENUM('yes', 'no', 'unknown'),
        allowNull: false,
        defaultValue: 'unknown'
      },
      receiver_id: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      receiver_model: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      tv_count: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      account_holder_confirmed: {
        type: Sequelize.ENUM('yes', 'no', 'unknown'),
        allowNull: false,
        defaultValue: 'unknown'
      },
      verification_method: {
        type: Sequelize.ENUM('name_zip', 'last2phone', 'none'),
        allowNull: false,
        defaultValue: 'none'
      },
      callback_window: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      risk_flags: {
        type: Sequelize.JSON,
        allowNull: true
      },
      ai_confidence: {
        type: Sequelize.FLOAT,
        allowNull: true
      },
      raw_extraction_json: {
        type: Sequelize.JSON,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
    await queryInterface.addIndex('ai_call_extractions', ['call_log_id']);
    await queryInterface.addIndex('ai_call_extractions', ['provider']);
    await queryInterface.addIndex('ai_call_extractions', ['prompt_version_id']);

    await queryInterface.createTable('ai_call_reviews', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      call_log_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'call_logs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      review_status: {
        type: Sequelize.ENUM('pending', 'approved', 'corrected', 'rejected'),
        allowNull: false,
        defaultValue: 'pending'
      },
      original_ai_outcome: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      final_outcome: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      provider: {
        type: Sequelize.ENUM('dish', 'directv', 'unknown'),
        allowNull: false,
        defaultValue: 'unknown'
      },
      quality_score: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      compliance_issue: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      compliance_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      review_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      reviewed_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
    await queryInterface.addIndex('ai_call_reviews', ['call_log_id'], { unique: true });
    await queryInterface.addIndex('ai_call_reviews', ['review_status']);
    await queryInterface.addIndex('ai_call_reviews', ['reviewed_by']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ai_call_reviews');
    await queryInterface.dropTable('ai_call_extractions');
    await queryInterface.dropTable('ai_prompt_versions');

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_ai_call_reviews_review_status;').catch(() => {});
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_ai_call_reviews_provider;').catch(() => {});
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_ai_call_extractions_provider;').catch(() => {});
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_ai_call_extractions_tv_on;').catch(() => {});
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_ai_call_extractions_account_holder_confirmed;').catch(() => {});
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_ai_call_extractions_verification_method;').catch(() => {});
  }
};

