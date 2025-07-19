# File Management & Cleanup Guide

## 🧹 File Cleanup Utility

A comprehensive file management system has been implemented for safety and data integrity.

### Quick Commands

```bash
# See what would be cleaned up (safe preview)
node cleanup-files.js dry-run

# Create backup of important files
node cleanup-files.js backup

# Full cleanup with backup and report
node cleanup-files.js full

# Generate file usage report
node cleanup-files.js report
```

### Safety Features Implemented

#### 🔒 Safe File Operations
- **File existence checks** before all read/write operations
- **Comprehensive logging** of all file operations to `file-operations.log`
- **Error handling** with detailed error messages
- **Automatic backups** before any cleanup operations

#### 📝 File Operation Logging
All file operations are logged with:
- Timestamp
- Operation type (READ, WRITE, DELETE, UPLOAD, DOWNLOAD)
- File path
- Success/failure status
- File size (when available)
- Error details (when applicable)

#### 🗂️ Duplicate File Management
The system automatically identifies and manages duplicate files:
- **Timestamped duplicates** (files with `_1752...` patterns)
- **Versioned duplicates** (files with `(1)`, `(2)` patterns)
- **Keeps latest version** based on modification time
- **Safe deletion** with comprehensive logging

### File Patterns Managed

#### Main Files (Always Kept)
- `customers_export.csv`
- `PricePAL_All_Product_Data.csv`
- `tier_pricing_template.csv`
- Latest `area-pricing-calculations-*.csv`

#### Duplicate Patterns (Cleaned Up)
- `area-pricing-calculations-*_1752*.csv`
- `customers_export*_1752*.csv`
- `PricePAL_All_Product_Data*_1752*.csv`
- `tier_pricing_template*_1752*.csv`

### Server-Side Enhancements

#### Enhanced Upload Processing
- **Safe file reading** with error handling
- **Upload logging** with file size and user tracking
- **Automatic cleanup** of temporary upload files
- **Comprehensive error reporting**

#### Download Tracking
- **Download logging** for admin data exports
- **File existence verification** before inclusion
- **Duplicate elimination** in ZIP archives

### Backup System

#### Automatic Backups
- Created before any cleanup operation
- Timestamped backup directories
- Preserves all important CSV files
- Detailed backup logging

#### Backup Location
```
backups/
├── backup-2025-07-19T02-53-00-000Z/
│   ├── customers_export.csv
│   ├── PricePAL_All_Product_Data.csv
│   └── tier_pricing_template.csv
└── ...
```

### Monitoring & Reports

#### File Operations Log
Location: `file-operations.log`

Example entries:
```
[2025-07-19T02:48:38.123Z] UPLOAD customers_export.csv -> /path/to/file - SUCCESS (305635 bytes)
[2025-07-19T02:48:39.456Z] DOWNLOAD /path/to/archive.zip - SUCCESS (411646 bytes) - admin
[2025-07-19T02:48:40.789Z] DELETE /temp/upload_abc123 - SUCCESS
```

#### File Usage Report
Location: `file-report.json`

Contains:
- Directory statistics
- File counts and sizes
- Modification timestamps
- File type breakdown

### Usage Examples

#### Daily Maintenance
```bash
# Check what duplicates exist
node cleanup-files.js dry-run

# Safe cleanup with backup
node cleanup-files.js full
```

#### Emergency Recovery
```bash
# Create immediate backup
node cleanup-files.js backup

# Check current file status
node cleanup-files.js report
```

#### Development Workflow
```bash
# Before major changes
node cleanup-files.js backup

# After testing uploads
node cleanup-files.js cleanup
```

### Integration with Application

#### Server Routes Enhanced
- All file operations use safe wrappers
- Comprehensive error handling
- Automatic logging
- Backup verification before writes

#### Admin Dashboard
- Download operations logged
- Duplicate elimination in exports
- File existence verification
- Error reporting for missing files

### Best Practices

1. **Always run dry-run first** to see what will be affected
2. **Create backups** before any major operations
3. **Monitor logs** for any file operation issues
4. **Regular cleanup** to prevent excessive duplicate accumulation
5. **Check reports** for unusual file growth patterns

### Troubleshooting

#### Common Issues
- **Permission errors**: Check file permissions in `attached_assets/` and `uploads/`
- **Disk space**: Monitor total file sizes in reports
- **Corrupted uploads**: Check logs for failed file operations

#### Recovery Steps
1. Check `file-operations.log` for recent errors
2. Restore from latest backup if needed
3. Run file report to assess current state
4. Use dry-run to plan cleanup strategy

This system ensures robust file management with comprehensive safety measures and detailed audit trails.