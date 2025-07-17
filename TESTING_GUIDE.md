# Competitor Pricing Database Schema Testing Guide

## Schema Validation Results ✅

The database schema is **working perfectly**! All tests passed:

- ✅ Table exists with correct name
- ✅ All 21 columns properly configured 
- ✅ Data types match specifications
- ✅ Insert operations work correctly
- ✅ Select operations retrieve data
- ✅ Update operations modify records
- ✅ Delete operations remove records

## How to Test the Implementation

### 1. Database Schema Test (Automated)

Run the provided test script:
```bash
node test_schema.js
```

This tests:
- Table existence
- Column structure
- CRUD operations
- Data integrity

### 2. Manual Frontend Testing

#### Test Data Migration:
1. **Login** to the application with @4sgraphics.com email
2. **Visit Area Pricer** app
3. **Add some test calculations**:
   - Type: sheets
   - Dimensions: 12x18 inches
   - Pack quantity: 100
   - Price: $25.00
   - Fill in thickness, product kind, etc.
4. **Click "Add to Competitor Info"**
5. **Visit Competitor Pricing** app
6. **Verify** your data appears in the table

#### Test Real-Time Sharing:
1. **Open app in multiple browser tabs** (or different browsers)
2. **Add data in one tab**
3. **Check other tabs** - data should appear automatically
4. **Filter and search** functionality
5. **Test CSV export** from both apps

#### Test Admin Functions:
1. **Login as admin** (aneesh@4sgraphics.com or oscar@4sgraphics.com)
2. **Visit Admin panel**
3. **Test CSV download** for competitor pricing
4. **Test delete functionality** (trash icon in Competitor Pricing app)

### 3. API Endpoint Testing

The API endpoints are protected by authentication, but you can test them through the browser console:

#### Test GET endpoint:
```javascript
fetch('/api/competitor-pricing')
  .then(response => response.json())
  .then(data => console.log(data));
```

#### Test POST endpoint:
```javascript
fetch('/api/competitor-pricing', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'sheets',
    dimensions: '12 × 18 in',
    width: 12,
    length: 18,
    unit: 'in',
    packQty: 100,
    inputPrice: 25.00,
    thickness: '13pt',
    productKind: 'Adhesive',
    surfaceFinish: 'Gloss',
    supplierInfo: 'Test Supplier',
    infoReceivedFrom: 'Test Source',
    pricePerSqIn: 0.0014,
    pricePerSqFt: 0.2016,
    pricePerSqMeter: 2.1690,
    notes: 'API test entry',
    source: 'API Test'
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

### 4. Data Migration Testing

To test localStorage migration:

1. **Add test data to localStorage** (simulate old data):
```javascript
const testData = [{
  id: 'test-1',
  timestamp: new Date().toISOString(),
  type: 'sheets',
  dimensions: '12 × 18 in',
  width: 12,
  length: 18,
  unit: 'in',
  packQty: 100,
  inputPrice: 25.00,
  thickness: '13pt',
  productKind: 'Adhesive',
  surfaceFinish: 'Gloss',
  supplierInfo: 'Migration Test',
  infoReceivedFrom: 'Test Source',
  pricePerSqIn: 0.0014,
  pricePerSqFt: 0.2016,
  pricePerSqMeter: 2.1690,
  notes: 'Migration test',
  source: 'Area Pricer'
}];
localStorage.setItem('competitorData', JSON.stringify(testData));
```

2. **Visit Competitor Pricing app**
3. **Check for migration success toast**
4. **Verify data appears in table**
5. **Check localStorage is cleared**

### 5. Expected Behaviors

#### What Should Work:
- ✅ Data sharing across all users
- ✅ Automatic localStorage migration
- ✅ Real-time data updates
- ✅ CSV export with all data
- ✅ Admin delete functionality
- ✅ Filtering and search
- ✅ Data persistence across sessions

#### What Should NOT Happen:
- ❌ Data loss during migration
- ❌ Duplicate entries
- ❌ Cross-user data isolation
- ❌ Authentication bypass
- ❌ SQL injection vulnerabilities

## Troubleshooting

### Common Issues:

1. **"No data" showing**: Check authentication and database connection
2. **Migration not working**: Check browser console for errors
3. **Data not sharing**: Verify users are logged in with @4sgraphics.com emails
4. **CSV export empty**: Ensure data exists in database
5. **Delete not working**: Verify admin permissions

### Debug Commands:

```sql
-- Check total records
SELECT COUNT(*) FROM competitor_pricing;

-- Check recent entries
SELECT * FROM competitor_pricing ORDER BY created_at DESC LIMIT 5;

-- Check user distribution
SELECT added_by, COUNT(*) FROM competitor_pricing GROUP BY added_by;
```

## Next Steps

The database schema is fully functional and ready for production use. The migration system ensures a smooth transition from localStorage to server-side storage while maintaining data integrity and user experience.