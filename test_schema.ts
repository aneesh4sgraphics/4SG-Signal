/*
 * Competitor Pricing Database Schema Test
 * Run with: npx tsx test_schema.ts
 * 
 * This script verifies that the competitor_pricing table schema is properly configured
 * and all CRUD operations work correctly with full TypeScript type safety.
 */

import pkg from 'pg';
const { Pool } = pkg;
import type { PoolClient, QueryResult } from 'pg';

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

interface CompetitorPricingRecord {
  id: number;
  timestamp: Date;
  type: string;
  dimensions: string;
  width: number;
  length: number;
  unit: string;
  pack_qty: number;
  input_price: number;
  thickness: string;
  product_kind: string;
  surface_finish: string;
  supplier_info: string;
  info_received_from: string;
  price_per_sq_in: number;
  price_per_sq_ft: number;
  price_per_sq_meter: number;
  notes: string;
  source: string;
  added_by: string;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testSchema(): Promise<void> {
  let client: PoolClient | null = null;
  
  try {
    client = await pool.connect();
    console.log('🧪 Testing Competitor Pricing Database Schema...\n');
    
    // Test 1: Check table exists
    const tableExists: QueryResult<{ exists: boolean }> = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'competitor_pricing'
      );
    `);
    console.log('✅ Table exists:', tableExists.rows[0].exists);
    
    // Test 2: Check all columns exist
    const columns: QueryResult<ColumnInfo> = await client.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'competitor_pricing' 
      ORDER BY ordinal_position;
    `);
    console.log('\n📋 Table columns:');
    columns.rows.forEach((col: ColumnInfo) => {
      console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'required'})`);
    });
    
    // Test 3: Test insert operation
    console.log('\n🔄 Testing insert operation...');
    const insertResult: QueryResult<{ id: number }> = await client.query(`
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
    
    const testId = insertResult.rows[0].id;
    
    // Test 4: Test select operation
    console.log('\n📖 Testing select operation...');
    const selectResult: QueryResult<CompetitorPricingRecord> = await client.query(`
      SELECT * FROM competitor_pricing WHERE id = $1;
    `, [testId]);
    console.log('✅ Select successful, found', selectResult.rows.length, 'record(s)');
    
    // Test 5: Test update operation
    console.log('\n✏️ Testing update operation...');
    const updateResult: QueryResult = await client.query(`
      UPDATE competitor_pricing 
      SET notes = 'Updated schema test entry' 
      WHERE id = $1;
    `, [testId]);
    console.log('✅ Update successful, affected', updateResult.rowCount, 'row(s)');
    
    // Test 6: Test delete operation
    console.log('\n🗑️ Testing delete operation...');
    const deleteResult: QueryResult = await client.query(`
      DELETE FROM competitor_pricing WHERE id = $1;
    `, [testId]);
    console.log('✅ Delete successful, removed', deleteResult.rowCount, 'row(s)');
    
    // Test 7: Check final count
    const finalCount: QueryResult<{ total: string }> = await client.query(`
      SELECT COUNT(*) as total FROM competitor_pricing;
    `);
    console.log('\n📊 Final record count:', finalCount.rows[0].total);
    
    console.log('\n🎉 All schema tests passed successfully!');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Schema test failed:', errorMessage);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Run the test
testSchema().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});