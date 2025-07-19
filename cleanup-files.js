#!/usr/bin/env node

/**
 * File Cleanup and Management Script
 * 
 * This script helps maintain file hygiene by:
 * - Removing duplicate timestamped files
 * - Logging all file operations
 * - Backing up important files before cleanup
 * - Providing safety checks
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ASSETS_DIR = path.join(process.cwd(), 'attached_assets');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const LOG_FILE = path.join(process.cwd(), 'file-operations.log');
const BACKUP_DIR = path.join(process.cwd(), 'backups');

// File patterns for cleanup
const FILE_PATTERNS = {
  duplicates: [
    /^area-pricing-calculations-.*_\d{13}\.csv$/,
    /^customers_export.*_\d{13}\.csv$/,
    /^PricePAL_All_Product_Data.*_\d{13}\.csv$/,
    /^tier_pricing_template.*_\d{13}\.csv$/
  ],
  keepLatest: [
    'area-pricing-calculations',
    'customers_export',
    'PricePAL_All_Product_Data',
    'tier_pricing_template'
  ]
};

// Logging function
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${type}] ${message}\n`;
  
  console.log(`${type}: ${message}`);
  
  try {
    fs.appendFileSync(LOG_FILE, logEntry);
  } catch (error) {
    console.error('Failed to write to log file:', error.message);
  }
}

// Safe file operations
function safeFileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    log(`Error checking file existence: ${filePath} - ${error.message}`, 'ERROR');
    return false;
  }
}

function safeReadDir(dirPath) {
  try {
    if (!safeFileExists(dirPath)) {
      log(`Directory does not exist: ${dirPath}`, 'WARN');
      return [];
    }
    return fs.readdirSync(dirPath);
  } catch (error) {
    log(`Error reading directory: ${dirPath} - ${error.message}`, 'ERROR');
    return [];
  }
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (error) {
    log(`Error getting file stats: ${filePath} - ${error.message}`, 'ERROR');
    return null;
  }
}

function safeDelete(filePath) {
  try {
    if (safeFileExists(filePath)) {
      fs.unlinkSync(filePath);
      log(`Deleted file: ${filePath}`, 'SUCCESS');
      return true;
    }
    return false;
  } catch (error) {
    log(`Error deleting file: ${filePath} - ${error.message}`, 'ERROR');
    return false;
  }
}

function safeCopy(source, destination) {
  try {
    if (!safeFileExists(source)) {
      log(`Source file does not exist: ${source}`, 'ERROR');
      return false;
    }
    
    // Ensure destination directory exists
    const destDir = path.dirname(destination);
    if (!safeFileExists(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    fs.copyFileSync(source, destination);
    log(`Copied file: ${source} → ${destination}`, 'SUCCESS');
    return true;
  } catch (error) {
    log(`Error copying file: ${source} → ${destination} - ${error.message}`, 'ERROR');
    return false;
  }
}

// Create backup of important files
function createBackup() {
  log('Creating backup of important files...', 'INFO');
  
  if (!safeFileExists(BACKUP_DIR)) {
    try {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    } catch (error) {
      log(`Failed to create backup directory: ${error.message}`, 'ERROR');
      return false;
    }
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupSubDir = path.join(BACKUP_DIR, `backup-${timestamp}`);
  
  try {
    fs.mkdirSync(backupSubDir, { recursive: true });
  } catch (error) {
    log(`Failed to create backup subdirectory: ${error.message}`, 'ERROR');
    return false;
  }
  
  // Main files to backup
  const mainFiles = [
    'customers_export.csv',
    'PricePAL_All_Product_Data.csv',
    'tier_pricing_template.csv'
  ];
  
  let backupCount = 0;
  mainFiles.forEach(fileName => {
    const sourcePath = path.join(ASSETS_DIR, fileName);
    const destPath = path.join(backupSubDir, fileName);
    
    if (safeCopy(sourcePath, destPath)) {
      backupCount++;
    }
  });
  
  log(`Backup completed: ${backupCount} files backed up to ${backupSubDir}`, 'SUCCESS');
  return true;
}

// Find and group duplicate files
function findDuplicates() {
  log('Scanning for duplicate files...', 'INFO');
  
  const files = safeReadDir(ASSETS_DIR);
  const duplicateGroups = {};
  
  files.forEach(fileName => {
    const filePath = path.join(ASSETS_DIR, fileName);
    
    // Check if file matches duplicate patterns
    const isDuplicate = FILE_PATTERNS.duplicates.some(pattern => pattern.test(fileName));
    
    if (isDuplicate) {
      // Extract base name without timestamp
      const baseName = fileName.replace(/_\d{13}/, '').replace(/ \(\d+\)/, '');
      
      if (!duplicateGroups[baseName]) {
        duplicateGroups[baseName] = [];
      }
      
      const stats = safeStat(filePath);
      if (stats) {
        duplicateGroups[baseName].push({
          fileName,
          filePath,
          mtime: stats.mtime,
          size: stats.size
        });
      }
    }
  });
  
  // Sort each group by modification time (newest first)
  Object.keys(duplicateGroups).forEach(baseName => {
    duplicateGroups[baseName].sort((a, b) => b.mtime - a.mtime);
  });
  
  return duplicateGroups;
}

// Clean up duplicate files (keep latest)
function cleanupDuplicates(dryRun = false) {
  log(`${dryRun ? 'DRY RUN: ' : ''}Starting duplicate cleanup...`, 'INFO');
  
  const duplicateGroups = findDuplicates();
  let totalDeleted = 0;
  let totalKept = 0;
  
  Object.entries(duplicateGroups).forEach(([baseName, files]) => {
    if (files.length <= 1) {
      log(`No duplicates found for: ${baseName}`, 'INFO');
      return;
    }
    
    log(`Found ${files.length} duplicates for: ${baseName}`, 'INFO');
    
    // Keep the newest file, delete the rest
    const [newest, ...oldFiles] = files;
    
    log(`Keeping newest: ${newest.fileName} (${newest.mtime.toISOString()})`, 'INFO');
    totalKept++;
    
    oldFiles.forEach(file => {
      if (dryRun) {
        log(`Would delete: ${file.fileName} (${file.mtime.toISOString()})`, 'DRY_RUN');
      } else {
        if (safeDelete(file.filePath)) {
          totalDeleted++;
        }
      }
    });
  });
  
  log(`${dryRun ? 'DRY RUN: ' : ''}Cleanup complete - Kept: ${totalKept}, ${dryRun ? 'Would delete' : 'Deleted'}: ${totalDeleted}`, 'SUCCESS');
  return { kept: totalKept, deleted: totalDeleted };
}

// Clean up temporary upload files
function cleanupUploads() {
  log('Cleaning up temporary upload files...', 'INFO');
  
  const files = safeReadDir(UPLOADS_DIR);
  let deletedCount = 0;
  
  files.forEach(fileName => {
    const filePath = path.join(UPLOADS_DIR, fileName);
    const stats = safeStat(filePath);
    
    if (stats) {
      // Delete files older than 1 hour
      const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
      
      if (ageHours > 1) {
        if (safeDelete(filePath)) {
          deletedCount++;
        }
      }
    }
  });
  
  log(`Cleaned up ${deletedCount} temporary upload files`, 'SUCCESS');
  return deletedCount;
}

// Generate file report
function generateReport() {
  log('Generating file report...', 'INFO');
  
  const report = {
    timestamp: new Date().toISOString(),
    directories: {},
    totalFiles: 0,
    totalSize: 0
  };
  
  [ASSETS_DIR, UPLOADS_DIR].forEach(dirPath => {
    const dirName = path.basename(dirPath);
    const files = safeReadDir(dirPath);
    
    report.directories[dirName] = {
      path: dirPath,
      fileCount: files.length,
      files: []
    };
    
    let dirSize = 0;
    
    files.forEach(fileName => {
      const filePath = path.join(dirPath, fileName);
      const stats = safeStat(filePath);
      
      if (stats) {
        const fileInfo = {
          name: fileName,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          type: path.extname(fileName)
        };
        
        report.directories[dirName].files.push(fileInfo);
        dirSize += stats.size;
        report.totalSize += stats.size;
      }
    });
    
    report.directories[dirName].totalSize = dirSize;
    report.totalFiles += files.length;
  });
  
  // Write report to file
  const reportPath = path.join(process.cwd(), 'file-report.json');
  try {
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log(`File report generated: ${reportPath}`, 'SUCCESS');
  } catch (error) {
    log(`Failed to write report: ${error.message}`, 'ERROR');
  }
  
  return report;
}

// Main execution
function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  
  log(`Starting file cleanup script - Command: ${command}`, 'INFO');
  
  switch (command) {
    case 'backup':
      createBackup();
      break;
      
    case 'cleanup':
      createBackup();
      cleanupDuplicates(false);
      cleanupUploads();
      break;
      
    case 'dry-run':
      cleanupDuplicates(true);
      break;
      
    case 'report':
      generateReport();
      break;
      
    case 'full':
      createBackup();
      cleanupDuplicates(false);
      cleanupUploads();
      generateReport();
      break;
      
    default:
      console.log(`
File Cleanup Script - Usage:

  node cleanup-files.js <command>

Commands:
  backup    Create backup of important files
  cleanup   Remove duplicates and old uploads (with backup)
  dry-run   Show what would be deleted without actually deleting
  report    Generate file usage report
  full      Complete cleanup with backup and report
  help      Show this help message

Examples:
  node cleanup-files.js dry-run
  node cleanup-files.js cleanup
  node cleanup-files.js full
      `);
      break;
  }
}

// Run if called directly
if (process.argv[1] === __filename) {
  main();
}

export {
  log,
  safeFileExists,
  safeReadDir,
  safeStat,
  safeDelete,
  safeCopy,
  createBackup,
  findDuplicates,
  cleanupDuplicates,
  cleanupUploads,
  generateReport
};