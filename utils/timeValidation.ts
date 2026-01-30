// 时间验证工具函数

// 验证时间格式
export function validateTimeFormat(timeStr: string): boolean {
  if (!timeStr || timeStr.trim() === '') return true; // 空值视为有效
  
  // 支持的时间格式：
  // 1. yyyy-MM-dd HH:mm:ss
  // 2. yyyy-MM-dd HH:mm
  // 3. yyyy-MM-dd
  // 4. HH:mm:ss
  // 5. HH:mm
  
  const patterns = [
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, // yyyy-MM-dd HH:mm:ss
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, // yyyy-MM-dd HH:mm
    /^\d{4}-\d{2}-\d{2}$/, // yyyy-MM-dd
    /^\d{2}:\d{2}:\d{2}$/, // HH:mm:ss
    /^\d{2}:\d{2}$/ // HH:mm
  ];
  
  return patterns.some(pattern => pattern.test(timeStr.trim()));
}

// 检查 start_time 和 end_time 的合理性
export function validateTimeRange(startTime: string, endTime: string): { valid: boolean; error?: string } {
  if (!startTime || !endTime) {
    return { valid: true }; // 空值视为有效
  }
  
  // 如果 start_time 没有日期，则视为未计划事项
  const startHasDate = /^\d{4}-\d{2}-\d{2}/.test(startTime);
  const endHasDate = /^\d{4}-\d{2}-\d{2}/.test(endTime);
  
  // 如果 start_time 没有日期，则 end_time 也不应该有日期
  if (!startHasDate && endHasDate) {
    return { valid: false, error: '如果开始时间没有日期，结束时间也不应该有日期' };
  }
  
  // 如果 start_time 和 end_time 都有完整的日期时间，需要检查 end_time 是否大于 start_time
  if (startHasDate && endHasDate) {
    const startDateTime = new Date(startTime);
    const endDateTime = new Date(endTime);
    
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      return { valid: false, error: '时间格式无效' };
    }
    
    if (endDateTime <= startDateTime) {
      return { valid: false, error: '结束时间必须大于开始时间' };
    }
  }
  
  return { valid: true };
}

// 从时间字符串中提取日期
export function extractDateFromTime(timeStr: string): string | null {
  if (!timeStr) return null;
  
  const match = timeStr.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

// 从时间字符串中提取时间部分
export function extractTimeFromDateTime(dateTimeStr: string): string | null {
  if (!dateTimeStr) return null;
  
  // 匹配 HH:mm:ss 或 HH:mm 格式
  const match = dateTimeStr.match(/\d{2}:\d{2}(?::\d{2})?$/);
  if (match) {
    const timeStr = match[0];
    // 保持原始格式，不强制转换
    return timeStr;
  }
  return null;
}
