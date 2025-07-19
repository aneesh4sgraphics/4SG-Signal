import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'file-operations.log');

export interface FileOperation {
  type: 'READ' | 'WRITE' | 'DELETE' | 'UPLOAD' | 'DOWNLOAD' | 'EXISTS_CHECK';
  file: string;
  success: boolean;
  timestamp: string;
  size?: number;
  error?: string;
  user?: string;
}

export function logFileOperation(operation: Omit<FileOperation, 'timestamp'>) {
  const logEntry: FileOperation = {
    ...operation,
    timestamp: new Date().toISOString()
  };
  
  const logLine = `[${logEntry.timestamp}] ${logEntry.type} ${logEntry.file} - ${logEntry.success ? 'SUCCESS' : 'FAILED'}${logEntry.size ? ` (${logEntry.size} bytes)` : ''}${logEntry.error ? ` - ${logEntry.error}` : ''}\n`;
  
  try {
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (error) {
    console.error('Failed to write to file operations log:', error);
  }
  
  // Also log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`FILE_OP: ${logLine.trim()}`);
  }
}

export function safeFileExists(filePath: string): boolean {
  try {
    const exists = fs.existsSync(filePath);
    logFileOperation({
      type: 'EXISTS_CHECK',
      file: filePath,
      success: true
    });
    return exists;
  } catch (error) {
    logFileOperation({
      type: 'EXISTS_CHECK',
      file: filePath,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

export function safeReadFile(filePath: string, encoding: BufferEncoding = 'utf-8'): string | null {
  try {
    if (!safeFileExists(filePath)) {
      logFileOperation({
        type: 'READ',
        file: filePath,
        success: false,
        error: 'File does not exist'
      });
      return null;
    }
    
    const content = fs.readFileSync(filePath, encoding);
    const stats = fs.statSync(filePath);
    
    logFileOperation({
      type: 'READ',
      file: filePath,
      success: true,
      size: stats.size
    });
    
    return content;
  } catch (error) {
    logFileOperation({
      type: 'READ',
      file: filePath,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

export function safeWriteFile(filePath: string, content: string, encoding: BufferEncoding = 'utf-8'): boolean {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!safeFileExists(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, content, encoding);
    const stats = fs.statSync(filePath);
    
    logFileOperation({
      type: 'WRITE',
      file: filePath,
      success: true,
      size: stats.size
    });
    
    return true;
  } catch (error) {
    logFileOperation({
      type: 'WRITE',
      file: filePath,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

export function safeDeleteFile(filePath: string): boolean {
  try {
    if (!safeFileExists(filePath)) {
      logFileOperation({
        type: 'DELETE',
        file: filePath,
        success: false,
        error: 'File does not exist'
      });
      return false;
    }
    
    fs.unlinkSync(filePath);
    
    logFileOperation({
      type: 'DELETE',
      file: filePath,
      success: true
    });
    
    return true;
  } catch (error) {
    logFileOperation({
      type: 'DELETE',
      file: filePath,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

export function logUpload(originalName: string, savedPath: string, size: number, user?: string): void {
  logFileOperation({
    type: 'UPLOAD',
    file: `${originalName} -> ${savedPath}`,
    success: true,
    size,
    user
  });
}

export function logDownload(filePath: string, user?: string): void {
  try {
    const stats = fs.statSync(filePath);
    logFileOperation({
      type: 'DOWNLOAD',
      file: filePath,
      success: true,
      size: stats.size,
      user
    });
  } catch (error) {
    logFileOperation({
      type: 'DOWNLOAD',
      file: filePath,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      user
    });
  }
}