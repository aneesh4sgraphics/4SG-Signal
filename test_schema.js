/*
 * Competitor Pricing Database Schema Test
 * Run with: node test_schema.js
 * 
 * This script verifies that the competitor_pricing table schema is properly configured
 * and all CRUD operations work correctly.
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testSchema() {
  try {
    console.log('🧪 Testing Competitor Pricing Database Schema...\n');
    
    // Test 1: Check table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'competitor_pricing'
      );
    `);
    console.log('✅ Table exists:', tableExists.rows[0].exists);
    
    // Test 2: Check all columns exist
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'competitor_pricing' 
      ORDER BY ordinal_position;
    `);
    console.log('\n📋 Table columns:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'required'})`);
    });
    
    // Test 3: Test insert operation
    console.log('\n🔄 Testing insert operation...');
    const insertResult = await pool.query(`
      INSERT INTO competitor_pricing (
        timestamp, type, dimensions, width, length, unit, pack_qty, 
        input_price, thickness, product_kind, surface_finish, 
        supplier_info, info_received_from, price_per_sq_in, 
        price_per_sq_ft, price_per_sq_meter, notes, source, added_by
      ) VALUES (
        NOW(), 'sheets', '12 × 18 in', 12, 18, 'in', 100, 
        25.00, '13pt', 'Adhesive', 'Gloss', 'Test Supplier', 
        'Test Source', 0.0014, 0.2016, 2.1690, 'Schema test entry', 
        'Schema Test', 'test@4sgraphics.com'
      ) RETURNING id;
    `);
    console.log('✅ Insert successful, ID:', insertResult.rows[0].id);
    
    // Test 4: Test select operation
    console.log('\n📖 Testing select operation...');
    const selectResult = await pool.query(`
      SELECT * FROM competitor_pricing WHERE id = $1;
    `, [insertResult.rows[0].id]);
    console.log('✅ Select successful, found', selectResult.rows.length, 'record(s)');
    
    // Test 5: Test update operation
    console.log('\n✏️ Testing update operation...');
    const updateResult = await pool.query(`
      UPDATE competitor_pricing 
      SET notes = 'Updated schema test entry' 
      WHERE id = $1;
    `, [insertResult.rows[0].id]);
    console.log('✅ Update successful, affected', updateResult.rowCount, 'row(s)');
    
    // Test 6: Test delete operation
    console.log('\n🗑️ Testing delete operation...');
    const deleteResult = await pool.query(`
      DELETE FROM competitor_pricing WHERE id = $1;
    `, [insertResult.rows[0].id]);
    console.log('✅ Delete successful, removed', deleteResult.rowCount, 'row(s)');
    
    // Test 7: Check final count
    const finalCount = await pool.query(`
      SELECT COUNT(*) as total FROM competitor_pricing;
    `);
    console.log('\n📊 Final record count:', finalCount.rows[0].total);
    
    console.log('\n🎉 All schema tests passed successfully!');
    
  } catch (error) {
    console.error('❌ Schema test failed:', error.message);
  } finally {
    await pool.end();
  }
}

testSchema();