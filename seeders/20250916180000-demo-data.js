'use strict';

const bcrypt = require('bcrypt');

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // Check if admin user already exists
      const existingAdmin = await queryInterface.rawSelect('users', {
        where: { email: 'admin@crm.com' }
      }, ['id']);
      
      if (!existingAdmin) {
        // Only insert the admin user for initial login
        // Password: password123
        const hashedPassword = await bcrypt.hash('password123', 12);

        await queryInterface.bulkInsert('users', [
          {
            email: 'admin@crm.com',
            password: hashedPassword,
            first_name: 'Admin',
            last_name: 'User',
            role: 'admin',
            is_active: true,
            cnic: null, // Explicitly set to null to avoid unique constraint issues
            phone: null, // Explicitly set to null
            address: null, // Explicitly set to null
            created_at: new Date(),
            updated_at: new Date()
          }
        ], {
          // Skip validation to avoid conflicts with model validations
          validate: false,
          // Skip hooks to avoid password double-hashing
          hooks: false
        });

        console.log('✅ Admin user seeded successfully!');
        console.log('🔐 Login Credentials:');
        console.log('   - Admin: admin@crm.com');
        console.log('   - Password: password123');
        console.log('');
      } else {
        console.log('⚠️  Admin user already exists, skipping admin seed');
      }

      // Seed carriers
      const carriers = [
        'Dish',
        'DirecTV',
        'Comcast',
        'Spectrum',
        'AT&T U-verse',
        'Metrocast',
        'EGO Cable',
        'Cable'
      ];

      // Check if carriers already exist
      const existingCarriers = await queryInterface.rawSelect('carriers', {
        where: { name: carriers[0] }
      }, ['id']);

      if (!existingCarriers) {
        // Get admin ID for created_by field
        const adminId = existingAdmin || await queryInterface.rawSelect('users', {
          where: { email: 'admin@crm.com' }
        }, ['id']);

        const carrierData = carriers.map(name => ({
          name: name,
          status: 'active',
          created_by: adminId || null,
          created_at: new Date(),
          updated_at: new Date()
        }));

        await queryInterface.bulkInsert('carriers', carrierData, {
          validate: false,
          hooks: false
        });

        console.log('✅ Carriers seeded successfully!');
        console.log(`   - Added ${carriers.length} carriers`);
      } else {
        console.log('⚠️  Carriers already exist, skipping carrier seed');
      }

      // Seed receivers for Dish carrier
      const dishReceivers = [
        'VIP 722-DVR',
        'VIP 622-DVR',
        'DP 625-DVR',
        'VIP 612-DVR',
        'DP 512-DVR',
        'VIP 222',
        'DP 322',
        'VIP 211K',
        'VIP 211Z',
        'DP 311',
        '3900',
        '2700',
        'DP 301',
        'Hopper',
        'Hopper with Sling',
        'Hopper-3',
        'Joey',
        'Joey 2.0',
        'Wireless Joey',
        'Wally'
      ];

      // Get Dish carrier ID
      const dishCarrierId = await queryInterface.rawSelect('carriers', {
        where: { name: 'Dish' }
      }, ['id']);

      if (dishCarrierId) {
        // Check if receivers already exist for Dish
        const existingReceiver = await queryInterface.rawSelect('receivers', {
          where: { 
            carrier_id: dishCarrierId,
            name: dishReceivers[0]
          }
        }, ['id']);

        if (!existingReceiver) {
          // Get admin ID for created_by field
          const adminId = existingAdmin || await queryInterface.rawSelect('users', {
            where: { email: 'admin@crm.com' }
          }, ['id']);

          const receiverData = dishReceivers.map(name => ({
            name: name,
            carrier_id: dishCarrierId,
            status: 'active',
            created_by: adminId || null,
            created_at: new Date(),
            updated_at: new Date()
          }));

          await queryInterface.bulkInsert('receivers', receiverData, {
            validate: false,
            hooks: false
          });

          console.log('✅ Dish receivers seeded successfully!');
          console.log(`   - Added ${dishReceivers.length} receivers for Dish carrier`);
        } else {
          console.log('⚠️  Dish receivers already exist, skipping receiver seed');
        }
      } else {
        console.log('⚠️  Dish carrier not found, skipping receiver seed');
      }

      console.log('');
      console.log('👉 Please login as admin and create users through the application.');
    } catch (error) {
      console.error('❌ Seeding failed:', error.message);
      // Don't throw error to allow migration to continue
      console.log('⚠️  Seeding failed, but continuing...');
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove receivers for Dish carrier first (due to foreign key constraint)
    const dishCarrierId = await queryInterface.rawSelect('carriers', {
      where: { name: 'Dish' }
    }, ['id']);

    if (dishCarrierId) {
      const dishReceivers = [
        'VIP 722-DVR',
        'VIP 622-DVR',
        'DP 625-DVR',
        'VIP 612-DVR',
        'DP 512-DVR',
        'VIP 222',
        'DP 322',
        'VIP 211K',
        'VIP 211Z',
        'DP 311',
        '3900',
        '2700',
        'DP 301',
        'Hopper',
        'Hopper with Sling',
        'Hopper-3',
        'Joey',
        'Joey 2.0',
        'Wireless Joey',
        'Wally'
      ];

      await queryInterface.bulkDelete('receivers', {
        carrier_id: dishCarrierId,
        name: {
          [Sequelize.Op.in]: dishReceivers
        }
      }, {});
      console.log('🗑️ Dish receivers removed successfully!');
    }

    // Remove carriers
    const carriers = [
      'Dish',
      'DirecTV',
      'Comcast',
      'Spectrum',
      'AT&T U-verse',
      'Metrocast',
      'EGO Cable',
      'Cable'
    ];
    
    await queryInterface.bulkDelete('carriers', {
      name: {
        [Sequelize.Op.in]: carriers
      }
    }, {});
    console.log('🗑️ Carriers removed successfully!');

    // Remove only the admin user
    await queryInterface.bulkDelete('users', { email: 'admin@crm.com' }, {});
    console.log('🗑️ Admin user removed successfully!');
  }
};
