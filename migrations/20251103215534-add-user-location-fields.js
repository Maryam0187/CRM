'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add latitude field
    await queryInterface.addColumn('users', 'latitude', {
      type: Sequelize.DECIMAL(10, 8),
      allowNull: true,
      comment: 'User location latitude'
    });

    // Add longitude field
    await queryInterface.addColumn('users', 'longitude', {
      type: Sequelize.DECIMAL(11, 8),
      allowNull: true,
      comment: 'User location longitude'
    });

    // Add location accuracy
    await queryInterface.addColumn('users', 'location_accuracy', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Location accuracy in meters'
    });

    // Add location timestamp
    await queryInterface.addColumn('users', 'location_timestamp', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'When the location was last updated'
    });

    // Add location permission status
    await queryInterface.addColumn('users', 'location_permission', {
      type: Sequelize.ENUM('granted', 'denied', 'prompt', 'not_set'),
      allowNull: true,
      defaultValue: 'not_set',
      comment: 'User location permission status'
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove location columns
    await queryInterface.removeColumn('users', 'location_permission');
    await queryInterface.removeColumn('users', 'location_timestamp');
    await queryInterface.removeColumn('users', 'location_accuracy');
    await queryInterface.removeColumn('users', 'longitude');
    await queryInterface.removeColumn('users', 'latitude');
  }
};

